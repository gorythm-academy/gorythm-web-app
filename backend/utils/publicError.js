/**
 * Text that is safe to show in an API response for an unexpected error.
 * Validation and bad-id errors are written for people; anything else (database, network,
 * code bugs) stays in the server log only.
 */
function publicErrorText(error, fallback = undefined) {
    if (!error) return fallback;
    if (error.name === 'ValidationError' || error.name === 'CastError') return error.message;
    return fallback;
}

module.exports = { publicErrorText };
