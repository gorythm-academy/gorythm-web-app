/** Build `/research` query string, preserving tag + search and normalizing page. */
export function buildResearchListQuery({ q = '', tag = '', page = null } = {}) {
  const params = new URLSearchParams();
  const query = String(q || '').trim();
  const tagSlug = String(tag || '').trim().toLowerCase();
  if (query) params.set('q', query);
  if (tagSlug) params.set('tag', tagSlug);
  const pageNum = parseInt(page, 10);
  if (Number.isFinite(pageNum) && pageNum > 1) params.set('page', String(pageNum));
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export function formatTagLabel(slug) {
  return String(slug || '')
    .toLowerCase()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function postMatchesTag(post, tagSlug) {
  if (!tagSlug) return true;
  const normalized = String(tagSlug).toLowerCase();
  return (post.tags || []).some((tag) => String(tag).toLowerCase() === normalized);
}

export function postMatchesSearch(post, keywords) {
  if (!keywords?.length) return true;
  const tagText = (post.tags || []).join(' ');
  const text = `${post.title} ${post.excerpt} ${post.category} ${tagText}`.toLowerCase();
  return keywords.every((kw) => text.includes(kw));
}
