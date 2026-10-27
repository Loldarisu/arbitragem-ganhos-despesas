/* js/resumo.js — Resumo, ano civil, pagamentos da associação, gráfico, relatório da época e exportações.
   Script normal (sem módulos nem build), carregado pelo index.html por esta
   ordem: base, calculo, jogos, despesas-multas, resumo, bd, conta, sessao,
   definicoes, arranque. Partilham o mesmo âmbito global, como quando eram um
   <script> só. */
"use strict";

/* ============ Resumo ============ */
/* O Resumo tem filtros seus: abrir no mês corrente e na própria pessoa não pode
   mexer no filtro que ficou escolhido no separador Jogos. */
let mesRes="all";
let membroRes="all";
function abreResumo(){
  mesRes=mesCorrente();
  membroRes=(EUMEMBRO&&EUMEMBRO.id)||"all";
}
/* Um assistente só tem os dados dele — os dos outros não chegam a esta app.
   Por isso fica sempre no próprio nome e as outras pessoas nem aparecem. */
const resumoSoMeu=()=>!!(EUMEMBRO&&EUMEMBRO.id&&!souResponsavel());
function totaisMembro(mid,pref){
  const jog=S.jogos.filter(daEpoca).filter(j=>j.estado!=="cancelado"&&(pref==="all"||j.data.startsWith(pref)));
  let g=0,n=0;
  for(const j of jog)for(const a of j.atribuicoes||[])if(a.membroId===mid){g+=atrFinal(j,a);n++;}
  const desp=S.despesas.filter(daEpoca).filter(d=>d.membroId===mid&&(pref==="all"||d.data.startsWith(pref)))
    .reduce((s,d)=>s+(d.tipoLanc==="receita"?1:-1)*(num0(d.valor)),0);
  return {ganhos:g,njogos:n,despesas:desp,liquido:g+desp};
}
/* ============ Ano civil ============
   A época vai de setembro a junho e cruza dois anos; o IRS é de janeiro a
   dezembro. Aqui conta a data do jogo e a data em que a folha foi paga, em
   todas as épocas. Não é conselho fiscal: são os números, para levar a quem
   faz a declaração. */
let anoCivil=null;
const anoDe=x=>+String(x||"").slice(0,4)||0;
function alvoAnoCivil(){ return (membroRes==="all"||resumoSoMeu())?(EUMEMBRO&&EUMEMBRO.id):membroRes; }
function dadosAnoCivil(ano,alvo){
  const jogos=S.jogos.filter(j=>anoDe(j.data)===ano&&j.estado!=="cancelado")
    .map(j=>({j,a:(j.atribuicoes||[]).find(a=>a.membroId===alvo)})).filter(x=>x.a)
    .sort((x,y)=>x.j.data.localeCompare(y.j.data));
  const apitados=jogos.filter(x=>x.j.estado!=="agendado");
  const porJogar=jogos.filter(x=>x.j.estado==="agendado");
  const pagos=S.pagamentos.filter(p=>p.membroId===alvo&&anoDe(p.data||p.mes)===ano)
    .sort((a,b)=>String(a.data||a.mes).localeCompare(String(b.data||b.mes)));
  const souEu=!!(EUMEMBRO&&alvo===EUMEMBRO.id);
  // as despesas dos outros são privadas: só entram as minhas
  const despesas=souEu?S.despesas.filter(d=>d.membroId===alvo&&anoDe(d.data)===ano):[];
  const soma=l=>l.reduce((s,x)=>s+atrFinal(x.j,x.a),0);
  return {jogos,apitados,porJogar,pagos,despesas,souEu,
    vApitados:soma(apitados),vPorJogar:soma(porJogar),
    vRecebido:pagos.reduce((s,p)=>s+num0(p.valor),0),
    vDespesas:despesas.filter(d=>d.tipoLanc!=="receita").reduce((s,d)=>s+num0(d.valor),0),
    vOutras:despesas.filter(d=>d.tipoLanc==="receita").reduce((s,d)=>s+num0(d.valor),0)};
}
function secaoAnoCivil(){
  const alvo=alvoAnoCivil(); if(!alvo)return "";
  const esteAno=new Date().getFullYear();
  const anos=new Set([esteAno]);
  for(const j of S.jogos)if((j.atribuicoes||[]).some(a=>a.membroId===alvo))anos.add(anoDe(j.data));
  for(const p of S.pagamentos)if(p.membroId===alvo)anos.add(anoDe(p.data||p.mes));
  const lista=[...anos].filter(Boolean).sort((a,b)=>b-a);
  if(!lista.includes(anoCivil))anoCivil=esteAno;
  const d=dadosAnoCivil(anoCivil,alvo);
  const nome=(S.membros.find(m=>m.id===alvo)||{}).nome||"";
  const linha=(r,v,cor)=>`<div class="list-item"><span class="sub">${r}</span><b class="${cor||""}" style="white-space:nowrap">${v}</b></div>`;
  return `<h3 class="sec" id="sec-ano">Ano civil (para o IRS)</h3>
  <div class="chips" role="group" aria-label="Ano civil">${lista.map(a=>`<button class="chip ${a===anoCivil?"on":""}" aria-pressed="${a===anoCivil}" data-ano="${a}">${a}</button>`).join("")}</div>
  <div class="card" id="cAno">
    <div class="mut sub" style="margin-bottom:6px">De janeiro a dezembro de ${anoCivil}, em todas as épocas${nome?` — <b>${esc(nome)}</b>`:""}. Conta a data do jogo e a data em que a folha foi paga.</div>
    ${linha("Jogos apitados ("+d.apitados.length+")",fmt(d.vApitados),"val")}
    ${linha("Recebido da associação ("+d.pagos.length+(d.pagos.length===1?" folha)":" folhas)"),fmt(d.vRecebido),"val")}
    ${d.porJogar.length?linha("Ainda por jogar este ano ("+d.porJogar.length+")",fmt(d.vPorJogar)):""}
    ${d.souEu?linha("As tuas despesas",fmt(d.vDespesas),"neg")+(d.vOutras?linha("Outras receitas",fmt(d.vOutras),"val"):""):""}
    <div class="btnrow"><button class="btn" id="anoCsv">Exportar ${anoCivil} (CSV)</button></div>
    <div class="mut sub" style="margin-top:8px">A app não sabe como deves declarar estes valores. Leva o CSV a quem faz a tua declaração.</div>
  </div>`;
}
function exportaAnoCivil(){
  const alvo=alvoAnoCivil(); if(!alvo)return;
  const d=dadosAnoCivil(anoCivil,alvo);
  const nome=(S.membros.find(m=>m.id===alvo)||{}).nome||"";
  const v=n=>num0(n).toFixed(2).replace(".",",");
  const rows=[["Linha","Data","Descrição","Tipo","Escalão","Função","Estado","Valor (€)"]];
  for(const {j,a} of d.jogos)
    rows.push(["Jogo",j.data,(j.equipaA||"")+" vs "+(j.equipaB||""),j.tipo,j.escalao,a.funcao,j.estado,v(atrFinal(j,a))]);
  for(const p of d.pagos)
    rows.push(["Pagamento da associação",p.data||p.mes,"Folha de "+p.mes,p.tipo,"","","pago",v(p.valor)]);
  for(const x of d.despesas)
    rows.push([x.tipoLanc==="receita"?"Receita":"Despesa",x.data,[x.categoria,x.descricao].filter(Boolean).join(" · "),"","","","",v(x.valor)]);
  rows.push([]);
  rows.push(["Total jogos apitados","","","","","","",v(d.vApitados)]);
  rows.push(["Total recebido da associação","","","","","","",v(d.vRecebido)]);
  if(d.souEu)rows.push(["Total despesas","","","","","","",v(d.vDespesas)]);
  const csv="﻿"+rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(";")).join("\r\n");
  download(`ano_${anoCivil}_${(nome||"membro").replace(/[^\p{L}\p{N}]+/gu,"_")}.csv`,csv,"text/csv;charset=utf-8");
  toast("CSV de "+anoCivil+" exportado");
}
function renderResumo(){
  if(resumoSoMeu())membroRes=EUMEMBRO.id;
  let h=chipsMeses(mesRes,m=>{mesRes=m;render();});
  if(!resumoSoMeu())h+=chipsMembros(membroRes,m=>{membroRes=m;render();});

  const membros=membroRes==="all"?S.membros:S.membros.filter(m=>m.id===membroRes);
  const tots=membros.map(m=>({m,...totaisMembro(m.id,mesRes)}));
  const totG=tots.reduce((s,t)=>s+t.ganhos,0), totL=tots.reduce((s,t)=>s+t.liquido,0);
  const jsel=S.jogos.filter(daEpoca)
    .filter(j=>mesRes==="all"||j.data.startsWith(mesRes))
    .filter(j=>membroRes==="all"||(j.atribuicoes||[]).some(a=>a.membroId===membroRes));
  const somaSel=j=>(j.atribuicoes||[]).filter(a=>membroRes==="all"||a.membroId===membroRes).reduce((s,a)=>s+atrFinal(j,a),0);
  /* O que está recebido é o que está nas folhas confirmadas — não um estado do
     jogo. "Por receber" é o que já se apitou e ainda não veio em folha nenhuma. */
  const idsSel=(membroRes==="all")?S.membros.map(m=>m.id):[membroRes];
  const recebido=S.pagamentos.filter(daEpoca)
    .filter(p=>mesRes==="all"||p.mes===mesRes)
    .filter(p=>idsSel.includes(p.membroId))
    .reduce((s,p)=>s+num0(p.valor),0);
  let porReceber=0, porJogar=0;
  for(const j of jsel){
    if(j.estado==="cancelado")continue;
    for(const a of j.atribuicoes||[]){
      if(!idsSel.includes(a.membroId))continue;
      if(j.estado==="agendado"){porJogar+=atrFinal(j,a);continue;}
      if(!participacaoPaga(j,a))porReceber+=atrFinal(j,a);
    }
  }
  h+=`<div class="total-strip">
    <div class="card stat"><span class="sico">✅</span><div><div class="mut">Recebido</div><div class="big val">${fmt(recebido)}</div></div></div>
    <div class="card stat"><span class="sico">⏳</span><div><div class="mut">Por receber — jogos já apitados</div><div class="big" style="color:var(--warn)">${fmt(porReceber)}</div></div></div>
    <div class="card stat"><span class="sico">📅</span><div><div class="mut">Por jogar — agendados</div><div class="big" style="color:var(--blue)">${fmt(porJogar)}</div></div></div>
    <div class="card stat"><span class="sico">💶</span><div><div class="mut">Total dos jogos</div><div class="big val">${fmt(totG)}</div></div></div></div>`;
  /* O líquido só pode ser o MEU: as despesas dos outros são privadas e a app
     nem as tem. Somar os jogos da equipa às minhas despesas dava um número que
     não é de ninguém. */
  {
    const eu=EUMEMBRO&&EUMEMBRO.id;
    if(eu&&(membroRes==="all"||membroRes===eu)){
      const meu=totaisMembro(eu,mesRes);
      h+=`<div class="card row"><span class="mut">O teu líquido: jogos ${fmt(meu.ganhos)} ${meu.despesas<0?"−":"+"} as tuas despesas ${fmt(Math.abs(meu.despesas))}</span><b class="big ${meu.liquido<0?"neg":"val"}" style="font-size:1.05rem">${fmt(meu.liquido)}</b></div>`;
    }
  }
  /* Uma linha por folha: mês × competição, para a pessoa que está selecionada.
     É assim que as folhas chegam, e é assim que se conferem. */
  {
    const alvo=(membroRes==="all")?(EUMEMBRO&&EUMEMBRO.id):membroRes;
    const nomeAlvo=(S.membros.find(m=>m.id===alvo)||{}).nome||"";
    h+=`<h3 class="sec">Pagamentos da associação</h3>`;
    h+=`<div class="card">`;
    h+=`<div class="mut sub" style="margin-bottom:8px">Ao fim do mês chega uma folha por competição${nomeAlvo?` — estas são as de <b>${esc(nomeAlvo)}</b>`:""}. Abre cada uma para conferir jogo a jogo antes de marcares como paga.</div>`;
    const mesesShow=(mesRes==="all"?mesesDaEpoca():[mesRes]);
    let algum=false;
    for(const mM of mesesShow){
      const tipos=tiposDoMes(mM,alvo);
      if(!tipos.length)continue;
      const[yy,mm2]=mM.split("-");
      const nomeM=NOME_MES[+mm2-1]+" "+yy;
      for(const tp of tipos){
        algum=true;
        const jogosF=jogosDaFolha(mM,tp,alvo);
        const nFeitos=jogosF.filter(j=>j.estado==="realizado").length;
        const nAg=jogosF.filter(j=>j.estado==="agendado").length;
        const calc=calcFolha(mM,tp,alvo);
        const pg=pagamentoDe(mM,tp,alvo);
        const chave=`${mM}|${tp}|${alvo}`;
        if(pg){
          const dif=num0(pg.valor)-calc;
          h+=`<div class="list-item"><div style="min-width:0">
            <b class="sub">${nomeM} · ${esc(tp)}</b>
            <div class="mut">${nFeitos} jogo(s) · calculado ${fmt(calc)}${pg.data?" · pago em "+fmtD(pg.data):""}${Math.abs(dif)>=0.005?` · <b class="${dif<0?"neg":"val"}">dif ${dif>0?"+":""}${fmt(dif)}</b>`:""}</div></div>
            <span style="flex:0 0 auto"><b class="val">✅ ${fmt(pg.valor)}</b>
            <button class="iconbtn" data-pgdel="${esc(pg.id)}" aria-label="Remover este pagamento">✕</button></span></div>`;
        }else if(calc>0){
          h+=`<div class="list-item"><div style="min-width:0">
            <b class="sub">${nomeM} · ${esc(tp)}</b>
            <div class="mut">${nFeitos} jogo(s) apitado(s)${nAg?` · ${nAg} ainda por jogar`:""}</div></div>
            <span style="flex:0 0 auto"><b style="color:var(--warn)">⏳ ${fmt(calc)}</b>
            <button class="btn sm pri" data-pgadd="${esc(chave)}">Conferir</button></span></div>`;
        }else{
          h+=`<div class="list-item"><div style="min-width:0">
            <b class="sub">${nomeM} · ${esc(tp)}</b>
            <div class="mut">${nAg} jogo(s) agendado(s) — ainda não entram em nenhuma folha</div></div>
            <span class="mut" style="flex:0 0 auto">📅 marca "Realizado" depois de apitares</span></div>`;
        }
      }
    }
    if(!algum)h+=`<div class="mut">Ainda sem jogos nesta época.</div>`;
    h+=`</div>`;
  }
  h+=`<div class="card"><div class="mut" style="margin-bottom:8px">Evolução mensal ${membroRes==="all"?"(grupo)":"("+esc(S.membros.find(m=>m.id===membroRes)?.nome||"")+")"}</div><canvas id="chart" width="600" height="170"></canvas></div>`;
  h+=`<h3 class="sec">Por pessoa</h3><div class="card">`;
  for(const t of tots){
    // As despesas e o líquido só aparecem na minha linha: as dos outros são deles.
    const souEu=EUMEMBRO&&t.m.id===EUMEMBRO.id;
    h+=`<div class="list-item"><div><b>${esc(t.m.nome)}</b><div class="mut">${t.njogos} jogo(s)${souEu?` · despesas ${fmt(t.despesas)}`:""}</div></div>
    <div style="text-align:right"><div class="val" style="font-weight:700">${fmt(t.ganhos)}</div>${souEu?`<div class="mut sub">líq. ${fmt(t.liquido)}</div>`:""}</div></div>`;
  }
  h+=`</div>`;
  const porEsc={};
  for(const j of jsel.filter(j=>j.estado!=="cancelado"))
    porEsc[j.escalao+" ("+j.tipo+")"]=(porEsc[j.escalao+" ("+j.tipo+")"]||0)+1;
  const escKeys=Object.keys(porEsc).sort((a,b)=>porEsc[b]-porEsc[a]);
  if(escKeys.length){
    h+=`<h3 class="sec">Jogos por escalão</h3><div class="card">`+escKeys.map(k=>`<div class="list-item"><span class="sub">${esc(k)}</span><b>${porEsc[k]}</b></div>`).join("")+`</div>`;
  }
  /* A secção "Exportar / Sincronizar" saiu daqui. Os backups locais deixaram de
     existir (os dados vivem na base de dados) e a exportação mudou-se para
     Definições -> Os meus dados. Ficam as duas coisas que são mesmo do Resumo:
     levar os jogos para o calendário do telemóvel e imprimir o relatório. */
  h+=secaoAnoCivil();
  h+=`<h3 class="sec">Calendário e relatório</h3><div class="card">
    <div class="btnrow" style="margin:0"><button class="btn pri" id="expIcs">📅 Calendário (.ics)</button><button class="btn" id="relBtn">🖨️ Relatório</button></div>
    <div class="mut sub" style="margin-top:6px">Leva os jogos que estás a ver para o calendário do telemóvel, com alarme às 20h da véspera (marcar horas) e 2 h antes (sair para o jogo).</div></div>`;
  $("#main").innerHTML=h;
  $("#relBtn").onclick=abreRelatorio;
  $$("[data-ano]").forEach(b=>b.onclick=()=>{anoCivil=+b.dataset.ano;keepScrollY=window.scrollY;render();});
  if($("#anoCsv"))$("#anoCsv").onclick=exportaAnoCivil;
  $("#expIcs").onclick=()=>exportaIcs(jsel.filter(j=>j.estado!=="cancelado"),`jogos_${epAtiva().nome.replace("/","-")}`);
  $$("[data-pgadd]").forEach(b=>b.onclick=()=>{
    const [mes,tipo,mid]=b.dataset.pgadd.split("|");
    formPagamento(mes,tipo,mid);
  });
  $$("[data-pgdel]").forEach(b=>b.onclick=async()=>{
    const pg=S.pagamentos.find(x=>x.id===b.dataset.pgdel);
    if(!pg)return;
    // Desmarcar já não mexe em jogo nenhum: o pagamento é o único registo do
    // que foi recebido, por isso apagá-lo chega.
    if(!await confirma("Desmarcar esta folha como paga? Os jogos ficam outra vez por receber.",
      {titulo:"Desmarcar folha",confirmar:"Desmarcar",perigo:true}))return;
    if(!await apagaNaBD("pagamentos",pg.id))return;
    S.pagamentos=S.pagamentos.filter(x=>x.id!==pg.id);
    confirmaGravado(); render();
  });
  // O gráfico é decorativo: se falhar (ex.: Canvas sem roundRect em Safari < 16.4)
  // não pode interromper o resto do separador.
  try{drawChart();}catch(err){console.warn("Gráfico indisponível:",err);}
}
/* ===========================================================================
 * Pagamentos da associação
 * ---------------------------------------------------------------------------
 * A associação não paga jogo a jogo. Paga ao fim do mês, a cada árbitro, e
 * manda UMA FOLHA POR COMPETIÇÃO — uma do Distrital, outra do Nacional. Um
 * pagamento é por isso a combinação (pessoa, mês, tipo de jogo).
 *
 * Tudo o que a app calcula entra na conferência: tarifa, deslocação e almoço,
 * porque é isso que vem na folha.
 * ========================================================================= */
const mesDe=j=>String(j.data||"").slice(0,7);

/* As competições em que esta pessoa teve jogos neste mês — uma folha por cada. */
function tiposDoMes(mes,membroId){
  return [...new Set(S.jogos.filter(daEpoca)
    .filter(j=>mesDe(j)===mes&&j.estado!=="cancelado")
    .filter(j=>(j.atribuicoes||[]).some(a=>a.membroId===membroId))
    .map(j=>j.tipo))].sort((a,b)=>String(a).localeCompare(String(b),"pt"));
}

/* Os jogos que entram numa folha, por ordem de data — é assim que a folha vem
   e é assim que se confere, linha a linha. */
function jogosDaFolha(mes,tipo,membroId){
  return S.jogos.filter(daEpoca)
    .filter(j=>mesDe(j)===mes&&norm(j.tipo)===norm(tipo)&&j.estado!=="cancelado")
    .filter(j=>(j.atribuicoes||[]).some(a=>a.membroId===membroId))
    .sort((x,y)=>String(x.data).localeCompare(String(y.data)));
}

/* Quanto é que esta pessoa tem a receber nesta folha. Só os jogos que já se
   realizaram — os que ainda estão agendados não entram no mês. */
function calcFolha(mes,tipo,membroId){
  let t=0;
  for(const j of jogosDaFolha(mes,tipo,membroId)){
    if(j.estado!=="realizado")continue;
    for(const a of j.atribuicoes||[])if(a.membroId===membroId)t+=atrFinal(j,a);
  }
  return t;
}

function pagamentoDe(mes,tipo,membroId){
  return S.pagamentos.find(p=>daEpoca(p)&&p.mes===mes
    &&norm(p.tipo||"")===norm(tipo||"")&&p.membroId===membroId);
}

/* Esta participação já foi paga? Não é o jogo que está pago — é a pessoa, no
   mês e na competição daquele jogo. */
function participacaoPaga(j,a){
  return !!(a&&a.membroId&&pagamentoDe(mesDe(j),j.tipo,a.membroId));
}
/* Conferir uma folha. É o momento em que o Pedro tem a folha da associação na
   mão e quer saber se o que lá está bate certo com o que fez. Por isso mostra
   os jogos um a um, pela ordem em que vêm na folha, com o valor de cada. */
function formPagamento(mes,tipo,membroId){
  const jogos=jogosDaFolha(mes,tipo,membroId).filter(j=>j.estado==="realizado");
  const calc=calcFolha(mes,tipo,membroId);
  const[y,mm]=mes.split("-");
  const membro=S.membros.find(m=>m.id===membroId);
  const linha=j=>{
    const a=(j.atribuicoes||[]).find(x=>x.membroId===membroId);
    const alm=S.almocos.find(x=>x.id===(a&&a.almocoId));
    const det=[esc(j.escalao)||"—",esc(a?a.funcao:""),
               (a&&num0(a.km)>0)?numTxt(a.km)+" km":"",
               alm?"almoço "+esc(alm.nome):""].filter(Boolean).join(" · ");
    return `<div class="list-item"><div style="min-width:0">
      <b class="sub">${fmtD(j.data)} · ${esc(j.equipaA)} vs ${esc(j.equipaB)}</b>
      <div class="mut sub">${det}</div></div>
      <b class="sub val" style="flex:0 0 auto">${fmt(atrFinal(j,a))}</b></div>`;
  };
  const dlg=$("#dlg");
  dlg.innerHTML=`<h2>Folha de ${esc(tipo)} — ${NOME_MES[+mm-1]} ${y}</h2>
  <div class="mut sub">${membro?esc(membro.nome)+" · ":""}${jogos.length} jogo(s) apitado(s). Confere com a folha que recebeste, linha a linha.</div>
  <div class="card" style="margin-top:10px;max-height:38vh;overflow:auto">
    ${jogos.length?jogos.map(linha).join(""):`<div class="mut">Nenhum jogo apitado neste mês.</div>`}
  </div>
  <div class="card row" style="margin-top:8px"><span class="mut">Total calculado pela app</span><b class="big val" style="font-size:1.05rem">${fmt(calc)}</b></div>
  <label for="pgV">Valor que veio na folha (€)</label>
  <input type="text" inputmode="decimal" id="pgV" value="${esc(numTxt(calc.toFixed(2)))}">
  <div class="mut sub" id="pgDif" style="margin-top:4px"></div>
  <label for="pgD">Data em que recebeste</label>
  <input type="date" id="pgD" value="${esc(new Date().toISOString().slice(0,10))}">
  <div class="btnrow"><button class="btn" id="pgCancel">Cancelar</button><button class="btn pri" id="pgSave">Marcar como paga</button></div>`;
  const upd=()=>{
    const v=num($("#pgV").value);
    if(isNaN(v)){$("#pgDif").textContent="";return;}
    const dif=v-calc;
    $("#pgDif").innerHTML=Math.abs(dif)<0.005
      ? '<b class="val">✓ bate certo com o que a app calculou</b>'
      : `Diferença face ao calculado: <b class="${dif<0?"neg":"val"}">${dif>0?"+":""}${fmt(dif)}</b> — vale a pena ver qual das linhas não bate.`;
  };
  $("#pgV").oninput=upd; upd();
  $("#pgCancel").onclick=()=>dlg.close();
  $("#pgSave").onclick=async()=>{
    const v=num($("#pgV").value);
    if(isNaN(v)||v<0){toast("Indica o valor que veio na folha — usa vírgula, como 304,90","erro");return;}
    ocupado("#pgSave","A gravar…");
    const pg={id:criaId(),epocaId:epAtiva().id,membroId,tipo,mes,valor:v,data:$("#pgD").value};
    if(!await guarda("pagamentos",pg)){livre("#pgSave","Marcar como paga");return;}
    S.pagamentos.push(pg);
    livre("#pgSave","Marcar como paga");
    confirmaGravado();dlg.close();render();toast("Folha marcada como paga ✅");
  };
  abreDlg(dlg);
}
// Canvas.roundRect só existe no Safari 16.4+; fallback com arcTo para iOS mais antigo.
function barraArredondada(ctx,x,y,w,h,r){
  ctx.beginPath();
  if(typeof ctx.roundRect==="function"){ctx.roundRect(x,y,w,h,r);return;}
  const rr=Math.max(0,Math.min(r,w/2,h/2));
  ctx.moveTo(x+rr,y);
  ctx.arcTo(x+w,y,x+w,y+h,rr);
  ctx.arcTo(x+w,y+h,x,y+h,rr);
  ctx.arcTo(x,y+h,x,y,rr);
  ctx.arcTo(x,y,x+w,y,rr);
  ctx.closePath();
}
function drawChart(){
  const c=$("#chart");if(!c)return;
  const ctx=c.getContext("2d");
  const cs=getComputedStyle(document.documentElement);
  const acc=cs.getPropertyValue("--acc").trim(),mut=cs.getPropertyValue("--mut").trim();
  const ms=mesesDaEpoca();
  const vals=ms.map(m=>S.jogos.filter(daEpoca).filter(j=>j.estado!=="cancelado"&&j.data.startsWith(m))
    .reduce((s,j)=>s+(j.atribuicoes||[]).filter(a=>membroRes==="all"||a.membroId===membroRes).reduce((x,a)=>x+atrFinal(j,a),0),0));
  const max=Math.max(...vals,1);
  const W=c.width,H=c.height,bw=W/ms.length;
  ctx.clearRect(0,0,W,H);
  let fill=acc;
  if(ctx.createLinearGradient){const g=ctx.createLinearGradient(0,16,0,H-24);g.addColorStop(0,"#34d399");g.addColorStop(1,"#059669");fill=g;}
  ctx.font="20px system-ui";ctx.textAlign="center";
  c.setAttribute("role","img");
  c.setAttribute("aria-label","Evolução mensal: "+ms.map((m,i)=>NOME_MES[+m.split("-")[1]-1]+" "+fmt(vals[i])).join("; "));
  ms.forEach((m,i)=>{
    const h=(vals[i]/max)*(H-46);
    ctx.fillStyle=fill;ctx.globalAlpha=vals[i]?1:.18;
    barraArredondada(ctx,i*bw+bw*.2,H-24-h,bw*.6,Math.max(h,3),4);ctx.fill();
    ctx.globalAlpha=1;ctx.fillStyle=mut;
    ctx.fillText(NOME_MES[+m.split("-")[1]-1].slice(0,3),i*bw+bw/2,H-6);
    if(vals[i])ctx.fillText(Math.round(vals[i])+"€",i*bw+bw/2,H-30-h);
  });
}

/* ============ Relatório da época ============
   Sai em HTML e imprime-se pelo browser (Imprimir → Guardar como PDF), em vez
   de arrastar uma biblioteca de PDF para dentro de um ficheiro que se quer
   leve e sem dependências. */
function tabelaRel(cabecas,linhas,rodape){
  const th=cabecas.map(c=>`<th class="${c.n?"n":""}">${esc(c.t)}</th>`).join("");
  const tr=linhas.map(l=>"<tr>"+l.map((v,i)=>`<td class="${cabecas[i]&&cabecas[i].n?"n":""}">${v}</td>`).join("")+"</tr>").join("");
  const tf=rodape?`<tfoot><tr>${rodape.map((v,i)=>`<td class="${cabecas[i]&&cabecas[i].n?"n":""}">${v}</td>`).join("")}</tr></tfoot>`:"";
  return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody>${tf}</table>`;
}
function conteudoRelatorio(){
  const ep=epAtiva();
  const jogos=S.jogos.filter(daEpoca).filter(j=>j.estado!=="cancelado");
  const desp=S.despesas.filter(daEpoca);
  let h=`<h1>Arbitragem — relatório da época ${esc(ep.nome)}</h1>
  <div class="meta">${esc(S.settings.equipa||"Arbitragem")} — gerado a ${esc(new Date().toLocaleDateString("pt-PT"))} · ${jogos.length} jogo(s)</div>`;

  // por mês
  const meses=mesesDaEpoca().map(m=>{
    const js=jogos.filter(j=>j.data.startsWith(m));
    const pg=pagamentoDe(m);
    return {m,n:js.length,bruto:js.reduce((s,j)=>s+jogoTotal(j),0),recebido:pg?(num0(pg.valor)):null};
  }).filter(x=>x.n);
  if(meses.length){
    h+=`<h2>Por mês</h2>`+tabelaRel(
      [{t:"Mês"},{t:"Jogos",n:1},{t:"Calculado",n:1},{t:"Recebido",n:1}],
      meses.map(x=>{const[y,mm]=x.m.split("-");return [esc(NOME_MES[+mm-1]+" "+y),String(x.n),fmt(x.bruto),x.recebido==null?"—":fmt(x.recebido)];}),
      ["Total",String(meses.reduce((s,x)=>s+x.n,0)),fmt(meses.reduce((s,x)=>s+x.bruto,0)),fmt(meses.reduce((s,x)=>s+(x.recebido||0),0))]);
  }
  // por pessoa
  const tots=S.membros.map(m=>({m,...totaisMembro(m.id,"all")})).filter(t=>t.njogos||t.despesas);
  if(tots.length){
    // Despesas e líquido só na linha de quem imprime: as dos outros são privadas.
    const eu=EUMEMBRO&&EUMEMBRO.id;
    h+=`<h2>Por pessoa</h2>`+tabelaRel(
      [{t:"Nome"},{t:"Jogos",n:1},{t:"Ganhos",n:1},{t:"Despesas",n:1},{t:"Líquido",n:1}],
      tots.map(t=>t.m.id===eu
        ?[esc(t.m.nome),String(t.njogos),fmt(t.ganhos),fmt(t.despesas),fmt(t.liquido)]
        :[esc(t.m.nome),String(t.njogos),fmt(t.ganhos),"—","—"]),
      ["Total",String(tots.reduce((s,t)=>s+t.njogos,0)),fmt(tots.reduce((s,t)=>s+t.ganhos,0)),"",""]);
  }
  // por escalão
  const porEsc={};
  for(const j of jogos){const k=j.escalao+" ("+j.tipo+")";porEsc[k]=porEsc[k]||{n:0,v:0};porEsc[k].n++;porEsc[k].v+=jogoTotal(j);}
  const ks=Object.keys(porEsc).sort((a,b)=>porEsc[b].n-porEsc[a].n);
  if(ks.length)h+=`<h2>Por escalão</h2>`+tabelaRel([{t:"Escalão"},{t:"Jogos",n:1},{t:"Valor",n:1}],
    ks.map(k=>[esc(k),String(porEsc[k].n),fmt(porEsc[k].v)]));
  // despesas por categoria
  const porCat={};
  for(const d of desp){const v=(d.tipoLanc==="receita"?1:-1)*(num0(d.valor));porCat[d.categoria||"Outro"]=(porCat[d.categoria||"Outro"]||0)+v;}
  const kc=Object.keys(porCat).sort();
  if(kc.length)h+=`<h2>Despesas e receitas extra (só as tuas)</h2>`+tabelaRel([{t:"Categoria"},{t:"Valor",n:1}],
    kc.map(k=>[esc(k),fmt(porCat[k])]),["Total",fmt(kc.reduce((s,k)=>s+porCat[k],0))]);
  // multas e fundo
  const mult=S.multas.filter(daEpoca);
  const entradas=mult.filter(m=>m.pago).reduce((s,m)=>s+(num0(m.valor)),0);
  const porCobrar=mult.filter(m=>!m.pago).reduce((s,m)=>s+(num0(m.valor)),0);
  const saidas=(S.fundo||[]).filter(daEpoca).reduce((s,f)=>s+(num0(f.valor)),0);
  if(mult.length||saidas){
    const porPessoa={};
    for(const m of mult){const mb=S.membros.find(x=>x.id===m.membroId);const k=mb?mb.nome:"—";
      porPessoa[k]=porPessoa[k]||{n:0,pago:0,dev:0};porPessoa[k].n++;
      if(m.pago)porPessoa[k].pago+=num0(m.valor);else porPessoa[k].dev+=num0(m.valor);}
    h+=`<h2>Multas e fundo da equipa</h2>`+tabelaRel(
      [{t:"Nome"},{t:"Multas",n:1},{t:"Pagas",n:1},{t:"Por pagar",n:1}],
      Object.keys(porPessoa).sort().map(k=>[esc(k),String(porPessoa[k].n),fmt(porPessoa[k].pago),fmt(porPessoa[k].dev)]),
      ["Total",String(mult.length),fmt(entradas),fmt(porCobrar)]);
    h+=tabelaRel([{t:"Fundo"},{t:"Valor",n:1}],
      [["Entradas (multas pagas)",fmt(entradas)],["Saídas (gastos da equipa)","− "+fmt(saidas)]],
      ["Saldo",fmt(entradas-saidas)]);
    const movs=(S.fundo||[]).filter(daEpoca).sort((a,b)=>String(a.data).localeCompare(String(b.data)));
    if(movs.length)h+=tabelaRel([{t:"Gasto"},{t:"Data"},{t:"Valor",n:1}],
      movs.map(f=>[esc(f.descricao||"Gasto"),esc(fmtD(f.data)),fmt(f.valor)]));
  }
  // lista dos jogos
  if(jogos.length){
    const ord=[...jogos].sort((a,b)=>a.data.localeCompare(b.data));
    h+=`<h2>Jogos da época</h2>`+tabelaRel(
      [{t:"Data"},{t:"Jogo"},{t:"Escalão"},{t:"Estado"},{t:"Valor",n:1}],
      ord.map(j=>[esc(fmtD(j.data)),esc(j.equipaA+" vs "+j.equipaB),esc(j.escalao+" · "+j.tipo),esc(j.estado),fmt(jogoTotal(j))]),
      ["","","","Total",fmt(ord.reduce((s,j)=>s+jogoTotal(j),0))]);
  }
  return h;
}
function abreRelatorio(){
  const antigo=$("#relatorio");if(antigo)antigo.remove();
  const d=document.createElement("div");
  d.id="relatorio";
  d.innerHTML=`<div class="rel-bar no-print"><button class="btn" id="relFechar">Fechar</button>
    <button class="btn pri" id="relImp">🖨️ Imprimir / PDF</button></div>`+conteudoRelatorio();
  document.body.appendChild(d);
  document.body.classList.add("rel-on");
  $("#relFechar").onclick=()=>{d.remove();document.body.classList.remove("rel-on");};
  $("#relImp").onclick=()=>{try{window.print();}catch(_){toast("O browser não deixou abrir a impressão","erro");}};
}

/* ============ Exportar / Importar ============ */
function download(name,content,type){
  const b=new Blob([content],{type});
  const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),3000);
}
function exportCsv(){
  // As duas últimas colunas mudaram com o modelo: já não há "valor recebido por
  // jogo", há a folha do mês daquela competição.
  const rows=[["Data","Dia","Hora","Tipo","Escalão","Equipa A","Equipa B","Local","Estado","Membro","Função","Almoço","Km","Valor (€)","Folha paga?","Data da folha"]];
  for(const j of S.jogos.filter(daEpoca).sort((a,b)=>a.data.localeCompare(b.data)))
    for(const a of j.atribuicoes||[]){
      const m=S.membros.find(x=>x.id===a.membroId);
      const alm=S.almocos.find(x=>x.id===a.almocoId);
      rows.push([j.data,diaSem(j.data),j.hora||"",j.tipo,j.escalao,j.equipaA,j.equipaB,j.local||"",j.estado,m?m.nome:"",a.funcao,alm?alm.nome:"",a.km||"",atrFinal(j,a).toFixed(2).replace(".",","),
        (()=>{const pg=pagamentoDe(mesDe(j),j.tipo,a.membroId);return pg?"sim":"não";})(),
        (()=>{const pg=pagamentoDe(mesDe(j),j.tipo,a.membroId);return pg&&pg.data?pg.data:"";})()]);
    }
  const csv="﻿"+rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(";")).join("\r\n");
  download(`jogos_${epAtiva().nome.replace("/","-")}.csv`,csv,"text/csv;charset=utf-8");
  toast("CSV exportado");
}
/* Exportar é para a pessoa levar os dados dela para fora da app — não é um
   backup para repor por cima. Repor por cima apagaria trabalho de outra pessoa
   da equipa, e por isso o botão de restaurar saiu. */
function exportJson(){
  const fora={
    exportadoEm:new Date().toISOString(),
    equipa:EQUIPA?EQUIPA.nome:"",
    epocas:S.epocas, membros:S.membros.map(m=>({id:m.id,nome:m.nome,funcao:m.funcao,papel:m.papel})),
    tabela:S.tabela, almocos:S.almocos, artigos:S.artigos,
    jogos:S.jogos, despesas:S.despesas, multas:S.multas,
    pagamentos:S.pagamentos, fundo:S.fundo, distancias:S.distancias
  };
  download(`arbitragem_${new Date().toISOString().slice(0,10)}.json`,
           JSON.stringify(fora,null,2),"application/json");
  toast("Exportado");
}
