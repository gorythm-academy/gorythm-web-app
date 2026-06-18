const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const courseRoutes = require('./routes/courses');
const courseImageRoutes = require('./routes/courseImages');
const enrollmentsRoute = require('./routes/enrollments');
const paymentRoutes = require('./routes/payments');
const stripeWebhookHandler = require('./routes/stripeWebhook');
const analyticsRoutes = require('./routes/analytics');
const blogCommentRoutes = require('./routes/blogComments');
const researchCommentRoutes = require('./routes/researchComments');
const { publicRouter: researchPublicRoutes, adminRouter: researchAdminRoutes } = require('./routes/research');
const researchImageRoutes = require('./routes/researchImages');
const adminResearchCommentRoutes = require('./routes/adminResearchComments');
const contactRoutes = require('./routes/contact');
const subscriberRoutes = require('./routes/subscribers');
const userRoutes = require('./routes/users');
const portalRoutes = require('./routes/portal');
const lmsAdminRoutes = require('./routes/lmsAdmin');
const uploadRoutes = require('./routes/upload');
const promoVideoRoutes = require('./routes/promoVideos');
const promoVideoAdminRoutes = require('./routes/promoVideos').adminRouter;
const payrollRoutes = require('./routes/payroll');
const { authRateLimiter } = require('./middleware/security');
const { protectedUploadsGate } = require('./middleware/protectedUploads');
const requestContext = require('./middleware/requestContext');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const User = require('./models/User');
const { ensureAllCategoryDirs } = require('./utils/uploadStorage');
const { ensureImageDir } = require('./utils/researchImageStorage');
const { ensureProofDir } = require('./utils/paymentProofStorage');
const { ensureImageDir: ensureCourseImageDir } = require('./utils/courseImageStorage');
const { ensureThumbDir } = require('./utils/promoThumbnailStorage');

const app = express();

// Behind nginx / ALB, proxies send X-Forwarded-For. Express must trust them so req.ip and
// express-rate-limit see the real client IP (avoids ERR_ERL_UNEXPECTED_X_FORWARDED_FOR).
// Default: 1 hop. Set TRUST_PROXY=2 if you have e.g. load balancer + nginx; TRUST_PROXY=0 only when
// Node is reached directly with no reverse proxy.
(function applyTrustProxy() {
    const raw = process.env.TRUST_PROXY;
    if (raw === '0' || raw === 'false') {
        app.set('trust proxy', false);
        return;
    }
    if (raw != null && String(raw).trim() !== '') {
        const n = parseInt(raw, 10);
        app.set('trust proxy', Number.isFinite(n) && n >= 0 ? n : 1);
        return;
    }
    app.set('trust proxy', 1);
})();

const ensureDefaultAdmin = async () => {
    try {
        const migrated = await User.updateMany({ role: 'admin' }, { $set: { role: 'manager' } });
        if (migrated.modifiedCount > 0) {
            logger.info('Migrated admin role to manager', { count: migrated.modifiedCount });
        }

        const rawEmail = process.env.DEFAULT_ADMIN_EMAIL;
        if (!rawEmail || !String(rawEmail).trim()) {
            logger.info('DEFAULT_ADMIN_EMAIL not set; skipping default admin seed');
            return;
        }
        const adminEmail = String(rawEmail).toLowerCase().trim();
        const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
        const existing = await User.findOne({ email: adminEmail });
        if (existing) return;

        await User.create({
            name: process.env.DEFAULT_ADMIN_NAME || 'Default Admin',
            email: adminEmail,
            password: adminPassword,
            role: 'super-admin',
            isActive: true,
            canLogin: true,
            mustChangePassword: false,
            isSystemAccount: true,
        });
        logger.info('Default admin created', { adminEmail });
    } catch (error) {
        logger.warn('Failed to ensure default admin', { err: error });
    }
};

// Middleware
const allowedOrigins = new Set([
    'http://localhost:3000',
    'https://gorythmacademy.com',
    'https://www.gorythmacademy.com',
    process.env.FRONTEND_URL,
].filter(Boolean));

app.use(cors({
    origin: (origin, callback) => {
        // Allow server-to-server/curl requests that have no Origin header.
        if (!origin) return callback(null, true);
        if (allowedOrigins.has(origin)) return callback(null, true);
        return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(
    helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
);
app.use(requestContext);

// MongoDB Connection
const mongoUri = process.env.MONGODB_URI;

let isConnecting = false;

const connectDB = async () => {
    if (mongoose.connection.readyState === 1) return; // already connected
    if (isConnecting) {
        // wait up to 10s for in-progress connection
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 500));
            if (mongoose.connection.readyState === 1) return;
        }
        return;
    }

    if (!mongoUri) {
        logger.error('MONGODB_URI is not set');
        return;
    }

    isConnecting = true;
    try {
        await mongoose.connect(mongoUri, {
            dbName: 'gorythm_academy',
            family: 4,
            serverSelectionTimeoutMS: 15000,
            connectTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
        });
        logger.info('MongoDB connected');
        isConnecting = false;
        ensureDefaultAdmin();
    } catch (err) {
        isConnecting = false;
        logger.error('MongoDB connection error', { err });
    }
};

// Start connecting immediately (warm start)
connectDB();

// Middleware: ensure DB is connected before handling API requests
const DB_BYPASS_PATHS = new Set(['/health', '/api/payments/webhook']);

app.use(async (req, res, next) => {
    if (DB_BYPASS_PATHS.has(req.path)) {
        return next();
    }
    if (mongoose.connection.readyState !== 1) {
        await connectDB();
    }
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({
            success: false,
            error: 'Database unavailable. Please try again shortly.',
        });
    }
    return next();
});

// Stripe webhook must receive raw body (before express.json)
app.post(
    '/api/payments/webhook',
    express.raw({ type: 'application/json' }),
    stripeWebhookHandler
);

app.use(express.json());

const uploadsDir = path.join(__dirname, 'uploads');
ensureAllCategoryDirs();
ensureImageDir();
ensureProofDir();
ensureCourseImageDir();
ensureThumbDir();
app.use('/api/uploads', protectedUploadsGate);
app.use(
    '/api/uploads',
    express.static(uploadsDir, {
        setHeaders(res, filePath) {
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            if (filePath.endsWith('.avif')) res.type('image/avif');
            else if (filePath.endsWith('.webp')) res.type('image/webp');
        },
    })
);

// Routes
app.use('/api/auth', authRateLimiter, authRoutes);
app.use('/api/admin/promo-videos', promoVideoAdminRoutes);
app.use('/api/admin/course-images', courseImageRoutes);
app.use('/api/admin/research', researchAdminRoutes);
app.use('/api/admin/research-images', researchImageRoutes);
app.use('/api/admin/research-comments', adminResearchCommentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/users', userRoutes);
app.use('/api/payments', paymentRoutes); 
app.use('/api/enrollments', enrollmentsRoute);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/blog', blogCommentRoutes);
app.use('/api/research', researchPublicRoutes);
app.use('/api/research', researchCommentRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/subscribers', subscriberRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/lms-admin', lmsAdminRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/promo-videos', promoVideoRoutes);
app.use('/api/payroll', payrollRoutes);

// Health check
app.get('/health', (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    const payload = {
        status: dbStatus === 'connected' ? 'ok' : 'degraded',
        service: 'Gorythm Academy API',
        version: '1.0.0',
        database: dbStatus,
        timestamp: new Date().toISOString(),
        endpoints: [
    'GET  /health',
    'POST /api/auth/login',
    'GET  /api/admin/dashboard',
    'GET  /api/courses',
    'GET  /api/users',
    'POST /api/courses',
    'PATCH /api/courses/:id/status',
    'DELETE /api/courses/:id',  
    'GET  /api/payments',
    'POST /api/payments/create-checkout',
    'GET  /api/payments/verify-session',
    'POST /api/payments/webhook',
    'POST /api/payments/:id/refund'
      ]
    };
    res.status(dbStatus === 'connected' ? 200 : 503).json(payload);
});

// Basic route
app.get('/', (req, res) => {
    res.json({ 
        message: '🎓 Gorythm Academy Backend API',
        version: '1.0.0',
        status: 'running',
        documentation: 'Available endpoints at /health'
    });
});

app.use(notFound);
app.use(errorHandler);

if (require.main === module) {
    const PORT = process.env.PORT || 5000;
    const frontendUrl = process.env.FRONTEND_URL || 'https://gorythmacademy.com';
    app.listen(PORT, () => {
        logger.info('Gorythm Academy backend started', {
            port: PORT,
            hasMongoUri: Boolean(process.env.MONGODB_URI),
            frontendUrl,
            healthUrl: `http://localhost:${PORT}/health`,
            trustProxy: app.get('trust proxy'),
        });
    });
}

module.exports = app;