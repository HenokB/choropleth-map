import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCSV, readData, countryIndex, toCSV } from '../src/data.js';
import { colorFor, fitRange, noData, palettes } from '../src/colors.js';
const features = JSON.parse(readFileSync(new URL('../assets/data/world.geojson', import.meta.url))).features;
const index = countryIndex(features);

test('CSV handles BOM, quoted delimiters, escaped quotes, CRLF and multiline cells', () => {
  assert.deepEqual(parseCSV('\ufeffCountry,Value,Note\r\n"Canada",0,"a, b\n""quoted"""'), [['Country','Value','Note'], ['Canada','0','a, b\n"quoted"']]);
  assert.deepEqual(parseCSV('sep=;\nCountry;Value\nJapan;3'), [['Country','Value'], ['Japan','3']]);
  assert.deepEqual(parseCSV('Country\tValue\nJapan\t2'), [['Country','Value'], ['Japan','2']]);
  assert.throws(() => parseCSV('Country,Value\n"bad,3'), /Unclosed quote/);
});
test('country names, ISO codes, aliases, zero, negatives and duplicates', () => {
  const result = readData('Country,Value\nCA,0\nCanada,-2.5\nCAN,5\nIvory Coast,8\nDRC,3\nUK,9\nTürkiye,4', index);
  assert.equal(result.values.get('CAN'), 2.5);
  assert.equal(result.values.get('CIV'), 8);
  assert.equal(result.values.get('COD'), 3);
  assert.equal(result.values.get('GBR'), 9);
  assert.equal(result.values.get('TUR'), 4);
  assert.deepEqual(result.issues, []);
});
test('all seven continents and ISO aliases resolve from map metadata', () => {
  const values = readData('Country,Value\nCanada,1\nBrazil,2\nEthiopia,3\nFrance,4\nJapan,5\nAustralia,6\nAntarctica,0', index).values;
  assert.equal(values.size, 7);
  assert.equal(values.get('ATA'), 0);
  assert.equal(index.get('fiji'), 'FJI');
  assert.equal(index.get('new zealand'), 'NZL');
});
test('invalid and blank values are reported, never silently turned into zero', () => {
  const result = readData('Country,Value\nCanada,\nJapan,NaN\nFrance,5\nAtlantis,8\n,3', index);
  assert.equal(result.values.size, 1);
  assert.equal(result.issues.length, 4);
  assert.equal(result.accepted, 1);
  assert.throws(() => readData('Country,Value\nCanada,', index), /No valid/);
  assert.throws(() => readData('Country,Value\nCanada,1e308\nCanada,1e308', index), /numeric range/);
});
test('language mode deduplicates per country and handles multi-country cells', () => {
  const result = readData('Code,Language,Countries Spoken\nen,English,"Canada, United States"\nen,English,CA\nfr,French,"Canada;France"', index);
  assert.equal(result.values.get('CAN'), 2);
  assert.equal(result.values.get('USA'), 1);
  assert.equal(result.values.get('FRA'), 1);
});
test('exported CSV round trips aggregated values', () => {
  const original = readData('Country,Value\nCote d Ivoire,-2.5\nCAN,0\nJP,2', index).values;
  const roundtrip = readData(toCSV(original, features), index).values;
  assert.deepEqual([...roundtrip].sort(), [...original].sort());
});
test('zero and negative data are distinct from missing values; constant scales are stable', () => {
  const colors = palettes[0].colors;
  assert.equal(colorFor(undefined, [0,50,100], colors), noData);
  assert.equal(colorFor(0, [0,50,100], colors), colors[0]);
  assert.equal(colorFor(-5, [-5,0,5], colors), colors[0]);
  assert.equal(colorFor(4, [4,4,4], colors), colors[1]);
  assert.deepEqual(fitRange(new Map([['a', -5], ['b', 0]])), [-5,-2.5,0]);
});

test('Australia aliases cannot be stolen by offshore territory records', () => {
  assert.equal(index.get('au'), 'AUS');
  assert.equal(index.get('aus'), 'AUS');
  assert.equal(index.get('australia'), 'AUS');
  assert.equal(index.get('ashmore and cartier islands'), 'ATC');
});

test('downloadable sample has two columns and covers all seven continents', () => {
  const text = readFileSync(new URL('../examples/sample.csv', import.meta.url), 'utf8');
  assert.ok(parseCSV(text).every(row => row.length === 2));
  const result = readData(text, index);
  assert.equal(result.values.size, 22);
  assert.equal(result.issues.length, 0);
  assert.equal(new Set(features.filter(f => result.values.has(f.id)).map(f => f.properties.continent)).size, 7);
});
