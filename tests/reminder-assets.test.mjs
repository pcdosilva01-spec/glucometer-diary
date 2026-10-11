import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

test('o áudio personalizado de água está incluído no projeto e no build configurado', async () => {
  const audioPath = resolve(root, 'soundreality-glass-filled-with-water-201638.mp3');
  const info = await stat(audioPath);
  assert.ok(info.size > 100_000, 'o MP3 deve ser um arquivo de áudio real, não um placeholder');
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.build, /soundreality-glass-filled-with-water-201638\.mp3/);
});

test('o lembrete usa o MP3 local, texto curto e não sintetiza voz', async () => {
  const app = await readFile(resolve(root, 'src/app.mjs'), 'utf8');
  assert.match(app, /new URL\('\.\.\/soundreality-glass-filled-with-water-201638\.mp3', import\.meta\.url\)/);
  assert.match(app, /silent:\s*true/);
  assert.match(app, /arredondado ao inteiro mais próximo/);
  assert.match(app, /Bebe água aí/);
  assert.doesNotMatch(app, /speechSynthesis|SpeechSynthesisUtterance/);
});
