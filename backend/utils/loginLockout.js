/** Progressive lockout after repeated failed password attempts. */

const MAX_ATTEMPTS = Math.max(3, parseInt(process.env.LOGIN_MAX_ATTEMPTS || '5', 10) || 5);
const LOCK_MINUTES = Math.max(5, parseInt(process.env.LOGIN_LOCK_MINUTES || '15', 10) || 15);

function lockMs() {
    return LOCK_MINUTES * 60 * 1000;
}

function isLoginLocked(user) {
    if (!user?.loginLockedUntil) return false;
    return new Date(user.loginLockedUntil).getTime() > Date.now();
}

async function registerFailedLogin(user) {
    if (!user) return;
    const attempts = Number(user.failedLoginAttempts || 0) + 1;
    user.failedLoginAttempts = attempts;
    if (attempts >= MAX_ATTEMPTS) {
        user.loginLockedUntil = new Date(Date.now() + lockMs());
        user.failedLoginAttempts = 0;
    }
    user.updatedAt = Date.now();
    await user.save();
}

async function clearFailedLogins(user) {
    if (!user) return;
    if (!user.failedLoginAttempts && !user.loginLockedUntil) return;
    user.failedLoginAttempts = 0;
    user.loginLockedUntil = null;
    user.updatedAt = Date.now();
    await user.save();
}

module.exports = {
    MAX_ATTEMPTS,
    LOCK_MINUTES,
    isLoginLocked,
    registerFailedLogin,
    clearFailedLogins,
};
