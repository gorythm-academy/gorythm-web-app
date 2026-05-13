const stripe = process.env.STRIPE_SECRET_KEY
    ? require('stripe')(process.env.STRIPE_SECRET_KEY)
    : null;
const Payment = require('../models/Payment');
const Course = require('../models/Course');
const User = require('../models/User');
const logger = require('../utils/logger');

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
                if (session.payment_status !== 'paid') {
                    break;
                }
                const piId =
                    typeof session.payment_intent === 'string'
                        ? session.payment_intent
                        : session.payment_intent?.id;

                const stripePhone = session.customer_details?.phone || null;
                const metaPhone = session.metadata?.phone ? String(session.metadata.phone).trim() : '';
                const resolvedPhone =
                    (stripePhone && String(stripePhone).trim()) || metaPhone || undefined;

                const update = {
                    status: 'completed',
                    paymentMethod: session.payment_method_types?.[0] || 'card',
                };
                if (piId) update.stripePaymentIntentId = piId;
                if (resolvedPhone) update.phone = resolvedPhone;

                await Payment.findOneAndUpdate({ transactionId: session.id }, update);

                const payment = await Payment.findOne({ transactionId: session.id })
                    .populate('user')
                    .populate('course');

                if (payment?.user?._id && payment?.course?._id) {
                    await User.findByIdAndUpdate(payment.user._id, {
                        $addToSet: { enrolledCourses: payment.course._id },
                    });
                    await Course.findByIdAndUpdate(payment.course._id, {
                        $addToSet: { students: payment.user._id },
                    });
                }
                break;
            }
            case 'checkout.session.expired':
            case 'checkout.session.async_payment_failed': {
                const session = event.data.object;
                await Payment.findOneAndUpdate(
                    { transactionId: session.id },
                    {
                        status: 'failed',
                        failureReason:
                            event.type === 'checkout.session.async_payment_failed'
                                ? 'Async payment failed'
                                : 'Checkout session expired',
                    }
                );
                break;
            }
            case 'payment_intent.payment_failed': {
                const intent = event.data.object;
                const msg = intent.last_payment_error?.message || 'Payment failed';
                await Payment.findOneAndUpdate(
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
                    await Payment.findOneAndUpdate(
                        { stripePaymentIntentId: paymentIntentId },
                        {
                            status: 'refunded',
                            ...(latestRefundId ? { refundId: latestRefundId } : {}),
                        }
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
                    await Payment.findOneAndUpdate(
                        { stripePaymentIntentId: paymentIntentId },
                        {
                            status: 'refunded',
                            ...(refund.id ? { refundId: refund.id } : {}),
                        }
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
