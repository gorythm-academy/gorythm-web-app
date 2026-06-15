const GORYTHM_DOMAIN = '@gorythmacademy.com';

export function isUnsetPortalEmail(email) {
    const lower = String(email || '').trim().toLowerCase();
    if (!lower.endsWith(GORYTHM_DOMAIN)) return false;
    return lower.startsWith('pending.') || lower.startsWith('student.');
}

export function displayPortalEmail(email) {
    return isUnsetPortalEmail(email) ? '' : String(email || '').trim();
}

export function localFromPortalEmail(email) {
    if (isUnsetPortalEmail(email)) return '';
    const lower = String(email || '').trim().toLowerCase();
    if (lower.endsWith(GORYTHM_DOMAIN)) {
        return lower.slice(0, -GORYTHM_DOMAIN.length);
    }
    const beforeAt = lower.includes('@') ? lower.split('@')[0] : lower;
    return beforeAt.replace(/\s+/g, '');
}

/** Email entered on course registration / stored on payment record. */
export function paymentRegistrationEmail(payment) {
    return String(payment?.email || '').trim();
}
