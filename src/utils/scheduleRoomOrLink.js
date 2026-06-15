export function getMeetingHref(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  if (/^(zoom\.us|meet\.google\.com|teams\.microsoft\.com)/i.test(trimmed)) return `https://${trimmed}`;
  return null;
}
