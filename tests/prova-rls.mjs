/* ===========================================================================
 * PROVA DE PERMISSÕES — pedido HTTP direto à API, com a chave `anon`
 * ---------------------------------------------------------------------------
 * Isto não abre a app. Não carrega em botões. Fala diretamente com a API do
 * Supabase com a mesma chave pública que está no config.local.js, como faria
 * alguém que abrisse as ferramentas de programador e copiasse a chave.
 *
 * É o teste que interessa: se o assistente for travado aqui, é porque a base
 * de dados o recusa — não porque a app lhe escondeu o botão.
 *
 * COMO CORRER (precisas de DUAS contas já registadas e confirmadas):
 *
 *   node tests/prova-rls.mjs \
 *     --url  https://xxxx.supabase.co \
 *     --anon eyJhbGciOi... \
 *     --chefe      chefe@email.com:palavrapasse \
 *     --assistente assistente@email.com:palavrapasse
 *
 * Sem argumentos, tenta ler o URL e a chave do config.local.js.
 * =========================================================================== */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));

/* ---------- argumentos ---------- */
function arg(nome){
  const i = process.argv.indexOf('--' + nome);
  return i > 0 ? process.argv[i + 1] : null;
}
function credenciais(txt, rotulo){
  if(!txt) erroFatal(`Falta --${rotulo} email:palavrapasse`);
  const corte = txt.indexOf(':');
  if(corte < 1) erroFatal(`--${rotulo} tem de ser email:palavrapasse`);
  return { email: txt.slice(0, corte), password: txt.slice(corte + 1) };
}
function erroFatal(m){ console.error('\n  ' + m + '\n'); process.exit(2); }

let URL_BASE = arg('url'), ANON = arg('anon');
if(!URL_BASE || !ANON){
  try{
    const cfg = readFileSync(join(AQUI, '..', 'config.local.js'), 'utf8');
    URL_BASE ||= (cfg.match(/url\s*:\s*["']([^"']+)["']/) || [])[1];
    ANON     ||= (cfg.match(/(?:anon|key)\s*:\s*["']([^"']+)["']/) || [])[1];
  }catch{}
}
if(!URL_BASE || !ANON) erroFatal('Não encontrei o URL nem a chave. Usa --url e --anon.');
if(/service_role/.test(ANON)) erroFatal('ESSA CHAVE É service_role. NÃO a uses aqui nem na app.');

const CHEFE = credenciais(arg('chefe'), 'chefe');
const ASSIS = credenciais(arg('assistente'), 'assistente');

/* ---------- chamadas cruas, sem biblioteca nenhuma ---------- */
async function api(caminho, { token, metodo = 'GET', corpo, prefer } = {}){
  const r = await fetch(URL_BASE.replace(/\/$/, '') + caminho, {
    method: metodo,
    headers: {
      apikey: ANON,
      Authorization: 'Bearer ' + (token || ANON),
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  let dados = null;
  const txt = await r.text();
  try{ dados = txt ? JSON.parse(txt) : null; }catch{ dados = txt; }
  return { estado: r.status, dados };
}

async function entrar({ email, password }){
  const r = await api('/auth/v1/token?grant_type=password', {
    metodo: 'POST', corpo: { email, password }
  });
  if(r.estado !== 200 || !r.dados?.access_token){
    erroFatal(`Não consegui entrar com ${email}: ${r.estado} ${JSON.stringify(r.dados)}\n` +
              `  (a conta está registada E com o email confirmado?)`);
  }
  return r.dados.access_token;
}

/* ---------- contador ---------- */
let passou = 0, falhou = 0;
function prova(nome, ok, detalhe = ''){
  if(ok){ passou++; console.log('  PASSOU  ' + nome); }
  else  { falhou++; console.log('  FALHOU  ' + nome + (detalhe ? '  -> ' + detalhe : '')); }
}

/* ---------- a prova ---------- */
console.log('\n  Base: ' + URL_BASE);
console.log('  Chave: anon (' + ANON.slice(0, 12) + '...)\n');

const tokChefe = await entrar(CHEFE);
const tokAssis = await entrar(ASSIS);

/* 1. os dois estão na mesma equipa */
const eqChefe = await api('/rest/v1/membros_equipa?select=equipa_id,papel', { token: tokChefe });
const eqAssis = await api('/rest/v1/membros_equipa?select=equipa_id,papel', { token: tokAssis });
const meuChefe = (eqChefe.dados || []).find(m => m.papel === 'responsavel');
const equipaId = meuChefe?.equipa_id;
prova('1. o chefe é responsável de uma equipa', !!equipaId, JSON.stringify(eqChefe.dados));
prova('2. o assistente está na mesma equipa como assistente',
  (eqAssis.dados || []).some(m => m.equipa_id === equipaId && m.papel === 'assistente'),
  JSON.stringify(eqAssis.dados));

/* 3. o assistente VÊ os jogos e as multas */
const jogosA = await api('/rest/v1/jogos?select=id&limit=5', { token: tokAssis });
prova('3. o assistente lê os jogos', jogosA.estado === 200 && Array.isArray(jogosA.dados),
  jogosA.estado + ' ' + JSON.stringify(jogosA.dados).slice(0, 120));
const multasA = await api('/rest/v1/multas?select=id,membro_id,valor&limit=5', { token: tokAssis });
prova('4. o assistente lê as multas de toda a equipa',
  multasA.estado === 200 && Array.isArray(multasA.dados),
  multasA.estado + ' ' + JSON.stringify(multasA.dados).slice(0, 120));

/* 5. INSERT de jogo pelo assistente -> tem de ser recusado */
const ep = await api('/rest/v1/epocas?select=id&limit=1', { token: tokAssis });
const epocaId = ep.dados?.[0]?.id;
const insJogo = await api('/rest/v1/jogos', {
  token: tokAssis, metodo: 'POST', prefer: 'return=representation',
  corpo: { equipa_id: equipaId, epoca_id: epocaId, data: '2030-01-01', local: 'INVASAO' }
});
prova('5. INSERT de jogo pelo assistente é recusado pela base de dados',
  insJogo.estado === 401 || insJogo.estado === 403 || insJogo.dados?.code === '42501',
  insJogo.estado + ' ' + JSON.stringify(insJogo.dados).slice(0, 160));

/* 6. UPDATE de jogo pelo assistente -> 0 linhas (RLS não dá erro, esconde) */
const algum = jogosA.dados?.[0]?.id;
if(algum){
  const upd = await api('/rest/v1/jogos?id=eq.' + algum, {
    token: tokAssis, metodo: 'PATCH', prefer: 'return=representation',
    corpo: { local: 'INVASAO' }
  });
  prova('6. UPDATE de jogo pelo assistente não altera nada',
    upd.estado === 403 || (Array.isArray(upd.dados) && upd.dados.length === 0),
    upd.estado + ' ' + JSON.stringify(upd.dados).slice(0, 160));
}else{
  prova('6. UPDATE de jogo pelo assistente não altera nada', false, 'não havia jogos para testar');
}

/* 7. o assistente tenta marcar uma multa como paga */
const algumaMulta = multasA.dados?.[0]?.id;
if(algumaMulta){
  const upd = await api('/rest/v1/multas?id=eq.' + algumaMulta, {
    token: tokAssis, metodo: 'PATCH', prefer: 'return=representation',
    corpo: { pago: true }
  });
  prova('7. o assistente não marca multas como pagas',
    upd.estado === 403 || (Array.isArray(upd.dados) && upd.dados.length === 0),
    upd.estado + ' ' + JSON.stringify(upd.dados).slice(0, 160));
}

/* 8. o assistente tenta promover-se */
const prom = await api('/rest/v1/membros_equipa?papel=eq.assistente', {
  token: tokAssis, metodo: 'PATCH', prefer: 'return=representation',
  corpo: { papel: 'responsavel' }
});
prova('8. o assistente não se promove a responsável',
  prom.estado === 403 || (Array.isArray(prom.dados) && prom.dados.length === 0),
  prom.estado + ' ' + JSON.stringify(prom.dados).slice(0, 160));

/* 9. sem sessão nenhuma, só com a chave anon, não se lê nada */
const anonimo = await api('/rest/v1/jogos?select=id&limit=5');
prova('9. só com a chave anon (sem sessão) não se lê nada',
  anonimo.estado === 401 || (Array.isArray(anonimo.dados) && anonimo.dados.length === 0),
  anonimo.estado + ' ' + JSON.stringify(anonimo.dados).slice(0, 160));

const anonEquipas = await api('/rest/v1/equipas?select=codigo_convite');
prova('10. os códigos de convite não são legíveis sem sessão',
  anonEquipas.estado === 401 || (Array.isArray(anonEquipas.dados) && anonEquipas.dados.length === 0),
  anonEquipas.estado + ' ' + JSON.stringify(anonEquipas.dados).slice(0, 160));

/* 11. o chefe consegue mesmo escrever (não fechámos a porta a mais) */
if(epocaId){
  const ins = await api('/rest/v1/jogos', {
    token: tokChefe, metodo: 'POST', prefer: 'return=representation',
    corpo: { equipa_id: equipaId, epoca_id: epocaId, data: '2030-01-01', local: 'PROVA-APAGAR' }
  });
  const criado = ins.dados?.[0]?.id;
  prova('11. o responsável cria um jogo', !!criado,
    ins.estado + ' ' + JSON.stringify(ins.dados).slice(0, 160));
  if(criado){
    await api('/rest/v1/jogos?id=eq.' + criado, { token: tokChefe, metodo: 'DELETE' });
    const sobrou = await api('/rest/v1/jogos?id=eq.' + criado + '&select=id', { token: tokChefe });
    prova('12. o responsável apaga o que criou (limpeza)',
      Array.isArray(sobrou.dados) && sobrou.dados.length === 0);
  }
}

console.log('\n  ' + passou + ' passaram, ' + falhou + ' falharam\n');
process.exit(falhou ? 1 : 0);
