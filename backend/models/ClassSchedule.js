const mongoose = require('mongoose');

const classScheduleSchema = new mongoose.Schema(
    {
        course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
        teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        dayOfWeek: { type: Number, min: 0, max: 6, required: true },
        startTime: { type: String, required: true, trim: true },
        endTime: { type: String, required: true, trim: true },
        timezone: { type: String, default: 'UTC', trim: true },
        roomOrLink: { type: String, default: '', trim: true },
    },
    { timestamps: true }
);

classScheduleSchema.index({ course: 1, dayOfWeek: 1, startTime: 1 });

module.exports = mongoose.model('ClassSchedule', classScheduleSchema);
