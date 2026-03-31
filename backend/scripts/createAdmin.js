const mongoose = require('mongoose');
const User = require('../models/User');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function createAdmin() {
    try {
        console.log('🔍 Checking .env file...');
        console.log('MONGODB_URI:', process.env.MONGODB_URI);
        
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is not defined in .env file');
        }
        
        console.log('🔗 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ MongoDB Connected');
        
        // Check if admin already exists
        const existingAdmin = await User.findOne({ email: 'admin@academy.com' });
        
        if (existingAdmin) {
            console.log('ℹ️ Admin user already exists');
            console.log('Email:', existingAdmin.email);
            process.exit(0);
        }
        
        // Create admin user
        const admin = new User({
            name: 'Super Admin',
            email: 'admin@academy.com',
            password: 'admin123', // Will be hashed automatically
            role: 'admin',
            isActive: true
        });
        
        await admin.save();
        console.log('\n✅ Admin user created successfully!');
        console.log('📧 Email: admin@academy.com');
        console.log('🔑 Password: admin123');
        console.log('\n⚠️ Remember to change this password after first login!');
        
    } catch (error) {
        console.error('❌ Error creating admin:', error.message);
        console.log('\n💡 Troubleshooting:');
        console.log('1. Make sure .env file exists in backend folder');
        console.log('2. Check if .env contains MONGODB_URI');
        console.log('3. Ensure MongoDB is running (mongod command)');
    } finally {
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            console.log('🔌 MongoDB connection closed');
        }
    }
}

createAdmin();