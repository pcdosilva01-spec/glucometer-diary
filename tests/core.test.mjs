import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultState, normalizeState, glucoseAverages, glucoseSummary,
  waterSummary, filterByPeriod, formatVolume, parseLocalDateTime
} from '../src/core.mjs';

const now = new Date(2026, 9, 8, 12, 0, 0);
const iso = (year, month, day, hour = 12) => new Date(year, month - 1, day, hour).toISOString();

test('estado vazio tem listas reais vazias e lembrete desativado', () => {
  const state = createDefaultState();
  assert.deepEqual(state.glucose, []);
  assert.deepEqual(state.water, []);
  assert.equal(state.settings.reminder.enabled, false);
});

test('médias de glicose são agrupadas por unidade e pelo período', () => {
  const entries = [
    { id: 'a', value: 100, unit: 'mg/dL', timestamp: iso(2026, 10, 8) },
    { id: 'b', value: 120, unit: 'mg/dL', timestamp: iso(2026, 10, 7) },
    { id: 'c', value: 6, unit: 'mmol/L', timestamp: iso(2026, 10, 8) },
    { id: 'old', value: 200, unit: 'mg/dL', timestamp: iso(2026, 8, 1) }
  ];
  const result = glucoseAverages(entries, '7d', now);
  assert.equal(result['mg/dL'].average, 110);
  assert.equal(result['mg/dL'].count, 2);
  assert.equal(result['mmol/L'].average, 6);
  assert.equal(result['mmol/L'].count, 1);
});

test('dashboard limita medições às dez mais recentes e informa estado vazio', () => {
  const entries = Array.from({ length: 12 }, (_, i) => ({
    id: String(i), value: 90 + i, unit: 'mg/dL', timestamp: iso(2026, 10, 8, i)
  }));
  assert.equal(glucoseSummary(entries, 'today', now).latestTen.length, 10);
  assert.equal(glucoseSummary([], '7d', now).count, 0);
  assert.deepEqual(glucoseSummary([], '7d', now).averages, {});
});

test('água conta registros separadamente do volume e calcula média diária', () => {
  const entries = [
    { id: 'a', ml: 250, timestamp: iso(2026, 10, 8, 9) },
    { id: 'b', ml: 500, timestamp: iso(2026, 10, 8, 11) },
    { id: 'c', ml: 300, timestamp: iso(2026, 10, 7, 10) }
  ];
  const result = waterSummary(entries, 'today', now);
  assert.equal(result.totalMl, 750);
  assert.equal(result.count, 2);
  assert.equal(result.averageMlPerDay, 750);
  assert.equal(result.latest.id, 'b');
  assert.equal(waterSummary([], 'today', now).averageMlPerDay, null);
});

test('filtro respeita data local e histórico completo', () => {
  const entries = [
    { id: 'today', timestamp: iso(2026, 10, 8) },
    { id: 'lastmonth', timestamp: iso(2026, 9, 1) }
  ];
  assert.equal(filterByPeriod(entries, 'today', now).length, 1);
  assert.equal(filterByPeriod(entries, 'all', now).length, 2);
});

test('dados importados/malformados são descartados e volume fica formatado em pt-BR', () => {
  const normalized = normalizeState({ glucose: [{ value: -1 }, { value: 100, timestamp: 'not-a-date' }], water: [{ ml: 0 }] });
  assert.deepEqual(normalized.glucose, []);
  assert.deepEqual(normalized.water, []);
  assert.equal(formatVolume(1250), '1,25 L');
  assert.equal(parseLocalDateTime(''), null);
});


import { monitoringForToday, isSameLocalDay } from '../src/core.mjs';

test('diário aceita entradas de glicemia, insulina e alimentação sem inventar glicose', () => {
  const today = new Date(2026, 9, 8, 10);
  const state = { glucose: [{ id: 'g1', value: 100, unit: 'mg/dL', timestamp: iso(2026, 10, 8, 8) }], monitoring: [{ id: 'm1', timestamp: iso(2026, 10, 8, 9), glucoseValue: null, glucoseUnit: 'mg/dL', moment: 'Antes do almoço', insulinStatus: 'yes', insulinDose: 2.5, insulinType: 'rápida', mealStatus: 'unknown', food: '', note: '' }, { id: 'm2', timestamp: iso(2026, 10, 8, 12), glucoseValue: null, glucoseUnit: 'mg/dL', moment: 'Após o almoço', insulinStatus: 'unknown', insulinDose: null, insulinType: '', mealStatus: 'yes', food: 'Arroz; feijão', note: '' }], water: [] };
  const rows = monitoringForToday(state, today);
  assert.equal(rows.length, 3);
  assert.equal(rows.find(row => row.id === 'm1').insulinDose, 2.5);
  assert.equal(rows.find(row => row.id === 'm2').glucoseValue, null);
  assert.equal(rows.find(row => row.id === 'glucose-g1').derived, true);
});

test('monitoramento usa calendário local e não mistura registros de outros dias', () => {
  const today = new Date(2026, 9, 8, 23, 59);
  assert.equal(isSameLocalDay(iso(2026, 10, 8, 0), today), true);
  assert.equal(isSameLocalDay(iso(2026, 10, 7, 23), today), false);
  const rows = monitoringForToday({ glucose: [], monitoring: [{ id: 'old', timestamp: iso(2026, 10, 7, 23), glucoseValue: 90 }], water: [] }, today);
  assert.equal(rows.length, 0);
});

test('normalização mantém registros antigos e adiciona lista diária vazia quando ausente', () => {
  const normalized = normalizeState({ glucose: [{ id: 'g', value: 95, timestamp: iso(2026, 10, 8) }], water: [] });
  assert.deepEqual(normalized.monitoring, []);
  assert.equal(normalized.glucose[0].value, 95);
});


test('refeição isolada permanece salva sem glicose, insulina ou vínculo de medição', () => {
  const timestamp = iso(2026, 10, 8, 13);
  const normalized = normalizeState({
    monitoring: [{
      id: 'meal-only', recordType: 'food', glucoseId: null, timestamp, glucoseValue: null,
      glucoseUnit: 'mg/dL', moment: 'Outro momento', customMoment: 'Refeição',
      insulinStatus: 'unknown', insulinDose: null, insulinType: '', mealStatus: 'yes',
      food: 'Arroz, feijão e frango', note: ''
    }]
  });
  const rows = monitoringForToday(normalized, new Date(2026, 9, 8, 15));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].recordType, 'food');
  assert.equal(rows[0].glucoseValue, null);
  assert.equal(rows[0].glucoseId, null);
  assert.equal(rows[0].food, 'Arroz, feijão e frango');
  assert.equal(normalized.glucose.length, 0);
});

test('momentos de alimentação cobrem antes, durante e depois e preservam opções antigas', async () => {
  const { MOMENTS } = await import('../src/core.mjs');
  for (const moment of [
    'Antes do café da manhã', 'No café da manhã', 'Após o café da manhã',
    'Antes do almoço', 'No almoço', 'Após o almoço',
    'Antes do jantar', 'No jantar', 'Após o jantar',
    'Antes da ceia', 'Na ceia', 'Após a ceia', 'Antes do lanche', 'Após o lanche'
  ]) assert.ok(MOMENTS.includes(moment), `Momento ausente: ${moment}`);
});


test('fórmula informativa arredonda ao inteiro mais próximo, não sempre para cima', async () => {
  const { calculateInsulinFormula } = await import('../src/core.mjs');
  assert.deepEqual(calculateInsulinFormula('200', 'mg/dL'), { glucose: 200, raw: 2.5, units: 3 });
  assert.equal(calculateInsulinFormula('220', 'mg/dL').units, 3);
  assert.equal(calculateInsulinFormula('221', 'mg/dL').units, 3);
  assert.ok(Math.abs(calculateInsulinFormula('229.2', 'mg/dL').raw - 3.23) < 1e-12);
  assert.equal(calculateInsulinFormula('229.2', 'mg/dL').units, 3);
  assert.ok(Math.abs(calculateInsulinFormula('244', 'mg/dL').raw - 3.6) < 1e-12);
  assert.equal(calculateInsulinFormula('244', 'mg/dL').units, 4);
  assert.equal(calculateInsulinFormula('240', 'mg/dL').units, 4);
});

test('fórmula informativa não gera valores negativos nem calcula para mmol/L', async () => {
  const { calculateInsulinFormula } = await import('../src/core.mjs');
  assert.equal(calculateInsulinFormula('100', 'mg/dL').units, 0);
  assert.equal(calculateInsulinFormula('80', 'mg/dL').units, 0);
  assert.equal(calculateInsulinFormula('6.5', 'mmol/L'), null);
  assert.equal(calculateInsulinFormula('', 'mg/dL'), null);
  assert.equal(calculateInsulinFormula('not-a-number', 'mg/dL'), null);
});


test('registro independente de insulina preserva dose sem inventar valor de glicose', () => {
  const timestamp = iso(2026, 10, 8, 13);
  const normalized = normalizeState({ monitoring: [{
    id: 'insulin-only', recordType: 'insulin', timestamp, glucoseValue: null,
    glucoseUnit: 'mg/dL', moment: 'Antes do almoço', customMoment: '',
    insulinStatus: 'yes', insulinDose: 4, insulinType: '', mealStatus: 'unknown', food: '', note: ''
  }] });
  assert.equal(normalized.monitoring.length, 1);
  assert.equal(normalized.monitoring[0].recordType, 'insulin');
  assert.equal(normalized.monitoring[0].glucoseValue, null);
  assert.equal(normalized.monitoring[0].insulinDose, 4);
});

import { SAFETY_BACKUP_KEY, STORAGE_KEY, getLocalRecoveryBackups, extractStateFromBackupPayload, mergeStates, loadState, saveState } from '../src/core.mjs';

test('backup do console é reconhecido sem descartar os registros legíveis', () => {
  const rescueState = { glucose: [{ id: 'rescue-g', value: 123, unit: 'mg/dL', timestamp: iso(2026, 10, 8, 8) }], water: [{ id: 'rescue-w', ml: 250, timestamp: iso(2026, 10, 8, 9) }], monitoring: [{ id: 'rescue-m', recordType: 'food', timestamp: iso(2026, 10, 8, 12), glucoseValue: null, glucoseUnit: 'mg/dL', moment: 'Outro momento', customMoment: 'Refeição', insulinStatus: 'unknown', insulinDose: null, insulinType: '', mealStatus: 'yes', food: 'Almoço', note: '' }] };
  const payload = { url: 'https://glucometer-diary.vercel.app/#water', exportedAt: new Date().toISOString(), entries: { [STORAGE_KEY]: JSON.stringify(rescueState) } };
  const recovered = extractStateFromBackupPayload(payload);
  assert.equal(recovered.glucose.length, 1);
  assert.equal(recovered.water.length, 1);
  assert.equal(recovered.monitoring.length, 1);
  assert.equal(recovered.monitoring[0].glucoseValue, null);
});

test('estado é salvo mantendo uma cópia anterior para recuperação', () => {
  const store = new Map();
  const storage = { getItem: key => store.has(key) ? store.get(key) : null, setItem: (key, value) => store.set(key, String(value)) };
  saveState({ glucose: [{ id: 'first', value: 100, unit: 'mg/dL', timestamp: iso(2026, 10, 8) }] }, storage);
  saveState({ glucose: [{ id: 'second', value: 110, unit: 'mg/dL', timestamp: iso(2026, 10, 8, 1) }] }, storage);
  const backups = getLocalRecoveryBackups(storage);
  assert.equal(backups.length, 1);
  assert.equal(backups[0].state.glucose[0].id, 'first');
  assert.ok(store.has(SAFETY_BACKUP_KEY));
  assert.equal(loadState(storage).glucose[0].id, 'second');
});

test('merge de backup recupera registros sem duplicar IDs e mantém dados atuais distintos', () => {
  const current = { glucose: [{ id: 'same', value: 110, unit: 'mg/dL', timestamp: iso(2026, 10, 8) }], water: [], monitoring: [] };
  const imported = { glucose: [{ id: 'same', value: 120, unit: 'mg/dL', timestamp: iso(2026, 10, 8) }, { id: 'older', value: 90, unit: 'mg/dL', timestamp: iso(2026, 10, 7) }], water: [{ id: 'water', ml: 250, timestamp: iso(2026, 10, 8) }] };
  const merged = mergeStates(current, imported);
  assert.equal(merged.glucose.length, 2);
  assert.equal(merged.water.length, 1);
  assert.equal(merged.glucose.find(item => item.id === 'same').value, 120);
});

test('se a chave principal estiver corrompida, loadState recupera a cópia local válida', () => {
  const store = new Map();
  const storage = { getItem: key => store.has(key) ? store.get(key) : null, setItem: (key, value) => store.set(key, String(value)) };
  const saved = { glucose: [{ id: 'safe-copy', value: 145, unit: 'mg/dL', timestamp: iso(2026, 10, 8) }], water: [], monitoring: [] };
  store.set(STORAGE_KEY, '{ JSON quebrado');
  store.set(SAFETY_BACKUP_KEY, JSON.stringify([{ savedAt: new Date().toISOString(), rawState: JSON.stringify(saved) }]));
  assert.equal(loadState(storage).glucose[0].id, 'safe-copy');
});
