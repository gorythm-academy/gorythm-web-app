const mongoose = require('mongoose');

const billingItemSchema = new mongoose.Schema(
    {
        student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
        enrollment: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', default: null },
        studentName: { type: String, default: '' },
        studentEmail: { type: String, default: '' },
        courseName: { type: String, default: '' },
        amount: { type: Number, required: true },
        dueDate: { type: Date, default: null },
        installmentMonths: { type: Number, default: 1, min: 1 },
    },
    { _id: false }
);

const billingCheckoutIntentSchema = new mongoose.Schema(
    {
        groupId: { type: String, required: true, unique: true, index: true },
        invoiceMode: { type: String, enum: ['combined', 'separate'], default: 'combined' },
        payerUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        payerRole: { type: String, enum: ['parent', 'student', 'guest', 'admin'], default: 'guest' },
        payerEmail: { type: String, default: '' },
        payerName: { type: String, default: '' },
        items: { type: [billingItemSchema], default: [] },
        stripeSessionId: { type: String, default: '' },
        autoPayEnable: { type: Boolean, default: false },
        status: {
            type: String,
            enum: ['open', 'consumed', 'abandoned'],
            default: 'open',
        },
        consumedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

billingCheckoutIntentSchema.index({ stripeSessionId: 1 });

module.exports = mongoose.model('BillingCheckoutIntent', billingCheckoutIntentSchema);
