/* js/definicoes.js — Definições: conta, equipa, membros e pedidos, época, valores, apagados, aparência e formulários.
   Script normal (sem módulos nem build), carregado pelo index.html por esta
   ordem: base, calculo, jogos, despesas-multas, resumo, bd, conta, sessao,
   definicoes, arranque. Partilham o mesmo âmbito global, como quando eram um
   <script> só. */
"use strict";

/* ============ Definições ============
   Reconstruídas. O que saiu e porquê:
     · "Eu" (escolher qual dos nomes sou)  -> já não faz sentido: a conta diz
       quem sou, e a linha em membros_equipa liga-me ao histórico.
     · "Sincronização" (URL, chave, email, password, sincronizar agora,
       desligar, modo consulta)            -> deixou de haver o que sincronizar.
     · "Cópias locais" e "Restaurar"       -> os dados já não vivem no telemóvel.
   O que ficou, mais o que o brief pediu: a minha conta, a minha equipa, os
   membros e o código (só responsável), época e valores (só responsável),
   aparência, exportar, terminar sessão. */
function renderConfig(){
  const ep=epAtiva();
  const resp=souResponsavel();
  const tarifas=resp?S.tabela.filter(daEpoca):[];
  const tipos=[...new Set(tarifas.map(r=>r.tipo))];

  const secs=[["conta","Conta"],["equipa","Equipa"]]
    .concat(resp?[["membros","Membros"],["epoca","Época"],["valores","Valores"]]:[])
    .concat([["avisos","Avisos"],["lixo","Apagados"],["aparencia","Aparência"],["dados","Dados"]]);
  let h=`<div class="chips" role="group" aria-label="Secções das definições">`+
    secs.map(([id,t])=>`<button class="chip" data-ir="sec-${id}">${t}</button>`).join("")+`</div>`;

  /* ---- A minha conta ---- */
  h+=`<h3 class="sec" id="sec-conta">A minha conta</h3>
  <div class="card">
    <label for="cNome">O meu nome</label>
    <input id="cNome" value="${esc(EUMEMBRO?EUMEMBRO.nome:"")}" placeholder="como apareces nas convocatórias">
    <div class="mut sub" style="margin-top:6px">É este nome que aparece nas nomeações e nas multas.</div>
    <div class="list-item" style="margin-top:10px"><span class="sub">Email</span><b class="sub">${esc(SY.email||"—")}</b></div>
    <div class="list-item"><span class="sub">Nesta equipa sou</span><b class="sub">${resp?"✏️ responsável":"👀 assistente"}</b></div>
    <label for="cFuncao" style="margin-top:10px">Função habitual em campo</label>
    <select id="cFuncao">
      ${[["arbitro","Árbitro"],["AA1","AA1"],["AA2","AA2"],["outro","Outra"]]
        .map(([v,t])=>`<option value="${v}" ${(EUMEMBRO&&EUMEMBRO.funcao)===v?"selected":""}>${t}</option>`).join("")}
    </select>
    <div class="mut sub" style="margin-top:6px">Usada para pré-preencher a tua função ao registar um jogo. Num jogo concreto podes pôr outra.</div>
    <div class="btnrow" style="margin-top:12px">
      <button class="btn" id="cPass">Mudar palavra-passe</button>
      <button class="btn dngr" id="cSair">Terminar sessão</button>
    </div>
  </div>`;

  /* ---- A minha equipa ---- */
  h+=`<h3 class="sec" id="sec-equipa">A minha equipa</h3><div class="card">`;
  if(resp){
    h+=`<label for="cEquipa">Nome da equipa</label>
    <input id="cEquipa" value="${esc(EQUIPA?EQUIPA.nome:"")}" placeholder="ex: Equipa Telmo Paiva">`;
  }else{
    h+=`<div class="list-item"><span class="sub">Equipa</span><b class="sub">${esc(EQUIPA?EQUIPA.nome:"—")}</b></div>
    <div class="mut sub" style="margin-top:8px">Só o responsável pode mudar o nome da equipa.</div>`;
  }
  h+=`<div class="list-item" style="margin-top:6px"><span class="sub">Somos</span><b class="sub">${S.membros.length} pessoa(s)</b></div></div>`;

  /* ---- Membros e convite: só o responsável ---- */
  if(resp){
    h+=`<h3 class="sec" id="sec-membros">Membros e convite</h3>
    <div class="card">
      <div class="mut sub">Dá este código a quem quiseres na equipa. A pessoa cria conta, escreve o código e fica à espera que a aproves aqui em baixo.</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:10px">
        <div id="cCod" style="flex:1;font-size:1.5rem;font-weight:800;letter-spacing:.22em;text-align:center;
             background:var(--card2);border:1px dashed var(--line);border-radius:12px;padding:12px 6px">${esc(EQUIPA?EQUIPA.codigo:"——————")}</div>
      </div>
      <div class="btnrow" style="margin-top:10px">
        <button class="btn" id="cCopia">Copiar código</button>
        <button class="btn" id="cRoda">Gerar outro</button>
      </div>
      <div class="mut sub" style="margin-top:8px">Gerar outro invalida o anterior. Quem já entrou continua dentro.${
        EQUIPA&&EQUIPA.codigoExpira?` Este código vale até ${esc(new Date(EQUIPA.codigoExpira).toLocaleDateString("pt-PT"))}.`:""}</div>
    </div>
${(S.pedidos||[]).length?`
    <div class="card" style="margin-top:12px;border-color:var(--warn)" id="cPedidos">
      <b>Pedidos para entrar (${S.pedidos.length})</b>
      <div class="mut sub" style="margin:4px 0 4px">Só entra quem aprovares. Quem pede um lugar que já existe fica com o histórico desse lugar.</div>
      ${S.pedidos.map(p=>{
        const lugar=p.reclamaId&&S.membros.find(m=>m.id===p.reclamaId);
        return `<div class="list-item">
        <div style="min-width:0"><b class="sub">${esc(p.nome)}</b>
          <div class="mut sub">${lugar?"quer ficar com o lugar de "+esc(lugar.nome):"membro novo"}</div></div>
        <div style="display:flex;gap:6px;flex:0 0 auto">
          <button class="btn sm pri" data-aprova="${esc(p.id)}">Aprovar</button>
          <button class="btn sm dngr" data-recusa="${esc(p.id)}">Recusar</button>
        </div></div>`;}).join("")}
    </div>`:""}

    <div class="card" style="margin-top:12px" id="cMembros">
      ${S.membros.map(m=>`<div class="list-item">
        <div style="min-width:0">
          <b class="sub">${esc(m.nome)}</b>${m.contaLigada?"":` <span class="mut sub">(lugar por reclamar)</span>`}
          <div class="mut sub">${m.papel==="responsavel"?"✏️ responsável":"👀 assistente"} · ${esc(m.funcao||"AA2")}${m.alias?" · nas convocatórias: "+esc(m.alias):""}</div>
        </div>
        <div style="display:flex;gap:6px;flex:0 0 auto">
          <button class="btn sm" data-editm="${esc(m.id)}">Editar</button>
          ${m.id===(EUMEMBRO&&EUMEMBRO.id)?"":`<button class="btn sm dngr" data-delm="${esc(m.id)}">Remover</button>`}
        </div></div>`).join("")||`<div class="mut">Ainda só estás tu.</div>`}
      <div class="btnrow"><button class="btn" id="addM">Acrescentar membro</button></div>
      <div class="mut sub" style="margin-top:8px">Acrescentar um membro aqui cria um lugar por reclamar: a pessoa fica logo nas listas de nomeação, e quando se registar com o código apanha o histórico dela.</div>
    </div>`;
  }

  /* ---- Época: só o responsável ---- */
  if(resp&&ep){
    const anoNome=anoDoNome(ep.nome);
    h+=`<h3 class="sec" id="sec-epoca">Época</h3><div class="card">`;
    if(S.epocas.length>1)
      h+=`<label for="cEpSel">Época a trabalhar</label>
      <select id="cEpSel">${S.epocas.map(e=>`<option value="${esc(e.id)}" ${e.id===ep.id?"selected":""}>${esc(e.nome)}</option>`).join("")}</select>`;
    h+=`<label for="cEpoca">Nome desta época</label><input id="cEpoca" value="${esc(ep.nome)}" placeholder="2025/26">
    <div class="mut sub" style="margin-top:6px" id="cEpInfo">${anoNome
      ?`De setembro de ${anoNome} a junho de ${anoNome+1}. Guarda-se sozinho.`
      :`Não consigo tirar o ano do nome — escreve-o como 2025/26.`}</div>
    <label for="cKm" style="margin-top:10px">Valor por quilómetro (€)</label>
    <input type="text" inputmode="decimal" id="cKm" value="${esc(numTxt(ep.valorKm))}" placeholder="0,36">
    <div class="btnrow" style="margin-top:12px"><button class="btn" id="cNova">Nova época</button>${
      S.epocas.length>1?`<button class="btn dngr" id="cApagaEp">Apagar a época ${esc(ep.nome)}</button>`:""}</div>
    <div class="mut sub" style="margin-top:6px">A época nova nasce com as tarifas e os almoços desta, copiados. Os jogos já registados não se mexem.</div>
    </div>

    <div class="card" style="margin-top:12px">
      <b>Deslocações</b>
      <div class="mut sub" style="margin:4px 0 8px">Como se paga a viagem, por tipo de jogo e escalão. Uma regra sem escalões vale para os que não tiverem regra própria.</div>
      ${(ep.deslocacoes||[]).map((d,i)=>{
        const orfa=regraOrfa(d), escs=escaloesDaRegra(d);
        return `<div class="list-item"${orfa?` style="border-left:3px solid var(--warn);padding-left:8px"`:""}>
        <div style="min-width:0"><b class="sub">${esc(d.tipo)}${escs.length?` · ${esc(escs.join(", "))}`:` · todos os escalões`}</b>
        <div class="mut sub">${d.modo==="km"?`${numTxt(d.valor)} €/km`:`${fmt(d.valor)} fixos por jogo`}</div>
        ${orfa?`<div class="warn sub" style="margin-top:2px">⚠ ${esc(orfa)} Toca em Editar para corrigir.</div>`:""}</div>
        <div style="display:flex;gap:6px;flex:0 0 auto">
          <button class="btn sm" data-editd="${i}">Editar</button>
          <button class="btn sm dngr" data-deld="${i}">Apagar</button></div></div>`;}).join("")
        ||`<div class="mut">Sem regras — a deslocação não entra na conta.</div>`}
      <div class="btnrow"><button class="btn" id="addD">Acrescentar regra</button></div>
    </div>`;
  }

  /* ---- Valores: só o responsável ---- */
  if(resp){
    h+=`<h3 class="sec" id="sec-valores">Tabela de valores</h3>
    <div class="card">
      <label for="cBuscaT" class="sr">Procurar na tabela</label>
      <input id="cBuscaT" placeholder="procurar escalão, tipo ou função…" value="${esc(filtroTarifa)}">
      <div id="cTarifas">${pintaTarifas(tarifas,tipos)}</div>
      <div class="btnrow"><button class="btn" id="addT">Acrescentar valor</button></div>
    </div>

    <div class="card" style="margin-top:12px">
      <b>Almoços</b>
      <div class="mut sub" style="margin:4px 0 8px">Somados ao valor do jogo quando escolhidos na nomeação.</div>
      ${S.almocos.filter(daEpoca).map(a=>`<div class="list-item">
        <div><b class="sub">${esc(a.nome)}</b></div>
        <div style="display:flex;gap:6px;align-items:center;flex:0 0 auto">
          <b class="sub">${fmt(a.valor)}</b>
          <button class="btn sm" data-edita="${esc(a.id)}">Editar</button>
          <button class="btn sm dngr" data-dela="${esc(a.id)}">Apagar</button></div></div>`).join("")
        ||`<div class="mut">Sem valores de almoço.</div>`}
      <div class="btnrow"><button class="btn" id="addA">Acrescentar almoço</button></div>
    </div>`;
  }else{
    h+=`<h3 class="sec" id="sec-valores">Tabela de valores</h3>
    <div class="card"><div class="mut">A tabela de valores é do responsável da equipa. O que recebeste em cada jogo está no separador Jogos, e o valor fica congelado no momento em que o jogo é registado — mudanças na tabela não reescrevem o passado.</div></div>`;
  }

  /* ---- Aparência ---- */
  const temaAtual=leTema();
  h+=`<h3 class="sec" id="sec-aparencia">Aparência</h3>
  <div class="card">
    <label for="cTema">Tema</label>
    <select id="cTema">
      ${[["auto","Como o telemóvel"],["claro","Claro"],["escuro","Escuro"]]
        .map(([v,t])=>`<option value="${v}" ${temaAtual===v?"selected":""}>${t}</option>`).join("")}
    </select>
    <div class="mut sub" style="margin-top:6px">"Como o telemóvel" acompanha o modo escuro do sistema.</div>
  </div>`;

  /* ---- Avisos no telemóvel (js/avisos.js): enche-se depois ---- */
  h+=`<h3 class="sec" id="sec-avisos">Avisos no telemóvel</h3>
  <div class="card" id="cAvisos"><div class="mut sub">A ver…</div></div>`;

  /* ---- Apagados (sql/05): enche-se depois, com um pedido à parte ---- */
  h+=`<h3 class="sec" id="sec-lixo">Apagados nos últimos 30 dias</h3>
  <div class="card" id="cLixo"><div class="mut sub">A carregar…</div></div>`;

  /* ---- Dados ---- */
  h+=`<h3 class="sec" id="sec-dados">Os meus dados</h3>
  <div class="card">
    <div class="mut sub">Tirar uma cópia do que é teu, para guardares fora da app. Não há botão de repor: os dados vivem na base de dados e uma reposição por cima podia apagar o trabalho de outra pessoa da equipa.</div>
    <div class="btnrow" style="margin-top:10px">
      <button class="btn" id="expJson">Exportar JSON</button>
      <button class="btn" id="expCsv">Exportar CSV</button>
    </div>
  </div>`;

  /* ---- O que ficou neste telemóvel ---- */
  const conv=S.convFalhadas||[];
  h+=`<h3 class="sec">Neste telemóvel</h3>
  <div class="card">
    <div class="mut sub">Os dados da equipa vivem na base de dados. Neste telemóvel fica uma cópia da última vez que houve rede, para a app abrir e registar num campo sem cobertura, e a lista do que ficou por enviar. As duas apagam-se ao terminar sessão. Ficam também o tema, a época que estás a ver e as convocatórias que a app não conseguiu ler.</div>
    ${pintaFilaConfig()}
    ${conv.length?`<div style="margin-top:12px"><b class="sub">Convocatórias por ler</b>
      <div class="mut sub" style="margin-bottom:6px">Mensagens que colaste e a app não conseguiu interpretar. Toca em Ver para as abrir outra vez.</div>`
      +conv.map(c=>`<div class="list-item">
        <div style="min-width:0"><b class="sub">${esc(new Date(c.t).toLocaleString("pt-PT"))}</b>
        <div class="mut sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(String(c.texto).slice(0,70))}</div></div>
        <button class="btn sm" data-verconv="${esc(c.id)}" style="flex:0 0 auto">Ver</button></div>`).join("")
      +`<div class="btnrow"><button class="btn" id="limpaConv">Limpar lista</button></div></div>`
      :`<div class="mut sub" style="margin-top:8px">Sem convocatórias por ler.</div>`}
  </div>`;

  if(resp)
    h+=`<h3 class="sec">Zona de perigo</h3><div class="card">
      <div class="mut sub">Apagar a equipa apaga os jogos, as despesas, as multas e os membros, para toda a gente. Não há volta.</div>
      <div class="btnrow" style="margin-top:10px"><button class="btn dngr" id="apagaEq">Apagar a equipa</button></div></div>`;

  $("#main").innerHTML=h;
  ligaLabels($("#main"));
  ligaConfig();
  if($("#filaEnvia"))$("#filaEnvia").onclick=()=>recarrega();
  $$("[data-descarta]").forEach(b=>b.onclick=async()=>{
    if(!await confirma("Esta alteração não chega à base de dados.",{titulo:"Descartar?",confirmar:"Descartar",perigo:true}))return;
    descartaDaFila(b.dataset.descarta); render();
  });
  $$("[data-aprova]").forEach(b=>b.onclick=()=>decidePedido(b.dataset.aprova,true));
  $$("[data-recusa]").forEach(b=>b.onclick=()=>decidePedido(b.dataset.recusa,false));
  pintaLixo();
  pintaAvisos();
}

/* O que está por enviar (js/offline.js): as que esperam por rede e as que o
   servidor recusou, estas com o motivo e a escolha de as descartar. */
function pintaFilaConfig(){
  const ops=leFilaToda(); if(!ops.length)return "";
  const espera=ops.filter(o=>!o.erro), erro=ops.filter(o=>o.erro);
  return `<div style="margin-top:12px" id="cFila"><b class="sub">Por enviar</b>
    ${espera.length?`<div class="mut sub" style="margin-bottom:6px">${espera.length===1?"1 alteração feita sem rede, enviada":espera.length+" alterações feitas sem rede, enviadas"} quando houver ligação.</div>`:""}
    ${espera.map(o=>`<div class="list-item"><span class="sub">⏳ ${esc(descreveOp(o))}</span></div>`).join("")}
    ${erro.map(o=>`<div class="list-item"><div style="min-width:0"><b class="sub neg">⚠ ${esc(descreveOp(o))}</b>
      <div class="mut sub">${esc(o.erro)}</div></div>
      <button class="btn sm dngr" data-descarta="${esc(o.fila)}" style="flex:0 0 auto">Descartar</button></div>`).join("")}
    ${espera.length?`<div class="btnrow"><button class="btn" id="filaEnvia">Enviar agora</button></div>`:""}
  </div>`;
}

/* Ir para uma secção das Definições a partir de outro sítio (ex.: o aviso de
   pedidos pendentes ao entrar). */
function vaiParaSecao(id){
  const b=$('.tabbar button[data-tab="config"]'); if(b)b.click();
  setTimeout(()=>{const el=document.getElementById("sec-"+id);
    if(el)el.scrollIntoView({block:"start"});},60);
}

async function decidePedido(id,aprova){
  const p=(S.pedidos||[]).find(x=>x.id===id); if(!p)return;
  if(!aprova&&!await confirma("A pessoa pode voltar a pedir com o código, se lho deres.",
      {titulo:"Recusar o pedido de "+p.nome+"?",confirmar:"Recusar",perigo:true}))return;
  try{ await chamaRpc(aprova?"aprovar_membro":"recusar_membro",{p_membro:id}); }
  catch(e){ return falhou(e); }
  toast(aprova?p.nome+" entrou na equipa":"Pedido recusado");
  await recarrega(true);
}

/* O lixo (sql/05): o que foi apagado nos últimos 30 dias e ainda se pode
   repor. O responsável vê o da equipa; cada pessoa vê as suas despesas. */
const NOME_APAGADO={jogos:"Jogo",despesas:"Despesa",multas:"Multa",pagamentos:"Pagamento",
  fundo_gastos:"Gasto do fundo",distancias:"Distância",almocos:"Almoço",
  tabela_valores:"Tarifa",artigos_multa:"Artigo do regulamento"};
function descreveApagado(l){
  const r=l.registo||{};
  const quem=r.membro_id&&(S.membros.find(m=>m.id===r.membro_id)||{}).nome;
  const partes=[
    r.equipa_a||r.equipa_b?(r.equipa_a||"?")+" vs "+(r.equipa_b||"?"):"",
    r.num!=null&&l.tabela==="artigos_multa"?"Art. "+r.num:"",
    r.categoria,r.descricao,r.nome,r.escalao,r.funcao,r.local,quem,
    r.km!=null&&l.tabela==="distancias"?r.km+" km":"",
    r.valor!=null?fmt(Number(r.valor)):"",
    /^\d{4}-\d{2}-\d{2}$/.test(r.data||"")?fmtD(r.data):""
  ].filter(Boolean);
  return partes.join(" · ");
}
async function pintaLixo(){
  const cx=$("#cLixo"); if(!cx||!EQUIPA)return;
  let linhas;
  try{
    linhas=await sbReq("GET",`lixo?equipa_id=eq.${EQUIPA.id}&tabela=neq.participacoes&order=apagado_em.desc&limit=50`);
  }catch(e){
    const c=$("#cLixo"); if(!c)return;
    c.innerHTML=/404/.test(String(e&&e.message))
      ?`<div class="mut sub">O lixo ainda não está ligado no servidor: falta correr o <b>sql/05-seguranca-dados.sql</b> no Supabase.</div>`
      :`<div class="mut sub">Não consegui ver o que foi apagado. ${esc(mensagemDoErro(classifica(e)))}</div>`;
    return;
  }
  const c=$("#cLixo"); if(!c)return;   // mudou de ecrã entretanto
  // O que foi apagado junto com uma época já não tem onde voltar: não se mostra.
  const epocas=new Set(S.epocas.map(e=>e.id));
  linhas=(linhas||[]).filter(l=>!(l.registo&&l.registo.epoca_id)||epocas.has(l.registo.epoca_id));
  c.innerHTML=`<div class="mut sub">${souResponsavel()
      ?"O que for apagado na equipa fica aqui 30 dias. Um jogo volta com quem estava nomeado."
      :"As tuas despesas apagadas ficam aqui 30 dias."}</div>`+
    (linhas.length?linhas.map(l=>`<div class="list-item">
      <div style="min-width:0"><b class="sub">${esc(NOME_APAGADO[l.tabela]||l.tabela)}</b>
        <div class="mut sub" style="overflow-wrap:anywhere">${esc(descreveApagado(l))}</div>
        <div class="mut sub">apagado ${esc(new Date(l.apagado_em).toLocaleString("pt-PT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}))}</div></div>
      <button class="btn sm" data-repor="${esc(l.id)}" style="flex:0 0 auto">Repor</button></div>`).join("")
    :`<div class="mut sub" style="margin-top:8px">Nada apagado nos últimos 30 dias.</div>`);
  $$("[data-repor]",c).forEach(b=>b.onclick=async()=>{
    b.disabled=true;
    try{ await chamaRpc("repor_do_lixo",{p_id:b.dataset.repor}); }
    catch(e){ b.disabled=false; return falhou(e); }
    toast("Reposto");
    await recarrega(true);
  });
}

/* A tabela de valores é redesenhada sozinha quando se escreve na pesquisa,
   sem repintar o ecrã todo (senão o campo perdia o foco a cada letra). */
function pintaTarifas(tarifas,tipos){
  const f=norm(filtroTarifa||"");
  const passa=r=>!f||norm(r.tipo+" "+r.escalao+" "+r.funcao).includes(f);
  const lista=tarifas.filter(passa);
  if(!lista.length)return `<div class="mut" style="margin-top:8px">${f?"Nenhuma tarifa encontrada.":"Sem valores nesta época."}</div>`;
  return tipos.map(t=>{
    const doTipo=lista.filter(r=>r.tipo===t);
    if(!doTipo.length)return "";
    return `<div class="mut sub" style="margin:10px 0 2px">${esc(t)}</div>`+
      doTipo.map(r=>`<div class="list-item">
        <div style="min-width:0"><b class="sub">${esc(r.escalao)}</b><div class="mut sub">${esc(r.funcao)}</div></div>
        <div style="display:flex;gap:6px;align-items:center;flex:0 0 auto">
          <b class="sub">${fmt(r.valor)}</b>
          <button class="btn sm" data-editt="${esc(r.id)}">Editar</button>
          <button class="btn sm dngr" data-delt="${esc(r.id)}">Apagar</button></div></div>`).join("");
  }).join("");
}

/* Tema guardado neste telemóvel: é preferência de quem está a ver, não da
   equipa, por isso não vai para a base de dados. */
const K_TEMA="arbTema";
function leTema(){try{return localStorage.getItem(K_TEMA)||"auto";}catch(_){return "auto";}}
function aplicaTema(v){
  try{localStorage.setItem(K_TEMA,v);}catch(_){}
  if(v==="auto")document.documentElement.removeAttribute("data-tema");
  else document.documentElement.setAttribute("data-tema",v);
  // A barra do sistema (Android) segue o tema da app, não só o do telemóvel.
  $$('meta[name="theme-color"]').forEach(m=>{
    const doSistema=/dark/.test(m.media)?"#0a120e":"#eef4ef";
    m.content=v==="claro"?"#eef4ef":v==="escuro"?"#0a120e":doSistema;
  });
}
aplicaTema(leTema());

function ligaConfig(){
  const resp=souResponsavel();

  /* --- conta --- */
  const cn=$("#cNome");
  if(cn)cn.onchange=async()=>{
    const nome=cn.value.trim();
    if(!nome){cn.value=EUMEMBRO.nome;return;}
    const antes=EUMEMBRO.nome;
    EUMEMBRO.nome=nome;
    // O próprio membro pode mudar o seu nome: é a única escrita que o
    // assistente faz, e está fechada à sua própria linha do lado do servidor.
    if(await guardaMeuPerfil()){confirmaGravado();await recarrega(true);}
    else{EUMEMBRO.nome=antes;cn.value=antes;}
  };
  const cf=$("#cFuncao");
  if(cf)cf.onchange=async()=>{
    const antes=EUMEMBRO.funcao; EUMEMBRO.funcao=cf.value;
    if(await guardaMeuPerfil())confirmaGravado(); else {EUMEMBRO.funcao=antes;cf.value=antes;}
  };
  if($("#cPass"))$("#cPass").onclick=async()=>{
    const nova=await pergunta("Mudar palavra-passe","Palavra-passe nova (mínimo 6 caracteres)","");
    if(nova===null)return;
    if(String(nova).length<6){toast("Tem de ter pelo menos 6 caracteres","erro");return;}
    try{ await sbAuth(); await defineNovaPass(String(nova)); toast("Palavra-passe alterada ✅"); }
    catch(e){ toast(mensagemAuth(e),"erro"); }
  };
  if($("#cSair"))$("#cSair").onclick=async()=>{
    if(await confirma("Terminar sessão neste dispositivo? Os dados ficam na base de dados.",
      {titulo:"Terminar sessão",confirmar:"Terminar sessão",perigo:true})) terminaSessao();
  };

  /* --- equipa --- */
  if($("#cEquipa"))$("#cEquipa").onchange=async()=>{
    const nome=$("#cEquipa").value.trim(); if(!nome)return;
    try{
      await sbReq("PATCH",`equipas?id=eq.${EQUIPA.id}`,{nome},{Prefer:"return=minimal"});
      EQUIPA.nome=nome; S.settings.equipa=nome; confirmaGravado(); render();
    }catch(e){ falhou(e); }
  };
  if($("#cCopia"))$("#cCopia").onclick=async()=>{
    try{ await navigator.clipboard.writeText(EQUIPA.codigo); toast("Código copiado"); }
    catch(_){ toast("Copia à mão: "+EQUIPA.codigo); }
  };
  if($("#cRoda"))$("#cRoda").onclick=async()=>{
    if(!await confirma("O código atual deixa de funcionar. Quem já está na equipa continua dentro.",
      {titulo:"Gerar outro código",confirmar:"Gerar"}))return;
    try{ const novo=await rodaCodigo(); EQUIPA.codigo=String(novo);
      if(EQUIPA.codigoExpira)EQUIPA.codigoExpira=new Date(Date.now()+30*864e5).toISOString();
      render(); toast("Código novo: "+EQUIPA.codigo); }
    catch(e){ falhou(e); }
  };

  /* --- membros --- */
  if($("#addM"))$("#addM").onclick=()=>formMembro();
  $$("[data-editm]").forEach(b=>b.onclick=()=>formMembro(S.membros.find(m=>m.id===b.dataset.editm)));
  $$("[data-delm]").forEach(b=>b.onclick=async()=>{
    const id=b.dataset.delm;
    const emUso=S.jogos.some(j=>(j.atribuicoes||[]).some(a=>a.membroId===id))
             ||S.despesas.some(d=>d.membroId===id)||S.multas.some(m=>m.membroId===id);
    const m=S.membros.find(x=>x.id===id);
    if(emUso){
      if(!await confirma("Esta pessoa tem jogos, despesas ou multas registados. Em vez de apagar, deixa de aparecer nas listas novas — o histórico fica intacto e continua a mostrar o nome dela.",
        {titulo:"Tirar da equipa",confirmar:"Tirar da equipa",perigo:true}))return;
      if(await guarda("membros",{...m,ativo:false})){ confirmaGravado(); await recarrega(true); }
      return;
    }
    if(!await confirma("Remover esta pessoa da equipa?",{titulo:"Remover",confirmar:"Remover",perigo:true}))return;
    if(await apagaNaBD("membros",id)){ confirmaGravado(); await recarrega(true); }
  });

  /* --- época --- */
  if($("#cEpSel"))$("#cEpSel").onchange=()=>{
    S.settings.epocaAtivaId=$("#cEpSel").value;
    guardaEpocaEscolhida(S.settings.epocaAtivaId);
    mesSel="all";mesRes=mesCorrente();mesDesp="all";
    render(); toast("A trabalhar na época "+epAtiva().nome);
  };
  if($("#cEpoca"))$("#cEpoca").onchange=async()=>{
    const nome=$("#cEpoca").value.trim(); if(!nome)return;
    const e=epAtiva(); const antes={nome:e.nome,anoInicio:e.anoInicio};
    e.nome=nome; const a=anoDoNome(nome); if(a)e.anoInicio=a;
    if(await guarda("epocas",e)){ confirmaGravado(); render(); }
    else { Object.assign(e,antes); render(); }
  };
  if($("#cKm"))$("#cKm").onchange=async()=>{
    const e=epAtiva(); const antes=e.valorKm; const v=num($("#cKm").value);
    if(isNaN(v)||v<0){toast("Escreve um número, com vírgula — 0,36","erro");$("#cKm").value=numTxt(antes);return;}
    e.valorKm=v;
    if(await guarda("epocas",e))confirmaGravado(); else {e.valorKm=antes;$("#cKm").value=numTxt(antes);}
  };
  if($("#cNova"))$("#cNova").onclick=()=>criaEpocaNova();
  if($("#cApagaEp"))$("#cApagaEp").onclick=()=>apagaEpocaAtual();

  if($("#addD"))$("#addD").onclick=()=>formDesloc();
  $$("[data-editd]").forEach(b=>b.onclick=()=>formDesloc(+b.dataset.editd));
  $$("[data-deld]").forEach(b=>b.onclick=async()=>{
    if(!await confirma("Apagar esta regra de deslocação?",{titulo:"Apagar regra",confirmar:"Apagar",perigo:true}))return;
    const idx=+b.dataset.deld, e=epAtiva();
    const copia=JSON.parse(JSON.stringify(e.deslocacoes[idx]));
    e.deslocacoes.splice(idx,1);
    if(await guarda("epocas",e)){
      confirmaGravado(); render();
      toast("Regra apagada",{accao:{rotulo:"Anular",fn:async()=>{
        const e2=epAtiva(); e2.deslocacoes.splice(idx,0,copia);
        if(await guarda("epocas",e2)){render();toast("Regra reposta");}
      }}});
    }else{ e.deslocacoes.splice(idx,0,copia); }
  });

  /* --- valores --- */
  const bt=$("#cBuscaT");
  if(bt)bt.oninput=()=>{
    filtroTarifa=bt.value;
    const tf=S.tabela.filter(daEpoca);
    $("#cTarifas").innerHTML=pintaTarifas(tf,[...new Set(tf.map(r=>r.tipo))]);
    ligaBotoesTarifa();
  };
  ligaBotoesTarifa();
  if($("#addT"))$("#addT").onclick=()=>formTarifa();
  if($("#addA"))$("#addA").onclick=()=>formAlmoco();
  $$("[data-edita]").forEach(b=>b.onclick=()=>formAlmoco(S.almocos.find(a=>a.id===b.dataset.edita)));
  $$("[data-dela]").forEach(b=>b.onclick=async()=>{
    if(!await confirma("Apagar este valor de almoço?",{titulo:"Apagar almoço",confirmar:"Apagar",perigo:true}))return;
    if(await apagaNaBD("almocos",b.dataset.dela)){confirmaGravado();await recarrega(true);}
  });

  /* --- aparência --- */
  if($("#cTema"))$("#cTema").onchange=()=>{aplicaTema($("#cTema").value);toast("Tema aplicado");};

  /* --- neste telemóvel --- */
  if($("#limpaConv"))$("#limpaConv").onclick=async()=>{
    if(!await confirma("Limpar a lista de convocatórias por ler?",{titulo:"Limpar lista",confirmar:"Limpar"}))return;
    S.convFalhadas=[]; guardaConvFalhadas([]); render(); toast("Lista limpa");
  };
  $$("[data-verconv]").forEach(b=>b.onclick=()=>{
    const c=(S.convFalhadas||[]).find(x=>x.id===b.dataset.verconv);
    if(c)formConv(c.texto);
  });

  /* --- dados --- */
  if($("#expJson"))$("#expJson").onclick=()=>exportJson();
  if($("#expCsv"))$("#expCsv").onclick=()=>exportCsv();

  /* --- perigo --- */
  if($("#apagaEq"))$("#apagaEq").onclick=async()=>{
    if(!await confirma("Isto apaga a equipa e tudo o que lá está dentro, para toda a gente. Não há volta.",
      {titulo:"Apagar a equipa",confirmar:"Continuar",perigo:true}))return;
    const nome=await pergunta("Confirmar","Escreve o nome da equipa para confirmar","");
    if(nome===null)return;
    if(String(nome).trim()!==EQUIPA.nome){toast("O nome não bate certo. Não apaguei nada.","erro");return;}
    try{
      await sbReq("DELETE",`equipas?id=eq.${EQUIPA.id}`,null,{Prefer:"return=minimal"});
      toast("Equipa apagada"); EQUIPA=null; EUMEMBRO=null; mostraEquipa();
    }catch(e){ falhou(e); }
  };

  $$("[data-ir]").forEach(b=>b.onclick=()=>{
    const el=document.getElementById(b.dataset.ir);
    if(el)el.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});
  });
}

function ligaBotoesTarifa(){
  $$("[data-editt]").forEach(b=>b.onclick=()=>formTarifa(S.tabela.find(r=>r.id===b.dataset.editt)));
  $$("[data-delt]").forEach(b=>b.onclick=async()=>{
    if(!await confirma("Apagar esta tarifa?",{titulo:"Apagar tarifa",confirmar:"Apagar",perigo:true}))return;
    if(await apagaNaBD("tabela",b.dataset.delt)){confirmaGravado();await recarrega(true);}
  });
}

/* Cada pessoa pode mudar o SEU nome e a SUA função. Do lado do servidor isto
   está fechado à própria linha (ver política "cada um edita o seu lugar"). */
async function guardaMeuPerfil(){
  try{
    await sbReq("PATCH",`membros_equipa?id=eq.${EUMEMBRO.id}`,
      {nome:EUMEMBRO.nome,funcao_habitual:EUMEMBRO.funcao},{Prefer:"return=minimal"});
    await sbReq("PATCH","perfis?id=eq."+(await idDoUtilizador()),{nome:EUMEMBRO.nome},{Prefer:"return=minimal"}).catch(()=>{});
    return true;
  }catch(e){ return falhou(e); }
}
let _meuId=null;
async function idDoUtilizador(){
  if(_meuId)return _meuId;
  const cfg=sbCfg(); const tk=await sbAuth();
  const r=await fetch(cfg.url+"/auth/v1/user",{headers:{apikey:cfg.key,Authorization:"Bearer "+tk}});
  const d=await r.json(); _meuId=d&&d.id; return _meuId;
}

/* Apagar uma época leva tudo o que é dela — jogos, multas, pagamentos, gastos
   do fundo, tarifas, almoços e as despesas de TODA a equipa nessa época — e
   não tem volta: a época não vai para o lixo, e sem ela nada do que ia junto
   se consegue repor. Por isso: conta-se o que vai junto, pede-se o nome
   escrito, precisa de rede (não fica numa fila à espera), e nunca se apaga a
   única época da equipa. */
async function apagaEpocaAtual(){
  if(soLeitura())return;
  const ep=epAtiva(); if(!ep||!ep.id)return;
  if(S.epocas.length<2){toast("É a única época da equipa: cria outra antes de apagar esta.","erro");return;}
  if(!navigator.onLine){toast("Apagar uma época precisa de rede.","erro");return;}
  const de=x=>x.epocaId===ep.id;
  const n={jogos:S.jogos.filter(de).length,multas:S.multas.filter(de).length,
           pagamentos:S.pagamentos.filter(de).length,despesas:S.despesas.filter(de).length};
  const msg=`Vai junto tudo o que é desta época: ${n.jogos} jogo(s), ${n.multas} multa(s), ${n.pagamentos} pagamento(s), `+
    `as tuas ${n.despesas} despesa(s) e as que os colegas lançaram nela, e as tarifas e almoços da época. `+
    `Isto não se consegue repor.`;
  if(!await confirma(msg,{titulo:"Apagar a época "+ep.nome+"?",confirmar:"Continuar",perigo:true}))return;
  const escrito=await pergunta("Confirmar","Para apagar, escreve o nome da época: "+ep.nome,"");
  if(escrito===null)return;
  if(escrito.trim()!==String(ep.nome).trim()){toast("O nome não bate certo — a época não foi apagada.","erro");return;}
  if(!await apagaNaBD("epocas",ep.id))return;
  const outra=S.epocas.filter(e=>e.id!==ep.id).sort((a,b)=>(b.anoInicio||0)-(a.anoInicio||0))[0];
  S.settings.epocaAtivaId=outra.id; guardaEpocaEscolhida(outra.id);
  toast("Época "+ep.nome+" apagada");
  await recarrega(true);
}

async function criaEpocaNova(){
  const ep=epAtiva();
  const sugAno=(ep.anoInicio||new Date().getFullYear())+1;
  const nome=await pergunta("Nova época","Nome (ex: "+sugAno+"/"+String(sugAno+1).slice(2)+")",
                            sugAno+"/"+String(sugAno+1).slice(2));
  if(nome===null||!String(nome).trim())return;
  const ano=anoDoNome(String(nome))||sugAno;
  const nova={id:criaId(),nome:String(nome).trim(),anoInicio:ano,valorKm:ep.valorKm,
              deslocacoes:JSON.parse(JSON.stringify(ep.deslocacoes||[]))};
  if(!await guarda("epocas",nova))return;
  for(const r of S.tabela.filter(daEpoca)) await guarda("tabela",{...r,id:criaId(),epocaId:nova.id});
  for(const a of S.almocos.filter(daEpoca))await guarda("almocos",{...a,id:criaId(),epocaId:nova.id});
  S.settings.epocaAtivaId=nova.id; guardaEpocaEscolhida(nova.id);
  mesSel="all";mesRes="all";mesDesp="all";
  await recarrega();
  toast("Época "+nova.nome+" criada com as tarifas copiadas");
}

/* O tipo de jogo deixa de ser texto livre: só se escolhe entre os que existem
   na tabela de valores. E escolhem-se os escalões a que a regra se aplica. */
function formDesloc(idx){
  const ep=epAtiva();
  const novo=idx===undefined;
  const d=novo?{tipo:"",escaloes:[],modo:"fixo",valor:""}:JSON.parse(JSON.stringify(ep.deslocacoes[idx]));
  const tipos=tiposDeJogo();
  // Regra antiga com um tipo que não existe ("Distrital Senior"): propõe o
  // tipo verdadeiro que está no princípio do nome, e diz o que se passou.
  let aviso="";
  if(d.tipo&&!tipos.some(t=>norm(t)===norm(d.tipo))){
    const palpite=tipos.find(t=>norm(d.tipo).startsWith(norm(t)));
    aviso=`Esta regra estava como "${d.tipo}", que não é um tipo de jogo — por isso nunca se aplicou. Escolhe o tipo e marca os escalões.`;
    d.tipo=palpite||tipos[0]||"";
  }
  if(!d.tipo)d.tipo=tipos[0]||"";
  const dlg=$("#dlg");
  const pintaEscaloes=()=>{
    const tp=$("#dlT2",dlg).value;
    const lista=escaloesDoTipo(tp);
    const marcados=new Set(escaloesDaRegra(d).map(norm));
    // os escalões que já têm regra própria noutra regra deste tipo
    const ocupados=new Set((ep.deslocacoes||[]).filter((x,i)=>i!==idx&&norm(x.tipo)===norm(tp))
      .flatMap(x=>escaloesDaRegra(x)).map(norm));
    $("#dlEsc",dlg).innerHTML=lista.length?lista.map(e=>{
      const oc=ocupados.has(norm(e));
      return `<label style="display:flex;align-items:center;gap:8px;margin:6px 0;font-weight:400${oc?";opacity:.5":""}">
        <input type="checkbox" value="${esc(e)}" ${marcados.has(norm(e))?"checked":""} ${oc?"disabled":""} style="width:auto">
        ${esc(e)}${oc?' <span class="mut sub">(já tem regra)</span>':""}</label>`;}).join("")
      :`<div class="mut">Não há escalões deste tipo na tabela de valores.</div>`;
  };
  dlg.innerHTML=`<h2>${novo?"Nova regra de deslocação":"Editar deslocação"} — ${esc(ep.nome)}</h2>
  ${aviso?`<div class="warn sub" style="margin-bottom:8px">⚠ ${esc(aviso)}</div>`:""}
  <label for="dlT2">Tipo de jogo</label>
  <select id="dlT2">${tipos.map(t=>`<option ${norm(t)===norm(d.tipo)?"selected":""}>${esc(t)}</option>`).join("")}</select>
  <label>Escalões</label>
  <div class="mut sub">Sem nenhum marcado, a regra vale para todos os escalões deste tipo que não tenham regra própria.</div>
  <div id="dlEsc" style="margin:4px 0 6px"></div>
  <label for="dlM">Como se paga</label><select id="dlM"><option value="fixo" ${d.modo==="fixo"?"selected":""}>Valor fixo por jogo</option><option value="km" ${d.modo==="km"?"selected":""}>Por km (€/km)</option></select>
  <label for="dlV">Valor (€)</label><input type="text" inputmode="decimal" id="dlV" value="${esc(numTxt(d.valor))}" placeholder="0,00">
  <div class="btnrow"><button class="btn" id="dlCancel">Cancelar</button><button class="btn pri" id="dlSave">Guardar</button></div>`;
  pintaEscaloes();
  $("#dlT2",dlg).onchange=()=>{d.escaloes=[];pintaEscaloes();};
  $("#dlCancel",dlg).onclick=()=>dlg.close();
  $("#dlSave",dlg).onclick=async()=>{
    const tipo=$("#dlT2",dlg).value,modo=$("#dlM",dlg).value,valor=num($("#dlV",dlg).value);
    const escaloes=[...$$("#dlEsc input:checked",dlg)].map(x=>x.value);
    if(!tipo){toast("Escolhe o tipo de jogo","erro");return;}
    if(isNaN(valor)||valor<0){toast("O valor tem de ser um número — usa vírgula, como 0,36","erro");return;}
    ep.deslocacoes=ep.deslocacoes||[];
    const outras=ep.deslocacoes.filter((x,i)=>(novo||i!==idx)&&norm(x.tipo)===norm(tipo));
    if(!escaloes.length&&outras.some(x=>!escaloesDaRegra(x).length)){
      toast(`Já existe uma regra geral para ${tipo}. Marca os escalões a que esta se aplica.`,"erro");return;}
    const choque=escaloes.find(e=>outras.some(x=>escaloesDaRegra(x).some(y=>norm(y)===norm(e))));
    if(choque){toast(`${choque} já tem regra própria`,"erro");return;}
    const antes=JSON.parse(JSON.stringify(ep.deslocacoes));
    const regra={tipo,escaloes,modo,valor};
    if(novo)ep.deslocacoes.push(regra); else ep.deslocacoes[idx]=regra;
    if(!await guarda("epocas",ep)){ep.deslocacoes=antes;return;}
    confirmaGravado();dlg.close();render();toast("Deslocação guardada");
  };
  abreDlg(dlg);
}
function formDistancia(d){
  const novo=!d; d=d?{...d}:{id:criaId(),membroId:S.settings.membroEuId||S.membros[0]?.id,local:"",km:""};
  const dlg=$("#dlg");
  dlg.innerHTML=`<h2>${novo?"Nova distância":"Editar distância"}</h2>
  <div class="mut sub">Usada para preencher os km sozinha quando registares um jogo neste campo.</div>
  <label>Quem</label><select id="kM">${S.membros.map(m=>`<option value="${esc(m.id)}" ${m.id===d.membroId?"selected":""}>${esc(m.nome)}</option>`).join("")}</select>
  <label>Campo</label><input id="kL" list="dlLoc2" value="${esc(d.local)}" placeholder="ex: Campo da Junta">
  <datalist id="dlLoc2">${locaisConhecidos().map(l=>`<option value="${esc(l)}">`).join("")}</datalist>
  <label>Km (ida e volta, como registas nos jogos)</label><input type="text" inputmode="decimal" id="kV" value="${esc(numTxt(d.km))}" placeholder="0">
  <div class="btnrow"><button class="btn" id="kCancel">Cancelar</button><button class="btn pri" id="kSave">Guardar</button></div>`;
  $("#kCancel").onclick=()=>dlg.close();
  $("#kSave").onclick=async()=>{
    const membroId=$("#kM").value, local=$("#kL").value.trim(), km=num($("#kV").value);
    if(!local){toast("Indica o campo","erro");return;}
    if(isNaN(km)||km<=0){toast("Os km têm de ser um número maior que zero","erro");return;}
    const dup=(S.distancias||[]).find(x=>x.id!==d.id&&x.membroId===membroId&&normLocal(x.local)===normLocal(local));
    if(dup){toast("Já existe uma distância para essa pessoa nesse campo");return;}
    Object.assign(d,{membroId,local,km});
    if(!await guarda("distancias",d))return;
    S.distancias=S.distancias||[];
    const ix=S.distancias.findIndex(x=>x.id===d.id);
    if(ix>=0)S.distancias[ix]=d;else S.distancias.push(d);
    confirmaGravado();dlg.close();render();toast("Distância guardada");
  };
  abreDlg(dlg);
}
function formMembro(m){
  const novo=!m; m=m?{...m}:{id:criaId(),nome:"",alias:"",papel:"assistente",funcao:"AA2",ativo:true};
  const dlg=$("#dlg");
  dlg.innerHTML=`<h2>${novo?"Novo membro":"Editar membro"}</h2>
  <label>Nome</label><input id="mN" value="${esc(m.nome)}" placeholder="ex: A. Nunes">
  <label>Nome nas convocatórias (opcional)</label><input id="mA" value="${esc(m.alias||"")}" placeholder="como vem na convocatória">
  <div class="mut sub" style="margin-top:4px">Dica: usa nome + apelido para a app reconhecer sozinha "A Nunes", "X Brito", etc. Ela também aprende quando confirmas uma convocatória.</div>
  <label for="mF">Função habitual em campo</label>
  <select id="mF">${[["arbitro","Árbitro"],["AA1","AA1"],["AA2","AA2"],["outro","Outra"]]
    .map(([v,t])=>`<option value="${v}" ${(m.funcao||"AA2")===v?"selected":""}>${t}</option>`).join("")}</select>
  <label for="mP">Papel na app</label>
  <select id="mP">
    <option value="assistente" ${m.papel!=="responsavel"?"selected":""}>Assistente — vê o que é dele, não altera</option>
    <option value="responsavel" ${m.papel==="responsavel"?"selected":""}>Responsável — vê e altera tudo</option>
  </select>
  <div class="mut sub" style="margin-top:4px">O papel decide o que a pessoa pode fazer, e é a base de dados que o impõe — não são botões escondidos.</div>
  <div class="btnrow"><button class="btn" id="mCancel">Cancelar</button><button class="btn pri" id="mSave">Guardar</button></div>`;
  $("#mCancel").onclick=()=>dlg.close();
  $("#mSave").onclick=async()=>{
    const nome=$("#mN").value.trim();
    if(!nome){toast("Falta o nome");return;}
    const eraResp=m.papel==="responsavel", vaiSer=$("#mP").value==="responsavel";
    if(eraResp&&!vaiSer&&m.id===(EUMEMBRO&&EUMEMBRO.id)){
      toast("Não te podes tirar a ti próprio de responsável — a equipa ficava sem ninguém a poder editar.","erro");return;
    }
    Object.assign(m,{nome,alias:$("#mA").value.trim(),funcao:$("#mF").value,papel:$("#mP").value});
    if(!await guarda("membros",m))return;
    if(novo)S.membros.push(m); else S.membros[S.membros.findIndex(x=>x.id===m.id)]=m;
    confirmaGravado();dlg.close();await recarrega(true);toast("Membro guardado");
  };
  abreDlg(dlg);
}
function formTarifa(r){
  const novo=!r; r=r?{...r}:{id:criaId(),epocaId:epAtiva().id,tipo:"Distrital",escalao:"",funcao:"A",valor:""};
  const dlg=$("#dlg");
  dlg.innerHTML=`<h2>${novo?"Nova tarifa":"Editar tarifa"} — ${esc(epAtiva().nome)}</h2>
  <label>Tipo de jogo</label><input id="tT" list="dlT" value="${esc(r.tipo)}"><datalist id="dlT">${[...new Set(S.tabela.filter(daEpoca).map(x=>x.tipo))].map(t=>`<option value="${esc(t)}">`).join("")}</datalist>
  <label>Escalão</label><input id="tE" value="${esc(r.escalao)}">
  <label>Função</label><select id="tF">${FUNCOES.map(f=>`<option ${f===r.funcao?"selected":""}>${f}</option>`).join("")}</select>
  <label>Valor (€)</label><input type="text" inputmode="decimal" id="tV" value="${esc(numTxt(r.valor))}" placeholder="0,00">
  <div class="btnrow"><button class="btn" id="tCancel">Cancelar</button><button class="btn pri" id="tSave">Guardar</button></div>`;
  $("#tCancel").onclick=()=>dlg.close();
  $("#tSave").onclick=async()=>{
    const tipo=$("#tT").value.trim(),escalao=$("#tE").value.trim(),funcao=$("#tF").value,valor=num($("#tV").value);
    if(!tipo||!escalao){toast("Preenche o tipo de jogo e o escalão","erro");return;}
    if(isNaN(valor)||valor<0){toast("O valor tem de ser um número — usa vírgula, como 23,00","erro");return;}
    const dup=S.tabela.find(x=>x.id!==r.id&&x.epocaId===r.epocaId&&norm(x.tipo)===norm(tipo)&&norm(x.escalao)===norm(escalao)&&norm(x.funcao)===norm(funcao));
    if(dup){toast("Já existe uma tarifa com esta combinação");return;}
    Object.assign(r,{tipo,escalao,funcao,valor});
    if(!await guarda("tabela",r))return;
    if(novo)S.tabela.push(r); else S.tabela[S.tabela.findIndex(x=>x.id===r.id)]=r;
    confirmaGravado();dlg.close();render();toast("Tarifa guardada");
  };
  abreDlg(dlg);
}
function formAlmoco(a){
  const novo=!a; a=a?{...a}:{id:criaId(),epocaId:epAtiva().id,nome:"",valor:""};
  const dlg=$("#dlg");
  dlg.innerHTML=`<h2>${novo?"Novo almoço":"Editar almoço"} — ${esc(epAtiva().nome)}</h2>
  <label>Nome (ex: Nacional +100km)</label><input id="aN" value="${esc(a.nome)}">
  <label>Valor (€)</label><input type="text" inputmode="decimal" id="aV" value="${esc(numTxt(a.valor))}" placeholder="0,00">
  <div class="btnrow"><button class="btn" id="aCancel">Cancelar</button><button class="btn pri" id="aSave">Guardar</button></div>`;
  $("#aCancel").onclick=()=>dlg.close();
  $("#aSave").onclick=async()=>{
    const nome=$("#aN").value.trim(),valor=num($("#aV").value);
    if(!nome){toast("Indica o nome do almoço","erro");return;}
    if(isNaN(valor)||valor<0){toast("O valor tem de ser um número — usa vírgula, como 7,50","erro");return;}
    Object.assign(a,{nome,valor});
    if(!await guarda("almocos",a))return;
    if(novo)S.almocos.push(a); else S.almocos[S.almocos.findIndex(x=>x.id===a.id)]=a;
    confirmaGravado();dlg.close();render();toast("Guardado");
  };
  abreDlg(dlg);
}
