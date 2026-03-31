const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const courseRoutes = require('./routes/courses');
const enrollmentsRoute = require('./routes/enrollments');
const paymentRoutes = require('./routes/payments');
const analyticsRoutes = require('./routes/analytics');
const settingsRoutes = require('./routes/settings');
const blogCommentRoutes = require('./routes/blogComments');
const contactRoutes = require('./routes/contact');

const app = express();

// Middleware
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log('✅ MongoDB Connected to:', process.env.MONGODB_URI);
    console.log('📊 Database ready for academy data');
})
.catch(err => {
    console.log('❌ MongoDB Connection Error:', err.message);
    console.log('⚠️ Using mock data mode');
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/payments', paymentRoutes); 
app.use('/api/enrollments', enrollmentsRoute);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin/settings', settingsRoutes);
app.use('/api/blog', blogCommentRoutes);
app.use('/api/contact', contactRoutes);

// Health check
app.get('/health', (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    res.json({ 
        status: 'ok',
        service: 'Gorythm Academy API',
        version: '1.0.0',
        database: dbStatus,
        timestamp: new Date().toISOString(),
        endpoints: [
    'GET  /health',
    'POST /api/auth/login',
    'GET  /api/admin/dashboard',
    'GET  /api/courses',
    'POST /api/courses',
    'PATCH /api/courses/:id/status',
    'DELETE /api/courses/:id',  
    'GET  /api/payments',
    'POST /api/payments/create-checkout',
    'POST /api/payments/webhook',
    'POST /api/payments/:id/refund'
      ]
    });
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 GORYTHM ACADEMY BACKEND STARTED');
    console.log('='.repeat(50));
    console.log(`📍 Port: ${PORT}`);
    console.log(`📁 Database: ${process.env.MONGODB_URI}`);
    console.log(`🌐 Frontend: http://localhost:3000`);
    console.log(`🔐 Admin Login: http://localhost:3000/admin/login`);
    console.log(`📊 API Health: http://localhost:5000/health`);
    console.log('='.repeat(50) + '\n');
});