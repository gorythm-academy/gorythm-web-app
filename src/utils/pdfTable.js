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
  doc.text(title, margin, y);
  y += 7;

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const subLines = doc.splitTextToSize(subtitle, tableWidth);
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
      const lines = doc.splitTextToSize(String(header), colWidth - 4);
      doc.text(lines.slice(0, 2), x + 2, y + 6);

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
      const text = String(cell ?? '—');
      const lines = doc.splitTextToSize(text, colWidth - 4);
      doc.text(lines.slice(0, 1), x + 2, y + 4.8);
      x += colWidth;
    });
    y += rowHeight;
  };

  drawHeader();
  rows.forEach((row) => drawRow(row));

  return y;
}
