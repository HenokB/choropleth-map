import { normalize, COUNTRY_HEADERS, VALUE_HEADERS } from './data.js';

function xmlDocument(text) {
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('Could not read an Excel worksheet.');
  return document;
}
const elements = (node, name) => [...node.getElementsByTagName('*')].filter(element => element.localName === name);
function columnIndex(reference) {
  let index = 0;
  for (const letter of (reference.match(/^[A-Za-z]+/)?.[0] ?? '').toUpperCase()) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}
function resolvePath(base, target) {
  if (target.startsWith('/')) return target.replace(/^\/+/, '');
  const result = [];
  for (const part of `${base}/${target}`.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') result.pop(); else result.push(part);
  }
  return result.join('/');
}
const quote = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';

/** Read cached cell values from XLSX without evaluating formulas or contacting a service. */
export async function xlsxToCSV(file) {
  if (!globalThis.JSZip) throw new Error('Excel reader did not load. Try saving as CSV.');
  const zip = await globalThis.JSZip.loadAsync(file);
  let expandedSize = 0;
  for (const entry of Object.values(zip.files)) {
    expandedSize += entry._data?.uncompressedSize ?? 0;
    if (expandedSize > 100 * 1024 * 1024) throw new Error('Workbook expands beyond 100 MB. Export the relevant sheet as CSV.');
  }
  const workbookFile = zip.file('xl/workbook.xml');
  if (!workbookFile) throw new Error('This is not a supported XLSX workbook.');
  const workbook = xmlDocument(await workbookFile.async('string'));
  const relationships = new Map();
  const relationsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (relationsFile) {
    const document = xmlDocument(await relationsFile.async('string'));
    for (const relation of elements(document, 'Relationship')) {
      if (relation.getAttribute('TargetMode') === 'External') continue;
      relationships.set(relation.getAttribute('Id'), resolvePath('xl', relation.getAttribute('Target') ?? ''));
    }
  }
  let shared = [];
  const stringsFile = zip.file('xl/sharedStrings.xml');
  if (stringsFile) {
    const document = xmlDocument(await stringsFile.async('string'));
    shared = elements(document, 'si').map(item => elements(item, 't').map(text => text.textContent).join(''));
  }
  const candidates = [];
  for (const [index, sheet] of elements(workbook, 'sheet').entries()) {
    const id = sheet.getAttribute('r:id') || sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const file = zip.file(relationships.get(id) ?? `xl/worksheets/sheet${index + 1}.xml`);
    if (!file) continue;
    const document = xmlDocument(await file.async('string'));
    const data = [];
    for (const row of elements(document, 'row')) {
      const cells = [];
      for (const cell of elements(row, 'c')) {
        const column = columnIndex(cell.getAttribute('r') ?? 'A');
        if (column < 0 || column > 150) continue;
        const type = cell.getAttribute('t');
        const value = elements(cell, 'v')[0]?.textContent ?? '';
        const inline = elements(cell, 'is')[0];
        if (type === 'inlineStr' && inline) cells[column] = elements(inline, 't').map(text => text.textContent).join('');
        else if (type === 's') cells[column] = shared[Number(value)] ?? '';
        else if (type === 'b') cells[column] = value === '1' ? 'TRUE' : 'FALSE';
        else if (type === 'e') cells[column] = ''; // Excel errors are invalid data, not numbers.
        else cells[column] = value;
      }
      if (cells.some(value => String(value ?? '').trim())) data.push(Array.from(cells, value => value ?? ''));
    }
    for (let row = 0; row < Math.min(data.length, 25); row++) {
      const headers = data[row].map(normalize);
      const hasCountry = headers.some(header => COUNTRY_HEADERS.includes(header));
      const hasValue = headers.some(header => [...VALUE_HEADERS, 'code', 'language', 'language code', 'language name', 'language id'].includes(header));
      if (hasCountry && hasValue) {
        candidates.push({ rows: data.slice(row), codeSheet: headers.some(header => ['code', 'language code', 'language id'].includes(header)) });
        break;
      }
    }
  }
  if (!candidates.length) throw new Error('Excel needs Country + Value, or Code + Countries Spoken columns.');
  candidates.sort((a, b) => Number(b.codeSheet) - Number(a.codeSheet) || b.rows.length - a.rows.length);
  return candidates[0].rows.map(row => row.map(quote).join(',')).join('\r\n');
}
