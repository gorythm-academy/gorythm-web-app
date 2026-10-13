const test = require('node:test');
const assert = require('node:assert/strict');
const { toCents, fromCents, addToLedger, removeFromLedger, balanceDue } = require('../utils/installmentLedger');
const { applyInstallmentPayment } = require('../services/feeDuePolicy');
const { shouldChargeAutoPay, enrollmentNeedsAutoPayRepair } = require('../services/billingAutoPay');
const { withSharedInstallmentMonths, stripeLineItemsFromResolved } = require('../services/billingCheckout');

test('cents helpers are not thrown off by floating point noise', () => {
    assert.equal(toCents(0.1 + 0.2), 30);
    assert.equal(toCents('19.99'), 1999);
    assert.equal(toCents('abc'), 0);
    assert.equal(fromCents(1999), 19.99);
    assert.equal(balanceDue(40, 15), 25);
    assert.equal(balanceDue(40, 50), 0);
});

test('part payments add up to whole installments', () => {
    const price = 4000;
    let state = { paid: 0, creditCents: 0 };
    state = addToLedger({ ...state, priceCents: price, amountCents: 1500 });
    assert.deepEqual([state.paid, state.creditCents, state.completed], [0, 1500, 0]);
    state = addToLedger({ ...state, priceCents: price, amountCents: 2500 });
    assert.deepEqual([state.paid, state.creditCents, state.completed], [1, 0, 1]);
    // More than one installment at once leaves the rest as credit.
    state = addToLedger({ ...state, priceCents: price, amountCents: 5500 });
    assert.deepEqual([state.paid, state.creditCents, state.completed], [2, 1500, 1]);
});

test('the paid count never goes above the total number of fees', () => {
    const state = addToLedger({ paid: 3, creditCents: 0, priceCents: 4000, amountCents: 9000, maxPaid: 4 });
    assert.equal(state.paid, 4);
    assert.equal(state.completed, 1);
});

test('removing a part payment takes back credit first, then a whole installment', () => {
    const afterOne = removeFromLedger({ paid: 0, creditCents: 1500, priceCents: 4000, amountCents: 1500 });
    assert.deepEqual([afterOne.paid, afterOne.creditCents, afterOne.undone], [0, 0, 0]);
    // The 25 that finished an installment is removed: 15 of credit is left again.
    const afterTwo = removeFromLedger({ paid: 1, creditCents: 0, priceCents: 4000, amountCents: 2500 });
    assert.deepEqual([afterTwo.paid, afterTwo.creditCents, afterTwo.undone], [0, 1500, 1]);
    // Never goes below zero.
    const floor = removeFromLedger({ paid: 0, creditCents: 0, priceCents: 4000, amountCents: 9000 });
    assert.deepEqual([floor.paid, floor.creditCents], [0, 0]);
});

test('a zero price leaves the ledger alone', () => {
    assert.deepEqual(addToLedger({ paid: 1, creditCents: 5, priceCents: 0, amountCents: 100 }), {
        paid: 1,
        creditCents: 5,
        completed: 0,
    });
});

function fakeEnrollment(overrides = {}) {
    return {
        _id: 'e1',
        course: 'c1',
        status: 'active',
        paymentStatus: 'pending',
        totalFeeCount: 4,
        paidInstallmentCount: 0,
        partialPaidAmount: 0,
        feeDueDay: 10,
        feeDueDate: new Date('2030-01-10T00:00:00+05:00'),
        saved: 0,
        async save() {
            this.saved += 1;
        },
        ...overrides,
    };
}

function fakePayment(amount, overrides = {}) {
    return {
        amount,
        installmentCounted: false,
        installmentMonths: 1,
        partialCredited: 0,
        lines: [{ course: 'c1', enrollment: 'e1', amount, installmentMonths: 1, partialCredited: 0 }],
        async save() {},
        ...overrides,
    };
}

test('a part payment is kept as credit and does not count an installment', async () => {
    const enrollment = fakeEnrollment();
    const payment = fakePayment(15);
    const result = await applyInstallmentPayment(enrollment, payment, { course: { price: 40, totalFeeCount: 4 } });
    assert.equal(result.partial, true);
    assert.equal(result.counted, false);
    assert.equal(enrollment.paidInstallmentCount, 0);
    assert.equal(enrollment.partialPaidAmount, 15);
    assert.equal(payment.lines[0].partialCredited, 15);
    assert.equal(enrollment.paymentStatus, 'pending');
});

test('paying the balance completes the installment and moves the due date', async () => {
    const enrollment = fakeEnrollment();
    const course = { price: 40, totalFeeCount: 4 };
    await applyInstallmentPayment(enrollment, fakePayment(15), { course });
    const balance = fakePayment(25);
    const result = await applyInstallmentPayment(enrollment, balance, { course });
    assert.equal(result.counted, true);
    assert.equal(result.partial, true);
    assert.equal(enrollment.paidInstallmentCount, 1);
    assert.equal(enrollment.partialPaidAmount, 0);
    assert.equal(enrollment.paymentStatus, 'paid');
    assert.equal(balance.installmentCounted, true);
    assert.ok(enrollment.feeDueDate.getTime() > new Date('2030-01-10T00:00:00+05:00').getTime());
});

test('the same part payment is never credited twice', async () => {
    const enrollment = fakeEnrollment();
    const course = { price: 40, totalFeeCount: 4 };
    const payment = fakePayment(15);
    await applyInstallmentPayment(enrollment, payment, { course });
    const again = await applyInstallmentPayment(enrollment, payment, { course });
    assert.equal(again.alreadyCounted, true);
    assert.equal(enrollment.partialPaidAmount, 15);
    assert.equal(enrollment.paidInstallmentCount, 0);
});

test('a part payment on a fully paid course is ignored', async () => {
    const enrollment = fakeEnrollment({ paidInstallmentCount: 4 });
    const payment = fakePayment(15);
    const result = await applyInstallmentPayment(enrollment, payment, { course: { price: 40, totalFeeCount: 4 } });
    assert.equal(result.partial, true);
    assert.equal(enrollment.partialPaidAmount, 0);
    assert.equal(payment.lines[0].partialCredited, 0);
});

test('a full payment still counts exactly as before', async () => {
    const enrollment = fakeEnrollment();
    const payment = fakePayment(40);
    const result = await applyInstallmentPayment(enrollment, payment, { course: { price: 40, totalFeeCount: 4 } });
    assert.equal(result.counted, true);
    assert.equal(result.partial, undefined);
    assert.equal(enrollment.paidInstallmentCount, 1);
    assert.equal(payment.lines[0].partialCredited, 0);
});

test('checkout charges only the balance when part of the fee is already received', () => {
    const items = [{
        courseName: 'Quran',
        studentName: 'Omar',
        monthlyAmount: 40,
        amount: 40,
        creditAmount: 15,
        maxMonths: 4,
    }];
    const [one] = withSharedInstallmentMonths(items, 1);
    assert.equal(one.amount, 25);
    assert.equal(one.creditApplied, 15);
    const [stripeLine] = stripeLineItemsFromResolved([one]);
    assert.equal(stripeLine.price_data.unit_amount, 2500);
    assert.equal(stripeLine.quantity, 1);

    const [two] = withSharedInstallmentMonths(items, 2);
    assert.equal(two.amount, 65);
    assert.equal(stripeLineItemsFromResolved([two])[0].price_data.unit_amount, 6500);

    const [plain] = withSharedInstallmentMonths([{ ...items[0], creditAmount: 0 }], 2);
    assert.equal(plain.amount, 80);
    const plainLine = stripeLineItemsFromResolved([plain])[0];
    assert.equal(plainLine.price_data.unit_amount, 4000);
    assert.equal(plainLine.quantity, 2);
});

test('auto-pay leaves an enrollment with a part-paid balance to the family', () => {
    const base = {
        autoPayEnabled: true,
        status: 'active',
        paymentStatus: 'pending',
        totalFeeCount: 4,
        paidInstallmentCount: 1,
        feeDueDate: new Date('2026-01-10T00:00:00+05:00'),
        course: { price: 40 },
    };
    const now = new Date('2026-02-19T12:00:00+05:00');
    assert.equal(shouldChargeAutoPay(base, now), true);
    assert.equal(shouldChargeAutoPay({ ...base, partialPaidAmount: 15 }, now), false);
    const partialPayment = { installmentCounted: false, lines: [{ partialCredited: 15 }] };
    assert.equal(enrollmentNeedsAutoPayRepair(base, partialPayment), false);
});
