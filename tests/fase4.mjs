/* Fase 4: avisos no telemóvel (a parte da app) e o que está por enviar.
 * As regras de QUANDO avisar estão em tests/avisos.mjs; o servidor que envia
 * (Edge Function) não corre aqui. O serviço de push do browser é substituído
 * por um de mentira: aqui prova-se o que a app faz com ele. */
import { chromium } from 'playwright';
import { arranca, vaiPara, esperaApp, B, MOCK } from './comum.mjs';

let passou=0, falhou=0;
const ok=(n,c,d='')=>{ if(c){passou++;console.log('  ✅ '+n);} else {falhou++;console.log('  ❌ '+n+(d?'  → '+d:''));} };
const estado=()=>fetch(MOCK+'/__estado').then(r=>r.json());
// chave pública de exemplo (formato válido; o serviço de push é de mentira)
const VAPID='BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

const browser=await chromium.launch();
try{
  const ctx=await browser.newContext({viewport:{width:375,height:780}});
  await ctx.grantPermissions(['notifications']);
  const pg=await ctx.newPage();
  const erros=[];
  pg.on('pageerror',e=>erros.push(String(e&&e.message||e)));
  await arranca(pg);

  console.log('\n── avisos: sem chave no servidor ──');
  {
    await vaiPara(pg,'config');
    await pg.waitForFunction(()=>!/A ver…/.test(document.querySelector('#cAvisos').textContent),null,{timeout:8000});
    ok('explica que os avisos ainda não foram ligados no servidor',/ainda não foram ligados/.test(await pg.textContent('#cAvisos')));
    ok('e ao responsável diz onde está o guia',/AVISOS-PUSH/.test(await pg.textContent('#cAvisos')));
  }

  console.log('\n── avisos: ligar e desligar ──');
  {
    await pg.addInitScript(v=>{
      window.SB_CONFIG=Object.assign(window.SB_CONFIG||{},{vapid:v});
      // o Chromium sem janela recusa sempre notificações: a autorização também é de mentira
      Object.defineProperty(Notification,'permission',{get:()=>'granted',configurable:true});
      Notification.requestPermission=async()=>'granted';
      window.__sub=null;
      const falsa=()=>({endpoint:'https://push.exemplo/telemovel-1',
        toJSON(){return {endpoint:this.endpoint,keys:{p256dh:'chave',auth:'segredo'}};},
        unsubscribe:async()=>{window.__sub=null;return true;}});
      if(window.PushManager){
        PushManager.prototype.getSubscription=async function(){return window.__sub;};
        PushManager.prototype.subscribe=async function(){window.__sub=falsa();return window.__sub;};
      }
    },VAPID);
    await pg.reload(); await esperaApp(pg);
    await vaiPara(pg,'config');
    await pg.waitForSelector('#avLiga',{timeout:10000});
    ok('com a chave, oferece "Ligar avisos"',true);
    await pg.click('#avLiga');
    await pg.waitForSelector('#avDesliga',{timeout:8000});
    ok('ligar mostra que ficaram ligados',/Ligados neste telemóvel/.test(await pg.textContent('#cAvisos')));
    const e1=await estado();
    ok('e regista este telemóvel no servidor',e1.subscricoes===1,JSON.stringify(e1));
    await pg.click('#avLiga').catch(()=>{});      // já não existe: ligar outra vez não duplica
    await pg.evaluate(()=>ligaAvisos());
    ok('ligar outra vez no mesmo telemóvel não duplica',(await estado()).subscricoes===1);
    await pg.click('#avDesliga');
    await pg.waitForSelector('#avLiga',{timeout:8000});
    ok('desligar tira o registo do servidor',(await estado()).subscricoes===0);
  }

  console.log('\n── o service worker mostra o aviso ──');
  {
    const sw=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker',{timeout:8000}).catch(()=>null);
    if(!sw){ ok('há service worker para testar o push',false,'nenhum'); }
    else{
      const r=await sw.evaluate(async()=>{
        if(typeof PushEvent==='undefined')return {sem:true};
        // o Chromium sem janela recusa mostrar notificações: apanha-se o pedido
        const mostradas=[];
        self.registration.showNotification=async(t,o)=>{mostradas.push({title:t,...o});};
        const ev=new PushEvent('push',{data:JSON.stringify({titulo:'Marcar horas até às 20h (Art. 4)',corpo:'Fermedo vs Mourisca',tag:'t1'})});
        self.dispatchEvent(ev);
        await new Promise(r=>setTimeout(r,200));
        const ns=mostradas;
        return {n:ns.length,titulo:ns[0]&&ns[0].title,corpo:ns[0]&&ns[0].body,tag:ns[0]&&ns[0].tag};
      }).catch(e=>({erro:String(e)}));
      if(r.sem)console.log('    (este Chromium não deixa criar PushEvent à mão — passo)');
      else ok('um push vira notificação com o título e o texto',r.n>=1&&/Art\. 4/.test(r.titulo)&&/Fermedo/.test(r.corpo),JSON.stringify(r));
    }
  }

  console.log('\n── por enviar: Definições e terminar sessão ──');
  {
    await fetch(MOCK+'/__rede?on=0');
    await vaiPara(pg,'despesas');
    await pg.click('#fab');
    await pg.waitForSelector('#dSave');
    await pg.fill('#dV','9,50');
    await pg.click('#dSave');
    await pg.waitForTimeout(800);
    await vaiPara(pg,'config');
    await pg.waitForSelector('#cFila',{timeout:8000});
    ok('Definições mostra o que está por enviar',/a despesa/.test(await pg.textContent('#cFila')));
    await pg.evaluate(()=>{ terminaSessao(); });
    await pg.waitForSelector('#dlg2[open]',{timeout:5000});
    ok('terminar sessão com coisas por enviar pede confirmação',/por enviar/i.test(await pg.textContent('#dlg2')));
    await pg.keyboard.press('Escape');
    await fetch(MOCK+'/__rede?on=1');
    await pg.click('#filaEnvia');
    await pg.waitForFunction(()=>!document.querySelector('#cFila'),null,{timeout:8000});
    ok('"Enviar agora" envia e a lista desaparece',(await estado()).despesas>=1);
  }

  console.log('\n── gota: valor gasto ou calculado pelos km ──');
  {
    await vaiPara(pg,'despesas');
    await pg.click('#fab');
    await pg.waitForSelector('#dSave');
    ok('noutra categoria não aparece o cálculo',await pg.evaluate(()=>document.querySelector('#dGota').hidden));
    await pg.click('[data-cat="Gota"]');
    ok('na Gota aparecem as duas opções',await pg.isVisible('[data-gmodo="valor"]')&&await pg.isVisible('[data-gmodo="calc"]'));
    await pg.click('[data-gmodo="calc"]');
    await pg.fill('#dGKm','120'); await pg.fill('#dGMed','6,5'); await pg.fill('#dGPre','1,70');
    ok('a conta aparece enquanto se escreve: 120 km × 6,5 L/100 km × 1,70 €/L = 13,26 €',
       (await pg.inputValue('#dV'))==='13,26'&&/7,8 L/.test(await pg.textContent('#dGConta')),
       (await pg.inputValue('#dV'))+' | '+(await pg.textContent('#dGConta')));
    await pg.click('#dSave');
    await pg.waitForTimeout(700);
    const g=await pg.evaluate(()=>S.despesas.find(x=>x.categoria==='Gota'));
    ok('guarda o valor calculado',g&&g.valor===13.26,JSON.stringify(g));
    ok('e a conta fica na descrição',g&&/120 km · 6,5 L\/100 km · 1,7 €\/L/.test(g.descricao),g&&g.descricao);

    await pg.evaluate(id=>formDespesa(S.despesas.find(x=>x.id===id)),g.id);
    await pg.waitForSelector('#dGKm');
    ok('ao editar, os campos voltam preenchidos',(await pg.inputValue('#dGKm'))==='120'&&await pg.isVisible('#dGCalc'));
    await pg.click('#dCancel');

    await pg.click('#fab');
    await pg.waitForSelector('#dSave');
    await pg.click('[data-cat="Gota"]');
    ok('uma gota nova já abre no cálculo, com a média e o preço da última vez',
       await pg.isVisible('#dGCalc')&&(await pg.inputValue('#dGMed'))==='6,5'&&(await pg.inputValue('#dGPre'))==='1,7');
    await pg.click('[data-gmodo="valor"]');
    await pg.fill('#dV','20');
    await pg.click('#dSave');
    await pg.waitForTimeout(700);
    ok('a opção "Valor gasto" continua a funcionar',
       await pg.evaluate(()=>S.despesas.some(x=>x.categoria==='Gota'&&x.valor===20)));
  }

  console.log('\n── apagar uma época (a de teste) ──');
  {
    await vaiPara(pg,'config');
    await pg.waitForSelector('#cNova');
    ok('com uma só época não há botão de apagar',!(await pg.$('#cApagaEp')));
    // uma época de teste, com um jogo lá dentro
    const idEp=await pg.evaluate(async()=>{
      const e={id:criaId(),nome:'2027/28',anoInicio:2027,valorKm:0.36,deslocacoes:[]};
      await guarda('epocas',e);
      await guardaJogo({id:criaId(),epocaId:e.id,data:'2026-09-19',hora:'15:00',tipo:'Distrital',escalao:'sub 14 IN',
        equipaA:'Teste',equipaB:'Repetido',local:'',estado:'agendado',atribuicoes:[{membroId:EUMEMBRO.id,funcao:'A',valor:23}]});
      S.settings.epocaAtivaId=e.id; guardaEpocaEscolhida(e.id);
      await recarrega(true); return e.id;
    });
    await pg.waitForSelector('#cApagaEp');
    ok('com duas épocas aparece "Apagar a época 2027/28"',/2027\/28/.test(await pg.textContent('#cApagaEp')));
    const jogosAntes=(await estado()).jogos;

    await pg.click('#cApagaEp');
    await pg.waitForSelector('#c2Sim');
    ok('o aviso diz o que vai junto',/1 jogo/.test(await pg.textContent('#dlg2'))&&/não se consegue repor/.test(await pg.textContent('#dlg2')));
    await pg.click('#c2Sim');
    await pg.waitForSelector('#p2V');
    await pg.fill('#p2V','2026/27');
    await pg.click('#p2Ok');
    await pg.waitForTimeout(500);
    ok('com o nome errado não apaga',await pg.evaluate(id=>S.epocas.some(e=>e.id===id),idEp));

    await pg.click('#cApagaEp');
    await pg.click('#c2Sim');
    await pg.waitForSelector('#p2V');
    await pg.fill('#p2V','2027/28');
    await pg.click('#p2Ok');
    await pg.waitForFunction(id=>!S.epocas.some(e=>e.id===id),idEp,{timeout:8000});
    ok('com o nome certo, a época desaparece',true);
    ok('e leva o jogo dela',(await estado()).jogos===jogosAntes-1);
    ok('a outra época fica ativa',await pg.evaluate(()=>S.epocas.length===1&&S.settings.epocaAtivaId===S.epocas[0].id));
    await pg.waitForFunction(()=>!/A carregar/.test(document.querySelector('#cLixo').textContent),null,{timeout:8000});
    ok('o que foi com a época não aparece em Apagados (não se conseguiria repor)',
       !/Teste vs Repetido/.test(await pg.textContent('#cLixo')));
    ok('e com uma só época o botão volta a desaparecer',!(await pg.$('#cApagaEp')));
  }

  ok('sem erros de JavaScript',erros.length===0,erros[0]);
  await ctx.close();
}catch(e){
  falhou++; console.log('  ❌ exceção na suíte: '+(e&&e.stack||e));
}finally{
  await fetch(MOCK+'/__rede?on=1').catch(()=>{});
  await browser.close();
}
console.log(`\n  ${passou} passaram, ${falhou} falharam`);
process.exit(falhou?1:0);
