/**
 * One-time: permanently remove a duplicate super-admin (not the canonical account).
 * Usage: node scripts/removeExtraSuperAdmin.js syed@gorythmacademy.com
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const {
    getCanonicalSuperAdminEmail,
    isProtectedSuperAdmin,
} = require('../utils/protectedSuperAdmin');
const logger = require('../utils/logger');

const targetEmail = String(process.argv[2] || 'syed@gorythmacademy.com').trim().toLowerCase();

async function main() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not set in backend/.env');
    }
    if (targetEmail === getCanonicalSuperAdminEmail()) {
        throw new Error('Refusing to delete the canonical super-admin account');
    }

    await mongoose.connect(process.env.MONGODB_URI, { dbName: 'gorythm_academy' });

    const user = await User.findOne({ email: targetEmail });
    if (!user) {
        logger.info('No user found for email', { email: targetEmail });
        return;
    }
    if (isProtectedSuperAdmin(user)) {
        throw new Error('Refusing to delete protected super-admin');
    }

    await User.findByIdAndDelete(user._id);
    logger.info('Removed super-admin user', { email: targetEmail, id: user._id.toString() });
}

main()
    .catch((err) => {
        logger.error(err.message || String(err));
        process.exitCode = 1;
    })
    .finally(async () => {
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }
    });
