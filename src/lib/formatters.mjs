export function formatGroup(g) {
  const s = String(g || '').toUpperCase();
  return ['A','B','C','D'].includes(s) ? s : '';
}
export function formatFigure(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 1) return '';
  return String(num).padStart(2, '0');
}
export function formatGroupFigure(group, figure) {
  const g = formatGroup(group);
  const f = formatFigure(figure);
  return g && f ? `${g}#${f}` : '';
}
