import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyPdf } from '../src/pdf-export.mjs';

const at = (day, hour) => new Date(2026, 8, day, hour).toISOString();
const entry = (day, hour, moment, value, dose = null) => ({
  id: `${day}-${hour}`, glucoseId: null, timestamp: at(day, hour), glucoseValue: value,
  glucoseUnit: 'mg/dL', moment, customMoment: '', insulinStatus: dose ? 'yes' : 'no',
  insulinDose: dose, insulinType: '', mealStatus: 'unknown', food: '', note: ''
});

 test('sem registros não gera PDF', () => {
  assert.equal(buildDailyPdf({ glucose: [], water: [], monitoring: [] }), null);
});

test('exportação padrão reproduz o formulário AMG com dias em linhas, grupos de refeição e dose em coluna própria', async () => {
  const monitoring = Array.from({ length: 16 }, (_, index) => entry(index + 1, 8, 'Antes do almoço', 100 + index, 5));
  const blob = buildDailyPdf({ glucose: [], water: [], monitoring });
  assert.equal(blob.type, 'application/pdf');
  const pdf = Buffer.from(await blob.arrayBuffer()).toString('latin1');
  assert.ok(pdf.startsWith('%PDF-1.4'));
  assert.ok(pdf.trimEnd().endsWith('%%EOF'));
  assert.match(pdf, /\/MediaBox \[0 0 841\.92 595\.32\]/);
  assert.match(pdf, /\/Count 2 /); // 15 dias por página; o 16º dia continua na página seguinte.
  assert.match(pdf, /Página 2 de 2/);
  assert.ok(pdf.includes('Automonitorização da Glicemia Capilar \\(AMG\\)'));
  for (const label of ['Dia/Mês/Ano', 'Café da Manhã', 'Almoço', 'Lanche', 'Jantar', 'Antes', '2h', 'após*', 'Dose', 'insulina', 'Glicemia', 'ao deitar', 'Obs.']) {
    assert.ok(pdf.includes(`(${label})`), `O cabeçalho precisa conter ${label}`);
  }
  assert.match(pdf, /15\/09\/2026/);
  assert.match(pdf, /16\/09\/2026/);
  assert.equal((pdf.match(/\(____\/____\/______\)/g) || []).length, 14, 'A última página mantém linhas vazias como no formulário de referência');
  assert.match(pdf, /5 U/);
  assert.doesNotMatch(pdf, /Unidades tomadas/);
  assert.doesNotMatch(pdf, /Alimentação - detalhes registrados/);
  assert.doesNotMatch(pdf, /O que comeu/);
  assert.doesNotMatch(pdf, /Observações/);
});

test('glicemia e dose ficam em campos separados dentro do grupo da refeição', async () => {
  const item = entry(10, 9, 'Antes do almoço', 200, 3);
  const blob = buildDailyPdf({ glucose: [], water: [], monitoring: [item] });
  const pdf = Buffer.from(await blob.arrayBuffer()).toString('latin1');
  const glucoseLine = pdf.split('\n').find(line => line.includes('(200 mg/dL)'));
  const doseLine = pdf.split('\n').find(line => line.includes('(3 U)'));
  assert.ok(glucoseLine, 'A célula Antes do almoço deve conter a glicemia');
  assert.ok(doseLine, 'A coluna Dose insulina deve conter a dose registrada');
  const coordinate = line => Number(line.match(/Tf ([\d.]+) [\d.]+ Td/)?.[1]);
  assert.notEqual(coordinate(glucoseLine), coordinate(doseLine), 'A dose deve ficar na subcoluna própria, à direita da glicemia');
  assert.match(pdf, /10\/09\/2026/);
  assert.match(pdf, /Antes/);
  assert.match(pdf, /Dose/);
  assert.match(pdf, /09:00/);
});

test('exportação principal omite alimentação, tipo de insulina, notas e observações pessoais', async () => {
  const item = {
    ...entry(1, 9, 'Após o almoço', 200, 3),
    insulinType: 'tipo de insulina não deve aparecer',
    food: 'Arroz, feijão e frango não devem aparecer',
    note: 'Esta observação não deve aparecer no relatório principal.'
  };
  const blob = buildDailyPdf({ glucose: [], water: [], monitoring: [item] });
  const pdf = Buffer.from(await blob.arrayBuffer()).toString('latin1');
  assert.match(pdf, /200 mg\/dL/);
  assert.match(pdf, /3 U/);
  assert.match(pdf, /após\*/);
  assert.doesNotMatch(pdf, /Arroz/);
  assert.doesNotMatch(pdf, /observação não deve aparecer/i);
  assert.doesNotMatch(pdf, /tipo de insulina não deve aparecer/);
  assert.doesNotMatch(pdf, /O que comeu/);
  assert.doesNotMatch(pdf, /Esta observação/);
});

test('medições em momentos que não existem no formulário aparecem numa folha complementar sem duplicar a dose', async () => {
  const item = entry(5, 12, 'No almoço', 180, 3);
  const blob = buildDailyPdf({ glucose: [], water: [], monitoring: [item] });
  const pdf = Buffer.from(await blob.arrayBuffer()).toString('latin1');
  assert.match(pdf, /Medições fora dos campos do modelo/);
  assert.match(pdf, /No almoço/);
  assert.match(pdf, /180 mg\/dL/);
  assert.equal((pdf.match(/\(3 U\)/g) || []).length, 1, 'A dose deve aparecer apenas no campo próprio do Almoço');
});

test('Ao deitar usa o campo dedicado e preserva glicemias em outros momentos na folha complementar', async () => {
  const monitoring = [
    entry(6, 22, 'Ao deitar', 140, null),
    entry(6, 6, 'Ao acordar / em jejum (antes de comer)', 110, null)
  ];
  const blob = buildDailyPdf({ glucose: [], water: [], monitoring });
  const pdf = Buffer.from(await blob.arrayBuffer()).toString('latin1');
  assert.match(pdf, /Glicemia/);
  assert.match(pdf, /ao deitar/);
  assert.match(pdf, /140 mg\/dL/);
  assert.match(pdf, /Medições fora dos campos do modelo/);
  assert.match(pdf, /Ao acordar \/ em jejum/);
  assert.match(pdf, /110 mg\/dL/);
});

test('PDF pode preservar textos longos de alimentação se a seção for selecionada explicitamente', async () => {
  const food = Array.from({ length: 70 }, (_, index) => `item${String(index).padStart(3, '0')}`).join(' ');
  const note = Array.from({ length: 32 }, (_, index) => `obs${String(index).padStart(3, '0')}`).join(' ');
  const foodEntry = {
    id: 'food-lunch', recordType: 'food', glucoseId: null, timestamp: at(2, 12),
    glucoseValue: null, glucoseUnit: 'mg/dL', moment: 'No almoço', customMoment: '',
    insulinStatus: 'unknown', insulinDose: null, insulinType: '', mealStatus: 'yes', food, note
  };
  const blob = buildDailyPdf({ glucose: [], water: [], monitoring: [foodEntry] }, { includeGlucose: false, includeFood: true, includeWater: false });
  const pdf = Buffer.from(await blob.arrayBuffer()).toString('latin1');
  assert.match(pdf, /Alimentação - detalhes registrados/);
  assert.match(pdf, /Refeição \/ momento/);
  assert.match(pdf, /No almoço/);
  for (const token of [...Array.from({ length: 70 }, (_, index) => `item${String(index).padStart(3, '0')}`), ...Array.from({ length: 32 }, (_, index) => `obs${String(index).padStart(3, '0')}`)]) {
    assert.ok(pdf.includes(token), `O PDF deve preservar o texto ${token}`);
  }
  assert.match(pdf, /\/Count 1 /);
});

test('PDF diferencia antes, durante e após para todos os momentos se alimentação for selecionada', async () => {
  const moments = ['Antes do café da manhã', 'No café da manhã', 'Após o café da manhã', 'Antes do almoço', 'No almoço', 'Após o almoço', 'Antes do lanche da manhã', 'No lanche da manhã', 'Após o lanche da manhã', 'Antes do lanche da tarde', 'No lanche da tarde', 'Após o lanche da tarde', 'Antes do jantar', 'No jantar', 'Após o jantar', 'Antes da ceia', 'Na ceia', 'Após a ceia'];
  const monitoring = moments.map((moment, index) => ({ ...entry(3, 5 + index, moment, null), recordType: 'food', mealStatus: 'yes', food: `Alimento de teste ${index + 1}` }));
  const blob = buildDailyPdf({ glucose: [], water: [], monitoring }, { includeGlucose: false, includeFood: true, includeWater: false });
  const pdf = Buffer.from(await blob.arrayBuffer()).toString('latin1');
  for (const moment of moments) assert.ok(pdf.includes(moment), `Faltou exportar o momento ${moment}`);
});

test('PDF pode exportar somente água quando essa opção for escolhida', async () => {
  const blob = buildDailyPdf({ glucose: [], monitoring: [], water: [{ id: 'w-1', ml: 250, timestamp: at(4, 13) }] }, { includeGlucose: false, includeFood: false, includeWater: true });
  const pdf = Buffer.from(await blob.arrayBuffer()).toString('latin1');
  assert.match(pdf, /Resumo diário de água/);
  assert.doesNotMatch(pdf, /Alimentação - detalhes registrados/);
  assert.match(pdf, /\/Count 1 /);
});


test('registro só de insulina mostra ? para glicemia desconhecida e mantém as unidades tomadas', async () => {
  const insulinOnly = {
    id: 'insulin-only-lunch', recordType: 'insulin', glucoseId: null,
    timestamp: at(8, 12), glucoseValue: null, glucoseUnit: 'mg/dL',
    moment: 'Antes do almoço', customMoment: '', insulinStatus: 'yes',
    insulinDose: 4, insulinType: '', mealStatus: 'unknown', food: '', note: ''
  };
  const blob = buildDailyPdf({ glucose: [], water: [], monitoring: [insulinOnly] });
  const pdf = Buffer.from(await blob.arrayBuffer()).toString('latin1');
  assert.match(pdf, /\(\?\) Tj/, 'o campo de glicemia deve indicar desconhecido com ?');
  assert.match(pdf, /\(4 U\) Tj/, 'a dose efetivamente registrada deve continuar visível');
  assert.match(pdf, /08\/09\/2026/);
  assert.doesNotMatch(pdf, /0 mg\/dL/, 'não deve inventar uma glicemia zero');
});


test('insulina sem glicemia durante a refeição preserva ? e dose na página complementar, sem duplicar', async () => {
  const item = {
    id: 'insulin-only-during-lunch', recordType: 'insulin', glucoseId: null,
    timestamp: at(9, 12), glucoseValue: null, glucoseUnit: 'mg/dL',
    moment: 'No almoço', customMoment: '', insulinStatus: 'yes',
    insulinDose: 2.5, insulinType: '', mealStatus: 'unknown', food: '', note: ''
  };
  const blob = buildDailyPdf({ glucose: [], water: [], monitoring: [item] });
  const pdf = Buffer.from(await blob.arrayBuffer()).toString('latin1');
  assert.match(pdf, /Medições fora dos campos do modelo/);
  assert.match(pdf, /No almoço/);
  assert.match(pdf, /\(\?\)/, 'a glicemia desconhecida deve ser indicada explicitamente');
  assert.match(pdf, /\(2,5 U\)/, 'a quantidade de insulina deve manter a precisão registrada');
  assert.equal((pdf.match(/\(2,5 U\)/g) || []).length, 1, 'não deve duplicar a dose');
});


test('refeição e unidades de insulina sem glicemia exportam apenas ? no campo de glicose', async () => {
  const item = {
    id: 'meal-insulin-unknown-glucose', recordType: 'food', glucoseId: null,
    timestamp: at(11, 12), glucoseValue: null, glucoseUnit: 'mg/dL',
    moment: 'Antes do almoço', customMoment: '', insulinStatus: 'yes',
    insulinDose: 3, insulinType: '', mealStatus: 'yes', food: 'Almoço registrado', note: ''
  };
  const blob = buildDailyPdf({ glucose: [], water: [], monitoring: [item] });
  const pdf = Buffer.from(await blob.arrayBuffer()).toString('latin1');
  assert.match(pdf, /\(\?\) Tj/, 'glicemia não medida é indicada com ponto de interrogação');
  assert.match(pdf, /\(3 U\) Tj/, 'a dose efetivamente registrada fica no campo de dose');
  assert.doesNotMatch(pdf, /Almoço registrado/, 'a tabela principal não inclui a descrição da comida');
  assert.doesNotMatch(pdf, /0 mg\/dL/, 'não cria medição de glicose zero');
});


test('se a seção de alimentação for incluída, também mostra ? quando houve refeição e insulina sem medir glicose', async () => {
  const item = {
    id: 'meal-insulin-unknown-food-section', recordType: 'food', glucoseId: null,
    timestamp: at(12, 13), glucoseValue: null, glucoseUnit: 'mg/dL',
    moment: 'No almoço', customMoment: '', insulinStatus: 'yes',
    insulinDose: 2, insulinType: '', mealStatus: 'yes', food: 'Refeição de teste', note: ''
  };
  const blob = buildDailyPdf({ glucose: [], water: [], monitoring: [item] }, { includeGlucose: false, includeFood: true, includeWater: false });
  const pdf = Buffer.from(await blob.arrayBuffer()).toString('latin1');
  assert.match(pdf, /Alimentação - detalhes registrados/);
  assert.match(pdf, /Refeição de teste/);
  assert.match(pdf, /\(\?\) Tj/);
  assert.match(pdf, /\(2 U\) Tj/);
});
