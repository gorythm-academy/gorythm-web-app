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
const {
    fulfillStripeCheckoutSession,
    fulfillmentMessage,
} = require('../services/stripeCheckoutFulfillment');
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

// --- Public: single course for checkout (published, not trashed) ---
router.get('/course/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, error: 'Invalid course id' });
        }

        const course = await Course.findOne({
            _id: id,
            isPublished: true,
            ...activeCourseFilter(),
        }).select('_id title price slug');

        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'This course is not open for enrollment.',
            });
        }

        const coursePrice = Number(course.price);
        if (Number.isNaN(coursePrice) || coursePrice <= 0) {
            return res.status(404).json({
                success: false,
                error: 'This course is not open for enrollment.',
            });
        }

        res.json({ success: true, course });
    } catch (error) {
        req.log?.error('Payment course lookup failed', { err: error });
        res.status(500).json({ success: false, error: 'Failed to load course' });
    }
});

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
            const courseIdRaw = String(req.body?.courseId || '').trim();
            const bankDigits = String(req.body?.phone || '').replace(/\D/g, '');

            if (!studentName || !email) {
                return res.status(400).json({
                    success: false,
                    error: 'studentName and email are required',
                });
            }
            if (!courseIdRaw || !mongoose.Types.ObjectId.isValid(courseIdRaw)) {
                return res.status(400).json({
                    success: false,
                    error: 'courseId is required',
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
                _id: courseIdRaw,
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
        const stripePaid = session.payment_status === 'paid';

        if (stripePaid) {
            const result = await fulfillStripeCheckoutSession(session);
            const payment = result?.payment;
            const fulfillmentIssue = result?.fulfillmentIssue || null;

            return res.json({
                success: true,
                paid: stripePaid,
                enrolled: result?.enrolled === true,
                fulfillmentIssue,
                message:
                    fulfillmentIssue === 'already_enrolled_duplicate'
                        ? fulfillmentMessage(fulfillmentIssue)
                        : result?.enrolled === true
                          ? null
                          : fulfillmentMessage(fulfillmentIssue),
                courseTitle: payment?.course?.title || payment?.courseName || null,
            });
        }

        const payment = await Payment.findOne({
            transactionId: sessionId,
            ...activePaymentFilter(),
        })
            .populate('course')
            .populate('user');

        const failureText = String(payment?.failureReason || '').toLowerCase();
        const alreadyEnrolledDuplicate =
            Boolean(payment?.failureReason) && failureText.includes('already enrolled');

        res.json({
            success: true,
            paid: isPaidStatus(payment?.status),
            enrolled: (isPaidStatus(payment?.status) && !payment?.failureReason) || alreadyEnrolledDuplicate,
            fulfillmentIssue: payment?.failureReason
                ? alreadyEnrolledDuplicate
                    ? 'already_enrolled_duplicate'
                    : 'enrollment_failed'
                : null,
            message: alreadyEnrolledDuplicate
                ? fulfillmentMessage('already_enrolled_duplicate')
                : payment?.failureReason || null,
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
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 25));
        const skip = (page - 1) * limit;
        const search = String(req.query.search || '').trim();
        const statusFilter = String(req.query.status || 'all').trim().toLowerCase();
        const dateRange = String(req.query.dateRange || 'all').trim().toLowerCase();
        const sortBy = String(req.query.sortBy || 'date').trim();
        const sortOrder = String(req.query.sortOrder || 'desc').trim().toLowerCase() === 'asc' ? 1 : -1;
        const includeCounts = req.query.includeCounts === 'true' || req.query.includeCounts === '1';
        const includeStats = req.query.includeStats === 'true' || req.query.includeStats === '1';

        const filter = trash ? trashedPaymentFilter() : activePaymentListFilter();

        if (statusFilter && statusFilter !== 'all') {
            if (statusFilter === 'paid') {
                filter.status = { $in: ['paid', 'completed'] };
            } else {
                filter.status = statusFilter;
            }
        }

        if (dateRange === 'today') {
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            filter.createdAt = { $gte: start };
        } else if (dateRange === 'week') {
            const start = new Date();
            start.setDate(start.getDate() - 7);
            filter.createdAt = { $gte: start };
        } else if (dateRange === 'month') {
            const start = new Date();
            start.setMonth(start.getMonth() - 1);
            filter.createdAt = { $gte: start };
        }

        if (search) {
            const regex = { $regex: search, $options: 'i' };
            filter.$or = [
                { studentName: regex },
                { email: regex },
                { courseName: regex },
                { transactionId: regex },
                { phone: regex },
            ];
        }

        const sortFieldMap = {
            date: 'createdAt',
            amount: 'amount',
            status: 'status',
            transactionId: 'transactionId',
        };
        const sortField = sortFieldMap[sortBy] || 'createdAt';
        const sort = { [sortField]: sortOrder };
        if (trash) sort.deletedAt = -1;

        const [payments, total, trashCount, statsAgg] = await Promise.all([
            Payment.find(filter)
                .populate('user', 'name email')
                .populate('course', 'title')
                .sort(sort)
                .skip(skip)
                .limit(limit),
            Payment.countDocuments(filter),
            includeCounts ? Payment.countDocuments(trashedPaymentFilter()) : Promise.resolve(undefined),
            includeStats && !trash
                ? Payment.aggregate([
                    { $match: activePaymentListFilter() },
                    {
                        $group: {
                            _id: '$status',
                            count: { $sum: 1 },
                            revenue: { $sum: '$amount' },
                        },
                    },
                ])
                : Promise.resolve(null),
        ]);

        let stats;
        if (statsAgg) {
            stats = {
                totalRevenue: 0,
                successfulPayments: 0,
                pendingPayments: 0,
                failedPayments: 0,
                refundedPayments: 0,
            };
            for (const row of statsAgg) {
                const status = String(row._id || '').toLowerCase();
                const count = row.count || 0;
                if (status === 'paid' || status === 'completed') {
                    stats.successfulPayments += count;
                    stats.totalRevenue += row.revenue || 0;
                } else if (status === 'pending') stats.pendingPayments += count;
                else if (status === 'failed') stats.failedPayments += count;
                else if (status === 'refunded') stats.refundedPayments += count;
            }
        }

        res.json({
            success: true,
            payments: serializePayments(payments),
            total,
            page,
            pages: Math.max(1, Math.ceil(total / limit)),
            limit,
            ...(includeCounts ? { trashCount } : {}),
            ...(stats ? { stats } : {}),
        });
    } catch (error) {
        req.log.error('Error fetching payments', { err: error });
        res.status(500).json({ success: false, error: 'Failed to fetch payments' });
    }
});

router.get('/:id/invoice', allowPermission('payments.read'), async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid payment id' });
        }

        const payment = await Payment.findOne({
            _id: req.params.id,
            ...activePaymentFilter(),
        })
            .populate('user', 'name email')
            .populate('course', 'title');

        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }

        const { buildPaymentInvoicePdf } = require('../utils/paymentInvoicePdf');
        const pdfBuffer = buildPaymentInvoicePdf(payment);
        const safeId = String(payment.transactionId || payment._id).replace(/[^a-zA-Z0-9-_]/g, '_');

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="invoice_${safeId}.pdf"`);
        return res.send(pdfBuffer);
    } catch (error) {
        req.log.error('Payment invoice error', { err: error });
        return res.status(500).json({ success: false, error: 'Failed to generate invoice' });
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
