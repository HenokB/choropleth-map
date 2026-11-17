import { countryIndex, readData, toCSV } from './data.js';
import { palettes, noData, fitRange, format, colorFor } from './colors.js';
import { regions, inRegion, makeMap, escapeXML } from './map.js';
import { download, downloadPNG } from './export.js';

const $ = id => document.getElementById(id);
const state = {
  region: 'World', values: new Map(), range: [0, 50, 100], colors: [...palettes[0].colors],
  empty: noData, title: 'Country values', label: 'Value', caption: 'Example data — not real statistics',
  labels: false, legend: true, includeCaption: false, demo: true,
};
let features = [], index, svg = '', importVersion = 0, toastTimer;
const dialog = $('import-dialog');
function notify(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}
function syncRange() {
  ['min', 'mid', 'max'].forEach((key, i) => { $('range-' + key).value = state.range[i]; });
  $('range-error').textContent = '';
}
function syncColors() {
  ['low', 'mid', 'high'].forEach((key, i) => { $('color-' + key).value = state.colors[i]; });
  $('color-empty').value = state.empty;
  const selected = palettes.find(p => p.colors.every((c, i) => c === state.colors[i]));
  $('palette-name').textContent = selected?.name ?? 'Custom';
  document.querySelectorAll('.palette').forEach(el => el.setAttribute('aria-pressed', String(el.title === selected?.name)));
}
function renderTable() {
  const query = $('search').value.toLocaleLowerCase().trim();
  const selected = features.filter(f => inRegion(f, state.region));
  const entries = selected.filter(f => !query || `${f.properties.name} ${f.id} ${f.properties.aliases.join(' ')}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => {
      const av = state.values.get(a.id), bv = state.values.get(b.id);
      if (av === undefined && bv !== undefined) return 1;
      if (bv === undefined && av !== undefined) return -1;
      return (bv ?? 0) - (av ?? 0) || a.properties.name.localeCompare(b.properties.name);
    });
  const max = Math.max(1, ...[...state.values.values()].map(Math.abs));
  $('table-count').textContent = `${entries.length}`;
  $('table-value-label').textContent = state.label;
  $('table-body').innerHTML = entries.map(f => {
    const value = state.values.get(f.id);
    return `<tr class="data-row" data-id="${f.id}"><td>${escapeXML(f.properties.name)}</td><td>${f.id}</td><td><div class="value-cell">${value === undefined ? '' : `<span class="bar" aria-hidden="true"><i style="width:${Math.abs(value) / max * 100}%;background:${colorFor(value, state.range, state.colors)}"></i></span>`}<span>${value === undefined ? '—' : format(value)}</span></div></td></tr>`;
  }).join('') || '<tr><td colspan="3" class="empty-row">No countries found.</td></tr>';
}
function render() {
  svg = makeMap(features, state);
  $('map-mount').innerHTML = svg;
  $('tooltip').hidden = true;
  $('region-name').textContent = state.region;
  $('example-badge').hidden = !state.demo;
  const selected = features.filter(f => inRegion(f, state.region));
  const mapped = selected.filter(f => state.values.has(f.id)).length;
  $('map-count').textContent = `${mapped} of ${selected.length} countries & territories with data`;
  renderTable();
}
function setIssues(issues) {
  $('issues-panel').hidden = !issues.length;
  $('issues-panel').open = false;
  $('issues-summary').textContent = `${issues.length} import ${issues.length === 1 ? 'issue' : 'issues'} — review skipped values`;
  $('issues-list').replaceChildren(...issues.slice(0, 100).map(text => {
    const li = document.createElement('li'); li.textContent = text; return li;
  }));
  if (issues.length > 100) {
    const note = document.createElement('li'); note.textContent = `Showing the first 100 of ${issues.length} issues.`; $('issues-list').append(note);
  }
}
function applyData(text, filename, demo = false) {
  // Parse first. A failed import must never replace the current map.
  const result = readData(text, index);
  state.values = result.values; state.range = fitRange(result.values); state.demo = demo;
  state.label = result.label;
  if (demo) state.caption = 'Example data — not real statistics';
  else if (state.caption === 'Example data — not real statistics') state.caption = '';
  $('map-caption').value = state.caption;
  $('map-name').value = state.title; $('value-label').value = state.label;
  $('source-name').textContent = filename;
  $('source-name').title = filename;
  syncRange(); setIssues(result.issues); render();
  return result;
}
async function loadExample() {
  const response = await fetch('./examples/sample.csv');
  if (!response.ok) throw new Error('Example data could not load. Refresh and try again.');
  const text = await response.text();
  $('sample-preview').textContent = text.trim();
  applyData(text, 'sample.csv · 2 columns', true);
}
let excelLoader;
async function readExcel(file) {
  if (!excelLoader) excelLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = './assets/vendor/jszip.min.js';
    script.onload = resolve;
    script.onerror = () => { excelLoader = null; script.remove(); reject(new Error('Excel reader could not load. Try CSV.')); };
    document.head.append(script);
  });
  await excelLoader;
  const { xlsxToCSV } = await import('./excel.js');
  return xlsxToCSV(file);
}
async function importFile(file) {
  if (!file) return;
  const version = ++importVersion;
  $('import-message').textContent = 'Reading file…'; $('apply').disabled = true;
  try {
    if (file.size > 25 * 1024 * 1024) throw new Error('Choose a file smaller than 25 MB.');
    const extension = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'tsv', 'txt', 'xlsx'].includes(extension)) throw new Error('Choose CSV, TSV or XLSX. Save older XLS files as XLSX first.');
    const text = extension === 'xlsx' ? await readExcel(file) : await file.text();
    if (version !== importVersion || !dialog.open) return;
    const result = applyData(text, file.name);
    $('paste').value = '';
    dialog.close(); notify(`Imported ${result.values.size} countries${result.issues.length ? ` · ${result.issues.length} issues to review below` : ''}`);
  } catch (error) { if (version === importVersion) $('import-message').textContent = error.message; }
  finally { if (version === importVersion) { $('apply').disabled = false; $('file').value = ''; } }
}
function bindControls() {
  $('regions').innerHTML = regions.map(region => `<button class="region" aria-pressed="${region === state.region}" data-region="${region}">${region}</button>`).join('');
  $('regions').addEventListener('click', event => {
    const button = event.target.closest('[data-region]'); if (!button) return;
    state.region = button.dataset.region;
    for (const el of $('regions').children) el.setAttribute('aria-pressed', String(el === button));
    $('search').value = ''; render();
  });
  $('palettes').innerHTML = palettes.map((p, i) => `<button class="palette" title="${p.name}" aria-label="${p.name} palette" aria-pressed="${i === 0}" data-palette="${i}"><span class="swatch" style="background:linear-gradient(90deg,${p.colors.join(',')})"></span></button>`).join('');
  $('palettes').addEventListener('click', event => {
    const button = event.target.closest('[data-palette]'); if (!button) return;
    state.colors = [...palettes[button.dataset.palette].colors]; syncColors(); render();
  });
  for (const [id, key] of [['map-name', 'title'], ['map-caption', 'caption'], ['value-label', 'label']]) $(id).addEventListener('input', () => { state[key] = $(id).value; render(); });
  for (const key of ['labels', 'legend']) $(key).addEventListener('change', () => { state[key] = $(key).checked; render(); });
  $('include-caption').addEventListener('change', () => { state.includeCaption = $('include-caption').checked; render(); });
  ['low', 'mid', 'high', 'empty'].forEach((key, i) => $('color-' + key).addEventListener('input', () => {
    if (i < 3) state.colors[i] = $('color-' + key).value; else state.empty = $('color-empty').value;
    syncColors(); render();
  }));
  for (const key of ['min', 'mid', 'max']) $('range-' + key).addEventListener('input', () => {
    const inputs = ['min', 'mid', 'max'].map(k => $('range-' + k));
    const values = inputs.map(el => el.valueAsNumber);
    if (!values.every(Number.isFinite) || values[0] > values[1] || values[1] > values[2]) {
      $('range-error').textContent = 'Use Min ≤ Mid ≤ Max. Map keeps the last valid scale.'; return;
    }
    state.range = values; $('range-error').textContent = ''; render();
  });
  $('auto-range').addEventListener('click', () => { state.range = fitRange(state.values); syncRange(); render(); });
  $('search').addEventListener('input', renderTable);
  for (const id of ['open-import', 'mobile-import']) $(id).addEventListener('click', () => { $('import-message').textContent = ''; dialog.showModal(); });
  dialog.addEventListener('close', () => { importVersion++; $('apply').disabled = false; $('file').value = ''; });
  $('file').addEventListener('change', () => importFile($('file').files[0]));
  for (const event of ['dragover', 'dragenter']) $('drop-zone').addEventListener(event, e => { e.preventDefault(); $('drop-zone').classList.add('drag'); });
  for (const event of ['dragleave', 'drop']) $('drop-zone').addEventListener(event, e => { e.preventDefault(); $('drop-zone').classList.remove('drag'); });
  $('drop-zone').addEventListener('drop', event => importFile(event.dataTransfer.files[0]));
  $('apply').addEventListener('click', () => {
    try {
      if ($('paste').value.length > 25 * 1024 * 1024) throw new Error('Paste less than 25 MB of data.');
      const result = applyData($('paste').value, 'Pasted data');
      dialog.close(); notify(`Imported ${result.values.size} countries${result.issues.length ? ` · ${result.issues.length} issues to review below` : ''}`);
    } catch (error) { $('import-message').textContent = error.message; }
  });
  $('example').addEventListener('click', () => loadExample().catch(error => notify(error.message)));
  $('clear').addEventListener('click', () => {
    state.values = new Map(); state.demo = false; state.range = [0, 50, 100];
    $('source-name').textContent = 'No data loaded'; $('source-name').title = ''; $('paste').value = ''; setIssues([]); syncRange(); render(); notify('Data cleared');
  });
  const filename = () => 'map-' + state.region.toLowerCase().replaceAll(' ', '-');
  $('export-svg').addEventListener('click', () => { download('<?xml version="1.0" encoding="UTF-8"?>\n' + svg, filename() + '.svg', 'image/svg+xml'); notify('SVG exported'); });
  $('export-png').addEventListener('click', async () => {
    $('export-png').disabled = true;
    try { await downloadPNG(svg, filename()); notify('PNG exported'); }
    catch (error) { notify(error.message); }
    finally { $('export-png').disabled = false; }
  });
  $('export-csv').addEventListener('click', () => { download('\ufeff' + toCSV(state.values, features), 'country-values.csv', 'text/csv;charset=utf-8'); notify('All imported data exported'); });
  const byId = new Map(features.map(f => [f.id, f]));
  $('map-mount').addEventListener('pointermove', event => {
    const country = event.target.closest('[data-id]');
    if (!country) { $('tooltip').hidden = true; return; }
    const f = byId.get(country.dataset.id), value = state.values.get(f.id);
    $('tooltip').innerHTML = `<strong>${escapeXML(f.properties.name)}</strong><span>${value === undefined ? 'No data' : `${format(value)} ${escapeXML(state.label)}`}</span>`;
    $('tooltip').hidden = false;
    const box = $('tooltip').getBoundingClientRect();
    $('tooltip').style.left = Math.max(8, Math.min(event.clientX + 12, innerWidth - box.width - 10)) + 'px';
    $('tooltip').style.top = Math.max(8, Math.min(event.clientY + 15, innerHeight - box.height - 10)) + 'px';
  });
  $('map-mount').addEventListener('pointerleave', () => { $('tooltip').hidden = true; });
  $('table-body').addEventListener('pointerover', event => {
    const id = event.target.closest('[data-id]')?.dataset.id;
    document.querySelectorAll('.country').forEach(el => el.classList.toggle('is-selected', el.dataset.id === id));
  });
  $('table-body').addEventListener('pointerleave', () => document.querySelectorAll('.is-selected').forEach(el => el.classList.remove('is-selected')));
}
async function init() {
  try {
    const response = await fetch('./assets/data/world.geojson');
    if (!response.ok) throw new Error('Map data could not load.');
    features = (await response.json()).features; index = countryIndex(features);
    await loadExample();
    bindControls(); syncColors();
    $('map-mount').setAttribute('aria-busy', 'false');
  } catch (error) {
    $('map-mount').replaceChildren();
    const message = document.createElement('p'); message.className = 'loading';
    message.textContent = `${error.message} Serve this project over HTTP and refresh.`;
    $('map-mount').append(message); $('map-mount').setAttribute('aria-busy', 'false');
    document.querySelectorAll('button').forEach(button => { button.disabled = true; });
  }
}
init();
