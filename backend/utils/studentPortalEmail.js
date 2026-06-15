const GORYTHM_DOMAIN = '@gorythmacademy.com';

/** Internal placeholder until admin assigns a real portal email. */
function buildUnsetPortalEmail(uniquePart) {
    const safe = String(uniquePart || Date.now()).replace(/[^a-zA-Z0-9._-]/g, '');
    return `pending.${safe}${GORYTHM_DOMAIN}`;
}

function isUnsetPortalEmail(email) {
    const lower = String(email || '').trim().toLowerCase();
    if (!lower.endsWith(GORYTHM_DOMAIN)) return false;
    return lower.startsWith('pending.') || lower.startsWith('student.');
}

function displayPortalEmail(email) {
    return isUnsetPortalEmail(email) ? '' : String(email || '').trim();
}

/** Registration email from payment — never the auto-generated portal address. */
function paymentRegistrationEmail(payment) {
    return String(payment?.email || '').trim();
}

module.exports = {
    GORYTHM_DOMAIN,
    buildUnsetPortalEmail,
    isUnsetPortalEmail,
    displayPortalEmail,
    paymentRegistrationEmail,
};
