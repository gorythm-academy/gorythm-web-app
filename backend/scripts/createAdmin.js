const mongoose = require('mongoose');
const User = require('../models/User');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

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

        console.log('🔗 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            dbName: 'gorythm_academy',
        });
        console.log('✅ MongoDB Connected');

        const existingAdmin = await User.findOne({ email: adminEmail });
        if (existingAdmin) {
            console.log('ℹ️ Admin user already exists');
            console.log('Email:', existingAdmin.email);
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
        console.log('\n✅ Admin user created successfully!');
        console.log('📧 Email:', adminEmail);
        console.log('\n⚠️ Change DEFAULT_ADMIN_PASSWORD after first login if you used a default.');
    } catch (error) {
        console.error('❌ Error creating admin:', error.message);
        console.log('\n💡 Troubleshooting:');
        console.log('1. Ensure backend/.env has MONGODB_URI and DEFAULT_ADMIN_EMAIL');
        console.log('2. Ensure MongoDB is running');
        process.exitCode = 1;
    } finally {
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            console.log('🔌 MongoDB connection closed');
        }
    }
}

createAdmin();
