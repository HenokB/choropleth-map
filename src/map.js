import { colorFor, format } from './colors.js';

export const regions = ['World', 'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania', 'Antarctica'];
const frames = {
  Africa: [20, [-20, -36], [64, 38]],
  Asia: [100, [25, -12], [190, 78]],
  Europe: [20, [-25, 33], [65, 73]],
  'North America': [-100, [-173, 6], [-15, 83]],
  'South America': [-60, [-84, -57], [-32, 14]],
  Oceania: [180, [110, -52], [235, 30]],
};
export function inRegion(feature, region) {
  if (region === 'World') return true;
  if (['RUS', 'TUR', 'KAZ', 'GEO', 'AZE'].includes(feature.id) && ['Europe', 'Asia'].includes(region)) return true;
  return feature.properties.continent === region;
}
export function escapeXML(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}
export function projectionFor(region, features, d3) {
  const extent = [[30, 96], [970, 538]];
  if (region === 'World') return d3.geoEqualEarth().fitExtent(extent, { type: 'Sphere' });
  if (region === 'Antarctica') return d3.geoStereographic().rotate([0, 90]).clipAngle(45)
    .fitExtent(extent, { type: 'FeatureCollection', features: features.filter(f => f.properties.continent === 'Antarctica') });
  const [center, lower, upper] = frames[region];
  return d3.geoMercator().rotate([-center, 0]).fitExtent(extent, { type: 'MultiPoint', coordinates: [lower, upper] }).clipExtent(extent);
}

// Cache geography independently from user data: colors and copy never reproject land.
const geometryCache = new WeakMap();
function geometryFor(features, region, d3) {
  let regionsCache = geometryCache.get(features);
  if (!regionsCache) { regionsCache = new Map(); geometryCache.set(features, regionsCache); }
  if (regionsCache.has(region)) return regionsCache.get(region);
  const projection = projectionFor(region, features, d3);
  const path = d3.geoPath(projection).digits(2);
  const shapes = features.filter(f => inRegion(f, region)).map(f => ({
    f, shape: path(f), point: projection(f.properties.label), area: path.area(f),
  }));
  const geometry = { shapes };
  regionsCache.set(region, geometry);
  return geometry;
}

/** Produce the same self-contained vector artwork for preview and export. */
export function makeMap(features, state, d3 = globalThis.d3) {
  const { region, values, range, colors, empty, title, label, labels, legend, caption, includeCaption = false } = state;
  const geometry = geometryFor(features, region, d3);
  const visible = [];
  const middle = range[0] === range[2] ? 50 : 100 * (range[1] - range[0]) / (range[2] - range[0]);
  const top = includeCaption ? 0 : 84;
  const height = (legend ? 630 : 548) - top;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="${height * 1.6}" viewBox="0 ${top} 1000 ${height}" role="img" aria-labelledby="map-title map-description">`,
    `<title id="map-title">${escapeXML(title || region)}</title><desc id="map-description">${escapeXML(region)} choropleth. ${escapeXML(label)}. Countries without values are shown separately.</desc>`,
    `<defs><linearGradient id="ramp"><stop offset="0%" stop-color="${colors[0]}"/><stop offset="${middle}%" stop-color="${colors[1]}"/><stop offset="100%" stop-color="${colors[2]}"/></linearGradient><clipPath id="map-clip"><rect x="25" y="90" width="950" height="455"/></clipPath></defs>`,
  ];
  if (includeCaption) {
    parts.push(`<text class="map-title" x="42" y="43" font-family="Arial,sans-serif" font-size="21" font-weight="600" fill="#253a34">${escapeXML(title || region)}</text>`);
    if (caption) parts.push(`<text class="map-caption" x="42" y="65" font-family="Arial,sans-serif" font-size="11" fill="#7b8983">${escapeXML(caption)}</text>`);
  }
  parts.push('<g clip-path="url(#map-clip)">');
  for (const { f, shape, point, area } of geometry.shapes) {
    if (!shape) continue;
    const value = values.get(f.id), name = f.properties.name;
    const fill = colorFor(value, range, colors, empty);
    parts.push(`<path class="country" data-id="${f.id}" d="${shape}" fill="${fill}" stroke="#ffffff" stroke-width="0.65" stroke-linejoin="round"><title>${escapeXML(name)}: ${value === undefined ? 'No data' : format(value)}</title></path>`);
    if (point && point[0] > 30 && point[0] < 970 && point[1] > 96 && point[1] < 538) {
      visible.push({ f, point, area });
    }
  }
  // Tiny islands retain a usable target without pretending the marker is a boundary.
  for (const { f, point, area } of visible) if (area < 7) {
    const value = values.get(f.id);
    parts.push(`<circle class="country island-marker" data-id="${f.id}" cx="${point[0].toFixed(2)}" cy="${point[1].toFixed(2)}" r="2.4" fill="${colorFor(value, range, colors, empty)}" stroke="#fff" stroke-width="0.7"><title>${escapeXML(f.properties.name)} (island marker): ${value === undefined ? 'No data' : format(value)}</title></circle>`);
  }
  if (labels) {
    const occupied = [];
    for (const { f, point, area } of visible.sort((a, b) => b.area - a.area)) {
      if (area < 220) continue;
      const text = f.properties.name, width = text.length * 5.3;
      const box = [point[0] - width / 2, point[1] - 7, point[0] + width / 2, point[1] + 7];
      if (occupied.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
      occupied.push(box);
      parts.push(`<text x="${point[0].toFixed(2)}" y="${point[1].toFixed(2)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#273c35" stroke="#ffffff" stroke-width="2.5" paint-order="stroke" pointer-events="none">${escapeXML(text)}</text>`);
    }
  }
  parts.push('</g>');
  if (legend) {
    parts.push('<g font-family="Arial,sans-serif" font-size="11" fill="#66766e">');
    parts.push(`<text x="42" y="574">${escapeXML(label)}</text><rect x="42" y="585" width="210" height="8" rx="2" fill="url(#ramp)"/>`);
    parts.push(`<text x="42" y="611">${format(range[0])}</text><text x="252" y="611" text-anchor="end">${format(range[2])}</text>`);
    parts.push(`<rect x="286" y="584" width="10" height="10" rx="2" fill="${empty}"/><text x="303" y="593">No data</text></g>`);
  }
  parts.push('</svg>');
  return parts.join('');
}
