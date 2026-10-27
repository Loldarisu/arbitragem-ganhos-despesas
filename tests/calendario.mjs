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

// jogo de sábado às 15:00 → alarme da véspera às 20:00 = 19 h antes
const ics=await pg.evaluate(()=>{
  S.jogos=[{id:"j1",epocaId:epAtiva().id,data:"2025-09-20",hora:"15:00",escalao:"sub 14 IN",
    equipaA:"UD Fermedo, B",equipaB:"Mourisquense; SC",local:"Campo da Junta",tipo:"Distrital",
    estado:"agendado",valorRecebido:"",dataPagamento:"",numJogo:"1128030020",
    atribuicoes:[{membroId:S.membros[0].id,funcao:"A",almocoId:"",km:"",override:""},
                 {membroId:S.membros[1].id,funcao:"AA",almocoId:"",km:"",override:""}]}];
  S.settings.membroEuId=S.membros[0].id; 
  return icsDeJogos(S.jogos,"Época 2025/26");
});

console.log('\n[G4] estrutura do ficheiro .ics');
const linhas=ics.split('\r\n');
ok(ics.startsWith('BEGIN:VCALENDAR\r\n'),'começa em BEGIN:VCALENDAR com CRLF');
ok(ics.trimEnd().endsWith('END:VCALENDAR'),'termina em END:VCALENDAR');
ok(linhas.filter(l=>l==='BEGIN:VEVENT').length===1,'um VEVENT por jogo');
ok(linhas.includes('DTSTART:20250920T150000'),'a hora vai como hora local flutuante (sem fuso a converter)');
ok(linhas.includes('DURATION:PT2H'),'duração de 2 h');
ok(linhas.some(l=>l.startsWith('LOCATION:Campo da Junta')),'leva o campo');
ok(!linhas.some(l=>new TextEncoder().encode(l).length>75),'nenhuma linha passa dos 75 octetos (RFC 5545)');
const desdobrado=ics.replace(/\r\n /g,'');
const sum=(desdobrado.match(/^SUMMARY:.*$/m)||[''])[0];
ok(sum===String.raw`SUMMARY:A · UD Fermedo\, B vs Mourisquense\; SC`,'vírgulas e pontos-e-vírgula escapados no título ('+sum+')');
ok(/Valor estimado/.test(desdobrado),'a descrição inclui o valor estimado');

console.log('\n[G5] alarmes');
const alarmes=ics.split('BEGIN:VALARM').slice(1);
ok(alarmes.length===2,'dois alarmes: véspera e viagem ('+alarmes.length+')');
ok(/TRIGGER:-PT1140M/.test(ics),'véspera às 20h = 1140 min antes de sábado às 15h (19 h)');
ok(/TRIGGER:-PT2H/.test(ics),'e um a 2 h do apito');
ok(/Art. 4/.test(desdobrado),'o alarme diz de que artigo se trata');

// jogo de manhã: 10:00 de domingo → véspera 20:00 = 14 h antes
const ics2=await pg.evaluate(()=>icsDeJogos([{...S.jogos[0],id:"j2",data:"2025-09-21",hora:"10:00"}],"x"));
ok(/TRIGGER:-PT840M/.test(ics2),'num jogo de manhã o alarme recalcula (840 min = 14 h)');

console.log('\n[G5] lista "a tratar"');
{
  const daquiA3Dias=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
  await pg.evaluate(d=>{
    S.jogos=[{id:"jx",epocaId:epAtiva().id,criadoEm:Date.now(),data:d,hora:"15:00",escalao:"sub 14 IN",
      equipaA:"A",equipaB:"B",local:"",tipo:"Distrital",estado:"agendado",valorRecebido:"",dataPagamento:"",
      atribuicoes:[{membroId:S.membros[0].id,funcao:"A",almocoId:"",km:"",override:""}]}];
    render();
  },daquiA3Dias);
  const t=await pg.textContent('#main');
  ok(/A tratar antes do jogo/.test(t),'o cartão aparece para um jogo daqui a 3 dias');
  ok(/Confirmar nomeação/.test(t)&&/Marcar horas/.test(t),'lista as duas pendências do regulamento');
  ok(/até \d{2}\/\d{2}\/\d{4} 20:00/.test(t),'mostra o prazo das 20h da véspera ('+((t.match(/até \d{2}\/\d{2}\/\d{4} 20:00/)||[''])[0])+')');
  await pg.click('[data-tick$="|confirmada"]');
  await pg.waitForTimeout(150);
  ok(await pg.evaluate(()=>S.jogos[0].confirmada===true),'marcar como tratado fica gravado');
  const t2=await pg.textContent('#main');
  ok(!/Confirmar nomeação/.test(t2)&&/Marcar horas/.test(t2),'a pendência tratada sai da lista e a outra fica');
  await pg.click('[data-tick$="|horasMarcadas"]');
  await pg.waitForTimeout(150);
  ok(!/A tratar antes do jogo/.test(await pg.textContent('#main')),'sem pendências, o cartão desaparece');
}

console.log('\n[G5] prazo passado aparece com a multa');
{
  const ontem=new Date(Date.now()-26*3600000).toISOString().slice(0,10);
  await pg.evaluate(o=>{
    S.jogos=[{id:"jz",epocaId:epAtiva().id,criadoEm:Date.now()-3*86400000,data:new Date(Date.now()+2*86400000).toISOString().slice(0,10),
      hora:"15:00",escalao:"sub 14 IN",equipaA:"C",equipaB:"D",local:"",tipo:"Distrital",estado:"agendado",
      valorRecebido:"",dataPagamento:"",confirmada:false,horasMarcadas:true,
      atribuicoes:[{membroId:S.membros[0].id,funcao:"A",almocoId:"",km:"",override:""}]}];
    render();
  },ontem);
  const t=await pg.textContent('#main');
  ok(/prazo passou/.test(t),'assinala o prazo ultrapassado');
  ok(/Art\. 3, 2,00/.test(t),'e diz quanto custa, tirado do regulamento carregado');
}

ok(erros.length===0,'sem erros de página ('+erros.join(' | ')+')');
await browser.close();
console.log('\n'+(falhas?('❌ '+falhas+' falha(s)'):'✅ todos os testes passaram'));
process.exit(falhas?1:0);
