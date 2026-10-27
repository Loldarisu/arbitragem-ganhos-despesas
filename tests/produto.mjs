import { chromium } from 'playwright';
import { arranca, garanteEquipa } from './comum.mjs';
const B=process.env.APP_URL||'http://localhost:8099/index.html';
let falhas=0;
const ok=(c,m)=>{console.log((c?'  PASS':'  FALHA')+' · '+m); if(!c)falhas++;};

const browser=await chromium.launch();
const ctx=await browser.newContext();
const pg=await ctx.newPage();
const erros=[];pg.on('pageerror',e=>erros.push(String(e).split('\n')[0]));
await arranca(pg);await garanteEquipa(pg);

console.log('\n[G8] Art. 19 no regulamento, mas fora do seletor');
{
  ok(await pg.evaluate(()=>S.artigos.some(a=>a.num===19&&a.regra===true)),'o Art. 19 passou a constar da lista, marcado como regra');
  await pg.click('.tabbar button[data-tab="multas"]');
  await pg.click('#fab');
  await pg.waitForSelector('#uA');
  const ops=await pg.evaluate(()=>[...document.querySelectorAll('#uA option')].map(o=>o.textContent));
  ok(!ops.some(o=>/Art\. 19/.test(o)),'não aparece como infração a escolher (não é uma multa, é a regra da reincidência)');
  ok(ops.some(o=>/Art\. 6/.test(o)),'as infrações a sério continuam lá');
  await pg.click('#uCancel');
}

console.log('\n[G2] o fundo passa a poder descer');
{
  await pg.evaluate(()=>{
    S.multas=[{id:"m1",epocaId:epAtiva().id,membroId:S.membros[0].id,data:"2025-10-01",artigoId:"art3",descricao:"",valor:20,pago:true},
              {id:"m2",epocaId:epAtiva().id,membroId:S.membros[1].id,data:"2025-10-02",artigoId:"art3",descricao:"",valor:5,pago:false}];
    S.fundo=[];render();
  });
  let t=await pg.textContent('#main');
  ok(/Fundo disponível/.test(t)&&/20,00/.test(t),'saldo começa nas entradas (20 €)');
  await pg.click('#addF');
  await pg.waitForSelector('#fD');
  await pg.fill('#fD','Jantar de fim de época');
  await pg.fill('#fV','12.50');
  await pg.click('#fSav');
  await pg.waitForTimeout(250);
  t=await pg.textContent('#main');
  ok(await pg.evaluate(()=>S.fundo.length===1),'o gasto ficou registado');
  ok(/7,50/.test(t),'o saldo desceu para 7,50 € (20 − 12,50)');
  ok(/Jantar de fim de época/.test(t),'e aparece na lista de gastos');
  ok(/Multas pagas \(entradas\)/.test(t)&&/Gastos do fundo \(saídas\)/.test(t),'entradas e saídas ficam separadas');
}

console.log('\n[G7] convocatórias fora do formato');
{
  const r=await pg.evaluate(()=>{
    const estruturada=parseConv("1128030020 INI#CD 1 Div Sub/15#UD Fermedo*UD Mourisquense#CAMPO DA JUNTA 20/09/2025 15:00 AA1-A Nunes AA2-X Brito");
    const livre=parseConvLivre("Jogo de sábado 20/09/2025 às 15:00 — UD Fermedo vs UD Mourisquense, Sub/15, AA1-A Nunes AA2-X Brito");
    const lixo=parseConv("bom dia, alguém disponível?")||parseConvLivre("bom dia, alguém disponível?");
    return {estruturada,livre,lixo};
  });
  ok(r.estruturada&&r.estruturada.equipaA==='UD Fermedo','o formato conhecido continua a funcionar');
  ok(r.livre&&r.livre.equipaA==='UD Fermedo'&&r.livre.equipaB==='UD Mourisquense','mensagem em texto livre também é lida');
  ok(r.livre.data==='2025-09-20'&&r.livre.hora==='15:00','com data e hora certas ('+r.livre.data+' '+r.livre.hora+')');
  ok(r.livre.nomeacoes.length===2,'e as duas nomeações ('+JSON.stringify(r.livre.nomeacoes.map(n=>n.papel))+')');
  ok(r.lixo===null,'uma mensagem que não é convocatória continua a não passar');

  await pg.click('.tabbar button[data-tab="jogos"]');
  await pg.click('#btnConv');
  await pg.waitForSelector('#cvTxt');
  await pg.fill('#cvTxt','bom dia, alguém disponível para domingo?');
  await pg.click('#cvGo');
  await pg.waitForTimeout(250);
  ok(await pg.evaluate(()=>S.convFalhadas.length===1),'a mensagem que falhou ficou guardada');
  await pg.click('#cvCancel');
  await pg.click('.tabbar button[data-tab="config"]');
  const c=await pg.textContent('#main');
  ok(/Convocatórias por ler/.test(c)&&/alguém disponível/.test(c),'e aparece em Definições para afinar depois');
}

console.log('\n[C2] a tabela de valores deixa de reescrever o passado');
{
  await pg.click('.tabbar button[data-tab="jogos"]');
  const r=await pg.evaluate(async()=>{
    S.jogos=[{id:"fz1",epocaId:epAtiva().id,data:"2025-09-20",hora:"15:00",escalao:"sub 14 IN",
      equipaA:"Congelado",equipaB:"B",local:"",tipo:"Distrital",estado:"pago",valorRecebido:"",dataPagamento:"",
      atribuicoes:[{membroId:S.membros[0].id,funcao:"A",almocoId:"",km:"",override:""}]}];
    
    const congelados=congelaValoresAntigos();
    const antes=jogoTotal(S.jogos[0]);
    const guardado=S.jogos[0].atribuicoes[0].valor;
    const t=S.tabela.find(x=>x.tipo==="Distrital"&&x.escalao==="sub 14 IN"&&x.funcao==="A");
    t.valor=99; render();
    return {congelados,antes,guardado,depois:jogoTotal(S.jogos[0]),
      tabelaDaria:atrCalculado(S.jogos[0],S.jogos[0].atribuicoes[0])};
  });
  ok(r.congelados===1,'um jogo antigo foi congelado no arranque');
  ok(r.guardado===23,'com o valor que a app já mostrava (23 €), sem ninguém ver números mudar');
  ok(r.depois===r.antes,'mudar a tarifa para 99 € já não mexe no jogo já pago ('+r.antes+' → '+r.depois+')');
  ok(r.tabelaDaria===99,'mas a app sabe que a tabela agora daria outro valor');
  const txt=await pg.textContent('#main');
  ok(/A tabela atual daria/.test(txt),'e diz isso no cartão do jogo, em vez de mudar sozinha');

  // atualizar é uma escolha explícita
  await pg.click('[data-retab]');
  await pg.waitForSelector('#c2Sim');
  await pg.click('#c2Sim');
  await pg.waitForTimeout(300);
  ok(await pg.evaluate(()=>jogoTotal(S.jogos[0])===99),'quem quiser atualizar, atualiza — com confirmação');

  // editar um campo do cálculo recalcula; editar as equipas não
  const r2=await pg.evaluate(()=>{
    const j=S.jogos[0];
    j.equipaA="Só mudei o nome";
    const k=chaveCalculo(j,j.atribuicoes[0]);
    const igual=(j.atribuicoes[0].calcKey===k);
    j.atribuicoes[0].funcao="AA";
    const mudou=(j.atribuicoes[0].calcKey!==chaveCalculo(j,j.atribuicoes[0]));
    return {igual,mudou};
  });
  ok(r2.igual,'mudar as equipas não conta como mudança de cálculo');
  ok(r2.mudou,'mudar a função conta, e nesse caso recalcula');
}

console.log('\n[B1] a caixa da convocatória abre vazia');
{
  await pg.click('.tabbar button[data-tab="jogos"]');
  await pg.click('#btnConv');
  await pg.waitForSelector('#cvTxt');
  const v=await pg.inputValue('#cvTxt');
  ok(v==='','abre vazia — antes aparecia "[object PointerEvent]" ("'+v+'")');
  await pg.click('#cvCancel');
}

console.log('\n[B2] "Confirmar nomeação" e "Marcar horas" sobrevivem a recarregar');
{
  await pg.evaluate(async()=>{
    for(const r of [...S.jogos]) await apagaNaBD('jogos',r.id);
    const d=new Date(Date.now()+4*86400000).toISOString().slice(0,10);
    await guardaJogo({id:criaId(),epocaId:S.epocas[0].id,data:d,hora:'15:00',tipo:'Distrital',
      escalao:'sub 16 JUV',equipaA:'Lembrete',equipaB:'B',local:'',estado:'agendado',
      atribuicoes:[{id:criaId(),membroId:S.settings.membroEuId,funcao:'AA',almocoId:'',km:'',override:'',valor:19.5,calcKey:''}]});
    await recarrega(true); mesSel='all'; render();
  });
  await pg.click('.tabbar button[data-tab="jogos"]');
  await pg.waitForSelector('[data-tick]');
  const n0=(await pg.$$('[data-tick]')).length;
  // cada toque redesenha o ecrã, por isso volta-se a procurar o botão de cada vez
  for(let i=0;i<n0;i++){ await pg.click('[data-tick]'); await pg.waitForTimeout(600); }
  await pg.evaluate(async()=>{ await recarrega(true); render(); });
  await pg.waitForTimeout(400);
  const n1=(await pg.$$('[data-tick]')).length;
  ok(n0===2,'aparecem os dois lembretes ('+n0+')');
  ok(n1===0,'depois de os marcar e recarregar, não voltam ('+n1+' ainda lá)');
  ok(await pg.evaluate(()=>S.jogos[0].confirmada===true&&S.jogos[0].horasMarcadas===true),
     'e ficaram gravados na base de dados, não só no ecrã');
}

console.log('\n[D1] deslocação de valor fixo (o caso do irmão: 15 € por jogo do Distrital)');
{
  await pg.evaluate(async()=>{
    for(const r of [...S.jogos]) await apagaNaBD('jogos',r.id);
    const e=epAtiva(); e.deslocacoes=[{tipo:'Distrital',modo:'fixo',valor:15},{tipo:'Nacional',modo:'km',valor:0.36}];
    await guarda('epocas',e); await recarrega(true); mesSel='all'; render();
  });
  await pg.click('.tabbar button[data-tab="jogos"]');
  await pg.click('#fab');
  await pg.waitForSelector('#fSave');
  await pg.selectOption('#fTipo','Distrital'); await pg.waitForTimeout(200);
  await pg.selectOption('#fEscSel','sub 16 JUV'); await pg.waitForTimeout(200);
  // A deslocação é do chefe (o árbitro principal): um assistente sozinho não a leva.
  const aa=await pg.evaluate(()=>document.querySelector('.atr [data-f="deslocFixa"]')?.value);
  ok(aa==='','um assistente não leva a deslocação por omissão');
  await pg.selectOption('.atr [data-f="funcao"]','A'); await pg.waitForTimeout(200);
  const f=await pg.evaluate(()=>({
    sel:document.querySelector('.atr [data-f="deslocFixa"]')?.value,
    km:!!document.querySelector('.atr [data-f="km"]'),
    tot:document.querySelector('#fTot').textContent}));
  ok(f.sel==='1','passar a árbitro principal marca a deslocação fixa');
  ok(!f.km,'e não pede km, que aqui não contam');
  ok(/39,00/.test(f.tot),'o total leva os 15 €: 24,00 + 15,00 ('+f.tot.trim()+')');
  await pg.fill('#fEqA','Fixo FC'); await pg.fill('#fEqB','B');
  await pg.click('#fSave');
  await pg.waitForTimeout(900);
  await pg.evaluate(async()=>{ await recarrega(true); render(); });
  await pg.waitForTimeout(300);
  const d=await pg.evaluate(()=>{const a=S.jogos[0].atribuicoes[0];return {fixa:a.deslocFixa,v:atrFinal(S.jogos[0],a)};});
  ok(d.fixa==='1','depois de recarregar continua "Sim" — antes voltava a "Não"');
  ok(Math.abs(d.v-39)<0.005,'e o valor continua com os 15 € ('+d.v+')');
  // reabrir e gravar sem mexer não pode tirar os 15 €
  await pg.click('.card [data-act="edit"]');
  await pg.waitForSelector('#fSave');
  await pg.click('#fSave');
  await pg.waitForTimeout(900);
  await pg.evaluate(async()=>{ await recarrega(true); render(); });
  const d2=await pg.evaluate(()=>atrFinal(S.jogos[0],S.jogos[0].atribuicoes[0]));
  ok(Math.abs(d2-39)<0.005,'reabrir e gravar outra vez não tira os 15 € ('+d2+')');
}

console.log('\n[D2] deslocação fixa que muda com o escalão (as regras do irmão)');
{
  await pg.evaluate(async()=>{
    const e=epAtiva();
    e.deslocacoes=[
      {tipo:'Distrital',escaloes:['1ª divisão','2ª divisão'],modo:'fixo',valor:33},
      {tipo:'Distrital',escaloes:['sub 23/vet'],modo:'fixo',valor:23},
      {tipo:'Distrital',escaloes:['Sub 19 JUN'],modo:'fixo',valor:21},
      {tipo:'Distrital',escaloes:[],modo:'fixo',valor:14},
      {tipo:'Nacional',escaloes:[],modo:'km',valor:0.36},
      // a regra tal como foi criada na versão antiga: tipo inventado
      {tipo:'Distrital Senior',modo:'fixo',valor:33}];
    await guarda('epocas',e); await recarrega(true);
  });
  const r=await pg.evaluate(()=>['1ª divisão','2ª divisão','sub 23/vet','Sub 19 JUN','sub 16 JUV','sub 10 BEM']
    .map(esc=>{const d=deslocRule('Distrital',esc);return esc+'='+(d?d.valor:'—');}).join(' | '));
  ok(/1ª divisão=33/.test(r)&&/2ª divisão=33/.test(r),'seniores: 33 € ('+r+')');
  ok(/sub 23\/vet=23/.test(r),'sub 23: 23 €');
  ok(/Sub 19 JUN=21/.test(r),'juniores: 21 €');
  ok(/sub 16 JUV=14/.test(r)&&/sub 10 BEM=14/.test(r),'os restantes caem na regra geral: 14 €');
  ok(await pg.evaluate(()=>deslocRule('Nacional','Sub 17').modo==='km'),'o Nacional continua por km');

  // num jogo novo, o valor segue o escalão escolhido
  await pg.click('.tabbar button[data-tab="jogos"]');
  await pg.click('#fab'); await pg.waitForSelector('#fSave');
  await pg.selectOption('#fTipo','Distrital'); await pg.waitForTimeout(150);
  await pg.selectOption('.atr [data-f="funcao"]','A'); await pg.waitForTimeout(150);   // o transporte é do chefe
  const tot=async e=>{await pg.selectOption('#fEscSel',e);await pg.waitForTimeout(200);
    return pg.evaluate(()=>document.querySelector('.atr .calc').textContent);};
  ok(/desloc\. 33,00/.test(await tot('1ª divisão')),'no formulário, 1ª divisão soma 33 € de deslocação');
  ok(/desloc\. 14,00/.test(await tot('sub 16 JUV')),'e ao mudar para juvenis passa a 14 €');
  ok(/desloc\. 21,00/.test(await tot('Sub 19 JUN')),'e juniores 21 €');
  await pg.click('#fCancel');

  // a regra antiga é assinalada, e editar propõe a correção
  await pg.click('.tabbar button[data-tab="config"]');
  await pg.waitForTimeout(300);
  const t=await pg.textContent('#main');
  ok(/Não há jogos do tipo "Distrital Senior"/.test(t),'a regra com tipo inventado aparece assinalada');
  await pg.evaluate(()=>{const b=[...document.querySelectorAll('[data-editd]')].pop();b.click();});
  await pg.waitForSelector('#dlT2');
  const f=await pg.evaluate(()=>({tipo:document.querySelector('#dlT2').value,
    aviso:document.querySelector('#dlg .warn')?.textContent||'',
    esc:[...document.querySelectorAll('#dlEsc input')].length,
    livre:document.querySelector('#dlT2').tagName}));
  ok(f.livre==='SELECT','o tipo de jogo já não é texto livre');
  ok(f.tipo==='Distrital','ao editar, propõe "Distrital" a partir de "Distrital Senior"');
  ok(/nunca se aplicou/.test(f.aviso),'e explica porque é que nunca contou');
  ok(f.esc>0,'com os escalões do Distrital para marcar');
  await pg.click('#dlCancel');
}

console.log('\n[P2] colar as convocatórias reais, ponta a ponta');
{
  // Distrital da Guarda: traz o árbitro e o AA1, e EU venho no cabeçalho como AA2.
  await pg.evaluate(async()=>{ for(const r of [...S.jogos]) await apagaNaBD('jogos',r.id); await recarrega(true); });
  await pg.click('.tabbar button[data-tab="jogos"]');
  await pg.click('#btnConv');
  await pg.waitForSelector('#cvTxt');
  await pg.fill('#cvTxt','2322 114010120 AA2 JUV#CD JUV#Guarda Unid.*V.Formoso#CAMPO ZAMBITO<GUARDA>15/02/2026 10:00 A-B Lima900000011 AA1-T ROSA900000012');
  await pg.click('#cvGo');
  await pg.waitForSelector('#fSave');
  const g=await pg.evaluate(()=>({
    data:document.querySelector('#fData').value,
    hora:document.querySelector('#fHora').value,
    tipo:document.querySelector('#fTipo').value,
    esc:document.querySelector('#fEscSel').value,
    a:document.querySelector('#fEqA').value,
    b:document.querySelector('#fEqB').value,
    loc:document.querySelector('#fLoc').value,
    funcoes:[...document.querySelectorAll('.atr select')].map(s=>s.value).filter(v=>['A','AA','1 arb','2 arb'].includes(v)),
    nlinhas:document.querySelectorAll('.atr').length
  }));
  ok(g.data==='2026-02-15'&&g.hora==='10:00','lê a data e a hora ('+g.data+' '+g.hora+')');
  ok(g.tipo==='Distrital'&&g.esc==='sub 16 JUV','lê a competição e o escalão ('+g.tipo+' / '+g.esc+')');
  ok(g.a==='Guarda Unid.'&&g.b==='V.Formoso','lê os dois clubes');
  ok(g.loc==='CAMPO ZAMBITO (GUARDA)','lê o campo com a localidade ('+g.loc+')');
  ok(g.nlinhas===3,'monta o trio: os dois nomeados mais eu ('+g.nlinhas+' linhas)');
  ok(g.funcoes.filter(f=>f==='A').length===1,'um árbitro só — antes metia-me a mim como segundo árbitro');
  ok(g.funcoes.filter(f=>f==='AA').length===2,'e dois assistentes');
  await pg.click('#fCancel');

  // Nacional: não traz nomes nenhuns. Tem de aproveitar o trio do último.
  await pg.evaluate(async()=>{
    const eu=S.settings.membroEuId;
    await guardaJogo({id:criaId(),epocaId:S.epocas[0].id,data:'2025-09-06',hora:'11:00',
      tipo:'Nacional',escalao:'Sub 17',equipaA:'X',equipaB:'Y',local:'',estado:'realizado',
      atribuicoes:[{id:criaId(),membroId:S.membros[1].id,funcao:'A',almocoId:'',km:'',override:'',valor:0,calcKey:''},
                   {id:criaId(),membroId:eu,funcao:'AA',almocoId:'',km:'',override:'',valor:0,calcKey:''},
                   {id:criaId(),membroId:S.membros[2].id,funcao:'AA',almocoId:'',km:'',override:'',valor:0,calcKey:''}]});
    await recarrega(true);
  });
  await pg.click('#btnConv');
  await pg.waitForSelector('#cvTxt');
  await pg.fill('#cvTxt','5549 341020170 CN S17 II DIV#CD Tondela*UD Oliveirense#Campo Corte<CAMPO BESTEIROS>19/09/2026 11:00');
  await pg.click('#cvGo');
  await pg.waitForSelector('#fSave');
  const n=await pg.evaluate(()=>({
    tipo:document.querySelector('#fTipo').value,
    esc:document.querySelector('#fEscSel').value,
    a:document.querySelector('#fEqA').value,
    nlinhas:document.querySelectorAll('.atr').length
  }));
  ok(n.tipo==='Nacional'&&n.esc==='Sub 17','o Nacional é reconhecido como Nacional ('+n.tipo+' / '+n.esc+')');
  ok(n.a==='CD Tondela','com os clubes certos');
  ok(n.nlinhas===3,'e o trio do último jogo do Nacional, já que a mensagem não traz nomes ('+n.nlinhas+')');
  await pg.click('#fCancel');
}

console.log('\n[P1] pagamentos: uma folha por mês E por competição');
{
  // A associação paga ao fim do mês, a cada árbitro, e manda uma folha por
  // competição. Dois jogos no mesmo mês, um Distrital e outro Nacional, têm de
  // dar DUAS folhas — e marcar uma paga não pode marcar a outra.
  await pg.evaluate(async()=>{
    for(const r of [...S.jogos]) await apagaNaBD('jogos',r.id);
    for(const r of [...S.pagamentos]) await apagaNaBD('pagamentos',r.id);
    const eu=S.settings.membroEuId;
    const mk=(tipo,escalao,valor,dia)=>({id:criaId(),epocaId:S.epocas[0].id,
      data:'2025-10-'+dia,hora:'15:00',tipo,escalao,equipaA:tipo+' A',equipaB:'B',
      local:'',estado:'realizado',valorRecebido:'',dataPagamento:'',
      atribuicoes:[{id:criaId(),membroId:eu,funcao:'AA',almocoId:'',km:'',override:'',valor,calcKey:''}]});
    await guardaJogo(mk('Distrital','sub 14 IN',18.5,'04'));
    await guardaJogo(mk('Distrital','1ª divisão',33,'11'));
    await guardaJogo(mk('Nacional','Sub 17',47.5,'18'));
    await recarrega(true);
    mesRes='all'; membroSel=S.settings.membroEuId; render();
  });
  await pg.click('.tabbar button[data-tab="resumo"]');
  await pg.waitForTimeout(400);
  let t=await pg.textContent('#main');
  ok(/Outubro 2025 · Distrital/.test(t),'aparece a folha do Distrital');
  ok(/Outubro 2025 · Nacional/.test(t),'e a folha do Nacional, em separado');
  ok(/51,50/.test(t),'a do Distrital soma os dois jogos do mês (18,50 + 33,00)');
  ok(/47,50/.test(t),'a do Nacional só tem o dela');
  ok(!/⏳ 99,00/.test(t),'e nunca são somadas numa só');

  // conferir a folha do Distrital: tem de listar os jogos, para bater com a folha
  const botoes=await pg.$$('[data-pgadd]');
  ok(botoes.length===2,'há um botão de conferir por folha ('+botoes.length+')');
  const alvo=await pg.evaluate(()=>[...document.querySelectorAll('[data-pgadd]')]
    .find(b=>b.dataset.pgadd.includes('Distrital')).dataset.pgadd);
  await pg.evaluate(k=>[...document.querySelectorAll('[data-pgadd]')]
    .find(b=>b.dataset.pgadd===k).click(), alvo);
  await pg.waitForSelector('#pgV');
  const dlg=await pg.textContent('#dlg');
  ok(/sub 14 IN/.test(dlg)&&/1ª divisão/.test(dlg),'a folha mostra os jogos um a um, para conferires');
  ok(/18,50/.test(dlg)&&/33,00/.test(dlg),'com o valor de cada');
  ok(!/Sub 17/.test(dlg),'e não mete lá o jogo do Nacional');
  ok(/51,50/.test(dlg),'e o total calculado');

  // valor diferente do calculado: tem de dizer a diferença, não aceitar calado
  await pg.fill('#pgV','48,00');
  await pg.waitForTimeout(150);
  ok(/−3,50|-3,50/.test(await pg.textContent('#pgDif')),
     'se o valor não bater, mostra a diferença ('+(await pg.textContent('#pgDif')).slice(0,60)+')');
  await pg.fill('#pgV','51,50');
  await pg.waitForTimeout(150);
  ok(/bate certo/.test(await pg.textContent('#pgDif')),'e diz quando bate certo');

  await pg.click('#pgSave');
  await pg.waitForTimeout(900);
  t=await pg.textContent('#main');
  ok(/✅ 51,50/.test(t),'a folha do Distrital fica marcada como paga');
  ok(/⏳ 47,50/.test(t),'e a do Nacional continua por receber');
  ok(await pg.evaluate(()=>S.pagamentos.length===1&&S.pagamentos[0].tipo==='Distrital'),
     'ficou um pagamento gravado, com a competição');
  ok(await pg.evaluate(()=>S.jogos.every(j=>j.estado==='realizado')),
     'e nenhum jogo mudou de estado — quem foi pago foi a pessoa, não o jogo');
}

console.log('\n[G6] relatório da época');
{
  const esperado=await pg.evaluate(()=>{
    // o bloco anterior mexeu na tabela; repõe para o relatório ser previsível
    const t=S.tabela.find(x=>x.tipo==="Distrital"&&x.escalao==="sub 14 IN"&&x.funcao==="A");
    t.valor=23;
    S.jogos=[{id:"r1",epocaId:epAtiva().id,data:"2025-09-20",hora:"15:00",escalao:"sub 14 IN",equipaA:"Fermedo",equipaB:"Mourisca",
      local:"",tipo:"Distrital",estado:"pago",valorRecebido:"",dataPagamento:"",
      atribuicoes:[{membroId:S.membros[0].id,funcao:"A",almocoId:"",km:"",override:""}]}];
    S.despesas=[{id:"d1",epocaId:epAtiva().id,membroId:S.membros[0].id,data:"2025-09-21",categoria:"Equipamento",descricao:"",valor:30,tipoLanc:"despesa"}];
    render();
    return fmt(jogoTotal(S.jogos[0]));
  });
  await pg.click('.tabbar button[data-tab="resumo"]');
  await pg.waitForSelector('#relBtn');
  await pg.click('#relBtn');
  await pg.waitForSelector('#relatorio');
  const t=await pg.textContent('#relatorio');
  for(const sec of ['Por mês','Por pessoa','Por escalão','Despesas e receitas extra','Multas e fundo da equipa','Jogos da época'])
    ok(new RegExp(sec).test(t),'inclui a secção "'+sec+'"');
  ok(/Fermedo vs Mourisca/.test(t),'lista os jogos da época');
  ok(t.includes(esperado),'com os valores do jogo ('+esperado+')');
  ok(/Saldo/.test(t),'e o saldo do fundo');
  ok(await pg.isVisible('#relImp'),'tem botão de imprimir');
  const escondeEcra=await pg.evaluate(()=>{
    const s=[...document.styleSheets].flatMap(x=>{try{return [...x.cssRules];}catch(_){return [];}});
    return s.some(r=>r.conditionText==='print'||(r.media&&r.media.mediaText==='print'));
  });
  ok(escondeEcra,'existe folha de estilo de impressão que isola o relatório');
  await pg.click('#relFechar');
  ok(!(await pg.$('#relatorio')),'fechar remove o relatório');
}

ok(erros.length===0,'sem erros de página ('+erros.join(' | ')+')');
await browser.close();
console.log('\n'+(falhas?('❌ '+falhas+' falha(s)'):'✅ todos os testes passaram'));
process.exit(falhas?1:0);
