/* Regras dos avisos push (supabase/functions/avisos-prazos/regras.js):
 * que notificação é devida a que horas, no fuso de Lisboa, e só uma vez. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisosDevidos, instanteLisboa, vesperaAs, partesLisboa } from '../supabase/functions/avisos-prazos/regras.js';

const jogo = (extra = {}) => ({
  id: 'j1', equipa_id: 'e1', data: '2026-01-10', hora: '15:00', estado: 'agendado',
  confirmada: true, horas_marcadas: true, equipa_a: 'Fermedo', equipa_b: 'Mourisca',
  local: 'Campo da Junta', participacoes: [{ membro_id: 'm1' }, { membro_id: 'm2' }], ...extra,
});
const tipos = l => l.map(a => a.tipo).sort();

test('instanteLisboa: no inverno Lisboa é UTC', () => {
  assert.equal(new Date(instanteLisboa('2026-01-10', '15:00')).toISOString(), '2026-01-10T15:00:00.000Z');
});
test('instanteLisboa: no verão Lisboa é UTC+1', () => {
  assert.equal(new Date(instanteLisboa('2026-07-10', '15:00')).toISOString(), '2026-07-10T14:00:00.000Z');
});
test('instanteLisboa: no dia em que a hora muda (29/03/2026) o jogo às 15h continua às 15h de Lisboa', () => {
  const t = instanteLisboa('2026-03-29', '15:00');
  assert.equal(partesLisboa(t).hora, 15);
});
test('vesperaAs: 20h da véspera, mesmo a atravessar o mês', () => {
  const t = vesperaAs('2026-02-01', 20);
  const p = partesLisboa(t);
  assert.deepEqual([p.data, p.hora], ['2026-01-31', 20]);
});

test('horas: às 19h da véspera avisa quem vai ao jogo', () => {
  const agora = instanteLisboa('2026-01-09', '19:00');
  const r = avisosDevidos([jogo({ horas_marcadas: false })], agora);
  assert.deepEqual(tipos(r), ['horas']);
  assert.deepEqual(r[0].membros.sort(), ['m1', 'm2']);
});
test('horas: às 20h da véspera já passou o prazo — não avisa', () => {
  const agora = instanteLisboa('2026-01-09', '20:00');
  assert.equal(avisosDevidos([jogo({ horas_marcadas: false })], agora).length, 0);
});
test('horas: com as horas marcadas não avisa', () => {
  const agora = instanteLisboa('2026-01-09', '19:00');
  assert.equal(avisosDevidos([jogo()], agora).length, 0);
});
test('confirmar: às 21h, nomeação por confirmar, avisa também o responsável', () => {
  const agora = instanteLisboa('2026-01-08', '21:00');
  const r = avisosDevidos([jogo({ confirmada: false })], agora, new Set(), { e1: ['chefe'] });
  assert.deepEqual(tipos(r), ['confirmar']);
  assert.deepEqual(r[0].membros.sort(), ['chefe', 'm1', 'm2']);
});
test('confirmar: às 10h não avisa (só ao fim da tarde, antes das 22h)', () => {
  const agora = instanteLisboa('2026-01-08', '10:00');
  assert.equal(avisosDevidos([jogo({ confirmada: false })], agora).length, 0);
});
test('sair: duas horas antes do apito', () => {
  const agora = instanteLisboa('2026-01-10', '13:00');
  const r = avisosDevidos([jogo()], agora);
  assert.deepEqual(tipos(r), ['sair']);
  assert.match(r[0].corpo, /Campo da Junta/);
});
test('sair: a 1 hora do apito já não (a janela passou)', () => {
  const agora = instanteLisboa('2026-01-10', '14:00');
  assert.equal(avisosDevidos([jogo()], agora).length, 0);
});
test('só uma vez: quem já recebeu não volta a receber', () => {
  const agora = instanteLisboa('2026-01-09', '19:00');
  const r = avisosDevidos([jogo({ horas_marcadas: false })], agora, new Set(['j1|m1|horas']));
  assert.deepEqual(r[0].membros, ['m2']);
});
test('jogos cancelados, realizados ou já começados não avisam', () => {
  const agora = instanteLisboa('2026-01-09', '19:00');
  const js = [jogo({ id: 'a', estado: 'cancelado', horas_marcadas: false }),
              jogo({ id: 'b', estado: 'realizado', horas_marcadas: false }),
              jogo({ id: 'c', data: '2026-01-09', hora: '18:00', confirmada: false })];
  assert.equal(avisosDevidos(js, agora).length, 0);
});
