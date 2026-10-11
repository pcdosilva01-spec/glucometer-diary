import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, app] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/app.mjs', import.meta.url), 'utf8')
]);

test('a prévia da fórmula informa que o resultado é matemático e não prescrição', () => {
  assert.match(html, /Resultado matemático da fórmula informada/);
  assert.match(html, /não uma recomendação para aplicar insulina/i);
  assert.match(html, /não determina uma dose segura/i);
  assert.match(html, /não preenche automaticamente o campo de dose/i);
});

test('a prévia reage ao valor e unidade, sem preencher automaticamente a dose registrada', () => {
  assert.match(app, /function updateInsulinFormulaPreview\(\)/);
  assert.match(app, /\$\('glucose-value'\)\.addEventListener\('input',[\s\S]*?updateInsulinFormulaPreview\(\)/);
  assert.match(app, /\$\('glucose-unit'\)\.addEventListener\('change', updateInsulinFormulaPreview\)/);
  assert.doesNotMatch(app, /glucose-insulin-dose'\)\.value\s*=\s*calculation\.units/);
  assert.match(app, /arredondado ao inteiro mais próximo/);
});
