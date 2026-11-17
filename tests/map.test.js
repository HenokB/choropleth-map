import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { makeMap, projectionFor, regions, inRegion } from '../src/map.js';
import { palettes, noData } from '../src/colors.js';
const context = vm.createContext({});
for (const name of ['d3-array', 'd3-geo']) vm.runInContext(readFileSync(new URL(`../assets/vendor/${name}.min.js`, import.meta.url), 'utf8'), context);
const d3 = context.d3;
const features = JSON.parse(readFileSync(new URL('../assets/data/world.geojson', import.meta.url))).features;
const base = { values: new Map([['CAN',0],['ATA',0]]), range: [0,50,100], colors: palettes[0].colors, empty: noData, title: '<script>alert("test")</script>', label: 'Value & count', labels: true, legend: true, includeCaption: true, caption: 'Example caption' };
for (const region of regions) test(`${region}: finite geometry, visible land, valid labels and export markup`, () => {
  const svg = makeMap(features, { ...base, region }, d3);
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.endsWith('</svg>'));
  assert.ok(!svg.includes('NaN'));
  assert.ok(!svg.includes('Infinity'));
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.ok(svg.includes('Value &amp; count'));
  const projection = projectionFor(region, features, d3), path = d3.geoPath(projection);
  const area = features.filter(f => inRegion(f, region)).reduce((sum, f) => sum + path.area(f), 0);
  assert.ok(area > 5000 && area < 1000000, `land area ${area}`);
});
test('all 242 features have unique IDs, geometry, aliases and a supported grouping', () => {
  assert.equal(features.length, 242);
  assert.equal(new Set(features.map(f => f.id)).size, 242);
  for (const f of features) {
    assert.match(f.id, /^[A-Z]{3}$/);
    assert.ok(f.geometry.coordinates.length);
    assert.ok(f.properties.aliases.length);
    assert.ok(regions.includes(f.properties.continent));
  }
});
test('world export includes Antarctica and Pacific islands', () => {
  const svg = makeMap(features, { ...base, region: 'World' }, d3);
  for (const id of ['ATA','FJI','NZL','KIR','TUV','MHL','TON']) assert.ok(svg.includes(`data-id="${id}"`), id);
});

test('caption-free exports omit visible captions, branding, grids, and backgrounds', () => {
  const svg = makeMap(features, { ...base, region: 'World', includeCaption: false, legend: false, labels: false }, d3);
  assert.ok(!svg.includes('<text'));
  assert.ok(!svg.includes('map-caption"'));
  assert.ok(!svg.includes('Atlas'));
  assert.ok(!svg.includes('fill="#fafcfb"'));
  assert.ok(!svg.includes('fill="none"'));
  assert.ok(!svg.includes('<rect width="1000"'));
  assert.ok(svg.includes('viewBox="0 84 1000 464"'));
  assert.ok(svg.includes('data-id="CAN"'));
});
test('captions are escaped and independent from the legend', () => {
  const svg = makeMap(features, { ...base, region: 'Africa', includeCaption: true, caption: 'A < B & C', legend: false, labels: false }, d3);
  assert.ok(svg.includes('class="map-title"'));
  assert.ok(svg.includes('A &lt; B &amp; C'));
  assert.ok(!svg.includes('fill="url(#ramp)"'));
});
