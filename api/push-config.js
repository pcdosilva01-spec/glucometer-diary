const { missingPushEnvironment, json } = require('../lib/push-storage');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Método não permitido.' });
  const missing = missingPushEnvironment();
  return json(res, 200, {
    configured: missing.length === 0,
    publicKey: missing.length === 0 ? process.env.VAPID_PUBLIC_KEY : null
  });
};
