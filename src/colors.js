export const palettes = [
  { name: 'Lagoon', colors: ['#dcefea', '#60b3a1', '#14594f'] },
  { name: 'Ocean', colors: ['#e0ebf5', '#6b9fce', '#234b7a'] },
  { name: 'Terracotta', colors: ['#f6e7d7', '#d89b73', '#954932'] },
  { name: 'Iris', colors: ['#eee7f5', '#ad94c7', '#644685'] },
  { name: 'Rose', colors: ['#f6e6ea', '#d18b9d', '#8e3d5c'] },
  { name: 'Diverging', colors: ['#b85b48', '#f3eee4', '#34867a'] },
];
export const noData = '#e6eae7';
export function fitRange(values) {
  const numbers = [...values.values()];
  const min = numbers.length ? Math.min(...numbers) : 0;
  const max = numbers.length ? Math.max(...numbers) : 100;
  return [min, min / 2 + max / 2, max];
}
function mix(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  const rgb = color => color.slice(1).match(/../g).map(v => parseInt(v, 16));
  const right = rgb(b);
  return '#' + rgb(a).map((v, i) => Math.round(v + (right[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
export function colorFor(value, range, colors, empty = noData) {
  if (value === undefined || value === null || !Number.isFinite(value)) return empty;
  const [min, mid, max] = range;
  if (min === max) return colors[1];
  if (value <= mid) return mix(colors[0], colors[1], mid === min ? 1 : (value - min) / (mid - min));
  return mix(colors[1], colors[2], max === mid ? 1 : (value - mid) / (max - mid));
}
export function format(value) {
  const absolute = Math.abs(value);
  const notation = absolute >= 1e6 ? 'compact' : absolute > 0 && absolute < 0.01 ? 'scientific' : 'standard';
  return new Intl.NumberFormat('en', { maximumFractionDigits: 2, notation }).format(value);
}
