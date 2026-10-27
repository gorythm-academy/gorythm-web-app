/** Currency Stripe charges and pays out. Old payment records keep their own currency. */
function chargeCurrency() {
    const code = String(process.env.BASE_CURRENCY || 'EUR').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : 'EUR';
}

function stripeCurrency() {
    return chargeCurrency().toLowerCase();
}

/** Missing currency on older records is USD, from before euro charges. */
function currencyGroupExpression() {
    return { $toUpper: { $ifNull: ['$currency', 'USD'] } };
}

function bucketsFromAgg(rows) {
    return (rows || [])
        .map((row) => ({
            currency: String(row._id || 'USD').toUpperCase(),
            total: Number(row.total || 0),
        }))
        .filter((row) => row.total !== 0)
        .sort((a, b) => a.currency.localeCompare(b.currency));
}

function primaryBucket(buckets) {
    if (!buckets?.length) return { currency: chargeCurrency(), total: 0 };
    return buckets.reduce((best, row) => (row.total > best.total ? row : best));
}

function growthLabel(current, previous) {
    const currentTotal = Number(current || 0);
    const previousTotal = Number(previous || 0);
    if (previousTotal === 0 && currentTotal === 0) return '+0%';
    if (previousTotal === 0) return '+100%';
    const growth = ((currentTotal - previousTotal) / previousTotal) * 100;
    return `${growth >= 0 ? '+' : ''}${growth.toFixed(0)}%`;
}

function seriesFromDatedRows(rows) {
    const totals = new Map();
    for (const row of rows || []) {
        const currency = String(row.currency || 'USD').toUpperCase();
        totals.set(currency, (totals.get(currency) || 0) + Number(row.total || 0));
    }
    const buckets = [...totals.entries()]
        .map(([currency, total]) => ({ currency, total }))
        .filter((row) => row.total !== 0)
        .sort((a, b) => a.currency.localeCompare(b.currency));
    const primary = primaryBucket(buckets).currency;
    const series = (rows || [])
        .filter((row) => String(row.currency || 'USD').toUpperCase() === primary)
        .map((row) => ({
            date: row.date,
            totalRevenue: Number(row.total || 0),
            transactionCount: Number(row.transactionCount || 0),
        }));
    return { series, buckets };
}

module.exports = {
    chargeCurrency,
    stripeCurrency,
    currencyGroupExpression,
    bucketsFromAgg,
    primaryBucket,
    growthLabel,
    seriesFromDatedRows,
};
