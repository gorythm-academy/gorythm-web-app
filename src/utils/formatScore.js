/** Display score with optional max (no implicit /100). */
export function formatScore(score, maxPoints) {
  if (score == null || score === '') return '—';
  if (maxPoints != null && maxPoints > 0) return `${score} / ${maxPoints}`;
  return String(score);
}
