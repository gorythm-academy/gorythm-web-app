/** Make user text safe to use inside a RegExp (no injection, no catastrophic patterns). */
function escapeRegex(value) {
    return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegex };
