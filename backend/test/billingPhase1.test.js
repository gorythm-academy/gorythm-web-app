const test = require('node:test');
const assert = require('node:assert/strict');
const {
    displayPaymentStatus,
    displayEnrollmentFeeStatus,
    statusLabel,
    parseInvoiceMode,
} = require('../utils/billingStatus');
const { defaultFeeDueDate, assertLaterDueDate } = require('../utils/feeDueDate');
const { buildPaymentDocsFromResolved } = require('../services/billingCheckout');
const { buildPaymentInvoicePdf } = require('../utils/paymentInvoicePdf');

test('maps stored payment statuses to Phase 1 labels', () => {
    assert.equal(displayPaymentStatus({ status: 'pending' }), 'unpaid');
    assert.equal(displayPaymentStatus({ status: 'awaiting_review' }), 'awaiting_review');
    assert.equal(displayPaymentStatus({ status: 'paid' }), 'paid');
    assert.equal(displayPaymentStatus({ status: 'completed' }), 'paid');
    assert.equal(displayPaymentStatus({ status: 'refunded' }), 'refunded');
    assert.equal(displayPaymentStatus({ status: 'cancelled' }), 'cancelled');
    assert.equal(displayPaymentStatus({ status: 'rejected' }), 'cancelled');
    assert.equal(statusLabel('unpaid'), 'Unpaid');
    assert.equal(statusLabel('awaiting_review'), 'Waiting for verification');
    assert.equal(statusLabel('overdue'), 'Overdue');
});

test('unpaid stays unpaid through the due date and overdue the next day', () => {
    const due = new Date('2026-01-15T12:00:00+05:00');
    const dueDay = new Date('2026-01-15T23:30:00+05:00');
    const nextDay = new Date('2026-01-16T00:30:00+05:00');
    assert.equal(displayPaymentStatus({ status: 'pending', dueDate: due }, dueDay), 'unpaid');
    assert.equal(displayEnrollmentFeeStatus({ paymentStatus: 'pending', feeDueDate: due }, dueDay), 'unpaid');
    assert.equal(displayPaymentStatus({ status: 'pending', dueDate: due }, nextDay), 'overdue');
    assert.equal(displayEnrollmentFeeStatus({ paymentStatus: 'pending', feeDueDate: due }, nextDay), 'overdue');
    assert.equal(displayPaymentStatus({ status: 'awaiting_review', dueDate: due }, nextDay), 'awaiting_review');
});

test('invoice PDF includes line items and academy branding', () => {
    const payment = {
        _id: 'abc123',
        invoiceNumber: 'GA-2026-000184',
        transactionId: 'cs_test_1',
        studentName: 'Parent',
        email: 'parent@test.com',
        amount: 75,
        currency: 'USD',
        status: 'paid',
        paymentMethod: 'stripe',
        invoiceMode: 'combined',
        createdAt: new Date('2026-01-15T12:00:00Z'),
        lines: [
            { studentName: 'Aisha', courseName: 'Quran', amount: 40 },
            { studentName: 'Omar', courseName: 'Arabic', amount: 35 },
        ],
    };
    const invoice = buildPaymentInvoicePdf(payment, { kind: 'invoice' });
    assert.equal(invoice.slice(0, 5).toString(), '%PDF-');
    const text = invoice.toString('latin1');
    assert.match(text, /Aisha/);
    assert.match(text, /Gorythm Academy/);
    assert.match(text, /Payment history/);
    assert.match(text, /Invoice No\./);
    assert.doesNotMatch(text, /TAX INVOICE/);
    assert.doesNotMatch(text, /Payment received via/);
    assert.doesNotMatch(text, /Bank transfer/);
    assert.doesNotMatch(text, /cs_test_1/);
    assert.doesNotMatch(text, /\bPAID\b/);
    assert.doesNotMatch(text, /\? bank|\? card/);
});

test('invoice PDF method is bank for bank transfers', () => {
    const invoice = buildPaymentInvoicePdf({
        _id: 'bank123',
        invoiceNumber: 'GA-2026-000185',
        transactionId: 'bank_txn_1',
        studentName: 'Hamza',
        amount: 40,
        currency: 'USD',
        status: 'paid',
        paymentMethod: 'bank',
        createdAt: new Date('2026-01-15T12:00:00Z'),
        courseName: 'Quran',
    }, { kind: 'invoice' });
    const text = invoice.toString('latin1');
    assert.match(text, /bank/);
    assert.doesNotMatch(text, /\bcard\b/);
});

test('combined checkout creates one payment with all lines', () => {
    const items = [
        { studentId: 's1', courseId: 'c1', studentName: 'Aisha', courseName: 'Quran', amount: 40, studentEmail: 'a@test.com' },
        { studentId: 's2', courseId: 'c2', studentName: 'Omar', courseName: 'Arabic', amount: 35, studentEmail: 'o@test.com' },
    ];
    const docs = buildPaymentDocsFromResolved({
        items,
        invoiceMode: 'combined',
        sharedFields: { email: 'parent@test.com', studentName: 'Parent', paymentMethod: 'stripe' },
    });
    assert.equal(docs.length, 1);
    assert.equal(docs[0].amount, 75);
    assert.equal(docs[0].lines.length, 2);
    assert.equal(docs[0].invoiceMode, 'combined');
});

test('separate invoice mode creates one payment per item', () => {
    const items = [
        { studentId: 's1', courseId: 'c1', studentName: 'Aisha', courseName: 'Quran', amount: 40 },
        { studentId: 's2', courseId: 'c2', studentName: 'Omar', courseName: 'Arabic', amount: 35 },
    ];
    const docs = buildPaymentDocsFromResolved({
        items,
        invoiceMode: 'separate',
        sharedFields: { email: 'parent@test.com', paymentMethod: 'stripe' },
    });
    assert.equal(docs.length, 2);
    assert.equal(docs[0].amount, 40);
    assert.equal(docs[1].lines.length, 1);
    assert.equal(parseInvoiceMode('separate'), 'separate');
    assert.equal(parseInvoiceMode('other'), 'combined');
});

test('due date extension must be after the current due date', () => {
    const { pktYmd } = require('../utils/feeDueDate');
    const current = defaultFeeDueDate(new Date('2026-01-01T12:00:00+05:00'));
    assert.throws(() => assertLaterDueDate(current, current), /after the current due date/);
    const later = new Date('2026-01-08T12:00:00+05:00');
    const result = assertLaterDueDate(current, later);
    assert.equal(pktYmd(result).d, 8);
    assert.equal(pktYmd(result).m, 1);
});

test('cancelled and failed enrollment statuses stay closed or retryable', () => {
    assert.equal(displayEnrollmentFeeStatus({ paymentStatus: 'cancelled' }), 'cancelled');
    assert.equal(displayEnrollmentFeeStatus({ paymentStatus: 'failed' }), 'failed');
    assert.equal(displayPaymentStatus({ status: 'processing' }), 'awaiting_review');
});

test('invoice numbers are sequential academy documents', () => {
    const { formatInvoiceNumber, sanitizeInvoicePrefix } = require('../utils/invoiceNumber');
    assert.equal(sanitizeInvoicePrefix('GORYTHM'), 'GA');
    assert.equal(sanitizeInvoicePrefix(''), 'GA');
    assert.equal(formatInvoiceNumber('GA', 2026, 184), 'GA-2026-000184');
});

test('enrollment due date can move earlier; extend still must be later', () => {
    const { applyEnrollmentDueDateInput } = require('../utils/feeDueDate');
    const enrollment = {
        paymentStatus: 'pending',
        feeDueDate: new Date('2026-02-01T12:00:00+05:00'),
        feeDueDateManuallySet: false,
        dueDateExtensions: [],
    };
    const first = applyEnrollmentDueDateInput(enrollment, '2026-01-20', 'admin1');
    assert.equal(first.changed, true);
    assert.equal(first.extended, false);
    const earlier = applyEnrollmentDueDateInput(enrollment, '2026-01-10', 'admin1');
    assert.equal(earlier.changed, true);
    assert.throws(
        () => applyEnrollmentDueDateInput(enrollment, '2026-01-05', 'admin1', { forceExtend: true }),
        /after the current due date/
    );
});

test('cancelled enrollments cannot change due date; paid enrollments can', () => {
    const { applyEnrollmentDueDateInput } = require('../utils/feeDueDate');
    assert.throws(
        () => applyEnrollmentDueDateInput({ paymentStatus: 'cancelled', feeDueDate: new Date() }, '2026-03-01'),
        /cancelled or refunded/
    );
    const paid = {
        paymentStatus: 'paid',
        feeDueDate: new Date('2026-02-01T12:00:00+05:00'),
        dueDateExtensions: [],
    };
    const result = applyEnrollmentDueDateInput(paid, '2026-03-01');
    assert.equal(result.changed, true);
});

test('stripe presentment keeps USD amount and local display currency', () => {
    const { presentmentFromStripeSession, withAdaptivePricing } = require('../utils/stripeMoney');
    const session = {
        currency: 'usd',
        amount_total: 7500,
        presentment_details: { presentment_currency: 'pkr', presentment_amount: 2100000 },
    };
    const money = presentmentFromStripeSession(session);
    assert.equal(money.currency, 'USD');
    assert.equal(money.presentmentCurrency, 'PKR');
    assert.equal(money.presentmentAmount, 21000);
    assert.equal(withAdaptivePricing({ mode: 'payment' }).adaptive_pricing.enabled, true);
});

test('invoice PDF uses presentment currency and academy invoice number', () => {
    const invoice = buildPaymentInvoicePdf({
        invoiceNumber: 'GA-2026-000184',
        transactionId: 'cs_test_1',
        studentName: 'Parent',
        amount: 40,
        currency: 'USD',
        presentmentCurrency: 'PKR',
        presentmentAmount: 11200,
        status: 'paid',
        paymentMethod: 'stripe',
        createdAt: new Date('2026-01-15T12:00:00Z'),
        lines: [{ studentName: 'Aisha', courseName: 'Quran', amount: 40 }],
    });
    const text = invoice.toString('latin1');
    assert.match(text, /GA-2026-000184/);
    assert.match(text, /Rs 11200.00/);
    assert.match(text, /USD equivalent/);
    assert.match(text, /\$40.00/);
});

test('short months keep the academy day after February', () => {
    const { dateFromAcademyDay, addMonthsKeepingDay, pktYmd } = require('../utils/feeDueDate');
    const jan31 = dateFromAcademyDay(2026, 1, 31);
    const feb = addMonthsKeepingDay(jan31, 31);
    const mar = addMonthsKeepingDay(feb, 31);
    assert.equal(pktYmd(feb).d, 28);
    assert.equal(pktYmd(mar).d, 31);
});

test('join after the due day starts next month', () => {
    const { firstDueDateFromJoin, pktYmd } = require('../utils/feeDueDate');
    const due = firstDueDateFromJoin(new Date('2026-04-20T12:00:00+05:00'), 15);
    const ymd = pktYmd(due);
    assert.equal(ymd.m, 5);
    assert.equal(ymd.d, 15);
});

test('empty total fees stay payable until the course is marked complete', () => {
    const { enrollmentAllFeesPaid } = require('../utils/feeDueDate');
    const now = new Date('2026-02-01T12:00:00+05:00');
    const futureDue = new Date('2026-03-18T12:00:00+05:00');
    assert.equal(
        enrollmentAllFeesPaid({
            paymentStatus: 'paid',
            paidInstallmentCount: 1,
            status: 'active',
        }),
        false
    );
    assert.equal(
        displayEnrollmentFeeStatus({
            paymentStatus: 'paid',
            paidInstallmentCount: 1,
            status: 'active',
            feeDueDate: futureDue,
        }, now),
        'paid'
    );
    assert.equal(
        enrollmentAllFeesPaid({
            paymentStatus: 'paid',
            paidInstallmentCount: 1,
            status: 'completed',
        }),
        true
    );
    assert.equal(
        displayEnrollmentFeeStatus({
            paymentStatus: 'paid',
            paidInstallmentCount: 1,
            status: 'completed',
            feeDueDate: new Date('2026-01-01T12:00:00+05:00'),
        }, now),
        'paid'
    );
});

test('all fees paid hides overdue even if the due date has passed', () => {
    const due = new Date('2026-01-01T12:00:00+05:00');
    const now = new Date('2026-02-01T12:00:00+05:00');
    assert.equal(
        displayEnrollmentFeeStatus({
            paymentStatus: 'paid',
            feeDueDate: due,
            totalFeeCount: 6,
            paidInstallmentCount: 6,
        }, now),
        'paid'
    );
    assert.equal(
        displayEnrollmentFeeStatus({
            paymentStatus: 'paid',
            status: 'active',
            feeDueDate: due,
            totalFeeCount: 6,
            paidInstallmentCount: 2,
        }, now),
        'overdue'
    );
    assert.equal(
        displayEnrollmentFeeStatus({
            paymentStatus: 'pending',
            status: 'completed',
            feeDueDate: due,
            totalFeeCount: 6,
            paidInstallmentCount: 2,
        }, now),
        'unpaid'
    );
    const nextCycleDue = new Date('2026-03-01T12:00:00+05:00');
    assert.equal(
        displayEnrollmentFeeStatus({
            paymentStatus: 'paid',
            status: 'active',
            feeDueDate: nextCycleDue,
            totalFeeCount: 5,
            paidInstallmentCount: 1,
        }, now),
        'paid'
    );
});

test('invoice PDF payment history can list past paid invoices', () => {
    const invoice = buildPaymentInvoicePdf({
        _id: 'current',
        invoiceNumber: 'GA-2026-000200',
        studentName: 'Hamza',
        amount: 40,
        currency: 'USD',
        status: 'paid',
        paymentMethod: 'stripe',
        createdAt: new Date('2026-03-15T12:00:00Z'),
        lines: [{ studentName: 'Hamza', courseName: 'Arabic', amount: 40 }],
    }, {
        historyRows: [
            {
                date: new Date('2026-01-15T12:00:00Z'),
                invoiceNo: 'GA-2026-000100',
                course: 'Arabic',
                method: 'card',
                amount: '$40.00',
            },
            {
                date: new Date('2026-03-15T12:00:00Z'),
                invoiceNo: 'GA-2026-000200',
                course: 'Arabic',
                method: 'card',
                amount: '$40.00',
            },
        ],
    });
    const text = invoice.toString('latin1');
    assert.match(text, /GA-2026-000100/);
    assert.match(text, /GA-2026-000200/);
    assert.match(text, /Payment history/);
});

test('unpaid invoice history table stays empty when there are no past paid invoices', () => {
    const invoice = buildPaymentInvoicePdf({
        _id: 'unpaid',
        invoiceNumber: 'GA-2026-000201',
        studentName: 'Hamza',
        amount: 40,
        currency: 'USD',
        status: 'pending',
        paymentMethod: 'bank',
        createdAt: new Date('2026-03-15T12:00:00Z'),
        lines: [{ studentName: 'Hamza', courseName: 'Arabic', amount: 40 }],
    }, { historyRows: [] });
    const text = invoice.toString('latin1');
    assert.match(text, /UNPAID/);
    assert.doesNotMatch(text, /Payment history/);
});

test('combined statement PDF uses history table, statement number, and extra pages', () => {
    const historyRows = Array.from({ length: 40 }, (_, index) => ({
        date: new Date(`2026-01-${String((index % 28) + 1).padStart(2, '0')}T12:00:00Z`),
        invoiceNo: `GA-2026-${String(index + 1).padStart(6, '0')}`,
        course: `Course ${index + 1}`,
        method: 'card',
        amount: '$40.00',
    }));
    const invoice = buildPaymentInvoicePdf({
        studentName: 'Aisha',
        email: 'aisha@test.com',
        amount: 1600,
        currency: 'USD',
        status: 'paid',
        invoiceNumber: 'GA-2026-STMT',
        createdAt: new Date('2026-03-15T12:00:00Z'),
    }, { statement: true, historyRows });
    const text = invoice.toString('latin1');
    assert.match(text, /GA-2026-STMT/);
    assert.doesNotMatch(text, /\/ALL\)/);
    assert.match(text, /Payment history/);
    assert.match(text, /Invoice No\./);
    assert.match(text, /Course 1/);
    assert.match(text, /Course 40/);
    assert.match(text, /Page 1 of 2/);
    assert.match(text, /Page 2 of 2/);
    assert.doesNotMatch(text, /Page 1 of 1/);
    assert.match(text, /Total/);
});

test('same-cycle extra pay is blocked until the next due date arrives', () => {
    const { isExtraInstallmentPayment } = require('../services/feeDuePolicy');
    const due = new Date('2026-02-18T12:00:00+05:00');
    const enrollment = {
        lastSettledDueDate: new Date('2026-01-18T12:00:00+05:00'),
        feeDueDate: due,
    };
    assert.equal(isExtraInstallmentPayment(enrollment, new Date('2026-01-20T12:00:00+05:00')), true);
    assert.equal(isExtraInstallmentPayment(enrollment, new Date('2026-02-18T12:00:00+05:00')), false);
    assert.equal(isExtraInstallmentPayment(enrollment, new Date('2026-02-19T12:00:00+05:00')), false);
});

test('max payable months uses remaining Y, or 4 when Y is empty', () => {
    const { maxPayableMonths, enrollmentAllFeesPaid } = require('../utils/feeDueDate');
    assert.equal(maxPayableMonths({ totalFeeCount: 5, paidInstallmentCount: 0 }), 5);
    assert.equal(maxPayableMonths({ totalFeeCount: 5, paidInstallmentCount: 3 }), 2);
    assert.equal(maxPayableMonths({ totalFeeCount: 5, paidInstallmentCount: 5 }), 0);
    assert.equal(maxPayableMonths({ paidInstallmentCount: 2 }), 4);
    assert.equal(enrollmentAllFeesPaid({ paidInstallmentCount: 8 }), false);
    assert.equal(enrollmentAllFeesPaid({ status: 'completed', paidInstallmentCount: 2 }), true);
    assert.equal(enrollmentAllFeesPaid({ totalFeeCount: 5, paidInstallmentCount: 5 }), true);
});

test('installment month count is clamped and due date jumps N months', () => {
    const { parseInstallmentMonths, dueDateAfterPayingMonths, pktYmd } = require('../utils/feeDueDate');
    assert.equal(parseInstallmentMonths(3, 5), 3);
    assert.equal(parseInstallmentMonths(9, 4), 4);
    assert.equal(parseInstallmentMonths('2', 5), 2);
    assert.equal(parseInstallmentMonths(undefined, 5), 1);
    assert.equal(parseInstallmentMonths(3, 0), 0);
    const next = dueDateAfterPayingMonths(new Date('2026-01-18T12:00:00+05:00'), 18, 3);
    assert.deepEqual(pktYmd(next), { y: 2026, m: 4, d: 18 });
});

test('shared months uses the lowest remaining and multiplies each monthly fee', () => {
    const { withSharedInstallmentMonths, stripeLineItemsFromResolved, buildPaymentDocsFromResolved } = require('../services/billingCheckout');
    const items = withSharedInstallmentMonths([
        { courseName: 'Arabic', monthlyAmount: 40, amount: 40, maxMonths: 5, studentName: 'Aisha' },
        { courseName: 'Quran', monthlyAmount: 35, amount: 35, maxMonths: 2, studentName: 'Omar' },
    ], 9);
    assert.equal(items[0].installmentMonths, 2);
    assert.equal(items[1].installmentMonths, 2);
    assert.equal(items[0].amount, 80);
    assert.equal(items[1].amount, 70);
    assert.match(items[0].courseName, /2 months/);
    const stripeItems = stripeLineItemsFromResolved(items);
    assert.equal(stripeItems[0].quantity, 2);
    assert.equal(stripeItems[0].price_data.unit_amount, 4000);
    const docs = buildPaymentDocsFromResolved({
        items,
        invoiceMode: 'combined',
        sharedFields: { email: 'parent@test.com' },
    });
    assert.equal(docs[0].amount, 150);
    assert.equal(docs[0].installmentMonths, 2);
    assert.equal(docs[0].lines[0].installmentMonths, 2);
    assert.equal(docs[0].lines[1].amount, 70);
});

test('auto-pay charges only when the due date has arrived and fees remain', () => {
    const { shouldChargeAutoPay, canEnableAutoPay } = require('../services/billingAutoPay');
    const due = new Date('2026-02-18T12:00:00+05:00');
    const base = {
        autoPayEnabled: true,
        status: 'active',
        paymentStatus: 'paid',
        feeDueDate: due,
        lastSettledDueDate: new Date('2026-01-18T12:00:00+05:00'),
        totalFeeCount: 5,
        paidInstallmentCount: 1,
        course: { price: 40 },
    };
    assert.equal(shouldChargeAutoPay(base, new Date('2026-01-20T12:00:00+05:00')), false);
    assert.equal(shouldChargeAutoPay(base, new Date('2026-02-18T12:00:00+05:00')), true);
    assert.equal(shouldChargeAutoPay({ ...base, paidInstallmentCount: 5 }, new Date('2026-02-19T12:00:00+05:00')), false);
    assert.equal(shouldChargeAutoPay({ ...base, autoPayEnabled: false }, new Date('2026-02-18T12:00:00+05:00')), false);
    assert.equal(canEnableAutoPay({ ...base, paidInstallmentCount: 5 }), false);
    assert.equal(canEnableAutoPay({ status: 'completed', paymentStatus: 'paid' }), false);
    assert.equal(canEnableAutoPay({ status: 'active', paymentStatus: 'paid', paidInstallmentCount: 1, totalFeeCount: 5, course: { price: 40 } }), true);
    assert.equal(shouldChargeAutoPay({ ...base, status: 'paused' }, new Date('2026-02-18T12:00:00+05:00')), false);
    assert.equal(canEnableAutoPay({ ...base, status: 'paused' }), false);
});

test('paused courses are not overdue and do not stay payable', () => {
    const due = new Date('2026-01-15T12:00:00+05:00');
    const nextDay = new Date('2026-01-16T00:30:00+05:00');
    assert.equal(displayEnrollmentFeeStatus({
        status: 'paused',
        paymentStatus: 'pending',
        feeDueDate: due,
        paidInstallmentCount: 1,
        totalFeeCount: 5,
        course: { price: 40 },
    }, nextDay), 'paused');
    assert.equal(statusLabel('paused'), 'Paused');
});

test('fee reminders send 3 days before the due date and once when overdue', () => {
    const { reminderKind } = require('../services/feeReminderEmail');
    const due = new Date('2026-02-18T12:00:00+05:00');
    const base = {
        status: 'active',
        paymentStatus: 'paid',
        feeDueDate: due,
        paidInstallmentCount: 1,
        totalFeeCount: 5,
        course: { price: 40 },
        feeReminderDueSentFor: '',
        feeReminderOverdueSentFor: '',
    };
    assert.equal(reminderKind(base, new Date('2026-02-14T12:00:00+05:00'))?.kind, undefined);
    assert.equal(reminderKind(base, new Date('2026-02-15T12:00:00+05:00'))?.kind, 'due');
    assert.equal(reminderKind({ ...base, feeReminderDueSentFor: '2026-02-18' }, new Date('2026-02-15T12:00:00+05:00')), null);
    assert.equal(reminderKind(base, new Date('2026-02-19T12:00:00+05:00'))?.kind, 'overdue');
    assert.equal(reminderKind({ ...base, status: 'paused' }, new Date('2026-02-19T12:00:00+05:00')), null);
});

test('one unpaid installment keeps one auto-pay key even if the due date moves', () => {
    const {
        autoPayPeriodKey,
        autoPayIdempotencyKey,
        autoPayClaimAction,
    } = require('../services/billingAutoPay');
    const due = new Date('2026-09-24T02:14:00.000Z');
    const enrollment = {
        _id: '507f1f77bcf86cd799439011',
        feeDueDate: due,
        paidInstallmentCount: 1,
    };
    const key = autoPayPeriodKey(enrollment);
    assert.equal(key, '507f1f77bcf86cd799439011:i1');
    assert.equal(key, autoPayPeriodKey({ ...enrollment, feeDueDate: new Date('2026-10-24T02:14:00.000Z') }));
    assert.notEqual(key, autoPayPeriodKey({ ...enrollment, paidInstallmentCount: 2 }));
    assert.equal(autoPayPeriodKey({ _id: enrollment._id, paidInstallmentCount: 1 }), '');
    assert.equal(autoPayIdempotencyKey(key, 1), autoPayIdempotencyKey(key, 1));
    assert.notEqual(autoPayIdempotencyKey(key, 1), autoPayIdempotencyKey(key, 2));
    const now = new Date('2026-09-27T14:14:00.000Z');
    assert.equal(autoPayClaimAction(null, now), 'charge');
    assert.equal(autoPayClaimAction({ status: 'done' }, now), 'skip');
    assert.equal(autoPayClaimAction({ status: 'charged' }, now), 'record');
    assert.equal(autoPayClaimAction({ status: 'failed', stopped: true }, now), 'skip');
    assert.equal(autoPayClaimAction({
        status: 'failed',
        stopped: false,
        lastAttemptAt: new Date('2026-09-27T03:14:00.000Z'),
    }, now), 'skip');
    assert.equal(autoPayClaimAction({
        status: 'failed',
        stopped: false,
        lastAttemptAt: new Date('2026-09-26T14:00:00.000Z'),
    }, now), 'retry');
    assert.equal(autoPayClaimAction({
        status: 'open',
        updatedAt: new Date('2026-09-27T14:13:30.000Z'),
    }, now), 'skip');
});

test('a saved Stripe charge repairs an unpaid fee even after the due date was edited', () => {
    const { autoPayPeriodKey, enrollmentNeedsAutoPayRepair } = require('../services/billingAutoPay');
    const due = new Date('2026-02-18T12:00:00+05:00');
    const enrollment = {
        _id: '507f1f77bcf86cd799439011',
        status: 'active',
        paymentStatus: 'pending',
        feeDueDate: due,
        totalFeeCount: 5,
        paidInstallmentCount: 1,
        course: { price: 40 },
    };
    assert.equal(autoPayPeriodKey(enrollment), autoPayPeriodKey({
        ...enrollment,
        feeDueDate: new Date('2026-02-26T12:00:00+05:00'),
    }));
    assert.equal(enrollmentNeedsAutoPayRepair(enrollment, { installmentCounted: false }), true);
    assert.equal(enrollmentNeedsAutoPayRepair({
        ...enrollment,
        feeDueDate: new Date('2026-02-26T12:00:00+05:00'),
    }, { installmentCounted: false }), true);
    assert.equal(enrollmentNeedsAutoPayRepair({
        ...enrollment,
        paymentStatus: 'paid',
        paidInstallmentCount: 2,
        lastSettledDueDate: due,
        feeDueDate: new Date('2026-03-18T12:00:00+05:00'),
    }, { installmentCounted: true }), false);
    assert.equal(enrollmentNeedsAutoPayRepair(enrollment, { installmentCounted: true }), false);
});

test('a bank block stops automatic charges immediately', () => {
    const { shouldStopAutoPayRetries, isHardAutoPayDecline, shouldChargeAutoPay } = require('../services/billingAutoPay');
    const blocked = { decline_code: 'transaction_not_allowed', message: 'Your card was declined.' };
    assert.equal(isHardAutoPayDecline(blocked), true);
    assert.equal(shouldStopAutoPayRetries(blocked, 1), true);
    assert.equal(shouldStopAutoPayRetries({ message: 'Transaction not allowed' }, 1), true);
    assert.equal(shouldStopAutoPayRetries({ decline_code: 'insufficient_funds' }, 1), false);
    assert.equal(shouldStopAutoPayRetries({ decline_code: 'insufficient_funds' }, 3), true);
    assert.equal(shouldChargeAutoPay({
        autoPayEnabled: true,
        status: 'active',
        paymentStatus: 'paid',
        feeDueDate: new Date('2026-02-18T12:00:00+05:00'),
        lastSettledDueDate: new Date('2026-01-18T12:00:00+05:00'),
        totalFeeCount: 5,
        paidInstallmentCount: 1,
        autoPayFailCount: 3,
        course: { price: 40 },
    }, new Date('2026-02-18T12:00:00+05:00')), false);
});

test('a saved card can be removed, including the last one', () => {
    const { canDeleteSavedCard, checkoutWantsAutoPay, autoPayConsented } = require('../services/billingAutoPay');
    assert.equal(canDeleteSavedCard([]), false);
    assert.equal(canDeleteSavedCard([{ id: 'pm_1' }]), true);
    assert.equal(canDeleteSavedCard([{ id: 'pm_1' }, { id: 'pm_2' }]), true);
    assert.equal(checkoutWantsAutoPay(true), true);
    assert.equal(checkoutWantsAutoPay('1'), true);
    assert.equal(checkoutWantsAutoPay(false), false);
    assert.equal(checkoutWantsAutoPay(undefined), false);
    assert.equal(checkoutWantsAutoPay('false'), false);
    assert.equal(autoPayConsented({ session: { metadata: { autoPay: '1' } } }), true);
    assert.equal(autoPayConsented({ session: { metadata: { autoPay: '0' } } }), false);
    assert.equal(autoPayConsented({
        session: { metadata: { autoPay: '1' } },
        intent: { autoPayEnable: false },
    }), false);
});

test('auto-pay reminders say the card will be charged', () => {
    const { reminderCopy } = require('../services/feeReminderEmail');
    const enrollment = {
        course: { title: 'Nazrah' },
        feeDueDate: new Date('2026-02-18T12:00:00+05:00'),
        autoPayEnabled: true,
    };
    const due = reminderCopy('due', enrollment, 'Amina');
    assert.match(due.text, /saved card/i);
    assert.doesNotMatch(due.text, /pay from Fees by card/i);
    const manual = reminderCopy('due', { ...enrollment, autoPayEnabled: false }, 'Amina');
    assert.match(manual.text, /pay from Fees/i);
});


