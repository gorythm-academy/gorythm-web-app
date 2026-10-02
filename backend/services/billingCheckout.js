const crypto = require('crypto');
const mongoose = require('mongoose');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Payment = require('../models/Payment');
const User = require('../models/User');
const ParentStudentLink = require('../models/ParentStudentLink');
const BillingCheckoutIntent = require('../models/BillingCheckoutIntent');
const { activeCourseFilter, isCourseTrashed } = require('../utils/courseQuery');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');
const { activePaymentFilter } = require('../utils/paymentQuery');
const { activeUserFilter, isUserTrashed } = require('../utils/userQuery');
const { getDuplicateCoursePaymentBlock } = require('./enrollmentDuplicateCheck');
const {
    displayEnrollmentFeeStatus,
    displayPaymentStatus,
    isClosedFeeStatus,
    parseInvoiceMode,
    statusLabel,
} = require('../utils/billingStatus');
const { defaultFeeDueDate, maxPayableMonths, parseInstallmentMonths } = require('../utils/feeDueDate');
const { nextInvoiceNumbers } = require('../utils/invoiceNumber');
const { onPaymentPaid } = require('./onPaymentPaid');

const MIN_STRIPE_CENTS = 50;

function newBillingGroupId() {
    return `bill_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
}

function toMoney(value) {
    const amount = Number(value);
    if (Number.isNaN(amount) || amount <= 0) return 0;
    return Math.round(amount * 100) / 100;
}

function httpError(message, status = 400, extra = {}) {
    const err = new Error(message);
    err.status = status;
    Object.assign(err, extra);
    return err;
}

function courseNameForItems(items) {
    if (!items.length) return '';
    if (items.length === 1) return items[0].courseName;
    return `${items[0].courseName} + ${items.length - 1} more`;
}

function studentNameForItems(items) {
    if (!items.length) return '';
    const unique = [...new Set(items.map((item) => String(item.studentName || '').trim()).filter(Boolean))];
    if (unique.length <= 1) return unique[0] || items[0].studentName || '';
    return `${unique[0]} + ${unique.length - 1} more`;
}

function toPaymentLine(item) {
    return {
        student: item.studentId || null,
        course: item.courseId,
        enrollment: item.enrollmentId || null,
        studentName: item.studentName || '',
        studentEmail: item.studentEmail || '',
        courseName: item.courseName || '',
        amount: item.amount,
        dueDate: item.dueDate || null,
        installmentMonths: Math.max(1, Math.floor(Number(item.months || item.installmentMonths || 1))),
    };
}

function buildPaymentDocsFromResolved({ items, invoiceMode, sharedFields }) {
    const mode = parseInvoiceMode(invoiceMode);
    if (!items?.length) return [];
    if (mode === 'separate') {
        return items.map((item) => ({
            ...sharedFields,
            amount: item.amount,
            course: item.courseId,
            courseName: item.courseName,
            user: item.studentId || sharedFields.user || undefined,
            studentName: item.studentName || sharedFields.studentName,
            email: item.studentEmail || sharedFields.email,
            dueDate: item.dueDate || sharedFields.dueDate || null,
            lines: [toPaymentLine(item)],
            invoiceMode: 'separate',
            installmentMonths: Math.max(1, Math.floor(Number(item.months || item.installmentMonths || 1))),
        }));
    }
    return [
        {
            ...sharedFields,
            amount: items.reduce((sum, item) => sum + Number(item.amount || 0), 0),
            course: items[0].courseId,
            courseName: courseNameForItems(items),
            user: items[0].studentId || sharedFields.user || undefined,
            studentName: studentNameForItems(items) || sharedFields.studentName,
            email: sharedFields.email || items[0].studentEmail,
            dueDate: items.map((item) => item.dueDate).filter(Boolean).sort((a, b) => new Date(a) - new Date(b))[0] ||
                sharedFields.dueDate ||
                null,
            lines: items.map(toPaymentLine),
            invoiceMode: 'combined',
            installmentMonths: Math.max(
                1,
                ...items.map((item) => Math.floor(Number(item.months || item.installmentMonths || 1)))
            ),
        },
    ];
}

async function loadPublishedCourse(courseId) {
    if (!courseId || !mongoose.Types.ObjectId.isValid(String(courseId))) {
        throw httpError('A valid course is required');
    }
    const course = await Course.findOne({
        _id: courseId,
        isPublished: true,
        ...activeCourseFilter(),
    }).select('_id title price description');
    if (!course) throw httpError('Course not found or is not available for enrollment', 404);
    const amount = toMoney(course.price);
    if (amount <= 0) throw httpError('This course has no payable amount. Contact us to enroll.');
    return { course, amount };
}

async function assertItemNotBlocked({ email, courseId, courseName, studentId, enrollmentId }) {
    if (email && !enrollmentId) {
        const duplicateBlock = await getDuplicateCoursePaymentBlock(email, { courseId, courseName });
        if (duplicateBlock.blocked) {
            throw httpError(duplicateBlock.error, 400, { code: duplicateBlock.code });
        }
    }

    if (studentId && courseId) {
        const paidEnrollment = await Enrollment.findOne({
            student: studentId,
            course: courseId,
            paymentStatus: 'paid',
            ...activeEnrollmentFilter(),
        }).select('_id');
        if (paidEnrollment && String(paidEnrollment._id) !== String(enrollmentId || '')) {
            throw httpError(
                `You already paid for ${courseName || 'this course'}. Unselect that course and try again.`
            );
        }
    }

    const existingAwaiting = await Payment.findOne({
        ...activePaymentFilter(),
        paymentMethod: 'bank',
        status: 'awaiting_review',
        $and: [
            {
                $or: [
                    { course: courseId },
                    { 'lines.course': courseId },
                ],
            },
            {
                $or: [
                    studentId ? { user: studentId } : null,
                    studentId ? { 'lines.student': studentId } : null,
                    email ? { email: String(email).toLowerCase() } : null,
                    email ? { 'lines.studentEmail': String(email).toLowerCase() } : null,
                ].filter(Boolean),
            },
        ],
    }).select('_id');
    if (existingAwaiting) {
        throw httpError(
            'A bank transfer for this course is already awaiting review. Contact the academy if you need help.'
        );
    }
}

async function resolveCheckoutItems({ rawItems = [], courseIds = [], actor = null }) {
    const seen = new Set();
    const resolved = [];

    const pushUnique = (item) => {
        const key = `${item.studentId || 'guest'}:${item.courseId}`;
        if (seen.has(key)) return;
        seen.add(key);
        resolved.push(item);
    };

    for (const raw of rawItems) {
        const enrollmentId = raw?.enrollmentId || raw?.enrollment;
        if (enrollmentId) {
            if (!mongoose.Types.ObjectId.isValid(String(enrollmentId))) {
                throw httpError('Each selected fee must be a valid enrollment');
            }
            const enrollment = await Enrollment.findOne({
                _id: enrollmentId,
                ...activeEnrollmentFilter(),
            })
                .populate('course', 'title price isPublished deletedAt')
                .populate('student', 'name email personalEmail role deletedAt');
            if (!enrollment || !enrollment.course || isCourseTrashed(enrollment.course)) {
                throw httpError('One of the selected enrollments is no longer available');
            }
            if (String(enrollment.paymentStatus || '') === 'refunded') {
                throw httpError(`${enrollment.course.title} is not unpaid, so it cannot be added to this checkout`);
            }
            const { assertCheckoutAllowed } = require('./feeDuePolicy');
            await assertCheckoutAllowed(enrollment);
            const amount = toMoney(enrollment.course.price);
            if (amount <= 0) throw httpError(`${enrollment.course.title} has no payable amount`);
            const student = enrollment.student;
            if (!student || isUserTrashed(student) || student.role !== 'student') {
                throw httpError('One of the selected students is no longer available');
            }
            const studentEmail = String(student.personalEmail || student.email || '').trim().toLowerCase();
            await assertItemNotBlocked({
                email: studentEmail,
                courseId: enrollment.course._id,
                courseName: enrollment.course.title,
                studentId: student._id,
                enrollmentId: enrollment._id,
            });
            pushUnique({
                enrollmentId: enrollment._id,
                studentId: student._id,
                studentName: student.name || 'Student',
                studentEmail,
                courseId: enrollment.course._id,
                courseName: enrollment.course.title,
                courseDescription: '',
                amount,
                monthlyAmount: amount,
                maxMonths: maxPayableMonths({
                    ...enrollment.toObject?.() || enrollment,
                    course: enrollment.course,
                }),
                dueDate: enrollment.feeDueDate || defaultFeeDueDate(enrollment.enrollmentDate || enrollment.createdAt),
            });
            continue;
        }

        const courseId = raw?.courseId || raw?.course;
        if (!courseId) continue;
        const { course, amount } = await loadPublishedCourse(courseId);
        const studentId = raw?.studentId || raw?.student || actor?.studentId || null;
        let student = null;
        if (studentId) {
            student = await User.findOne({ _id: studentId, role: 'student', ...activeUserFilter() }).select(
                'name email personalEmail'
            );
            if (!student) throw httpError('Student not found for one of the selected courses', 404);
        }
        const studentEmail = String(
            raw?.studentEmail || student?.personalEmail || student?.email || actor?.email || ''
        )
            .trim()
            .toLowerCase();
        await assertItemNotBlocked({
            email: studentEmail,
            courseId: course._id,
            courseName: course.title,
            studentId: student?._id,
        });
        pushUnique({
            enrollmentId: null,
            studentId: student?._id || null,
            studentName: student?.name || actor?.name || '',
            studentEmail,
            courseId: course._id,
            courseName: course.title,
            courseDescription: course.description || '',
            amount,
            dueDate: defaultFeeDueDate(),
        });
    }

    for (const courseId of courseIds) {
        const { course, amount } = await loadPublishedCourse(courseId);
        const studentEmail = String(actor?.email || '').trim().toLowerCase();
        await assertItemNotBlocked({
            email: studentEmail,
            courseId: course._id,
            courseName: course.title,
            studentId: actor?.studentId || null,
        });
        pushUnique({
            enrollmentId: null,
            studentId: actor?.studentId || null,
            studentName: actor?.name || '',
            studentEmail,
            courseId: course._id,
            courseName: course.title,
            courseDescription: course.description || '',
            amount,
            dueDate: defaultFeeDueDate(),
        });
    }

    if (!resolved.length) throw httpError('Select at least one course or unpaid fee to pay');
    return resolved;
}

function withSharedInstallmentMonths(items, requestedMonths) {
    if (!items?.length) return [];
    const maxShared = Math.min(...items.map((item) => {
        const max = Number(item.maxMonths);
        return Number.isFinite(max) ? max : 1;
    }));
    const months = parseInstallmentMonths(requestedMonths, maxShared);
    if (months < 1) {
        throw httpError('Select at least one month to pay');
    }
    return items.map((item) => {
        const monthly = toMoney(item.monthlyAmount ?? item.amount);
        const n = parseInstallmentMonths(months, item.maxMonths ?? months) || months;
        return {
            ...item,
            monthlyAmount: monthly,
            months: n,
            installmentMonths: n,
            amount: toMoney(monthly * n),
            courseName: n > 1 ? `${String(item.courseName || 'Course').replace(/\s*\(\d+ months\)$/, '')} (${n} months)` : item.courseName,
        };
    });
}

function stripeLineItemsFromResolved(items) {
    return items.map((item) => {
        const months = Math.max(1, Math.floor(Number(item.months || item.installmentMonths || 1)));
        const monthly = Number(item.monthlyAmount != null ? item.monthlyAmount : Number(item.amount || 0) / months);
        return {
            price_data: {
                currency: 'usd',
                product_data: {
                    name: item.studentName ? `${item.courseName} — ${item.studentName}` : item.courseName,
                    description: String(item.courseDescription || item.studentName || item.courseName).slice(0, 500),
                },
                unit_amount: Math.round(Number(monthly) * 100),
            },
            quantity: months,
        };
    });
}

function stripeChargeableItems(items) {
    return (items || []).filter((item) => Math.round(Number(item.amount) * 100) >= MIN_STRIPE_CENTS);
}

function assertStripeMinimum(items) {
    const chargeable = stripeChargeableItems(items);
    if (!chargeable.length) {
        throw httpError('This course has no card payment due. Please use bank transfer or contact the academy.');
    }
    const cents = chargeable.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0);
    if (cents < MIN_STRIPE_CENTS) {
        throw httpError('Amount is below the minimum charge allowed by Stripe.');
    }
    return cents;
}

async function createBillingIntent({ items, invoiceMode, payer = {}, stripeSessionId = '', autoPayEnable = false }) {
    const groupId = newBillingGroupId();
    const intent = await BillingCheckoutIntent.create({
        groupId,
        invoiceMode: parseInvoiceMode(invoiceMode),
        payerUser: payer.userId || null,
        payerRole: payer.role || 'guest',
        payerEmail: String(payer.email || '').trim().toLowerCase(),
        payerName: payer.name || '',
        stripeSessionId,
        autoPayEnable: Boolean(autoPayEnable),
        items: items.map((item) => ({
            student: item.studentId || null,
            course: item.courseId,
            enrollment: item.enrollmentId || null,
            studentName: item.studentName || '',
            studentEmail: item.studentEmail || '',
            courseName: item.courseName || '',
            amount: item.amount,
            dueDate: item.dueDate || null,
            installmentMonths: Math.max(1, Math.floor(Number(item.months || item.installmentMonths || 1))),
        })),
        status: 'open',
    });
    return intent;
}

async function savePaymentsFromIntent(intent, extraFields = {}) {
    const items = (intent.items || []).map((item) => ({
        enrollmentId: item.enrollment,
        studentId: item.student,
        studentName: item.studentName,
        studentEmail: item.studentEmail,
        courseId: item.course,
        courseName: item.courseName,
        amount: item.amount,
        dueDate: item.dueDate,
        months: item.installmentMonths || 1,
        installmentMonths: item.installmentMonths || 1,
    }));
    const docs = buildPaymentDocsFromResolved({
        items,
        invoiceMode: intent.invoiceMode,
        sharedFields: {
            groupId: intent.groupId,
            payerUser: intent.payerUser || extraFields.payerUser || null,
            payerRole: intent.payerRole || extraFields.payerRole || 'guest',
            currency: extraFields.currency || 'USD',
            presentmentCurrency: extraFields.presentmentCurrency || '',
            presentmentAmount: extraFields.presentmentAmount ?? null,
            status: extraFields.status || 'paid',
            paymentMethod: extraFields.paymentMethod || 'stripe',
            transactionId: extraFields.transactionId,
            stripePaymentIntentId: extraFields.stripePaymentIntentId,
            proofUrl: extraFields.proofUrl || '',
            proofSubmittedAt: extraFields.proofSubmittedAt || undefined,
            phone: extraFields.phone,
            email: extraFields.email || intent.payerEmail,
            studentName: extraFields.studentName || intent.payerName || studentNameForItems(items),
            receiptIssuedAt: extraFields.status === 'paid' || extraFields.status === 'completed' ? new Date() : null,
        },
    });
    const invoiceNumbers = extraFields.invoiceNumber
        ? [extraFields.invoiceNumber]
        : await nextInvoiceNumbers(docs.length);
    docs.forEach((doc, index) => {
        if (!doc.invoiceNumber) {
            doc.invoiceNumber = invoiceNumbers[index] || invoiceNumbers[0];
        }
        if (extraFields.presentmentCurrency) doc.presentmentCurrency = extraFields.presentmentCurrency;
        if (extraFields.presentmentAmount != null) doc.presentmentAmount = extraFields.presentmentAmount;
        if (extraFields.cardBrand) doc.cardBrand = extraFields.cardBrand;
        if (extraFields.cardLast4) doc.cardLast4 = extraFields.cardLast4;
    });
    const created = await Payment.insertMany(docs);
    return created;
}

async function fulfillLinesForPayment(payment, options = {}) {
    const lines = Array.isArray(payment.lines) && payment.lines.length
        ? payment.lines
        : [
              {
                  student: payment.user,
                  course: payment.course,
                  studentName: payment.studentName,
                  studentEmail: payment.email,
                  courseName: payment.courseName,
                  amount: payment.amount,
              },
          ];

    const snapshot = {
        user: payment.user,
        course: payment.course,
        email: payment.email,
        studentName: payment.studentName,
        courseName: payment.courseName,
    };
    const enrollments = [];
    const issues = [];
    try {
        for (const line of lines) {
            payment.user = line.student || snapshot.user;
            payment.course = line.course || snapshot.course;
            payment.email = line.studentEmail || snapshot.email;
            payment.studentName = line.studentName || snapshot.studentName;
            payment.courseName = line.courseName || snapshot.courseName;
            try {
                const enrollment = await onPaymentPaid(payment, options);
                if (payment.user) {
                    snapshot.user = snapshot.user || payment.user;
                    line.student = line.student || payment.user;
                    if (enrollment?._id && !line.enrollment) line.enrollment = enrollment._id;
                }
                if (enrollment) enrollments.push(enrollment);
                else issues.push(`Enrollment was not created for ${line.courseName || 'a course'}`);
            } catch (error) {
                issues.push(error.message || `Enrollment failed for ${line.courseName || 'a course'}`);
            }
        }
    } finally {
        payment.user = snapshot.user;
        payment.course = snapshot.course;
        payment.email = snapshot.email;
        payment.studentName = snapshot.studentName;
        payment.courseName = snapshot.courseName;
        if (typeof payment.save === 'function') {
            await payment.save();
        }
    }
    return { enrollments, issues };
}

async function fulfillBillingIntent(intent, sessionExtras = {}) {
    if (!intent) return { payments: [], enrolled: false, fulfillmentIssue: null };

    const already = await Payment.find({ groupId: intent.groupId, ...activePaymentFilter() });
    if (already.length) {
        intent.status = 'consumed';
        intent.consumedAt = intent.consumedAt || new Date();
        await intent.save();
        return {
            payments: already,
            enrolled: already.every((row) => !row.failureReason),
            fulfillmentIssue: already.find((row) => row.failureReason)?.failureReason ? 'enrollment_failed' : null,
            payment: already[0],
        };
    }

    const created = await savePaymentsFromIntent(intent, sessionExtras);
    intent.status = 'consumed';
    intent.consumedAt = new Date();
    if (sessionExtras.transactionId) intent.stripeSessionId = sessionExtras.transactionId;
    await intent.save();

    const issues = [];
    for (const payment of created) {
        const result = await fulfillLinesForPayment(payment);
        if (result.issues.length) {
            payment.failureReason = result.issues.join(' ');
            await payment.save();
            issues.push(...result.issues);
        }
    }

    return {
        payments: created,
        payment: created[0] || null,
        enrolled: created.length > 0 && issues.length === 0,
        fulfillmentIssue: issues.length ? 'enrollment_failed' : null,
        message: issues[0] || null,
    };
}

function serializeBillingPayment(payment) {
    const displayStatus = displayPaymentStatus(payment);
    return {
        ...(payment.toObject ? payment.toObject() : payment),
        displayStatus,
        statusLabel: statusLabel(displayStatus),
    };
}

function paymentCoversEnrollment(payment, enrollment) {
    const studentId = String(enrollment.student?._id || enrollment.student || '');
    const courseId = String(enrollment.course?._id || enrollment.course || '');
    const enrollmentId = String(enrollment._id || '');
    if ((payment.lines || []).some((line) => {
        const lineEnrollment = String(line.enrollment || '');
        const lineStudent = String(line.student || payment.user || '');
        const lineCourse = String(line.course || payment.course || '');
        if (lineEnrollment && lineEnrollment === enrollmentId) return true;
        return lineStudent === studentId && lineCourse === courseId;
    })) {
        return true;
    }
    return String(payment.user || '') === studentId && String(payment.course || '') === courseId;
}

const OPEN_PAYABLE_STATUSES = ['unpaid', 'overdue', 'failed', 'awaiting_review'];

async function loadEnrollmentFeeRowsForStudents(studentIds) {
    if (!studentIds?.length) return [];
    const enrollments = await Enrollment.find({
        student: { $in: studentIds },
        course: { $ne: null },
        ...activeEnrollmentFilter(),
    })
        .populate('course', 'title price category deletedAt isPublished')
        .populate('student', 'name email personalEmail deletedAt')
        .sort({ createdAt: -1 })
        .lean();

    const awaitingPayments = await Payment.find({
        ...activePaymentFilter(),
        status: { $in: ['awaiting_review', 'processing'] },
        $or: [{ user: { $in: studentIds } }, { 'lines.student': { $in: studentIds } }],
    })
        .select('user course lines status')
        .lean();

    return enrollments
        .filter((row) => row.course && !isCourseTrashed(row.course) && row.student && !isUserTrashed(row.student))
        .map((row) => {
            const awaiting = awaitingPayments.find((payment) => paymentCoversEnrollment(payment, row));
            const displayStatus = awaiting ? 'awaiting_review' : displayEnrollmentFeeStatus(row);
            const amount = toMoney(row.course?.price);
            const selectable = ['unpaid', 'overdue', 'failed'].includes(displayStatus);
            return {
                enrollmentId: row._id,
                studentId: row.student._id,
                studentName: row.student.name,
                studentEmail: row.student.personalEmail || row.student.email,
                courseId: row.course._id,
                courseName: row.course.title,
                courseCategory: row.course.category || '',
                amount,
                dueDate: row.feeDueDate || row.course?.feeDueDate || defaultFeeDueDate(),
                paymentStatus: row.paymentStatus,
                displayStatus,
                displayFeeStatus: displayStatus,
                statusLabel: statusLabel(displayStatus),
                selectable,
                enrollmentStatus: row.status,
            };
        });
}

async function loadPayableEnrollmentsForStudents(studentIds) {
    const rows = await loadEnrollmentFeeRowsForStudents(studentIds);
    return rows.filter((row) => OPEN_PAYABLE_STATUSES.includes(row.displayStatus));
}

async function loadLinkedChildren(parentId) {
    const links = await ParentStudentLink.find({ parent: parentId }).populate(
        'student',
        'name email personalEmail studentId deletedAt'
    );
    return links
        .filter((link) => link.student && !isUserTrashed(link.student))
        .map((link) => link.student);
}

async function parentOwnsPayment(parentId, payment) {
    const children = await loadLinkedChildren(parentId);
    const childIds = new Set(children.map((child) => String(child._id)));
    if (payment.payerUser && String(payment.payerUser._id || payment.payerUser) === String(parentId)) return true;
    if (payment.user && childIds.has(String(payment.user._id || payment.user))) return true;
    if ((payment.lines || []).some((line) => childIds.has(String(line.student?._id || line.student)))) return true;
    const parentEmail = String(payment.email || '').trim().toLowerCase();
    if (parentEmail) {
        const parent = await User.findOne({ _id: parentId, role: 'parent', ...activeUserFilter() }).select('email personalEmail');
        const emails = [parent?.email, parent?.personalEmail].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
        if (emails.includes(parentEmail)) return true;
    }
    return false;
}

function studentOwnsPayment(studentId, payment, studentEmail) {
    const id = String(studentId);
    if (payment.user && String(payment.user._id || payment.user) === id) return true;
    if (payment.payerUser && String(payment.payerUser._id || payment.payerUser) === id) return true;
    if ((payment.lines || []).some((line) => String(line.student?._id || line.student) === id)) return true;
    const email = String(studentEmail || '').trim().toLowerCase();
    if (email && String(payment.email || '').toLowerCase() === email) return true;
    if (email && (payment.lines || []).some((line) => String(line.studentEmail || '').toLowerCase() === email)) return true;
    return false;
}

module.exports = {
    newBillingGroupId,
    toMoney,
    httpError,
    buildPaymentDocsFromResolved,
    resolveCheckoutItems,
    stripeLineItemsFromResolved,
    stripeChargeableItems,
    assertStripeMinimum,
    createBillingIntent,
    savePaymentsFromIntent,
    fulfillLinesForPayment,
    fulfillBillingIntent,
    serializeBillingPayment,
    loadEnrollmentFeeRowsForStudents,
    loadPayableEnrollmentsForStudents,
    loadLinkedChildren,
    parentOwnsPayment,
    studentOwnsPayment,
    paymentCoversEnrollment,
    withSharedInstallmentMonths,
    courseNameForItems,
};
