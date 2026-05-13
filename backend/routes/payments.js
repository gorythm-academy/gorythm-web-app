const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY
    ? require('stripe')(process.env.STRIPE_SECRET_KEY)
    : null;
const Payment = require('../models/Payment');
const Course = require('../models/Course');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { allowPermission } = require('../middleware/authorize');
const logger = require('../utils/logger');
const { validate, rules } = require('../middleware/validate');

const requireStripe = (res) => {
    if (stripe) return true;
    res.status(503).json({
        success: false,
        error: 'Stripe is not configured on this deployment',
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

const createCheckoutSession = async (params) => {
    return stripe.checkout.sessions.create(params);
};

/** If requested payment_method_types fail (e.g. Link not activated), retry with card only. */
const createCheckoutSessionWithFallback = async (baseParams, types) => {
    try {
        return await createCheckoutSession({ ...baseParams, payment_method_types: types });
    } catch (err) {
        const isStripeInvalid =
            err?.type === 'StripeInvalidRequestError' ||
            err?.rawType === 'invalid_request_error';
        const hasOtherTypes = types.length > 1 || (types.length === 1 && types[0] !== 'card');
        if (isStripeInvalid && hasOtherTypes) {
            logger.warn('Stripe checkout retry with card only', { errorMessage: err.message });
            return createCheckoutSession({ ...baseParams, payment_method_types: ['card'] });
        }
        throw err;
    }
};

// --- Public: bank transfer registration (manual verification) ---
router.post(
    '/register-online',
    validate([
        rules.requiredString('studentName', 'Student name'),
        rules.requiredString('email', 'Email'),
        rules.email('email', 'Email'),
        rules.requiredString('courseName', 'Course name'),
        rules.number('amount', 'Amount', { min: 0 }),
    ]),
    async (req, res) => {
    try {
        const { studentName, email, courseName, amount, paymentMethod, phone } = req.body || {};

        if (!studentName || !email || !courseName || amount == null) {
            return res.status(400).json({
                success: false,
                error: 'studentName, email, courseName, and amount are required',
            });
        }

        const method = String(paymentMethod || 'bank').toLowerCase();
        if (method !== 'bank') {
            return res.status(400).json({
                success: false,
                error: 'Only bank transfer registrations are accepted here. Use Stripe for card and digital wallets.',
            });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const normalizedCourseName = String(courseName).trim();
        const bankDigits = phone != null ? String(phone).replace(/\D/g, '') : '';
        const bankPhone =
            bankDigits.length >= 8 && bankDigits.length <= 15 ? bankDigits : undefined;
        const numericAmount = Number(amount);
        if (Number.isNaN(numericAmount) || numericAmount < 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid amount',
            });
        }

        const course = await Course.findOne({ title: normalizedCourseName }).select('_id title');

        const payment = new Payment({
            studentName: String(studentName).trim(),
            email: normalizedEmail,
            phone: bankPhone,
            courseName: normalizedCourseName,
            course: course?._id || undefined,
            amount: numericAmount,
            currency: 'USD',
            status: 'pending',
            paymentMethod: 'bank',
            transactionId: `bank_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
        });

        await payment.save();

        res.json({
            success: true,
            message:
                'Bank transfer request saved. Our team will confirm payment and update your status in the admin dashboard.',
            payment,
        });
    } catch (error) {
        req.log.error('Error storing bank registration', { err: error });
        res.status(500).json({ success: false, error: 'Failed to save registration' });
    }
});

// --- Public: Stripe Checkout (cards, Link, Apple Pay / Google Pay via card when enabled in Dashboard) ---
router.post(
    '/create-checkout',
    validate([
        rules.objectId('courseId', 'Course ID'),
        rules.requiredString('studentName', 'Student name'),
        rules.requiredString('email', 'Email'),
        rules.email('email', 'Email'),
    ]),
    async (req, res) => {
    if (!requireStripe(res)) return;
    try {
        const { courseId, studentName, email, userId, phone } = req.body || {};

        if (!courseId || !studentName || !email) {
            return res.status(400).json({
                success: false,
                error: 'courseId, studentName, and email are required',
            });
        }

        const course = await Course.findById(String(courseId));
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

        let linkedUserId;
        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            const user = await User.findById(userId).select('_id');
            if (user) linkedUserId = user._id;
        }

        const base = frontendBase();
        const paymentMethodTypes = checkoutPaymentMethodTypes();

        const digitsPhone = phone != null ? String(phone).replace(/\D/g, '') : '';
        const normalizedPhone =
            digitsPhone.length >= 8 && digitsPhone.length <= 15 ? digitsPhone : '';

        const sessionParams = {
            customer_email: String(email).trim().toLowerCase(),
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
            metadata: {
                courseId: String(courseId),
                studentName: String(studentName).trim(),
                email: String(email).trim().toLowerCase(),
                ...(normalizedPhone ? { phone: normalizedPhone } : {}),
                ...(linkedUserId ? { userId: String(linkedUserId) } : {}),
            },
        };

        const session = await createCheckoutSessionWithFallback(sessionParams, paymentMethodTypes);

        const payment = new Payment({
            user: linkedUserId,
            course: courseId,
            studentName: String(studentName).trim(),
            phone: normalizedPhone || undefined,
            email: String(email).trim().toLowerCase(),
            courseName: course.title,
            amount: priceUsd,
            currency: 'USD',
            status: 'pending',
            paymentMethod: 'stripe',
            transactionId: session.id,
        });

        await payment.save();

        res.json({
            success: true,
            sessionId: session.id,
            url: session.url,
        });
    } catch (error) {
        req.log.error('Stripe checkout error', { err: error });
        const msg =
            (error?.type === 'StripeInvalidRequestError' || error?.rawType === 'invalid_request_error') &&
            error?.message
                ? error.message
                : error?.message || 'Payment initialization failed';
        res.status(500).json({ success: false, error: msg });
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
        const payment = await Payment.findOne({ transactionId: sessionId })
            .populate('course', 'title')
            .lean();

        res.json({
            success: true,
            paid: session.payment_status === 'paid',
            paymentStatus: payment?.status || null,
            courseTitle: payment?.course?.title || payment?.courseName || null,
        });
    } catch (error) {
        req.log.error('verify-session failed', { err: error });
        res.status(400).json({ success: false, error: 'Could not verify session' });
    }
});

router.use(authMiddleware);

router.get('/', allowPermission('payments.read'), async (req, res) => {
    try {
        const payments = await Payment.find()
            .populate('user', 'name email')
            .populate('course', 'title')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            payments,
        });
    } catch (error) {
        req.log.error('Error fetching payments', { err: error });
        res.status(500).json({ success: false, error: 'Failed to fetch payments' });
    }
});

router.post('/:id/refund', allowPermission('payments.refund'), async (req, res) => {
    if (!['accountant', 'admin', 'super-admin'].includes(req.user?.role)) {
        return res.status(403).json({ success: false, error: 'Forbidden: insufficient role' });
    }
    if (!requireStripe(res)) return;
    try {
        const payment = await Payment.findById(req.params.id);

        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }

        if (payment.status !== 'completed') {
            return res.status(400).json({ success: false, error: 'Only completed payments can be refunded' });
        }

        const intentId =
            payment.stripePaymentIntentId ||
            (payment.transactionId?.startsWith('pi_') ? payment.transactionId : null);

        if (!intentId) {
            return res.status(400).json({
                success: false,
                error: 'No Stripe PaymentIntent on this record; refund is not available.',
            });
        }

        const refund = await stripe.refunds.create({
            payment_intent: intentId,
        });

        payment.status = 'refunded';
        payment.refundId = refund.id;
        await payment.save();

        res.json({
            success: true,
            message: 'Refund processed successfully',
            refundId: refund.id,
        });
    } catch (error) {
        req.log.error('Refund error', { err: error });
        res.status(500).json({ success: false, error: 'Refund failed' });
    }
});

router.delete('/:id', allowPermission('payments.write'), async (req, res) => {
    if (!['accountant', 'admin', 'super-admin'].includes(req.user?.role)) {
        return res.status(403).json({ success: false, error: 'Forbidden: insufficient role' });
    }

    try {
        const deletedPayment = await Payment.findByIdAndDelete(req.params.id);

        if (!deletedPayment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }

        return res.json({
            success: true,
            message: 'Payment deleted successfully',
            paymentId: req.params.id,
        });
    } catch (error) {
        req.log.error('Delete payment error', { err: error });
        res.status(500).json({ success: false, error: 'Failed to delete payment' });
    }
});

module.exports = router;
