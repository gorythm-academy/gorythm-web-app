export const COLUMN_MIN_WIDTHS = [50, 140, 140, 140, 90, 140, 96, 100, 100, 130, 90];
export const TXN_COL_INDEX = 1;
// Phone portrait only (≤767px). 132px fits three Courier characters plus the ellipsis.
export const MOBILE_PORTRAIT_QUERY = '(max-width: 767px) and (orientation: portrait)';
export const TXN_WIDTH_MOBILE_PORTRAIT = 132;
export const isMobilePortraitViewport = () => (
    typeof window !== 'undefined' && window.matchMedia(MOBILE_PORTRAIT_QUERY).matches
);
export const txnColumnWidth = (mobilePortrait) => (
    mobilePortrait ? TXN_WIDTH_MOBILE_PORTRAIT : COLUMN_MIN_WIDTHS[TXN_COL_INDEX]
);
// Transaction ID starts at its narrowest. Widen the column to see the rest.
export const DEFAULT_COLUMN_WIDTHS = [60, COLUMN_MIN_WIDTHS[TXN_COL_INDEX], 200, 200, 120, 200, 130, 110, 110, 170, 420];
export const COLUMN_MAX_WIDTHS = [90, 960, 360, 360, 220, 420, 220, 220, 220, 320, 420];
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const PAYMENTS_PAGE_SIZE = 25;

export const toDateInputValue = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const checkoutGroupKey = (payment) => {
    if (payment?.groupId) return `group:${payment.groupId}`;
    if (payment?.stripePaymentIntentId) return `pi:${payment.stripePaymentIntentId}`;
    if (payment?.transactionId) return `txn:${payment.transactionId}`;
    return `id:${payment?._id}`;
};

export const paymentAsLine = (payment) => ({
    studentName: payment.user?.name || payment.studentName || '',
    courseName: payment.course?.title || payment.courseName || 'Course',
    amount: payment.amount,
    course: payment.course,
    student: payment.user,
});

export const refId = (value) => {
    if (!value) return '';
    if (typeof value === 'object') return String(value._id || value.id || '');
    return String(value);
};

export const separateInvoiceTargets = (siblings, primary) => {
    const combined = siblings.length === 1 && (
        primary.invoiceMode === 'combined'
        || (Array.isArray(primary.lines) && primary.lines.length > 1)
    );
    if (combined) {
        const lines = Array.isArray(primary.lines) && primary.lines.length
            ? primary.lines
            : [paymentAsLine(primary)];
        return lines.map((line, index) => ({
            key: `${primary._id}-line-${index}`,
            label: line.courseName || primary.course?.title || 'Course',
            payment: primary,
            courseId: refId(line.course) || refId(primary.course),
            studentId: refId(line.student) || refId(primary.user),
            courseName: line.courseName || primary.course?.title || primary.courseName || '',
        }));
    }
    return siblings.map((row) => ({
        key: String(row._id),
        label: row.course?.title || row.courseName || row.lines?.[0]?.courseName || 'Invoice',
        payment: row,
        courseId: refId(row.lines?.[0]?.course) || refId(row.course),
        studentId: refId(row.lines?.[0]?.student) || refId(row.user),
        courseName: row.course?.title || row.courseName || row.lines?.[0]?.courseName || '',
    }));
};

export const groupPaymentsForAdminTable = (payments) => {
    const buckets = new Map();
    for (const payment of payments || []) {
        const key = checkoutGroupKey(payment);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(payment);
    }
    return [...buckets.values()].map((siblings) => {
        const primary = siblings[0];
        const groupedPaymentIds = siblings.map((row) => row._id);
        const combined = siblings.length === 1 && (
            primary.invoiceMode === 'combined'
            || (Array.isArray(primary.lines) && primary.lines.length > 1)
        );
        const lines = siblings.flatMap((row) =>
            Array.isArray(row.lines) && row.lines.length
                ? row.lines.map((line) => ({ ...line, paymentId: row._id }))
                : [{ ...paymentAsLine(row), paymentId: row._id }]
        );
        const separateTargets = separateInvoiceTargets(siblings, primary);
        const invoiceButtons = [{
            key: `${primary._id}-invoice`,
            label: 'Invoice',
            payment: primary,
            multi: separateTargets.length > 1,
            separateTargets,
        }];
        if (siblings.length === 1 && combined) {
            return { ...primary, groupedPaymentIds, invoiceMode: 'combined', invoiceButtons, lines: primary.lines || lines };
        }
        if (siblings.length === 1) {
            return {
                ...primary,
                groupedPaymentIds,
                invoiceMode: primary.invoiceMode || 'separate',
                invoiceButtons,
            };
        }
        return {
            ...primary,
            amount: siblings.reduce((sum, row) => sum + Number(row.amount || 0), 0),
            lines,
            groupedPaymentIds,
            invoiceMode: 'separate',
            invoiceButtons,
        };
    });
};

export const csvEscape = (value) => {
    const text = String(value ?? '');
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
};

export const EMPTY_BANK_FORM = {
    bankAccountName: '',
    bankName: '',
    bankAccountNumber: '',
    bankIban: '',
    bankSwift: '',
    bankExtraNote: '',
};

export const bankDetailsToForm = (details = {}) => ({
    bankAccountName: details.accountName || '',
    bankName: details.bankName || '',
    bankAccountNumber: details.accountNumber || '',
    bankIban: details.iban || '',
    bankSwift: details.swift || '',
    bankExtraNote: details.extraNote || '',
});
