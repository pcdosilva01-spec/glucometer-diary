import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Web Push usa service worker e não adiciona cadastro ou login', async () => {
  const [sw, html, app] = await Promise.all([read('sw.js'), read('index.html'), read('src/app.mjs')]);
  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /self\.registration\.showNotification/);
  assert.match(sw, /addEventListener\('notificationclick'/);
  assert.match(html, /Ativar notificações em segundo plano/);
  assert.match(html, /Não há cadastro nem login/);
  assert.match(app, /PUSH_SETUP_TOKEN_KEY/);
  assert.doesNotMatch(html, /Criar conta|Cadastrar usuário|Entrar na conta/);
});

test('API de inscrição e disparo exige token e não expõe a chave privada VAPID', async () => {
  const [config, subscribe, settings, dispatch, storage] = await Promise.all([
    read('api/push-config.js'), read('api/push-subscribe.js'), read('api/push-settings.js'),
    read('api/push-dispatch.js'), read('lib/push-storage.js')
  ]);
  assert.match(config, /VAPID_PUBLIC_KEY/);
  assert.doesNotMatch(config, /VAPID_PRIVATE_KEY/);
  assert.match(subscribe, /authorizedSetup/);
  assert.match(settings, /authorizedSetup/);
  assert.match(dispatch, /PUSH_CRON_SECRET/);
  assert.match(dispatch, /sendNotification/);
  assert.match(storage, /timingSafeEqual/);
  assert.match(storage, /UPSTASH_REDIS_REST_TOKEN/);
});

test('workflow remoto verifica o endpoint a cada cinco minutos', async () => {
  const workflow = await read('.github/workflows/push-reminders.yml');
  assert.match(workflow, /cron: '\*\/5 \* \* \* \*'/);
  assert.match(workflow, /PUSH_DISPATCH_URL/);
  assert.match(workflow, /PUSH_CRON_SECRET/);
  assert.match(workflow, /curl --fail-with-body/);
});

test('build preserva API serverless na raiz e inclui web-push para o deploy', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const vercel = JSON.parse(await read('vercel.json'));
  assert.equal(pkg.dependencies['web-push'], '^3.6.7');
  assert.equal(vercel.framework, null);
  assert.equal(existsSync(new URL('../api/push-dispatch.js', import.meta.url)), true);
  assert.equal(existsSync(new URL('../.github/workflows/push-reminders.yml', import.meta.url)), true);
});
