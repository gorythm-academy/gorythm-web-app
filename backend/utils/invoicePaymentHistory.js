const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const { activePaymentFilter } = require('./paymentQuery');
const { displayPaymentStatus } = require('./billingStatus');

function refId(value) {
    if (!value) return '';
    if (typeof value === 'object') return String(value._id || value.id || '');
    return String(value);
}

function paymentLines(payment) {
    if (Array.isArray(payment.lines) && payment.lines.length) return payment.lines;
    return [
        {
            student: payment.user,
            course: payment.course,
            studentName: payment.studentName || payment.user?.name || 'Student',
            studentEmail: payment.email || payment.user?.email || '',
            courseName: payment.courseName || payment.course?.title || 'Course fee',
            amount: payment.amount,
        },
    ];
}

function paidAtOf(payment) {
    return payment.receiptIssuedAt || payment.verifiedAt || payment.createdAt;
}

function collectScope(payment, lineFilter = null) {
    const lines = paymentLines(payment).filter((line) => {
        if (!lineFilter) return true;
        const lineStudent = refId(line.student);
        const lineCourse = refId(line.course);
        if (lineFilter.studentId && lineStudent && lineStudent !== String(lineFilter.studentId)) return false;
        if (lineFilter.courseId && lineCourse && lineCourse !== String(lineFilter.courseId)) return false;
        if (lineFilter.courseName && String(line.courseName || '').trim().toLowerCase() !== String(lineFilter.courseName).trim().toLowerCase()) {
            return false;
        }
        return true;
    });
    const studentIds = new Set();
    const courseIds = new Set();
    const courseNames = new Set();
    const emails = new Set();
    const studentNames = new Set();
    const addEmail = (value) => {
        const email = String(value || '').trim().toLowerCase();
        if (email) emails.add(email);
    };
    const addName = (value) => {
        const name = String(value || '').trim().toLowerCase();
        if (name) studentNames.add(name);
    };
    addEmail(payment.email || payment.user?.email);
    addName(payment.studentName || payment.user?.name);
    lines.forEach((line) => {
        const studentId = refId(line.student) || refId(payment.user);
        const courseId = refId(line.course) || refId(payment.course);
        if (studentId && mongoose.Types.ObjectId.isValid(studentId)) studentIds.add(studentId);
        if (courseId && mongoose.Types.ObjectId.isValid(courseId)) courseIds.add(courseId);
        const name = String(line.courseName || payment.courseName || payment.course?.title || '').trim().toLowerCase();
        if (name) courseNames.add(name);
        addEmail(line.studentEmail);
        addName(line.studentName);
    });
    if (lineFilter?.studentId && mongoose.Types.ObjectId.isValid(String(lineFilter.studentId))) {
        studentIds.add(String(lineFilter.studentId));
    }
    if (lineFilter?.courseId && mongoose.Types.ObjectId.isValid(String(lineFilter.courseId))) {
        courseIds.add(String(lineFilter.courseId));
    }
    return {
        lines,
        studentIds: [...studentIds],
        courseIds: [...courseIds],
        courseNames: [...courseNames],
        emails: [...emails],
        studentNames: [...studentNames],
    };
}

function lineMatchesScope(line, payment, scope) {
    const studentId = refId(line.student) || refId(payment.user);
    const courseId = refId(line.course) || refId(payment.course);
    const courseName = String(line.courseName || payment.courseName || payment.course?.title || '').trim().toLowerCase();
    const email = String(line.studentEmail || payment.email || payment.user?.email || '').trim().toLowerCase();
    const studentName = String(line.studentName || payment.studentName || payment.user?.name || '').trim().toLowerCase();
    const studentOk = (
        (studentId && scope.studentIds.includes(studentId))
        || (email && scope.emails.includes(email))
        || (studentName && scope.studentNames.includes(studentName))
    );
    const courseOk = courseId
        ? scope.courseIds.includes(courseId)
        : scope.courseNames.includes(courseName);
    return Boolean(studentOk && courseOk);
}

function historyRowFromLine(payment, line, { invoiceNo }) {
    const { invoiceDisplay, methodLabel, money } = require('./paymentInvoicePdf');
    const display = invoiceDisplay(payment, line.amount);
    return {
        date: paidAtOf(payment),
        invoiceNo: invoiceNo || payment.invoiceNumber || String(payment._id || ''),
        course: String(line.courseName || payment.courseName || payment.course?.title || 'Course fee'),
        method: methodLabel(payment.paymentMethod),
        amount: money(display.amount, display.currency),
        paymentId: String(payment._id || ''),
    };
}

async function loadPaidInvoiceHistory(payment, { lineFilter = null } = {}) {
    const current = payment?.toObject ? payment.toObject() : { ...payment };
    const scope = collectScope(current, lineFilter);
    const currentId = String(current._id || '');
    const and = [
        { ...activePaymentFilter() },
        { status: { $in: ['paid', 'completed'] } },
    ];
    const courseOr = [];
    if (scope.courseIds.length) {
        const courseObjIds = scope.courseIds.map((id) => new mongoose.Types.ObjectId(id));
        courseOr.push({ course: { $in: courseObjIds } });
        courseOr.push({ 'lines.course': { $in: courseObjIds } });
    }
    if (courseOr.length) and.push({ $or: courseOr });
    const studentOr = [];
    if (scope.studentIds.length) {
        const studentObjIds = scope.studentIds.map((id) => new mongoose.Types.ObjectId(id));
        studentOr.push({ user: { $in: studentObjIds } });
        studentOr.push({ 'lines.student': { $in: studentObjIds } });
    }
    if (scope.emails.length) {
        studentOr.push({ email: { $in: scope.emails } });
        studentOr.push({ 'lines.studentEmail': { $in: scope.emails } });
    }
    if (scope.studentNames.length) {
        const nameRegex = scope.studentNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const nameMatch = { $regex: `^(${nameRegex.join('|')})$`, $options: 'i' };
        studentOr.push({ studentName: nameMatch });
        studentOr.push({ 'lines.studentName': nameMatch });
    }
    if (studentOr.length) and.push({ $or: studentOr });

    let past = [];
    if (courseOr.length || studentOr.length) {
        past = await Payment.find({ $and: and })
            .populate('course', 'title')
            .sort({ receiptIssuedAt: 1, verifiedAt: 1, createdAt: 1 })
            .lean();
    }

    const history = [];
    const seen = new Set();
    const currentInvoice = String(current.invoiceNumber || '');
    const currentGroup = String(current.groupId || '');
    const rowKey = (row) => `${String(row.invoiceNo || '').toLowerCase()}|${String(row.course || '').trim().toLowerCase()}`;
    const pushRow = (row) => {
        const key = rowKey(row);
        if (!key || seen.has(key)) return;
        seen.add(key);
        history.push(row);
    };
    past.forEach((row) => {
        if (String(row._id) === currentId) return;
        if (currentGroup && String(row.groupId || '') === currentGroup) return;
        if (currentInvoice && String(row.invoiceNumber || '') === currentInvoice) return;
        if (displayPaymentStatus(row) !== 'paid') return;
        paymentLines(row).forEach((line) => {
            if (!lineMatchesScope(line, row, scope)) return;
            pushRow(historyRowFromLine(row, line, { invoiceNo: row.invoiceNumber }));
        });
    });

    history.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

    if (displayPaymentStatus(current) === 'paid') {
        const { invoiceNumberFor } = require('./paymentInvoicePdf');
        const currentNo = invoiceNumberFor(current);
        paymentLines(current).forEach((line) => {
            if (lineFilter && !lineMatchesScope(line, current, scope) && (lineFilter.courseId || lineFilter.studentId || lineFilter.courseName)) {
                const lineStudent = refId(line.student) || refId(current.user);
                const lineCourse = refId(line.course) || refId(current.course);
                if (lineFilter.studentId && lineStudent && lineStudent !== String(lineFilter.studentId)) return;
                if (lineFilter.courseId && lineCourse && lineCourse !== String(lineFilter.courseId)) return;
                if (lineFilter.courseName && String(line.courseName || '').trim().toLowerCase() !== String(lineFilter.courseName).trim().toLowerCase()) return;
            }
            pushRow(historyRowFromLine(current, line, { invoiceNo: currentNo }));
        });
    }

    return history;
}

module.exports = {
    loadPaidInvoiceHistory,
    paymentLines,
    collectScope,
};
