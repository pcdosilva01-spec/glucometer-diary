const {
  missingPushEnvironment, parseBody, authorizedSetup, json, readSubscription, writeSubscription
} = require('../lib/push-storage');

const VALID_INTERVALS = [15, 30, 45, 60];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
  const missing = missingPushEnvironment();
  if (missing.length) return json(res, 503, { error: 'Notificações em segundo plano ainda não foram configuradas.', missing });
  const body = parseBody(req);
  if (!authorizedSetup(req, body)) return json(res, 401, { error: 'Código privado de ativação incorreto.' });
  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') return json(res, 400, { error: 'Estado de lembrete inválido.' });
  if (body.paused !== undefined && typeof body.paused !== 'boolean') return json(res, 400, { error: 'Estado de pausa inválido.' });

  const intervalMinutes = body.intervalMinutes === undefined ? null : Number(body.intervalMinutes);
  if (intervalMinutes !== null && !VALID_INTERVALS.includes(intervalMinutes)) return json(res, 400, { error: 'Intervalo de lembrete inválido.' });
  try {
    const current = await readSubscription();
    if (!current?.subscription) return json(res, 404, { error: 'Nenhum navegador está inscrito para notificações.' });
    const oldInterval = current.intervalMinutes;
    const state = {
      ...current,
      enabled: body.enabled === undefined ? current.enabled : body.enabled,
      paused: body.paused === undefined ? current.paused : body.paused,
      intervalMinutes: intervalMinutes ?? oldInterval,
      updatedAt: new Date().toISOString()
    };
    if (!state.enabled || state.paused) state.nextAt = null;
    else if (!current.nextAt || intervalMinutes !== null && intervalMinutes !== oldInterval) state.nextAt = Date.now() + state.intervalMinutes * 60_000;
    await writeSubscription(state);
    return json(res, 200, { ok: true, enabled: state.enabled, paused: state.paused, nextAt: state.nextAt });
  } catch {
    return json(res, 503, { error: 'Não foi possível atualizar as notificações.' });
  }
};
