const mongoose = require('mongoose');
const User = require('../models/User');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const logger = require('../utils/logger');

async function createAdmin() {
    try {
        const adminEmail = String(process.env.DEFAULT_ADMIN_EMAIL || '').toLowerCase().trim();
        const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
        const adminName = process.env.DEFAULT_ADMIN_NAME || 'Super Admin';

        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is not defined in .env file');
        }
        if (!adminEmail) {
            throw new Error('DEFAULT_ADMIN_EMAIL is not defined in .env (required for this script)');
        }

        logger.info('Connecting to MongoDB');
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            dbName: 'gorythm_academy',
        });
        logger.info('MongoDB connected');

        const existingAdmin = await User.findOne({ email: adminEmail });
        if (existingAdmin) {
            logger.info('Admin user already exists', { email: existingAdmin.email });
            process.exit(0);
        }

        const admin = new User({
            name: adminName,
            email: adminEmail,
            password: adminPassword,
            role: 'super-admin',
            isActive: true,
            canLogin: true,
            mustChangePassword: false,
            isSystemAccount: true,
        });

        await admin.save();
        logger.info('Admin user created', { email: adminEmail });
        logger.warn('Change DEFAULT_ADMIN_PASSWORD after first login if you used a default');
    } catch (error) {
        logger.error('Error creating admin', { err: error });
        logger.info('Troubleshooting: ensure backend/.env has MONGODB_URI and DEFAULT_ADMIN_EMAIL; MongoDB must be running');
        process.exitCode = 1;
    } finally {
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            logger.info('MongoDB connection closed');
        }
    }
}

createAdmin();
