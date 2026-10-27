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

/** Real inbox. Portal logins on this domain are not mailboxes. */
function deliverableInbox(email) {
    const value = String(email || '').trim().toLowerCase();
    if (!value || !value.includes('@') || value.includes(' ')) return '';
    if (value.endsWith(GORYTHM_DOMAIN)) return '';
    return value;
}

function isRealPortalLogin(email) {
    const value = String(email || '').trim().toLowerCase();
    return value.endsWith(GORYTHM_DOMAIN) && !isUnsetPortalEmail(value);
}

function displayPortalEmail(email) {
    return isUnsetPortalEmail(email) ? '' : String(email || '').trim();
}

/** Registration email from payment — never the auto-generated portal address. */
function paymentRegistrationEmail(payment) {
    return String(payment?.email || '').trim();
}

/** Students, parents, and teachers sign in with a real inbox. School addresses are not inboxes. */
function peopleLoginEmailError(email) {
    const value = String(email || '').trim().toLowerCase();
    if (!value) return 'Email is required.';
    if (value.endsWith(GORYTHM_DOMAIN)) {
        return 'Please enter an email you can open, such as Gmail or Hotmail.';
    }
    if (!deliverableInbox(value)) return 'Enter a valid email address.';
    return '';
}

/** Parent inbox for a registration, or blank when it is missing or the same as the student. */
function distinctParentEmail(studentEmail, parentEmail) {
    const student = String(studentEmail || '').trim().toLowerCase();
    const parent = deliverableInbox(parentEmail);
    if (!parent || parent === student) return '';
    return parent;
}

module.exports = {
    GORYTHM_DOMAIN,
    buildUnsetPortalEmail,
    isUnsetPortalEmail,
    deliverableInbox,
    isRealPortalLogin,
    displayPortalEmail,
    paymentRegistrationEmail,
    peopleLoginEmailError,
    distinctParentEmail,
};
