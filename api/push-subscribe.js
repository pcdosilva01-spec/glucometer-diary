const {
  missingPushEnvironment, parseBody, authorizedSetup, json, writeSubscription
} = require('../lib/push-storage');

const VALID_INTERVALS = [15, 30, 45, 60];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
  const missing = missingPushEnvironment();
  if (missing.length) return json(res, 503, { error: 'Notificações em segundo plano ainda não foram configuradas na Vercel.', missing });
  const body = parseBody(req);
  if (!authorizedSetup(req, body)) return json(res, 401, { error: 'Código privado de ativação incorreto.' });

  const subscription = body.subscription;
  const intervalMinutes = Number(body.intervalMinutes);
  if (!subscription || typeof subscription.endpoint !== 'string' || !subscription.endpoint.startsWith('https://') || !subscription.keys || typeof subscription.keys.p256dh !== 'string' || typeof subscription.keys.auth !== 'string') {
    return json(res, 400, { error: 'Inscrição de notificação inválida.' });
  }
  if (!VALID_INTERVALS.includes(intervalMinutes)) return json(res, 400, { error: 'Intervalo de lembrete inválido.' });

  const now = Date.now();
  const state = {
    subscription,
    enabled: true,
    paused: false,
    intervalMinutes,
    nextAt: now + intervalMinutes * 60_000,
    updatedAt: new Date(now).toISOString()
  };
  try {
    await writeSubscription(state);
    return json(res, 200, { ok: true, nextAt: state.nextAt });
  } catch {
    return json(res, 503, { error: 'Não foi possível salvar a inscrição de notificações.' });
  }
};
