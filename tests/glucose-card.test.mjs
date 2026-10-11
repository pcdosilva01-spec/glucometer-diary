import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGlucoseMeterSvg } from '../src/glucose-card.mjs';

test('cartão SVG inclui valor, unidade, título e data do registro', () => {
  const svg = buildGlucoseMeterSvg({ value: 123, unit: 'mg/dL', timestamp: '2026-10-10T12:34:00.000Z' });
  assert.match(svg, /width="1200" height="630"/);
  assert.match(svg, /GLICOSE ATUAL/);
  assert.match(svg, />123</);
  assert.match(svg, /mg\/dL/);
  assert.match(svg, /VALOR DO REGISTRO/);
});

test('cartão formata mmol/L e não injeta texto como marcação SVG', () => {
  const svg = buildGlucoseMeterSvg({ value: 5.8, unit: 'mmol/L', timestamp: '2026-10-10T12:34:00.000Z' });
  assert.match(svg, />5,8</);
  assert.match(svg, /mmol\/L/);
  assert.doesNotMatch(svg, /<script/i);
});

test('não gera cartão para valor de glicose inválido', () => {
  assert.throws(() => buildGlucoseMeterSvg({ value: 0, unit: 'mg/dL', timestamp: '' }), /valor de glicose válido/);
});

test('cartão traz contexto de alimentação e insulina e protege texto de usuário no SVG', () => {
  const svg = buildGlucoseMeterSvg({
    value: 128,
    unit: 'mg/dL',
    timestamp: '2026-10-10T12:34:00.000Z',
    moment: 'Após o almoço',
    mealStatus: 'yes',
    food: 'Arroz & feijão <caseiro>',
    insulinStatus: 'yes',
    insulinDose: 2.5,
    insulinType: 'rápida',
    note: 'Anotação pessoal'
  });
  assert.match(svg, /Após o almoço/);
  assert.match(svg, /Arroz &amp; feijão &lt;caseiro&gt;/);
  assert.match(svg, /2,5 U/);
  assert.match(svg, /Anotação pessoal/);
  assert.doesNotMatch(svg, /<caseiro>/);
});
