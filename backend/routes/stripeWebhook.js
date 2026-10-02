const stripe = process.env.STRIPE_SECRET_KEY
    ? require('stripe')(process.env.STRIPE_SECRET_KEY)
    : null;
const Payment = require('../models/Payment');
const logger = require('../utils/logger');
const { syncEnrollmentFromPayment } = require('../services/enrollmentPaymentSync');
const { fulfillStripeCheckoutSession } = require('../services/stripeCheckoutFulfillment');
const BillingCheckoutIntent = require('../models/BillingCheckoutIntent');
const { activePaymentFilter } = require('../utils/paymentQuery');

async function updateActivePayment(query, update, options = {}) {
    return Payment.findOneAndUpdate({ ...query, ...activePaymentFilter() }, update, options);
}

async function markPaymentsRefunded(query, refundId) {
    const payments = await Payment.find({ ...query, ...activePaymentFilter() });
    for (const payment of payments) {
        payment.status = 'refunded';
        if (refundId) payment.refundId = refundId;
        await payment.save();
        await payment.populate(['user', 'course']);
        await syncEnrollmentFromPayment(payment);
    }
    return payments;
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
                    { transactionId: session.id },
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
            case 'payment_intent.payment_failed': {
                const intent = event.data.object;
                const msg = intent.last_payment_error?.message || 'Payment failed';
                await updateActivePayment(
                    { stripePaymentIntentId: intent.id },
                    { status: 'failed', failureReason: msg }
                );
                break;
            }
            case 'charge.refunded': {
                const charge = event.data.object;
                const paymentIntentId =
                    typeof charge.payment_intent === 'string'
                        ? charge.payment_intent
                        : charge.payment_intent?.id;
                const latestRefundId =
                    Array.isArray(charge.refunds?.data) && charge.refunds.data.length
                        ? charge.refunds.data[0]?.id
                        : undefined;

                if (paymentIntentId) {
                    await markPaymentsRefunded(
                        { stripePaymentIntentId: paymentIntentId },
                        latestRefundId
                    );
                }
                break;
            }
            case 'refund.created': {
                const refund = event.data.object;
                const paymentIntentId =
                    typeof refund.payment_intent === 'string'
                        ? refund.payment_intent
                        : refund.payment_intent?.id;

                if (paymentIntentId) {
                    await markPaymentsRefunded(
                        { stripePaymentIntentId: paymentIntentId },
                        refund.id
                    );
                }
                break;
            }
            default:
                (req.log || logger).info('Stripe webhook unhandled event type', { eventType: event.type });
        }
    } catch (err) {
        (req.log || logger).error('Stripe webhook handler error', { err });
        return res.status(500).json({ received: false, error: err.message });
    }

    res.json({ received: true });
};
