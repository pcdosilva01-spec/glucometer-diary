function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[character]);
}

function shortText(value, maxLength = 58) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

function infoRow(y, label, value) {
  const safeLabel = escapeXml(label.toUpperCase());
  const safeValue = escapeXml(shortText(value || 'Não informado', 58));
  return `<g>
    <text x="76" y="${y}" font-size="12" font-weight="700" letter-spacing="1.2" fill="#63758a">${safeLabel}</text>
    <text x="76" y="${y + 25}" font-size="18" font-weight="600" fill="#1b2b3c">${safeValue}</text>
  </g>`;
}

/** Cria um cartão informativo de uso pontual a partir de uma medição salva. */
export function buildGlucoseMeterSvg(entry) {
  if (!entry || !Number.isFinite(Number(entry.value)) || Number(entry.value) <= 0) {
    throw new TypeError('O registro precisa conter um valor de glicose válido.');
  }
  const unit = entry.unit === 'mmol/L' ? 'mmol/L' : 'mg/dL';
  const value = new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: unit === 'mg/dL' ? 0 : 1
  }).format(Number(entry.value));
  const timestamp = new Date(entry.timestamp);
  const validDate = Number.isFinite(timestamp.getTime());
  const formattedDate = validDate
    ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(timestamp)
    : 'Data não informada';
  const formattedTime = validDate
    ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(timestamp)
    : '--:--';
  const moment = entry.moment === 'Outro momento' && entry.customMoment
    ? entry.customMoment
    : entry.moment;
  const meal = entry.mealStatus === 'yes'
    ? (entry.food || 'Refeição registrada; detalhes não informados')
    : entry.mealStatus === 'no' ? 'Não informado como refeição' : 'Não informado';
  const insulin = entry.insulinStatus === 'yes'
    ? `${entry.insulinDose == null ? '?' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(entry.insulinDose))} U${entry.insulinType ? ` · ${entry.insulinType}` : ''}`
    : entry.insulinStatus === 'no' ? 'Não registrada' : 'Não informado';
  const note = shortText(entry.note, 58) || 'Sem observações';
  const safeValue = escapeXml(value);
  const safeUnit = escapeXml(unit);
  const safeDate = escapeXml(formattedDate);
  const safeTime = escapeXml(formattedTime);
  const meterValueSize = value.length > 6 ? 49 : value.length > 4 ? 58 : 68;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="card-title card-desc">
  <title id="card-title">Glicose atual: ${safeValue} ${safeUnit}</title>
  <desc id="card-desc">Cartão de uso pontual com valor informado em ${safeDate} às ${safeTime}, além do contexto disponível no diário.</desc>
  <defs>
    <linearGradient id="screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#263c48"/><stop offset="1" stop-color="#15252e"/></linearGradient>
    <linearGradient id="meter-glow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dbffe7"/><stop offset="1" stop-color="#89eeb5"/></linearGradient>
    <filter id="meter-shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#23394c" flood-opacity=".16"/></filter>
  </defs>
  <rect width="1200" height="630" fill="#edf2f6"/>
  <rect x="28" y="28" width="1144" height="574" rx="28" fill="#ffffff" stroke="#dce5ec" stroke-width="2"/>
  <g font-family="DejaVu Sans, Arial, sans-serif">
    <rect x="72" y="64" width="7" height="26" rx="3.5" fill="#26a269"/>
    <text x="92" y="82" font-size="13" font-weight="700" letter-spacing="1.8" fill="#547064">REGISTRO PESSOAL</text>
    <text x="72" y="139" font-size="43" font-weight="750" letter-spacing="-1.4" fill="#192b3a">Glicose atual</text>
    <text x="74" y="171" font-size="17" fill="#607286">Valor salvo no diário · não é uma leitura ao vivo</text>
    <g>
      <circle cx="82" cy="210" r="6" fill="#2d9c70"/>
      <text x="99" y="216" font-size="17" font-weight="650" fill="#263b4e">${safeDate}</text>
      <text x="99" y="241" font-size="15" fill="#607286">às ${safeTime}</text>
    </g>
    <path d="M72 264H650" stroke="#e4ebf0" stroke-width="2"/>
    ${infoRow(294, 'Momento', moment || 'Não informado')}
    ${infoRow(358, 'Alimentação', meal)}
    ${infoRow(422, 'Insulina', insulin)}
    ${infoRow(486, 'Observação', note)}
    <text x="72" y="562" font-size="12" font-weight="600" fill="#6d7d8d">Valor inserido manualmente · confira a data antes de compartilhar</text>

    <g transform="translate(728 83)" filter="url(#meter-shadow)">
      <rect x="0" y="0" width="382" height="447" rx="38" fill="#f9fbfc" stroke="#d4e0e8" stroke-width="3"/>
      <rect x="28" y="22" width="326" height="13" rx="6.5" fill="#e3eaf0"/>
      <rect x="30" y="55" width="322" height="224" rx="20" fill="url(#screen)" stroke="#9aafbb" stroke-width="2"/>
      <text x="54" y="91" font-size="13" font-weight="700" letter-spacing="1.5" fill="#c0d4de">GLICOSE ATUAL</text>
      <circle cx="320" cy="82" r="7" fill="#71e1a5"/>
      <text x="52" y="${value.length > 6 ? 163 : 170}" font-size="${meterValueSize}" font-weight="700" letter-spacing="-2.5" fill="url(#meter-glow)">${safeValue}</text>
      <text x="55" y="217" font-size="19" font-weight="650" fill="#e5f1f6">${safeUnit}</text>
      <rect x="48" y="237" width="286" height="1" fill="#5d7481" opacity=".8"/>
      <text x="55" y="260" font-size="11" font-weight="600" letter-spacing="1" fill="#b6c9d2">VALOR DO REGISTRO</text>
      <rect x="30" y="301" width="322" height="82" rx="16" fill="#eaf0f4" stroke="#dbe4ea"/>
      <circle cx="69" cy="342" r="17" fill="#d3e9de"/>
      <path d="M62 342l5 5 9-11" fill="none" stroke="#287b59" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="98" y="333" font-size="12" font-weight="700" letter-spacing="1" fill="#607486">SALVO NO DIÁRIO</text>
      <text x="98" y="354" font-size="14" font-weight="650" fill="#253e50">${safeDate}</text>
      <rect x="137" y="405" width="108" height="15" rx="7.5" fill="#d7e2e9"/>
      <rect x="169" y="410" width="44" height="5" rx="2.5" fill="#a8bac6"/>
    </g>
  </g>
</svg>`;
}
