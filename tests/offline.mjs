/* Sem rede.
 *
 * A app abre sem rede (os ficheiros estão na cache do service worker) e, se
 * este telemóvel já tiver uma cópia dos dados desta conta, mostra-a e deixa
 * registar: o que se grava fica numa fila e é enviado quando a rede volta
 * (js/offline.js). Sem cópia, diz claramente que não chegou ao servidor, sem
 * inventar uma lista vazia nem dizer que a sessão expirou.
 *
 * Gravar sem rede a meio de uma sessão é testado na contas.mjs.
 */
import { chromium } from 'playwright';
import { arranca, configura, semeia, MOCK, B as B_SEM_CFG } from './comum.mjs';
const B=process.env.APP_URL||'http://localhost:8099/index.html';
let falhas=0;
const ok=(c,m)=>{console.log((c?'  PASS':'  FALHA')+' · '+m); if(!c)falhas++;};

const browser=await chromium.launch();

console.log('\n[C2] um ficheiro em falta não deixa a app sem offline');
{
  const ctx=await browser.newContext();
  const pg=await ctx.newPage();
  await pg.goto(B_SEM_CFG);   // servidor sem o config.local.js: 404 verdadeiro
  await ctx.waitForEvent('serviceworker',{timeout:8000}).catch(()=>{});
  await pg.waitForTimeout(1500);
  const r=await pg.evaluate(async()=>{
    const nomes=await caches.keys();
    const c=await caches.open(nomes.find(n=>n.startsWith('arb-app'))||'x');
    return {nomes, index:!!(await c.match('./index.html')),
            motor:!!(await c.match('./engine.js')), dados:!!(await c.match('./dados.js')),
            cfg:!!(await c.match('./config.local.js'))};
  });
  ok(r.nomes.some(n=>n.startsWith('arb-app')),'a cache foi criada apesar do 404 ('+r.nomes.join()+')');
  ok(r.index===true,'o index.html ficou em cache — a app abre offline');
  ok(r.motor===true,'o engine.js também, senão a app abria sem motor de cálculo');
  ok(r.dados===true,'e o dados.js, senão abria sem saber falar com a base de dados');
  ok(r.cfg===false,'o ficheiro em falta foi ignorado, não abortou a instalação');
  await ctx.close();
}

console.log('\n[C4] navegação offline para um endereço que não está em cache');
{
  const ctx=await browser.newContext();const pg=await ctx.newPage();
  await pg.goto(B);
  await ctx.waitForEvent('serviceworker',{timeout:8000}).catch(()=>{});
  await pg.waitForTimeout(1500);
  await ctx.setOffline(true);
  await pg.goto(B+'?separador=resumo',{waitUntil:'load'}).catch(()=>{});
  const abriu=await pg.$('.tabbar');
  ok(!!abriu,'a app abriu offline num endereço novo (fallback de navegação)');
  await ctx.setOffline(false);
  await ctx.close();
}

console.log('\n[R1] sem rede a app abre com a cópia deste telemóvel, e regista para enviar depois');
{
  const ctx=await browser.newContext();const pg=await ctx.newPage();
  await configura(pg,MOCK);
  await arranca(pg);                      // sessão feita, equipa criada
  await semeia(pg,{jogos:[{data:'2026-03-01',hora:'15:00',tipo:'Distrital',escalao:'sub 14 IN',
    equipaA:'Copia FC',equipaB:'Local SC',estado:'agendado',atribuicoes:[{membroId:0,funcao:'A',valor:23}]}]});
  await ctx.waitForEvent('serviceworker',{timeout:8000}).catch(()=>{});
  await pg.waitForTimeout(800);

  await ctx.setOffline(true);
  await pg.reload({waitUntil:'load'}).catch(()=>{});
  await pg.waitForTimeout(3000);
  const txt=await pg.evaluate(()=>document.body.innerText);
  ok(await pg.evaluate(()=>!document.body.classList.contains('login-on')),'a app abre sem rede, sem ecrã de conta nem de "sem ligação"');
  ok(/Copia FC/.test(txt),'com os jogos que havia da última vez');
  ok(/Sem rede/.test(txt),'e diz que está a mostrar a cópia deste telemóvel');
  ok(!/sess[ãa]o expirou/i.test(txt),'sem dizer que a sessão expirou');

  // registar uma multa sem rede
  const antes=(await fetch(MOCK+'/__estado').then(r=>r.json())).multas;
  await pg.click('.tabbar button[data-tab="multas"]');
  await pg.click('#fab');
  await pg.waitForSelector('#uSave');
  await pg.fill('#uV','7');
  await pg.click('#uSave');
  await pg.waitForTimeout(600);
  ok(/1 por enviar/.test(await pg.textContent('#hSync')),'a multa fica por enviar');
  ok((await fetch(MOCK+'/__estado').then(r=>r.json())).multas===antes,'e ainda não chegou à base de dados');

  await ctx.setOffline(false);
  await pg.evaluate(()=>window.dispatchEvent(new Event('online')));
  await pg.waitForFunction(()=>!/por enviar/.test(document.querySelector('#hSync').textContent),null,{timeout:10000}).catch(()=>{});
  ok((await fetch(MOCK+'/__estado').then(r=>r.json())).multas===antes+1,'com a rede de volta, a multa é enviada sozinha');

  // terminar sessão apaga a cópia deste telemóvel
  await pg.evaluate(()=>{ apagaDadosLocais(); });
  ok(await pg.evaluate(()=>!localStorage.getItem('arbCopia')&&!localStorage.getItem('arbFila')),'apagar os dados locais tira a cópia e a fila');
  await ctx.close();
}

console.log('\n[R1b] sem rede e sem cópia neste telemóvel: diz porque é que não tem dados');
{
  const ctx=await browser.newContext();const pg=await ctx.newPage();
  await configura(pg,MOCK);
  await arranca(pg);                      // sessão feita, equipa criada
  await ctx.waitForEvent('serviceworker',{timeout:8000}).catch(()=>{});
  await pg.waitForTimeout(800);
  await pg.evaluate(()=>localStorage.removeItem('arbCopia'));

  await ctx.setOffline(true);
  await pg.reload({waitUntil:'load'}).catch(()=>{});
  await pg.waitForTimeout(3000);

  const snap=await pg.evaluate(()=>({txt:document.body.innerText,
    botao:!!document.querySelector('#slOutra')}));
  const visivel=snap.txt;
  ok((await pg.$('.tabbar'))!==null,'a app abre na mesma — o ficheiro veio da cache');
  ok(/Sem ligação/i.test(visivel),'e diz que não conseguiu chegar ao servidor');
  ok(!/sess[ãa]o expirou/i.test(visivel),
     'sem dizer que a sessão expirou, que seria mentira e não se resolvia sem rede');
  ok(!/Ainda não há jogos/i.test(visivel),
     'e sem inventar que a época está vazia, que é outra coisa');
  ok(snap.botao,'com um botão para tentar outra vez');
  await ctx.setOffline(false);
  await ctx.close();
}

console.log('\n[C3] aviso de nova versão em vez de recarregar por baixo do utilizador');
{
  const ctx=await browser.newContext();const pg=await ctx.newPage();
  await configura(pg,MOCK);
  await arranca(pg);
  await pg.evaluate(()=>mostraNovaVersao({waiting:{postMessage(){}}}));
  ok(await pg.isVisible('#upbar'),'a barra de nova versão aparece');
  ok(/Nova versão/.test(await pg.textContent('#upbar')),'com texto claro');
  await pg.click('#upDepois');
  ok(!(await pg.$('#upbar')),'"Depois" fecha sem recarregar');
  await ctx.close();
}

await browser.close();
console.log('\n'+(falhas?('❌ '+falhas+' falha(s)'):'✅ todos os testes passaram'));
process.exit(falhas?1:0);
