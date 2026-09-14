// excelImport.js — Parse the "Comprehensive Software Delivery Project Plan"
// (or any spreadsheet with the same column layout) into a normalised
// template shape ready to be persisted.
//
// Uses SheetJS from CDN, loaded on demand so the app stays fast when the
// user never opens the import dialog.

let _xlsxPromise = null;
export function loadSheetJS() {
  if (_xlsxPromise) return _xlsxPromise;
  _xlsxPromise = new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error('Failed to load SheetJS'));
    document.head.appendChild(s);
  });
  return _xlsxPromise;
}

// Column names we expect on the "Project Plan" sheet. Matching is
// case-insensitive and trimmed. If you rename these in the source
// spreadsheet, either restore the names or extend the ALIASES map.
const ALIASES = {
  wbs:                   ['wbs'],
  phase:                 ['phase'],
  workstream:            ['workstream'],
  name:                  ['task / activity', 'task', 'activity'],
  primary_deliverable:   ['primary deliverable', 'deliverable'],
  is_milestone:          ['milestone'],
  owner_role:            ['owner'],
  accountable_role:      ['accountable'],
  duration_workdays:     ['duration (workdays)', 'duration'],
  start_offset_workdays: ['start offset (workdays)', 'start offset', 'offset'],
  predecessor_wbs:       ['predecessor / gate', 'predecessor', 'gate'],
  key_dependency:        ['key dependency', 'dependency'],
  acceptance_criteria:   ['acceptance / exit criteria', 'acceptance criteria', 'exit criteria'],
};

function pickHeaderMap(row) {
  const map = {};
  const lower = row.map(h => (h == null ? '' : String(h)).trim().toLowerCase());
  for (const [field, keys] of Object.entries(ALIASES)) {
    let idx = -1;
    for (const k of keys) {
      idx = lower.indexOf(k);
      if (idx !== -1) break;
    }
    if (idx !== -1) map[field] = idx;
  }
  return map;
}

// Parse a workbook. Returns { name, description, tasks, warnings }
export async function parseTemplateWorkbook(file) {
  const XLSX = await loadSheetJS();
  const buf  = await file.arrayBuffer();
  const wb   = XLSX.read(buf, { type: 'array' });
  const warnings = [];

  // Find the plan sheet — usually "Project Plan", but tolerate variations.
  const planSheetName =
    wb.SheetNames.find(n => /project.?plan/i.test(n)) ||
    wb.SheetNames.find(n => /plan|tasks|activities/i.test(n)) ||
    wb.SheetNames[0];
  if (!planSheetName) throw new Error('No usable sheet found in the workbook.');

  const plan = wb.Sheets[planSheetName];
  const rows = XLSX.utils.sheet_to_json(plan, { header: 1, blankrows: false, defval: null });
  if (!rows.length) throw new Error(`Sheet "${planSheetName}" is empty.`);

  // Locate the header row: first row that contains a recognisable "Task" column.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const map = pickHeaderMap(rows[i]);
    if (map.name != null && (map.phase != null || map.workstream != null)) {
      headerIdx = i; break;
    }
  }
  if (headerIdx === -1) {
    throw new Error(`Couldn't find a header row in "${planSheetName}". Expected columns like Task / Activity, Phase, Duration.`);
  }
  const colMap = pickHeaderMap(rows[headerIdx]);
  const need = ['name', 'phase'];
  for (const n of need) if (colMap[n] == null) warnings.push(`Missing recommended column: ${n}`);

  const tasks = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(v => v == null || v === '')) continue;
    const cell = k => (colMap[k] != null ? r[colMap[k]] : null);
    const rawName = cell('name');
    if (rawName == null || String(rawName).trim() === '') continue;
    const milestoneRaw = cell('is_milestone');
    tasks.push({
      wbs:                   cell('wbs') != null ? String(cell('wbs')).trim() : null,
      phase:                 cell('phase') != null ? String(cell('phase')).trim() : null,
      workstream:            cell('workstream') != null ? String(cell('workstream')).trim() : null,
      name:                  String(rawName).trim(),
      primary_deliverable:   cell('primary_deliverable') != null ? String(cell('primary_deliverable')).trim() : null,
      is_milestone:          milestoneRaw != null && /^y|true|1$/i.test(String(milestoneRaw).trim()),
      owner_role:            cell('owner_role') != null ? String(cell('owner_role')).trim() : null,
      accountable_role:      cell('accountable_role') != null ? String(cell('accountable_role')).trim() : null,
      duration_workdays:     toInt(cell('duration_workdays'), 1),
      start_offset_workdays: toInt(cell('start_offset_workdays'), 0),
      predecessor_wbs:       cell('predecessor_wbs') != null ? String(cell('predecessor_wbs')).trim() : null,
      key_dependency:        cell('key_dependency') != null ? String(cell('key_dependency')).trim() : null,
      acceptance_criteria:   cell('acceptance_criteria') != null ? String(cell('acceptance_criteria')).trim() : null,
      sort_order:            i * 100,
    });
  }

  if (!tasks.length) throw new Error('Found the header but no task rows below it.');

  // Try to pull a project name from the "Project Setup" sheet if present, but
  // don't fail if it's missing — the user gives the template its own name at save time.
  let defaultName = file.name.replace(/\.[^.]+$/, '');
  const setupSheet = wb.SheetNames.find(n => /setup|cover|details/i.test(n));
  if (setupSheet) {
    const setup = XLSX.utils.sheet_to_json(wb.Sheets[setupSheet], { header: 1, blankrows: false, defval: null });
    for (const row of setup) {
      if (!row) continue;
      const label = String(row[0] || '').toLowerCase().trim();
      if (label === 'project name' && row[1] && String(row[1]).trim() && !/enter/i.test(String(row[1]))) {
        defaultName = String(row[1]).trim();
        break;
      }
    }
  }

  return { name: defaultName, description: `Imported from ${file.name}`, tasks, warnings };
}

function toInt(v, fallback) {
  if (v == null || v === '') return fallback;
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}
