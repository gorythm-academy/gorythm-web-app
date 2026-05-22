/** Stable Mongo document id string for portal API paths. */
export function portalDocId(doc) {
  if (doc == null) return '';
  if (typeof doc === 'string' || typeof doc === 'number') return String(doc).trim();
  const raw = doc._id ?? doc.id;
  if (raw == null) return '';
  if (typeof raw === 'object' && typeof raw.toString === 'function') return String(raw.toString()).trim();
  return String(raw).trim();
}
