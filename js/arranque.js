/* js/arranque.js — Service worker, pedidos que chegam pelo endereço (partilha, atalhos) e arranque da app.
   Script normal (sem módulos nem build), carregado pelo index.html por esta
   ordem: base, calculo, jogos, despesas-multas, resumo, bd, conta, sessao,
   definicoes, arranque. Partilham o mesmo âmbito global, como quando eram um
   <script> só. */
"use strict";

/* ============ PWA ============ */
/* A versão nova do service worker fica em espera e o utilizador decide quando
   trocar — recarregar por baixo de um formulário a meio perdia o que lá estava. */
let aRecarregar=false;
function mostraNovaVersao(reg){
  if($("#upbar"))return;
  const d=document.createElement("div");
  d.className="upbar";d.id="upbar";d.setAttribute("role","status");
  d.innerHTML=`<span class="txt">Nova versão disponível</span>
    <button class="btn sm" id="upDepois">Depois</button>
    <button class="btn sm pri" id="upJa">Atualizar</button>`;
  document.body.appendChild(d);
  document.body.classList.add("com-upbar");
  const tira=()=>{d.remove();document.body.classList.remove("com-upbar");};
  $("#upDepois").onclick=tira;
  $("#upJa").onclick=()=>{
    tira();aRecarregar=true;
    if(reg.waiting)reg.waiting.postMessage("SKIP_WAITING");
    else location.reload();
  };
}
if("serviceWorker" in navigator && location.protocol.startsWith("http")){
  navigator.serviceWorker.register("sw.js").then(reg=>{
    const vigia=w=>{ if(!w)return;
      w.addEventListener("statechange",()=>{
        if(w.state==="installed"&&navigator.serviceWorker.controller)mostraNovaVersao(reg);
      });
    };
    if(reg.waiting&&navigator.serviceWorker.controller)mostraNovaVersao(reg);
    reg.addEventListener("updatefound",()=>vigia(reg.installing));
    setInterval(()=>reg.update().catch(()=>{}),60*60*1000);
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)reg.update().catch(()=>{});});
  }).catch(()=>{});
  navigator.serviceWorker.addEventListener("controllerchange",()=>{
    if(!aRecarregar)return;      // primeira instalação não recarrega nada
    aRecarregar=false;location.reload();
  });
}
/* ===========================================================================
 * ARRANQUE
 * ---------------------------------------------------------------------------
 * A ordem importa e é sempre esta, sem estados intermédios sem explicação:
 *
 *   1. Venho de um email de recuperação?  -> pedir palavra-passe nova
 *   2. Não tenho sessão?                  -> ecrã de conta
 *   3. Tenho sessão mas não tenho equipa? -> ecrã de criar/entrar com código
 *   4. Tenho as duas                      -> carregar os dados e abrir a app
 *
 * O caso 3 é o que antes deixava as pessoas num ecrã vazio a olhar para nada.
 * ========================================================================= */
/* ============ Pedidos que chegam pelo endereço ============
   Duas portas de entrada que o manifest abre:
     · "Partilhar" no WhatsApp ou nas SMS -> Arbitragem: chega ?text=… e abre a
       convocatória já colada (share_target);
     · carregar sem soltar no ícone: ?acao=convocatoria, ?acao=novo-jogo,
       ?separador=resumo (shortcuts).
   Lê-se uma vez, tira-se do endereço (senão um recarregar repetia o pedido) e
   só se aplica com a app aberta — quem ainda tem de entrar na conta não perde
   a mensagem partilhada. */
const PEDIDO_URL=(()=>{
  try{
    const q=new URLSearchParams(location.search);
    const partes=[q.get("title"),q.get("text"),q.get("url")].map(x=>String(x||"").trim()).filter(Boolean);
    const texto=[...new Set(partes)].join("\n");
    const r={texto,acao:q.get("acao")||"",separador:q.get("separador")||"",feito:false};
    if(texto||r.acao||r.separador)history.replaceState(null,"",location.pathname+location.hash);
    return r;
  }catch(_){return {texto:"",acao:"",separador:"",feito:true};}
})();
function aplicaPedidoUrl(){
  const p=PEDIDO_URL; if(!p||p.feito)return; p.feito=true;
  const sep=["jogos","despesas","multas","resumo","config"].includes(p.separador)?p.separador:"";
  if(sep){const b=$(`.tabbar button[data-tab="${sep}"]`); if(b)b.click();}
  if(p.texto||p.acao==="convocatoria"||p.acao==="novo-jogo"){
    if(!souResponsavel()){
      toast(p.texto?"Recebi a mensagem, mas só o responsável regista jogos 👀":"Só o responsável regista jogos 👀");
      return;
    }
    if(p.acao==="novo-jogo"&&!p.texto)formJogo();
    else formConv(p.texto);
  }
}

async function arranca(){
  const tk=tokensDoEndereco();

  if(tk&&tk.erro){
    mostraLogin("entrar");
    setTimeout(()=>{const e=$("#cErr");if(e)e.textContent=traduzAuth(tk.erro);},50);
    return;
  }

  if(tk&&tk.access){
    const cfg=sbCfg();
    SY.url=cfg?cfg.url:SY.url; SY.key=cfg?cfg.key:SY.key;
    SY.access=tk.access; SY.refresh=tk.refresh||SY.refresh;
    SY.exp=Date.now()/1000+3600; SY.pass=""; saveSY();
    if(tk.tipo==="recovery"){ mostraLogin("novapass"); return; }
    // confirmação de email: a sessão já vem feita, segue para a app
    await entraDepoisDeAutenticar();
    return;
  }

  if(precisaConta()){ mostraLogin("entrar"); return; }

  // Sessão guardada: tentar usá-la antes de mostrar seja o que for.
  try{
    await sbAuth();
  }catch(e){
    const err=classifica(e);
    // Sem rede NÃO é sessão expirada. Mandar escrever a password a quem está
    // sem rede é pior do que inútil: também não ia funcionar.
    if(err.tipo===TIPO_REDE){ if(!abreDaCopia())mostraSemLigacao(); return; }
    mostraLogin("entrar");
    setTimeout(()=>{const el=$("#cErr");if(el)el.textContent="A tua sessão expirou. Entra outra vez.";},50);
    return;
  }
  await entraDepoisDeAutenticar();
}

// pedir armazenamento persistente para o service worker e o tema, não para dados
if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});

arranca();
