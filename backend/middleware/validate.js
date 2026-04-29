const mongoose = require('mongoose');

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const rules = {
    requiredString: (field, label = field, min = 1) => (body) => {
        const value = body?.[field];
        if (typeof value !== 'string' || value.trim().length < min) {
            return `${label} is required`;
        }
        return null;
    },
    email: (field, label = field) => (body) => {
        const value = body?.[field];
        if (!isEmail(value)) return `${label} is invalid`;
        return null;
    },
    number: (field, label = field, { min = null, max = null } = {}) => (body) => {
        const value = Number(body?.[field]);
        if (Number.isNaN(value)) return `${label} must be a number`;
        if (min != null && value < min) return `${label} must be at least ${min}`;
        if (max != null && value > max) return `${label} must be at most ${max}`;
        return null;
    },
    enum: (field, label = field, allowed = []) => (body) => {
        const value = body?.[field];
        if (!allowed.includes(value)) return `${label} must be one of: ${allowed.join(', ')}`;
        return null;
    },
    objectId: (field, label = field) => (body) => {
        const value = body?.[field];
        if (!mongoose.Types.ObjectId.isValid(String(value || ''))) return `${label} is invalid`;
        return null;
    },
    arrayNonEmpty: (field, label = field) => (body) => {
        const value = body?.[field];
        if (!Array.isArray(value) || value.length === 0) return `${label} is required`;
        return null;
    },
};

const validate = (checks = []) => (req, res, next) => {
    for (const check of checks) {
        const error = check(req.body || {});
        if (error) {
            return res.status(400).json({ success: false, error });
        }
    }
    return next();
};

module.exports = { validate, rules };

