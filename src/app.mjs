import {
  loadState, saveState, makeId, localDateTimeInput, parseLocalDateTime,
  dateToLocalInput, filterByPeriod, sortNewest, glucoseSummary, waterSummary,
  formatVolume, UNITS, ANSWERS, MOMENTS, localDayKey, isSameLocalDay, monitoringForToday, sortOldest, createDefaultState, calculateInsulinFormula,
  extractStateFromBackupPayload, mergeStates, getLocalRecoveryBackups
} from './core.mjs?v=7';
import { buildDailyPdf } from './pdf-export.mjs?v=8';
import { buildGlucoseMeterSvg } from './glucose-card.mjs?v=3';

let state = loadState();
let toastTimer = null;
let reminderAudio = null;
let deferredInstallPrompt = null;
const $ = id => document.getElementById(id);
const glucoseForm = $('glucose-form');
const waterForm = $('water-form');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function formatDate(value, options = {}) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', ...options
  }).format(date);
}

function formatDay(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).format(date);
}

function displayPeriod(value) {
  return ({ today: 'hoje', '7d': 'nos últimos 7 dias', '30d': 'nos últimos 30 dias', all: 'em todo o histórico' })[value] || 'no período';
}

function showToast(message, type = 'success', duration = 3600) {
  const region = $('toast-region');
  region.textContent = '';
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  region.append(toast);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.remove(), duration);
}

// Mantém o mesmo MP3 para testar e tocar os lembretes, sem fala sintetizada.
function getReminderAudio() {
  if (!reminderAudio) {
    const soundUrl = new URL('../soundreality-glass-filled-with-water-201638.mp3', import.meta.url).href;
    reminderAudio = new Audio(soundUrl);
    reminderAudio.preload = 'auto';
    reminderAudio.volume = 0.9;
  }
  return reminderAudio;
}

async function playNotificationSound({ test = false } = {}) {
  try {
    const audio = getReminderAudio();
    audio.pause();
    audio.currentTime = 0;
    await audio.play();
    if (test) showToast('Som do lembrete reproduzido.', 'success');
    return true;
  } catch (error) {
    console.warn('Não foi possível reproduzir o áudio local do lembrete:', error);
    if (test || !document.hidden) {
      showToast('O navegador bloqueou o áudio. Clique em “Testar som” e confira o volume do dispositivo.', 'error', 6000);
    }
    return false;
  }
}

function commit(change, successMessage = '') {
  const previousState = structuredClone(state);
  const previous = JSON.stringify(state);
  change();
  const updatedAt = new Date().toISOString();
  for (const collection of ['glucose', 'water', 'monitoring']) {
    const previousById = new Map((previousState[collection] || []).map(item => [String(item.id), item]));
    state[collection] = (state[collection] || []).map(item => {
      const before = previousById.get(String(item.id));
      if (!before) return { ...item, updatedAt };
      const oldComparable = { ...before }; delete oldComparable.updatedAt;
      const newComparable = { ...item }; delete newComparable.updatedAt;
      return JSON.stringify(oldComparable) === JSON.stringify(newComparable)
        ? { ...item, ...(before.updatedAt ? { updatedAt: before.updatedAt } : {}) }
        : { ...item, updatedAt };
    });
  }
  try {
    saveState(state);
  } catch (error) {
    state = JSON.parse(previous);
    showToast(error?.message || 'Não foi possível salvar neste navegador.', 'error', 5000);
    return false;
  }
  render();
  if (successMessage) showToast(successMessage);
  return true;
}

function setPage(page) {
  const valid = ['dashboard', 'today', 'glucose', 'water', 'data'].includes(page) ? page : 'dashboard';
  document.querySelectorAll('.view').forEach(view => {
    const active = view.id === `view-${valid}`;
    view.hidden = !active;
    view.classList.toggle('is-visible', active);
  });
  document.querySelectorAll('[data-nav]').forEach(link => {
    const active = link.dataset.nav === valid;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $('page-crumb').textContent = ({ dashboard: 'Dashboard', today: 'Hoje', glucose: 'Glicose', water: 'Água', data: 'Dados e instalação' })[valid];
  document.body.dataset.page = valid;
  history.replaceState(null, '', `#${valid}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderHeader() {
  const now = new Date();
  $('today-label').textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'long' }).format(now);
}

function renderDailyCheckin() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const isToday = timestamp => {
    const time = Date.parse(timestamp);
    return Number.isFinite(time) && time >= start.getTime() && time < end.getTime();
  };
  const glucoseDone = state.glucose.some(entry => isToday(entry.timestamp));
  const waterDone = state.water.some(entry => isToday(entry.timestamp));
  const completed = Number(glucoseDone) + Number(waterDone);
  const percent = completed * 50;
  $('checkin-count').textContent = `${completed} de 2`;
  $('checkin-percent').textContent = `${percent}%`;
  $('checkin-progress-bar').style.width = `${percent}%`;
  $('checkin-message').textContent = completed === 2
    ? 'Check-in completo. Você cuidou do essencial de hoje.'
    : completed === 1
      ? 'Mais um registro e seu check-in de hoje fica completo.'
      : 'Duas anotações rápidas deixam seu dia visível.';
  [['glucose', glucoseDone], ['water', waterDone]].forEach(([kind, done]) => {
    const item = document.querySelector(`.checkin-${kind}`);
    item.classList.toggle('is-done', done);
    $(`checkin-${kind}-status`).textContent = done ? 'Anotado hoje' : 'Ainda falta anotar';

  });
}

function renderDashboard() {
  const period = state.settings.period;
  const glucose = glucoseSummary(state.glucose, period);
  const water = waterSummary(state.water, period);
  const latestWater = water.latest;
  const averages = Object.entries(glucose.averages);

  $('period-select').value = period;
  $('period-hint').textContent = period === 'all' ? 'Desde o primeiro registro' : 'Inclui os dias sem registros';
  $('glucose-average-caption').textContent = glucose.count
    ? `${glucose.count} ${glucose.count === 1 ? 'medição' : 'medições'} ${displayPeriod(period)}`
    : 'Sem registros no período';
  $('glucose-entry-count').textContent = `${glucose.count} ${glucose.count === 1 ? 'medição' : 'medições'}`;
  if (!averages.length) {
    $('glucose-average').textContent = '—';
    $('glucose-average').classList.remove('is-multi');
  } else if (averages.length === 1) {
    const [unit, item] = averages[0];
    $('glucose-average').textContent = `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: unit === 'mg/dL' ? 0 : 1 }).format(item.average)} ${unit}`;
    $('glucose-average').classList.remove('is-multi');
  } else {
    $('glucose-average').innerHTML = averages.map(([unit, item]) => `<span>${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: unit === 'mg/dL' ? 0 : 1 }).format(item.average)} <small>${escapeHtml(unit)}</small></span>`).join('');
    $('glucose-average').classList.add('is-multi');
  }

  $('water-total').textContent = water.count ? formatVolume(water.totalMl) : '—';
  $('water-total-caption').textContent = water.count ? `${water.count} ${water.count === 1 ? 'registro' : 'registros'} ${displayPeriod(period)}` : 'Sem registros no período';
  $('water-entry-count').textContent = `${water.count} ${water.count === 1 ? 'registro' : 'registros'}`;
  $('water-average').textContent = water.averageMlPerDay === null ? '— / dia' : `${formatVolume(water.averageMlPerDay)} / dia`;
  $('water-period-total').textContent = water.count ? new Intl.NumberFormat('pt-BR').format(water.totalMl) : '—';
  $('water-period-count').textContent = water.count ? `${water.count} ${water.count === 1 ? 'registro' : 'registros'} ${displayPeriod(period)}` : 'Sem registros ainda';
  $('rhythm-subtitle').textContent = `Resumo ${displayPeriod(period)}`;

  if (latestWater) {
    $('last-water-volume').textContent = formatVolume(latestWater.ml);
    $('last-water-time').textContent = `às ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(latestWater.timestamp))}`;
    $('last-water-date').textContent = formatDay(latestWater.timestamp);
  } else {
    $('last-water-volume').textContent = '—';
    $('last-water-time').textContent = 'Ainda sem registro';
    $('last-water-date').textContent = '';
  }

  renderDashboardGlucose(glucose.latestTen);
  renderReminder();
}

function glucoseRow(entry, compact = false) {
  const note = entry.note ? `<span class="record-note">${escapeHtml(entry.note)}</span>` : '';
  const context = compact ? '' : `<div class="record-actions"><button type="button" data-action="edit-glucose" data-id="${escapeHtml(entry.id)}" aria-label="Editar medição de ${escapeHtml(entry.value)} ${escapeHtml(entry.unit)}" title="Editar"><svg><use href="#i-edit"/></svg></button><button type="button" data-action="download-glucose-image" data-id="${escapeHtml(entry.id)}" aria-label="Baixar imagem da glicose ${escapeHtml(entry.value)} ${escapeHtml(entry.unit)}" title="Baixar imagem da glicose atual"><svg><use href="#i-image"/></svg></button><button type="button" data-action="delete-glucose" data-id="${escapeHtml(entry.id)}" aria-label="Excluir medição de ${escapeHtml(entry.value)} ${escapeHtml(entry.unit)}" title="Excluir"><svg><use href="#i-trash"/></svg></button></div>`;
  return `<article class="record-row glucose-record ${compact ? 'compact-record' : ''}"><span class="record-marker glucose-marker"><svg><use href="#i-pulse"/></svg></span><div class="record-main"><strong>${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: entry.unit === 'mg/dL' ? 0 : 1 }).format(entry.value)} <small>${escapeHtml(entry.unit)}</small></strong>${note}</div><time class="record-time" datetime="${escapeHtml(entry.timestamp)}">${formatDate(entry.timestamp)}</time>${context}</article>`;
}

function waterRow(entry) {
  return `<article class="record-row water-record"><span class="record-marker water-marker"><svg><use href="#i-drop"/></svg></span><div class="record-main"><strong>${formatVolume(entry.ml)}</strong><span class="record-note">Água</span></div><time class="record-time" datetime="${escapeHtml(entry.timestamp)}">${formatDate(entry.timestamp)}</time><div class="record-actions"><button type="button" data-action="edit-water" data-id="${escapeHtml(entry.id)}" aria-label="Editar registro de ${entry.ml} ml" title="Editar"><svg><use href="#i-edit"/></svg></button><button type="button" data-action="delete-water" data-id="${escapeHtml(entry.id)}" aria-label="Excluir registro de ${entry.ml} ml" title="Excluir"><svg><use href="#i-trash"/></svg></button></div></article>`;
}

function emptyState(title, text, kind = 'default') {
  return `<div class="empty-state empty-${kind}"><span class="empty-mark"><svg><use href="${kind === 'water' ? '#i-drop' : kind === 'glucose' ? '#i-pulse' : '#i-spark'}"/></svg></span><strong>${title}</strong><p>${text}</p></div>`;
}

function renderDashboardGlucose(entries) {
  const list = $('dashboard-glucose-list');
  list.innerHTML = entries.length
    ? entries.map(entry => glucoseRow(entry, true)).join('')
    : emptyState('Seu histórico começa aqui', 'Quando registrar uma medição, ela aparecerá neste espaço.', 'glucose');
}

function renderGlucoseHistory() {
  const entries = sortNewest(state.glucose);
  $('glucose-history-count').textContent = `${entries.length} ${entries.length === 1 ? 'medição' : 'medições'}`;
  $('glucose-history-list').innerHTML = entries.length
    ? entries.map(entry => glucoseRow(entry)).join('')
    : emptyState('Nenhuma medição ainda', 'Use “Nova medição” para guardar o primeiro registro.', 'glucose');
}

function renderWaterHistory() {
  const entries = sortNewest(state.water);
  $('water-history-count').textContent = `${entries.length} ${entries.length === 1 ? 'registro' : 'registros'}`;
  $('water-history-list').innerHTML = entries.length
    ? entries.map(waterRow).join('')
    : emptyState('Seu primeiro registro cabe em um toque', 'Escolha um volume acima e salve quando quiser.', 'water');
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTotal = state.water.filter(entry => Date.parse(entry.timestamp) >= todayStart.getTime() && Date.parse(entry.timestamp) <= Date.now()).reduce((sum, entry) => sum + entry.ml, 0);
  $('water-today-value').textContent = formatVolume(todayTotal);
}

function renderReminder() {
  const reminder = state.settings.reminder;
  const interval = reminder.intervalMinutes;
  const enabled = reminder.enabled;
  const paused = reminder.paused;
  const granted = 'Notification' in window && Notification.permission === 'granted';
  const mode = granted
    ? 'A página aberta pode mostrar notificações do navegador. Para alertas com tudo fechado, veja o estado em segundo plano abaixo.'
    : 'Os lembretes locais funcionam enquanto a página estiver aberta; permita notificações no navegador para ver alertas fora da tela.';
  $('reminder-interval').value = String(interval);
  const label = !enabled ? 'Lembretes desativados' : paused ? 'Lembretes pausados' : `Lembrete a cada ${interval} min`;
  $('reminder-summary').textContent = label;
  $('reminder-subsummary').textContent = enabled && !paused ? mode : 'Ative ou retome quando preferir';
  $('reminder-status-text').textContent = !enabled ? 'Desativado' : paused ? 'Pausado' : granted ? 'Ativo · página aberta' : 'Ativo · página aberta (sem permissão de notificação)';
  $('reminder-status-dot').classList.toggle('is-on', enabled && !paused);
  $('reminder-status-dot').classList.toggle('is-paused', enabled && paused);
  const mainButton = $('reminder-toggle-water');
  mainButton.querySelector('span').textContent = enabled ? 'Desativar lembretes' : 'Ativar lembretes';
  $('reminder-pause').hidden = !enabled;
  $('reminder-pause').textContent = paused ? 'Retomar' : 'Pausar';
  $('reminder-toggle-dashboard').classList.toggle('is-on', enabled && !paused);
  $('reminder-toggle-dashboard').setAttribute('aria-pressed', String(enabled && !paused));
  $('reminder-toggle-dashboard').setAttribute('aria-label', enabled ? 'Desativar lembretes' : 'Ativar lembretes');
  void updateBackgroundPushUI();
}

function countEntries(value = state) {
  return ['glucose', 'water', 'monitoring'].reduce((total, key) => total + (Array.isArray(value?.[key]) ? value[key].length : 0), 0);
}

function renderRecoveryPanel() {
  const status = $('data-recovery-status');
  const button = $('data-restore-local');
  if (!status || !button) return;
  const currentCount = countEntries(state);
  const backups = getLocalRecoveryBackups();
  const best = backups[0];
  const currentCounts = `${state.glucose.length} glicemias, ${state.water.length} registros de água e ${state.monitoring.length} anotações de refeição/insulina`;
  status.textContent = `Este navegador contém: ${currentCounts}. O Glucometer agora mantém cópias locais anteriores antes de salvar alterações.`;
  button.hidden = !best || best.total <= currentCount;
  if (best && best.total > currentCount) {
    button.textContent = `Recuperar cópia anterior (${best.total} registros)`;
    button.dataset.backupIndex = String(best.index);
  }
}

function render() {
  renderHeader();
  renderDailyCheckin();
  renderDashboard();
  renderMonitoring();
  renderGlucoseHistory();
  renderWaterHistory();
  renderDailyTimeline();
  renderComparison();
  renderRecoveryPanel();
}

function mergeIntoCurrent(imported) {
  const merged = mergeStates(state, imported);
  const counts = { glucose: merged.glucose.length, water: merged.water.length, monitoring: merged.monitoring.length };
  saveState(merged);
  state = merged;
  render();
  return counts;
}

async function handleBackupImport(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  const status = $('data-import-status');
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('O arquivo excede 10 MB. Escolha um backup menor.');
    const payload = JSON.parse(await file.text());
    const imported = extractStateFromBackupPayload(payload);
    const importedCounts = { glucose: imported.glucose.length, water: imported.water.length, monitoring: imported.monitoring.length };
    const total = importedCounts.glucose + importedCounts.water + importedCounts.monitoring;
    const confirmed = window.confirm(
      `Backup reconhecido: ${importedCounts.glucose} registros de glicose, ${importedCounts.water} de água e ${importedCounts.monitoring} anotações de refeição/insulina.\n\n` +
      `Os registros serão mesclados por ID com o diário atual, sem apagar o que já existe e sem duplicar os mesmos IDs. Continuar?`
    );
    if (!confirmed) { status.textContent = 'Importação cancelada; nenhum dado foi alterado.'; return; }
    const counts = mergeIntoCurrent(imported);
    status.textContent = `Recuperação concluída. O diário agora contém ${counts.glucose} glicemias, ${counts.water} registros de água e ${counts.monitoring} anotações. O arquivo original não foi alterado.`;
    showToast(`${total} registros do backup foram verificados e mesclados.`, 'success', 6000);
  } catch (error) {
    status.textContent = error?.message || 'Não foi possível ler o backup. Os dados atuais foram mantidos.';
    showToast(status.textContent, 'error', 7000);
  } finally {
    input.value = '';
  }
}

function restoreLocalBackup() {
  const backups = getLocalRecoveryBackups();
  const selected = backups.find(item => String(item.index) === $('data-restore-local').dataset.backupIndex) || backups[0];
  if (!selected) { showToast('Não encontrei uma cópia anterior recuperável.', 'error'); return; }
  const confirmed = window.confirm(`Encontrei uma cópia anterior com ${selected.counts.glucose} glicemias, ${selected.counts.water} registros de água e ${selected.counts.monitoring} anotações. Vou mesclar com o diário atual, sem apagar registros atuais. Continuar?`);
  if (!confirmed) return;
  try {
    const counts = mergeIntoCurrent(selected.state);
    $('data-import-status').textContent = `Cópia anterior recuperada. Total atual: ${counts.glucose} glicemias, ${counts.water} registros de água e ${counts.monitoring} anotações.`;
    showToast('Cópia anterior recuperada sem substituir registros atuais.', 'success', 6000);
  } catch (error) {
    showToast(error?.message || 'Não foi possível recuperar a cópia local.', 'error', 7000);
  }
}

function renderDailyTimeline() {
  const root = $('daily-timeline');
  if (!root) return;
  const today = localDayKey(new Date());
  const selectedDay = $('timeline-date')?.value || today;
  const isCurrentDay = selectedDay === today;
  const linkedGlucose = new Set(state.monitoring.map(item => item.glucoseId).filter(Boolean));
  const entries = [];
  for (const entry of state.monitoring) {
    if (localDayKey(entry.timestamp) !== selectedDay) continue;
    entries.push({ kind: entry.recordType === 'insulin' || (entry.glucoseValue == null && entry.insulinStatus === 'yes' && entry.mealStatus !== 'yes' && !entry.food) ? 'insulin' : entry.recordType === 'food' || entry.mealStatus === 'yes' || entry.food ? 'food' : 'glucose', id: entry.id, glucoseId: entry.glucoseId, timestamp: entry.timestamp, entry });
  }
  for (const entry of state.glucose) {
    if (localDayKey(entry.timestamp) === selectedDay && !linkedGlucose.has(entry.id)) entries.push({ kind: 'glucose', id: entry.id, timestamp: entry.timestamp, entry });
  }
  for (const entry of state.water) {
    if (localDayKey(entry.timestamp) === selectedDay) entries.push({ kind: 'water', id: entry.id, timestamp: entry.timestamp, entry });
  }
  entries.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  $('timeline-count').textContent = `${entries.length} ${entries.length === 1 ? 'evento' : 'eventos'}`;
  $('timeline-title').textContent = isCurrentDay ? 'Linha do tempo de hoje' : `Linha do tempo · ${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${selectedDay}T12:00:00Z`))}`;
  if (!entries.length) {
    root.innerHTML = '<div class="timeline-empty"><span>Seu dia começa com o primeiro registro.</span><small>Glicose, refeições e água aparecerão aqui em ordem de horário.</small></div>';
    return;
  }
  root.innerHTML = entries.map(item => {
    const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.timestamp));
    let title = '', detail = '', icon = 'i-pulse', action = '';
    if (item.kind === 'water') {
      title = `Água · ${formatVolume(item.entry.ml)}`; detail = 'Hidratação registrada'; icon = 'i-drop';
      action = isCurrentDay ? `<button type="button" data-action="edit-water" data-id="${escapeHtml(item.id)}">Editar</button>` : '';
    } else if (item.kind === 'insulin') {
      title = `Insulina · ${item.entry.insulinDose} U`;
      const momentText = item.entry.moment && item.entry.moment !== 'Outro momento' ? item.entry.moment : 'Momento não informado';
      detail = [momentText, 'Glicemia: ?', item.entry.insulinType ? `Tipo: ${item.entry.insulinType}` : '', item.entry.food ? `Alimentação: ${item.entry.food}` : '', item.entry.note].filter(Boolean).join(' · ');
      icon = 'i-pulse'; action = isCurrentDay ? `<button type="button" data-action="edit-monitoring" data-id="${escapeHtml(item.id)}">Editar</button>` : '';
    } else if (item.kind === 'food') {
      title = item.entry.moment && item.entry.moment !== 'Outro momento' ? item.entry.moment : 'Refeição';
      detail = [item.entry.food, item.entry.glucoseValue != null ? `Glicose: ${item.entry.glucoseValue} ${item.entry.glucoseUnit}` : '', item.entry.insulinStatus === 'yes' && item.entry.insulinDose ? `Insulina: ${item.entry.insulinDose} U` : '', item.entry.note].filter(Boolean).join(' · ') || 'Alimentação registrada';
      icon = 'i-utensils'; action = isCurrentDay ? `<button type="button" data-action="edit-monitoring" data-id="${escapeHtml(item.id)}">Editar</button>` : '';
    } else {
      const value = item.entry.value ?? item.entry.glucoseValue;
      const unit = item.entry.unit || item.entry.glucoseUnit || state.settings.glucoseUnit;
      const glucoseId = item.entry.value != null ? item.entry.id : item.entry.glucoseId;
      title = value != null ? `Glicose · ${value} ${unit}` : 'Anotação';
      detail = [item.entry.note, item.entry.insulinStatus === 'yes' && item.entry.insulinDose ? `Insulina: ${item.entry.insulinDose} U` : ''].filter(Boolean).join(' · ') || 'Medição registrada'; icon = 'i-pulse';
      action = isCurrentDay && glucoseId ? `<button type="button" data-action="edit-glucose" data-id="${escapeHtml(glucoseId)}">Editar</button>` : '';
    }
    return `<article class="timeline-item timeline-${item.kind}"><time datetime="${escapeHtml(item.timestamp)}">${time}</time><span class="timeline-marker"><svg><use href="#${icon}"/></svg></span><div class="timeline-copy"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div><div class="timeline-actions">${action}</div></article>`;
  }).join('');
}

function renderComparison() {
  const root = $('comparison-chart');
  if (!root) return;
  const moment = $('comparison-moment')?.value || 'Antes do almoço';
  const unit = $('comparison-unit')?.value || state.settings.glucoseUnit;
  const days = Number($('comparison-days')?.value || 14);
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - days + 1);
  const byDay = new Map();
  const contexts = new Map(state.monitoring.filter(item => item.glucoseId).map(item => [String(item.glucoseId), item]));
  for (const entry of state.glucose) {
    const date = new Date(entry.timestamp);
    if (!Number.isFinite(date.getTime()) || date < start || entry.unit !== unit) continue;
    const context = contexts.get(String(entry.id));
    if ((context?.moment || entry.moment || '') !== moment) continue;
    const key = localDayKey(entry.timestamp);
    const existing = byDay.get(key) || [];
    existing.push(Number(entry.value)); byDay.set(key, existing);
  }
  const data = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({ date, value: values.reduce((sum, value) => sum + value, 0) / values.length, count: values.length }));
  if (!data.length) {
    root.innerHTML = '<div class="chart-empty">Ainda não há medições para esse momento e unidade no período selecionado.</div>';
    $('comparison-summary').textContent = 'Escolha outro momento ou amplie o período. Apenas registros com o mesmo contexto e unidade entram na comparação.';
    return;
  }
  const width = 760, height = 246, left = 48, right = 18, top = 20, bottom = 42;
  const values = data.map(item => item.value);
  let min = Math.min(...values), max = Math.max(...values);
  if (min === max) { min = Math.max(0, min - 10); max += 10; }
  const padding = (max - min) * .12; min = Math.max(0, min - padding); max += padding;
  const x = index => data.length === 1 ? (left + width - right) / 2 : left + index * (width - left - right) / (data.length - 1);
  const y = value => top + (max - value) / (max - min) * (height - top - bottom);
  const ticks = Array.from({ length: 4 }, (_, index) => min + (max - min) * index / 3);
  const grid = ticks.map(value => `<g><line x1="${left}" y1="${y(value)}" x2="${width-right}" y2="${y(value)}" stroke="#e7eaf0" stroke-dasharray="3 4"/><text x="${left-9}" y="${y(value)+4}" text-anchor="end" fill="#737d8e" font-size="11">${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:unit==='mg/dL'?0:1}).format(value)}</text></g>`).join('');
  const path = data.map((item, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(item.value)}`).join(' ');
  const points = data.map((item, index) => `<g><circle cx="${x(index)}" cy="${y(item.value)}" r="4.5" fill="#306bb5" stroke="#fff" stroke-width="2"><title>${item.date}: ${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:unit==='mg/dL'?0:2}).format(item.value)} ${unit}; ${item.count} medição(ões)</title></circle><text x="${x(index)}" y="${height-18}" text-anchor="middle" fill="#737d8e" font-size="10">${item.date.slice(8,10)}/${item.date.slice(5,7)}</text></g>`).join('');
  root.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Valores de glicose em ${escapeHtml(moment)} nos últimos ${days} dias, em ${escapeHtml(unit)}"><title>Comparação por momento</title>${grid}<path d="${path}" fill="none" stroke="#306bb5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${points}</svg>`;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  $('comparison-summary').textContent = `${data.length} dia(s) com registro · média simples dos pontos exibidos: ${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:unit==='mg/dL'?0:2}).format(average)} ${unit}. Isso é um resumo descritivo dos valores, não uma meta médica.`;
}

function setFieldError(fieldId, errorId, message) {
  $(errorId).textContent = message;
  $(fieldId).setAttribute('aria-invalid', message ? 'true' : 'false');
}

function clearGlucoseErrors() {
  setFieldError('glucose-value', 'glucose-value-error', '');
  setFieldError('glucose-date', 'glucose-date-error', '');
  setFieldError('glucose-insulin-dose', 'glucose-insulin-error', '');
}

function updateInsulinFormulaPreview() {
  const result = $('insulin-formula-result');
  if (!result) return;
  const rawValue = $('glucose-value').value.trim();
  const unit = $('glucose-unit').value;
  if (!rawValue || Number(rawValue) === 0) {
    result.textContent = 'Sem glicemia informada. A conta não será calculada; você ainda pode salvar alimentação e insulina.';
    return;
  }
  if (unit !== 'mg/dL') {
    result.textContent = 'Esta fórmula está definida para mg/dL. Selecione mg/dL para visualizar o resultado matemático; não será feita conversão automática.';
    return;
  }
  const calculation = calculateInsulinFormula(rawValue, unit);
  if (!calculation) {
    result.textContent = 'Informe uma glicemia válida em mg/dL para calcular.';
    return;
  }
  const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const unitsText = `${calculation.units} ${calculation.units === 1 ? 'unidade' : 'unidades'}`;
  if (calculation.glucose <= 100) {
    result.textContent = `${number.format(calculation.glucose)} mg/dL → resultado matemático: ${unitsText}.`;
    return;
  }
  result.textContent = `(${number.format(calculation.glucose)} − 100) ÷ 40 = ${number.format(calculation.raw)}; arredondado ao inteiro mais próximo: ${unitsText}.`;
}

function updateGlucoseContextFields() {
  $('glucose-insulin-details').hidden = $('glucose-insulin-status').value !== 'yes';
  $('glucose-food-field').hidden = $('glucose-meal-status').value !== 'yes';
}

function resetGlucoseContextFields(entry = null) {
  const linked = entry ? state.monitoring.find(item => item.glucoseId === entry.id) : null;
  $('glucose-moment').value = linked?.moment || '';
  $('glucose-insulin-status').value = linked?.insulinStatus || 'unknown';
  $('glucose-insulin-dose').value = linked?.insulinDose ?? '';
  $('glucose-insulin-type').value = linked?.insulinType || '';
  $('glucose-meal-status').value = linked?.mealStatus || 'unknown';
  $('glucose-food').value = linked?.food || '';
  updateGlucoseContextFields();
}

function clearWaterErrors() {
  setFieldError('water-volume', 'water-volume-error', '');
  setFieldError('water-date', 'water-date-error', '');
}

function openGlucoseForm(entry = null) {
  $('glucose-form-panel').hidden = false;
  clearGlucoseErrors();
  if (entry) {
    $('glucose-id').value = entry.id;
    $('glucose-value').value = entry.value;
    $('glucose-unit').value = entry.unit;
    $('glucose-date').value = dateToLocalInput(entry.timestamp);
    $('glucose-note').value = entry.note;
    resetGlucoseContextFields(entry);
    updateInsulinFormulaPreview();
    $('glucose-form-title').textContent = 'Editar medição';
    $('glucose-save').innerHTML = '<svg><use href="#i-edit"/></svg> Salvar alterações';
  } else {
    glucoseForm.reset();
    $('glucose-id').value = '';
    $('glucose-unit').value = state.settings.glucoseUnit;
    $('glucose-date').value = localDateTimeInput();
    resetGlucoseContextFields();
    updateInsulinFormulaPreview();
    $('glucose-form-title').textContent = 'Registrar glicose';
    $('glucose-save').innerHTML = '<svg><use href="#i-plus"/></svg> Salvar registro';
  }
  requestAnimationFrame(() => $('glucose-value').focus());
}

function closeGlucoseForm() {
  glucoseForm.reset();
  $('glucose-id').value = '';
  $('glucose-form-panel').hidden = true;
  resetGlucoseContextFields();
  clearGlucoseErrors();
}

function openWaterEdit(entry) {
  $('water-id').value = entry.id;
  $('water-volume').value = entry.ml;
  $('water-date').value = dateToLocalInput(entry.timestamp);
  $('water-form-title').textContent = 'Editar registro de água';
  $('water-save').innerHTML = '<svg><use href="#i-edit"/></svg> Salvar alterações';
  $('water-cancel-edit').hidden = false;
  clearWaterErrors();
  $('water-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  requestAnimationFrame(() => $('water-volume').focus());
}

function resetWaterForm() {
  waterForm.reset();
  $('water-id').value = '';
  $('water-date').value = localDateTimeInput();
  $('water-form-title').textContent = 'Registrar água';
  $('water-save').innerHTML = '<svg><use href="#i-plus"/></svg> Salvar registro';
  $('water-cancel-edit').hidden = true;
  document.querySelectorAll('[data-ml]').forEach(button => button.classList.remove('is-selected'));
  clearWaterErrors();
}

function handleGlucoseSubmit(event) {
  event.preventDefault();
  clearGlucoseErrors();
  const rawValue = $('glucose-value').value.trim();
  const parsedValue = rawValue === '' ? null : Number(rawValue);
  // Blank or 0 means “not measured”, never a measured glucose of zero.
  const value = parsedValue === null || parsedValue === 0 ? null : parsedValue;
  const unit = $('glucose-unit').value;
  const timestamp = parseLocalDateTime($('glucose-date').value);
  const selectedInsulinStatus = $('glucose-insulin-status').value;
  const insulinDose = $('glucose-insulin-dose').value.trim() ? Number($('glucose-insulin-dose').value) : null;
  const selectedMealStatus = $('glucose-meal-status').value;
  const food = $('glucose-food').value.trim();
  const insulinType = $('glucose-insulin-type').value.trim();
  const note = $('glucose-note').value.trim().slice(0, 300);
  const moment = $('glucose-moment').value || 'Outro momento';
  const insulinStatus = selectedInsulinStatus;
  const mealStatus = selectedMealStatus === 'unknown' && food ? 'yes' : selectedMealStatus;
  let valid = true;

  if (rawValue && parsedValue !== 0 && (!Number.isFinite(parsedValue) || parsedValue < 0)) {
    setFieldError('glucose-value', 'glucose-value-error', 'Deixe vazio ou use 0 se não mediu. Uma glicemia medida precisa ser maior que zero.');
    valid = false;
  }
  if (value !== null && !UNITS.includes(unit)) {
    setFieldError('glucose-value', 'glucose-value-error', 'Escolha uma unidade válida.');
    valid = false;
  }
  if (!timestamp) {
    setFieldError('glucose-date', 'glucose-date-error', 'Informe uma data e hora válidas.');
    valid = false;
  }
  if (insulinStatus === 'yes' && (!Number.isFinite(insulinDose) || insulinDose <= 0)) {
    setFieldError('glucose-insulin-dose', 'glucose-insulin-error', 'Informe uma dose positiva quando a resposta for Sim.');
    valid = false;
  }
  const hasContext = Boolean(moment !== 'Outro momento' || insulinStatus !== 'unknown' || mealStatus !== 'unknown' || food || insulinType || note);
  const hasMeaningfulData = value !== null || insulinStatus === 'yes' || mealStatus === 'yes' || food || note;
  if (!hasMeaningfulData) {
    setFieldError('glucose-value', 'glucose-value-error', 'Informe uma glicemia ou registre que comeu e/ou tomou insulina.');
    showToast('Não há glicemia nem alimentação/insulina para salvar.', 'error');
    valid = false;
  }
  if (!valid) return;

  const id = $('glucose-id').value;
  const linked = id ? state.monitoring.find(item => item.glucoseId === id) : null;
  const glucoseId = value !== null ? (id || makeId()) : null;
  const glucoseRecord = value !== null ? { id: glucoseId, value, unit, timestamp, note } : null;
  const shouldStoreContext = hasContext || Boolean(linked);
  const monitoringRecord = {
    id: linked?.id || makeId(),
    recordType: value !== null ? 'monitoring' : (mealStatus === 'yes' || food ? 'food' : insulinStatus === 'yes' ? 'insulin' : 'monitoring'),
    glucoseId,
    timestamp,
    glucoseValue: value,
    glucoseUnit: unit,
    moment,
    customMoment: '',
    insulinStatus,
    insulinDose: insulinStatus === 'yes' ? insulinDose : null,
    insulinType,
    mealStatus,
    food,
    note
  };

  const saved = commit(() => {
    if (id) {
      if (glucoseRecord) {
        const exists = state.glucose.some(item => item.id === id);
        if (exists) state.glucose = state.glucose.map(item => item.id === id ? glucoseRecord : item);
        else state.glucose.push(glucoseRecord);
      } else {
        state.glucose = state.glucose.filter(item => item.id !== id);
      }
    } else if (glucoseRecord) {
      state.glucose.push(glucoseRecord);
    }

    if (shouldStoreContext) {
      if (linked) state.monitoring = state.monitoring.map(item => item.id === linked.id ? monitoringRecord : item);
      else state.monitoring.push(monitoringRecord);
    } else if (linked) {
      state.monitoring = state.monitoring.filter(item => item.id !== linked.id);
    }
    state.settings.glucoseUnit = unit;
  }, id
    ? (value === null ? 'Medição removida; alimentação/insulina preservada.' : 'Registro atualizado.')
    : (value === null ? 'Registro salvo sem glicemia. A exportação mostrará ?.' : 'Registro salvo no seu histórico.'));
  if (saved) closeGlucoseForm();
}

function handleWaterSubmit(event) {
  event.preventDefault();
  clearWaterErrors();
  const ml = Number($('water-volume').value);
  const timestamp = parseLocalDateTime($('water-date').value);
  let valid = true;
  if (!Number.isInteger(ml) || ml < 1 || ml > 10000) {
    setFieldError('water-volume', 'water-volume-error', 'Informe um volume inteiro entre 1 e 10.000 ml.');
    valid = false;
  }
  if (!timestamp) {
    setFieldError('water-date', 'water-date-error', 'Informe uma data e hora válidas.');
    valid = false;
  }
  if (!valid) return;
  const id = $('water-id').value;
  const record = { id: id || makeId(), ml, timestamp };
  const saved = commit(() => {
    if (id) state.water = state.water.map(item => item.id === id ? record : item);
    else {
      state.water.push(record);
      if (state.settings.reminder.enabled && !state.settings.reminder.paused) {
        state.settings.reminder.nextAt = Date.now() + state.settings.reminder.intervalMinutes * 60000;
      }
    }
  }, id ? 'Registro de água atualizado.' : `${formatVolume(ml)} anotados. Bom cuidado.`);
  if (saved) resetWaterForm();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadGlucoseImage(entry) {
  const context = state.monitoring.find(item => item.glucoseId === entry.id) || {};
  const cardEntry = {
    ...entry,
    moment: context.moment === 'Outro momento' && context.customMoment ? context.customMoment : context.moment,
    insulinStatus: context.insulinStatus || 'unknown',
    insulinDose: context.insulinDose,
    insulinType: context.insulinType || '',
    mealStatus: context.mealStatus || 'unknown',
    food: context.food || '',
    note: entry.note || context.note || ''
  };
  const svg = buildGlucoseMeterSvg(cardEntry);
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);
  const date = localDayKey(new Date(entry.timestamp)) || localDayKey();
  const filename = `glicose-atual-${date}`;

  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('O navegador não conseguiu renderizar a imagem.'));
      image.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas indisponível.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível criar o PNG.')), 'image/png');
    });
    downloadBlob(pngBlob, `${filename}.png`);
    showToast('Imagem da glicose baixada em PNG.');
  } catch (error) {
    // A imagem vetorial permanece disponível mesmo se o navegador não conseguir criar o PNG.
    downloadBlob(svgBlob, `${filename}.svg`);
    showToast('Imagem baixada em SVG para preservar a qualidade.', 'info');
    console.warn('Não foi possível converter o cartão de glicose para PNG:', error);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function handleRecordAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === 'edit-monitoring') { const entry = state.monitoring.find(item => item.id === id); if (entry) { setPage('today'); openMonitoringForm(entry); } } else if (action === 'delete-monitoring') { const entry = state.monitoring.find(item => item.id === id); if (entry && window.confirm('Excluir esta anotação de hoje? Esta ação não pode ser desfeita.')) { commit(() => { state.monitoring = state.monitoring.filter(item => item.id !== id); if (entry.glucoseId) state.glucose = state.glucose.filter(item => item.id !== entry.glucoseId); }, 'Anotação excluída.'); } } else if (action === 'edit-glucose') {
    const entry = state.glucose.find(item => item.id === id);
    if (entry) {
      setPage('glucose');
      openGlucoseForm(entry);
      $('glucose-form-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } else if (action === 'download-glucose-image') {
    const entry = state.glucose.find(item => item.id === id);
    if (entry) void downloadGlucoseImage(entry);
  } else if (action === 'delete-glucose') {
    const entry = state.glucose.find(item => item.id === id);
    if (entry && window.confirm(`Excluir a medição de ${entry.value} ${entry.unit}? Esta ação não pode ser desfeita.`)) {
      commit(() => { state.glucose = state.glucose.filter(item => item.id !== id); state.monitoring = state.monitoring.map(item => item.glucoseId === id ? { ...item, glucoseId: null, glucoseValue: null, updatedAt: new Date().toISOString() } : item); }, 'Medição excluída.');
    }
  } else if (action === 'edit-water') {
    const entry = state.water.find(item => item.id === id);
    if (entry) {
      setPage('water');
      openWaterEdit(entry);
    }
  } else if (action === 'delete-water') {
    const entry = state.water.find(item => item.id === id);
    if (entry && window.confirm(`Excluir o registro de ${entry.ml} ml? Esta ação não pode ser desfeita.`)) {
      commit(() => { state.water = state.water.filter(item => item.id !== id); }, 'Registro de água excluído.');
    }
  }
}

function exportData() {
  const payload = {
    application: 'Glucometer',
    exportedAt: new Date().toISOString(),
    data: state
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `glucometer-dados-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Cópia dos dados baixada neste dispositivo.');
}

function openExportPanel() {
  $('export-panel').hidden = false;
  $('export-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function closeExportPanel() { $('export-panel').hidden = true; }
function downloadFilteredPdf() {
  const from = $('export-from').value, to = $('export-to').value;
  if (from && to && from > to) { showToast('A data inicial não pode ser posterior à data final.', 'error'); return; }
  const inRange = item => {
    const day = localDayKey(item.timestamp);
    return (!from || day >= from) && (!to || day <= to);
  };
  const includeGlucose = $('export-include-glucose').checked;
  const includeFood = $('export-include-food').checked;
  const includeWater = $('export-include-water').checked;
  if (!includeGlucose && !includeFood && !includeWater) { showToast('Selecione ao menos um tipo de informação.', 'error'); return; }
  const glucose = includeGlucose ? state.glucose.filter(inRange) : [];
  const monitoring = state.monitoring.filter(item => {
    if (!inRange(item)) return false;
    const isFood = item.recordType === 'food' || item.mealStatus === 'yes' || Boolean(item.food);
    const isGlucose = item.glucoseValue != null || Boolean(item.glucoseId) || item.insulinStatus === 'yes' || Boolean(item.note && !isFood);
    return (includeGlucose && isGlucose) || (includeFood && isFood);
  }).map(item => {
    if (!includeGlucose && includeFood) return { ...item, glucoseValue: null, glucoseId: null, insulinStatus: 'unknown', insulinDose: null, insulinType: '' };
    if (!includeFood && includeGlucose) return { ...item, recordType: 'monitoring', mealStatus: 'unknown', food: '' };
    return item;
  });
  const filteredState = {
    ...state,
    glucose,
    monitoring,
    water: includeWater ? state.water.filter(inRange) : []
  };
  const blob = buildDailyPdf(filteredState, { includeGlucose, includeFood, includeWater });
  if (!blob) { showToast('Não há registros para as opções e o intervalo selecionados.', 'error'); return; }
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `glucometer-relatorio-${from || 'inicio'}-${to || localDayKey(new Date())}.pdf`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  closeExportPanel();
  showToast('Relatório PDF personalizado baixado neste dispositivo.');
}


const PUSH_SETUP_TOKEN_KEY = 'glucometer.push.setup-token';
let backgroundPushConfigured = false;
let backgroundPushSubscription = null;
let backgroundPushConfigPromise = null;

function getPushSetupToken() {
  const fieldValue = $('push-setup-token')?.value.trim() || '';
  if (fieldValue) return fieldValue;
  try { return localStorage.getItem(PUSH_SETUP_TOKEN_KEY) || ''; }
  catch { return ''; }
}

function savePushSetupToken(token) {
  try { localStorage.setItem(PUSH_SETUP_TOKEN_KEY, token); } catch { /* Token can be re-entered if storage is unavailable. */ }
}

function base64UrlToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

async function fetchPushConfig() {
  if (!backgroundPushConfigPromise) {
    backgroundPushConfigPromise = fetch('/api/push-config', { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(response => {
        if (!response.ok) throw new Error('A configuração de notificações em segundo plano não está disponível.');
        return response.json();
      })
      .catch(error => { backgroundPushConfigPromise = null; throw error; });
  }
  return backgroundPushConfigPromise;
}

async function updateBackgroundPushUI() {
  const status = $('push-background-status');
  const button = $('push-background-toggle');
  if (!status || !button) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window) || !window.isSecureContext) {
    backgroundPushConfigured = false;
    backgroundPushSubscription = null;
    status.textContent = 'Este navegador ou contexto não oferece suporte a notificações push em segundo plano.';
    button.disabled = true;
    button.textContent = 'Notificações em segundo plano indisponíveis';
    return;
  }
  try {
    const config = await fetchPushConfig();
    backgroundPushConfigured = config.configured === true && typeof config.publicKey === 'string' && config.publicKey.length > 20;
    if (!backgroundPushConfigured) {
      backgroundPushSubscription = null;
      status.textContent = 'Notificações com o navegador fechado ainda não estão configuradas na publicação. O lembrete local continua disponível enquanto a página fica aberta.';
      button.disabled = true;
      button.textContent = 'Push indisponível até configurar a publicação';
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    backgroundPushSubscription = await registration.pushManager.getSubscription();
    const hasSetupToken = Boolean(getPushSetupToken());
    if (backgroundPushSubscription) {
      const scheduling = state.settings.reminder.enabled && !state.settings.reminder.paused;
      status.textContent = scheduling
        ? 'Ativo neste navegador. O agendador verifica lembretes a cada 5 minutos; a entrega pode atrasar e depende do navegador, sistema e conexão.'
        : 'A inscrição push existe, mas os lembretes estão desativados ou pausados. Reative para voltar a receber alertas.';
      button.textContent = scheduling ? 'Desativar notificações em segundo plano' : 'Reativar notificações em segundo plano';
    } else {
      status.textContent = hasSetupToken
        ? 'Configuração pronta. Ative para autorizar notificações neste navegador.'
        : 'Digite o código privado configurado na Vercel e ative as notificações. Não há cadastro nem conta.';
      button.textContent = 'Ativar notificações em segundo plano';
    }
    button.disabled = false;
  } catch (error) {
    backgroundPushConfigured = false;
    backgroundPushSubscription = null;
    status.textContent = 'Não consegui verificar a API de notificações em segundo plano. A publicação precisa incluir as funções /api e as variáveis VAPID/Upstash; o lembrete local continua disponível enquanto a página fica aberta. Detalhes: ' + (error?.message || 'endpoint indisponível');
    button.disabled = true;
    button.textContent = 'Push indisponível até corrigir a publicação';
  }
}

async function postPushSettings(extra = {}) {
  const token = getPushSetupToken();
  if (!token || !backgroundPushSubscription) return false;
  try {
    const response = await fetch('/api/push-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ setupToken: token, enabled: state.settings.reminder.enabled, paused: state.settings.reminder.paused, intervalMinutes: state.settings.reminder.intervalMinutes, ...extra })
    });
    return response.ok;
  } catch { return false; }
}

async function toggleBackgroundPush() {
  const button = $('push-background-toggle');
  const status = $('push-background-status');
  button.disabled = true;
  try {
    const config = await fetchPushConfig();
    if (!config.configured || !config.publicKey) {
      throw new Error('Para ativar alertas com a página fechada, configure VAPID, Upstash Redis, o código privado na Vercel e o workflow de agendamento do GitHub. Consulte a seção “Notificações em segundo plano” no README.');
    }

    let token = getPushSetupToken();
    if (!token) {
      $('push-setup-token').focus();
      throw new Error('Digite o código privado PUSH_SETUP_TOKEN definido nas variáveis da Vercel. Isso protege a ativação; não é cadastro nem login.');
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && state.settings.reminder.enabled && !state.settings.reminder.paused) {
      const disabled = await fetch('/api/push-settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ setupToken: token, enabled: false, paused: false, intervalMinutes: state.settings.reminder.intervalMinutes })
      });
      if (!disabled.ok) throw new Error('Não foi possível desativar o agendador. Confira o código privado e a configuração da Vercel.');
      await subscription.unsubscribe();
      backgroundPushSubscription = null;
      status.textContent = 'Notificações em segundo plano desativadas neste navegador.';
      button.textContent = 'Ativar notificações em segundo plano';
      showToast('Notificações em segundo plano desativadas. Os lembretes locais podem continuar ativos.');
      return;
    }

    if (subscription) {
      const reactivated = await fetch('/api/push-settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ setupToken: token, enabled: true, paused: false, intervalMinutes: state.settings.reminder.intervalMinutes })
      });
      const result = await reactivated.json().catch(() => ({}));
      if (!reactivated.ok) throw new Error(result.error || 'Não foi possível reativar os lembretes em segundo plano.');
      commit(() => {
        state.settings.reminder.enabled = true;
        state.settings.reminder.paused = false;
        state.settings.reminder.nextAt = Date.now() + state.settings.reminder.intervalMinutes * 60000;
      }, 'Notificações em segundo plano reativadas.');
      status.textContent = 'Ativo. O agendador verifica lembretes a cada 5 minutos; a entrega pode atrasar.';
      button.textContent = 'Desativar notificações em segundo plano';
      return;
    }

    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Permita notificações do navegador para receber alertas com a página fechada.');

    const nextSubscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(config.publicKey) });
    const intervalMinutes = state.settings.reminder.intervalMinutes;
    const response = await fetch('/api/push-subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ setupToken: token, subscription: nextSubscription.toJSON(), intervalMinutes })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      await nextSubscription.unsubscribe().catch(() => {});
      throw new Error(result.error || 'A inscrição push foi recusada pelo servidor. Confira as variáveis e o código privado.');
    }

    savePushSetupToken(token);
    $('push-setup-token').value = '';
    backgroundPushSubscription = nextSubscription;
    commit(() => {
      state.settings.reminder.enabled = true;
      state.settings.reminder.paused = false;
      state.settings.reminder.nextAt = Date.now() + intervalMinutes * 60000;
    }, 'Notificações em segundo plano ativadas neste navegador.');
    status.textContent = 'Ativo. O agendador verifica lembretes a cada 5 minutos; a entrega pode atrasar e depende do navegador, sistema e conexão.';
    button.textContent = 'Desativar notificações em segundo plano';
  } catch (error) {
    status.textContent = error?.message || 'Não foi possível ativar as notificações em segundo plano.';
    showToast(status.textContent, 'error', 8000);
  } finally {
    button.disabled = false;
    void updateBackgroundPushUI();
  }
}


async function toggleReminder() {
  const reminder = state.settings.reminder;
  if (reminder.enabled) {
    const saved = commit(() => {
      state.settings.reminder.enabled = false;
      state.settings.reminder.paused = false;
      state.settings.reminder.nextAt = null;
    }, 'Lembretes desativados.');
    void postPushSettings({ enabled: false, paused: false });
    return saved;
  }

  let permissionResult = 'unsupported';
  if ('Notification' in window) {
    if (Notification.permission === 'granted') permissionResult = 'granted';
    else if (Notification.permission === 'default') {
      try { permissionResult = await Notification.requestPermission(); }
      catch { permissionResult = 'denied'; }
    } else permissionResult = 'denied';
  }
  const saved = commit(() => {
    state.settings.reminder.enabled = true;
    state.settings.reminder.paused = false;
    state.settings.reminder.nextAt = Date.now() + state.settings.reminder.intervalMinutes * 60000;
  });
  if (saved) {
    showToast(permissionResult === 'granted' ? 'Lembretes ativados no navegador.' : 'Lembretes ativados enquanto esta página estiver aberta.');
    void postPushSettings({ enabled: true, paused: false });
  }
}

function toggleReminderPause() {
  const reminder = state.settings.reminder;
  if (!reminder.enabled) return;
  const nextPaused = !reminder.paused;
  commit(() => {
    state.settings.reminder.paused = nextPaused;
    state.settings.reminder.nextAt = nextPaused ? null : Date.now() + state.settings.reminder.intervalMinutes * 60000;
  }, nextPaused ? 'Lembretes pausados. Faça no seu tempo.' : 'Lembretes retomados.');
  void postPushSettings({ paused: nextPaused, enabled: true });
}

function checkReminder() {
  const reminder = state.settings.reminder;
  if (!reminder.enabled || reminder.paused) return;
  if (!reminder.nextAt) {
    commit(() => { state.settings.reminder.nextAt = Date.now() + reminder.intervalMinutes * 60000; });
    return;
  }
  if (Date.now() < reminder.nextAt) return;

  const title = 'Bebe água aí 💧';
  const body = 'Pausa rápida: toma alguns goles se puder. Se já bebeu, pode ignorar.';
  const canNotify = 'Notification' in window && Notification.permission === 'granted';
  if (canNotify) {
    try {
      // Silencia o tom padrão do sistema: o som personalizado vem do MP3 local.
      const notification = new Notification(title, {
        body,
        tag: 'glucometer-water-reminder',
        renotify: false,
        silent: true
      });
      notification.onclick = () => {
        window.focus();
        setPage('water');
        notification.close();
      };
    } catch (error) {
      console.warn('Não foi possível mostrar a notificação do navegador:', error);
      if (!document.hidden) showToast(body, 'reminder', 7000);
    }
  } else {
    showToast(`${title} ${body}`, 'reminder', 7000);
  }
  // O som toca separadamente da notificação nativa e nunca usa voz/TTS.
  void playNotificationSound();
  commit(() => { state.settings.reminder.nextAt = Date.now() + reminder.intervalMinutes * 60000; });
}

function monitoringDateLabel() {
  $('today-date-heading').textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());
}
function answerLabel(value) { return value === 'yes' ? 'Sim' : value === 'no' ? 'Não' : 'Não informado'; }
function monitoringRow(entry) {
  const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(entry.timestamp));
  const glucoseUnknown = entry.glucoseValue == null && (entry.insulinStatus === 'yes' || entry.mealStatus === 'yes' || Boolean(entry.food));
  const glucose = entry.glucoseValue == null ? (glucoseUnknown ? '?' : '—') : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: entry.glucoseUnit === 'mg/dL' ? 0 : 2 }).format(entry.glucoseValue)} ${escapeHtml(entry.glucoseUnit)}`;
  const insulin = entry.insulinStatus === 'yes' ? `${entry.insulinDose ?? '?'} U${entry.insulinType ? ` · ${escapeHtml(entry.insulinType)}` : ''}` : answerLabel(entry.insulinStatus);
  const food = entry.mealStatus === 'yes' ? (entry.food ? escapeHtml(entry.food) : 'Sim · detalhes não informados') : answerLabel(entry.mealStatus);
  const moment = entry.moment && entry.moment !== 'Outro momento'
    ? escapeHtml(entry.moment)
    : entry.customMoment && entry.customMoment !== 'Refeição'
      ? `Outro: ${escapeHtml(entry.customMoment)}`
      : entry.mealStatus === 'yes' || entry.food ? 'Refeição (momento não informado)' : 'Outro momento';
  const actions = entry.derived ? '<span class="derived-label">Glicose existente</span>' : `<div class="record-actions"><button type="button" data-action="edit-monitoring" data-id="${escapeHtml(entry.id)}" aria-label="Editar anotação">✎</button><button type="button" data-action="delete-monitoring" data-id="${escapeHtml(entry.id)}" aria-label="Excluir anotação">×</button></div>`;
  return `<tr><td data-label="Horário"><time datetime="${escapeHtml(entry.timestamp)}">${time}</time></td><td data-label="Momento do dia">${moment}</td><td data-label="Glicemia">${glucose}</td><td data-label="Insulina">${insulin}</td><td data-label="Alimentação">${food}</td><td data-label="Observações">${entry.note ? escapeHtml(entry.note) : '—'}</td><td>${actions}</td></tr>`;
}
function renderMonitoring() {
  if (!$('monitoring-list')) return;
  const entries = monitoringForToday(state);
  monitoringDateLabel();
  $('monitoring-list').innerHTML = entries.map(monitoringRow).join('');
  $('monitoring-empty').innerHTML = entries.length ? '' : emptyState('Nenhuma anotação hoje', 'Use Registrar glicose para anotar uma medição ou salvar apenas alimentação e insulina.', 'glucose');
  $('monitoring-history-count').textContent = `${entries.length} ${entries.length === 1 ? 'registro' : 'registros'}`;
  $('monitoring-glucose-count').textContent = entries.filter(e => e.glucoseValue != null).length;
  $('monitoring-insulin-count').textContent = entries.filter(e => e.insulinStatus === 'yes').length;
  $('monitoring-meal-count').textContent = entries.filter(e => e.mealStatus === 'yes').length;
}
function updateMonitoringConditionals() {
  $('monitoring-glucose-group').hidden = false;
  $('monitoring-insulin-group').hidden = false;
  $('monitoring-insulin-status-field').hidden = false;
  $('insulin-details').hidden = $('monitoring-insulin-status').value !== 'yes';
  $('monitoring-meal-status-field').hidden = false;
  $('food-field').hidden = $('monitoring-meal-status').value !== 'yes';
  $('custom-moment-field').hidden = $('monitoring-moment').value !== 'Outro momento';
}
function resetMonitoringForm(entry = null) {
  const form = $('monitoring-form');
  form.reset();
  $('monitoring-id').value = entry?.id || '';
  $('monitoring-mode').value = 'monitoring';
  const date = entry ? new Date(entry.timestamp) : new Date();
  $('monitoring-time').value = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  $('monitoring-glucose-unit').value = entry?.glucoseUnit || state.settings.glucoseUnit;
  if (entry) {
    $('monitoring-glucose-value').value = entry.glucoseValue ?? '';
    $('monitoring-moment').value = entry.moment || '';
    $('monitoring-custom-moment').value = entry.customMoment || '';
    $('monitoring-insulin-status').value = entry.insulinStatus || 'unknown';
    $('monitoring-insulin-dose').value = entry.insulinDose ?? '';
    $('monitoring-insulin-type').value = entry.insulinType || '';
    $('monitoring-meal-status').value = entry.mealStatus || 'unknown';
    $('monitoring-food').value = entry.food || '';
    $('monitoring-note').value = entry.note || '';
  }
  $('monitoring-form-title').textContent = 'Editar registro';
  $('monitoring-form-description').textContent = 'Glicemia é opcional. Se não mediu, deixe vazio ou digite 0; você pode registrar alimentação e insulina no mesmo registro.';
  updateMonitoringConditionals();
}
function openMonitoringForm(entry = null) {
  $('monitoring-form-panel').hidden = false;
  resetMonitoringForm(entry);
  requestAnimationFrame(() => $('monitoring-glucose-value').focus());
}
function closeMonitoringForm() {
  $('monitoring-form-panel').hidden = true;
  $('monitoring-form').reset();
  $('monitoring-mode').value = 'monitoring';
  updateMonitoringConditionals();
}

function handleMonitoringSubmit(event) {
  event.preventDefault();
  const rawValue = $('monitoring-glucose-value').value.trim();
  const parsedValue = rawValue === '' ? null : Number(rawValue);
  const value = parsedValue === null || parsedValue === 0 ? null : parsedValue;
  const unit = $('monitoring-glucose-unit').value;
  const insulinStatus = $('monitoring-insulin-status').value;
  const doseRaw = $('monitoring-insulin-dose').value.trim();
  const dose = doseRaw ? Number(doseRaw) : null;
  const selectedMealStatus = $('monitoring-meal-status').value;
  const food = $('monitoring-food').value.trim();
  const mealStatus = selectedMealStatus === 'unknown' && food ? 'yes' : selectedMealStatus;
  const time = $('monitoring-time').value;
  $('monitoring-glucose-error').textContent = '';
  $('monitoring-insulin-error').textContent = '';
  $('monitoring-time-error').textContent = '';
  let valid = true;
  if (rawValue && parsedValue !== 0 && (!Number.isFinite(parsedValue) || parsedValue < 0)) {
    $('monitoring-glucose-error').textContent = 'Deixe vazio ou use 0 se não mediu. Uma glicemia medida precisa ser maior que zero.';
    valid = false;
  }
  if (value !== null && !UNITS.includes(unit)) {
    $('monitoring-glucose-error').textContent = 'Informe uma unidade válida.';
    valid = false;
  }
  if (insulinStatus === 'yes' && (!Number.isFinite(dose) || dose <= 0)) {
    $('monitoring-insulin-error').textContent = 'Informe a quantidade de unidades registrada.';
    valid = false;
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    $('monitoring-time-error').textContent = 'Informe um horário válido.';
    valid = false;
  }
  const note = $('monitoring-note').value.trim();
  if (value === null && insulinStatus !== 'yes' && mealStatus !== 'yes' && !food && !note) {
    showToast('Informe uma glicemia ou marque alimentação/insulina para salvar sem medição.', 'error');
    valid = false;
  }
  if (!valid) return;

  const id = $('monitoring-id').value;
  const current = id ? state.monitoring.find(item => item.id === id) : null;
  const [hour, minute] = time.split(':').map(Number);
  const timestampDate = current ? new Date(current.timestamp) : new Date();
  timestampDate.setHours(hour, minute, 0, 0);
  const timestamp = timestampDate.toISOString();
  const glucoseId = value !== null ? (current?.glucoseId || makeId()) : null;
  const record = {
    id: id || makeId(),
    recordType: value !== null ? 'monitoring' : (mealStatus === 'yes' || food ? 'food' : insulinStatus === 'yes' ? 'insulin' : 'monitoring'),
    glucoseId,
    timestamp,
    glucoseValue: value,
    glucoseUnit: unit,
    moment: $('monitoring-moment').value || 'Outro momento',
    customMoment: $('monitoring-custom-moment').value.trim(),
    insulinStatus,
    insulinDose: insulinStatus === 'yes' ? dose : null,
    insulinType: $('monitoring-insulin-type').value.trim(),
    mealStatus,
    food,
    note
  };
  commit(() => {
    if (id) {
      state.monitoring = state.monitoring.map(item => item.id === id ? record : item);
      if (current?.glucoseId && value === null) {
        state.glucose = state.glucose.filter(item => item.id !== current.glucoseId);
      } else if (glucoseId) {
        const exists = state.glucose.some(item => item.id === glucoseId);
        if (exists) state.glucose = state.glucose.map(item => item.id === glucoseId ? { ...item, value, unit, timestamp, note } : item);
        else state.glucose.push({ id: glucoseId, value, unit, timestamp, note });
      }
    } else {
      state.monitoring.push(record);
      if (glucoseId) state.glucose.push({ id: glucoseId, value, unit, timestamp, note });
    }
  }, id ? 'Registro atualizado.' : (value === null ? 'Registro salvo sem glicemia. A exportação mostrará ?.' : 'Registro salvo no diário de hoje.'));
  closeMonitoringForm();
}

function bindEvents() {
  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-nav]');
    if (nav) {
      event.preventDefault();
      setPage(nav.dataset.nav);
      return;
    }
    const open = event.target.closest('[data-open-form]');
    if (open) {
      setPage(open.dataset.openForm === 'water' ? 'water' : 'glucose');
      if (open.dataset.openForm === 'glucose') {
        $('glucose-form-panel').hidden = false;
        openGlucoseForm();
        $('glucose-form-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        resetWaterForm();
        $('water-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
        requestAnimationFrame(() => $('water-volume').focus());
      }
      return;
    }
    const cancel = event.target.closest('[data-cancel-form]');
    if (cancel) { closeGlucoseForm(); return; }
    const preset = event.target.closest('[data-ml]');
    if (preset) {
      $('water-volume').value = preset.dataset.ml;
      document.querySelectorAll('[data-ml]').forEach(button => button.classList.toggle('is-selected', button === preset));
      $('water-volume').focus();
      return;
    }
    if (event.target.closest('[data-action]')) handleRecordAction(event);
  });

  $('show-glucose-form').addEventListener('click', () => openGlucoseForm());
  $('monitoring-form').addEventListener('submit', handleMonitoringSubmit);
  ['close-monitoring-form', 'cancel-monitoring-form'].forEach(id => $(id).addEventListener('click', closeMonitoringForm));
  $('monitoring-insulin-status').addEventListener('change', updateMonitoringConditionals);
  $('monitoring-meal-status').addEventListener('change', updateMonitoringConditionals);
  $('monitoring-moment').addEventListener('change', updateMonitoringConditionals);
  $('export-monitoring').addEventListener('click', openExportPanel);
  $('export-json').addEventListener('click', exportData);
  $('data-export-json').addEventListener('click', exportData);
  $('data-export-pdf').addEventListener('click', openExportPanel);
  $('data-import-file').addEventListener('change', event => { void handleBackupImport(event); });
  $('data-restore-local').addEventListener('click', restoreLocalBackup);
  glucoseForm.addEventListener('submit', handleGlucoseSubmit);
  waterForm.addEventListener('submit', handleWaterSubmit);
  $('water-cancel-edit').addEventListener('click', resetWaterForm);
  $('period-select').addEventListener('change', event => {
    commit(() => { state.settings.period = event.target.value; });
  });
  $('reminder-interval').addEventListener('change', event => {
    const intervalMinutes = Number(event.target.value);
    commit(() => {
      state.settings.reminder.intervalMinutes = intervalMinutes;
      if (state.settings.reminder.enabled && !state.settings.reminder.paused) {
        state.settings.reminder.nextAt = Date.now() + intervalMinutes * 60000;
      }
    }, `Intervalo definido para ${intervalMinutes} minutos.`);
    void postPushSettings({ intervalMinutes });
  });
  $('reminder-toggle-water').addEventListener('click', toggleReminder);
  $('reminder-toggle-dashboard').addEventListener('click', toggleReminder);
  $('reminder-pause').addEventListener('click', toggleReminderPause);
  $('reminder-test-sound').addEventListener('click', () => { void playNotificationSound({ test: true }); });
  $('push-background-toggle').addEventListener('click', () => { void toggleBackgroundPush(); });
  ['export-data', 'export-data-footer', 'export-data-mobile'].forEach(id => $(id).addEventListener('click', openExportPanel));
  ['comparison-moment', 'comparison-unit', 'comparison-days'].forEach(id => $(id).addEventListener('change', renderComparison));
  $('timeline-date').addEventListener('change', renderDailyTimeline);
  $('export-pdf-generate').addEventListener('click', downloadFilteredPdf);
  ['export-close', 'export-cancel'].forEach(id => $(id).addEventListener('click', closeExportPanel));
  $('pwa-install').addEventListener('click', async () => {
    if (!deferredInstallPrompt) { showToast('Use o menu do navegador para instalar ou adicionar à tela inicial, se a opção estiver disponível.', 'info', 6000); return; }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null; $('pwa-install').hidden = true;
  });
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstallPrompt = event; $('pwa-install').hidden = false; });
  window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; $('pwa-install').hidden = true; $('pwa-install-help').textContent = 'O Glucometer foi instalado neste dispositivo.'; });
  $('glucose-value').addEventListener('input', () => { setFieldError('glucose-value', 'glucose-value-error', ''); updateInsulinFormulaPreview(); });
  $('glucose-unit').addEventListener('change', updateInsulinFormulaPreview);
  $('glucose-date').addEventListener('input', () => setFieldError('glucose-date', 'glucose-date-error', ''));
  $('glucose-insulin-status').addEventListener('change', updateGlucoseContextFields);
  $('glucose-meal-status').addEventListener('change', updateGlucoseContextFields);
  $('glucose-insulin-dose').addEventListener('input', () => setFieldError('glucose-insulin-dose', 'glucose-insulin-error', ''));
  $('water-volume').addEventListener('input', () => setFieldError('water-volume', 'water-volume-error', ''));
  $('water-date').addEventListener('input', () => setFieldError('water-date', 'water-date-error', ''));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.settings.reminder.enabled && !state.settings.reminder.paused && state.settings.reminder.nextAt && Date.now() > state.settings.reminder.nextAt) {
      commit(() => { state.settings.reminder.nextAt = Date.now() + state.settings.reminder.intervalMinutes * 60000; });
    }
  });
}

function init() {
  $('glucose-date').value = localDateTimeInput();
  updateInsulinFormulaPreview();
  $('water-date').value = localDateTimeInput();
  $('timeline-date').value = localDayKey(new Date());
  bindEvents();
  render();
  const hashPage = location.hash.replace('#', '');
  if (['dashboard', 'today', 'glucose', 'water', 'data'].includes(hashPage)) setPage(hashPage);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) { navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Não foi possível registrar o modo PWA:', error)); }
  if (state.settings.reminder.enabled && !state.settings.reminder.paused) {
    const nextAt = state.settings.reminder.nextAt;
    if (!nextAt || nextAt <= Date.now()) {
      state.settings.reminder.nextAt = Date.now() + state.settings.reminder.intervalMinutes * 60000;
      try { saveState(state); } catch { /* The app remains usable if local storage is unavailable. */ }
    }
  }
  window.setInterval(checkReminder, 15000);
}

init();
