const express = require('express');
const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');
const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY
    ? require('stripe')(process.env.STRIPE_SECRET_KEY)
    : null;
const Payment = require('../models/Payment');
const Course = require('../models/Course');
const User = require('../models/User');
const { syncEnrollmentFromPayment } = require('../services/enrollmentPaymentSync');
const { onPaymentPaid, isPaidStatus } = require('../services/onPaymentPaid');
const { getDuplicateCoursePaymentBlock } = require('../services/enrollmentDuplicateCheck');
const { getOrCreateSettings } = require('../services/settingsService');
const authMiddleware = require('../middleware/auth');
const { allowPermission } = require('../middleware/authorize');
const logger = require('../utils/logger');
const { validate, rules } = require('../middleware/validate');
const { ensureProofDir, proofPublicPath } = require('../utils/paymentProofStorage');
const { activePaymentFilter, trashedPaymentFilter } = require('../utils/paymentQuery');

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
              cb(null, path.join(__dirname, '..', 'uploads', 'payment-proofs'));
          },
          filename: (_req, file, cb) => {
              const safe = String(file.originalname || 'proof')
                  .replace(/[^a-zA-Z0-9._-]/g, '_')
                  .slice(0, 60);
              cb(null, `${Date.now()}-${safe}`);
          },
      })
    : null;

const proofUpload = proofStorage
    ? multer({
          storage: proofStorage,
          limits: { fileSize: 12 * 1024 * 1024 },
          fileFilter: (_req, file, cb) => {
              const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
              if (allowed.has(file.mimetype)) return cb(null, true);
              cb(new Error('Use JPG, PNG, or PDF for payment proof.'));
          },
      })
    : null;

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

const canManagePaymentConfig = (role) => ['accountant', 'admin', 'super-admin'].includes(role);

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
        const { assertPersonalRegistrationEmail } = require('../services/registrationEmailGuard');
        const emailGuard = await assertPersonalRegistrationEmail(normalizedEmail);
        if (!emailGuard.ok) {
            return res.status(400).json({
                success: false,
                code: emailGuard.code,
                error: emailGuard.error,
            });
        }

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

        const course = await Course.findOne({
            title: { $regex: new RegExp(`^${normalizedCourseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        }).select('_id title');

        const duplicateBlock = await getDuplicateCoursePaymentBlock(normalizedEmail, {
            courseId: course?._id,
            courseName: normalizedCourseName,
        });
        if (duplicateBlock.blocked) {
            return res.status(400).json({
                success: false,
                code: duplicateBlock.code,
                error: duplicateBlock.error,
            });
        }

        const existingPending = await Payment.findOne({
            email: normalizedEmail,
            courseName: normalizedCourseName,
            paymentMethod: 'bank',
            status: { $in: ['pending', 'awaiting_review'] },
        }).sort({ createdAt: -1 });

        if (existingPending) {
            if (!existingPending.uploadToken) {
                existingPending.uploadToken = crypto.randomBytes(24).toString('hex');
                await existingPending.save();
            }
            return res.json({
                success: true,
                message: 'You already have a pending bank transfer for this course. Use the reference below to pay and upload proof.',
                payment: {
                    _id: existingPending._id,
                    transactionId: existingPending.transactionId,
                    amount: existingPending.amount,
                    currency: existingPending.currency,
                    status: existingPending.status,
                    uploadToken: existingPending.uploadToken,
                    proofUrl: existingPending.proofUrl || '',
                },
            });
        }

        const uploadToken = crypto.randomBytes(24).toString('hex');
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
            uploadToken,
        });

        await payment.save();

        res.json({
            success: true,
            message: 'Registration saved. Transfer the fee using the bank details and reference, then upload your payment proof.',
            payment: {
                _id: payment._id,
                transactionId: payment.transactionId,
                amount: payment.amount,
                currency: payment.currency,
                status: payment.status,
                uploadToken: payment.uploadToken,
            },
        });
    } catch (error) {
        req.log.error('Error storing bank registration', { err: error });
        res.status(500).json({ success: false, error: 'Failed to save registration' });
    }
});

// --- Public: upload bank transfer proof (scoped by payment id + upload token) ---
router.post('/:id/proof', (req, res) => {
    if (!proofUpload) {
        return res.status(503).json({ success: false, error: 'File upload is not available on the server.' });
    }
    proofUpload.single('file')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ success: false, error: err.message || 'Upload failed' });
        }
        try {
            const paymentId = req.params.id;
            const uploadToken = String(req.body?.uploadToken || '').trim();
            if (!mongoose.Types.ObjectId.isValid(paymentId)) {
                return res.status(400).json({ success: false, error: 'Invalid payment id' });
            }
            if (!uploadToken) {
                return res.status(400).json({ success: false, error: 'uploadToken is required' });
            }
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No file uploaded' });
            }

            const payment = await Payment.findById(paymentId);
            if (!payment || payment.paymentMethod !== 'bank') {
                return res.status(404).json({ success: false, error: 'Payment not found' });
            }
            if (payment.uploadToken !== uploadToken) {
                return res.status(403).json({ success: false, error: 'Invalid upload token' });
            }
            if (isPaidStatus(payment.status)) {
                return res.status(400).json({ success: false, error: 'This payment is already confirmed' });
            }
            if (payment.status === 'rejected') {
                return res.status(400).json({
                    success: false,
                    error: 'This payment was rejected. Submit a new bank transfer registration.',
                });
            }

            payment.proofUrl = proofPublicPath(req.file.filename);
            payment.proofSubmittedAt = new Date();
            payment.status = 'awaiting_review';
            await payment.save();

            res.json({
                success: true,
                message: 'Payment proof received. Our accountant will verify and confirm your payment.',
                payment: {
                    _id: payment._id,
                    status: payment.status,
                    proofUrl: payment.proofUrl,
                },
            });
        } catch (error) {
            req.log?.error('Payment proof upload failed', { err: error });
            res.status(500).json({ success: false, error: 'Failed to save payment proof' });
        }
    });
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

        const normalizedEmail = String(email).trim().toLowerCase();
        const { assertPersonalRegistrationEmail } = require('../services/registrationEmailGuard');
        const emailGuard = await assertPersonalRegistrationEmail(normalizedEmail);
        if (!emailGuard.ok) {
            return res.status(400).json({
                success: false,
                code: emailGuard.code,
                error: emailGuard.error,
            });
        }

        const duplicateBlock = await getDuplicateCoursePaymentBlock(normalizedEmail, {
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
        let payment = await Payment.findOne({ transactionId: sessionId }).populate('course').populate('user');

        if (session.payment_status === 'paid' && payment && !isPaidStatus(payment.status)) {
            payment.status = 'paid';
            const piId =
                typeof session.payment_intent === 'string'
                    ? session.payment_intent
                    : session.payment_intent?.id;
            if (piId) payment.stripePaymentIntentId = piId;
            await payment.save();
            await payment.populate(['user', 'course']);
            await onPaymentPaid(payment);
        }

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
        const trash = req.query.trash === 'true' || req.query.trash === '1';
        const filter = trash ? trashedPaymentFilter() : activePaymentFilter();
        const sort = trash ? { deletedAt: -1 } : { createdAt: -1 };

        const [payments, trashCount] = await Promise.all([
            Payment.find(filter)
                .populate('user', 'name email')
                .populate('course', 'title')
                .sort(sort),
            Payment.countDocuments(trashedPaymentFilter()),
        ]);

        res.json({
            success: true,
            payments,
            trashCount,
        });
    } catch (error) {
        req.log.error('Error fetching payments', { err: error });
        res.status(500).json({ success: false, error: 'Failed to fetch payments' });
    }
});

router.put('/admin/bank-details', allowPermission('payments.read'), async (req, res) => {
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

        if (!isPaidStatus(payment.status)) {
            return res.status(400).json({ success: false, error: 'Only paid payments can be refunded' });
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

        const { syncEnrollmentFromPayment } = require('../services/enrollmentPaymentSync');
        await payment.populate(['user', 'course']);
        await syncEnrollmentFromPayment(payment);

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

router.patch('/:id/restore', allowPermission('payments.write'), async (req, res) => {
    if (!['accountant', 'admin', 'super-admin'].includes(req.user?.role)) {
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
    if (!['accountant', 'admin', 'super-admin'].includes(req.user?.role)) {
        return res.status(403).json({ success: false, error: 'Forbidden: insufficient role' });
    }

    try {
        const deletedPayment = await Payment.findOneAndDelete({
            _id: req.params.id,
            ...trashedPaymentFilter(),
        });

        if (!deletedPayment) {
            return res.status(404).json({ success: false, error: 'Payment must be in trash before permanent delete' });
        }

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
    if (!['accountant', 'admin', 'super-admin'].includes(req.user?.role)) {
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
