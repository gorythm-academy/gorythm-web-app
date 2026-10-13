/**
 * Money ledger for part-paid installments.
 *
 * A course fee is paid in whole installments (months). When someone pays less than
 * a full installment, the money is kept as "credit" until it adds up to a whole
 * installment. All maths is done in integer cents, so 0.1 + 0.2 style rounding
 * errors can never move a student between "paid" and "not paid".
 *
 * The ledger is value based: (paid installments x price) + credit is the total money
 * received for the course. Adding or removing a payment changes that total and the
 * split into installments / leftover credit is recomputed from it.
 */

function toCents(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function fromCents(cents) {
    return Math.round(Number(cents) || 0) / 100;
}

function wholeCount(value) {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Add a received amount to the ledger.
 * `maxPaid` (optional) is the course's total number of installments; the paid count never goes above it.
 * Returns the new paid count, the leftover credit in cents and how many installments this payment completed.
 */
function addToLedger({ paid, creditCents, priceCents, amountCents, maxPaid = null }) {
    const paidNow = wholeCount(paid);
    const credit = Math.max(0, Math.round(Number(creditCents) || 0));
    const price = Math.round(Number(priceCents) || 0);
    const amount = Math.max(0, Math.round(Number(amountCents) || 0));
    if (price <= 0) return { paid: paidNow, creditCents: credit, completed: 0 };

    const total = paidNow * price + credit + amount;
    let nextPaid = Math.floor(total / price);
    if (maxPaid != null && Number.isFinite(Number(maxPaid))) {
        nextPaid = Math.min(nextPaid, Math.max(wholeCount(maxPaid), paidNow));
    }
    nextPaid = Math.max(nextPaid, paidNow);
    return { paid: nextPaid, creditCents: total - nextPaid * price, completed: nextPaid - paidNow };
}

/** Take a previously received amount back out of the ledger (refund / delete). */
function removeFromLedger({ paid, creditCents, priceCents, amountCents }) {
    const paidNow = wholeCount(paid);
    const credit = Math.max(0, Math.round(Number(creditCents) || 0));
    const price = Math.round(Number(priceCents) || 0);
    const amount = Math.max(0, Math.round(Number(amountCents) || 0));
    if (price <= 0) return { paid: paidNow, creditCents: credit, undone: 0 };

    const total = Math.max(0, paidNow * price + credit - amount);
    const nextPaid = Math.min(paidNow, Math.floor(total / price));
    return { paid: nextPaid, creditCents: total - nextPaid * price, undone: paidNow - nextPaid };
}

/** What is still owed on the current installment, in dollars. Never negative. */
function balanceDue(priceDollars, creditDollars) {
    const left = toCents(priceDollars) - toCents(creditDollars);
    return fromCents(Math.max(0, left));
}

module.exports = {
    toCents,
    fromCents,
    addToLedger,
    removeFromLedger,
    balanceDue,
};
