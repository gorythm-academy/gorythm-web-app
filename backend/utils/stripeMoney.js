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
    const sessionCurrency = String(session?.currency || 'usd').toUpperCase();
    const sourceCurrency = String(session?.currency_conversion?.source_currency || '').toUpperCase();

    let presentmentAmount = null;
    if (presentmentCurrency && details.presentment_amount != null) {
        presentmentAmount = stripeMinorToMajor(details.presentment_amount, presentmentCurrency);
    } else if (sessionCurrency && sessionCurrency !== 'USD' && session?.amount_total != null) {
        presentmentAmount = stripeMinorToMajor(session.amount_total, sessionCurrency);
    }

    const localCurrency = presentmentCurrency
        || (sessionCurrency !== 'USD' ? sessionCurrency : '');

    return {
        currency: sourceCurrency || 'USD',
        presentmentCurrency: localCurrency && localCurrency !== 'USD' ? localCurrency : '',
        presentmentAmount: localCurrency && localCurrency !== 'USD' ? presentmentAmount : null,
    };
}

function withAdaptivePricing(params) {
    return {
        ...params,
        adaptive_pricing: { enabled: true },
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
    const attempts = [
        { params: withAdaptivePricing(params), types: methodTypes },
        { params: withAdaptivePricing(params), types: ['card'] },
        { params, types: methodTypes },
        { params, types: ['card'] },
    ];
    const seen = new Set();
    let lastErr;
    for (const attempt of attempts) {
        const key = `${attempt.params === params ? 'plain' : 'adaptive'}|${attempt.types.join(',')}`;
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
    withAdaptivePricing,
    createCheckoutSessionWithFallback,
};
