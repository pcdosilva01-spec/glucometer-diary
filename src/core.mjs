export const STORAGE_KEY = 'glucometer.personal.v1';
export const SAFETY_BACKUP_KEY = 'glucometer.safety-backups.v1';
export const UNITS = Object.freeze(['mg/dL', 'mmol/L']);
export const MOMENTS = Object.freeze([
  'Ao acordar / em jejum (antes de comer)',
  'Antes do café da manhã', 'No café da manhã', 'Após o café da manhã',
  'Antes do lanche da manhã', 'No lanche da manhã', 'Após o lanche da manhã',
  'Antes do almoço', 'No almoço', 'Após o almoço',
  'Antes do lanche da tarde', 'No lanche da tarde', 'Após o lanche da tarde',
  'Antes do jantar', 'No jantar', 'Após o jantar',
  'Antes da ceia', 'Na ceia', 'Após a ceia',
  'Antes de dormir', 'Durante a madrugada',
  // Valores antigos preservados para que registros existentes continuem editáveis.
  'Ao acordar', 'Ao deitar', 'Antes do lanche', 'Após o lanche', 'Outro momento'
]);
export const ANSWERS = Object.freeze(['yes', 'no', 'unknown']);

// Calcula somente a expressão matemática informada pelo usuário; não constitui
// recomendação clínica de dose. A fórmula é definida para valores em mg/dL.
export function calculateInsulinFormula(glucoseValue, unit = 'mg/dL') {
  const glucose = Number(glucoseValue);
  if (unit !== 'mg/dL' || glucoseValue === '' || glucoseValue == null || !Number.isFinite(glucose) || glucose <= 0) return null;
  const raw = (glucose - 100) / 40;
  // Uma dose matemática negativa não tem representação útil; retorna piso 0.
  const units = Math.max(0, Math.round(raw));
  return { glucose, raw, units };
}

export function createDefaultState() {
  return { glucose: [], water: [], monitoring: [], settings: { period: '7d', glucoseUnit: 'mg/dL', reminder: { enabled: false, paused: false, intervalMinutes: 15, nextAt: null } } };
}
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function validIso(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function normalizeGlucose(item) {
  if (!isRecord(item)) return null;
  const value = Number(item.value);
  if (!Number.isFinite(value) || value <= 0 || !validIso(item.timestamp)) return null;
  return { id: String(item.id || makeId()), ...(validIso(item.updatedAt) ? { updatedAt: item.updatedAt } : {}), value, unit: UNITS.includes(item.unit) ? item.unit : 'mg/dL', timestamp: item.timestamp, note: typeof item.note === 'string' ? item.note.slice(0, 300) : '' };
}
function normalizeWater(item) {
  if (!isRecord(item)) return null;
  const ml = Number(item.ml);
  if (!Number.isInteger(ml) || ml < 1 || ml > 10000 || !validIso(item.timestamp)) return null;
  return { id: String(item.id || makeId()), ...(validIso(item.updatedAt) ? { updatedAt: item.updatedAt } : {}), ml, timestamp: item.timestamp };
}
function normalizeMonitoring(item) {
  if (!isRecord(item) || !validIso(item.timestamp)) return null;
  const glucoseValue = item.glucoseValue === '' || item.glucoseValue == null ? null : Number(item.glucoseValue);
  if (glucoseValue !== null && (!Number.isFinite(glucoseValue) || glucoseValue <= 0)) return null;
  const insulinStatus = ANSWERS.includes(item.insulinStatus) ? item.insulinStatus : 'unknown';
  const mealStatus = ANSWERS.includes(item.mealStatus) ? item.mealStatus : 'unknown';
  const insulinDose = item.insulinDose === '' || item.insulinDose == null ? null : Number(item.insulinDose);
  if (insulinStatus === 'yes' && (!Number.isFinite(insulinDose) || insulinDose <= 0)) return null;
  return { id: String(item.id || makeId()), ...(validIso(item.updatedAt) ? { updatedAt: item.updatedAt } : {}), recordType: item.recordType === 'food' ? 'food' : item.recordType === 'insulin' ? 'insulin' : 'monitoring', glucoseId: item.glucoseId ? String(item.glucoseId) : null, timestamp: item.timestamp,
    glucoseValue, glucoseUnit: UNITS.includes(item.glucoseUnit) ? item.glucoseUnit : 'mg/dL', moment: MOMENTS.includes(item.moment) ? item.moment : 'Outro momento', customMoment: typeof item.customMoment === 'string' ? item.customMoment.slice(0, 120) : '',
    insulinStatus, insulinDose: insulinStatus === 'yes' ? insulinDose : null, insulinType: typeof item.insulinType === 'string' ? item.insulinType.slice(0, 120) : '',
    mealStatus, food: typeof item.food === 'string' ? item.food.slice(0, 500) : '', note: typeof item.note === 'string' ? item.note.slice(0, 500) : '' };
}
export function normalizeState(value) {
  const base = createDefaultState();
  if (!isRecord(value)) return base;
  const settings = isRecord(value.settings) ? value.settings : {}, reminder = isRecord(settings.reminder) ? settings.reminder : {};
  const interval = [15, 30, 45, 60].includes(Number(reminder.intervalMinutes)) ? Number(reminder.intervalMinutes) : 15;
  return { glucose: Array.isArray(value.glucose) ? value.glucose.map(normalizeGlucose).filter(Boolean) : [], water: Array.isArray(value.water) ? value.water.map(normalizeWater).filter(Boolean) : [], monitoring: Array.isArray(value.monitoring) ? value.monitoring.map(normalizeMonitoring).filter(Boolean) : [], settings: { period: ['today', '7d', '30d', 'all'].includes(settings.period) ? settings.period : '7d', glucoseUnit: UNITS.includes(settings.glucoseUnit) ? settings.glucoseUnit : 'mg/dL', reminder: { enabled: reminder.enabled === true, paused: reminder.paused === true, intervalMinutes: interval, nextAt: Number.isFinite(Number(reminder.nextAt)) ? Number(reminder.nextAt) : null } } };
}
function stateEntryCount(state) { return ['glucose', 'water', 'monitoring'].reduce((sum, key) => sum + (Array.isArray(state?.[key]) ? state[key].length : 0), 0); }
function safeParseState(raw) { try { return normalizeState(JSON.parse(raw)); } catch { return null; } }
function readBackupList(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(SAFETY_BACKUP_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.rawState === 'string').slice(0, 5) : [];
  } catch { return []; }
}

/**
 * Retorna cópias locais anteriores sem alterá-las. Útil para restaurar dados se
 * uma atualização tiver gravado um estado vazio ou corrompido.
 */
export function getLocalRecoveryBackups(storage = globalThis.localStorage) {
  if (!storage) return [];
  return readBackupList(storage).map((item, index) => {
    const state = safeParseState(item.rawState);
    return state ? { index, savedAt: validIso(item.savedAt) ? item.savedAt : null, state, counts: { glucose: state.glucose.length, water: state.water.length, monitoring: state.monitoring.length }, total: stateEntryCount(state) } : null;
  }).filter(item => item && item.total > 0).sort((a, b) => b.total - a.total || Date.parse(b.savedAt || 0) - Date.parse(a.savedAt || 0));
}

/** Lê o formato nativo, recupera de backups locais se a chave estiver ausente/corrompida. */
export function loadState(storage = globalThis.localStorage) {
  if (!storage) return createDefaultState();
  let raw = null;
  try { raw = storage.getItem(STORAGE_KEY); } catch { return createDefaultState(); }
  if (raw !== null) {
    const current = safeParseState(raw);
    if (current) return current;
  }
  const backups = getLocalRecoveryBackups(storage);
  if (backups.length) return backups[0].state;
  return createDefaultState();
}

/** Salva com histórico rotativo de cópias anteriores; falhar ao criar backup não bloqueia o diário. */
export function saveState(state, storage = globalThis.localStorage) {
  if (!storage) throw new Error('O armazenamento local não está disponível.');
  const nextRaw = JSON.stringify(normalizeState(state));
  try {
    const previousRaw = storage.getItem(STORAGE_KEY);
    if (previousRaw && previousRaw !== nextRaw) {
      const backups = readBackupList(storage);
      const previousParsed = safeParseState(previousRaw);
      // Só cria uma cópia rotativa se o conteúdo anterior for dado de diário válido.
      if (previousParsed && stateEntryCount(previousParsed) > 0) {
        const alreadyExists = backups.some(item => item.rawState === previousRaw);
        if (!alreadyExists) backups.unshift({ savedAt: new Date().toISOString(), rawState: previousRaw });
        storage.setItem(SAFETY_BACKUP_KEY, JSON.stringify(backups.slice(0, 5)));
      } else if (!previousParsed) {
        // Preserva também a cadeia inválida para diagnóstico, sem usá-la como estado.
        const invalidSnapshots = JSON.parse(storage.getItem(SAFETY_BACKUP_KEY) || '[]');
        if (Array.isArray(invalidSnapshots)) storage.setItem(SAFETY_BACKUP_KEY, JSON.stringify([{ savedAt: new Date().toISOString(), rawState: previousRaw, malformed: true }, ...invalidSnapshots].slice(0, 5)));
      }
    }
  } catch { /* A cópia de segurança é best-effort; tenta salvar os dados principais. */ }
  storage.setItem(STORAGE_KEY, nextRaw);
}

/** Aceita o backup nativo do app, o estado cru e o arquivo de resgate do console. */
export function extractStateFromBackupPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('O arquivo não contém um backup JSON válido do Glucometer.');
  let rawState = null;
  if (payload.application === 'Glucometer' && payload.data && typeof payload.data === 'object') rawState = payload.data;
  else if (payload.entries && typeof payload.entries === 'object' && Object.prototype.hasOwnProperty.call(payload.entries, STORAGE_KEY)) {
    const stored = payload.entries[STORAGE_KEY];
    if (typeof stored === 'string') { try { rawState = JSON.parse(stored); } catch { throw new Error('A cópia contém dados que não puderam ser lidos. O armazenamento atual foi mantido.'); } }
    else rawState = stored;
  } else if (['glucose', 'water', 'monitoring', 'settings'].some(key => Object.prototype.hasOwnProperty.call(payload, key))) rawState = payload;
  if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) throw new Error('Formato não reconhecido. Escolha um backup JSON ou o arquivo de resgate do console.');
  const state = normalizeState(rawState);
  if (stateEntryCount(state) === 0) throw new Error('O arquivo não contém registros recuperáveis. Nenhum dado foi alterado.');
  return state;
}

/** Mescla por ID para recuperar registros sem duplicar os que já existem. */
export function mergeStates(currentValue, importedValue) {
  const current = normalizeState(currentValue);
  const imported = normalizeState(importedValue);
  const mergeCollection = key => {
    const byId = new Map();
    for (const item of current[key]) byId.set(String(item.id), item);
    for (const item of imported[key]) {
      const id = String(item.id);
      const old = byId.get(id);
      const oldUpdated = Date.parse(old?.updatedAt || '') || 0;
      const newUpdated = Date.parse(item.updatedAt || '') || 0;
      if (!old || newUpdated >= oldUpdated) byId.set(id, item);
    }
    return [...byId.values()];
  };
  const currentCount = stateEntryCount(current);
  return normalizeState({
    glucose: mergeCollection('glucose'), water: mergeCollection('water'), monitoring: mergeCollection('monitoring'),
    settings: currentCount > 0 ? current.settings : imported.settings
  });
}
export function makeId() { return globalThis.crypto?.randomUUID?.() || `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
export function localDateTimeInput(date = new Date()) { const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); }
export function parseLocalDateTime(value) { if (typeof value !== 'string' || !value.trim()) return null; const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toISOString() : null; }
export function dateToLocalInput(value) { const date = new Date(value); return Number.isFinite(date.getTime()) ? localDateTimeInput(date) : localDateTimeInput(); }
export function localDayKey(date = new Date()) { const d = new Date(date); if (!Number.isFinite(d.getTime())) return ''; const pad = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
export function isSameLocalDay(value, date = new Date()) { return validIso(value) && localDayKey(value) === localDayKey(date); }
export function getPeriodBounds(period, now = new Date(), entries = []) { const end = new Date(now); end.setHours(23,59,59,999); let start = localDayStart(now); if (period === '7d') start.setDate(start.getDate()-6); else if (period === '30d') start.setDate(start.getDate()-29); else if (period === 'all') { const dates = entries.map(item => Date.parse(item.timestamp)).filter(Number.isFinite); if (dates.length) start = localDayStart(new Date(Math.min(...dates))); } return { start: start.getTime(), end: end.getTime() }; }
export function localDayStart(date = new Date()) { const result = new Date(date); result.setHours(0,0,0,0); return result; }
export function filterByPeriod(entries, period, now = new Date()) { const bounds = getPeriodBounds(period, now, entries); return entries.filter(item => { const time = Date.parse(item.timestamp); return Number.isFinite(time) && time >= bounds.start && time <= bounds.end; }); }
export function sortNewest(entries) { return [...entries].sort((a,b) => Date.parse(b.timestamp)-Date.parse(a.timestamp)); }
export function sortOldest(entries) { return [...entries].sort((a,b) => Date.parse(a.timestamp)-Date.parse(b.timestamp)); }
export function glucoseAverages(entries, period = '7d', now = new Date()) { const grouped = new Map(); for (const entry of filterByPeriod(entries, period, now)) { const unit = UNITS.includes(entry.unit) ? entry.unit : 'mg/dL'; const group = grouped.get(unit) || {sum:0,count:0}; group.sum += Number(entry.value); group.count += 1; grouped.set(unit, group); } return Object.fromEntries([...grouped.entries()].map(([unit,g]) => [unit,{average:g.sum/g.count,count:g.count}])); }
export function periodDayCount(period, now = new Date(), entries = []) { if (period === 'today') return 1; if (period === '7d') return 7; if (period === '30d') return 30; if (!entries.length) return 0; const firstDay = localDayStart(new Date(Math.min(...entries.map(item => Date.parse(item.timestamp))))); return Math.max(1, Math.floor((localDayStart(now)-firstDay)/86400000)+1); }
export function waterSummary(entries, period = '7d', now = new Date()) { const filtered = filterByPeriod(entries, period, now), totalMl = filtered.reduce((sum,item) => sum+Number(item.ml),0), days = periodDayCount(period,now,entries); return {totalMl,count:filtered.length,averageMlPerDay:filtered.length&&days?totalMl/days:null,latest:sortNewest(entries)[0]||null,filtered:sortNewest(filtered)}; }
export function glucoseSummary(entries, period = '7d', now = new Date()) { const filtered = sortNewest(filterByPeriod(entries,period,now)); return {count:filtered.length,latestTen:filtered.slice(0,10),averages:glucoseAverages(entries,period,now)}; }
export function monitoringForToday(state, now = new Date()) { const rows = sortOldest(state.monitoring.filter(item => isSameLocalDay(item.timestamp, now))); const linked = new Set(rows.map(item => item.glucoseId).filter(Boolean)); for (const glucose of sortOldest(state.glucose.filter(item => isSameLocalDay(item.timestamp, now) && !linked.has(item.id)))) rows.push({ id: `glucose-${glucose.id}`, glucoseId: glucose.id, timestamp: glucose.timestamp, glucoseValue: glucose.value, glucoseUnit: glucose.unit, moment: 'Outro momento', customMoment: '', insulinStatus: 'unknown', insulinDose: null, insulinType: '', mealStatus: 'unknown', food: '', note: glucose.note || '', derived: true }); return sortOldest(rows); }
export function formatVolume(ml) { const value=Number(ml); if(!Number.isFinite(value)) return '—'; return value>=1000 ? `${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(value/1000)} L` : `${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(value)} ml`; }
