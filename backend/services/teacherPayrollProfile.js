const crypto = require('crypto');
const User = require('../models/User');
const TeacherSalaryProfile = require('../models/TeacherSalaryProfile');

function slugifyName(name) {
    return String(name || 'teacher')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '.')
        .replace(/^\.+|\.+$/g, '')
        .slice(0, 24) || 'teacher';
}

function randomPassword() {
    return crypto.randomBytes(12).toString('base64url');
}

async function upsertTeacherPayrollProfile({ teacherId, name, monthlySalary, workingDays, email }) {
    const salary = Math.max(0, Number(monthlySalary) || 0);
    const wd = Math.max(1, Number(workingDays) || 26);
    const trimmedName = String(name || '').trim();

    if (teacherId) {
        const user = await User.findById(teacherId);
        if (!user || user.role !== 'teacher') {
            const err = new Error('Teacher not found');
            err.status = 404;
            throw err;
        }
        if (trimmedName) user.name = trimmedName;
        await user.save();
        const profile = await TeacherSalaryProfile.findOneAndUpdate(
            { teacher: user._id },
            { monthlySalary: salary, workingDays: wd, currency: 'USD' },
            { upsert: true, new: true }
        );
        return { teacher: user, profile, created: false };
    }

    if (!trimmedName) {
        const err = new Error('Teacher name is required');
        err.status = 400;
        throw err;
    }

    let userEmail = String(email || '')
        .trim()
        .toLowerCase();
    if (!userEmail) {
        userEmail = `${slugifyName(trimmedName)}.${Date.now()}@teachers.gorythm.local`;
    }
    const existing = await User.findOne({ email: userEmail });
    if (existing) {
        const err = new Error('A user with this email already exists');
        err.status = 400;
        throw err;
    }

    const user = new User({
        name: trimmedName,
        email: userEmail,
        password: randomPassword(),
        role: 'teacher',
        mustChangePassword: true,
        status: 'active',
        isActive: true,
    });
    await user.save();
    const profile = await TeacherSalaryProfile.create({
        teacher: user._id,
        monthlySalary: salary,
        workingDays: wd,
        currency: 'USD',
    });
    return { teacher: user, profile, created: true };
}

module.exports = { upsertTeacherPayrollProfile };
