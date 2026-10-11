import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');

test('PWA tem manifest, service worker e build configurado para incluir os arquivos essenciais', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const buildScript = packageJson.scripts.build;
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some(icon => icon.src === '/app-icon-192.png' && icon.sizes === '192x192'));
  assert.ok(manifest.icons.some(icon => icon.src === '/app-icon-512.png' && icon.sizes === '512x512'));
  for (const [name, size] of [['app-icon-192.png', 192], ['app-icon-512.png', 512]]) {
    const png = fs.readFileSync(path.join(root, name));
    assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size);
  }
  assert.match(sw, /addAll\(SHELL\)/);
  assert.match(sw, /skipWaiting/);
  assert.match(sw, /glucometer-shell-v10-recovery-import/);
  assert.match(sw, /\/styles\.css\?v=16/);
  assert.match(sw, /\/src\/app\.mjs\?v=12/);
  assert.match(sw, /\/src\/core\.mjs\?v=7/);
  assert.match(sw, /\/src\/pdf-export\.mjs\?v=8/);
  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /showNotification/);
  assert.doesNotMatch(sw, /cloud-sync|\/api\//);
  for (const asset of ['manifest.webmanifest', 'sw.js', 'app-icon-192.png', 'app-icon-512.png', 'src']) assert.ok(buildScript.includes(asset), `O build precisa copiar ${asset}`);
});

test('aplicativo pessoal não tem tela de cadastro, login ou integração com nuvem', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src/app.mjs'), 'utf8');
  assert.match(html, /Seu diário pessoal, sem cadastro, login, e-mail ou senha/);
  assert.doesNotMatch(html, /cloud-auth-form|Criar conta|Entrar|Supabase|Nuvem e dados/);
  assert.doesNotMatch(app, /cloud-sync|signUpCloud|signInCloud|refreshCloudStatus|synchronizeCloud/);
  assert.equal(fs.existsSync(path.join(root, 'api/push-config.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'api/push-subscribe.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'api/push-settings.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'api/push-dispatch.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'supabase')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/cloud-sync.mjs')), false);
});

test('a interface oferece só os dois tipos de registro e unifica refeição/insulina no formulário de glicose', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src/app.mjs'), 'utf8');
  assert.doesNotMatch(html, /data-open-insulin|data-open-food|Registrar insulina|Registrar refeição|show-monitoring-form/);
  assert.match(html, /Registrar glicose/);
  assert.match(html, /Registrar água/);
  assert.match(html, /id=\"glucose-value\" type=\"number\" min=\"0\"[^>]*placeholder=\"Vazio ou 0 se não mediu\"/);
  assert.doesNotMatch(html.match(/<input id=\"glucose-value\"[^>]*>/)?.[0] || '', /required/);
  assert.match(app, /const value = parsedValue === null \|\| parsedValue === 0 \? null : parsedValue/);
  assert.match(app, /Registro salvo sem glicemia\. A exportação mostrará \?/);
  assert.match(app, /Glicemia: \?/);
});


test('a página Dados oferece importação de backup/resgate e informa que não apaga os registros atuais', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const core = fs.readFileSync(path.join(root, 'src/core.mjs'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src/app.mjs'), 'utf8');
  assert.match(app, /from '\.\/core\.mjs\?v=7'/);
  assert.match(html, /id="data-import-file"[^>]*type="file"/);
  assert.match(html, /id="data-restore-local"/);
  assert.match(html, /não apaga o diário atual/);
  assert.match(core, /SAFETY_BACKUP_KEY/);
  assert.match(core, /extractStateFromBackupPayload/);
  assert.match(core, /mergeStates/);
  assert.match(app, /handleBackupImport/);
  assert.match(app, /getLocalRecoveryBackups/);
});
