const crypto = require('node:crypto');

const SUBSCRIPTION_KEY = 'glucometer:push:single-subscription';
const LOCK_KEY = 'glucometer:push:dispatch-lock';

function missingPushEnvironment() {
  const required = [
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
    'VAPID_SUBJECT',
    'PUSH_SETUP_TOKEN',
    'PUSH_CRON_SECRET'
  ];
  return required.filter(name => !process.env[name]);
}

async function redisCommand(...command) {
  const baseUrl = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!baseUrl || !token) throw new Error('O armazenamento de push não está configurado.');
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) throw new Error('Falha ao acessar o armazenamento de notificações.');
  return result.result;
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function tokensMatch(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string' || !provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authorizedSetup(req, body) {
  const provided = req.headers['x-push-setup-token'] || body.setupToken;
  return tokensMatch(provided, process.env.PUSH_SETUP_TOKEN);
}

function json(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(payload);
}

async function readSubscription() {
  const value = await redisCommand('GET', SUBSCRIPTION_KEY);
  if (!value) return null;
  try { return typeof value === 'string' ? JSON.parse(value) : value; }
  catch { throw new Error('O registro de notificações armazenado é inválido.'); }
}

async function writeSubscription(value) {
  return redisCommand('SET', SUBSCRIPTION_KEY, JSON.stringify(value));
}

async function deleteSubscription() {
  return redisCommand('DEL', SUBSCRIPTION_KEY);
}

module.exports = {
  SUBSCRIPTION_KEY,
  LOCK_KEY,
  missingPushEnvironment,
  redisCommand,
  parseBody,
  authorizedSetup,
  json,
  readSubscription,
  writeSubscription,
  deleteSubscription
};
