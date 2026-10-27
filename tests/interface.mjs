import { chromium } from 'playwright';
import { arranca, garanteEquipa, configura, registaEEntra, criaEquipaNova, esperaApp, B as BB, MOCK } from './comum.mjs';
const B=process.env.APP_URL||'http://localhost:8099/index.html';
let falhas=0;
const ok=(c,m)=>{console.log((c?'  PASS':'  FALHA')+' · '+m); if(!c)falhas++;};

const criaJogo=(pg,id)=>pg.evaluate(id=>{
  S.jogos.push({id,epocaId:epAtiva().id,criadoEm:Date.now(),data:"2025-09-20",hora:"15:00",escalao:"sub 14 IN",
    equipaA:"Fermedo",equipaB:"Mourisca",local:"",tipo:"Distrital",estado:"realizado",valorRecebido:"",dataPagamento:"",
    confirmada:true,horasMarcadas:true,
    atribuicoes:[{membroId:S.membros[0].id,funcao:"A",almocoId:"",km:"",override:""}]});
  render();
},id);

const browser=await chromium.launch();

console.log('\n[F3] avisos deixam de ser diálogos do browser');
{
  const ctx=await browser.newContext();const pg=await ctx.newPage();
  const nativos=[];pg.on('dialog',d=>{nativos.push(d.message());d.dismiss();});
  const erros=[];pg.on('pageerror',e=>erros.push(String(e).split('\n')[0]));
  await arranca(pg);await garanteEquipa(pg);
  await criaJogo(pg,'j1');

  await pg.click('.card [data-act="del"]');
  await pg.waitForSelector('#c2Sim');
  ok(nativos.length===0,'nenhum confirm() nativo foi disparado');
  ok(/Apagar jogo/.test(await pg.textContent('#dlg2')),'o aviso é um diálogo da própria app, com título');
  ok(/Fermedo vs Mourisca/.test(await pg.textContent('#dlg2')),'e diz exatamente o que vai apagar');
  ok(await pg.evaluate(()=>document.querySelector('#dlg2').getAttribute('aria-labelledby')!==null),'o diálogo é anunciado pelo seu título (aria-labelledby)');
  ok(await pg.evaluate(()=>document.activeElement.id==='c2Nao'),'numa ação destrutiva o foco começa em Cancelar');

  await pg.click('#c2Nao');
  await pg.waitForTimeout(150);
  ok(await pg.evaluate(()=>S.jogos.length===1),'Cancelar não apaga nada');

  await pg.click('.card [data-act="del"]');
  await pg.waitForSelector('#c2Sim');
  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(200);
  ok(await pg.evaluate(()=>S.jogos.length===1),'Esc também cancela');

  console.log('\n[F4] apagar passa a ter volta atrás');
  await pg.click('.card [data-act="del"]');
  await pg.waitForSelector('#c2Sim');
  await pg.click('#c2Sim');
  await pg.waitForTimeout(250);
  ok(await pg.evaluate(()=>S.jogos.length===0),'o jogo foi apagado');
  // As lápides desapareceram com a fusão entre telemóveis: agora apagar é
  // apagar mesmo, na base de dados. O que interessa provar é isso e o Anular.
  ok(await pg.evaluate(async()=>{
       const r=await sbReq("GET","jogos?select=id&equipa_id=eq."+EQUIPA.id); return r.length===0;
     }),'e desapareceu mesmo da base de dados');
  ok(await pg.isVisible('#toast button'),'o aviso traz um botão Anular');
  await pg.click('#toast button');
  await pg.waitForTimeout(600);
  ok(await pg.evaluate(()=>S.jogos.length===1),'Anular repõe o jogo');
  ok(await pg.evaluate(async()=>{
       const r=await sbReq("GET","jogos?select=id&equipa_id=eq."+EQUIPA.id); return r.length===1;
     }),'e repõe-no também na base de dados, não só no ecrã');

  console.log('\n[F7] os erros duram mais do que os avisos normais');
  const normal=await pg.evaluate(()=>{toast("ok");const t=document.querySelector('#toast');return {cls:t.className};});
  const erro=await pg.evaluate(()=>{toast("falhou","erro");const t=document.querySelector('#toast');return {cls:t.className};});
  ok(!/erro/.test(normal.cls)&&/erro/.test(erro.cls),'o aviso de erro tem marcação própria');

  console.log('\n[F3] prompt() substituído na criação de época');
  await pg.click('.tabbar button[data-tab="config"]');
  await pg.click('#cNova');
  await pg.waitForSelector('#p2V');
  ok(nativos.length===0,'nenhum prompt() nativo (é ignorado em algumas PWA instaladas)');
  // Agora é uma pergunta só: o ano sai do nome ("2026/27" -> 2026), como já
  // acontece no cartão da época. Perguntar duas vezes o mesmo era ruído.
  await pg.fill('#p2V','2026/27');await pg.click('#p2Ok');
  await pg.waitForTimeout(1200);
  ok(await pg.evaluate(()=>S.epocas.length===2&&S.epocas.some(e=>e.nome==='2026/27'&&e.anoInicio===2026)),'a época nova foi criada, com o ano tirado do nome');
  ok(await pg.evaluate(()=>{const n=S.epocas.find(e=>e.nome==='2026/27');return S.tabela.filter(t=>t.epocaId===n.id).length>0;}),'com as tarifas copiadas');
  ok(erros.length===0,'sem erros de página ('+erros.join(' | ')+')');
  await ctx.close();
}

/* O antigo "Usar sem conta" desapareceu: já não há modo só-neste-telemóvel.
   O que tem de ficar provado agora é que ninguém fica encalhado em lado nenhum
   — sem sessão vê o ecrã de conta, com sessão e sem equipa vê o de equipa, e
   terminar sessão leva de volta ao princípio. */
console.log('\n[entrada] ninguém fica encalhado num ecrã sem saída');
{
  const ctx=await browser.newContext();const pg=await ctx.newPage();
  const erros=[];pg.on('pageerror',e=>erros.push(String(e).split('\n')[0]));
  await configura(pg,MOCK);
  await pg.goto(BB);
  ok(await pg.isVisible('#cGo'),'sem sessão, abre no ecrã de entrar');
  ok(!(await pg.$('#cxEquipa')),'e não mostra o ecrã de equipa antes de haver conta');

  await registaEEntra(pg,{nome:'A. Primeiro'});
  await pg.waitForSelector('#cxEquipa',{timeout:15000});
  ok(true,'com conta mas sem equipa, o ecrã seguinte é criar/entrar — não um ecrã vazio');
  ok(await pg.isVisible('#eqC')&&await pg.isVisible('#eqNome'),'com as duas saídas à vista: código ou criar');

  await criaEquipaNova(pg,{meuNome:'A. Primeiro'});
  await garanteEquipa(pg);
  ok(await pg.evaluate(()=>S.membros.length===3),'os membros acrescentados aparecem nas listas');
  ok(await pg.evaluate(()=>!!S.settings.membroEuId),'e a app sabe qual deles sou eu, pela conta');

  await pg.reload({waitUntil:'load'});
  await esperaApp(pg);
  ok(!(await pg.$('#loginScr')),'a sessão aguenta o recarregar — não volta a pedir password');

  await pg.click('.tabbar button[data-tab="config"]');
  await pg.waitForSelector('#cSair');
  ok(true,'Definições tem "Terminar sessão"');
  ok(erros.length===0,'sem erros de página ('+erros.join(' | ')+')');
  await ctx.close();
}

console.log('\n[E1-E5] acessibilidade');
{
  const ctx=await browser.newContext();const pg=await ctx.newPage();
  await arranca(pg);await garanteEquipa(pg);
  ok(await pg.evaluate(()=>document.querySelector('.tabbar button.on').getAttribute('aria-current')==='page'),'o separador ativo é anunciado (aria-current)');
  await pg.click('.tabbar button[data-tab="despesas"]');
  ok(await pg.evaluate(()=>document.querySelectorAll('.tabbar button[aria-current]').length===1),'só um separador de cada vez');
  ok(await pg.evaluate(()=>document.querySelector('#fab').getAttribute('aria-label')==='Adicionar despesa ou receita'),'o botão + diz o que adiciona em cada separador');
  ok(await pg.evaluate(()=>document.querySelector('.chip.on').getAttribute('aria-pressed')==='true'),'os filtros dizem se estão ativos (aria-pressed)');
  await criaJogo(pg,'j2');
  await pg.click('.tabbar button[data-tab="resumo"]');
  await pg.waitForSelector('#chart');
  const alt=await pg.getAttribute('#chart','aria-label');
  ok(await pg.getAttribute('#chart','role')==='img'&&/Setembro/.test(alt||''),'o gráfico tem descrição textual ('+(alt||'').slice(0,48)+'…)');
  // Os botões só de ícone vivem no formulário do jogo (remover uma pessoa da
  // nomeação); as Definições passaram a usar botões com texto, que é melhor.
  await pg.click('.tabbar button[data-tab="jogos"]');
  await pg.click('#fab');
  await pg.waitForSelector('.atr .iconbtn');
  const alvo=await pg.evaluate(()=>{const r=document.querySelector('.atr .iconbtn').getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height)};});
  ok(alvo.w>=44&&alvo.h>=44,'os botões de ícone têm 44×44 ('+alvo.w+'×'+alvo.h+')');
  await pg.evaluate(()=>document.querySelector('#dlg').close());
  await pg.click('.tabbar button[data-tab="config"]');
  await pg.waitForSelector('#cSair');
  const semNome=await pg.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>!b.textContent.replace(/[\s✎✕📅⚠✓☁]/gu,'').trim()&&!b.getAttribute('aria-label')).length);
  ok(semNome===0,'nenhum botão só com ícone ficou sem nome acessível ('+semNome+')');
  await ctx.close();
}

console.log('\n[C1] vírgula decimal nos valores em euros');
{
  const ctx=await browser.newContext({viewport:{width:375,height:812}});
  const pg=await ctx.newPage();
  const erros=[];pg.on('pageerror',e=>erros.push(String(e).split('\n')[0]));
  await arranca(pg);await garanteEquipa(pg);
  await pg.click('#fab');
  await pg.waitForSelector('#fSave');
  await pg.click('.atr details summary');            // "Valor manual" passou a estar recolhido
  await pg.click('.atr [data-f="override"]');
  await pg.keyboard.type('12,50');
  await pg.waitForTimeout(150);
  const r=await pg.evaluate(()=>({campo:document.querySelector('.atr [data-f="override"]').value,
    total:document.querySelector('#fTot').textContent}));
  ok(r.campo==='12,50','a vírgula fica no campo tal como foi escrita ("'+r.campo+'")');
  ok(/^12,50/.test(r.total.trim()),'e o total lê 12,50 € — antes lia 1250,00 € ('+r.total.trim()+')');

  // Teclado numérico no telemóvel, apesar de já não ser type=number — foi essa
  // troca que permitiu escrever a vírgula. O campo dos km só aparece quando a
  // regra de deslocação é por km, por isso muda-se para Nacional para o ver.
  const im=await pg.evaluate(()=>({
    decimais:[...document.querySelectorAll('#dlg input[inputmode="decimal"]')].length,
    numeros:[...document.querySelectorAll('#dlg input[type="number"]')].length
  }));
  ok(im.decimais>=1&&im.numeros===0,
     'os campos de valores abrem teclado numérico sem serem type=number ('+JSON.stringify(im)+')');
  await pg.selectOption('#fTipo','Nacional');
  await pg.waitForTimeout(250);
  const km=await pg.evaluate(()=>{const e=document.querySelector('.atr [data-f="km"]');
    return e?e.getAttribute('inputmode'):'(sem campo de km)';});
  ok(km==='decimal','o campo dos km também ('+km+')');

  // guardar normaliza para número (de volta ao Distrital, que é onde está o escalão)
  await pg.selectOption('#fTipo','Distrital');
  await pg.waitForTimeout(250);
  await pg.selectOption('#fEscSel','sub 14 IN');await pg.fill('#fEqA','A');await pg.fill('#fEqB','B');
  await pg.click('#fSave');
  await pg.waitForSelector('.card .teams');
  const g=await pg.evaluate(()=>S.jogos[0].atribuicoes[0].override);
  ok(g===12.5,'fica guardado como número 12.5, não como texto ('+JSON.stringify(g)+')');
  const lista=await pg.textContent('#main');
  ok(/12,50/.test(lista),'e a lista mostra 12,50 €');

  // um valor impossível é recusado com uma mensagem que diz como corrigir
  await pg.click('.tabbar button[data-tab="despesas"]');
  await pg.click('#fab');
  await pg.waitForSelector('#dSave');
  await pg.fill('#dC','Equipamento');
  await pg.click('#dV'); await pg.keyboard.type('abc');
  await pg.click('#dSave');
  await pg.waitForTimeout(200);
  const t=await pg.textContent('#toast');
  ok(/v[ií]rgula/i.test(t),'e o erro diz como escrever ("'+t.trim()+'")');
  ok(await pg.evaluate(()=>document.querySelector('#dlg').open),'o formulário fica aberto, sem perder o preenchimento');
  ok(erros.length===0,'sem erros de página ('+erros.join(' | ')+')');
  await ctx.close();
}

console.log('\n[I2/I3] toque e confirmação de gravado');
{
  const ctx=await browser.newContext({viewport:{width:375,height:812}});
  const pg=await ctx.newPage();
  await arranca(pg);await garanteEquipa(pg);
  const peq=await pg.evaluate(()=>[...document.querySelectorAll('.chip,.btn.sm,.iconbtn,.tabbar button')]
    .filter(e=>e.offsetParent!==null)
    .map(e=>({t:(e.textContent||e.id).trim().slice(0,18),h:Math.round(e.getBoundingClientRect().height)}))
    .filter(x=>x.h<44));
  ok(peq.length===0,'nenhum controlo de uso frequente abaixo de 44 px ('+JSON.stringify(peq.slice(0,4))+')');
  const ind=await pg.evaluate(()=>{const e=document.querySelector('#hSync');return {escondido:e.hidden,txt:e.textContent};});
  // "só aqui" acabou: já não existe modo local. O indicador passou a dizer o
  // papel de quem está a usar — editar ou só consultar.
  ok(ind.escondido===false&&/✏️|👀/.test(ind.txt),'o cabeçalho diz sempre se posso editar ou só consultar ("'+ind.txt+'")');
  await pg.click('#fab');
  await pg.selectOption('#fEscSel','sub 14 IN');await pg.fill('#fEqA','X');await pg.fill('#fEqB','Y');
  await pg.click('#fSave');
  await pg.waitForTimeout(250);
  ok(/guardado/.test(await pg.textContent('#hSync')),'e depois de gravar mostra "✓ guardado" num sítio fixo');
  await ctx.close();
}

console.log('\n[I4/I5] formulário de jogo');
{
  const ctx=await browser.newContext({viewport:{width:375,height:812}});
  const pg=await ctx.newPage();
  const erros=[];pg.on('pageerror',e=>erros.push(String(e).split('\n')[0]));
  await arranca(pg);await garanteEquipa(pg);

  await pg.click('#fab');
  await pg.waitForSelector('#fEscSel');
  const sel=await pg.evaluate(()=>[...document.querySelectorAll('#fEscSel option')].map(o=>o.value));
  ok(sel.length>2&&sel.includes('__outro'),'o escalão é uma lista do que existe na tabela, com escape para "Outro"');
  ok(await pg.evaluate(()=>getComputedStyle(document.querySelector('#fEsc')).display==='none'),'a caixa de texto só aparece em "Outro"');
  await pg.selectOption('#fEscSel','__outro');
  await pg.waitForTimeout(150);
  ok(await pg.evaluate(()=>getComputedStyle(document.querySelector('#fEsc')).display!=='none'),'e aparece quando se escolhe "Outro"');

  // mudar o tipo muda os escalões possíveis
  await pg.selectOption('#fTipo','Nacional');
  await pg.waitForTimeout(200);
  const nac=await pg.evaluate(()=>[...document.querySelectorAll('#fEscSel option')].map(o=>o.value).filter(v=>v!=='__outro'));
  ok(nac.every(e=>/Sub 1[579]|Fem/.test(e)),'mudar para Nacional mostra só os escalões nacionais ('+nac.join(', ')+')');

  // o pagamento saiu da frente
  ok(await pg.evaluate(()=>!!document.querySelector('#fMais')&&!document.querySelector('#fMais').open),'estado e pagamento ficam recolhidos num jogo novo');
  ok(await pg.evaluate(()=>getComputedStyle(document.querySelector('#fLoc')).display!=='none'),'mas o campo fica à vista, porque é ele que traz os km');

  // rótulos ligados aos campos
  const semLabel=await pg.evaluate(()=>[...document.querySelectorAll('#dlg label')]
    .filter(l=>!l.getAttribute('for')&&!l.querySelector('input,select,textarea')).length);
  ok(semLabel===0,'todos os rótulos do formulário estão ligados ao seu campo ('+semLabel+' por ligar)');
  const focaPeloRotulo=await pg.evaluate(()=>{
    const l=[...document.querySelectorAll('#dlg label')].find(x=>x.getAttribute('for'));
    l.click();
    return document.activeElement.id===l.getAttribute('for');
  });
  ok(focaPeloRotulo,'tocar no rótulo foca o campo');
  await pg.evaluate(()=>document.querySelector('#dlg').close());

  console.log('\n[I5] o jogo seguinte já vem preenchido');
  await pg.evaluate(()=>{
    S.jogos=[{id:"mold",epocaId:epAtiva().id,data:"2025-09-20",hora:"15:00",escalao:"sub 16 JUV",
      equipaA:"A",equipaB:"B",local:"",tipo:"Distrital",estado:"realizado",valorRecebido:"",dataPagamento:"",
      atribuicoes:[{membroId:S.membros[0].id,funcao:"A",almocoId:"",km:"",deslocFixa:"1",override:""},
                   {membroId:S.membros[2].id,funcao:"AA",almocoId:"",km:"",deslocFixa:"1",override:""}]}];
    render();
  });
  await pg.click('#fab');
  await pg.waitForSelector('#fEscSel');
  const m=await pg.evaluate(()=>({
    escalao:document.querySelector('#fEscSel').value,
    pessoas:[...document.querySelectorAll('.atr [data-f="membroId"]')].map(s=>s.value),
    funcoes:[...document.querySelectorAll('.atr [data-f="funcao"]')].map(s=>s.value),
    total:document.querySelector('#fTot').textContent
  }));
  const esperado=await pg.evaluate(()=>[S.membros[0].id,S.membros[2].id]);
  ok(m.escalao==='sub 16 JUV','repete o escalão do último jogo do mesmo tipo');
  ok(JSON.stringify(m.pessoas)===JSON.stringify(esperado),'e a equipa que apitou o último');
  ok(JSON.stringify(m.funcoes)===JSON.stringify(['A','AA']),'com as mesmas funções');
  ok(!/^0,00/.test(m.total.trim()),'o valor já aparece calculado antes de guardar ('+m.total.trim()+')');
  ok(erros.length===0,'sem erros de página ('+erros.join(' | ')+')');
  await ctx.close();
}

console.log('\n[D] Definições');
{
  const ctx=await browser.newContext({viewport:{width:375,height:812}});
  const pg=await ctx.newPage();
  const erros=[];pg.on('pageerror',e=>erros.push(String(e).split('\n')[0]));
  await arranca(pg);await garanteEquipa(pg);
  await pg.click('.tabbar button[data-tab="config"]');
  await pg.waitForSelector('#cEpoca');

  ok(!(await pg.$('#cSave')),'acabou o botão "Guardar definições", que só guardava quatro campos');
  ok(!(await pg.$('#cAno')),'o ano deixou de ser um campo — sai do nome da época');
  ok(/setembro de 2025 a junho de 2026/i.test(await pg.textContent('#cEpInfo')),'e a app diz que meses a época abrange');

  // renomear grava sozinho e acerta o ano
  await pg.fill('#cEpoca','2026/27');
  await pg.dispatchEvent('#cEpoca','change');
  await pg.waitForTimeout(250);
  const epo=await pg.evaluate(()=>({nome:epAtiva().nome,ano:epAtiva().anoInicio}));
  ok(epo.nome==='2026/27'&&epo.ano===2026,'renomear a época grava sozinho e acerta o ano ('+JSON.stringify(epo)+')');

  // O "sou este membro" desapareceu: quem eu sou passa a vir da conta, e não
  // de uma escolha que se podia esquecer (era a origem do aviso amarelo).
  await pg.click('.tabbar button[data-tab="config"]');
  await pg.waitForSelector('#cNome');
  ok(!(await pg.$('#cEu')),'acabou o "sou este membro" — a conta já diz quem sou');
  ok(await pg.evaluate(()=>!!S.settings.membroEuId),'e a app sabe-o sem ninguém escolher nada');
  ok(/responsável/i.test(await pg.textContent('#main')),'as Definições dizem que papel tenho na equipa');

  // procurar na tabela de valores
  await pg.fill('#cBuscaT','sub 14');
  await pg.waitForTimeout(300);
  const linhas=await pg.evaluate(()=>[...document.querySelectorAll('[data-editt]')].length);
  const todas=await pg.evaluate(()=>S.tabela.filter(daEpoca).length);
  ok(linhas>0&&linhas<todas,'a procura filtra a tabela ('+linhas+' de '+todas+')');
  ok(await pg.evaluate(()=>document.activeElement.id==='cBuscaT'),'e o campo não perde o foco a cada tecla');
  await pg.fill('#cBuscaT','zzzz');
  await pg.waitForTimeout(300);
  ok(/Nenhuma tarifa encontrada/.test(await pg.textContent('#main')),'sem resultados, diz que não encontrou em vez de mostrar vazio');
  await pg.fill('#cBuscaT','');
  await pg.waitForTimeout(300);

  // índice
  ok((await pg.$$('[data-ir]')).length>=6,'há um índice para saltar entre secções');

  // apagar continua afastado de editar e com cor diferente
  const dist=await pg.evaluate(()=>{
    const ed=document.querySelector('[data-editm]'), del=document.querySelector('[data-delm]');
    if(!ed||!del)return null;
    const a=ed.getBoundingClientRect(), b=del.getBoundingClientRect();
    return {folga:Math.round(b.left-a.right), corDiferente:getComputedStyle(ed).color!==getComputedStyle(del).color};
  });
  ok(!!dist&&dist.corDiferente,'apagar está separado de editar e com cor diferente');
  ok(erros.length===0,'sem erros de página ('+erros.join(' | ')+')');
  await ctx.close();
}

console.log('\n[E4] contraste do texto secundário');
{
  for(const esquema of ['light','dark']){
    const ctx=await browser.newContext({colorScheme:esquema});
    const pg=await ctx.newPage();await pg.goto(B);
    const c=await pg.evaluate(()=>{
      const cs=getComputedStyle(document.documentElement);
      const hex=n=>cs.getPropertyValue(n).trim();
      const lum=h=>{const v=[1,3,5].map(i=>parseInt(h.substr(i,2),16)/255).map(x=>x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4));return .2126*v[0]+.7152*v[1]+.0722*v[2];};
      const cr=(a,b)=>{const l1=lum(a),l2=lum(b);return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);};
      return {mutCard:cr(hex('--mut'),hex('--card')),mutCard2:cr(hex('--mut'),hex('--card2'))};
    });
    ok(c.mutCard>=4.5&&c.mutCard2>=4.5,`tema ${esquema}: texto secundário acima de 4.5:1 (${c.mutCard.toFixed(2)} e ${c.mutCard2.toFixed(2)})`);
    await ctx.close();
  }
}

await browser.close();
console.log('\n'+(falhas?('❌ '+falhas+' falha(s)'):'✅ todos os testes passaram'));
process.exit(falhas?1:0);
