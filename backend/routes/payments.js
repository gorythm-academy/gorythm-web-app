const express = require('express');
const { deleteProofFile } = require('../services/trashCleanup');
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
const { validateSessionUser } = require('../middleware/validateSessionUser');
const { allowPermission } = require('../middleware/authorize');
const logger = require('../utils/logger');
const { validate, rules } = require('../middleware/validate');
const { paymentRegisterRateLimiter } = require('../middleware/publicWriteRateLimit');
const { fulfillStripeCheckoutSession } = require('../services/stripeCheckoutFulfillment');
const { serializePayment, serializePayments } = require('../utils/serializePayment');
const { ensureProofDir, proofPublicPath, PROOF_DIR } = require('../utils/paymentProofStorage');
const { resolveStoredFilename } = require('../utils/safeFilename');
const { activePaymentFilter, trashedPaymentFilter, activePaymentListFilter } = require('../utils/paymentQuery');
const { activeCourseFilter } = require('../utils/courseQuery');

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
              cb(null, PROOF_DIR);
          },
          filename: (_req, file, cb) => {
              try {
                  const name = resolveStoredFilename({
                      destDir: PROOF_DIR,
                      originalName: file.originalname,
                      publicPathFor: proofPublicPath,
                  });
                  cb(null, name);
              } catch (err) {
                  cb(err);
              }
          },
      })
    : null;

const proofUpload = proofStorage
    ? multer({
          storage: proofStorage,
          limits: { fileSize: 1024 * 1024 },
          fileFilter: (_req, file, cb) => {
              const allowed = new Set([
                  'image/jpeg',
                  'image/png',
                  'image/webp',
                  'application/pdf',
              ]);
              if (allowed.has(file.mimetype)) return cb(null, true);
              cb(new Error('Use JPG, PNG, WebP, or PDF for payment proof.'));
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

const canManagePaymentConfig = (role) =>
    ['accountant', 'manager', 'super-admin'].includes(role);

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

// --- Public: bank transfer — single submit with proof (no DB row until proof is saved) ---
router.post('/register-bank', paymentRegisterRateLimiter, (req, res) => {
    if (!proofUpload) {
        return res.status(503).json({ success: false, error: 'File upload is not available on the server.' });
    }
    proofUpload.single('file')(req, res, async (err) => {
        if (err) {
            const tooLarge = err.code === 'LIMIT_FILE_SIZE';
            return res.status(400).json({
                success: false,
                error: tooLarge
                    ? 'Payment proof must be 1 MB or smaller. Use a smaller screenshot or compress your PDF.'
                    : err.message || 'Upload failed',
            });
        }

        let savedProofPath = null;
        try {
            const studentName = String(req.body?.studentName || '').trim();
            const email = String(req.body?.email || '').trim().toLowerCase();
            const courseName = String(req.body?.courseName || '').trim();
            const bankDigits = String(req.body?.phone || '').replace(/\D/g, '');

            if (!studentName || !email || !courseName) {
                return res.status(400).json({
                    success: false,
                    error: 'studentName, email, and courseName are required',
                });
            }
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'Payment proof screenshot or PDF is required',
                });
            }
            if (bankDigits.length < 8 || bankDigits.length > 15) {
                return res.status(400).json({
                    success: false,
                    error: 'Enter a valid phone number with 8 to 15 digits',
                });
            }

            const { assertPersonalRegistrationEmail } = require('../services/registrationEmailGuard');
            const emailGuard = await assertPersonalRegistrationEmail(email);
            if (!emailGuard.ok) {
                return res.status(400).json({
                    success: false,
                    code: emailGuard.code,
                    error: emailGuard.error,
                });
            }

            const course = await Course.findOne({
                title: {
                    $regex: new RegExp(
                        `^${courseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
                        'i'
                    ),
                },
                isPublished: true,
                ...activeCourseFilter(),
            }).select('_id title price');

            if (!course) {
                return res.status(400).json({
                    success: false,
                    error: 'Course not found or is not available for registration',
                });
            }

            const coursePrice = Number(course.price);
            if (Number.isNaN(coursePrice) || coursePrice <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'This course has no payable amount. Contact us to enroll.',
                });
            }

            const duplicateBlock = await getDuplicateCoursePaymentBlock(email, {
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

            const existingAwaiting = await Payment.findOne({
                ...activePaymentFilter(),
                email,
                course: course._id,
                paymentMethod: 'bank',
                status: 'awaiting_review',
            }).select('_id');

            if (existingAwaiting) {
                return res.status(400).json({
                    success: false,
                    error: 'A bank transfer for this course is already awaiting review. Contact the academy if you need help.',
                });
            }

            savedProofPath = proofPublicPath(req.file.filename);

            const payment = new Payment({
                studentName,
                email,
                phone: bankDigits,
                courseName: course.title,
                course: course._id,
                amount: coursePrice,
                currency: 'USD',
                status: 'awaiting_review',
                paymentMethod: 'bank',
                transactionId: `bank_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
                proofUrl: savedProofPath,
                proofSubmittedAt: new Date(),
            });

            await payment.save();
            savedProofPath = null;

            return res.status(201).json({
                success: true,
                message:
                    'Payment proof received. Our accountant will verify your transfer and confirm enrollment.',
                payment: {
                    _id: payment._id,
                    transactionId: payment.transactionId,
                    amount: payment.amount,
                    currency: payment.currency,
                    status: payment.status,
                },
            });
        } catch (error) {
            if (savedProofPath) {
                deleteProofFile(savedProofPath);
            }
            req.log?.error('Bank registration with proof failed', { err: error });
            return res.status(500).json({ success: false, error: 'Failed to submit bank payment' });
        }
    });
});

// --- Public: Stripe Checkout (cards, Link, Apple Pay / Google Pay via card when enabled in Dashboard) ---
router.post(
    '/create-checkout',
    validate([rules.objectId('courseId', 'Course ID')]),
    async (req, res) => {
    if (!requireStripe(res)) return;
    try {
        const { courseId, userId } = req.body || {};

        if (!courseId) {
            return res.status(400).json({
                success: false,
                error: 'courseId is required',
            });
        }

        const course = await Course.findOne({
            _id: String(courseId),
            isPublished: true,
            ...activeCourseFilter(),
        });
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

        const sessionParams = {
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
                ...(linkedUserId ? { userId: String(linkedUserId) } : {}),
            },
        };

        const session = await createCheckoutSessionWithFallback(sessionParams, paymentMethodTypes);

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
        let payment = null;
        if (session.payment_status === 'paid') {
            payment = await fulfillStripeCheckoutSession(session);
        } else {
            payment = await Payment.findOne({
                transactionId: sessionId,
                ...activePaymentFilter(),
            })
                .populate('course')
                .populate('user');
        }

        res.json({
            success: true,
            paid: session.payment_status === 'paid' || isPaidStatus(payment?.status),
            paymentStatus: payment?.status || null,
            courseTitle: payment?.course?.title || payment?.courseName || null,
        });
    } catch (error) {
        req.log.error('verify-session failed', { err: error });
        res.status(400).json({ success: false, error: 'Could not verify session' });
    }
});

router.use(authMiddleware);
router.use(validateSessionUser);

router.get('/', allowPermission('payments.read'), async (req, res) => {
    try {
        const trash = req.query.trash === 'true' || req.query.trash === '1';
        const filter = trash ? trashedPaymentFilter() : activePaymentListFilter();
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
            payments: serializePayments(payments),
            trashCount,
        });
    } catch (error) {
        req.log.error('Error fetching payments', { err: error });
        res.status(500).json({ success: false, error: 'Failed to fetch payments' });
    }
});

router.put('/admin/bank-details', allowPermission('payments.write'), async (req, res) => {
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
    if (!['accountant', 'manager', 'super-admin'].includes(req.user?.role)) {
        return res.status(403).json({ success: false, error: 'Forbidden: insufficient role' });
    }
    if (!requireStripe(res)) return;
    try {
        const payment = await Payment.findOne({ _id: req.params.id, ...activePaymentFilter() });

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
    if (!['accountant', 'manager', 'super-admin'].includes(req.user?.role)) {
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
    if (!['accountant', 'manager', 'super-admin'].includes(req.user?.role)) {
        return res.status(403).json({ success: false, error: 'Forbidden: insufficient role' });
    }

    try {
        const payment = await Payment.findOne({
            _id: req.params.id,
            ...trashedPaymentFilter(),
        });

        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment must be in trash before permanent delete' });
        }

        if (payment.proofUrl) {
            deleteProofFile(payment.proofUrl);
        }

        await Payment.deleteOne({ _id: payment._id });

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
    if (!['accountant', 'manager', 'super-admin'].includes(req.user?.role)) {
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
