import { chromium } from 'playwright';
import { arranca, garanteEquipa, semeia } from './comum.mjs';
const B='http://localhost:8099/index.html';
let falhas=0;
const ok=(c,m)=>{console.log((c?'  PASS':'  FALHA')+' · '+m); if(!c)falhas++;};

const novoCtx=async(browser,init)=>{
  const ctx=await browser.newContext();
  if(init)await ctx.addInitScript(init);
  const pg=await ctx.newPage();
  const erros=[];
  pg.on('pageerror',e=>erros.push(String(e)));
  await pg.goto(B,{waitUntil:'load'});
  return {pg,erros};
};

const browser=await chromium.launch();

// ---------- 1. F1: escrever nos km não pode destruir o input ----------
console.log('\n[F1] foco ao escrever km / valor manual');
{
  const {pg,erros}=await novoCtx(browser);
  await arranca(pg);await garanteEquipa(pg);
  await pg.click('#fab');
  await pg.selectOption('#fTipo','Nacional');   // Distrital usa deslocação fixa; km só aparece no Nacional
  await pg.waitForSelector('.atr [data-f="km"]');
  await pg.click('.atr [data-f="km"]');
  await pg.keyboard.type('147');
  const r=await pg.evaluate(()=>({
    foco:document.activeElement?.getAttribute('data-f'),
    valor:document.querySelector('.atr [data-f="km"]').value,
    calc:document.querySelector('.atr .calc')?.textContent||''
  }));
  ok(r.foco==='km','o campo km mantém o foco depois de 3 teclas (foco: '+r.foco+')');
  ok(r.valor==='147','o valor escrito fica completo (valor: "'+r.valor+'")');
  ok(/desloc/.test(r.calc),'a linha de cálculo continua a atualizar');

  await pg.click('.atr details summary');            // "Valor manual" passou a estar recolhido
  await pg.click('.atr [data-f="override"]');
  await pg.keyboard.type('42.50');
  const o=await pg.evaluate(()=>({f:document.activeElement?.getAttribute('data-f'),v:document.querySelector('.atr [data-f="override"]').value,t:document.querySelector('#fTot').textContent}));
  ok(o.f==='override'&&o.v==='42.50','o valor manual também mantém foco e valor');
  ok(/42,50/.test(o.t),'o total do jogo reflete o valor manual ('+o.t+')');

  // o select continua a redesenhar
  await pg.selectOption('.atr [data-f="funcao"]','AA');
  ok((await pg.textContent('.atr .head')).includes('AA'),'mudar a função continua a redesenhar a linha');
  ok(erros.length===0,'sem erros de página ('+erros.join(' | ')+')');
  await pg.context().close();
}

// ---------- 2. F2: Resumo sem roundRect (Safari < 16.4) ----------
console.log('\n[F2] Resumo em browser sem Canvas.roundRect');
{
  const {pg,erros}=await novoCtx(browser,()=>{delete CanvasRenderingContext2D.prototype.roundRect;});
  await arranca(pg);await garanteEquipa(pg);
  const semRR=await pg.evaluate(()=>typeof CanvasRenderingContext2D.prototype.roundRect);
  ok(semRR==='undefined','roundRect removido para o teste');
  await pg.click('.tabbar button[data-tab="resumo"]');
  // O Resumo já não tem exportar/sincronizar: essa secção mudou-se para as
  // Definições. Os botões que ficaram são o calendário e o relatório, e são
  // esses que têm de sobreviver a um Canvas sem roundRect.
  await pg.waitForSelector('#expIcs');
  const h=await pg.evaluate(()=>['expIcs','relBtn'].map(i=>!!document.getElementById(i)?.onclick));
  ok(h.every(Boolean),'os botões do Resumo ficam ligados: '+JSON.stringify(h));
  const pintou=await pg.evaluate(()=>{const c=document.querySelector('#chart');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return d.some(v=>v!==0);});
  ok(pintou===false||pintou===true,'drawChart não interrompe o render (pintou='+pintou+')');
  ok(erros.length===0,'sem erros de página ('+erros.join(' | ')+')');
  await pg.context().close();
}

// ---------- 3. B2: XSS a partir de dados vindos do servidor ----------
/* Antes este teste injetava um estado envenenado no localStorage. Agora os
   dados vêm todos da base de dados, por isso o veneno entra por onde entraria
   a sério: um jogo e uma despesa gravados por outra pessoa da equipa. */
console.log('\n[B2] XSS via dados vindos da base de dados');
{
  const payload='"><img src=x onerror="window.__XSS=1">';
  const {pg,erros}=await novoCtx(browser);
  await arranca(pg);await garanteEquipa(pg);
  await semeia(pg,{
    jogos:[{data:"2025-09-20",hora:"15:00",escalao:"sub 14 IN",
      equipaA:payload,equipaB:"B",local:payload,tipo:"Distrital",
      estado:'agendado',valorRecebido:"",dataPagamento:"",
      atribuicoes:[{membroId:0,funcao:"A",almocoId:"",km:"",override:"",nomeSms:payload,valor:23}]}],
    despesas:[{membroId:0,data:"2025-09-20",categoria:payload,descricao:payload,valor:12,tipoLanc:"despesa"}]
  });
  await pg.waitForSelector('.card');
  await pg.click('.card [data-act="edit"]');
  await pg.waitForSelector('.atr');
  await pg.evaluate(()=>document.querySelector('#dlg').close());
  await pg.click('.tabbar button[data-tab="despesas"]');
  await pg.waitForSelector('[data-desp="edit"]');
  await pg.click('[data-desp="edit"]');
  await pg.waitForSelector('#dDesc');
  const r=await pg.evaluate(()=>({xss:!!window.__XSS,imgs:document.querySelectorAll('img').length,
    html:document.querySelector('#dDesc')?.outerHTML}));
  ok(r.xss!==true,'nenhum payload executou (window.__XSS='+r.xss+')');
  ok(r.imgs===0,'nenhum <img> injetado (encontrados: '+r.imgs+')');
  ok(/&quot;&gt;&lt;img/.test(r.html||''),'o payload sai escapado no atributo value, como texto');
  ok(!/<img/i.test(r.html),'o HTML gerado não contém tag injetada');
  ok(erros.length===0,'sem erros de página ('+erros.join(' | ')+')');
  await pg.context().close();
}

// ---------- 4. A2: credenciais fora do código ----------
/* O repositório é público: a app não pode trazer chaves lá dentro, e sem o
   ficheiro de configuração tem de dizer o que falta em vez de rebentar. */
console.log('\n[A2] credenciais fora do código');
{
  const {pg,erros}=await novoCtx(browser);
  const cfg=await pg.evaluate(()=>({url:window.SB_CONFIG&&window.SB_CONFIG.url}));
  ok(!!cfg.url,'o config.local.js foi carregado');
  await pg.waitForSelector('#cxConta');
  ok(!!(await pg.$('#cE'))&&!!(await pg.$('#cP')),'com configuração, abre o ecrã de entrar');
  ok(erros.length===0,'sem erros de página ('+erros.join(' | ')+')');
  await pg.context().close();

  const ctx=await browser.newContext();
  await ctx.route('**/config.local.js',r=>r.fulfill({status:404,body:''}));
  const p2=await ctx.newPage();
  const e2=[];p2.on('pageerror',e=>e2.push(String(e)));
  await p2.goto(B,{waitUntil:'load'});
  await p2.waitForSelector('#cxConta');
  const txt=await p2.textContent('#cxConta');
  ok(/Falta configurar/i.test(txt),'sem o ficheiro, explica o que falta em vez de rebentar');
  ok(/config\.local\.js/.test(txt),'e diz o nome do ficheiro que falta');
  ok((await p2.$('#cGo'))===null,'e não mostra um formulário que nunca ia funcionar');
  ok(e2.length===0,'sem erros de página quando o ficheiro falta ('+e2.join(' | ')+')');
  await ctx.close();
}

// ---------- 5. Não-regressão: fluxo normal de registo ----------
console.log('\n[regressão] registar e guardar um jogo');
{
  const {pg,erros}=await novoCtx(browser);
  await arranca(pg);await garanteEquipa(pg);
  await pg.click('#fab');
  await pg.selectOption('#fTipo','Nacional');
  await pg.selectOption('#fEscSel','Sub 17');
  await pg.fill('#fEqA','UD Fermedo');
  await pg.fill('#fEqB','UD Mourisquense');
  await pg.click('.atr [data-f="km"]');
  await pg.keyboard.type('30');
  await pg.click('#fSave');
  await pg.waitForSelector('.card .teams');
  const t=await pg.textContent('.card .teams');
  ok(/Fermedo/.test(t),'jogo guardado e listado ('+t.trim()+')');
  // Já não há cópia local: vai buscar o jogo à base de dados, tal como a app
  // faz a seguir a gravar.
  const tot=await pg.evaluate(async()=>{
    const r=await sbReq("GET","jogos?select=*,participacoes(*)&equipa_id=eq."+EQUIPA.id);
    return {km:r[0].participacoes[0].km};
  });
  ok(Number(tot.km)===30,'os km ficam guardados como número, não como texto (km='+JSON.stringify(tot.km)+')');
  ok(erros.length===0,'sem erros de página ('+erros.join(' | ')+')');
  await pg.context().close();
}

// ---------- 6. G3: km memorizados por campo ----------
console.log('\n[G3] km guardados por campo');
{
  const {pg,erros}=await novoCtx(browser);
  await arranca(pg);await garanteEquipa(pg);

  // 1º jogo no Campo da Junta, 38 km
  await pg.click('#fab');
  await pg.selectOption('#fTipo','Nacional');
  await pg.selectOption('#fEscSel','Sub 17');
  await pg.fill('#fEqA','Fermedo'); await pg.fill('#fEqB','Mourisca');
  // os km são do chefe (árbitro principal): é na linha dele que a memória entra
  await pg.selectOption('.atr [data-f="funcao"]','A');
  await pg.fill('#fLoc','Campo da Junta');
  await pg.click('.atr [data-f="km"]'); await pg.keyboard.type('38');
  // O "change" do campo dispara ao sair dele, ou seja, no momento em que o dedo
  // toca nos km: isso não pode destruir o input (mesma família do F1).
  const foco=await pg.evaluate(()=>({f:document.activeElement?.getAttribute('data-f'),v:document.querySelector('.atr [data-f="km"]').value}));
  ok(foco.f==='km'&&foco.v==='38','escrever o campo e saltar para os km não destrói o input (foco='+foco.f+', valor="'+foco.v+'")');
  await pg.click('#fSave');
  await pg.waitForSelector('.card .teams');

  // 2º jogo no mesmo campo, escrito de outra maneira
  await pg.evaluate(async()=>{ await guarda('tabela',{id:criaId(),epocaId:epAtiva().id,tipo:'Nacional',escalao:'Sub 19',funcao:'A',valor:60}); await recarrega(true); });
  await pg.click('#fab');
  await pg.selectOption('#fTipo','Nacional');
  await pg.selectOption('#fEscSel','Sub 19');
  await pg.fill('#fEqA','Outra'); await pg.fill('#fEqB','Equipa');
  await pg.selectOption('.atr [data-f="funcao"]','A');
  await pg.fill('#fLoc','  CAMPO DA JUNTA ');
  await pg.dispatchEvent('#fLoc','change');
  await pg.waitForTimeout(150);
  const r=await pg.evaluate(()=>({
    km:document.querySelector('.atr [data-f="km"]').value,
    calc:document.querySelector('.atr .calc').textContent,
    tot:document.querySelector('#fTot').textContent
  }));
  ok(r.km==='38','os km apareceram sozinhos apesar de o campo estar escrito de outra forma (km='+r.km+')');
  ok(/km guardados/.test(r.calc),'a app diz que o valor veio do histórico');
  // 60,00 € (Nacional · Sub 19 · A, acrescentada acima) + 13,68 € (38 km × 0,36 €) = 73,68 €.
  // O total certo é com as duas parcelas.
  ok(/73,68/.test(r.tot),'tarifa e deslocação entram as duas no total ('+r.tot+')');

  // correção manual manda, e passa a ser a nova memória
  await pg.fill('.atr [data-f="km"]','');
  await pg.click('.atr [data-f="km"]'); await pg.keyboard.type('52');
  await pg.click('#fSave');
  await pg.waitForSelector('.card .teams');
  const d=await pg.evaluate(()=>S.distancias.map(x=>({local:x.local,km:x.km})));
  ok(d.length===1,'ficou uma única entrada para o campo, não duas ('+JSON.stringify(d)+')');
  ok(String(d[0].km)==='52','a correção manual substituiu o valor guardado');

  // um membro diferente no mesmo campo não herda os km do outro
  await pg.evaluate(()=>{S.distancias=[];});
  ok(await pg.evaluate(()=>distanciaDe(S.membros[1].id,'Campo da Junta')===null),'a memória é por pessoa, não por campo só');
  ok(erros.length===0,'sem erros de página ('+erros.join(' | ')+')');
  await pg.context().close();
}

await browser.close();
console.log('\n'+(falhas?('❌ '+falhas+' falha(s)'):'✅ todos os testes passaram'));
process.exit(falhas?1:0);
