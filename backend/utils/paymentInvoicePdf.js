const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function escapePdfText(value) {
    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/[^\x20-\x7E]/g, ' ')
        .replace(/ +/g, ' ')
        .trim();
}

function money(amount, currency) {
    const code = String(currency || 'USD').toUpperCase();
    const value = Number(amount || 0).toFixed(2);
    if (code === 'USD') return `$${value}`;
    if (code === 'PKR') return `Rs ${value}`;
    return `${code} ${value}`;
}

function invoiceDisplay(payment, usdAmount) {
    const presentmentCurrency = String(payment?.presentmentCurrency || '').toUpperCase();
    const presentmentTotal = Number(payment?.presentmentAmount);
    const usdTotal = Number(payment?.amount || 0);
    if (
        presentmentCurrency
        && presentmentCurrency !== 'USD'
        && Number.isFinite(presentmentTotal)
        && presentmentTotal > 0
        && usdTotal > 0
    ) {
        return {
            amount: Math.round((Number(usdAmount || 0) * presentmentTotal / usdTotal) * 100) / 100,
            currency: presentmentCurrency,
        };
    }
    return {
        amount: Number(usdAmount || 0),
        currency: payment?.currency || 'USD',
    };
}

function paymentLines(payment) {
    if (Array.isArray(payment.lines) && payment.lines.length) return payment.lines;
    return [
        {
            studentName: payment.studentName || payment.user?.name || 'Student',
            studentEmail: payment.email || payment.user?.email || '',
            courseName: payment.courseName || payment.course?.title || 'Course fee',
            amount: payment.amount,
        },
    ];
}

function pngSignature(buffer) {
    return buffer.length >= 8
        && buffer[0] === 0x89
        && buffer[1] === 0x50
        && buffer[2] === 0x4e
        && buffer[3] === 0x47;
}

function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
}

function pngToRgb(buffer) {
    if (!pngSignature(buffer)) return null;
    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 8;
    let colorType = 6;
    const idat = [];
    while (offset + 12 <= buffer.length) {
        const len = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        const data = buffer.slice(offset + 8, offset + 8 + len);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }
        offset += 12 + len;
    }
    if (!width || !height || bitDepth !== 8 || ![0, 2, 6].includes(colorType)) return null;
    const inflated = zlib.inflateSync(Buffer.concat(idat));
    const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
    const stride = width * bpp;
    const rows = [];
    let i = 0;
    let prev = Buffer.alloc(stride);
    for (let y = 0; y < height; y += 1) {
        const filter = inflated[i];
        i += 1;
        const raw = inflated.slice(i, i + stride);
        i += stride;
        const out = Buffer.alloc(stride);
        for (let x = 0; x < stride; x += 1) {
            const left = x >= bpp ? out[x - bpp] : 0;
            const up = prev[x];
            const upLeft = x >= bpp ? prev[x - bpp] : 0;
            let value = raw[x];
            if (filter === 1) value = (value + left) & 255;
            else if (filter === 2) value = (value + up) & 255;
            else if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 255;
            else if (filter === 4) value = (value + paeth(left, up, upLeft)) & 255;
            out[x] = value;
        }
        prev = out;
        rows.push(out);
    }
    const rgb = Buffer.alloc(width * height * 3);
    let o = 0;
    for (const row of rows) {
        for (let x = 0; x < width; x += 1) {
            if (colorType === 6) {
                const a = row[x * 4 + 3] / 255;
                rgb[o] = Math.round(row[x * 4] * a + 255 * (1 - a));
                rgb[o + 1] = Math.round(row[x * 4 + 1] * a + 255 * (1 - a));
                rgb[o + 2] = Math.round(row[x * 4 + 2] * a + 255 * (1 - a));
            } else if (colorType === 2) {
                rgb[o] = row[x * 3];
                rgb[o + 1] = row[x * 3 + 1];
                rgb[o + 2] = row[x * 3 + 2];
            } else {
                rgb[o] = row[x];
                rgb[o + 1] = row[x];
                rgb[o + 2] = row[x];
            }
            o += 3;
        }
    }
    for (let i = 0; i < rgb.length; i += 3) {
        const gray = Math.round(0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2]);
        rgb[i] = gray;
        rgb[i + 1] = gray;
        rgb[i + 2] = gray;
    }
    return { width, height, rgb: zlib.deflateSync(rgb) };
}

let cachedBrandLogo = undefined;

function loadBrandLogo() {
    if (cachedBrandLogo !== undefined) return cachedBrandLogo;
    const logoPath = path.join(__dirname, '../../public/favicon.png');
    try {
        if (!fs.existsSync(logoPath)) {
            cachedBrandLogo = null;
            return cachedBrandLogo;
        }
        cachedBrandLogo = pngToRgb(fs.readFileSync(logoPath)) || null;
        return cachedBrandLogo;
    } catch {
        cachedBrandLogo = null;
        return cachedBrandLogo;
    }
}

function formatPdfDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function invoiceNumberFor(payment) {
    const number = String(payment.invoiceNumber || '').trim();
    if (/^GA-\d{4}-\d+$/i.test(number)) return number.toUpperCase();
    if (number) return number;
    const fallback = String(payment._id || '').trim();
    return fallback || 'invoice';
}

function methodLabel(method) {
    const value = String(method || '').toLowerCase();
    if (
        value === 'stripe'
        || value === 'card'
        || value === 'link'
        || value.includes('card')
        || value.includes('stripe')
    ) {
        return 'card';
    }
    if (value === 'bank' || value.includes('bank')) return 'bank';
    return value || 'payment';
}

function wrapPdfText(value, maxChars) {
    const raw = String(value || '').replace(/\s+/g, ' ').trim();
    if (!raw) return [''];
    const words = raw.split(' ');
    const lines = [];
    let current = '';
    words.forEach((word) => {
        const next = current ? `${current} ${word}` : word;
        if (next.length <= maxChars) {
            current = next;
            return;
        }
        if (current) lines.push(current);
        if (word.length <= maxChars) {
            current = word;
            return;
        }
        for (let i = 0; i < word.length; i += maxChars) {
            const chunk = word.slice(i, i + maxChars);
            if (i + maxChars >= word.length) current = chunk;
            else lines.push(chunk);
        }
    });
    if (current) lines.push(current);
    return lines;
}

function paymentHistoryRows(payment, { invoiceNo, currency, paid, historyRows = null } = {}) {
    void currency;
    void paid;
    if (Array.isArray(historyRows)) return historyRows;
    const paidAt = payment.receiptIssuedAt || payment.verifiedAt || payment.proofSubmittedAt || payment.createdAt;
    const method = methodLabel(payment.paymentMethod);
    const seen = new Set();
    const rows = [];
    paymentLines(payment).forEach((line) => {
        const course = String(line.courseName || payment.courseName || payment.course?.title || 'Course fee');
        const key = `${course}|${invoiceNo}|${method}|${Number(line.amount || 0)}`;
        if (seen.has(key)) return;
        seen.add(key);
        rows.push({
            date: paidAt,
            course,
            invoiceNo,
            method,
            amount: money(invoiceDisplay(payment, line.amount).amount, invoiceDisplay(payment, line.amount).currency),
        });
    });
    return rows;
}

/**
 * PDF coordinates: (0,0) is the bottom-left of the page.
 * Lower LOGO_BOTTOM_Y to move the logo down the page.
 */
const LOGO_BOTTOM_Y = 700;
const LOGO_DISPLAY_WIDTH = 36;
const INVOICE_BOX_X = 360;
const INVOICE_BOX_W = 200;
const INVOICE_BOX_H = 56;

function buildProfessionalInvoicePdf(payment, { lineFilter = null, historyRows = null } = {}) {
    const { displayPaymentStatus, statusLabel } = require('./billingStatus');
    const displayStatus = displayPaymentStatus(payment);
    const paid = displayStatus === 'paid';
    const awaiting = displayStatus === 'awaiting_review';
    const studentName = payment.studentName || payment.user?.name || 'Student';
    const email = payment.email || payment.user?.email || '';
    const lines = paymentLines(payment).filter((line) => {
        if (!lineFilter) return true;
        const lineStudent = String(line.student?._id || line.student || '');
        const lineCourse = String(line.course?._id || line.course || '');
        if (lineFilter.studentId && lineStudent && lineStudent !== String(lineFilter.studentId)) return false;
        if (lineFilter.courseId && lineCourse && lineCourse !== String(lineFilter.courseId)) return false;
        if (lineFilter.courseName && String(line.courseName || '').trim().toLowerCase() !== String(lineFilter.courseName).trim().toLowerCase()) {
            return false;
        }
        return true;
    });
    const usdTotal = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0) || Number(payment.amount || 0);
    const display = invoiceDisplay(payment, usdTotal);
    const currency = display.currency;
    const amount = display.amount;
    const invoiceNo = invoiceNumberFor(payment);
    const logo = loadBrandLogo();

    const ops = [];
    const text = (font, size, x, y, value) => {
        ops.push(`BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(value)}) Tj ET`);
    };

    let nameLeft = 48;
    const displayW = LOGO_DISPLAY_WIDTH;
    const displayH = logo
        ? Math.max(24, (logo.height / Math.max(logo.width, 1)) * displayW)
        : 36;
    const headerTop = LOGO_BOTTOM_Y + displayH;
    const invoiceBoxY = headerTop - INVOICE_BOX_H;
    if (logo) {
        ops.push('q');
        ops.push(`${displayW} 0 0 ${displayH} 48 ${LOGO_BOTTOM_Y} cm`);
        ops.push('/Im1 Do');
        ops.push('Q');
        nameLeft = 48 + displayW + 12;
    }

    ops.push('0 0 0 rg');
    text('F2', 14, nameLeft, headerTop - 11, 'Gorythm Academy');
    ops.push('0.35 0.35 0.35 rg');
    text('F1', 9, nameLeft, headerTop - 26, 'www.gorythmacademy.com');
    text('F1', 9, nameLeft, headerTop - 38, 'info@gorythmacademy.com');

    ops.push(`0.96 0.96 0.96 rg ${INVOICE_BOX_X} ${invoiceBoxY} ${INVOICE_BOX_W} ${INVOICE_BOX_H} re f`);
    ops.push(`0 0 0 RG ${INVOICE_BOX_X} ${invoiceBoxY} ${INVOICE_BOX_W} ${INVOICE_BOX_H} re S`);
    ops.push('0 0 0 rg');
    const boxTextX = INVOICE_BOX_X + 14;
    const boxLineGap = 12;
    const boxBlockH = boxLineGap * 3 + 9;
    const boxBaseY = invoiceBoxY + (INVOICE_BOX_H - boxBlockH) / 2;
    text('F2', 8, boxTextX, boxBaseY + boxLineGap * 3, 'Invoice No.');
    text('F1', 9, boxTextX, boxBaseY + boxLineGap * 2, invoiceNo.slice(0, 28));
    text('F2', 8, boxTextX, boxBaseY + boxLineGap, paid ? 'Invoice date' : 'Due date');
    text(
        'F1',
        9,
        boxTextX,
        boxBaseY,
        paid
            ? formatPdfDate(payment.receiptIssuedAt || payment.verifiedAt || payment.createdAt)
            : formatPdfDate(payment.dueDate)
    );

    ops.push('0 0 0 rg');
    text('F2', 10, 48, 658, 'Bill to');
    text('F1', 11, 48, 642, studentName);
    if (email) text('F1', 9, 48, 628, email);
    if (payment.phone) text('F1', 9, 48, 614, String(payment.phone));

    const tableTop = 580;
    ops.push('0 0 0 rg 48 ' + tableTop + ' 516 22 re f');
    ops.push('1 1 1 rg');
    text('F2', 9, 58, tableTop + 7, '#');
    text('F2', 9, 84, tableTop + 7, 'Description');
    text('F2', 9, 330, tableTop + 7, 'Student');
    text('F2', 9, 470, tableTop + 7, 'Amount');

    let y = tableTop - 22;
    lines.forEach((line, index) => {
        const courseLines = wrapPdfText(line.courseName || 'Course fee', 32);
        const studentLines = wrapPdfText(line.studentName || studentName, 18);
        const rowLines = Math.max(courseLines.length, studentLines.length, 1);
        const rowH = 14 + rowLines * 12;
        if (index % 2 === 0) {
            ops.push('0.95 0.95 0.95 rg 48 ' + (y - rowH + 16) + ' 516 ' + rowH + ' re f');
        }
        ops.push('0 0 0 rg');
        text('F1', 9, 58, y + 3, String(index + 1));
        courseLines.forEach((part, partIndex) => {
            text('F1', 9, 84, y + 3 - partIndex * 11, part);
        });
        studentLines.forEach((part, partIndex) => {
            text('F1', 9, 330, y + 3 - partIndex * 11, part);
        });
        text('F1', 9, 470, y + 3, money(invoiceDisplay(payment, line.amount).amount, currency));
        y -= rowH;
    });

    ops.push('0 0 0 RG 48 ' + (y + 14) + ' m 564 ' + (y + 14) + ' l S');
    y -= 8;
    ops.push('0 0 0 rg');
    text('F2', 10, 330, y, 'Subtotal');
    text('F1', 10, 470, y, money(amount, currency));
    y -= 18;
    text('F2', 12, 330, y, 'Total');
    text('F2', 12, 470, y, money(amount, currency));
    if (currency !== 'USD' && usdTotal) {
        y -= 14;
        ops.push('0.35 0.35 0.35 rg');
        text('F1', 8, 330, y, 'USD equivalent');
        text('F1', 8, 470, y, money(usdTotal, 'USD'));
        ops.push('0 0 0 rg');
    }
    y -= 28;

    const statusTitle = paid ? 'Payment history' : statusLabel(displayStatus).toUpperCase();
    let statusDetail = '';
    if (paid) {
        statusDetail = `Received ${formatPdfDate(payment.receiptIssuedAt || payment.verifiedAt || payment.createdAt)} - ${methodLabel(payment.paymentMethod)}`;
    } else if (awaiting) {
        statusDetail = 'The academy is checking this payment';
    } else if (payment.dueDate) {
        statusDetail = `Due ${formatPdfDate(payment.dueDate)}`;
    }
    ops.push(paid ? '0 0 0 rg' : '0.92 0.92 0.92 rg');
    ops.push(`48 ${y - 6} 516 28 re f`);
    ops.push(paid ? '1 1 1 rg' : '0 0 0 rg');
    text('F2', 11, 60, y + 4, statusTitle);
    if (statusDetail) {
        text('F1', 9, 220, y + 4, statusDetail);
    }

    y -= 28;
    ops.push('0.9 0.9 0.9 rg 48 ' + y + ' 516 18 re f');
    ops.push('0 0 0 rg');
    text('F2', 8, 56, y + 5, 'Date');
    text('F2', 8, 128, y + 5, 'Invoice No.');
    text('F2', 8, 250, y + 5, 'Course');
    text('F2', 8, 420, y + 5, 'Method');
    text('F2', 8, 478, y + 5, 'Amount');
    y -= 20;
    paymentHistoryRows(payment, { invoiceNo, currency, paid, historyRows }).forEach((row, index) => {
        if (y < 70) return;
        const courseLines = wrapPdfText(row.course || '', 22);
        const rowH = Math.max(18, 8 + courseLines.length * 11);
        if (index % 2 === 0) {
            ops.push('0.97 0.97 0.97 rg 48 ' + (y - rowH + 14) + ' 516 ' + rowH + ' re f');
        }
        ops.push('0 0 0 rg');
        text('F1', 8, 56, y + 2, formatPdfDate(row.date));
        text('F1', 8, 128, y + 2, String(row.invoiceNo || ''));
        courseLines.forEach((part, partIndex) => {
            text('F1', 8, 250, y + 2 - partIndex * 11, part);
        });
        text('F1', 8, 420, y + 2, String(row.method || ''));
        text('F1', 8, 478, y + 2, row.amount || '');
        y -= rowH;
    });

    y -= 16;
    ops.push('0.35 0.35 0.35 rg');
    text('F1', 9, 48, y, 'Thank you for learning with Gorythm Academy.');
    y -= 14;
    text('F1', 8, 48, y, 'Keep a copy of this invoice for your records.');
    ops.push('0 0 0 rg 48 36 516 2 re f');
    ops.push('0.35 0.35 0.35 rg');
    text('F1', 8, 48, 22, 'Gorythm Academy  |  www.gorythmacademy.com  |  Page 1 of 1');

    const streamBody = `${ops.join('\n')}\n`;
    const streamBytes = Buffer.from(streamBody, 'utf8');
    const resources = logo
        ? '<< /ProcSet [/PDF /Text /ImageC] /Font << /F1 5 0 R /F2 7 0 R >> /XObject << /Im1 6 0 R >> >>'
        : '<< /ProcSet [/PDF /Text] /Font << /F1 5 0 R /F2 6 0 R >> >>';
    const pdfObjects = [
        Buffer.from('1 0 obj\r\n<< /Type /Catalog /Pages 2 0 R >>\r\nendobj\r\n', 'utf8'),
        Buffer.from('2 0 obj\r\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\r\nendobj\r\n', 'utf8'),
        Buffer.from(
            `3 0 obj\r\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources ${resources} >>\r\nendobj\r\n`,
            'utf8'
        ),
        Buffer.concat([
            Buffer.from(`4 0 obj\r\n<< /Length ${streamBytes.length} >>\r\nstream\r\n`, 'utf8'),
            streamBytes,
            Buffer.from('endstream\r\nendobj\r\n', 'utf8'),
        ]),
        Buffer.from('5 0 obj\r\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\r\nendobj\r\n', 'utf8'),
    ];
    if (logo) {
        pdfObjects.push(Buffer.concat([
            Buffer.from(
                `6 0 obj\r\n<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${logo.rgb.length} >>\r\nstream\r\n`,
                'utf8'
            ),
            logo.rgb,
            Buffer.from('\r\nendstream\r\nendobj\r\n', 'utf8'),
        ]));
        pdfObjects.push(Buffer.from('7 0 obj\r\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\r\nendobj\r\n', 'utf8'));
    } else {
        pdfObjects.push(Buffer.from('6 0 obj\r\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\r\nendobj\r\n', 'utf8'));
    }

    const header = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1');
    const objOffsets = [0];
    const chunks = [header];
    let size = header.length;
    pdfObjects.forEach((obj) => {
        objOffsets.push(size);
        chunks.push(obj);
        size += obj.length;
    });
    const objectCount = objOffsets.length;
    const xrefLines = [`xref\r\n0 ${objectCount}\r\n`, '0000000000 65535 f\r\n'];
    for (let i = 1; i < objectCount; i += 1) {
        xrefLines.push(`${String(objOffsets[i]).padStart(10, '0')} 00000 n\r\n`);
    }
    xrefLines.push(`trailer\r\n<< /Size ${objectCount} /Root 1 0 R >>\r\nstartxref\r\n${size}\r\n%%EOF\r\n`);
    chunks.push(Buffer.from(xrefLines.join(''), 'utf8'));
    return Buffer.concat(chunks);
}

function assembleMultiPagePdf(pageContents, logo) {
    const n = Math.max(1, pageContents.length);
    const pageIds = pageContents.map((_, index) => 3 + index);
    const contentIds = pageContents.map((_, index) => 3 + n + index);
    const font1Id = 3 + (2 * n);
    const imageId = logo ? font1Id + 1 : null;
    const font2Id = logo ? font1Id + 2 : font1Id + 1;
    const resources = logo
        ? `<< /ProcSet [/PDF /Text /ImageC] /Font << /F1 ${font1Id} 0 R /F2 ${font2Id} 0 R >> /XObject << /Im1 ${imageId} 0 R >> >>`
        : `<< /ProcSet [/PDF /Text] /Font << /F1 ${font1Id} 0 R /F2 ${font2Id} 0 R >> >>`;
    const kids = pageIds.map((id) => `${id} 0 R`).join(' ');
    const pdfObjects = [
        Buffer.from('1 0 obj\r\n<< /Type /Catalog /Pages 2 0 R >>\r\nendobj\r\n', 'utf8'),
        Buffer.from(`2 0 obj\r\n<< /Type /Pages /Kids [${kids}] /Count ${n} >>\r\nendobj\r\n`, 'utf8'),
    ];
    pageIds.forEach((pageId, index) => {
        pdfObjects.push(Buffer.from(
            `${pageId} 0 obj\r\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentIds[index]} 0 R /Resources ${resources} >>\r\nendobj\r\n`,
            'utf8'
        ));
    });
    pageContents.forEach((ops, index) => {
        const streamBody = `${ops.join('\n')}\n`;
        const streamBytes = Buffer.from(streamBody, 'utf8');
        pdfObjects.push(Buffer.concat([
            Buffer.from(`${contentIds[index]} 0 obj\r\n<< /Length ${streamBytes.length} >>\r\nstream\r\n`, 'utf8'),
            streamBytes,
            Buffer.from('endstream\r\nendobj\r\n', 'utf8'),
        ]));
    });
    pdfObjects.push(Buffer.from(
        `${font1Id} 0 obj\r\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\r\nendobj\r\n`,
        'utf8'
    ));
    if (logo) {
        pdfObjects.push(Buffer.concat([
            Buffer.from(
                `${imageId} 0 obj\r\n<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${logo.rgb.length} >>\r\nstream\r\n`,
                'utf8'
            ),
            logo.rgb,
            Buffer.from('\r\nendstream\r\nendobj\r\n', 'utf8'),
        ]));
    }
    pdfObjects.push(Buffer.from(
        `${font2Id} 0 obj\r\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\r\nendobj\r\n`,
        'utf8'
    ));

    const header = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1');
    const objOffsets = [0];
    const chunks = [header];
    let size = header.length;
    pdfObjects.forEach((obj) => {
        objOffsets.push(size);
        chunks.push(obj);
        size += obj.length;
    });
    const objectCount = objOffsets.length;
    const xrefLines = [`xref\r\n0 ${objectCount}\r\n`, '0000000000 65535 f\r\n'];
    for (let i = 1; i < objectCount; i += 1) {
        xrefLines.push(`${String(objOffsets[i]).padStart(10, '0')} 00000 n\r\n`);
    }
    xrefLines.push(`trailer\r\n<< /Size ${objectCount} /Root 1 0 R >>\r\nstartxref\r\n${size}\r\n%%EOF\r\n`);
    chunks.push(Buffer.from(xrefLines.join(''), 'utf8'));
    return Buffer.concat(chunks);
}

function statementInvoiceNumber(date = new Date()) {
    const { karachiYear } = require('./invoiceNumber');
    return `GA-${karachiYear(date)}-STMT`;
}

function buildStatementInvoicePdf(payment, { historyRows = [] } = {}) {
    const studentName = payment.studentName || payment.user?.name || 'Student';
    const email = payment.email || payment.user?.email || '';
    const usdTotal = Number(payment.amount || 0);
    const display = invoiceDisplay(payment, usdTotal);
    const currency = display.currency;
    const amount = display.amount;
    const invoiceNo = /^ALL$/i.test(String(payment.invoiceNumber || '').trim())
        ? statementInvoiceNumber(payment.createdAt)
        : invoiceNumberFor({ ...payment, invoiceNumber: payment.invoiceNumber || statementInvoiceNumber(payment.createdAt) });
    const logo = loadBrandLogo();
    const rows = Array.isArray(historyRows) ? historyRows : [];
    const ROW_FLOOR = 170;

    const pages = [];
    const pushPage = () => {
        const ops = [];
        pages.push(ops);
        return ops;
    };
    const textOn = (ops, font, size, x, y, value) => {
        ops.push(`BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(value)}) Tj ET`);
    };

    const drawFirstHeader = (ops) => {
        let nameLeft = 48;
        const displayW = LOGO_DISPLAY_WIDTH;
        const displayH = logo
            ? Math.max(24, (logo.height / Math.max(logo.width, 1)) * displayW)
            : 36;
        const headerTop = LOGO_BOTTOM_Y + displayH;
        const invoiceBoxY = headerTop - INVOICE_BOX_H;
        if (logo) {
            ops.push('q');
            ops.push(`${displayW} 0 0 ${displayH} 48 ${LOGO_BOTTOM_Y} cm`);
            ops.push('/Im1 Do');
            ops.push('Q');
            nameLeft = 48 + displayW + 12;
        }
        ops.push('0 0 0 rg');
        textOn(ops, 'F2', 14, nameLeft, headerTop - 11, 'Gorythm Academy');
        ops.push('0.35 0.35 0.35 rg');
        textOn(ops, 'F1', 9, nameLeft, headerTop - 26, 'www.gorythmacademy.com');
        textOn(ops, 'F1', 9, nameLeft, headerTop - 38, 'info@gorythmacademy.com');
        ops.push(`0.96 0.96 0.96 rg ${INVOICE_BOX_X} ${invoiceBoxY} ${INVOICE_BOX_W} ${INVOICE_BOX_H} re f`);
        ops.push(`0 0 0 RG ${INVOICE_BOX_X} ${invoiceBoxY} ${INVOICE_BOX_W} ${INVOICE_BOX_H} re S`);
        ops.push('0 0 0 rg');
        const boxTextX = INVOICE_BOX_X + 14;
        const boxLineGap = 12;
        const boxBlockH = boxLineGap * 3 + 9;
        const boxBaseY = invoiceBoxY + (INVOICE_BOX_H - boxBlockH) / 2;
        textOn(ops, 'F2', 8, boxTextX, boxBaseY + boxLineGap * 3, 'Statement No.');
        textOn(ops, 'F1', 9, boxTextX, boxBaseY + boxLineGap * 2, invoiceNo.slice(0, 28));
        textOn(ops, 'F2', 8, boxTextX, boxBaseY + boxLineGap, 'Statement date');
        textOn(
            ops,
            'F1',
            9,
            boxTextX,
            boxBaseY,
            formatPdfDate(payment.receiptIssuedAt || payment.verifiedAt || payment.createdAt || new Date())
        );
        ops.push('0 0 0 rg');
        textOn(ops, 'F2', 10, 48, 658, 'Bill to');
        textOn(ops, 'F1', 11, 48, 642, studentName);
        if (email) textOn(ops, 'F1', 9, 48, 628, email);
        if (payment.phone) textOn(ops, 'F1', 9, 48, 614, String(payment.phone));
        ops.push('0 0 0 rg 48 584 516 28 re f');
        ops.push('1 1 1 rg');
        textOn(ops, 'F2', 11, 60, 594, 'Payment history');
        return 568;
    };

    const drawContinuedHeader = (ops) => {
        ops.push('0 0 0 rg');
        textOn(ops, 'F2', 12, 48, 760, 'Gorythm Academy');
        ops.push('0.35 0.35 0.35 rg');
        textOn(ops, 'F1', 9, 48, 746, 'Payment history (continued)');
        ops.push('0 0 0 rg');
        return 726;
    };

    const drawTableHead = (ops, y) => {
        ops.push('0.9 0.9 0.9 rg 48 ' + y + ' 516 18 re f');
        ops.push('0 0 0 rg');
        textOn(ops, 'F2', 8, 56, y + 5, 'Date');
        textOn(ops, 'F2', 8, 128, y + 5, 'Invoice No.');
        textOn(ops, 'F2', 8, 250, y + 5, 'Course');
        textOn(ops, 'F2', 8, 420, y + 5, 'Method');
        textOn(ops, 'F2', 8, 478, y + 5, 'Amount');
        return y - 20;
    };

    let ops = pushPage();
    let y = drawTableHead(ops, drawFirstHeader(ops));

    rows.forEach((row, index) => {
        const courseLines = wrapPdfText(row.course || '', 22);
        const rowH = Math.max(18, 8 + courseLines.length * 11);
        if (y - rowH < ROW_FLOOR) {
            ops = pushPage();
            y = drawTableHead(ops, drawContinuedHeader(ops));
        }
        if (index % 2 === 0) {
            ops.push('0.97 0.97 0.97 rg 48 ' + (y - rowH + 14) + ' 516 ' + rowH + ' re f');
        }
        ops.push('0 0 0 rg');
        textOn(ops, 'F1', 8, 56, y + 2, formatPdfDate(row.date));
        textOn(ops, 'F1', 8, 128, y + 2, String(row.invoiceNo || ''));
        courseLines.forEach((part, partIndex) => {
            textOn(ops, 'F1', 8, 250, y + 2 - partIndex * 11, part);
        });
        textOn(ops, 'F1', 8, 420, y + 2, String(row.method || ''));
        textOn(ops, 'F1', 8, 478, y + 2, row.amount || '');
        y -= rowH;
    });

    const last = pages[pages.length - 1];
    let totalY = 118;
    last.push('0 0 0 RG 48 136 m 564 136 l S');
    last.push('0 0 0 rg');
    textOn(last, 'F2', 10, 330, totalY, 'Subtotal');
    textOn(last, 'F1', 10, 470, totalY, money(amount, currency));
    totalY -= 18;
    textOn(last, 'F2', 12, 330, totalY, 'Total');
    textOn(last, 'F2', 12, 470, totalY, money(amount, currency));
    if (currency !== 'USD' && usdTotal) {
        totalY -= 14;
        last.push('0.35 0.35 0.35 rg');
        textOn(last, 'F1', 8, 330, totalY, 'USD equivalent');
        textOn(last, 'F1', 8, 470, totalY, money(usdTotal, 'USD'));
        last.push('0 0 0 rg');
    }
    last.push('0.35 0.35 0.35 rg');
    textOn(last, 'F1', 9, 48, 70, 'Thank you for learning with Gorythm Academy.');
    textOn(last, 'F1', 8, 48, 56, 'Keep a copy of this statement for your records.');

    const pageCount = pages.length;
    pages.forEach((pageOps, index) => {
        pageOps.push('0 0 0 rg 48 36 516 2 re f');
        pageOps.push('0.35 0.35 0.35 rg');
        textOn(
            pageOps,
            'F1',
            8,
            48,
            22,
            `Gorythm Academy  |  www.gorythmacademy.com  |  Page ${index + 1} of ${pageCount}`
        );
    });

    return assembleMultiPagePdf(pages, logo);
}

/** Invoice PDF (kind is accepted for compatibility; receipts use the same invoice document). */
function buildPaymentInvoicePdf(payment, { kind = 'invoice', lineFilter = null, historyRows = null, statement = false } = {}) {
    void kind;
    if (statement) return buildStatementInvoicePdf(payment, { historyRows: historyRows || [] });
    return buildProfessionalInvoicePdf(payment, { lineFilter, historyRows });
}

module.exports = {
    buildPaymentInvoicePdf,
    paymentLines,
    invoiceDisplay,
    methodLabel,
    money,
    invoiceNumberFor,
    statementInvoiceNumber,
};
