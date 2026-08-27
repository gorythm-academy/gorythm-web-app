/** Page numbers with ellipsis gaps for compact admin table pagination. */
export function getPaginationPageItems(currentPage, totalPages, siblingCount = 1) {
  if (totalPages <= 1) return [1];

  const pages = new Set([1, totalPages]);
  for (let page = currentPage - siblingCount; page <= currentPage + siblingCount; page += 1) {
    if (page >= 1 && page <= totalPages) pages.add(page);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const items = [];

  for (let index = 0; index < sorted.length; index += 1) {
    if (index > 0 && sorted[index] - sorted[index - 1] > 1) {
      items.push('ellipsis');
    }
    items.push(sorted[index]);
  }

  return items;
}
