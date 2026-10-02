const express = require('express');
const { deleteProofFile } = require('../services/trashCleanup');
const mongoose = require('mongoose');
const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY
    ? require('stripe')(process.env.STRIPE_SECRET_KEY)
    : null;
const Payment = require('../models/Payment');
const Course = require('../models/Course');
const User = require('../models/User');
const { syncEnrollmentFromPayment } = require('../services/enrollmentPaymentSync');
const { isPaidStatus } = require('../services/onPaymentPaid');
const { getDuplicateCoursePaymentBlock } = require('../services/enrollmentDuplicateCheck');
const { getOrCreateSettings } = require('../services/settingsService');
const authMiddleware = require('../middleware/auth');
const { validateSessionUser } = require('../middleware/validateSessionUser');
const { allowPermission } = require('../middleware/authorize');
const logger = require('../utils/logger');
const { validate, rules } = require('../middleware/validate');
const { paymentRegisterRateLimiter } = require('../middleware/publicWriteRateLimit');
const {
    fulfillStripeCheckoutSession,
    fulfillmentMessage,
} = require('../services/stripeCheckoutFulfillment');
const { serializePayment, serializePayments } = require('../utils/serializePayment');
const { ensureProofDir, proofPublicPath, PROOF_DIR } = require('../utils/paymentProofStorage');
const { resolveStoredFilename } = require('../utils/safeFilename');
const { activePaymentFilter, trashedPaymentFilter, activePaymentListFilter, overduePaymentFilter } = require('../utils/paymentQuery');
const { activeCourseFilter } = require('../utils/courseQuery');
const {
    resolveCheckoutItems,
    stripeLineItemsFromResolved,
    stripeChargeableItems,
    assertStripeMinimum,
    createBillingIntent,
    savePaymentsFromIntent,
} = require('../services/billingCheckout');
const {
    markPaymentPaidAndFulfill,
    extendPaymentDueDate,
    cancelPaymentRecord,
    extendEnrollmentDueDate,
    markEnrollmentReceived,
    cancelEnrollmentFee,
    listOutstandingFees,
    paymentsInGroup,
} = require('../services/billingAdmin');
const { parseInvoiceMode } = require('../utils/billingStatus');
const { defaultFeeDueDate } = require('../utils/feeDueDate');
const { createCheckoutSessionWithFallback: createStripeCheckoutSession } = require('../utils/stripeMoney');
const { nextInvoiceNumber, ensureInvoiceNumber } = require('../utils/invoiceNumber');

let multer;
try {
    multer = require('multer');
} catch {
    multer = null;
}

ensureProofDir();

const proofStorage = multer
    ? multer.diskStorage({
          destination: (_req, _file, cb) => {
              ensureProofDir();
              cb(null, PROOF_DIR);
          },
          filename: (_req, file, cb) => {
              try {
                  const name = resolveStoredFilename({
                      destDir: PROOF_DIR,
                      originalName: file.originalname,
                      publicPathFor: proofPublicPath,
                  });
                  cb(null, name);
              } catch (err) {
                  cb(err);
              }
          },
      })
    : null;

const proofUpload = proofStorage
    ? multer({
          storage: proofStorage,
          limits: { fileSize: 1024 * 1024 },
          fileFilter: (_req, file, cb) => {
              const allowed = new Set([
                  'image/jpeg',
                  'image/png',
                  'image/webp',
                  'application/pdf',
              ]);
              if (allowed.has(file.mimetype)) return cb(null, true);
              cb(new Error('Use JPG, PNG, WebP, or PDF for payment proof.'));
          },
      })
    : null;

const requireStripe = (res) => {
    if (stripe) return true;
    res.status(503).json({
        success: false,
        error: 'Card payment is not available yet. Please use bank transfer or contact the academy.',
    });
    return false;
};

const frontendBase = () =>
    (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

/** Checkout payment method types; Apple Pay / Google Pay use `card` when enabled in Stripe Dashboard. Default `card` only — `link` often errors if not enabled for the account. */
const checkoutPaymentMethodTypes = () => {
    const raw = process.env.STRIPE_CHECKOUT_PAYMENT_METHOD_TYPES;
    if (raw && String(raw).trim()) {
        const list = String(raw)
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
        if (list.length) return list;
    }
    return ['card'];
};

const createCheckoutSessionWithFallback = async (baseParams, types) => {
    return createStripeCheckoutSession(stripe, baseParams, types);
};

const bankDetailsFromPaymentSettings = (p = {}) => ({
    accountName: p.bankAccountName || '',
    bankName: p.bankName || '',
    accountNumber: p.bankAccountNumber || '',
    iban: p.bankIban || '',
    swift: p.bankSwift || '',
    extraNote: p.bankExtraNote || '',
    currency: p.currency || 'USD',
});

const BANK_DETAIL_FIELDS = [
    'bankAccountName',
    'bankName',
    'bankAccountNumber',
    'bankIban',
    'bankSwift',
    'bankExtraNote',
];

const canManagePaymentConfig = (role) =>
    ['accountant', 'manager', 'super-admin'].includes(role);

// --- Public: single course for checkout (published, not trashed) ---
router.get('/course/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, error: 'Invalid course id' });
        }

        const course = await Course.findOne({
            _id: id,
            isPublished: true,
            ...activeCourseFilter(),
        }).select('_id title price slug');

        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'This course is not open for enrollment.',
            });
        }

        const coursePrice = Number(course.price);
        if (Number.isNaN(coursePrice) || coursePrice <= 0) {
            return res.status(404).json({
                success: false,
                error: 'This course is not open for enrollment.',
            });
        }

        res.json({ success: true, course });
    } catch (error) {
        req.log?.error('Payment course lookup failed', { err: error });
        res.status(500).json({ success: false, error: 'Failed to load course' });
    }
});

// --- Public: bank details (saved from Admin → Payments page) ---
router.get('/bank-details', async (_req, res) => {
    try {
        const settings = await getOrCreateSettings();
        res.json({
            success: true,
            bankDetails: bankDetailsFromPaymentSettings(settings.payment),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load bank details' });
    }
});

// --- Public: bank transfer — single submit with proof (no DB row until proof is saved) ---
router.post('/register-bank', paymentRegisterRateLimiter, (req, res) => {
    if (!proofUpload) {
        return res.status(503).json({ success: false, error: 'File upload is not available on the server.' });
    }
    proofUpload.single('file')(req, res, async (err) => {
        if (err) {
            const tooLarge = err.code === 'LIMIT_FILE_SIZE';
            return res.status(400).json({
                success: false,
                error: tooLarge
                    ? 'Payment proof must be 1 MB or smaller. Use a smaller screenshot or compress your PDF.'
                    : err.message || 'Upload failed',
            });
        }

        let savedProofPath = null;
        try {
            const studentName = String(req.body?.studentName || '').trim();
            const email = String(req.body?.email || '').trim().toLowerCase();
            const courseIdRaw = String(req.body?.courseId || '').trim();
            const bankDigits = String(req.body?.phone || '').replace(/\D/g, '');

            if (!studentName || !email) {
                return res.status(400).json({
                    success: false,
                    error: 'studentName and email are required',
                });
            }
            if (!courseIdRaw || !mongoose.Types.ObjectId.isValid(courseIdRaw)) {
                return res.status(400).json({
                    success: false,
                    error: 'courseId is required',
                });
            }
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'Payment proof screenshot or PDF is required',
                });
            }
            if (bankDigits.length < 8 || bankDigits.length > 15) {
                return res.status(400).json({
                    success: false,
                    error: 'Enter a valid phone number with 8 to 15 digits',
                });
            }

            const { assertPersonalRegistrationEmail } = require('../services/registrationEmailGuard');
            const emailGuard = await assertPersonalRegistrationEmail(email);
            if (!emailGuard.ok) {
                return res.status(400).json({
                    success: false,
                    code: emailGuard.code,
                    error: emailGuard.error,
                });
            }

            const course = await Course.findOne({
                _id: courseIdRaw,
                isPublished: true,
                ...activeCourseFilter(),
            }).select('_id title price');

            if (!course) {
                return res.status(400).json({
                    success: false,
                    error: 'Course not found or is not available for registration',
                });
            }

            const coursePrice = Number(course.price);
            if (Number.isNaN(coursePrice) || coursePrice <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'This course has no payable amount. Contact us to enroll.',
                });
            }

            savedProofPath = proofPublicPath(req.file.filename);
            const extraCourseIds = collectPublicCourseIds(req.body).filter((id) => String(id) !== String(course._id));
            if (extraCourseIds.length) {
                const resolvedItems = await resolveCheckoutItems({
                    rawItems: [{ courseId: course._id }, ...extraCourseIds.map((courseId) => ({ courseId }))],
                    actor: { name: studentName, email },
                });
                const intent = await createBillingIntent({
                    items: resolvedItems,
                    invoiceMode: parseInvoiceMode(req.body?.invoiceMode),
                    payer: { role: 'guest', email, name: studentName },
                });
                const payments = await savePaymentsFromIntent(intent, {
                    status: 'awaiting_review',
                    paymentMethod: 'bank',
                    transactionId: `bank_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
                    proofUrl: savedProofPath,
                    proofSubmittedAt: new Date(),
                    phone: bankDigits,
                    email,
                    studentName,
                    currency: 'USD',
                });
                intent.status = 'consumed';
                intent.consumedAt = new Date();
                await intent.save();
                savedProofPath = null;
                return res.status(201).json({
                    success: true,
                    message:
                        'Payment proof received. Our accountant will verify your transfer and confirm enrollment.',
                    payment: {
                        _id: payments[0]._id,
                        transactionId: payments[0].transactionId,
                        amount: payments.reduce((sum, row) => sum + Number(row.amount || 0), 0),
                        currency: payments[0].currency,
                        status: payments[0].status,
                    },
                    createdCount: payments.length,
                });
            }

            const duplicateBlock = await getDuplicateCoursePaymentBlock(email, {
                courseId: course._id,
                courseName: course.title,
            });
            if (duplicateBlock.blocked) {
                return res.status(400).json({
                    success: false,
                    code: duplicateBlock.code,
                    error: duplicateBlock.error,
                });
            }

            const existingAwaiting = await Payment.findOne({
                ...activePaymentFilter(),
                email,
                course: course._id,
                paymentMethod: 'bank',
                status: 'awaiting_review',
            }).select('_id');

            if (existingAwaiting) {
                return res.status(400).json({
                    success: false,
                    error: 'A bank transfer for this course is already awaiting review. Contact the academy if you need help.',
                });
            }

            savedProofPath = proofPublicPath(req.file.filename);
            const dueDate = defaultFeeDueDate();

            const payment = new Payment({
                studentName,
                email,
                phone: bankDigits,
                courseName: course.title,
                course: course._id,
                amount: coursePrice,
                currency: 'USD',
                status: 'awaiting_review',
                paymentMethod: 'bank',
                transactionId: `bank_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
                invoiceNumber: await nextInvoiceNumber(),
                proofUrl: savedProofPath,
                proofSubmittedAt: new Date(),
                dueDate,
                invoiceMode: 'combined',
                payerRole: 'guest',
                lines: [
                    {
                        course: course._id,
                        courseName: course.title,
                        studentName,
                        studentEmail: email,
                        amount: coursePrice,
                        dueDate,
                    },
                ],
            });

            await payment.save();
            savedProofPath = null;

            return res.status(201).json({
                success: true,
                message:
                    'Payment proof received. Our accountant will verify your transfer and confirm enrollment.',
                payment: {
                    _id: payment._id,
                    transactionId: payment.transactionId,
                    amount: payment.amount,
                    currency: payment.currency,
                    status: payment.status,
                },
            });
        } catch (error) {
            if (savedProofPath) {
                deleteProofFile(savedProofPath);
            }
            req.log?.error('Bank registration with proof failed', { err: error });
            const status = error.status || 500;
            return res.status(status).json({
                success: false,
                code: error.code,
                error:
                    status === 400 && error.message
                        ? error.message
                        : 'Failed to submit bank payment',
            });
        }
    });
});

function collectPublicCourseIds(body = {}) {
    const ids = [];
    const push = (value) => {
        const id = String(value || '').trim();
        if (id && mongoose.Types.ObjectId.isValid(id) && !ids.includes(id)) ids.push(id);
    };
    push(body.courseId);
    const extra = Array.isArray(body.courseIds) ? body.courseIds : [];
    extra.forEach(push);
    if (typeof body.courseIds === 'string') {
        try {
            const parsed = JSON.parse(body.courseIds);
            if (Array.isArray(parsed)) parsed.forEach(push);
        } catch {
            String(body.courseIds)
                .split(',')
                .forEach(push);
        }
    }
    return ids;
}

async function sendPaymentPdf(res, payment, { kind = 'invoice', lineFilter = null } = {}) {
    const { buildPaymentInvoicePdf } = require('../utils/paymentInvoicePdf');
    const { loadPaidInvoiceHistory } = require('../utils/invoicePaymentHistory');
    await ensureInvoiceNumber(payment);
    const historyRows = await loadPaidInvoiceHistory(payment, { lineFilter });
    const pdfBuffer = buildPaymentInvoicePdf(payment, { kind, lineFilter, historyRows });
    const safeId = String(payment.invoiceNumber || payment.transactionId || payment._id).replace(/[^a-zA-Z0-9-_]/g, '_');
    const prefix = kind === 'receipt' ? 'receipt' : 'invoice';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${prefix}_${safeId}.pdf"`);
    return res.send(pdfBuffer);
}

// --- Public: Stripe Checkout (cards, Link, Apple Pay / Google Pay via card when enabled in Dashboard) ---
router.post(
    '/create-checkout',
    async (req, res) => {
    if (!requireStripe(res)) return;
    try {
        const { userId, items, invoiceMode } = req.body || {};
        const courseIds = collectPublicCourseIds(req.body);
        const rawItems = Array.isArray(items) && items.length
            ? items
            : courseIds.map((courseId) => ({ courseId }));

        if (!rawItems.length) {
            return res.status(400).json({
                success: false,
                error: 'courseId is required',
            });
        }

        let linkedUserId;
        let actor = null;
        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            const user = await User.findById(userId).select('_id name email personalEmail role');
            if (user) {
                linkedUserId = user._id;
                actor = {
                    userId: user._id,
                    studentId: user.role === 'student' ? user._id : null,
                    name: user.name,
                    email: user.personalEmail || user.email,
                    role: user.role,
                };
            }
        }

        const useBillingCart = rawItems.length > 1 || Boolean(rawItems[0]?.enrollmentId);
        if (!useBillingCart) {
            const courseId = courseIds[0] || rawItems[0]?.courseId;
            const course = await Course.findOne({
                _id: String(courseId),
                isPublished: true,
                ...activeCourseFilter(),
            });
            if (!course) {
                return res.status(404).json({ success: false, error: 'Course not found' });
            }

            const priceUsd = Number(course.price);
            if (Number.isNaN(priceUsd) || priceUsd <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'This course has no payable amount. Contact us to enroll.',
                });
            }

            const unitAmount = Math.round(priceUsd * 100);
            if (unitAmount < 50) {
                return res.status(400).json({
                    success: false,
                    error: 'Amount is below the minimum charge allowed by Stripe.',
                });
            }

            const base = frontendBase();
            const paymentMethodTypes = checkoutPaymentMethodTypes();
            const sessionParams = {
                phone_number_collection: { enabled: true },
                line_items: [
                    {
                        price_data: {
                            currency: 'usd',
                            product_data: {
                                name: course.title,
                                description: (course.description || '').slice(0, 500),
                            },
                            unit_amount: unitAmount,
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                success_url: `${base}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${base}/payment-cancel`,
                payment_intent_data: { setup_future_usage: 'off_session' },
                metadata: {
                    courseId: String(courseId),
                    autoPay: '1',
                    ...(linkedUserId ? { userId: String(linkedUserId) } : {}),
                },
            };

            const session = await createCheckoutSessionWithFallback(sessionParams, paymentMethodTypes);
            return res.json({
                success: true,
                sessionId: session.id,
                url: session.url,
            });
        }

        const resolvedItems = await resolveCheckoutItems({
            rawItems,
            actor,
        });
        const chargeable = stripeChargeableItems(resolvedItems);
        assertStripeMinimum(chargeable);
        const intent = await createBillingIntent({
            items: chargeable,
            invoiceMode: parseInvoiceMode(invoiceMode),
            payer: {
                userId: linkedUserId || null,
                role: actor?.role === 'parent' ? 'parent' : actor?.role === 'student' ? 'student' : 'guest',
                email: actor?.email || '',
                name: actor?.name || '',
            },
            autoPayEnable: true,
        });

        const base = frontendBase();
        const paymentMethodTypes = checkoutPaymentMethodTypes();
        const sessionParams = {
            phone_number_collection: { enabled: true },
            line_items: stripeLineItemsFromResolved(chargeable),
            mode: 'payment',
            success_url: `${base}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${base}/payment-cancel`,
            payment_intent_data: { setup_future_usage: 'off_session' },
            metadata: {
                groupId: intent.groupId,
                courseId: String(chargeable[0].courseId),
                autoPay: '1',
                ...(linkedUserId ? { userId: String(linkedUserId) } : {}),
            },
        };
        const session = await createCheckoutSessionWithFallback(sessionParams, paymentMethodTypes);
        intent.stripeSessionId = session.id;
        await intent.save();

        res.json({
            success: true,
            sessionId: session.id,
            url: session.url,
            groupId: intent.groupId,
        });
    } catch (error) {
        req.log.error('Stripe checkout error', { err: error });
        const msg =
            error?.status && error?.message
                ? error.message
                : (error?.type === 'StripeInvalidRequestError' || error?.rawType === 'invalid_request_error') &&
                    error?.message
                  ? error.message
                  : error?.message || 'Payment initialization failed';
        res.status(error.status || 500).json({ success: false, error: msg });
    }
});

router.get('/verify-session', async (req, res) => {
    if (!requireStripe(res)) return;
    const sessionId = req.query.session_id;
    if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ success: false, error: 'session_id is required' });
    }
    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const stripePaid = session.payment_status === 'paid';

        if (stripePaid) {
            const result = await fulfillStripeCheckoutSession(session);
            const payment = result?.payment;
            const fulfillmentIssue = result?.fulfillmentIssue || null;

            return res.json({
                success: true,
                paid: stripePaid,
                enrolled: result?.enrolled === true,
                fulfillmentIssue,
                message:
                    fulfillmentIssue === 'already_enrolled_duplicate'
                        ? fulfillmentMessage(fulfillmentIssue)
                        : result?.enrolled === true
                          ? null
                          : fulfillmentMessage(fulfillmentIssue),
                courseTitle: payment?.course?.title || payment?.courseName || null,
                paymentId: payment?._id || result?.payments?.[0]?._id || null,
                paymentIds: (result?.payments || (payment ? [payment] : [])).map((row) => row._id),
            });
        }

        const payment = await Payment.findOne({
            transactionId: sessionId,
            ...activePaymentFilter(),
        })
            .populate('course')
            .populate('user');

        const failureText = String(payment?.failureReason || '').toLowerCase();
        const alreadyEnrolledDuplicate =
            Boolean(payment?.failureReason) && failureText.includes('already enrolled');

        res.json({
            success: true,
            paid: isPaidStatus(payment?.status),
            enrolled: (isPaidStatus(payment?.status) && !payment?.failureReason) || alreadyEnrolledDuplicate,
            fulfillmentIssue: payment?.failureReason
                ? alreadyEnrolledDuplicate
                    ? 'already_enrolled_duplicate'
                    : 'enrollment_failed'
                : null,
            message: alreadyEnrolledDuplicate
                ? fulfillmentMessage('already_enrolled_duplicate')
                : payment?.failureReason || null,
            courseTitle: payment?.course?.title || payment?.courseName || null,
            paymentId: payment?._id || null,
            paymentIds: payment?._id ? [payment._id] : [],
        });
    } catch (error) {
        req.log.error('verify-session failed', { err: error });
        res.status(400).json({ success: false, error: 'Could not verify session' });
    }
});

router.get('/receipt-by-session', async (req, res) => {
    const sessionId = req.query.session_id;
    if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ success: false, error: 'session_id is required' });
    }
    try {
        const payments = await Payment.find({
            transactionId: sessionId,
            ...activePaymentFilter(),
        })
            .populate('user', 'name email')
            .populate('course', 'title');
        const paid = payments.filter((row) => isPaidStatus(row.status));
        if (!paid.length) {
            return res.status(404).json({ success: false, error: 'Receipt is not available yet' });
        }
        if (paid.length === 1) {
            return await sendPaymentPdf(res, paid[0], { kind: 'receipt' });
        }
        const { paymentLines } = require('../utils/paymentInvoicePdf');
        const combined = {
            ...(paid[0].toObject ? paid[0].toObject() : paid[0]),
            amount: paid.reduce((sum, row) => sum + Number(row.amount || 0), 0),
            courseName: paid.map((row) => row.courseName || row.course?.title).filter(Boolean).join(', '),
            invoiceMode: 'separate',
            lines: paid.flatMap((row) => paymentLines(row)),
        };
        return await sendPaymentPdf(res, combined, { kind: 'receipt' });
    } catch (error) {
        req.log?.error('Receipt by session failed', { err: error });
        return res.status(500).json({ success: false, error: 'Failed to generate receipt' });
    }
});

router.use(authMiddleware);
router.use(validateSessionUser);

router.get('/admin/unseen-count', allowPermission('payments.read'), async (req, res) => {
    try {
        const sinceRaw = String(req.query.since || '').trim();
        const since = sinceRaw ? new Date(sinceRaw) : null;
        const sinceOk = since && !Number.isNaN(since.getTime());
        const or = [
            { status: { $in: ['awaiting_review', 'processing'] } },
        ];
        if (sinceOk) {
            or.push({ createdAt: { $gt: since } });
        }
        const count = await Payment.countDocuments({
            ...activePaymentListFilter(),
            $or: or,
        });
        res.json({ success: true, count });
    } catch (error) {
        req.log?.error('Error counting unseen payments', { err: error });
        res.status(500).json({ success: false, error: 'Failed to load payment badge', count: 0 });
    }
});

router.get('/', allowPermission('payments.read'), async (req, res) => {
    try {
        const trash = req.query.trash === 'true' || req.query.trash === '1';
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 25));
        const skip = (page - 1) * limit;
        const search = String(req.query.search || '').trim();
        const statusFilter = String(req.query.status || 'all').trim().toLowerCase();
        const dateRange = String(req.query.dateRange || 'all').trim().toLowerCase();
        const sortBy = String(req.query.sortBy || 'date').trim();
        const sortOrder = String(req.query.sortOrder || 'desc').trim().toLowerCase() === 'asc' ? 1 : -1;
        const includeCounts = req.query.includeCounts === 'true' || req.query.includeCounts === '1';
        const includeStats = req.query.includeStats === 'true' || req.query.includeStats === '1';

        const filter = trash ? trashedPaymentFilter() : activePaymentListFilter();

        if (statusFilter && statusFilter !== 'all') {
            if (statusFilter === 'paid') {
                filter.status = { $in: ['paid', 'completed'] };
            } else if (statusFilter === 'unpaid') {
                filter.status = 'pending';
            } else if (statusFilter === 'overdue') {
                Object.assign(filter, overduePaymentFilter());
            } else if (statusFilter === 'cancelled') {
                filter.status = { $in: ['cancelled', 'rejected'] };
            } else if (statusFilter === 'awaiting_review') {
                filter.status = { $in: ['awaiting_review', 'processing'] };
            } else {
                filter.status = statusFilter;
            }
        }

        if (dateRange === 'today') {
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            filter.createdAt = { $gte: start };
        } else if (dateRange === 'week') {
            const start = new Date();
            start.setDate(start.getDate() - 7);
            filter.createdAt = { $gte: start };
        } else if (dateRange === 'month') {
            const start = new Date();
            start.setMonth(start.getMonth() - 1);
            filter.createdAt = { $gte: start };
        }

        if (search) {
            const regex = { $regex: search, $options: 'i' };
            filter.$or = [
                { studentName: regex },
                { email: regex },
                { courseName: regex },
                { transactionId: regex },
                { invoiceNumber: regex },
                { phone: regex },
                { groupId: regex },
                { 'lines.studentName': regex },
                { 'lines.courseName': regex },
                { 'lines.studentEmail': regex },
            ];
        }

        const sortFieldMap = {
            date: 'createdAt',
            amount: 'amount',
            status: 'status',
            transactionId: 'transactionId',
        };
        const sortField = sortFieldMap[sortBy] || 'createdAt';
        const sort = { [sortField]: sortOrder };
        if (trash) sort.deletedAt = -1;

        const [payments, total, trashCount, statsAgg] = await Promise.all([
            Payment.find(filter)
                .populate('user', 'name email')
                .populate('course', 'title')
                .sort(sort)
                .skip(skip)
                .limit(limit),
            Payment.countDocuments(filter),
            includeCounts ? Payment.countDocuments(trashedPaymentFilter()) : Promise.resolve(undefined),
            includeStats && !trash
                ? Payment.aggregate([
                    { $match: activePaymentListFilter() },
                    {
                        $group: {
                            _id: '$status',
                            count: { $sum: 1 },
                            revenue: { $sum: '$amount' },
                        },
                    },
                ])
                : Promise.resolve(null),
        ]);

        let stats;
        if (statsAgg) {
            stats = {
                totalRevenue: 0,
                successfulPayments: 0,
                pendingPayments: 0,
                failedPayments: 0,
                refundedPayments: 0,
            };
            for (const row of statsAgg) {
                const status = String(row._id || '').toLowerCase();
                const count = row.count || 0;
                if (status === 'paid' || status === 'completed') {
                    stats.successfulPayments += count;
                    stats.totalRevenue += row.revenue || 0;
                } else if (status === 'pending' || status === 'awaiting_review' || status === 'processing') {
                    stats.pendingPayments += count;
                } else if (status === 'failed') stats.failedPayments += count;
                else if (status === 'refunded') stats.refundedPayments += count;
            }
        }

        res.json({
            success: true,
            payments: serializePayments(payments),
            total,
            page,
            pages: Math.max(1, Math.ceil(total / limit)),
            limit,
            ...(includeCounts ? { trashCount } : {}),
            ...(stats ? { stats } : {}),
        });
    } catch (error) {
        req.log.error('Error fetching payments', { err: error });
        res.status(500).json({ success: false, error: 'Failed to fetch payments' });
    }
});

router.get('/outstanding', allowPermission('payments.read'), async (req, res) => {
    try {
        const outstanding = await listOutstandingFees();
        res.json({ success: true, outstanding });
    } catch (error) {
        req.log.error('Outstanding fees error', { err: error });
        res.status(500).json({ success: false, error: 'Failed to load outstanding fees' });
    }
});

router.patch('/outstanding/:enrollmentId/due-date', allowPermission('payments.write'), async (req, res) => {
    try {
        const enrollment = await extendEnrollmentDueDate(
            req.params.enrollmentId,
            req.body?.dueDate,
            req.user?.userId || req.user?.id
        );
        res.json({ success: true, enrollment });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message || 'Failed to extend due date' });
    }
});

router.post('/outstanding/:enrollmentId/mark-received', allowPermission('payments.write'), async (req, res) => {
    try {
        const payment = await markEnrollmentReceived(req.params.enrollmentId, req.user?.userId || req.user?.id);
        res.json({ success: true, message: 'Payment marked as received', payment: serializePayment(payment) });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message || 'Failed to mark payment received' });
    }
});

router.post('/outstanding/:enrollmentId/cancel', allowPermission('payments.write'), async (req, res) => {
    try {
        const enrollment = await cancelEnrollmentFee(
            req.params.enrollmentId,
            req.user?.userId || req.user?.id,
            req.body?.reason
        );
        res.json({ success: true, enrollment });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message || 'Failed to cancel fee' });
    }
});

router.get('/:id/invoice', allowPermission('payments.read'), async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid payment id' });
        }

        const payment = await Payment.findOne({
            _id: req.params.id,
            ...activePaymentFilter(),
        })
            .populate('user', 'name email')
            .populate('course', 'title');

        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }

        const kind = String(req.query.kind || 'invoice') === 'receipt' ? 'receipt' : 'invoice';
        const lineFilter = {};
        if (req.query.studentId) lineFilter.studentId = req.query.studentId;
        if (req.query.courseId) lineFilter.courseId = req.query.courseId;
        if (req.query.courseName) lineFilter.courseName = req.query.courseName;
        let doc = payment;
        if (String(req.query.scope || '') === 'combined') {
            const group = await paymentsInGroup(payment);
            const source = group.length ? group : [payment];
            const lines = source.flatMap((row) => (
                Array.isArray(row.lines) && row.lines.length
                    ? row.lines
                    : [{
                        studentName: row.studentName || row.user?.name,
                        courseName: row.courseName || row.course?.title,
                        amount: row.amount,
                        course: row.course,
                        student: row.user,
                    }]
            ));
            doc = {
                ...(payment.toObject ? payment.toObject() : payment),
                lines,
                amount: source.reduce((sum, row) => sum + Number(row.amount || 0), 0),
                invoiceMode: 'combined',
            };
        }
        return await sendPaymentPdf(res, doc, {
            kind,
            lineFilter: Object.keys(lineFilter).length ? lineFilter : null,
        });
    } catch (error) {
        req.log.error('Payment invoice error', { err: error });
        return res.status(500).json({ success: false, error: 'Failed to generate invoice' });
    }
});

router.put('/admin/bank-details', allowPermission('payments.write'), async (req, res) => {
    if (!canManagePaymentConfig(req.user?.role)) {
        return res.status(403).json({ success: false, error: 'Forbidden: insufficient role' });
    }
    try {
        const body = req.body || {};
        const settings = await getOrCreateSettings();
        const update = {};
        for (const field of BANK_DETAIL_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(body, field)) {
                update[field] = String(body[field] ?? '').trim();
            }
        }
        settings.payment = { ...settings.payment, ...update };
        settings.lastUpdatedBy = req.user?.userId || req.user?.id || null;
        await settings.save();

        res.json({
            success: true,
            message: 'Bank transfer details saved',
            bankDetails: bankDetailsFromPaymentSettings(settings.payment),
        });
    } catch (error) {
        req.log.error('Error saving bank details', { err: error });
        res.status(500).json({ success: false, error: 'Failed to save bank details' });
    }
});

router.get('/admin/fee-due-settings', allowPermission('payments.read'), async (_req, res) => {
    try {
        const { getFeeDueSettings, toDateInputValue } = require('../services/feeDuePolicy');
        const { defaultFeeDueDate, feeDueDay } = await getFeeDueSettings();
        res.json({
            success: true,
            defaultFeeDueDate: defaultFeeDueDate ? toDateInputValue(defaultFeeDueDate) : '',
            feeDueDay,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load due date settings' });
    }
});

router.put('/admin/fee-due-settings', allowPermission('payments.write'), async (req, res) => {
    if (!canManagePaymentConfig(req.user?.role)) {
        return res.status(403).json({ success: false, error: 'Forbidden: insufficient role' });
    }
    try {
        const { applyPaymentsDefaultDueDate, toDateInputValue } = require('../services/feeDuePolicy');
        const confirm = req.body?.confirm === true || req.body?.confirm === 'true';
        if (!confirm) {
            return res.status(400).json({
                success: false,
                error: 'This will replace all course and student due dates. Confirm to continue.',
                needsConfirm: true,
            });
        }
        if (!req.body?.defaultFeeDueDate) {
            return res.status(400).json({ success: false, error: 'A due date is required' });
        }
        const result = await applyPaymentsDefaultDueDate(
            req.body.defaultFeeDueDate,
            req.user?.userId || req.user?.id || null
        );
        res.json({
            success: true,
            message: 'Default due date saved for all active courses',
            defaultFeeDueDate: toDateInputValue(result.defaultFeeDueDate),
            feeDueDay: result.feeDueDay,
        });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message || 'Failed to save due date' });
    }
});

router.post('/:id/refund', allowPermission('payments.refund'), async (req, res) => {
    if (!['accountant', 'manager', 'super-admin'].includes(req.user?.role)) {
        return res.status(403).json({ success: false, error: 'Forbidden: insufficient role' });
    }
    try {
        const payment = await Payment.findOne({ _id: req.params.id, ...activePaymentFilter() });

        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }

        if (!isPaidStatus(payment.status)) {
            return res.status(400).json({ success: false, error: 'Only paid payments can be refunded' });
        }

        const group = await paymentsInGroup(payment);
        const intentId =
            payment.stripePaymentIntentId ||
            (payment.transactionId?.startsWith('pi_') ? payment.transactionId : null);

        let refundId = payment.refundId || '';
        if (intentId) {
            if (!requireStripe(res)) return;
            const refund = await stripe.refunds.create({
                payment_intent: intentId,
            });
            refundId = refund.id;
        } else if (payment.paymentMethod === 'stripe') {
            return res.status(400).json({
                success: false,
                error: 'No Stripe PaymentIntent on this record; refund is not available.',
            });
        }

        for (const row of group) {
            row.status = 'refunded';
            if (refundId) row.refundId = refundId;
            await row.save();
            await row.populate(['user', 'course']);
            await syncEnrollmentFromPayment(row);
            const { reverseInstallmentPayment } = require('../services/feeDuePolicy');
            await reverseInstallmentPayment(row);
        }

        res.json({
            success: true,
            message: group.length > 1
                ? 'Refund processed for the full combined checkout'
                : 'Refund processed successfully',
            refundId: refundId || null,
        });
    } catch (error) {
        req.log.error('Refund error', { err: error });
        res.status(500).json({ success: false, error: error.message || 'Refund failed' });
    }
});

router.patch('/:id/due-date', allowPermission('payments.write'), async (req, res) => {
    try {
        const payment = await Payment.findOne({ _id: req.params.id, ...activePaymentFilter() });
        if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });
        const updated = await extendPaymentDueDate(
            payment,
            req.body?.dueDate,
            req.user?.userId || req.user?.id,
            req.body?.note
        );
        res.json({ success: true, payment: serializePayment(updated) });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message || 'Failed to extend due date' });
    }
});

router.post('/:id/mark-received', allowPermission('payments.write'), async (req, res) => {
    try {
        const payment = await Payment.findOne({ _id: req.params.id, ...activePaymentFilter() });
        if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });
        const group = await paymentsInGroup(payment);
        const actorId = req.user?.userId || req.user?.id;
        const updated = [];
        for (const row of group) {
            if (isPaidStatus(row.status)) continue;
            updated.push(await markPaymentPaidAndFulfill(row, { verifiedBy: actorId }));
        }
        res.json({
            success: true,
            message: 'Payment marked as received',
            payment: serializePayment(updated[0] || payment),
        });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message || 'Failed to mark payment received' });
    }
});

router.post('/:id/cancel', allowPermission('payments.write'), async (req, res) => {
    try {
        const payment = await Payment.findOne({ _id: req.params.id, ...activePaymentFilter() });
        if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });
        const updated = await cancelPaymentRecord(payment, req.user?.userId || req.user?.id, req.body?.reason);
        res.json({ success: true, payment: serializePayment(updated) });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message || 'Failed to cancel payment' });
    }
});

router.patch('/:id/restore', allowPermission('payments.write'), async (req, res) => {
    if (!['accountant', 'manager', 'super-admin'].includes(req.user?.role)) {
        return res.status(403).json({ success: false, error: 'Forbidden: insufficient role' });
    }

    try {
        const payment = await Payment.findOneAndUpdate(
            { _id: req.params.id, ...trashedPaymentFilter() },
            { $set: { deletedAt: null } },
            { new: true }
        );

        if (!payment) {
            return res.status(404).json({ success: false, error: 'Trashed payment not found' });
        }

        return res.json({ success: true, message: 'Payment restored', payment });
    } catch (error) {
        req.log.error('Restore payment error', { err: error });
        res.status(500).json({ success: false, error: 'Failed to restore payment' });
    }
});

router.delete('/:id/permanent', allowPermission('payments.write'), async (req, res) => {
    if (!['accountant', 'manager', 'super-admin'].includes(req.user?.role)) {
        return res.status(403).json({ success: false, error: 'Forbidden: insufficient role' });
    }

    try {
        const payment = await Payment.findOne({
            _id: req.params.id,
            ...trashedPaymentFilter(),
        });

        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment must be in trash before permanent delete' });
        }

        if (payment.proofUrl) {
            deleteProofFile(payment.proofUrl);
        }

        await Payment.deleteOne({ _id: payment._id });

        return res.json({
            success: true,
            message: 'Payment permanently deleted',
            paymentId: req.params.id,
        });
    } catch (error) {
        req.log.error('Permanent delete payment error', { err: error });
        res.status(500).json({ success: false, error: 'Failed to permanently delete payment' });
    }
});

router.delete('/:id', allowPermission('payments.write'), async (req, res) => {
    if (!['accountant', 'manager', 'super-admin'].includes(req.user?.role)) {
        return res.status(403).json({ success: false, error: 'Forbidden: insufficient role' });
    }

    try {
        const payment = await Payment.findOneAndUpdate(
            { _id: req.params.id, ...activePaymentFilter() },
            { $set: { deletedAt: new Date() } },
            { new: true }
        );

        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }

        if (isPaidStatus(payment.status)) {
            const { reverseInstallmentPayment } = require('../services/feeDuePolicy');
            await reverseInstallmentPayment(payment);
        }

        return res.json({
            success: true,
            message: 'Payment moved to trash',
            paymentId: req.params.id,
        });
    } catch (error) {
        req.log.error('Delete payment error', { err: error });
        res.status(500).json({ success: false, error: 'Failed to delete payment' });
    }
});

module.exports = router;
