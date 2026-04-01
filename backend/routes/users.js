const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// Get all users (with pagination)
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 20, role, search } = req.query;
        
        // Build filter
        const filter = {};
        if (role && role !== 'all') filter.role = role;
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const users = await User.find(filter)
            .select('-password')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await User.countDocuments(filter);

        res.json({
            success: true,
            users: users.map(user => ({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone || '',
                avatar: user.avatar,
                isActive: user.isActive,
                status: user.isActive ? 'active' : 'inactive',
                enrolledCourses: user.enrolledCourses?.length || 0,
                joinDate: user.createdAt,
                lastLogin: user.lastLogin || null,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            })),
            total,
            page: parseInt(page),
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch users' });
    }
});

// Get single user
router.get('/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.json({
            success: true,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone || '',
                avatar: user.avatar,
                isActive: user.isActive,
                status: user.isActive ? 'active' : 'inactive',
                enrolledCourses: user.enrolledCourses?.length || 0,
                joinDate: user.createdAt,
                lastLogin: user.lastLogin || null
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch user' });
    }
});

// Create new user
router.post('/', async (req, res) => {
    try {
        const { name, email, password, role, phone } = req.body;
        
        // Check if user exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                error: 'User with this email already exists' 
            });
        }

        const user = new User({
            name,
            email: email.toLowerCase(),
            password,
            role: role || 'student',
            phone: phone || '',
            isActive: true
        });

        await user.save();

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone,
                isActive: user.isActive,
                status: 'active',
                enrolledCourses: 0,
                joinDate: user.createdAt,
                lastLogin: null
            }
        });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ success: false, error: 'Failed to create user' });
    }
});

// Update user
router.put('/:id', async (req, res) => {
    try {
        const { name, email, role, phone, isActive } = req.body;
        
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Check if email is being changed and if it already exists
        if (email && email.toLowerCase() !== user.email) {
            const existingUser = await User.findOne({ 
                email: email.toLowerCase(),
                _id: { $ne: req.params.id }
            });
            if (existingUser) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Email already in use by another user' 
                });
            }
            user.email = email.toLowerCase();
        }

        // Update fields
        if (name) user.name = name;
        if (role) user.role = role;
        if (phone !== undefined) user.phone = phone;
        if (isActive !== undefined) user.isActive = isActive;
        
        user.updatedAt = Date.now();
        await user.save();

        res.json({
            success: true,
            message: 'User updated successfully',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone,
                isActive: user.isActive,
                status: user.isActive ? 'active' : 'inactive',
                enrolledCourses: user.enrolledCourses?.length || 0,
                joinDate: user.createdAt,
                lastLogin: user.lastLogin || null
            }
        });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ success: false, error: 'Failed to update user' });
    }
});

// Update user password
router.patch('/:id/password', async (req, res) => {
    try {
        const { password } = req.body;
        
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        user.password = password;
        user.updatedAt = Date.now();
        await user.save();

        res.json({
            success: true,
            message: 'Password updated successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update password' });
    }
});

// Update user status
router.patch('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        user.isActive = status === 'active';
        user.updatedAt = Date.now();
        await user.save();

        res.json({
            success: true,
            message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update user status' });
    }
});

// Delete user
router.delete('/:id', async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete user' });
    }
});

// Bulk delete users
router.post('/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'No user IDs provided' });
        }

        const result = await User.deleteMany({ _id: { $in: ids } });

        res.json({
            success: true,
            message: `${result.deletedCount} user(s) deleted successfully`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete users' });
    }
});

// Bulk update status
router.patch('/bulk-status', async (req, res) => {
    try {
        const { ids, status } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'No user IDs provided' });
        }

        if (!['active', 'inactive'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }

        await User.updateMany(
            { _id: { $in: ids } },
            { 
                isActive: status === 'active',
                updatedAt: Date.now()
            }
        );

        res.json({
            success: true,
            message: `${ids.length} user(s) set to ${status}`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update users' });
    }
});

module.exports = router;