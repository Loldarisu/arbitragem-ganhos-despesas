/* js/despesas-multas.js — Despesas pessoais, multas e fundo da equipa.
   Script normal (sem módulos nem build), carregado pelo index.html por esta
   ordem: base, calculo, jogos, despesas-multas, resumo, bd, conta, sessao,
   definicoes, arranque. Partilham o mesmo âmbito global, como quando eram um
   <script> só. */
"use strict";

/* ============ Despesas ============ */
let mesDesp="all";
/* As despesas são de cada um. A base de dados já só devolve as minhas; o
   filtro aqui é só para o caso de alguma vez vir outra coisa. */
function renderDespesas(){
  const eu=EUMEMBRO&&EUMEMBRO.id;
  const ds=S.despesas.filter(daEpoca)
    .filter(d=>d.membroId===eu)
    .filter(d=>mesDesp==="all"||d.data.startsWith(mesDesp))
    .sort((a,b)=>b.data.localeCompare(a.data));
  const tot=ds.reduce((s,d)=>s+(d.tipoLanc==="receita"?1:-1)*(num0(d.valor)),0);
  let h=chipsMeses(mesDesp,m=>{mesDesp=m;render();});
  h+=`<div class="mut sub" style="margin:2px 2px 8px">🔒 As tuas despesas são só tuas — ninguém da equipa as vê, nem o responsável.</div>`;
  h+=`<div class="card row"><span class="mut">${ds.length} lançamento(s)</span><span class="big ${tot<0?"neg":"val"}">${fmt(tot)}</span></div>`;
  if(!ds.length)h+=`<div class="empty"><span class="eico">🧾</span>Sem despesas neste período.<div class="mut sub" style="margin-top:6px">Almoços, jantares, gota, combustível — toca no + para lançar.</div></div>`;
  for(const d of ds){
    const v=(d.tipoLanc==="receita"?1:-1)*(num0(d.valor));
    // data-desp em vez de data-act: o data-act é escondido a quem não é
    // responsável, e aqui toda a gente mexe nas suas.
    h+=`<div class="card row" data-id="${esc(d.id)}"><div style="min-width:0"><b>${esc(d.categoria)}</b>
      <div class="mut">${fmtD(d.data)}${d.descricao?" · "+esc(d.descricao):""}</div></div>
      <div style="text-align:right;flex:0 0 auto"><div class="${v<0?"neg":"val"}" style="font-weight:700">${fmt(v)}</div>
      <button class="btn sm" data-desp="edit">Editar</button> <button class="btn sm dngr" data-desp="del" aria-label="Apagar lançamento">✕</button></div></div>`;
  }
  $("#main").innerHTML=h;
  $$('[data-desp]').forEach(b=>b.onclick=async()=>{
    const id=b.closest(".card").dataset.id, d=S.despesas.find(x=>x.id===id);
    if(b.dataset.desp==="edit")formDespesa(d);
    else if(await confirma("Apagar este lançamento?",{titulo:"Apagar",confirmar:"Apagar",perigo:true}))apagaRegisto("despesas",id,"Lançamento");
  });
}

/* Gastos de fim de semana de um árbitro. As que já usaste aparecem também,
   para não teres de escrever a mesma coisa duas vezes. */
const CATEGORIAS_DESPESA=["Almoço","Jantar","Lanche","Café","Gota","Combustível","Portagens","Estacionamento","Equipamento","Outro"];
function categoriasDespesa(){
  const usadas=S.despesas.map(d=>d.categoria).filter(Boolean);
  return [...new Set([...CATEGORIAS_DESPESA,...usadas])];
}

/* ============ Gota: valor gasto, ou calculado pelos km ============
   Há quem prefira escrever o que gastou e há quem prefira fazer a conta:
   km × média (L/100 km) ÷ 100 × preço (€/L). As duas opções ficam
   disponíveis; o telemóvel lembra-se da última escolhida e do último preço e
   média, porque são de quem usa este telemóvel e mudam pouco. A conta fica
   escrita na descrição, para se ver depois e para voltar a preencher os
   campos ao editar — sem mudar nada na base de dados. */
const K_GOTA="arbGota";
const eGota=c=>norm(c)==="gota";
function leGota(){try{return JSON.parse(localStorage.getItem(K_GOTA))||{};}catch(_){return {};}}
function guardaGota(v){try{localStorage.setItem(K_GOTA,JSON.stringify({...leGota(),...v}));}catch(_){}}
const RE_CONTA_GOTA=/(\d+(?:[.,]\d+)?) km · (\d+(?:[.,]\d+)?) L\/100 km · (\d+(?:[.,]\d+)?) €\/L/;
const contaGota=(km,media,preco)=>Math.round(km*media/100*preco*100)/100;
const textoGota=(km,media,preco)=>`${numTxt(km)} km · ${numTxt(media)} L/100 km · ${numTxt(preco)} €/L`;

function formDespesa(d){
  const novo=!d;
  // A despesa é sempre de quem a lança: não há "quem" para escolher.
  d=d?{...d}:{id:criaId(),epocaId:epAtiva().id,membroId:EUMEMBRO&&EUMEMBRO.id,data:new Date().toISOString().slice(0,10),categoria:"",descricao:"",valor:"",tipoLanc:"despesa"};
  const cats=categoriasDespesa();
  const dlg=$("#dlg");
  dlg.innerHTML=`<h2>${novo?"Nova despesa":"Editar lançamento"}</h2>
  <label>O quê</label>
  <div class="chips" role="group" aria-label="Categoria" style="flex-wrap:wrap;margin:4px 0 2px" id="dCats">
    ${cats.map(c=>`<button type="button" class="chip ${c===d.categoria?"on":""}" data-cat="${esc(c)}" aria-pressed="${c===d.categoria}">${esc(c)}</button>`).join("")}
  </div>
  <input id="dC" value="${esc(d.categoria)}" placeholder="ou escreve outra" style="margin-top:6px">
  <div class="grid2"><div><label>Data</label><input type="date" id="dD" value="${esc(d.data)}"></div>
  <div><label>Tipo</label><select id="dT"><option value="despesa" ${d.tipoLanc==="despesa"?"selected":""}>Despesa (−)</option><option value="receita" ${d.tipoLanc==="receita"?"selected":""}>Receita (+)</option></select></div></div>
  <label>Descrição</label><input id="dDesc" value="${esc(d.descricao)}">
  <div id="dGota" hidden>
    <div class="chips" role="group" aria-label="Como registar a gota" style="margin:10px 0 0;padding-bottom:4px">
      <button type="button" class="chip" data-gmodo="valor" aria-pressed="false">Valor gasto</button>
      <button type="button" class="chip" data-gmodo="calc" aria-pressed="false">Calcular pelos km</button>
    </div>
    <div id="dGCalc" hidden>
      <div class="grid2">
        <div><label>Km feitos</label><input type="text" inputmode="decimal" id="dGKm" placeholder="ex.: 120"></div>
        <div><label>Média (L/100 km)</label><input type="text" inputmode="decimal" id="dGMed" placeholder="ex.: 6,5"></div>
      </div>
      <label>Preço (€/L)</label><input type="text" inputmode="decimal" id="dGPre" placeholder="ex.: 1,70">
      <div class="mut sub" id="dGConta" role="status" style="margin-top:8px"></div>
    </div>
  </div>
  <label>Valor (€)</label><input type="text" inputmode="decimal" id="dV" value="${esc(numTxt(d.valor))}" placeholder="0,00">
  <div class="btnrow"><button class="btn" id="dCancel">Cancelar</button><button class="btn pri" id="dSave">Guardar</button></div>`;
  // Gota: mostrar as duas opções só nessa categoria
  const gota=leGota();
  const lida=(d.descricao||"").match(RE_CONTA_GOTA);
  let gModo=lida?"calc":(novo?(gota.modo||"valor"):"valor");
  if(lida){$("#dGKm",dlg).value=lida[1];$("#dGMed",dlg).value=lida[2];$("#dGPre",dlg).value=lida[3];
    $("#dDesc",dlg).value=(d.descricao||"").replace(RE_CONTA_GOTA,"").replace(/\s*·\s*$/,"").trim();}
  else{ if(gota.media)$("#dGMed",dlg).value=gota.media; if(gota.preco)$("#dGPre",dlg).value=gota.preco; }
  const valoresGota=()=>({km:num($("#dGKm",dlg).value),media:num($("#dGMed",dlg).value),preco:num($("#dGPre",dlg).value)});
  const pintaGota=()=>{
    const vis=eGota($("#dC",dlg).value);
    $("#dGota",dlg).hidden=!vis;
    const calc=vis&&gModo==="calc";
    $$("[data-gmodo]",dlg).forEach(b=>{const on=b.dataset.gmodo===gModo;b.classList.toggle("on",on);b.setAttribute("aria-pressed",on);});
    $("#dGCalc",dlg).hidden=!calc;
    $("#dV",dlg).readOnly=calc;
    if(!calc)return;
    const {km,media,preco}=valoresGota();
    if([km,media,preco].every(x=>!isNaN(x)&&x>0)){
      const litros=Math.round(km*media/100*100)/100, v=contaGota(km,media,preco);
      $("#dGConta",dlg).textContent=`${numTxt(km)} km × ${numTxt(media)} L/100 km = ${numTxt(litros)} L × ${numTxt(preco)} €/L = ${fmt(v)}`;
      $("#dV",dlg).value=numTxt(v);
    }else{
      $("#dGConta",dlg).textContent="Preenche os km, a média e o preço — o valor é calculado sozinho.";
      $("#dV",dlg).value="";
    }
  };
  $$("[data-gmodo]",dlg).forEach(b=>b.onclick=()=>{gModo=b.dataset.gmodo;guardaGota({modo:gModo});pintaGota();});
  ["#dGKm","#dGMed","#dGPre"].forEach(id=>$(id,dlg).oninput=pintaGota);
  // Um toque na categoria escolhe-a; o campo por baixo é para as que não estão lá.
  $$("[data-cat]",dlg).forEach(b=>b.onclick=()=>{
    $("#dC",dlg).value=b.dataset.cat;
    $$("[data-cat]",dlg).forEach(x=>{const on=x===b;x.classList.toggle("on",on);x.setAttribute("aria-pressed",on);});
    pintaGota();
  });
  $("#dC",dlg).oninput=()=>{$$("[data-cat]",dlg).forEach(x=>{
    const on=x.dataset.cat===$("#dC",dlg).value.trim();x.classList.toggle("on",on);x.setAttribute("aria-pressed",on);});
    pintaGota();};
  pintaGota();
  $("#dCancel").onclick=()=>dlg.close();
  $("#dSave").onclick=async()=>{
    d.membroId=EUMEMBRO&&EUMEMBRO.id;d.data=$("#dD").value;d.categoria=$("#dC").value.trim()||"Outro";
    d.tipoLanc=$("#dT").value;d.descricao=$("#dDesc").value.trim();d.valor=num($("#dV").value);
    if(eGota(d.categoria)&&gModo==="calc"){
      const {km,media,preco}=valoresGota();
      if(![km,media,preco].every(x=>!isNaN(x)&&x>0)){toast("Para calcular a gota preenche os km, a média e o preço — usa vírgula, como 6,5","erro");return;}
      d.valor=contaGota(km,media,preco);
      d.descricao=[d.descricao,textoGota(km,media,preco)].filter(Boolean).join(" · ");
      guardaGota({modo:"calc",media:numTxt(media),preco:numTxt(preco)});
    }else if(eGota(d.categoria)){ guardaGota({modo:"valor"}); }
    if(!d.data){toast("Preenche a data","erro");return;}
    if(isNaN(d.valor)||d.valor<=0){toast("O valor tem de ser um número maior que zero — usa vírgula, como 12,50","erro");return;}
    d.epocaId=d.epocaId||epAtiva().id;
    if(!await guarda("despesas",d))return;
    const ix=S.despesas.findIndex(x=>x.id===d.id);
    if(ix>=0)S.despesas[ix]=d;else S.despesas.push(d);
    confirmaGravado();dlg.close();render();toast("Guardado");
  };
  abreDlg(dlg);
}

/* ============ Multas / Fundo da equipa ============ */
let mesMul="all";
function multaVencida(m){
  if(m.pago)return false;
  return (Date.now()-new Date(m.data+"T00:00").getTime())>7*86400000;
}
function renderMultas(){
  const ms=S.multas.filter(daEpoca)
    .filter(m=>mesMul==="all"||m.data.startsWith(mesMul))
    .filter(m=>membroSel==="all"||m.membroId===membroSel)
    .sort((a,b)=>b.data.localeCompare(a.data));
  const entradas=S.multas.filter(daEpoca).filter(m=>m.pago).reduce((s,m)=>s+(num0(m.valor)),0);
  const saidas=(S.fundo||[]).filter(daEpoca).reduce((s,f)=>s+(num0(f.valor)),0);
  const fundo=entradas-saidas;
  const porCobrar=S.multas.filter(daEpoca).filter(m=>!m.pago).reduce((s,m)=>s+(num0(m.valor)),0);
  let h=chipsMeses(mesMul,m=>{mesMul=m;render();});
  h+=chipsMembros(membroSel,m=>{membroSel=m;render();});
  h+=`<div class="total-strip">
    <div class="card stat"><span class="sico">🍻</span><div><div class="mut">Fundo disponível</div><div class="big ${fundo<0?"neg":"val"}">${fmt(fundo)}</div></div></div>
    <div class="card stat"><span class="sico">🟨</span><div><div class="mut">Por cobrar</div><div class="big" style="color:var(--warn)">${fmt(porCobrar)}</div></div></div></div>`;
  h+=`<div class="card"><div class="row"><span class="sub">Multas pagas (entradas)</span><b class="val">${fmt(entradas)}</b></div>
    <div class="row" style="margin-top:6px"><span class="sub">Gastos do fundo (saídas)</span><b class="${saidas?"neg":"mut"}">${saidas?"− "+fmt(saidas):fmt(0)}</b></div>
    <div class="row" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line)"><b class="sub">Saldo</b><b class="big ${fundo<0?"neg":"val"}" style="font-size:1.05rem">${fmt(fundo)}</b></div>`;
  {
    const movs=(S.fundo||[]).filter(daEpoca).sort((a,b)=>String(b.data).localeCompare(String(a.data)));
    if(movs.length){
      h+=`<h3 class="sec" style="margin-top:14px">Gastos do fundo</h3>`;
      for(const f of movs){
        h+=`<div class="list-item"><div style="min-width:0"><b class="sub">${esc(f.descricao||"Gasto")}</b>
          <div class="mut">${esc(fmtD(f.data))}</div></div>
          <span style="flex:0 0 auto"><b class="neg">− ${fmt(f.valor)}</b> <button class="iconbtn" data-editf="${esc(f.id)}" aria-label="Editar gasto do fundo">✎</button><button class="iconbtn" data-delf="${esc(f.id)}" aria-label="Apagar gasto do fundo">✕</button></span></div>`;
      }
    }
    h+=`<div class="btnrow"><button class="btn" id="addF">+ Registar gasto do fundo</button></div>`;
  }
  h+=`<div class="mut sub" style="margin-top:10px">O fundo reverte para convívios e atividades da equipa (Cap. VII do regulamento). Prazo de pagamento das multas: 7 dias.</div></div>`;
  if(!ms.length)h+=`<div class="empty"><span class="eico">🟨</span>Sem multas neste período. 🎉<br>Toca em <b>+</b> para registar uma.</div>`;
  for(const m of ms){
    const mb=S.membros.find(x=>x.id===m.membroId);
    const art=S.artigos.find(a=>a.id===m.artigoId);
    const venc=multaVencida(m);
    h+=`<div class="card" data-id="${esc(m.id)}"><div class="row"><div><b>${esc(mb?mb.nome:"—")}</b> <span class="tag">${esc(art?("Art. "+art.num):"Outra")}</span>
      <div class="mut">${fmtD(m.data)} · ${esc(art?art.nome:(m.descricao||""))}${art&&m.descricao?" · "+esc(m.descricao):""}</div></div>
      <span class="badge ${m.pago?"b-pago":(venc?"b-cancelado":"b-realizado")}" ${venc?'style="background:rgba(248,113,113,.15);color:var(--err)"':""}>${m.pago?"✅ paga":(venc?"🟥 em atraso":"🟨 pendente")}</span></div>
      <div class="row" style="margin-top:8px"><div>
        ${m.pago?"":`<button class="btn sm pri" data-act="paga">✓ Paga</button> `}<button class="btn sm" data-act="edit">Editar</button>
        <button class="btn sm dngr" data-act="del" aria-label="Apagar multa">✕</button>
      </div><span class="val">${fmt(m.valor)}</span></div></div>`;
  }
  $("#main").innerHTML=h;
  $("#addF").onclick=()=>formFundo();
  $$("[data-editf]").forEach(b=>b.onclick=()=>formFundo((S.fundo||[]).find(f=>f.id===b.dataset.editf)));
  $$("[data-delf]").forEach(b=>b.onclick=async()=>{
    if(await confirma("Apagar este gasto do fundo?",{titulo:"Apagar gasto",confirmar:"Apagar",perigo:true}))
      apagaRegisto("fundo",b.dataset.delf,"Gasto do fundo");
  });
  $$('[data-act]').forEach(b=>b.onclick=async()=>{
    const id=b.closest(".card").dataset.id, m=S.multas.find(x=>x.id===id);
    if(b.dataset.act==="edit")formMulta(m);
    else if(b.dataset.act==="paga"){
      const antes={pago:m.pago,dataPagamento:m.dataPagamento};
      m.pago=true;m.dataPagamento=new Date().toISOString().slice(0,10);
      if(await guarda("multas",m)){confirmaGravado();render();toast("Multa marcada como paga");}
      else Object.assign(m,antes);
    }
    else if(await confirma("Apagar esta multa?",{titulo:"Apagar multa",confirmar:"Apagar",perigo:true}))apagaRegisto("multas",id,"Multa");
  });
}
function formFundo(f){
  const novo=!f;
  f=f?{...f}:{id:criaId(),epocaId:epAtiva().id,data:new Date().toISOString().slice(0,10),descricao:"",valor:""};
  const dlg=$("#dlg");
  dlg.innerHTML=`<h2>${novo?"Gasto do fundo":"Editar gasto do fundo"}</h2>
  <div class="mut sub">O que a equipa gastou do dinheiro das multas — jantar, convívio, material comum.</div>
  <label>Descrição</label><input id="fD" value="${esc(f.descricao||"")}" placeholder="ex: jantar de fim de época">
  <div class="grid2"><div><label>Data</label><input type="date" id="fDt" value="${esc(f.data)}"></div>
  <div><label>Valor (€)</label><input type="text" inputmode="decimal" id="fV" value="${esc(numTxt(f.valor))}" placeholder="0,00"></div></div>
  <div class="btnrow"><button class="btn" id="fCan">Cancelar</button><button class="btn pri" id="fSav">Guardar</button></div>`;
  $("#fCan").onclick=()=>dlg.close();
  $("#fSav").onclick=async()=>{
    f.descricao=$("#fD").value.trim();f.data=$("#fDt").value;f.valor=num($("#fV").value);
    if(!f.data){toast("Preenche a data","erro");return;}
    if(isNaN(f.valor)||f.valor<=0){toast("O valor tem de ser um número maior que zero — usa vírgula, como 12,50","erro");return;}
    f.epocaId=f.epocaId||epAtiva().id;
    if(!await guarda("fundo",f))return;
    S.fundo=S.fundo||[];
    const ix=S.fundo.findIndex(x=>x.id===f.id);
    if(ix>=0)S.fundo[ix]=f;else S.fundo.push(f);
    confirmaGravado();dlg.close();render();toast("Gasto registado");
  };
  abreDlg(dlg);
}
function formMulta(m){
  const novo=!m;
  m=m?{...m}:{id:criaId(),epocaId:epAtiva().id,membroId:(membroSel!=="all"?membroSel:S.membros[0]?.id),data:new Date().toISOString().slice(0,10),artigoId:"",descricao:"",valor:"",pago:false};
  const dlg=$("#dlg");
  dlg.innerHTML=`<h2>${novo?"Nova multa":"Editar multa"}</h2>
  <div class="grid2"><div><label>Quem</label><select id="uM">${S.membros.map(x=>`<option value="${esc(x.id)}" ${x.id===m.membroId?"selected":""}>${esc(x.nome)}</option>`).join("")}</select></div>
  <div><label>Data</label><input type="date" id="uD" value="${esc(m.data)}"></div></div>
  <label>Infração (regulamento)</label><select id="uA"><option value="">Outra / manual</option>${S.artigos.filter(a=>!a.regra).map(a=>`<option value="${esc(a.id)}" ${a.id===m.artigoId?"selected":""}>Art. ${a.num} — ${esc(a.nome)} (${fmt(a.valor)}${a.porUnidade?"/un":""})</option>`).join("")}</select>
  <div class="warn" id="uRei" style="display:none"></div>
  <div class="grid2"><div><label>Quantidade (min/cliques)</label><input type="number" min="1" step="1" id="uQ" value="1"></div>
  <div><label>Valor (€)</label><input type="text" inputmode="decimal" id="uV" value="${esc(numTxt(m.valor))}" placeholder="0,00"></div></div>
  <label>Nota (opcional)</label><input id="uDesc" value="${esc(m.descricao||"")}">
  <label>Estado</label><select id="uP"><option value="" ${!m.pago?"selected":""}>Pendente</option><option value="1" ${m.pago?"selected":""}>Paga</option></select>
  <div class="btnrow"><button class="btn" id="uCancel">Cancelar</button><button class="btn pri" id="uSave">Guardar</button></div>`;
  function upd(){
    const art=S.artigos.find(a=>a.id===$("#uA").value);
    const q=Math.max(1,parseInt($("#uQ").value)||1);
    $("#uQ").parentElement.style.display=art&&art.porUnidade?"block":"none";
    if(art){
      let v=art.porUnidade?art.valor*q:art.valor;
      const rein=S.multas.filter(daEpoca).filter(x=>x.id!==m.id&&x.membroId===$("#uM").value&&x.artigoId===art.id).length;
      if(rein>=2){v*=2;$("#uRei").style.display="block";$("#uRei").textContent=`⚠ ${rein+1}ª ocorrência do mesmo artigo nesta época — multa duplicada (Art. 19).`;}
      else $("#uRei").style.display="none";
      $("#uV").value=v;
    } else $("#uRei").style.display="none";
  }
  $("#uA").onchange=upd;$("#uQ").oninput=upd;$("#uM").onchange=upd;
  if(novo)upd(); else {const art=S.artigos.find(a=>a.id===m.artigoId);$("#uQ").parentElement.style.display=art&&art.porUnidade?"block":"none";}
  $("#uCancel").onclick=()=>dlg.close();
  $("#uSave").onclick=async()=>{
    m.membroId=$("#uM").value;m.data=$("#uD").value;m.artigoId=$("#uA").value;
    m.descricao=$("#uDesc").value.trim();m.valor=num($("#uV").value);
    if(!m.data){toast("Preenche a data","erro");return;}
    if(isNaN(m.valor)||m.valor<=0){toast("O valor da multa tem de ser maior que zero","erro");return;}
    const pago=!!$("#uP").value;
    if(pago&&!m.pago)m.dataPagamento=new Date().toISOString().slice(0,10);
    m.pago=pago;
    m.epocaId=m.epocaId||epAtiva().id;
    if(!await guarda("multas",m))return;
    const ix=S.multas.findIndex(x=>x.id===m.id);
    if(ix>=0)S.multas[ix]=m;else S.multas.push(m);
    confirmaGravado();dlg.close();render();toast("Multa guardada");
  };
  abreDlg(dlg);
}
