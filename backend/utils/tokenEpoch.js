/**
 * AUTH_EPOCH — bump on the server to invalidate previously issued JWTs
 * (e.g. after a security deploy). Default 2 rejects legacy tokens that
 * were minted before authEpoch existed (including old 30d admin remember tokens).
 */
function currentAuthEpoch() {
    const raw = process.env.AUTH_EPOCH || process.env.AUTH_TOKEN_EPOCH || '2';
    const n = parseInt(String(raw).trim(), 10);
    return Number.isFinite(n) && n >= 1 ? n : 2;
}

function assertTokenEpoch(decoded) {
    const live = currentAuthEpoch();
    if (decoded?.authEpoch == null) {
        // Legacy JWTs without the claim are only accepted when epoch is explicitly 1.
        return live <= 1;
    }
    return Number(decoded.authEpoch) === live;
}

module.exports = { currentAuthEpoch, assertTokenEpoch };
