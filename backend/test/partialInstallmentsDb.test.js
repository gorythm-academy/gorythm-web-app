/**
 * Needs a real MongoDB. Skipped unless TEST_MONGO_URI is set (the database is emptied by this test).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

function isolatedTestUri(suffix) {
    const raw = process.env.TEST_MONGO_URI;
    if (!raw) return '';
    const url = new URL(raw);
    const base = url.pathname.replace(/^\//, '').replace(/\/$/, '') || 'gorythm_test';
    url.pathname = `/${base}_${suffix}`;
    return url.toString();
}

const uri = isolatedTestUri('partial');
const skip = uri ? false : 'TEST_MONGO_URI is not set';

test('part payments through the admin flow: credit, complete, refund, recount', { skip }, async (t) => {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    t.after(() => mongoose.disconnect());
    await mongoose.connection.dropDatabase();

    const Course = require('../models/Course');
    const User = require('../models/User');
    const Enrollment = require('../models/Enrollment');
    const Payment = require('../models/Payment');
    const { markEnrollmentReceived, markPaymentPaidAndFulfill } = require('../services/billingAdmin');
    const { reverseInstallmentPayment, recountPaidInstallments, buildEnrollmentFeeSummary } = require('../services/feeDuePolicy');

    const student = await User.create({
        name: 'Omar',
        email: 'omar@example.com',
        password: 'a-long-test-password-1',
        role: 'student',
        personalEmail: 'omar.family@example.com',
    });
    const course = await Course.create({
        title: 'Quran Basics',
        description: 'x',
        price: 40,
        totalFeeCount: 4,
        category: 'Tajweed',
        isPublished: true,
    });
    await Promise.all([Course.init(), Enrollment.init(), Payment.init(), User.init()]);
    const enrollment = await Enrollment.create({
        student: student._id,
        course: course._id,
        status: 'active',
        paymentStatus: 'pending',
        totalFeeCount: 4,
        feeDueDay: 10,
        feeDueDate: new Date(Date.now() + 5 * 24 * 3600 * 1000),
    });
    const reload = () => Enrollment.findById(enrollment._id);

    // Invalid amounts are rejected before anything is written.
    await assert.rejects(markEnrollmentReceived(enrollment._id, null, { receivedAmount: 41 }), /more than one installment/);
    assert.equal(await Payment.countDocuments({}), 0);

    // 15 of 40 received: credit only.
    const first = await markEnrollmentReceived(enrollment._id, null, { receivedAmount: 15 });
    assert.equal(first.amount, 15);
    assert.equal(first.billedAmount, 40);
    let row = await reload();
    assert.equal(row.partialPaidAmount, 15);
    assert.equal(row.paidInstallmentCount, 0);
    assert.notEqual(row.paymentStatus, 'paid');
    const dueBefore = row.feeDueDate.getTime();

    // The fee summary shows what is left to pay.
    const summaryRow = await Enrollment.findById(enrollment._id).populate('course').populate('student');
    const summary = await buildEnrollmentFeeSummary(summaryRow);
    assert.equal(summary.partialPaidAmount, 15);
    assert.equal(summary.balanceDue, 25);
    assert.equal(summary.remainingAmount, 145);

    // The remaining 25 completes the installment.
    const second = await markEnrollmentReceived(enrollment._id, null, { receivedAmount: 25 });
    row = await reload();
    assert.equal(row.partialPaidAmount, 0);
    assert.equal(row.paidInstallmentCount, 1);
    assert.equal(row.paymentStatus, 'paid');
    assert.ok(row.feeDueDate.getTime() > dueBefore);

    // A recount from the invoices agrees with the ledger.
    const counted = await Enrollment.findById(enrollment._id).populate('course');
    await recountPaidInstallments(counted);
    assert.equal(counted.paidInstallmentCount, 1);
    assert.equal(counted.partialPaidAmount, 0);

    // Refunding the payment that completed the installment re-opens it with 15 of credit.
    await reverseInstallmentPayment(await Payment.findById(second._id));
    row = await reload();
    assert.equal(row.paidInstallmentCount, 0);
    assert.equal(row.partialPaidAmount, 15);
    await Payment.updateOne({ _id: second._id }, { $set: { status: 'refunded' } });

    // The recount now ignores the refunded invoice.
    const afterRefund = await Enrollment.findById(enrollment._id).populate('course');
    await recountPaidInstallments(afterRefund);
    assert.equal(afterRefund.paidInstallmentCount, 0);
    assert.equal(afterRefund.partialPaidAmount, 15);

    // Refunding the first payment clears the credit.
    await reverseInstallmentPayment(await Payment.findById(first._id));
    row = await reload();
    assert.equal(row.partialPaidAmount, 0);
    assert.equal(row.paidInstallmentCount, 0);
    await Payment.updateOne({ _id: first._id }, { $set: { status: 'refunded' } });

    // A pending bill can be accepted at a lower amount; combined bills cannot.
    const bill = await Payment.create({
        user: student._id,
        course: course._id,
        studentName: 'Omar',
        email: 'omar.family@example.com',
        courseName: 'Quran Basics',
        amount: 40,
        status: 'pending',
        paymentMethod: 'bank',
        lines: [{ student: student._id, course: course._id, enrollment: enrollment._id, amount: 40 }],
    });
    await assert.rejects(markPaymentPaidAndFulfill(bill, { receivedAmount: 41 }), /more than the bill/);
    const paid = await markPaymentPaidAndFulfill(await Payment.findById(bill._id), { receivedAmount: 10 });
    assert.equal(paid.amount, 10);
    assert.equal(paid.billedAmount, 40);
    assert.equal(paid.lines[0].partialCredited, 10);
    row = await reload();
    assert.equal(row.partialPaidAmount, 10);

    // Repairing the same paid bill again does not credit it twice.
    const { onPaymentPaid } = require('../services/onPaymentPaid');
    await onPaymentPaid(await Payment.findById(bill._id));
    row = await reload();
    assert.equal(row.partialPaidAmount, 10);
});
