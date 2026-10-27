const { chargeCurrency } = require('./chargeCurrency');

const ZERO_DECIMAL = new Set([
    'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
    'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

function stripeMinorToMajor(amount, currency) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return 0;
    const code = String(currency || 'usd').toUpperCase();
    if (ZERO_DECIMAL.has(code)) return n;
    return Math.round(n) / 100;
}

function presentmentFromStripeSession(session) {
    const details = session?.presentment_details || {};
    const presentmentCurrency = String(details.presentment_currency || '').toUpperCase();
    const sessionCurrency = String(session?.currency || chargeCurrency()).toUpperCase();
    const sourceCurrency = String(session?.currency_conversion?.source_currency || '').toUpperCase();
    const chargedIn = sourceCurrency || sessionCurrency;
    const hasOtherPresentment = Boolean(presentmentCurrency) && presentmentCurrency !== chargedIn;

    return {
        currency: chargedIn,
        presentmentCurrency: hasOtherPresentment ? presentmentCurrency : '',
        presentmentAmount: hasOtherPresentment && details.presentment_amount != null
            ? stripeMinorToMajor(details.presentment_amount, presentmentCurrency)
            : null,
    };
}

function isStripeInvalid(err) {
    return err?.type === 'StripeInvalidRequestError' || err?.rawType === 'invalid_request_error';
}

async function createCheckoutSessionWithFallback(stripe, params, types) {
    if (!stripe) {
        const err = new Error('Card payment is not available yet. Please use bank transfer or contact the academy.');
        err.status = 503;
        throw err;
    }
    const methodTypes = Array.isArray(types) && types.length ? types : ['card'];
    const withoutLocalCurrency = { ...params, adaptive_pricing: { enabled: false } };
    const attempts = [
        { params: withoutLocalCurrency, types: methodTypes },
        { params: withoutLocalCurrency, types: ['card'] },
        { params, types: methodTypes },
        { params, types: ['card'] },
    ];
    const seen = new Set();
    let lastErr;
    for (const attempt of attempts) {
        const key = `${attempt.params === params ? 'plain' : 'eur-only'}|${attempt.types.join(',')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
            return await stripe.checkout.sessions.create({
                ...attempt.params,
                payment_method_types: attempt.types,
            });
        } catch (err) {
            lastErr = err;
            if (!isStripeInvalid(err)) throw err;
        }
    }
    throw lastErr;
}

module.exports = {
    ZERO_DECIMAL,
    stripeMinorToMajor,
    presentmentFromStripeSession,
    createCheckoutSessionWithFallback,
};
