const rateLimit = require('express-rate-limit');

const publicWriteRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests. Please try again later.' },
});

const paymentRegisterRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many registration attempts. Please try again later.' },
});

module.exports = { publicWriteRateLimiter, paymentRegisterRateLimiter };
