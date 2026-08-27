function escapePdfText(value) {
    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/[^\x20-\x7E]/g, '?');
}

function formatInvoiceStatus(status) {
    if (status === 'completed') return 'paid';
    if (status === 'awaiting_review') return 'awaiting review';
    return status || 'N/A';
}

/** Minimal PDF 1.4 generator (no external dependencies). */
function buildPaymentInvoicePdf(payment) {
    const studentName = payment.studentName || payment.user?.name || 'Unknown';
    const email = payment.email || payment.user?.email || 'N/A';
    const courseTitle = payment.courseName || payment.course?.title || 'Unknown Course';
    const amount = Number(payment.amount || 0).toFixed(2);
    const currency = payment.currency || 'USD';
    const txnId = payment.transactionId || String(payment._id || 'invoice');
    const paymentDate = payment.createdAt ? new Date(payment.createdAt).toLocaleString() : 'N/A';
    const generatedAt = new Date().toLocaleString();

    const rows = [
        ['Transaction ID', txnId],
        ['Student', studentName],
        ['Email', email],
        ['Phone', payment.phone || 'N/A'],
        ['Course', courseTitle],
        ['Amount', `${currency} ${amount}`],
        ['Status', formatInvoiceStatus(payment.status)],
        ['Payment Method', payment.paymentMethod || 'N/A'],
        ['Payment Date', paymentDate],
        ['Generated At', generatedAt],
    ];

    let y = 750;
    const contentLines = [];

    contentLines.push('BT /F1 16 Tf 50 750 Td (Gorythm - Payment Invoice) Tj ET');
    contentLines.push(`BT /F1 10 Tf 50 732 Td (Invoice #: ${escapePdfText(txnId)}) Tj ET`);

    y = 710;
    for (const [label, value] of rows) {
        const text = escapePdfText(`${label}: ${value}`);
        const maxLen = 95;
        for (let i = 0; i < text.length; i += maxLen) {
            const chunk = text.slice(i, i + maxLen);
            contentLines.push(`BT /F1 10 Tf 50 ${y} Td (${chunk}) Tj ET`);
            y -= 16;
        }
    }

    const streamBody = `${contentLines.join('\n')}\n`;
    const streamLength = Buffer.byteLength(streamBody, 'utf8');

    const objects = [
        '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
        '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
        '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
        `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamBody}endstream\nendobj\n`,
        '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    ];

    let pdf = '%PDF-1.4\n';
    const offsets = [0];

    for (const obj of objects) {
        offsets.push(Buffer.byteLength(pdf, 'utf8'));
        pdf += obj;
    }

    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i <= objects.length; i += 1) {
        pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
    pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

    return Buffer.from(pdf, 'utf8');
}

module.exports = { buildPaymentInvoicePdf };
