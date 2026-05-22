const mongoose = require('mongoose');

const instituteHolidaySchema = new mongoose.Schema(
    {
        date: { type: Date, required: true },
        label: { type: String, default: 'Official holiday' },
        type: { type: String, enum: ['holiday', 'weekend_override'], default: 'holiday' },
    },
    { timestamps: true }
);

instituteHolidaySchema.index({ date: 1 }, { unique: true });

module.exports = mongoose.model('InstituteHoliday', instituteHolidaySchema);
