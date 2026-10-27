/* Pedidos de setembro de 2026, testados num telemóvel emulado (Pixel 7):
 *
 *  R1. O Resumo abre sempre no mês corrente.
 *  R2. O Resumo abre no nome de quem usa a app; um assistente fica preso ao
 *      próprio nome e as outras pessoas nem aparecem.
 *  T1. Num jogo novo (convocatória, + ou duplicar), o transporte vai só para
 *      o chefe — o árbitro principal — e não para os assistentes.
 *  M1. Definições → "Acrescentar valor" abre o formulário (não fazia nada).
 *  M2. Com a barra "Nova versão disponível" à vista, o + continua a abrir o
 *      formulário de jogo (a barra tapava-o e o toque ia parar ao "Atualizar").
 */
import { chromium, devices } from 'playwright';
import { configura, registaEEntra, criaEquipaNova, entraComCodigo, garanteEquipa, vaiPara, B, MOCK } from './comum.mjs';

let passou=0, falhou=0;
const ok=(n,c,d='')=>{ if(c){passou++;console.log('  ✅ '+n);} else {falhou++;console.log('  ❌ '+n+(d?'  → '+d:''));} };

await fetch(MOCK+'/__reset');
const browser=await chromium.launch();
async function novaPagina(){
  const ctx=await browser.newContext({...devices['Pixel 7']});
  const pg=await ctx.newPage();
  const erros=[];
  pg.on('pageerror',e=>erros.push(String(e&&e.message||e)));
  await configura(pg,MOCK);
  return {ctx,pg,erros};
}
const mesAgora=new Date().toISOString().slice(0,7);

try{
let CODIGO=null;
/* ===================================================================== */
console.log('\n── R1/R2. Resumo do responsável ──');
{
  const {ctx,pg,erros}=await novaPagina();
  await pg.goto(B);
  await registaEEntra(pg,{nome:'A. Primeiro',email:'chefe-pedidos@exemplo.invalid'});
  // época a partir da data de hoje, para o mês corrente fazer parte dela
  await criaEquipaNova(pg,{nomeEquipa:'Equipa Pedidos',meuNome:'A. Primeiro',epoca:''});
  await garanteEquipa(pg,['A. Primeiro','B. Lima','T. Rosa']);
  CODIGO=await pg.evaluate(()=>EQUIPA.codigo_convite||EQUIPA.codigo||null);

  ok('a época ativa inclui o mês corrente',await pg.evaluate(m=>mesesDaEpoca().includes(m),mesAgora),mesAgora);
  await vaiPara(pg,'resumo');
  let r=await pg.evaluate(()=>({mes:mesRes,mem:membroRes,eu:EUMEMBRO.id,
    chipMes:document.querySelector('.chip[data-role="mes"].on')?.dataset.m,
    chipsMem:document.querySelectorAll('.chip[data-role="mem"]').length,
    chipMemOn:document.querySelector('.chip[data-role="mem"].on')?.dataset.m}));
  ok('abre no mês corrente',r.mes===mesAgora&&r.chipMes===mesAgora,JSON.stringify(r));
  ok('abre no nome de quem está a usar a app',r.mem===r.eu&&r.chipMemOn===r.eu,JSON.stringify(r));
  ok('o responsável continua a poder escolher "Todos" e os outros',r.chipsMem===1+3,String(r.chipsMem));

  // mudar para a época toda e para "Todos", sair e voltar: repõe tudo
  await pg.click('.chip[data-role="mes"][data-m="all"]');
  await pg.click('.chip[data-role="mem"][data-m="all"]');
  await vaiPara(pg,'jogos');
  const filtroJogos=await pg.evaluate(()=>membroSel);
  ok('o filtro de pessoa dos Jogos não é mexido pelo Resumo',filtroJogos==='all',filtroJogos);
  await vaiPara(pg,'resumo');
  r=await pg.evaluate(()=>({mes:mesRes,mem:membroRes,eu:EUMEMBRO.id}));
  ok('voltar ao Resumo repõe o mês corrente',r.mes===mesAgora,r.mes);
  ok('e repõe o próprio nome',r.mem===r.eu,r.mem);
  // carregar no separador em que já se está não deita fora a escolha
  await pg.click('.chip[data-role="mes"][data-m="all"]');
  await vaiPara(pg,'resumo');
  ok('tocar outra vez no Resumo não desfaz a escolha feita lá dentro',await pg.evaluate(()=>mesRes==='all'));

  /* ------------------------------------------------------------------- */
  console.log('\n── T1. transporte só para o chefe ──');
  await vaiPara(pg,'jogos');
  await pg.click('#btnConv');
  await pg.waitForSelector('#cvTxt');
  await pg.fill('#cvTxt','2322 114010120 AA2 JUV#CD JUV#Guarda Unid.*V.Formoso#CAMPO ZAMBITO<GUARDA>15/02/2026 10:00 A-B Lima900000011 AA1-T ROSA900000012');
  await pg.click('#cvGo');
  await pg.waitForSelector('#fSave');
  const conv=await pg.evaluate(()=>[...document.querySelectorAll('.atr')].map(el=>({
    funcao:el.querySelector('[data-f="funcao"]').value,
    quem:el.querySelector('[data-f="membroId"]').selectedOptions[0]?.textContent,
    desloc:el.querySelector('[data-f="deslocFixa"]')?.value})));
  const chefe=conv.filter(a=>a.funcao==='A'), outros=conv.filter(a=>a.funcao!=='A');
  ok('a convocatória monta o trio',conv.length===3,JSON.stringify(conv));
  ok('o árbitro principal fica com a deslocação',chefe.length===1&&chefe[0].desloc==='1',JSON.stringify(chefe));
  ok('os assistentes ficam sem deslocação',outros.length===2&&outros.every(a=>a.desloc===''),JSON.stringify(outros));
  await pg.fill('#fEqA','Guarda Unid.');
  await pg.tap('#fSave');
  await pg.waitForFunction(()=>!document.querySelector('#dlg').open);
  const gravado=await pg.evaluate(()=>{const j=S.jogos.find(x=>x.equipaA==='Guarda Unid.');
    return j.atribuicoes.map(a=>({f:a.funcao,d:a.deslocFixa||'',v:a.valor}));});
  ok('e é isso que fica gravado',gravado.filter(a=>a.d==='1').length===1&&gravado.find(a=>a.d==='1').f==='A',JSON.stringify(gravado));

  // Nacional (km): os km guardados do campo só entram na linha do chefe
  await pg.evaluate(async()=>{
    const [a,b,c]=S.membros.filter(m=>['A. Primeiro','B. Lima','T. Rosa'].includes(m.nome));
    for(const m of [a,b,c]) await guardaDistancia(m.id,'Estádio X',120);
  });
  await pg.evaluate(()=>{
    const ids=['B. Lima','A. Primeiro','T. Rosa'].map(n=>S.membros.find(m=>m.nome===n).id);
    formJogo({id:criaId(),epocaId:epAtiva().id,data:'2026-03-01',hora:'11:00',tipo:'Nacional',escalao:'Sub 17',
      equipaA:'X',equipaB:'Y',local:'Estádio X',estado:'agendado',
      atribuicoes:[{membroId:ids[0],funcao:'AA',almocoId:'',km:'',override:''},
                   {membroId:ids[1],funcao:'A',almocoId:'',km:'',override:''},
                   {membroId:ids[2],funcao:'AA',almocoId:'',km:'',override:''}]},true);
  });
  await pg.waitForSelector('#fSave');
  const kms=await pg.evaluate(()=>[...document.querySelectorAll('.atr')].map(el=>({
    funcao:el.querySelector('[data-f="funcao"]').value,km:el.querySelector('[data-f="km"]')?.value})));
  ok('no Nacional, os km do campo aparecem só no chefe',
     kms.filter(a=>a.km==='120').length===1&&kms.find(a=>a.km==='120').funcao==='A',JSON.stringify(kms));
  // acrescentar um assistente à mão também não lhe dá transporte
  await pg.click('#fCancel');
  await pg.click('#fab');
  await pg.waitForSelector('#fSave');
  await pg.selectOption('#fTipo','Distrital');
  await pg.click('#addAtr');
  const extra=await pg.evaluate(()=>[...document.querySelectorAll('.atr')].pop().querySelector('[data-f="deslocFixa"]')?.value);
  ok('"+ Adicionar membro" não dá deslocação a um assistente',extra==='',String(extra));
  await pg.click('#fCancel');

  /* ------------------------------------------------------------------- */
  console.log('\n── M1. Definições → Acrescentar valor ──');
  await vaiPara(pg,'config');
  await pg.waitForSelector('#addT');
  const antes=await pg.evaluate(()=>S.tabela.length);
  await pg.tap('#addT');
  await pg.waitForSelector('#tSave',{timeout:3000}).catch(()=>{});
  ok('abre o formulário de tarifa',await pg.evaluate(()=>document.querySelector('#dlg').open&&!!document.querySelector('#tSave')));
  if(await pg.$('#tSave')){
    await pg.fill('#tT','Distrital'); await pg.fill('#tE','Futsal'); await pg.selectOption('#tF','A'); await pg.fill('#tV','20,00');
    await pg.tap('#tSave');
    await pg.waitForFunction(n=>S.tabela.length>n,antes,{timeout:5000}).catch(()=>{});
    ok('e grava a tarifa nova',await pg.evaluate(()=>S.tabela.some(r=>r.escalao==='Futsal'&&r.valor===20)));
  }

  /* ------------------------------------------------------------------- */
  console.log('\n── M2. barra de nova versão e botão + ──');
  await vaiPara(pg,'jogos');
  await pg.evaluate(()=>mostraNovaVersao({waiting:null}));
  const topo=await pg.evaluate(()=>{const f=document.querySelector('#fab').getBoundingClientRect();
    const u=document.querySelector('#upbar').getBoundingClientRect();
    const el=document.elementFromPoint(f.x+f.width/2,f.y+f.height/2);
    return {emCima:el&&el.id,sobrepoe:!(f.bottom<=u.top||f.top>=u.bottom)};});
  ok('com a barra à vista, o + não fica tapado',topo.emCima==='fab'&&!topo.sobrepoe,JSON.stringify(topo));
  await pg.tap('#fab');
  await pg.waitForSelector('#fSave',{timeout:3000}).catch(()=>{});
  ok('e tocar no + abre o formulário de jogo',await pg.evaluate(()=>document.querySelector('#dlg').open&&/Novo jogo/.test(document.querySelector('#dlg h2').textContent)));
  await pg.click('#fCancel');
  await pg.click('#upDepois');
  ok('fechar a barra devolve o + ao sítio',await pg.evaluate(()=>!document.body.classList.contains('com-upbar')));

  ok('sem erros de JavaScript (responsável)',erros.length===0,erros[0]);
  await ctx.close();
}

/* ===================================================================== */
console.log('\n── R3. o nome escolhido fica à vista, mesmo sendo o último ──');
for(const [nome,opts] of [['computador',{viewport:{width:1280,height:800}}],['telemóvel',{...devices['Pixel 7']}]]){
  const ctx=await browser.newContext(opts); const pg=await ctx.newPage();
  const erros=[]; pg.on('pageerror',e=>erros.push(String(e&&e.message||e)));
  await configura(pg,MOCK); await pg.goto(B);
  await registaEEntra(pg,{nome:'Pedro Mota'});
  await criaEquipaNova(pg,{nomeEquipa:'Equipa Chips',meuNome:'Pedro Mota',epoca:''});
  await garanteEquipa(pg,['Bruno Mota','Gabriel Faria','Ânia Nunes','Xavier Brito','Tiago']);
  // o chefe no fim da lista, como aconteceu na app a sério
  await pg.evaluate(()=>{const i=S.membros.findIndex(m=>m.id===EUMEMBRO.id);S.membros.push(...S.membros.splice(i,1));});
  await vaiPara(pg,'resumo'); await pg.waitForTimeout(300);
  const v=await pg.evaluate(()=>['mes','mem'].map(r=>{const on=document.querySelector(`.chip[data-role="${r}"].on`);
    if(!on)return r+':nenhum';const a=on.parentElement.getBoundingClientRect(),b=on.getBoundingClientRect();
    return (b.left>=a.left-1&&b.right<=a.right+1&&b.right<=innerWidth)?'ok':r+':escondido('+on.textContent+')';}));
  ok(`${nome}: o mês e o nome escolhidos estão à vista`,v.every(x=>x==='ok'),v.join(' '));
  if(nome==='computador'){
    const todos=await pg.evaluate(()=>[...document.querySelectorAll('.chip[data-role="mem"]')].every(c=>{const b=c.getBoundingClientRect();return b.right<=c.parentElement.getBoundingClientRect().right+1;}));
    ok('computador: todas as pessoas cabem, sem nada cortado à direita',todos);
  }
  ok(`${nome}: sem erros de JavaScript`,erros.length===0,erros[0]);
  await ctx.close();
}

/* ===================================================================== */
console.log('\n── R2. Resumo de um assistente ──');
{
  const {ctx,pg,erros}=await novaPagina();
  await pg.goto(B);
  await registaEEntra(pg,{nome:'T. Rosa',email:'assist-pedidos@exemplo.invalid'});
  if(!CODIGO){
    ok('há código de convite para o assistente entrar',false,'sem código');
  }else{
    await entraComCodigo(pg,CODIGO,'T. Rosa');
    ok('entra como assistente',!(await pg.evaluate(()=>souResponsavel())));
    await vaiPara(pg,'resumo');
    const r=await pg.evaluate(()=>({mem:membroRes,eu:EUMEMBRO.id,mes:mesRes,
      chipsMem:document.querySelectorAll('.chip[data-role="mem"]').length,
      pessoas:[...document.querySelectorAll('#main h3.sec')].find(h=>/Por pessoa/.test(h.textContent))
        ?.nextElementSibling.querySelectorAll('.list-item').length,
      nomes:S.membros.filter(m=>m.id!==EUMEMBRO.id).map(m=>m.nome)}));
    ok('abre no próprio nome',r.mem===r.eu,JSON.stringify(r));
    ok('e no mês corrente',r.mes===mesAgora,r.mes);
    ok('sem os filtros das outras pessoas (nem "Todos")',r.chipsMem===0,String(r.chipsMem));
    ok('"Por pessoa" mostra só uma linha, a dele',r.pessoas===1,String(r.pessoas));
    const texto=await pg.textContent('#main');
    ok('os nomes dos colegas não aparecem no Resumo',!r.nomes.some(n=>texto.includes(n)),r.nomes.filter(n=>texto.includes(n)).join(', '));
  }
  ok('sem erros de JavaScript (assistente)',erros.length===0,erros[0]);
  await ctx.close();
}
}catch(e){ falhou++; console.log('  ❌ exceção: '+(e&&e.stack||e)); }

await browser.close();
console.log(`\n${passou} passaram, ${falhou} falharam`);
process.exit(falhou?1:0);
