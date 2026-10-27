/* js/jogos.js — Navegação entre separadores, filtros, lista de jogos, cartão "Jogo de hoje", formulário do jogo e convocatória.
   Script normal (sem módulos nem build), carregado pelo index.html por esta
   ordem: base, calculo, jogos, despesas-multas, resumo, bd, conta, sessao,
   definicoes, arranque. Partilham o mesmo âmbito global, como quando eram um
   <script> só. */
"use strict";

/* ============ Navegação ============ */
let tab="jogos";
let membroSel="all";
/* O mês em que estamos, se pertencer à época que se está a ver; senão a época toda. */
function mesCorrente(){const cur=new Date().toISOString().slice(0,7);return mesesDaEpoca().includes(cur)?cur:"all";}
let mesSel=mesCorrente();
$$(".tabbar button").forEach(b=>b.onclick=()=>{
  keepScrollY=null;window.scrollTo(0,0);
  // O Resumo abre sempre no mês corrente e no nome de quem está a usar a app.
  if(b.dataset.tab==="resumo"&&tab!=="resumo")abreResumo();
  tab=b.dataset.tab;
  $$(".tabbar button").forEach(x=>{const on=x===b;x.classList.toggle("on",on);if(on)x.setAttribute("aria-current","page");else x.removeAttribute("aria-current");});
  render();
});
$("#hSync").onclick=()=>{
  recarrega();
};
$("#fab").onclick=()=>{
  // As despesas são pessoais: qualquer membro lança as suas.
  if(tab==="despesas")return formDespesa();
  if(soLeitura())return;
  if(tab==="multas")formMulta(); else formJogo();
};

function mesesDaEpoca(){
  const y=epAtiva().anoInicio;
  return MESES_EPOCA.map(m=>{const yy=m>=8?y:y+1;return `${yy}-${String(m+1).padStart(2,"0")}`;});
}
function render(){
  $("#hEpoca").innerHTML=`<span class="rot-longo">Época </span>${esc(epAtiva().nome)}${souResponsavel()?"":" · 👀"}`;
  pintaSync();
  document.body.classList.toggle("ro",!souResponsavel());
  document.body.classList.toggle("tab-despesas",tab==="despesas");
  $("#fab").style.display=(tab==="jogos"||tab==="despesas"||tab==="multas")?"block":"none";
  $("#fab").setAttribute("aria-label",{jogos:"Adicionar jogo",despesas:"Adicionar despesa ou receita",multas:"Adicionar multa"}[tab]||"Adicionar");
  const titles={jogos:"Jogos",despesas:"Despesas",multas:"Multas",resumo:"Resumo",config:"Definições"};
  $("#hTitle").textContent=titles[tab];
  const nomeEq=(S.settings.equipa||"").trim();
  $("#hEquipa").textContent=nomeEq;
  $("#hEquipa").style.display=nomeEq?"":"none";
  $("#hEmblema").textContent=iniciais(nomeEq);
  ({jogos:renderJogos,despesas:renderDespesas,multas:renderMultas,resumo:renderResumo,config:renderConfig})[tab]();
  ligaLabels($("#main"));
  if(keepScrollY!=null){const y=keepScrollY;keepScrollY=null;requestAnimationFrame(()=>window.scrollTo(0,y));}
}

/* ============ Chips (filtros) ============ */
const chipScroll={};
let keepScrollY=null;
function chips(items,sel,onpick,role){
  const h='<div class="chips" role="group">'+items.map(it=>`<button class="chip ${sel===it.v?"on":""}" aria-pressed="${sel===it.v}" data-role="${role}" data-m="${esc(it.v)}">${it.l}</button>`).join("")+'</div>';
  setTimeout(()=>{
    const cs=$$(`.chip[data-role="${role}"]`);
    if(!cs.length)return;
    const row=cs[0].parentElement;
    if(chipScroll[role]!=null)row.scrollLeft=chipScroll[role];
    /* O filtro escolhido tem de estar à vista. O Resumo abre no nome de quem
       usa a app, e se esse nome for o último da lista ficava escondido à
       direita — parecia que não estava ninguém escolhido. */
    const on=row.querySelector(".chip.on");
    if(on){
      const rb=row.getBoundingClientRect(), ob=on.getBoundingClientRect();
      if(ob.left<rb.left||ob.right>rb.right)row.scrollLeft+=(ob.left+ob.width/2)-(rb.left+rb.width/2);
    }
    const mais=()=>row.classList.toggle("mais",row.scrollLeft+row.clientWidth<row.scrollWidth-2);
    mais(); row.onscroll=mais;
    cs.forEach(c=>c.onclick=()=>{
      chipScroll[role]=c.parentElement.scrollLeft;
      keepScrollY=window.scrollY;
      onpick(c.dataset.m);
    });
  },0);
  return h;
}
function chipsMeses(sel,onpick){
  const ms=mesesDaEpoca();
  return chips([{v:"all",l:"Época"},...ms.map(m=>{const[y,mm]=m.split("-");return{v:m,l:NOME_MES[+mm-1].slice(0,3)+" "+y.slice(2)};})],sel,onpick,"mes");
}
function chipsMembros(sel,onpick){
  return chips([{v:"all",l:"Todos"},...S.membros.map(m=>({v:m.id,l:esc(m.nome)}))],sel,onpick,"mem");
}

/* ============ Jogos ============ */
const LIMITE_LISTA=80;
let verTudoJogos=false;
let filtroTarifa="";
function renderJogos(){
  const ms=mesSel;
  const jogos=S.jogos.filter(daEpoca)
    .filter(j=>ms==="all"||j.data.startsWith(ms))
    .filter(j=>membroSel==="all"||(j.atribuicoes||[]).some(a=>a.membroId===membroSel))
    .sort((a,b)=>(b.data+(b.hora||"")).localeCompare(a.data+(a.hora||"")));
  const somaJ=j=>(j.atribuicoes||[]).filter(a=>membroSel==="all"||a.membroId===membroSel).reduce((s,a)=>s+atrFinal(j,a),0);
  const tot=jogos.filter(j=>j.estado!=="cancelado").reduce((s,j)=>s+somaJ(j),0);
  let h=cartaoHoje()+chipsMeses(ms,m=>{mesSel=m;verTudoJogos=false;render();});
  h+=chipsMembros(membroSel,m=>{membroSel=m;verTudoJogos=false;render();});
  // Prazos do regulamento por cumprir nos jogos que aí vêm.
  const agoraD=new Date(), limite=new Date(agoraD.getTime()+10*86400000);
  const hhmm=d=>p2(d.getHours())+":"+p2(d.getMinutes());
  const aTratar=(!souResponsavel()?[]:S.jogos.filter(daEpoca))
    .filter(j=>j.estado==="agendado")
    .filter(j=>{const i=iniJogo(j);return i&&i>=agoraD&&i<=limite;})
    .filter(j=>ms==="all"||j.data.startsWith(ms))
    .filter(j=>membroSel==="all"||(j.atribuicoes||[]).some(a=>a.membroId===membroSel))
    .map(j=>({j,pend:pendencias(j)})).filter(x=>x.pend.length)
    .sort((a,b)=>(a.j.data+(a.j.hora||"")).localeCompare(b.j.data+(b.j.hora||"")));
  if(aTratar.length){
    h+=`<div class="card" style="border-left:3px solid var(--blue)"><b class="sub">📋 A tratar antes do jogo</b>`;
    for(const {j,pend} of aTratar){
      h+=`<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="sub"><b>${esc(j.equipaA)} vs ${esc(j.equipaB)}</b></div>
      <div class="mut">${diaSem(j.data)} ${fmtD(j.data)} · ${esc(j.hora||"")}${j.local?" · "+esc(j.local):""}</div>
      <div style="margin-top:7px;display:flex;gap:6px;flex-wrap:wrap">`;
      for(const pd of pend){
        const atrasado=pd.prazo&&pd.prazo<agoraD;
        const multa=valorArtigo(pd.art);
        const nota=atrasado
          ? `prazo passou${multa!=null?` — Art. ${pd.art}, ${fmt(multa)}`:""}`
          : (pd.prazo?`até ${fmtD(pd.prazo.toISOString().slice(0,10))} ${hhmm(pd.prazo)}`:`Art. ${pd.art}`);
        h+=`<button class="btn sm ${atrasado?"dngr":""}" data-tick="${esc(j.id)}|${pd.campo}">${atrasado?"⚠":"✓"} ${esc(pd.rotulo)} <span style="opacity:.72;font-weight:600">· ${esc(nota)}</span></button>`;
      }
      h+=`</div></div>`;
    }
    h+=`<div class="mut sub" style="margin-top:9px">Toca para marcar como tratado. Para o telemóvel avisar sozinho, usa o 📅 de cada jogo — o alarme fica no calendário.</div></div>`;
  }
  // jogos passados ainda "agendado" → pedir confirmação
  const ag=new Date();
  const nowStr=ag.getFullYear()+"-"+String(ag.getMonth()+1).padStart(2,"0")+"-"+String(ag.getDate()).padStart(2,"0")+"T"+String(ag.getHours()).padStart(2,"0")+":"+String(ag.getMinutes()).padStart(2,"0");
  const porConf=!souResponsavel()?[]:S.jogos.filter(daEpoca).filter(j=>j.estado==="agendado"&&(j.data+"T"+(j.hora||"23:59"))<nowStr);
  if(porConf.length){
    h+=`<div class="card" style="border-left:3px solid var(--warn)"><b class="sub">⚠️ ${porConf.length===1?"1 jogo já passou":porConf.length+" jogos já passaram"} — foi(ram) apitado(s)?</b>`;
    const MOSTRA=6;
    for(const j of porConf.slice(0,MOSTRA)){
      h+=`<div class="list-item"><div class="sub">${esc(j.equipaA)} vs ${esc(j.equipaB)}<div class="mut">${diaSem(j.data)} ${fmtD(j.data)} ${esc(j.hora||"")}</div></div>
      <span style="white-space:nowrap"><button class="btn sm pri" data-conf="${esc(j.id)}">✓ Realizado</button> <button class="btn sm dngr" data-canc="${esc(j.id)}" aria-label="Marcar como não realizado">✕</button></span></div>`;
    }
    if(porConf.length>MOSTRA)h+=`<div class="mut sub" style="margin-top:8px">… e mais ${porConf.length-MOSTRA} por confirmar. Aparecem aqui à medida que fores tratando destes.</div>`;
    h+=`</div>`;
  }
  h+=`<div class="card row"><span class="mut">${jogos.length} jogo(s)</span><span><button class="btn sm" id="btnConv">📋 Convocatória</button> <span class="big val">${fmt(tot)}</span></span></div>`;
  if(!jogos.length)h+=`<div class="empty"><span class="eico">⚽</span>Sem jogos neste período.<br>Toca em <b>+</b> para registar ou usa 📋 para colar uma convocatória.</div>`;
  // Com várias épocas de histórico, desenhar tudo de uma vez custa caro e não
  // serve para nada: mostram-se os mais recentes e o resto a pedido.
  const mostrados=(verTudoJogos||jogos.length<=LIMITE_LISTA)?jogos:jogos.slice(0,LIMITE_LISTA);
  for(const j of mostrados){
    const atrs=(j.atribuicoes||[]).map(a=>{
      const m=S.membros.find(x=>x.id===a.membroId);
      const c=atrCalc(j,a);
      const ov=(a.override!==null&&a.override!==undefined&&a.override!=="");
      const hl=membroSel!=="all"&&a.membroId===membroSel;
      return `<div class="row sub" style="margin-top:4px"><span>${hl?"▸ ":""}${esc(m?m.nome:"?")} <span class="tag">${esc(a.funcao)}</span>${!c.found&&!ov?` <span class="warn" title="${esc(porqueSemTarifa(j,a))}">⚠ sem tarifa</span>`:""}</span><span class="val">${fmt(atrFinal(j,a))}${ov?' <span class="tag">manual</span>':""}</span></div>`;
    }).join("");
    // A tabela mudou desde que este jogo foi gravado?
    let difTabela="";
    {
      const fixos=(j.atribuicoes||[]).filter(a=>a.membroId&&temValorFixo(a));
      if(fixos.length){
        const agoraVal=fixos.reduce((s,a)=>s+atrCalculado(j,a),0);
        const gravado=fixos.reduce((s,a)=>s+num0(a.valor),0);
        if(Math.abs(agoraVal-gravado)>=0.005)
          difTabela=`<div class="mut sub" style="margin-top:4px">A tabela atual daria <b>${fmt(agoraVal)}</b> — o jogo ficou gravado com ${fmt(gravado)}. <button class="btn sm" data-retab="${esc(j.id)}">Atualizar pela tabela</button></div>`;
      }
    }
    // O "Recebido X" por jogo saiu: o dinheiro vem ao fim do mês, numa folha
    // por competição. O cartão diz apenas se o mês daquele jogo já foi pago.
    let pag="";
    {
      const meu=(j.atribuicoes||[]).find(a=>a.membroId===(membroSel!=="all"?membroSel:S.settings.membroEuId));
      if(meu&&j.estado==="realizado"&&participacaoPaga(j,meu)){
        const pgm=pagamentoDe(mesDe(j),j.tipo,meu.membroId);
        pag=`<div class="mut sub" style="margin-top:4px">✅ Pago na folha de ${esc(j.tipo)} de ${NOME_MES[+mesDe(j).slice(5,7)-1]}${pgm&&pgm.data?", em "+fmtD(pgm.data):""}</div>`;
      }
    }
    h+=`<div class="card" data-id="${esc(j.id)}">
      <div class="jhead"><div class="datebox"><span class="dd">${j.data.slice(8,10)}</span><span class="mm">${NOME_MES[+j.data.slice(5,7)-1].slice(0,3)}</span></div>
      <div class="jmain"><div class="teams">${esc(j.equipaA)} <span class="vs">vs</span> ${esc(j.equipaB)}</div>
      <div class="mut">${diaSem(j.data)} · ${esc(j.hora||"")} · ${esc(j.escalao)} · ${esc(j.tipo)}${j.local?" · "+esc(j.local):""}</div></div>
      <span class="badge b-${esc(j.estado)}">${esc(j.estado)}</span></div>
      ${atrs}${pag}${difTabela}
      <div class="row" style="margin-top:10px;padding-top:9px;border-top:1px solid var(--line)">
        <span class="mut sub">Total do jogo</span><span class="big val">${fmt(jogoTotal(j))}</span></div>
      <div class="acoes">
        <button class="btn sm" data-ics="${esc(j.id)}" title="Adicionar ao calendário" aria-label="Adicionar ao calendário">📅</button>
        <button class="btn sm" data-act="edit">Editar</button>
        <button class="btn sm" data-act="dup">Duplicar</button>
        <button class="btn sm dngr" data-act="del">Apagar</button>
      </div>
    </div>`;
  }
  if(mostrados.length<jogos.length)
    h+=`<div class="btnrow"><button class="btn" id="verTudo">Mostrar os restantes ${jogos.length-mostrados.length} jogos</button></div>`;
  $("#main").innerHTML=h;
  ligaCartaoHoje();
  if($("#verTudo"))$("#verTudo").onclick=()=>{verTudoJogos=true;keepScrollY=window.scrollY;render();};
  // Com `onclick=formConv` o browser passava o próprio clique como primeiro
  // argumento, e a caixa da mensagem aparecia com "[object PointerEvent]".
  $("#btnConv").onclick=()=>formConv();
  $$("[data-retab]").forEach(b=>b.onclick=async()=>{
    const j=S.jogos.find(x=>x.id===b.dataset.retab);
    if(!j)return;
    const novo=(j.atribuicoes||[]).filter(a=>a.membroId).reduce((s,a)=>s+atrCalculado(j,a),0);
    if(!await confirma(`Passar este jogo para ${fmt(novo)}, segundo a tabela de valores atual?`,
      {titulo:"Atualizar pela tabela",confirmar:"Atualizar"}))return;
    const antes=JSON.parse(JSON.stringify(j.atribuicoes));
    for(const a of j.atribuicoes){if(!a.membroId)continue;a.valor=atrCalculado(j,a);a.calcKey=chaveCalculo(j,a);}
    if(await guardaJogo(j)){confirmaGravado();render();toast("Jogo atualizado pela tabela");}
    else j.atribuicoes=antes;
  });
  $$("[data-tick]").forEach(b=>b.onclick=async()=>{
    const [id,campo]=b.dataset.tick.split("|");
    const j=S.jogos.find(x=>x.id===id);
    if(!j)return;
    j[campo]=true;
    if(await guardaJogo(j)){confirmaGravado();render();
      toast(campo==="confirmada"?"Nomeação confirmada ✅":"Horas marcadas ✅");}
    else j[campo]=false;
  });
  $$("[data-ics]").forEach(b=>b.onclick=()=>{
    const j=S.jogos.find(x=>x.id===b.dataset.ics);
    if(j)exportaIcs([j],`${(j.equipaA||"jogo").replace(/\s+/g,"-")}_${j.data}`);
  });
  $$("[data-conf]").forEach(b=>b.onclick=async()=>{
    const j=S.jogos.find(x=>x.id===b.dataset.conf); if(!j)return;
    const antes=j.estado; j.estado="realizado";
    if(await guardaJogo(j)){confirmaGravado();render();toast("Jogo confirmado ✅");} else j.estado=antes;
  });
  $$("[data-canc]").forEach(b=>b.onclick=async()=>{
    if(!await confirma("O jogo não se realizou? Fica marcado como cancelado e deixa de contar nos totais.",{titulo:"Cancelar jogo",confirmar:"Sim, não se realizou"}))return;
    const j=S.jogos.find(x=>x.id===b.dataset.canc); if(!j)return;
    const antes=j.estado; j.estado="cancelado";
    if(await guardaJogo(j)){confirmaGravado();render();toast("Jogo cancelado");} else j.estado=antes;
  });
  $$('[data-act]').forEach(b=>b.onclick=async()=>{
    const id=b.closest(".card").dataset.id, j=S.jogos.find(x=>x.id===id);
    if(b.dataset.act==="edit")formJogo(j);
    else if(b.dataset.act==="dup"){const c=JSON.parse(JSON.stringify(j));c.id=criaId();c.estado="agendado";delete c.confirmada;delete c.horasMarcadas;c.criadoEm=agora();formJogo(c,true);}
    else if(await confirma(`Apagar ${j.equipaA} vs ${j.equipaB}?`,{titulo:"Apagar jogo",confirmar:"Apagar",perigo:true}))apagaRegisto("jogos",id,"Jogo");
  });
}

/* O jogo seguinte parece-se quase sempre com o anterior do mesmo tipo: a mesma
   equipa de arbitragem, as mesmas funções, muitas vezes o mesmo escalão. Copiar
   isso poupa três ou quatro toques a quem está a registar à saída do balneário. */
/* ============ Jogo de hoje ============
   O cartão que interessa à saída de casa: a que horas é o apito, como lá
   chegar, e o que não pode ficar esquecido. Mostra os meus jogos de hoje; se
   não houver, os de amanhã. A lista de equipamento sai do regulamento que a
   equipa tem na app (Art. 7 a 10 e 15), com o valor da multa ao lado. */
const K_CHECK="arbChecklist:";
function jogosDoDia(){
  const eu=EUMEMBRO&&EUMEMBRO.id; if(!eu)return {rotulo:"",jogos:[]};
  const d=new Date(), iso=x=>x.getFullYear()+"-"+p2(x.getMonth()+1)+"-"+p2(x.getDate());
  const hoje=iso(d), amanha=iso(new Date(d.getFullYear(),d.getMonth(),d.getDate()+1));
  const meus=S.jogos.filter(j=>j.estado!=="cancelado"&&(j.atribuicoes||[]).some(a=>a.membroId===eu));
  const doDia=dia=>meus.filter(j=>j.data===dia).sort((a,b)=>(a.hora||"").localeCompare(b.hora||""));
  // um jogo de hoje que acabou há mais de 3 horas já não é "o jogo de hoje"
  const h=doDia(hoje).filter(j=>{const i=iniJogo(j);return !i||i.getTime()>Date.now()-3*3600e3;});
  if(h.length)return {rotulo:"Hoje",jogos:h};
  return {rotulo:"Amanhã",jogos:doDia(amanha)};
}
function listaEquipamento(j){
  const e=norm(j.escalao||"");
  const nums=[10,15];
  if(/2.? ?div/.test(e))nums.unshift(7);
  if(/1.? ?div|ta[cç]a de honra/.test(e))nums.unshift(8);
  if(/sabseg/.test(e))nums.unshift(9);
  return nums.map(n=>(S.artigos||[]).find(a=>a.num===n)).filter(Boolean);
}
function leChecklist(id){try{return JSON.parse(localStorage.getItem(K_CHECK+id))||[];}catch(_){return [];}}
function guardaChecklist(id,v){try{localStorage.setItem(K_CHECK+id,JSON.stringify(v));}catch(_){}}
function faltaPara(j){
  const i=iniJogo(j); if(!i)return "";
  const min=Math.round((i.getTime()-Date.now())/60000);
  if(min<=0)return min>-120?"a decorrer":"";
  if(min<60)return "apito daqui a "+min+" min";
  const h=Math.floor(min/60), m=min%60;
  return "apito daqui a "+h+" h"+(m?" "+p2(m):"");
}
function cartaoHoje(){
  const {rotulo,jogos}=jogosDoDia();
  if(!jogos.length)return "";
  return jogos.map(j=>{
    const eu=(j.atribuicoes||[]).find(a=>a.membroId===EUMEMBRO.id)||{};
    const q=encodeURIComponent(j.local||"");
    const itens=listaEquipamento(j), feitos=leChecklist(j.id);
    const nFeitos=itens.filter(a=>feitos.includes(a.num)).length;
    const falta=faltaPara(j);
    return `<section class="card hoje" aria-label="${esc(rotulo)}: ${esc(j.equipaA)} contra ${esc(j.equipaB)}" style="border-left:3px solid var(--acc)">
      <div class="row"><b class="sub">⚽ ${esc(rotulo)} · ${esc(j.hora||"")}</b>${falta?`<span class="mut sub">${esc(falta)}</span>`:""}</div>
      <div class="teams" style="margin-top:4px">${esc(j.equipaA||"?")} <span class="vs">vs</span> ${esc(j.equipaB||"?")}</div>
      <div class="mut sub">${esc(j.escalao||"")}${j.tipo?" · "+esc(j.tipo):""}${eu.funcao?" · vais de "+esc(eu.funcao):""}</div>
      ${j.local?`<div class="sub" style="margin-top:8px">📍 ${esc(j.local)}</div>
      <div class="btnrow" style="margin-top:8px">
        <a class="btn sm" href="https://www.google.com/maps/search/?api=1&amp;query=${q}" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">Abrir no Maps</a>
        <a class="btn sm" href="https://waze.com/ul?q=${q}&amp;navigate=yes" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">Abrir no Waze</a>
      </div>`:""}
      ${itens.length?`<details style="margin-top:6px"><summary>Não esquecer (${nFeitos}/${itens.length})</summary>
        ${itens.map(a=>`<label style="display:flex;gap:10px;align-items:center;margin:0;padding:8px 0;font-size:.88rem;color:var(--txt);font-weight:600;letter-spacing:0">
          <input type="checkbox" data-chk="${esc(j.id)}|${a.num}" ${feitos.includes(a.num)?"checked":""} style="width:22px;min-height:22px;height:22px;flex:0 0 auto">
          <span>${esc(a.nome)} <span class="mut">· Art. ${a.num}${a.valor?", "+fmt(a.valor):""}</span></span></label>`).join("")}
      </details>`:""}
    </section>`;
  }).join("");
}
function ligaCartaoHoje(){
  $$("[data-chk]").forEach(c=>c.onchange=()=>{
    const [id,n]=c.dataset.chk.split("|");
    const v=leChecklist(id).filter(x=>x!==+n);
    if(c.checked)v.push(+n);
    guardaChecklist(id,v);
    const d=c.closest("details"), sm=d&&d.querySelector("summary");
    if(sm){const t=$$("[data-chk]",d);sm.textContent="Não esquecer ("+t.filter(x=>x.checked).length+"/"+t.length+")";}
  });
}

function moldeDoUltimo(tipo){
  const ant=S.jogos.filter(daEpoca)
    .filter(x=>norm(x.tipo)===norm(tipo)&&(x.atribuicoes||[]).some(a=>a.membroId))
    .sort((a,b)=>(b.data+(b.hora||"")).localeCompare(a.data+(a.hora||"")))[0];
  if(!ant)return null;
  return {
    escalao:ant.escalao||"",
    atribuicoes:(ant.atribuicoes||[]).filter(a=>a.membroId).map(a=>({
      membroId:a.membroId,funcao:a.funcao,almocoId:a.almocoId||"",km:"",deslocFixa:a.deslocFixa||"",override:""
    }))
  };
}
function formJogo(j,isNovoRegisto=false){
  if(!S.membros.length){
    toast("Primeiro diz quem faz parte da equipa, em Definições","erro");
    tab="config";
    $$(".tabbar button").forEach(x=>{const on=x.dataset.tab==="config";x.classList.toggle("on",on);if(on)x.setAttribute("aria-current","page");else x.removeAttribute("aria-current");});
    window.scrollTo(0,0);render();
    return;
  }
  const novo=!j;
  if(j){
    j=JSON.parse(JSON.stringify(j));
  }else{
    const tipoInicial=[...new Set(S.tabela.filter(daEpoca).map(r=>r.tipo))][0]||"Distrital";
    const molde=moldeDoUltimo(tipoInicial);
    j={id:criaId(),epocaId:epAtiva().id,criadoEm:agora(),data:new Date().toISOString().slice(0,10),hora:"15:00",
      escalao:molde?molde.escalao:"",equipaA:"",equipaB:"",local:"",tipo:tipoInicial,estado:"agendado",
      valorRecebido:"",dataPagamento:"",
      atribuicoes:(molde&&molde.atribuicoes.length)?molde.atribuicoes
        :[(()=>{const mid=S.settings.membroEuId||S.membros[0]?.id;
                return {membroId:mid,funcao:funcaoDoMembro(S.membros.find(m=>m.id===mid)),
                        almocoId:"",km:"",override:""};})()]};
  }
  const existe=S.jogos.some(x=>x.id===j.id);
  const tipos=[...new Set(S.tabela.filter(daEpoca).map(r=>r.tipo))];
  const escaloesDe=t=>[...new Set(S.tabela.filter(daEpoca).filter(r=>norm(r.tipo)===norm(t)).map(r=>r.escalao))];
  const opcoesEsc=(t,sel)=>{
    const lista=escaloesDe(t);
    if(sel&&!lista.some(e=>norm(e)===norm(sel)))lista.unshift(sel);   // jogo antigo com escalão que já não está na tabela
    return lista.map(e=>`<option value="${esc(e)}" ${norm(e)===norm(sel||"")?"selected":""}>${esc(e)}</option>`).join("")
      +`<option value="__outro" ${sel&&!lista.length?"selected":""}>Outro (escrever)…</option>`;
  };
  const equipas=[...new Set(S.jogos.filter(daEpoca).flatMap(x=>[x.equipaA,x.equipaB]).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const dlg=$("#dlg");
  dlg.innerHTML=`<h2>${(novo||!existe)?"Novo jogo":"Editar jogo"}</h2>
  <div class="grid2"><div><label>Data</label><input type="date" id="fData" value="${esc(j.data)}"></div>
  <div><label>Hora</label><input type="time" id="fHora" value="${esc(j.hora||"")}"></div></div>
  <div class="grid2"><div><label>Tipo de jogo</label><select id="fTipo">${tipos.map(t=>`<option ${t===j.tipo?"selected":""}>${esc(t)}</option>`).join("")}</select></div>
  <div><label for="fEscSel">Escalão</label><select id="fEscSel">${opcoesEsc(j.tipo,j.escalao)}</select>
  <input id="fEsc" value="${esc(j.escalao)}" placeholder="ex: sub 14 IN" style="display:none;margin-top:8px" aria-label="Escrever o escalão"></div></div>
  <div class="grid2"><div><label>Equipa A</label><input id="fEqA" list="dlEq" value="${esc(j.equipaA)}"></div>
  <div><label>Equipa B</label><input id="fEqB" list="dlEq" value="${esc(j.equipaB)}"></div></div>
  <datalist id="dlEq">${equipas.map(e=>`<option value="${esc(e)}">`).join("")}</datalist>
  <label for="fLoc">Local / campo</label><input id="fLoc" list="dlLoc" value="${esc(j.local||"")}" placeholder="ex: Campo da Junta">
  <datalist id="dlLoc">${locaisConhecidos().map(l=>`<option value="${esc(l)}">`).join("")}</datalist>
  <div class="mut sub" style="margin-top:4px">Da segunda vez que jogares neste campo, os km aparecem sozinhos.</div>
  <details id="fMais"${j.estado!=="agendado"?" open":""}>
  <summary>Estado do jogo</summary>
  <label for="fEst">Estado</label><select id="fEst">${ESTADOS.map(e=>`<option ${e===j.estado?"selected":""}>${e}</option>`).join("")}</select>
  <div class="mut sub" style="margin-top:6px">O que recebeste não se marca aqui: a associação paga ao fim do mês, por competição. Marca-se no Resumo → Pagamentos da associação.</div>
  </details>
  <h3 class="sec">Quem apitou e quanto rende</h3><div id="atrs"></div>
  <button class="btn sm" id="addAtr" style="margin-top:8px">+ Adicionar membro</button>
  <div class="row" style="margin-top:12px"><b>Total do jogo</b><span class="big val" id="fTot"></span></div>
  <div class="btnrow"><button class="btn" id="fCancel">Cancelar</button><button class="btn pri" id="fSave">Guardar</button></div>`;

  // O escalão vem da lista; a caixa de texto só aparece em "Outro".
  const escalaoAtual=()=>{
    const sel=$("#fEscSel",dlg);
    if(!sel)return j.escalao||"";
    return sel.value==="__outro"?$("#fEsc",dlg).value.trim():sel.value;
  };
  function totalAtual(){return j.atribuicoes.filter(a=>a.membroId).reduce((s,a)=>s+valorEmEdicao({...j,tipo:$("#fTipo").value,escalao:escalaoAtual()},a),0);}
  function updPag(){ /* o pagamento saiu do jogo; ver Resumo */ }
  // Preenche os km em branco a partir do que já foi registado para este campo.
  // Só toca em campos vazios: uma correção manual manda sempre.
  const localAtual=()=>$("#fLoc",dlg)?$("#fLoc",dlg).value:(j.local||"");
  /* Os km guardados para o campo só entram na linha do chefe: o transporte é
     dele. Nas outras linhas os km ficam como estiverem (vazios, ou o que foi
     escrito à mão). */
  function preencheKms(){
    let mexeu=false;
    const iChefe=indiceChefe(j.atribuicoes);
    for(const [i,a] of j.atribuicoes.entries()){
      if(!a.membroId||i!==iChefe)continue;
      if(a.km!==undefined&&a.km!==null&&String(a.km).trim()!=="")continue;
      const d=distanciaDe(a.membroId,localAtual());
      if(d){a.km=String(d);mexeu=true;}
    }
    return mexeu;
  }
  // Escrever o campo não pode redesenhar as linhas: o "change" do local dispara
  // no momento em que o dedo toca no campo dos km, e um redesenho aqui destruía
  // o input debaixo do utilizador — o mesmo problema que o F1.
  function aplicaSugestoesKm(){
    if(!preencheKms())return refreshCalc();
    $$(".atr",dlg).forEach(el=>{
      const a=j.atribuicoes[+el.dataset.i];
      const inp=$('[data-f="km"]',el);
      if(a&&inp&&inp.value!==String(a.km??""))inp.value=a.km??"";
    });
    refreshCalc();
  }
  const tagKm=a=>{const d=distanciaDe(a.membroId,localAtual());return (d&&String(d)===String(a.km))?' <span class="tag">km guardados</span>':"";};
  const calcHTML=(a,jCtx)=>{
    const c=atrCalc(jCtx,a);
    return `<span class="mut">Tarifa ${fmt(c.base)} + almoço ${fmt(c.alm)} + desloc. ${fmt(c.km)}${tagKm(a)}</span><b class="val">${fmt(valorEmEdicao(jCtx,a))}</b>`;
  };
  function drawAtrs(){
    preencheKms();
    $("#atrs",dlg).innerHTML=j.atribuicoes.map((a,i)=>{
      const c=atrCalc({...j,tipo:$("#fTipo").value,escalao:escalaoAtual()},a);
      return `<div class="atr" data-i="${i}">
      <div class="head"><b class="sub">${papelAtr(j.atribuicoes,i)} · ${esc(a.funcao)}${a.nomeSms?` <span class="tag">na msg: ${esc(a.nomeSms)}</span>`:""}</b><button class="iconbtn" data-rm="${i}" aria-label="Remover esta pessoa do jogo">✕</button></div>
      <div class="grid2"><div><label>Quem</label><select data-f="membroId"><option value="" ${!a.membroId?"selected":""}>(fora da equipa)</option>${S.membros.map(m=>`<option value="${esc(m.id)}" ${m.id===a.membroId?"selected":""}>${esc(m.nome)}</option>`).join("")}</select></div>
      <div><label>Função</label><select data-f="funcao">${FUNCOES.map(f=>`<option ${f===a.funcao?"selected":""}>${f}</option>`).join("")}</select></div></div>
      <div class="grid2"><div><label>Almoço</label><select data-f="almocoId"><option value="">Sem almoço</option>${S.almocos.filter(daEpoca).map(x=>`<option value="${esc(x.id)}" ${x.id===a.almocoId?"selected":""}>${esc(x.nome)} (${fmt(x.valor)})</option>`).join("")}</select></div>
      <div>${(()=>{const dr=deslocRule($("#fTipo").value,escalaoAtual());
        if(dr&&dr.modo==="fixo")return `<label>Deslocação (${fmt(dr.valor)}/jogo)</label><select data-f="deslocFixa"><option value="" ${!a.deslocFixa?"selected":""}>Não</option><option value="1" ${a.deslocFixa?"selected":""}>Sim</option></select>`;
        return `<label>Km${dr?` (${fmt(dr.valor)}/km)`:""}</label><input type="text" inputmode="decimal" data-f="km" value="${esc(numTxt(a.km))}" placeholder="0">`;})()}</div></div>
      <details${(a.override!==""&&a.override!==undefined&&a.override!==null)?" open":""}><summary>Valor manual</summary>
      <input type="text" inputmode="decimal" data-f="override" value="${esc(numTxt(a.override))}" placeholder="deixa vazio para usar a tabela" aria-label="Valor manual em euros"></details>
      <div class="calc">${calcHTML(a,{...j,tipo:$("#fTipo").value,escalao:escalaoAtual()})}</div>
      <div class="warn semtarifa" style="display:${c.found?"none":"block"}">${esc(porqueSemTarifa({...j,tipo:$("#fTipo",dlg)?$("#fTipo",dlg).value:j.tipo,escalao:escalaoAtual()},a))}</div>
      </div>`;
    }).join("");
    $("#fTot",dlg).textContent=fmt(totalAtual());
    ligaLabels($("#atrs",dlg));   // as linhas são redesenhadas, os rótulos voltam sem `for`
    updPag();
    $$("[data-rm]",dlg).forEach(b=>b.onclick=()=>{j.atribuicoes.splice(+b.dataset.rm,1);drawAtrs();});
    // Os selects mudam a estrutura da linha (papel, regra de deslocação) → redesenha.
    // Os inputs numéricos só mudam valores: atualizar os totais sem reconstruir o HTML,
    // senão o campo é destruído a cada tecla e o teclado do telemóvel fecha-se.
    $$(".atr [data-f]",dlg).forEach(el=>{
      const aplica=()=>{const i=+el.closest(".atr").dataset.i;j.atribuicoes[i][el.dataset.f]=el.value;};
      if(el.tagName==="SELECT")el.onchange=()=>{
        aplica();
        // Num jogo novo, mudar quem é o principal leva o transporte com ele.
        if((el.dataset.f==="funcao"||el.dataset.f==="membroId")&&(novo||isNovoRegisto))acertaDeslocacao();
        drawAtrs();
      };
      else el.oninput=()=>{aplica();refreshCalc();};
    });
  }
  function refreshCalc(){
    const jCtx={...j,tipo:$("#fTipo").value,escalao:escalaoAtual()};
    $$(".atr",dlg).forEach(el=>{
      const a=j.atribuicoes[+el.dataset.i];
      if(!a)return;
      const c=atrCalc(jCtx,a);
      const cal=$(".calc",el);
      if(cal)cal.innerHTML=calcHTML(a,jCtx);
      const w=$(".semtarifa",el);
      if(w)w.style.display=c.found?"none":"block";
    });
    $("#fTot",dlg).textContent=fmt(totalAtual());
    updPag();
  }
  /* Que funções é que a tabela conhece para o escalão que está escolhido. */
  function funcoesDoEscalao(){
    const esc=escalaoAtual(), tp=$("#fTipo",dlg)?$("#fTipo",dlg).value:j.tipo;
    return [...new Set(S.tabela.filter(daEpoca)
      .filter(r=>norm(r.tipo)===norm(tp)&&norm(r.escalao)===norm(esc))
      .map(r=>r.funcao))];
  }
  /* Mudar de escalão não pode deixar as pessoas numa função que esse escalão
     não usa. Só acontece quando é o ESCALÃO que muda — se fores tu a escolher
     a função, fica a tua. */
  function acertaFuncoes(){
    const disp=funcoesDoEscalao();
    if(disp.length)for(const a of j.atribuicoes)a.funcao=funcaoNoEscalao(a.funcao,disp);
    acertaDeslocacao();
  }
  /* Quando a deslocação deste tipo de jogo é um valor fixo, num jogo NOVO ela
     vem marcada — mas só para o chefe (o árbitro principal), que é quem leva o
     carro. Antes vinha marcada para todos e os assistentes tinham de a tirar
     um a um. Quem precisar dela noutra linha escolhe "Sim" à mão. Num jogo já
     gravado não se mexe. */
  function acertaDeslocacao(){
    if(!(novo||isNovoRegisto))return;
    const tp=$("#fTipo",dlg)?$("#fTipo",dlg).value:j.tipo;
    const dr=deslocRule(tp,escalaoAtual());
    const fixo=!!(dr&&dr.modo==="fixo");
    const iChefe=indiceChefe(j.atribuicoes);
    j.atribuicoes.forEach((a,i)=>{a.deslocFixa=(fixo&&i===iChefe)?"1":"";});
  }
  function sincronizaEscalao(){
    const sel=$("#fEscSel",dlg), txt=$("#fEsc",dlg);
    if(!sel||!txt)return;
    const outro=sel.value==="__outro";
    txt.style.display=outro?"block":"none";
    if(outro&&!txt.value)setTimeout(()=>txt.focus(),0);
    acertaFuncoes();
    drawAtrs();
  }
  // Ligados já, e não num setTimeout: o formulário já está no DOM, e mudar o
  // tipo logo a seguir a abrir (um toque rápido, ou um teste) caía antes de o
  // evento existir e deixava os escalões do tipo anterior.
  {
    const sel=$("#fEscSel",dlg), txt=$("#fEsc",dlg), tipo=$("#fTipo",dlg);
    if(sel)sel.addEventListener("change",sincronizaEscalao);
    if(txt)txt.addEventListener("input",drawAtrs);
    if(tipo)tipo.addEventListener("change",()=>{
      // muda o tipo, mudam os escalões que existem na tabela — e, num jogo novo,
      // muda também a equipa habitual desse tipo de jogo
      const molde=(novo||isNovoRegisto)?null:null;
      const anterior=escalaoAtual();
      const m=novo?moldeDoUltimo(tipo.value):null;
      const escolha=(m&&m.escalao&&!escaloesDe(tipo.value).some(e=>norm(e)===norm(anterior)))?m.escalao:anterior;
      sel.innerHTML=opcoesEsc(tipo.value,escolha);
      if(m&&m.atribuicoes.length&&novo)j.atribuicoes=m.atribuicoes;
      sincronizaEscalao();
    });
    const loc=$("#fLoc",dlg);
    if(loc){loc.addEventListener("change",aplicaSugestoesKm);loc.addEventListener("input",aplicaSugestoesKm);}
  }
  $("#addAtr",dlg).onclick=()=>{
    const mb=S.membros.find(m=>!j.atribuicoes.some(a=>a.membroId===m.id))||S.membros[0];
    const drA=deslocRule($("#fTipo",dlg)?$("#fTipo",dlg).value:j.tipo,escalaoAtual());
    const nova={membroId:mb?.id,
      funcao:funcaoNoEscalao(funcaoDoMembro(mb),funcoesDoEscalao()),
      almocoId:"",km:"",override:"",deslocFixa:""};
    // Só o chefe leva transporte — e só se ainda ninguém o tiver neste jogo.
    if(drA&&drA.modo==="fixo"&&indiceChefe([nova])===0&&!j.atribuicoes.some(a=>a.deslocFixa))nova.deslocFixa="1";
    j.atribuicoes.push(nova);
    drawAtrs();
  };
  $("#fCancel",dlg).onclick=()=>dlg.close();
  $("#fSave",dlg).onclick=async()=>{
    j.data=$("#fData").value; j.hora=$("#fHora").value; j.tipo=$("#fTipo").value;
    j.escalao=escalaoAtual(); j.equipaA=$("#fEqA").value.trim(); j.equipaB=$("#fEqB").value.trim();
    j.local=$("#fLoc").value.trim(); j.estado=$("#fEst").value;
    j.epocaId=j.epocaId||epAtiva().id;
    if(!j.data){toast("Falta a data");return;}
    j.atribuicoes=j.atribuicoes.filter(a=>a.membroId);
    // Guardar números, não o que foi escrito: "12,50" fica 12.5.
    for(const a of j.atribuicoes){
      a.km=(String(a.km??"").trim()==="")?"":num0(a.km);
      a.override=(String(a.override??"").trim()==="")?"":num0(a.override);
      // Congela o valor. Se mudou alguma coisa que entra no cálculo, recalcula;
      // se não mudou, fica o que estava — a tabela não reescreve o passado.
      const k=chaveCalculo(j,a);
      if(!temValorFixo(a)||a.calcKey!==k){a.valor=atrCalculado(j,a);a.calcKey=k;}
    }
    if(!j.atribuicoes.length){toast("Adiciona pelo menos um membro (linhas 'fora da equipa' são ignoradas)");return;}
    // Aprende a distância deste campo para cada pessoa, para a próxima ida lá.
    if(j.local)for(const a of j.atribuicoes)await guardaDistancia(a.membroId,j.local,a.km);
    // Gravar o jogo é a operação mais importante da app e a que mais vezes é
    // feita à pressa à saída do balneário. Por isso: o botão fica ocupado, o
    // diálogo só fecha depois de a base de dados confirmar, e se falhar fica
    // tudo como está — o que foi preenchido não se perde.
    ocupado("#fSave","A gravar…");
    const ok=await guardaJogo(j);
    livre("#fSave","Guardar");
    if(!ok)return;
    for(const a of j.atribuicoes)if(a.nomeSms&&a.membroId){
      const mb=S.membros.find(x=>x.id===a.membroId);
      if(mb&&norm(mb.alias||"")!==norm(a.nomeSms)){mb.alias=a.nomeSms;await guarda("membros",mb);}
    }
    const ix=S.jogos.findIndex(x=>x.id===j.id);
    if(ix>=0)S.jogos[ix]=j; else S.jogos.push(j);
    confirmaGravado();dlg.close();render();toast("Jogo guardado");
  };
  // Só num jogo NOVO. Num jogo já gravado, mexer na função mudava o passado —
  // e se a combinação não existe, o aviso é merecido e tem de aparecer.
  if(novo||isNovoRegisto)acertaFuncoes();
  drawAtrs(); abreDlg(dlg);
}

/* ============ Convocatória (colar mensagem) ============ */
/* Segunda tentativa, para mensagens fora do formato com "#": procura a data, a
   hora, as equipas e as funções onde estiverem. Só corre quando a primeira
   falha, para não estragar o que já funciona. */
/* Os separadores são tentados por ordem de fiabilidade: "vs" é inequívoco, o
   travessão e o hífen aparecem em datas e nomes, por isso vêm depois. Uma parte
   só com números (restos de "15:00") ou um código de função não é equipa. */
/* As convocatórias por ler ficam neste telemóvel: chegaram por SMS a ESTE
   telemóvel e não são dados da equipa. É das três únicas coisas que ainda se
   guardam localmente (as outras são o tema e a época que estou a ver). */
function guardaConvFalhada(texto){
  S.convFalhadas=[{id:criaId(),t:Date.now(),texto:String(texto||"").slice(0,1200)},...(S.convFalhadas||[])].slice(0,10);
  guardaConvFalhadas(S.convFalhadas);
}
function formConv(textoInicial){
  const dlg=$("#dlg");
  dlg.innerHTML=`<h2>Colar convocatória</h2>
  <div class="mut sub">Cola a mensagem da nomeação — a app extrai data, hora, escalão, equipas, campo e funções. Depois só confirmas quem é quem.</div>
  <label>Principal deste jogo (quem recebeu a mensagem)</label><select id="cvEu">${S.membros.map(m=>`<option value="${esc(m.id)}" ${m.id===S.settings.membroEuId?"selected":""}>${esc(m.nome)}</option>`).join("")}</select>
  <label>Mensagem</label><textarea id="cvTxt" rows="5" placeholder="1128030020 INI#CD 1 Div Sub/15#UD Fermedo*UD Mourisquense#CAMPO..."></textarea>
  <div class="btnrow"><button class="btn" id="cvCancel">Cancelar</button><button class="btn pri" id="cvGo">Analisar</button></div>`;
  if(typeof textoInicial==="string"&&textoInicial)$("#cvTxt",dlg).value=textoInicial;
  $("#cvCancel").onclick=()=>dlg.close();
  $("#cvGo").onclick=()=>{
    const bruto=$("#cvTxt").value;
    /* Pares {tipo,escalao} em vez de nomes soltos: o "S17" do Nacional não pode
       ir buscar um escalão do Distrital só porque também tem um 17 no meio. */
    const escaloes=S.tabela.filter(daEpoca).map(r=>({tipo:r.tipo,escalao:r.escalao}));
    const p=parseConv(bruto,escaloes)||parseConvLivre(bruto,escaloes.map(e=>e.escalao));
    if(!p||!p.equipaA){
      guardaConvFalhada(bruto);
      toast("Não consegui ler esta mensagem. Ficou guardada em Definições → Neste telemóvel.","erro");
      return;
    }
    const euJogo=$("#cvEu").value;
    // As funções que a tabela usa NESTE escalão ("A"/"AA" ou "1 arb"/"2 arb")
    const fdisp=[...new Set(S.tabela.filter(daEpoca)
      .filter(r=>norm(r.tipo)===norm(p.tipo||"")&&norm(r.escalao)===norm(p.escalao||""))
      .map(r=>r.funcao))];
    const fn=f=>funcaoNoEscalao(f,fdisp);

    let atr=p.nomeacoes.map(n=>{
      const mb=n.nome?matchMembro(n.nome,S.membros):null;
      return {membroId:mb?mb.id:"",funcao:fn(PAPEL_FUNCAO[n.papel]||"AA"),
              almocoId:"",km:"",override:"",nomeSms:n.nome,_papel:n.papel};
    });

    /* Eu não venho na lista de nomeações — venho no cabeçalho, com a minha
       função ("... 114010120 AA2 JUV"). Antes a app assumia que quem colava a
       mensagem era o árbitro, o que para um assistente estava sempre errado. */
    const jaEstou=atr.some(a=>a.membroId&&a.membroId===euJogo);
    if(!jaEstou){
      const minha=p.meuPapel?PAPEL_FUNCAO[p.meuPapel]
                            :funcaoDoMembro(S.membros.find(m=>m.id===euJogo));
      const eu={membroId:euJogo||S.membros[0]?.id,funcao:fn(minha||"AA"),
                almocoId:"",km:"",override:"",_papel:p.meuPapel||""};
      if((minha||"")==="A"||(minha||"")==="1 arb")atr.unshift(eu); else atr.push(eu);
    }
    /* Os rótulos AA1/AA2 saem da ordem das linhas. Com a minha função no
       cabeçalho ("... AA1 SEN"), eu entro no meu lugar e não no fim — senão o
       AA1 da mensagem aparecia como AA2 e vice-versa. */
    const ORDEM_PAPEL={A:0,A1:0,A2:1,AA1:2,AA2:3,"4A":4};
    if(atr.every(a=>a._papel in ORDEM_PAPEL))
      atr.sort((x,y)=>ORDEM_PAPEL[x._papel]-ORDEM_PAPEL[y._papel]);
    atr.forEach(a=>{delete a._papel;});

    /* O Nacional não traz nomes nenhuns: é sempre o mesmo trio. Em vez de
       deixar o jogo com uma pessoa só, copia-se a nomeação do último jogo do
       mesmo tipo — que é o que o molde já faz em toda a app. */
    /* Mas se a mensagem diz a MINHA função e mais ninguém ("1873700090 A TD
       Sub/15 Feminina", em Aveiro), é um jogo em que fui nomeado sozinho: não
       se inventa um trio. */
    if(!p.nomeacoes.length&&!p.meuPapel){
      const molde=moldeDoUltimo(p.tipo||"Distrital");
      if(molde&&molde.atribuicoes.length)
        atr=molde.atribuicoes.map(a=>({...a,funcao:fn(a.funcao)}));
    }
    const j={id:criaId(),epocaId:epAtiva().id,criadoEm:agora(),data:p.data||new Date().toISOString().slice(0,10),hora:p.hora||"15:00",
      escalao:p.escalao||"",equipaA:p.equipaA,equipaB:p.equipaB,local:p.local||"",tipo:p.tipo||"Distrital",
      estado:"agendado",numJogo:p.numJogo||"",atribuicoes:atr};
    dlg.close();
    formJogo(j,true);
    if(p.nomeacoes.length)
      toast(`Detetadas ${p.nomeacoes.length} nomeação(ões): ${p.nomeacoes.map(n=>n.papel+" "+n.nome).join(" · ")} — confirma quem é quem`);
    else if(p.meuPapel)
      toast("A mensagem só te nomeia a ti ("+p.meuPapel+"). Se houver colegas, acrescenta-os.");
    else
      toast("A mensagem não traz nomes — pus o trio do último jogo de "+(p.tipo||"Distrital")+". Confirma.");
  };
  abreDlg(dlg);
}
