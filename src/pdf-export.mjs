import { localDayKey } from './core.mjs?v=6';

/* ------------------------------------------------------------------ *
 * PDF no formato de automonitorização: os dias são colunas e os
 * momentos ficam na vertical. Em cada célula, horário/glicemia ficam
 * acima e a dose registrada aparece logo abaixo. Alimentação e notas
 * não entram no quadro principal; podem ser exportadas em seção própria.
 * PDF gerado sem dependências, com fontes padrão Helvetica.
 * ------------------------------------------------------------------ */

// Geometria de página A4 paisagem (pontos PDF; Y medido a partir do topo).
const PAGE_W = 841.92, PAGE_H = 595.32;
const TABLE_TOP = 51;
const WATER_COLS = [23.2, 173.2, 403.2, 551.2, 801.2], WATER_HEAD_H = 30, WATER_ROW_H = 22, WATER_ROWS = 17;
// Geometria do formulário clássico de automonitorização (A4 paisagem).
// Cada linha representa um dia; os grupos de refeição ficam no cabeçalho.
const CLASSIC_COLUMNS = [23.2, 118.2, 163.2, 208.2, 253.2, 298.2, 343.2, 388.2, 433.2, 478.2, 523.2, 568.2, 613.2, 658.2, 708.2, 801.2];
const CLASSIC_GROUP_H = 24;
const CLASSIC_SUB_H = 40;
const CLASSIC_HEAD_H = CLASSIC_GROUP_H + CLASSIC_SUB_H;
const CLASSIC_BODY_TOP = TABLE_TOP + CLASSIC_HEAD_H;
const CLASSIC_BODY_BOTTOM = 526;
const CLASSIC_MIN_ROW_H = 27;
const CLASSIC_MAX_DAYS_PER_PAGE = 15;
const PAGE_RIGHT = 801.2;
const CLASSIC_MEALS = [
  { key: 'breakfast', label: 'Café da Manhã', before: ['Antes do café da manhã'], after: ['Após o café da manhã'], during: ['No café da manhã'] },
  { key: 'lunch', label: 'Almoço', before: ['Antes do almoço'], after: ['Após o almoço'], during: ['No almoço'] },
  { key: 'snack', label: 'Lanche', before: ['Antes do lanche da manhã', 'Antes do lanche da tarde', 'Antes do lanche'], after: ['Após o lanche da manhã', 'Após o lanche da tarde', 'Após o lanche'], during: ['No lanche da manhã', 'No lanche da tarde'] },
  { key: 'dinner', label: 'Jantar', before: ['Antes do jantar'], after: ['Após o jantar'], during: ['No jantar'] }
];
const HEADER = '#4f81bd', LIGHT = '#c6d9f1', WHITE = '#ffffff', BLACK = '#000000', GRAY = '#444444';

/* ------------------------------ texto ------------------------------ */

const safe = value => String(value ?? '')
  .replace(/[—–]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\u2026/g, '...')
  .replace(/[^\x20-\xFF]/g, '?').replace(/[\\()]/g, char => `\\${char}`);
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const dateLabel = date => { const [year, month, day] = date.split('-'); return `${day}/${month}/${year}`; };
const timeLabel = timestamp => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
const numberLabel = value => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(value) || 0);
const unitOf = event => event.glucoseUnit === 'mmol/L' ? 'mmol/L' : 'mg/dL';

// Larguras (por mil de em) da Helvetica e Helvetica-Bold para ASCII 32..126, para medir texto de verdade.
const REG_WIDTHS = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const BOLD_WIDTHS = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
function textWidth(value, size, bold = false) {
  const table = bold ? BOLD_WIDTHS : REG_WIDTHS;
  let total = 0;
  for (const char of String(value)) { const code = char.normalize('NFD').charCodeAt(0); total += code >= 32 && code <= 126 ? table[code - 32] : 556; }
  return total * size / 1000;
}
function ellipsize(value, width, size, bold) {
  let text = value;
  while (text && textWidth(`${text}...`, size, bold) > width) text = text.slice(0, -1).trimEnd();
  return `${text}...`;
}
function wrapText(value, width, size, bold = false) {
  const out = []; let line = '';
  for (let word of clean(value).split(' ').filter(Boolean)) {
    while (textWidth(word, size, bold) > width) {
      let cut = word.length; while (cut > 1 && textWidth(word.slice(0, cut), size, bold) > width) cut--;
      if (line) { out.push(line); line = ''; }
      out.push(word.slice(0, cut)); word = word.slice(cut);
    }
    const next = line ? `${line} ${word}` : word;
    if (!line || textWidth(next, size, bold) <= width) line = next; else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out;
}
// Escolhe o maior tamanho de fonte em que o conteúdo cabe na célula; no último caso, corta com "...".
function fitBlock(paragraphs, width, height, sizes, bold = false) {
  const items = paragraphs.map(clean).filter(Boolean);
  if (!items.length) return { size: sizes[0], lead: 0, lines: [] };
  for (const size of sizes) {
    const lead = size * 1.16, lines = items.flatMap(item => wrapText(item, width, size, bold));
    if ((lines.length - 1) * lead + size * 0.72 <= height) return { size, lead, lines };
  }
  const size = sizes[sizes.length - 1], lead = size * 1.16, lines = items.flatMap(item => wrapText(item, width, size, bold));
  const max = Math.max(1, Math.floor((height - size * 0.72) / lead) + 1), kept = lines.slice(0, max);
  if (lines.length > max) kept[max - 1] = ellipsize(kept[max - 1], width, size, bold);
  return { size, lead, lines: kept };
}

/* --------------------------- primitivas PDF --------------------------- */

const rgb = hex => [1, 3, 5].map(index => (parseInt(hex.slice(index, index + 2), 16) / 255).toFixed(3)).join(' ');
const py = y => (PAGE_H - y).toFixed(2);
const fillRect = (ops, x, y, w, h, hex) => ops.push(`${rgb(hex)} rg ${x.toFixed(2)} ${py(y + h)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
const rule = (ops, x1, y1, x2, y2) => ops.push(`${x1.toFixed(2)} ${py(y1)} m ${x2.toFixed(2)} ${py(y2)} l S`);
const text = (ops, value, x, y, size, bold = false, hex = BLACK) => ops.push(`BT ${rgb(hex)} rg /F${bold ? 2 : 1} ${size} Tf ${x.toFixed(2)} ${py(y)} Td (${safe(value)}) Tj ET`);
const textRight = (ops, value, right, y, size, bold, hex) => text(ops, value, right - textWidth(value, size, bold), y, size, bold, hex);
const textCenter = (ops, value, center, y, size, bold, hex) => text(ops, value, center - textWidth(value, size, bold) / 2, y, size, bold, hex);

// Desenha as linhas já ajustadas, centralizadas na célula (ou alinhadas à esquerda).
function drawBlock(ops, block, x, y, w, h, { bold = false, color = BLACK, align = 'center', pad = 3 } = {}) {
  if (!block.lines.length) return;
  const cap = block.size * 0.72, top = y + (h - ((block.lines.length - 1) * block.lead + cap)) / 2;
  block.lines.forEach((value, index) => {
    const tx = align === 'left' ? x + pad : x + (w - textWidth(value, block.size, bold)) / 2;
    text(ops, value, tx, top + cap + index * block.lead, block.size, bold, color);
  });
}
const label = (ops, lines, x, y, w, h, size, color) => drawBlock(ops, { size, lead: size * 1.2, lines }, x, y, w, h, { bold: true, color });

/* ------------------------------ dados ------------------------------ */

function allEvents(state) {
  const events = [...(state.monitoring || [])];
  const linked = new Set(events.map(entry => entry.glucoseId).filter(Boolean));
  for (const glucose of state.glucose || []) {
    if (!linked.has(glucose.id)) events.push({ id: `glucose-${glucose.id}`, glucoseId: glucose.id, timestamp: glucose.timestamp, glucoseValue: glucose.value, glucoseUnit: glucose.unit, moment: 'Outro momento', customMoment: '', insulinStatus: 'unknown', insulinDose: null, insulinType: '', mealStatus: 'unknown', food: '', note: glucose.note || '' });
  }
  return events.filter(event => event.timestamp && Number.isFinite(Date.parse(event.timestamp)));
}

function groupedData(state) {
  const days = new Map();
  const ensure = date => { if (!days.has(date)) days.set(date, { events: [], water: 0, waterCount: 0 }); return days.get(date); };
  for (const event of allEvents(state)) ensure(localDayKey(event.timestamp)).events.push(event);
  for (const water of state.water || []) { const row = ensure(localDayKey(water.timestamp)); row.water += Number(water.ml) || 0; row.waterCount += 1; }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function doseFor(event) { return event.insulinStatus === 'yes' && event.insulinDose != null ? numberLabel(event.insulinDose) : ''; }
function doseLabelFor(event) {
  const dose = doseFor(event);
  return dose ? `${dose} U${event.insulinType ? ` (${clean(event.insulinType)})` : ''}` : '';
}

function displayMoment(event) {
  if (event.moment && event.moment !== 'Outro momento') return clean(event.moment);
  if (event.customMoment && event.customMoment !== 'Refeição') return `Outro momento: ${clean(event.customMoment)}`;
  return 'Momento não informado';
}

function hasGlucoseValue(event) {
  return event.glucoseValue !== null && event.glucoseValue !== undefined &&
    String(event.glucoseValue).trim() !== '' && Number.isFinite(Number(event.glucoseValue));
}

function eventMomentForReport(event) {
  const moment = clean(event.moment);
  if (moment && moment !== 'Outro momento') return moment;
  const custom = clean(event.customMoment);
  return custom && custom !== 'Refeição' ? custom : moment;
}

function classifyClassicMoment(event) {
  const moment = eventMomentForReport(event);
  for (const meal of CLASSIC_MEALS) {
    if (meal.before.includes(moment)) return { meal: meal.key, slot: 'before', moment };
    if (meal.after.includes(moment)) return { meal: meal.key, slot: 'after', moment };
    if (meal.during.includes(moment)) return { meal: meal.key, slot: 'during', moment };
  }
  if (moment === 'Ao deitar') return { slot: 'bedtime', moment };
  return { slot: 'extra', moment: moment || 'Momento não informado' };
}

function hasInsulinDose(event) {
  return event.insulinStatus === 'yes' && event.insulinDose !== null &&
    event.insulinDose !== undefined && String(event.insulinDose).trim() !== '' &&
    Number.isFinite(Number(event.insulinDose));
}

function emptyClassicDay(date) {
  return {
    date,
    meals: Object.fromEntries(CLASSIC_MEALS.map(meal => [meal.key, { before: [], after: [], doses: [] }])),
    bedtime: [],
    height: CLASSIC_MIN_ROW_H
  };
}

function rowHeightForClassicDay(day) {
  const cells = [day.bedtime];
  for (const meal of CLASSIC_MEALS) {
    cells.push(day.meals[meal.key].before, day.meals[meal.key].after, day.meals[meal.key].doses);
  }
  const maxItems = Math.max(1, ...cells.map(items => items.length));
  // Cada registro ocupa duas linhas (valor/dose e horário). A altura aumenta
  // em dias com mais de uma leitura no mesmo campo, sem sobrepor os valores.
  return Math.max(CLASSIC_MIN_ROW_H, Math.ceil(4 + maxItems * 12.5));
}

function padClassicPage(page) {
  if (page.days.length >= CLASSIC_MAX_DAYS_PER_PAGE) return page;
  const available = CLASSIC_BODY_BOTTOM - CLASSIC_BODY_TOP;
  const used = page.days.reduce((sum, day) => sum + day.height, 0);
  const blankCount = CLASSIC_MAX_DAYS_PER_PAGE - page.days.length;
  const blankHeight = (available - used) / blankCount;
  // Completa a grade como no formulário de referência, quando há espaço
  // suficiente para manter linhas vazias confortáveis para preenchimento.
  if (blankHeight < 18) return page;
  const blanks = Array.from({ length: blankCount }, () => ({
    date: '',
    meals: Object.fromEntries(CLASSIC_MEALS.map(meal => [meal.key, { before: [], after: [], doses: [] }])),
    bedtime: [],
    height: blankHeight,
    blank: true
  }));
  return { ...page, days: [...page.days, ...blanks] };
}

function paginateClassicDays(days) {
  const pages = [];
  let current = [], used = 0;
  const available = CLASSIC_BODY_BOTTOM - CLASSIC_BODY_TOP;
  for (const day of days) {
    if (current.length && (current.length >= CLASSIC_MAX_DAYS_PER_PAGE || used + day.height > available)) {
      pages.push(padClassicPage({ kind: 'classic', days: current }));
      current = [];
      used = 0;
    }
    current.push(day);
    used += Math.min(day.height, available);
  }
  if (current.length) pages.push(padClassicPage({ kind: 'classic', days: current }));
  return pages;
}

function paginateExtraGlucose(records) {
  const pages = [];
  const perPage = 17;
  for (let index = 0; index < records.length; index += perPage) {
    pages.push({ kind: 'extra', records: records.slice(index, index + perPage) });
  }
  return pages;
}

function buildGlucoseMatrixPages(state) {
  const byDate = new Map();
  const extraById = new Set();
  const extraRecords = [];
  const events = allEvents(state).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  for (const event of events) {
    const hasGlucose = hasGlucoseValue(event);
    const hasDose = hasInsulinDose(event);
    if (!hasGlucose && !hasDose) continue;

    const date = localDayKey(event.timestamp);
    const mapping = classifyClassicMoment(event);
    if (!byDate.has(date)) byDate.set(date, emptyClassicDay(date));
    const day = byDate.get(date);

    const meal = mapping.meal ? day.meals[mapping.meal] : null;
    if (meal && hasDose && mapping.slot !== 'during') meal.doses.push(event);

    let glucosePlaced = false;
    if (meal && hasGlucose && (mapping.slot === 'before' || mapping.slot === 'after')) {
      meal[mapping.slot].push(event);
      glucosePlaced = true;
    } else if (meal && !hasGlucose && hasDose && (mapping.slot === 'before' || mapping.slot === 'after')) {
      // A dose-only event gets an explicit unknown glucose marker, not a fake zero.
      meal[mapping.slot].push({ ...event, glucoseUnknown: true });
      glucosePlaced = true;
    } else if (mapping.slot === 'bedtime' && hasGlucose) {
      day.bedtime.push(event);
      glucosePlaced = true;
    } else if (mapping.slot === 'bedtime' && !hasGlucose && hasDose) {
      day.bedtime.push({ ...event, glucoseUnknown: true });
      glucosePlaced = true;
    }

    const dosePlaced = Boolean(meal && hasDose && mapping.slot !== 'during');
    if ((hasGlucose && !glucosePlaced) || (hasDose && !dosePlaced)) {
      const key = event.id || `${event.timestamp}-${event.glucoseValue}-${event.insulinDose}`;
      if (!extraById.has(key)) {
        extraById.add(key);
        extraRecords.push({
          timestamp: event.timestamp,
          date: dateLabel(date),
          time: timeLabel(event.timestamp),
          moment: mapping.moment || 'Momento não informado',
          glucose: hasGlucose && !glucosePlaced ? `${numberLabel(event.glucoseValue)} ${unitOf(event)}` : (!hasGlucose && hasDose && !glucosePlaced ? '?' : ''),
          insulin: hasDose && !dosePlaced ? `${numberLabel(event.insulinDose)} U` : ''
        });
      }
    }
  }

  const days = [...byDate.values()]
    .filter(day => day.bedtime.length || CLASSIC_MEALS.some(meal => {
      const cells = day.meals[meal.key];
      return cells.before.length || cells.after.length || cells.doses.length;
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const day of days) day.height = rowHeightForClassicDay(day);

  const mainPages = paginateClassicDays(days);
  const extraPages = paginateExtraGlucose(extraRecords.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)));
  return [...mainPages, ...extraPages];
}

/* ------------------------------ páginas ------------------------------ */

function footer(ops, page, totalPages, note = '') {
  const baseline = 557;
  text(ops, 'Glucometer', 28.3, baseline, 9.5, true);
  if (note) textCenter(ops, note, 417, baseline, 7.2, false, GRAY);
  textRight(ops, `Página ${page} de ${totalPages}`, PAGE_RIGHT, baseline, 9);
}

function drawStackedEntries(ops, entries, x, y, width, height, kind = 'glucose') {
  if (!entries.length) return;
  const valueSize = 5.7, timeSize = 5.1, lead = 6.25, pairHeight = lead * 2;
  const totalHeight = entries.length * pairHeight;
  let top = y + Math.max(1, (height - totalHeight) / 2);
  for (const event of entries) {
    const value = kind === 'dose' ? `${numberLabel(event.insulinDose)} U` : event.glucoseUnknown || !hasGlucoseValue(event) ? '?' : `${numberLabel(event.glucoseValue)} ${unitOf(event)}`;
    textCenter(ops, value, x + width / 2, top + 5.0, valueSize, true, BLACK);
    textCenter(ops, timeLabel(event.timestamp), x + width / 2, top + 11.2, timeSize, false, GRAY);
    top += pairHeight;
  }
}

function classicGlucosePage(pageData, page, totalPages) {
  const ops = ['q 0.45 w 2 J 0 0 0 RG'];
  const c = CLASSIC_COLUMNS, left = c[0], right = c[c.length - 1];
  const headerBottom = TABLE_TOP + CLASSIC_HEAD_H;
  const groupBottom = TABLE_TOP + CLASSIC_GROUP_H;
  textCenter(ops, 'Automonitorização da Glicemia Capilar (AMG)', (left + right) / 2, 31, 13.8, true);

  // Cabeçalho mesclado no estilo do formulário de referência.
  fillRect(ops, left, TABLE_TOP, right - left, CLASSIC_HEAD_H, HEADER);
  label(ops, ['Dia/Mês/Ano'], c[0], TABLE_TOP, c[1] - c[0], CLASSIC_HEAD_H, 8.8, WHITE);
  const groups = [
    { title: 'Café da Manhã', start: 1, end: 4, mealKey: 'breakfast' },
    { title: 'Almoço', start: 4, end: 7, mealKey: 'lunch' },
    { title: 'Lanche', start: 7, end: 10, mealKey: 'snack' },
    { title: 'Jantar', start: 10, end: 13, mealKey: 'dinner' }
  ];
  for (const group of groups) {
    label(ops, [group.title], c[group.start], TABLE_TOP, c[group.end] - c[group.start], CLASSIC_GROUP_H, 8.6, WHITE);
    for (let sub = 0; sub < 3; sub++) fillRect(ops, c[group.start + sub], groupBottom, c[group.start + sub + 1] - c[group.start + sub], CLASSIC_SUB_H, LIGHT);
    label(ops, ['Antes'], c[group.start], groupBottom, c[group.start + 1] - c[group.start], CLASSIC_SUB_H, 7.4, BLACK);
    label(ops, ['2h', 'após*'], c[group.start + 1], groupBottom, c[group.start + 2] - c[group.start + 1], CLASSIC_SUB_H, 7.4, BLACK);
    label(ops, ['Dose', 'insulina', '(unidade)'], c[group.start + 2], groupBottom, c[group.start + 3] - c[group.start + 2], CLASSIC_SUB_H, 6.6, BLACK);
  }
  label(ops, ['Glicemia', 'ao deitar'], c[13], TABLE_TOP, c[14] - c[13], CLASSIC_HEAD_H, 7.6, WHITE);
  label(ops, ['Obs.'], c[14], TABLE_TOP, c[15] - c[14], CLASSIC_HEAD_H, 8.5, WHITE);

  let y = CLASSIC_BODY_TOP;
  pageData.days.forEach((day, rowIndex) => {
    const h = day.height;
    if (rowIndex % 2) fillRect(ops, left, y, right - left, h, LIGHT);
    textCenter(ops, day.date ? dateLabel(day.date) : '____/____/______', (c[0] + c[1]) / 2, y + h / 2 + 3, day.date ? 8.1 : 7.8, Boolean(day.date), BLACK);
    for (const group of groups) {
      const data = day.meals[group.mealKey];
      drawStackedEntries(ops, data.before, c[group.start], y, c[group.start + 1] - c[group.start], h, 'glucose');
      drawStackedEntries(ops, data.after, c[group.start + 1], y, c[group.start + 2] - c[group.start + 1], h, 'glucose');
      drawStackedEntries(ops, data.doses, c[group.start + 2], y, c[group.start + 3] - c[group.start + 2], h, 'dose');
    }
    drawStackedEntries(ops, day.bedtime, c[13], y, c[14] - c[13], h, 'glucose');
    y += h;
  });

  // Grade da tabela: divisórias verticais dos subcampos e faixas alternadas.
  rule(ops, left, TABLE_TOP, right, TABLE_TOP);
  rule(ops, left, groupBottom, right, groupBottom);
  rule(ops, left, headerBottom, right, headerBottom);
  rule(ops, left, y, right, y);
  for (let row = 0; row < pageData.days.length; row++) {
    const rowY = CLASSIC_BODY_TOP + pageData.days.slice(0, row + 1).reduce((sum, day) => sum + day.height, 0);
    rule(ops, left, rowY, right, rowY);
  }
  // Limites de grupos e de cada subcoluna de refeição.
  c.forEach((x, index) => {
    const isGroupBoundary = [0, 1, 4, 7, 10, 13, 14, 15].includes(index);
    rule(ops, x, isGroupBoundary ? TABLE_TOP : groupBottom, x, y);
  });
  text(ops, '* A coluna agrupa registros marcados como “Após”; o sistema não verifica o intervalo exato de 2 horas.', left, 543, 6.8, false, GRAY);
  footer(ops, page, totalPages);
  ops.push('Q');
  return ops.join('\n');
}

const EXTRA_GLUCOSE_COLS = [126.2, 211.2, 265.2, 480.2, 620.2, 716.2];
function extraGlucosePage(records, page, totalPages) {
  const ops = ['q 0.5 w 2 J 0 0 0 RG'];
  const cols = EXTRA_GLUCOSE_COLS, left = cols[0], right = cols[cols.length - 1];
  const headH = 31, rowH = 22, bodyTop = TABLE_TOP + headH;
  textCenter(ops, 'Medições fora dos campos do modelo', (left + right) / 2, 36, 13.5, true);
  fillRect(ops, left, TABLE_TOP, right - left, headH, HEADER);
  [['Data'], ['Hora'], ['Momento'], ['Glicemia'], ['Unidades de insulina']].forEach((lines, index) => label(ops, lines, cols[index], TABLE_TOP, cols[index + 1] - cols[index], headH, 8.8, WHITE));
  records.forEach((record, index) => {
    const y = bodyTop + index * rowH;
    if (index % 2) fillRect(ops, left, y, right - left, rowH, LIGHT);
    const values = [record.date, record.time, record.moment, record.glucose, record.insulin];
    values.forEach((value, col) => {
      const x = cols[col], w = cols[col + 1] - x;
      const block = fitBlock([value], w - 6, rowH - 3, [8.5, 7.8, 7], col === 0);
      drawBlock(ops, block, x, y, w, rowH, { bold: col === 0, pad: 3, align: col === 2 ? 'left' : 'center' });
    });
  });
  rule(ops, left, TABLE_TOP, right, TABLE_TOP);
  rule(ops, left, bodyTop, right, bodyTop);
  for (let row = 0; row <= records.length; row++) rule(ops, left, bodyTop + row * rowH, right, bodyTop + row * rowH);
  cols.forEach(x => rule(ops, x, TABLE_TOP, x, bodyTop + records.length * rowH));
  footer(ops, page, totalPages, 'Sem alimentos nem observações pessoais.');
  ops.push('Q');
  return ops.join('\n');
}

function waterPage(days, page, totalPages, isLast, grandTotal) {
  const ops = ['q 0.5 w 2 J 0 0 0 RG'], left = WATER_COLS[0], right = WATER_COLS[4];
  const bodyTop = TABLE_TOP + WATER_HEAD_H, bottom = bodyTop + days.length * WATER_ROW_H;
  textCenter(ops, 'Resumo diário de água', 417, 36, 14, true);
  fillRect(ops, left, TABLE_TOP, right - left, WATER_HEAD_H, HEADER);
  ['Dia/Mês/Ano', 'Água tomada no dia', 'Nº de registros', 'Observações'].forEach((value, index) => label(ops, [value], WATER_COLS[index], TABLE_TOP, WATER_COLS[index + 1] - WATER_COLS[index], WATER_HEAD_H, 10.5, WHITE));
  days.forEach(([date, row], index) => {
    const y = bodyTop + index * WATER_ROW_H;
    if (index % 2) fillRect(ops, left, y, right - left, WATER_ROW_H, LIGHT);
    ['' + dateLabel(date), `${numberLabel(row.water)} ml`, String(row.waterCount), row.water ? 'Registrada no diário' : 'Sem registro'].forEach((value, col) => {
      const x = WATER_COLS[col], w = WATER_COLS[col + 1] - x;
      drawBlock(ops, fitBlock([value], w - 4, WATER_ROW_H - 4, [10]), x, y, w, WATER_ROW_H, { bold: col === 0 });
    });
  });
  rule(ops, left, TABLE_TOP, right, TABLE_TOP);
  for (let row = 0; row <= days.length; row++) rule(ops, left, bodyTop + row * WATER_ROW_H, right, bodyTop + row * WATER_ROW_H);
  WATER_COLS.forEach(x => rule(ops, x, TABLE_TOP, x, bottom));
  if (isLast) {
    text(ops, `Total geral de água: ${numberLabel(grandTotal)} ml`, left, bottom + 28, 11, true);
    text(ops, 'Este resumo não cria metas nem interpreta o consumo.', left, bottom + 44, 8.5, false, GRAY);
  }
  footer(ops, page, totalPages, 'A soma considera os registros de água do período.');
  ops.push('Q');
  return ops.join('\n');
}

/* ------------------------- alimentação detalhada ------------------------- */

const FOOD_COLS = [23.2, 108.2, 153.2, 303.2, 638.2, 720.2, 801.2];
const FOOD_HEAD_H = 32;
const FOOD_TOP = TABLE_TOP + FOOD_HEAD_H;
const FOOD_BOTTOM = 542;
const FOOD_FONT = 10.2;
const FOOD_LEAD = 11.6;

function foodDetailRecords(state) {
  return allEvents(state)
    .filter(event => event.recordType === 'food' || clean(event.food) || event.mealStatus === 'yes')
    .map(event => {
      const food = clean(event.food) || 'Alimentação informada; detalhes não informados';
      const lines = wrapText(food, FOOD_COLS[4] - FOOD_COLS[3] - 14, FOOD_FONT, false);
      const noteLines = event.note ? wrapText(`Observação: ${clean(event.note)}`, FOOD_COLS[4] - FOOD_COLS[3] - 14, FOOD_FONT, false) : [];
      const allLines = [...lines, ...noteLines];
      const rowHeight = Math.max(37, allLines.length * FOOD_LEAD + 12);
      return {
        date: dateLabel(localDayKey(event.timestamp)),
        timestamp: event.timestamp,
        time: timeLabel(event.timestamp),
        moment: displayMoment(event),
        food,
        foodLines: allLines,
        glucose: event.glucoseValue == null ? ((event.insulinStatus === 'yes' || event.mealStatus === 'yes' || clean(event.food)) ? '?' : '—') : `${numberLabel(event.glucoseValue)} ${unitOf(event)}`,
        insulin: doseLabelFor(event) || '—',
        rowHeight
      };
    })
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

function paginateFoodRecords(records) {
  const pages = [];
  let page = [], used = 0;
  const available = FOOD_BOTTOM - FOOD_TOP;
  for (const record of records) {
    if (page.length && used + record.rowHeight > available) {
      pages.push(page);
      page = [];
      used = 0;
    }
    // Um registro individual sempre é mantido inteiro; os limites dos campos
    // permitem até 500 caracteres de comida + observação sem cortar texto.
    page.push(record);
    used += record.rowHeight;
  }
  if (page.length) pages.push(page);
  return pages;
}

function foodDetailPage(records, page, totalPages) {
  const ops = ['q 0.5 w 2 J 0 0 0 RG'];
  const left = FOOD_COLS[0], right = FOOD_COLS[FOOD_COLS.length - 1];
  textCenter(ops, 'Alimentação - detalhes registrados', 417, 36, 14, true);
  fillRect(ops, left, TABLE_TOP, right - left, FOOD_HEAD_H, HEADER);
  const headers = [
    ['Data'], ['Hora'], ['Refeição / momento'], ['O que comeu / observação'], ['Glicemia'], ['Insulina']
  ];
  headers.forEach((lines, index) => label(ops, lines, FOOD_COLS[index], TABLE_TOP, FOOD_COLS[index + 1] - FOOD_COLS[index], FOOD_HEAD_H, 9.7, WHITE));

  let y = FOOD_TOP;
  records.forEach((record, index) => {
    const height = record.rowHeight;
    if (index % 2) fillRect(ops, left, y, right - left, height, LIGHT);
    const drawValue = (value, col, bold = false, font = [9.5, 9, 8.5]) => {
      const x = FOOD_COLS[col], w = FOOD_COLS[col + 1] - x;
      const block = fitBlock([value], w - 8, height - 4, font, bold);
      drawBlock(ops, block, x, y, w, height, { bold, pad: 4, align: col === 3 ? 'left' : 'center' });
    };
    drawValue(record.date, 0, true);
    drawValue(record.time, 1);
    drawValue(record.moment, 2, false, [9.5, 9, 8]);
    drawBlock(ops, { size: FOOD_FONT, lead: FOOD_LEAD, lines: record.foodLines }, FOOD_COLS[3], y, FOOD_COLS[4] - FOOD_COLS[3], height, { align: 'left', pad: 7 });
    drawValue(record.glucose, 4);
    drawValue(record.insulin, 5);
    rule(ops, left, y + height, right, y + height);
    y += height;
  });
  rule(ops, left, TABLE_TOP, right, TABLE_TOP);
  rule(ops, left, FOOD_TOP, right, FOOD_TOP);
  FOOD_COLS.forEach(x => rule(ops, x, TABLE_TOP, x, y));
  footer(ops, page, totalPages, 'Texto da alimentação preservado; registros sem glicemia são incluídos normalmente.');
  ops.push('Q');
  return ops.join('\n');
}

/* ------------------------------ arquivo PDF ------------------------------ */

function pdfBlob(pages, title) {
  const objects = []; const add = value => { objects.push(value); return objects.length; };
  const pageIds = pages.map(() => add(null)); const pagesId = add(null);
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const boldId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const byteLength = value => Array.from(value, char => char.charCodeAt(0) & 255).length;
  pages.forEach((content, index) => {
    const contentId = add(`<< /Length ${byteLength(content)} >>\nstream\n${content}\nendstream`);
    objects[pageIds[index] - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> >> /Contents ${contentId} 0 R >>`;
  });
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const infoId = add(`<< /Title (${safe(title)}) /Producer (Glucometer) >>`);
  let result = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(byteLength(result)); result += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = byteLength(result); result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index++) result += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  result += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([Uint8Array.from(Array.from(result, char => char.charCodeAt(0) & 255))], { type: 'application/pdf' });
}

const chunk = (list, size) => { const out = []; for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size)); return out; };

export function buildDailyPdf(state, { includeGlucose = true, includeFood = false, includeWater = false } = {}) {
  const glucosePages = includeGlucose ? buildGlucoseMatrixPages(state) : [];
  const allDays = groupedData(state);
  const waterChunks = includeWater && (state.water || []).length ? chunk(allDays.filter(([, row]) => row.waterCount > 0), WATER_ROWS) : [];
  const foodChunks = includeFood ? paginateFoodRecords(foodDetailRecords(state)) : [];
  const totalPages = glucosePages.length + waterChunks.length + foodChunks.length;
  if (!totalPages) return null;

  const grandTotal = allDays.reduce((sum, [, row]) => sum + row.water, 0);
  const pages = glucosePages.map((glucosePage, index) => glucosePage.kind === 'extra'
    ? extraGlucosePage(glucosePage.records, index + 1, totalPages)
    : classicGlucosePage(glucosePage, index + 1, totalPages));
  waterChunks.forEach((pageDays, index) => pages.push(waterPage(pageDays, glucosePages.length + index + 1, totalPages, index === waterChunks.length - 1, grandTotal)));
  foodChunks.forEach((records, index) => pages.push(foodDetailPage(records, glucosePages.length + waterChunks.length + index + 1, totalPages)));
  return pdfBlob(pages, 'Automonitorização da Glicemia Capilar (AMG)');
}
