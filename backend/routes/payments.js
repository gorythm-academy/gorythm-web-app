const express = require('express');
const router = express.Router();
//const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_demo_key');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Payment = require('../models/Payment');
const Course = require('../models/Course');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// Get all payments
router.get('/', async (req, res) => {
    try {
        const payments = await Payment.find()
            .populate('user', 'name email')
            .populate('course', 'title')
            .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            payments: payments
        });
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch payments' });
    }
});

// Create Stripe checkout session
router.post('/create-checkout', async (req, res) => {
    try {
        const { courseId, userId } = req.body;
        
        // Get course details
        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }
        
        // Get user details
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        // Create Stripe session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: course.title,
                        description: course.description,
                    },
                    unit_amount: course.price * 100, // Convert to cents
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/payment-cancel`,
            metadata: {
                courseId: courseId,
                userId: userId
            }
        });
        
        // Create pending payment record
        const payment = new Payment({
            user: userId,
            course: courseId,
            amount: course.price,
            currency: 'USD',
            status: 'pending',
            paymentMethod: 'stripe',
            transactionId: session.id
        });
        
        await payment.save();
        
        res.json({
            success: true,
            sessionId: session.id,
            url: session.url
        });
        
    } catch (error) {
        console.error('Stripe error:', error);
        res.status(500).json({ success: false, error: 'Payment initialization failed' });
    }
});

// Stripe webhook handler
router.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            
            // Update payment status
            await Payment.findOneAndUpdate(
                { transactionId: session.id },
                { 
                    status: 'completed',
                    paymentMethod: session.payment_method_types[0]
                }
            );
            
            // Enroll user in course
            const payment = await Payment.findOne({ transactionId: session.id })
                .populate('user')
                .populate('course');
            
            if (payment && payment.user && payment.course) {
                // Add course to user's enrolled courses
                await User.findByIdAndUpdate(payment.user._id, {
                    $addToSet: { enrolledCourses: payment.course._id }
                });
                
                // Add user to course's students
                await Course.findByIdAndUpdate(payment.course._id, {
                    $addToSet: { students: payment.user._id }
                });
            }
            break;
            
        case 'checkout.session.expired':
            const expiredSession = event.data.object;
            await Payment.findOneAndUpdate(
                { transactionId: expiredSession.id },
                { status: 'failed' }
            );
            break;
            
        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
});

// Refund payment
router.post('/:id/refund', async (req, res) => {
    if (!['accountant', 'admin', 'super-admin'].includes(req.user?.role)) {
        return res.status(403).json({ success: false, error: 'Forbidden: insufficient role' });
    }
    try {
        const payment = await Payment.findById(req.params.id);
        
        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }
        
        if (payment.status !== 'completed') {
            return res.status(400).json({ success: false, error: 'Only completed payments can be refunded' });
        }
        
        // Create Stripe refund
        const refund = await stripe.refunds.create({
            payment_intent: payment.transactionId,
        });
        
        // Update payment status
        payment.status = 'refunded';
        payment.refundId = refund.id;
        await payment.save();
        
        res.json({
            success: true,
            message: 'Refund processed successfully',
            refundId: refund.id
        });
        
    } catch (error) {
        console.error('Refund error:', error);
        res.status(500).json({ success: false, error: 'Refund failed' });
    }
});

module.exports = router;