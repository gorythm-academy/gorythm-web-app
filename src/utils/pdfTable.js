/**
 * Helvetica in jsPDF cannot draw a euro sign or an em dash. Those characters
 * used to abort the whole download with no message.
 */
export function pdfSafeText(value) {
  return String(value ?? '-')
    .replace(/\u20AC/g, 'EUR ')
    .replace(/[\u2012\u2013\u2014\u2015]/g, '-')
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\n\r\t\x20-\x7E\u00A1-\u00FF]/g, '?');
}

function drawPdfText(doc, value, x, y, maxWidth, maxLines) {
  const lines = doc.splitTextToSize(pdfSafeText(value), maxWidth);
  doc.text(lines.slice(0, maxLines), x, y);
}

/**
 * Draw a simple grid table in jsPDF (no autotable dependency).
 * Header text uses explicit text color so fill rects do not black out labels.
 */
export function drawPdfTable(doc, { title, subtitle, headers, rows, margin = 12 }) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const tableWidth = pageWidth - margin * 2;
  const colCount = headers.length;
  const colWidth = tableWidth / colCount;

  let y = margin;

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  drawPdfText(doc, title, margin, y, tableWidth, 2);
  y += 7;

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const subLines = doc.splitTextToSize(pdfSafeText(subtitle), tableWidth);
    doc.text(subLines, margin, y);
    y += subLines.length * 4 + 4;
  }

  const headerHeight = 9;
  const rowHeight = 7;

  const drawHeader = () => {
    let x = margin;
    headers.forEach((header) => {
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.rect(x, y, colWidth, headerHeight, 'F');
      doc.rect(x, y, colWidth, headerHeight, 'S');

      doc.setTextColor(51, 65, 85);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      drawPdfText(doc, header, x + 2, y + 6, colWidth - 4, 2);

      x += colWidth;
    });
    doc.setFillColor(255, 255, 255);
    doc.setTextColor(30, 41, 59);
    y += headerHeight;
  };

  const drawRow = (cells) => {
    if (y + rowHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
      drawHeader();
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    doc.setDrawColor(226, 232, 240);
    let x = margin;
    cells.forEach((cell) => {
      doc.setFillColor(255, 255, 255);
      doc.rect(x, y, colWidth, rowHeight, 'S');
      drawPdfText(doc, cell ?? '-', x + 2, y + 4.8, colWidth - 4, 1);
      x += colWidth;
    });
    y += rowHeight;
  };

  drawHeader();
  rows.forEach((row) => drawRow(row));

  return y;
}
