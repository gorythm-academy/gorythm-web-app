const stripe = process.env.STRIPE_SECRET_KEY
    ? require('stripe')(process.env.STRIPE_SECRET_KEY)
    : null;
const Payment = require('../models/Payment');
const logger = require('../utils/logger');
const { syncEnrollmentFromPayment } = require('../services/enrollmentPaymentSync');
const { fulfillStripeCheckoutSession } = require('../services/stripeCheckoutFulfillment');
const BillingCheckoutIntent = require('../models/BillingCheckoutIntent');
const { activePaymentFilter } = require('../utils/paymentQuery');
const { reverseInstallmentPayment } = require('../services/feeDuePolicy');
const {
    claimWebhookEvent,
    completeWebhookEvent,
    releaseWebhookEvent,
    isChargeFullyRefunded,
} = require('../services/stripeWebhookEvents');

/** A failure event must never overwrite a payment that already succeeded or was refunded. */
const FAILABLE_PAYMENT_STATUSES = ['pending', 'processing', 'awaiting_review'];

async function updateActivePayment(query, update, options = {}) {
    return Payment.findOneAndUpdate({ ...query, ...activePaymentFilter() }, update, options);
}

async function markPaymentsRefunded(query, refundId) {
    const payments = await Payment.find({ ...query, ...activePaymentFilter() });
    for (const payment of payments) {
        const alreadyRefunded = payment.status === 'refunded';
        payment.status = 'refunded';
        if (refundId) payment.refundId = refundId;
        await payment.save();
        if (alreadyRefunded) continue;
        await payment.populate(['user', 'course']);
        await syncEnrollmentFromPayment(payment);
        await reverseInstallmentPayment(payment);
    }
    return payments;
}

/** Only a full refund closes the fee; a partial refund is left for an admin to review. */
async function handleRefundedCharge(charge, refundId, log) {
    const paymentIntentId =
        typeof charge?.payment_intent === 'string' ? charge.payment_intent : charge?.payment_intent?.id;
    if (!paymentIntentId) return;
    if (!isChargeFullyRefunded(charge)) {
        log.warn('Stripe partial refund ignored; review the payment manually', { paymentIntentId });
        return;
    }
    await markPaymentsRefunded({ stripePaymentIntentId: paymentIntentId }, refundId);
}

module.exports = async (req, res) => {
    if (!stripe) {
        return res.status(503).send('Stripe is not configured');
    }
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!endpointSecret) {
        (req.log || logger).error('STRIPE_WEBHOOK_SECRET is not set');
        return res.status(500).send('Webhook not configured');
    }

    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        (req.log || logger).error('Webhook signature verification failed', { errorMessage: err.message });
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const log = req.log || logger;

    let claim;
    try {
        claim = await claimWebhookEvent(event);
    } catch (err) {
        log.error('Stripe webhook claim failed', { err });
        return res.status(500).json({ received: false });
    }
    if (claim === 'duplicate') return res.json({ received: true, duplicate: true });
    if (claim === 'busy') return res.status(409).json({ received: false });

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                await fulfillStripeCheckoutSession(session);
                break;
            }
            case 'checkout.session.expired':
            case 'checkout.session.async_payment_failed': {
                const session = event.data.object;
                await updateActivePayment(
                    { transactionId: session.id, status: { $in: FAILABLE_PAYMENT_STATUSES } },
                    {
                        status: 'failed',
                        failureReason:
                            event.type === 'checkout.session.async_payment_failed'
                                ? 'Async payment failed'
                                : 'Checkout session expired',
                    }
                );
                if (session?.id) {
                    await BillingCheckoutIntent.updateMany(
                        { stripeSessionId: session.id, status: 'open' },
                        { $set: { status: 'abandoned' } }
                    );
                }
                if (session?.metadata?.groupId) {
                    await BillingCheckoutIntent.updateMany(
                        { groupId: session.metadata.groupId, status: 'open' },
                        { $set: { status: 'abandoned' } }
                    );
                }
                break;
            }
            case 'payment_intent.succeeded': {
                const intent = event.data.object;
                if (String(intent?.metadata?.autoPay || '') === '1') {
                    const { settleAutoPayPaymentIntent } = require('../services/billingAutoPay');
                    await settleAutoPayPaymentIntent(intent);
                }
                break;
            }
            case 'payment_intent.payment_failed': {
                const intent = event.data.object;
                const msg = intent.last_payment_error?.message || 'Payment failed';
                await updateActivePayment(
                    { stripePaymentIntentId: intent.id, status: { $in: FAILABLE_PAYMENT_STATUSES } },
                    { status: 'failed', failureReason: msg }
                );
                if (String(intent?.metadata?.autoPay || '') === '1') {
                    const { noteAutoPayStripeFailure } = require('../services/billingAutoPay');
                    await noteAutoPayStripeFailure(intent);
                }
                break;
            }
            case 'charge.refunded': {
                const charge = event.data.object;
                const latestRefundId =
                    Array.isArray(charge.refunds?.data) && charge.refunds.data.length
                        ? charge.refunds.data[0]?.id
                        : undefined;
                await handleRefundedCharge(charge, latestRefundId, log);
                break;
            }
            case 'refund.created': {
                const refund = event.data.object;
                const chargeId = typeof refund.charge === 'string' ? refund.charge : refund.charge?.id;
                if (!chargeId) {
                    log.warn('Stripe refund event has no charge; skipped', { refundId: refund.id });
                    break;
                }
                const charge = await stripe.charges.retrieve(chargeId);
                await handleRefundedCharge(charge, refund.id, log);
                break;
            }
            default:
                log.info('Stripe webhook unhandled event type', { eventType: event.type });
        }
    } catch (err) {
        log.error('Stripe webhook handler error', { err });
        await releaseWebhookEvent(event.id).catch(() => {});
        return res.status(500).json({ received: false });
    }

    await completeWebhookEvent(event.id).catch((err) => {
        log.error('Stripe webhook could not mark event done', { err });
    });
    res.json({ received: true });
};
