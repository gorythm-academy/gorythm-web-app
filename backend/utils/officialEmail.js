const OFFICIAL_EMAIL = 'gorythm.academy@gmail.com';

const RETIRED_INBOXES = new Set([
    'info@gorythmacademy.com',
    'noreply@gorythmacademy.com',
    'info@gorythm.com',
    'support@gorythmacademy.com',
]);

function officialEmail(value) {
    const email = String(value || '').trim();
    if (!email || RETIRED_INBOXES.has(email.toLowerCase())) return OFFICIAL_EMAIL;
    return email;
}

module.exports = { OFFICIAL_EMAIL, officialEmail };
