/** CSV parsing and country matching. No DOM or runtime dependencies. */
export function normalize(value) {
  return String(value ?? '').trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function parseCSV(input) {
  let text = String(input).replace(/^\ufeff/, '');
  const separator = text.match(/^sep=([,;\t])\r?\n/i);
  if (separator) text = text.slice(separator[0].length);
  const first = text.split(/\r?\n/)[0];
  const frequency = delimiter => {
    let quoted = false, count = 0;
    for (let i = 0; i < first.length; i++) {
      if (first[i] === '"') { if (quoted && first[i + 1] === '"') i++; else quoted = !quoted; }
      else if (!quoted && first[i] === delimiter) count++;
    }
    return count;
  };
  const delimiter = separator?.[1] ?? [',', '\t', ';'].sort((a, b) => frequency(b) - frequency(a))[0];
  const rows = [];
  let row = [], field = '', quoted = false;
  const pushRow = () => {
    row.push(field);
    if (row.some(cell => cell.trim())) rows.push(row);
    row = []; field = '';
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && c === delimiter) { row.push(field); field = ''; }
    else if (!quoted && /[\r\n]/.test(c)) { if (c === '\r' && text[i + 1] === '\n') i++; pushRow(); }
    else field += c;
  }
  if (quoted) throw new Error('Unclosed quote. Check your CSV and try again.');
  pushRow();
  return rows;
}

const aliases = {
  usa: 'USA', us: 'USA', america: 'USA', uk: 'GBR', britain: 'GBR', 'great britain': 'GBR',
  'south korea': 'KOR', 'north korea': 'PRK', russia: 'RUS', vietnam: 'VNM',
  'ivory coast': 'CIV', 'cote d ivoire': 'CIV', 'cape verde': 'CPV',
  'dr congo': 'COD', drc: 'COD', 'congo kinshasa': 'COD', 'democratic republic of congo': 'COD',
  congo: 'COG', 'congo brazzaville': 'COG', 'republic of congo': 'COG',
  swaziland: 'SWZ', 'the gambia': 'GMB', 'east timor': 'TLS',
  burma: 'MMR', czechia: 'CZE', turkiye: 'TUR', palestine: 'PSE', kosovo: 'KOS',
  'sao tome and principe': 'STP', 'united republic of tanzania': 'TZA',
  'bahamas': 'BHS', 'the bahamas': 'BHS', 'uae': 'ARE', 'laos': 'LAO',
};
export function countryIndex(features) {
  const index = new Map();
  for (const f of features) {
    for (const name of [f.id, f.properties.name, ...f.properties.aliases]) index.set(normalize(name), f.id);
  }
  for (const [alias, id] of Object.entries(aliases)) {
    if (features.some(f => f.id === id)) index.set(normalize(alias), id);
  }
  return index;
}

export const COUNTRY_HEADERS = ['country', 'countries', 'country name', 'country or territory', 'countries spoken', 'country spoken', 'location', 'nation', 'iso', 'iso2', 'iso3', 'country code'];
export const VALUE_HEADERS = ['value', 'count', 'language count', 'number of languages', 'total', 'languages supported', 'n'];
export function readData(text, index) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('Add a header and at least one data row.');
  const headers = rows[0].map(normalize);
  const ci = headers.findIndex(h => COUNTRY_HEADERS.includes(h));
  const vi = headers.findIndex(h => VALUE_HEADERS.includes(h));
  const codeIndex = headers.findIndex(h => ['code', 'language code', 'language id'].includes(h));
  const li = codeIndex >= 0 ? codeIndex : headers.findIndex(h => ['language', 'language name'].includes(h));
  if (ci < 0) throw new Error('A Country or ISO column is required.');
  if (vi < 0 && li < 0) throw new Error('Add a Value column, or a Language / Code column.');
  const values = new Map(), sets = new Map(), issues = [];
  let accepted = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i], raw = (row[ci] ?? '').trim();
    if (!raw) { issues.push(`Row ${i + 1}: missing country`); continue; }
    const numeric = vi >= 0;
    const rawValue = String(row[numeric ? vi : li] ?? '').trim();
    const value = numeric ? Number(rawValue.replace(/,/g, '')) : rawValue;
    if (!rawValue || (numeric && !Number.isFinite(value))) {
      issues.push(`Row ${i + 1}: missing or invalid ${numeric ? 'value' : 'language'}`); continue;
    }
    const parts = index.has(normalize(raw)) ? [raw] : raw.split(/[,;|]/).map(v => v.trim()).filter(Boolean);
    const ids = new Set();
    for (const part of parts) {
      const id = index.get(normalize(part));
      if (id) ids.add(id); else issues.push(`Row ${i + 1}: unknown country “${part}”`);
    }
    if (!ids.size) continue;
    accepted++;
    for (const id of ids) {
      if (numeric) {
        const sum = (values.get(id) ?? 0) + value;
        if (!Number.isFinite(sum)) throw new Error(`Values for ${id} exceed the supported numeric range.`);
        values.set(id, sum);
      } else {
        if (!sets.has(id)) sets.set(id, new Set());
        sets.get(id).add(value);
      }
    }
  }
  if (vi < 0) for (const [id, set] of sets) values.set(id, set.size);
  if (!values.size) throw new Error('No valid country values found. Use country names or ISO codes.');
  return { values, issues, accepted, label: vi >= 0 ? rows[0][vi] : 'Languages' };
}

export function toCSV(values, features) {
  const names = new Map(features.map(f => [f.id, f.properties.name]));
  const escape = v => '"' + String(v).replace(/"/g, '""') + '"';
  return [['Country', 'ISO3', 'Value'], ...[...values].sort(([a], [b]) => names.get(a).localeCompare(names.get(b))).map(([id, value]) => [names.get(id), id, value])]
    .map(row => row.map(escape).join(',')).join('\r\n');
}
