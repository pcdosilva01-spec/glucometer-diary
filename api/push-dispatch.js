const crypto = require('node:crypto');
const webPush = require('web-push');
const {
  missingPushEnvironment, redisCommand, readSubscription, writeSubscription, deleteSubscription, json, LOCK_KEY
} = require('../lib/push-storage');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
  const missing = missingPushEnvironment();
  if (missing.length) return json(res, 503, { error: 'O envio de notificações não está configurado.' });
  const provided = req.headers.authorization || '';
  const expected = `Bearer ${process.env.PUSH_CRON_SECRET}`;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return json(res, 401, { error: 'Não autorizado.' });
  }

  const lockId = crypto.randomUUID();
  try {
    const lockResult = await redisCommand('SET', LOCK_KEY, lockId, 'NX', 'EX', 50);
    if (lockResult !== 'OK') return json(res, 200, { ok: true, skipped: 'dispatch-in-progress' });

    const state = await readSubscription();
    const now = Date.now();
    if (!state?.subscription || !state.enabled || state.paused || !state.nextAt || now < state.nextAt) {
      return json(res, 200, { ok: true, sent: false, reason: 'not-due' });
    }

    webPush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const payload = JSON.stringify({
      title: 'Bebe água aí 💧',
      body: 'Pausa rápida: toma alguns goles se puder. Se já bebeu, pode ignorar.',
      url: '/#water'
    });
    try {
      await webPush.sendNotification(state.subscription, payload, { TTL: 180, urgency: 'normal' });
    } catch (error) {
      const code = Number(error?.statusCode);
      if (code === 404 || code === 410) {
        await deleteSubscription();
        return json(res, 200, { ok: true, sent: false, reason: 'subscription-expired' });
      }
      console.error('Push notification delivery failed:', code || 'unknown');
      return json(res, 502, { error: 'O serviço push não confirmou a entrega.' });
    }

    const interval = [15, 30, 45, 60].includes(Number(state.intervalMinutes)) ? Number(state.intervalMinutes) : 15;
    state.nextAt = now + interval * 60_000;
    state.lastSentAt = new Date(now).toISOString();
    state.updatedAt = state.lastSentAt;
    await writeSubscription(state);
    return json(res, 200, { ok: true, sent: true, nextAt: state.nextAt });
  } catch (error) {
    console.error('Push dispatcher failed:', error?.message || 'unknown');
    return json(res, 503, { error: 'Não foi possível processar o lembrete.' });
  }
};
