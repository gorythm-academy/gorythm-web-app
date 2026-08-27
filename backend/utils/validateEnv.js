const WEAK_JWT_SECRETS = new Set([
    'secret',
    'jwt_secret',
    'your-secret',
    'changeme',
    'admin123',
    'gorythm',
]);

function validateCriticalEnv() {
    const isProduction = process.env.NODE_ENV === 'production';
    const secret = String(process.env.JWT_SECRET || '').trim();

    if (!secret) {
        throw new Error('JWT_SECRET must be set in backend/.env');
    }

    const minLength = isProduction ? 32 : 16;
    if (secret.length < minLength) {
        throw new Error(`JWT_SECRET must be at least ${minLength} characters`);
    }

    if (WEAK_JWT_SECRETS.has(secret.toLowerCase())) {
        throw new Error('JWT_SECRET is too weak; use a long random string');
    }
}

module.exports = { validateCriticalEnv };
