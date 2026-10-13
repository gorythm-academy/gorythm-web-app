const rateLimit = require('express-rate-limit');

/** Strict limiter for password-bearing / public auth endpoints only (not /me). */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many auth requests. Please try again later.' },
});

module.exports = { authRateLimiter };
