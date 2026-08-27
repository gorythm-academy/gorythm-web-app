const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const logger = require('./logger');

/** One-time-safe migration: pending / missing enrollment & user statuses → inactive. */
async function migrateLegacyPendingStatuses() {
    const [enrollRes, userRes] = await Promise.all([
        Enrollment.updateMany(
            {
                $or: [
                    { status: 'pending' },
                    { status: null },
                    { status: { $exists: false } },
                ],
            },
            { $set: { status: 'inactive' } },
        ),
        User.updateMany(
            { status: 'pending' },
            { $set: { status: 'inactive', isActive: false, canLogin: false } },
        ),
    ]);

    if (enrollRes.modifiedCount > 0 || userRes.modifiedCount > 0) {
        logger.info('Migrated legacy pending statuses', {
            enrollments: enrollRes.modifiedCount,
            users: userRes.modifiedCount,
        });
    }
}

module.exports = { migrateLegacyPendingStatuses };
