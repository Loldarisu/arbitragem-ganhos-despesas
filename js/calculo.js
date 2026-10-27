/* js/calculo.js — Motor de cálculo dos valores, prazos do regulamento, calendário (.ics) e distâncias por campo.
   Script normal (sem módulos nem build), carregado pelo index.html por esta
   ordem: base, calculo, jogos, despesas-multas, resumo, bd, conta, sessao,
   definicoes, arranque. Partilham o mesmo âmbito global, como quando eram um
   <script> só. */
"use strict";

/* ============ Motor de cálculo ============ */
function lookup(tipo,escalao,funcao){
  return S.tabela.find(r=>daEpoca(r)&&norm(r.tipo)===norm(tipo)&&norm(r.escalao)===norm(escalao)&&norm(r.funcao)===norm(funcao));
}
/* ===========================================================================
 * Deslocações
 * ---------------------------------------------------------------------------
 * Uma regra é: tipo de jogo + (opcionalmente) os escalões a que se aplica +
 * como se paga. Há associações que pagam a viagem por km; outras pagam um
 * valor fixo que muda com o escalão — 33 € nos seniores, 21 € nos juniores A,
 * 14 € nos restantes. Por isso uma regra pode cobrir vários escalões de uma
 * vez, e uma regra SEM escalões vale para os que não tiverem regra própria.
 *
 * Antes a regra só tinha o tipo, e o tipo era texto livre: escrevia-se
 * "Distrital Senior", nenhum jogo era do tipo "Distrital Senior", e a
 * deslocação dava 0 € sem aviso nenhum.
 * ========================================================================= */
const escaloesDaRegra=d=>Array.isArray(d&&d.escaloes)?d.escaloes:[];

function deslocRule(tipo,escalao){
  const regras=(epAtiva().deslocacoes||[]).filter(d=>norm(d.tipo)===norm(tipo));
  // primeiro a regra que nomeia este escalão; depois a geral do tipo
  const propria=escalao?regras.find(d=>escaloesDaRegra(d).some(e=>norm(e)===norm(escalao))):null;
  return propria||regras.find(d=>!escaloesDaRegra(d).length)||null;
}

/* Os tipos de jogo que existem de facto: os da tabela de valores. */
const tiposDeJogo=()=>[...new Set(S.tabela.filter(daEpoca).map(x=>x.tipo))];
const escaloesDoTipo=t=>[...new Set(S.tabela.filter(daEpoca).filter(x=>norm(x.tipo)===norm(t)).map(x=>x.escalao))];

/* Uma regra que não chega a nenhum jogo: o tipo não existe, ou os escalões
   que nomeia já não estão na tabela. Devolve a razão, ou "" se está boa. */
function regraOrfa(d){
  if(!tiposDeJogo().some(t=>norm(t)===norm(d.tipo)))
    return `Não há jogos do tipo "${d.tipo}" — esta regra não se aplica a nada.`;
  const esc=escaloesDaRegra(d), existem=escaloesDoTipo(d.tipo);
  const fora=esc.filter(e=>!existem.some(x=>norm(x)===norm(e)));
  if(esc.length&&fora.length===esc.length)
    return "Nenhum destes escalões está na tabela de valores.";
  return "";
}
function atrCalc(j,a){
  const r=lookup(j.tipo,j.escalao,a.funcao);
  const base=r?r.valor:0;
  const alm=a.almocoId?num0(S.almocos.find(x=>x.id===a.almocoId)?.valor):0;
  const dr=deslocRule(j.tipo,j.escalao);
  let km;
  if(dr)km=dr.modo==="fixo"?(a.deslocFixa?num0(dr.valor):0):num0(a.km)*num0(dr.valor);
  else km=num0(a.km)*num0(epAtiva().valorKm);
  return {base,alm,km,total:base+alm+km,found:!!r};
}
/* Porque é que este jogo não tem tarifa, em linguagem de gente.
   Dizer "combinação não existe" obriga a pessoa a adivinhar qual das três
   coisas está errada. Isto diz qual é, e o que aquele escalão aceita. */
function porqueSemTarifa(j,a){
  const daEp=r=>r.epocaId===j.epocaId||daEpoca(r);
  const doTipo=S.tabela.filter(daEp).filter(r=>norm(r.tipo)===norm(j.tipo));
  if(!doTipo.length)
    return `Não há valores para jogos ${j.tipo||"deste tipo"} nesta época. Acrescenta-os em Definições → Tabela de valores.`;
  const doEsc=doTipo.filter(r=>norm(r.escalao)===norm(j.escalao));
  if(!doEsc.length)
    return `O escalão "${j.escalao||"(vazio)"}" não está na tabela de valores de ${j.tipo}. Acrescenta-o em Definições → Tabela de valores.`;
  const fs=[...new Set(doEsc.map(r=>r.funcao))];
  return `Em ${j.escalao} não há valor para a função ${a.funcao}. Esse escalão tem: ${fs.join(", ")}.`;
}

/* O que a tabela daria agora. */
function atrCalculado(j,a){
  if(a.override!==null&&a.override!==undefined&&a.override!=="")return num0(a.override);
  return atrCalc(j,a).total;
}
/* O que vale de facto: o valor congelado ao gravar. Jogos antigos, sem valor
   congelado, continuam a ser calculados (e são congelados no arranque). */
function atrFinal(j,a){
  return temValorFixo(a)?num0(a.valor):atrCalculado(j,a);
}
/* Dentro do formulário: mantém o valor congelado enquanto não se mexer em nada
   que entre no cálculo; mexendo, recalcula. */
function valorEmEdicao(j,a){
  if(temValorFixo(a)&&a.calcKey===chaveCalculo(j,a))return num0(a.valor);
  return atrCalculado(j,a);
}
/* Congela os jogos que ainda não têm valor gravado, com o que a app já mostrava
   até agora — ninguém vê números mudar por causa desta alteração. */
function congelaValoresAntigos(){
  let n=0;
  for(const j of (S.jogos||[]))for(const a of (j.atribuicoes||[])){
    if(!a.membroId)continue;
    if(!temValorFixo(a)){a.valor=atrCalculado(j,a);a.calcKey=chaveCalculo(j,a);n++;}
  }
  return n;
}
function jogoTotal(j){return (j.atribuicoes||[]).filter(a=>a.membroId).reduce((s,a)=>s+atrFinal(j,a),0);}
/* ============ Prazos do regulamento ============
   Art. 3 — confirmar a nomeação até às 22h do dia em que chega.
   Art. 4 — marcar horas até às 20h da véspera do jogo.
   São duas multas de 2 € que a app tem tudo para evitar: já sabe a data, a hora
   e os valores do regulamento. */
const valorArtigo=num=>{const a=(S.artigos||[]).find(x=>x.num===num);return a?a.valor:null;};
function pendencias(j){
  const out=[];
  if(!j.confirmada)out.push({campo:"confirmada",rotulo:"Confirmar nomeação",art:3,
    prazo:j.criadoEm?(()=>{const p=new Date(j.criadoEm);p.setHours(22,0,0,0);return p;})():null});
  if(!j.horasMarcadas)out.push({campo:"horasMarcadas",rotulo:"Marcar horas",art:4,prazo:vespera20(j)});
  return out;
}

/* ============ Calendário (.ics) ============
   A app não consegue tocar sozinha à hora certa: uma PWA não tem alarmes
   locais fiáveis (e no iOS não tem mesmo). O calendário do telemóvel tem, e
   funciona offline — por isso os lembretes saem daqui como alarmes dentro do
   próprio evento. */
// Hora flutuante: o jogo é às 15h locais e o árbitro está cá — evita converter
// fusos e continua válido em qualquer calendário.
function icsDeJogos(jogos,nome){
  const L=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Arbitragem//Ganhos e Despesas//PT",
           "CALSCALE:GREGORIAN","METHOD:PUBLISH",icsDobra("X-WR-CALNAME:"+icsEsc(nome))];
  const carimbo=dtUTC(new Date());
  for(const j of jogos){
    const ini=iniJogo(j);
    if(!ini)continue;
    const atrs=(j.atribuicoes||[]).filter(a=>a.membroId);
    const iEu=Math.max(0,atrs.findIndex(a=>a.membroId===S.settings.membroEuId));
    const eu=atrs[iEu];
    const papel=eu?papelAtr(atrs,iEu):"";
    const desc=[
      [j.escalao,j.tipo].filter(Boolean).join(" · "),
      eu?`Função: ${papel} (${eu.funcao})`:"",
      eu?`Valor estimado: ${fmt(atrFinal(j,eu))}`:"",
      atrs.map(a=>{const m=S.membros.find(x=>x.id===a.membroId);return (m?m.nome:"?")+" — "+a.funcao;}).join("\n"),
      j.numJogo?"Jogo n.º "+j.numJogo:""
    ].filter(Boolean).join("\n");
    L.push("BEGIN:VEVENT",
      icsDobra("UID:"+icsEsc(j.id)+"@arbitragem-afa"),
      "DTSTAMP:"+carimbo,
      "DTSTART:"+dtLocal(ini),
      "DURATION:PT2H",
      icsDobra("SUMMARY:"+icsEsc((papel?papel+" · ":"")+(j.equipaA||"")+" vs "+(j.equipaB||""))),
      icsDobra("DESCRIPTION:"+icsEsc(desc)),
      "STATUS:"+(j.estado==="cancelado"?"CANCELLED":"CONFIRMED"));
    if(j.local)L.push(icsDobra("LOCATION:"+icsEsc(j.local)));
    const v=vespera20(j);
    const mins=v?Math.round((ini.getTime()-v.getTime())/60000):0;
    if(mins>0)L.push("BEGIN:VALARM","ACTION:DISPLAY",
      icsDobra("DESCRIPTION:"+icsEsc("Marcar horas até às 20h — Art. 4 do regulamento")),
      "TRIGGER:-PT"+mins+"M","END:VALARM");
    L.push("BEGIN:VALARM","ACTION:DISPLAY",
      icsDobra("DESCRIPTION:"+icsEsc("Sair para o jogo"+(j.local?" — "+j.local:""))),
      "TRIGGER:-PT2H","END:VALARM","END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.join("\r\n")+"\r\n";
}
async function exportaIcs(jogos,nome){
  if(!jogos.length){toast("Nenhum jogo para exportar");return;}
  const texto=icsDeJogos(jogos,nome);
  const ficheiro=nome.replace(/[^\w.-]+/g,"_")+".ics";
  const f=new File([texto],ficheiro,{type:"text/calendar"});
  if(navigator.canShare&&navigator.canShare({files:[f]})){
    try{await navigator.share({files:[f],title:nome});return;}catch(_){/* cancelado */}
  }
  download(ficheiro,texto,"text/calendar;charset=utf-8");
  toast(jogos.length===1?"Evento exportado — abre o ficheiro para o adicionar":"Calendário exportado ("+jogos.length+" jogos)");
}

/* ============ Distâncias por campo ============
   Os km dependem de quem viaja e de para onde: a memória é por (membro, campo).
   O nome do campo vem escrito de maneiras diferentes ("CAMPO DA JUNTA",
   "Campo da Junta "), por isso a comparação é feita sobre uma forma normalizada,
   mas guardamos o nome tal como o utilizador o escreveu. */
function distanciaDe(membroId,local){
  const k=normLocal(local);
  if(!k||!membroId)return null;
  const d=(S.distancias||[]).find(x=>x.membroId===membroId&&normLocal(x.local)===k);
  return d?(num(d.km)||null):null;
}
/* A app aprende a distância de cada pessoa a cada campo. É uma gravação de
   segundo plano: se falhar, não vale a pena interromper quem acabou de gravar
   um jogo — na próxima ida ao mesmo campo volta a aprender. */
async function guardaDistancia(membroId,local,km){
  const k=normLocal(local), v=num(km);
  if(!k||!membroId||!(v>0))return;
  S.distancias=S.distancias||[];
  const ex=S.distancias.find(x=>x.membroId===membroId&&normLocal(x.local)===k);
  if(ex){
    // Só reescreve se a diferença for real — meio quilómetro não justifica ir
    // à base de dados.
    if(Math.abs((num0(ex.km))-v)<0.5)return;
    ex.km=v; ex.local=String(local).trim();
    try{ await guarda("distancias",ex); }catch(_){}
  }else{
    const d={id:criaId(),membroId,local:String(local).trim(),km:v};
    try{ if(await guarda("distancias",d))S.distancias.push(d); }catch(_){}
  }
}
const locaisConhecidos=()=>[...new Set([
  ...S.jogos.map(j=>j.local).filter(Boolean),
  ...(S.distancias||[]).map(d=>d.local).filter(Boolean)
])].sort((a,b)=>a.localeCompare(b,"pt"));
