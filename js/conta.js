/* js/conta.js — Conta (registo, entrar, recuperar palavra-passe) e equipa (criar, entrar com código, à espera de aprovação).
   Script normal (sem módulos nem build), carregado pelo index.html por esta
   ordem: base, calculo, jogos, despesas-multas, resumo, bd, conta, sessao,
   definicoes, arranque. Partilham o mesmo âmbito global, como quando eram um
   <script> só. */
"use strict";

/* ===========================================================================
 * CONTAS: registo, confirmação por email, recuperação de palavra-passe
 * ---------------------------------------------------------------------------
 * Tudo pela API de Auth do Supabase, com a chave `anon`. A palavra-passe nunca
 * fica gravada no telemóvel: guardamos só o refresh_token, que é o que mantém
 * a sessão viva de uma semana para a outra sem voltar a perguntar nada.
 * ========================================================================= */

async function authReq(caminho,corpo,metodo="POST"){
  const cfg=sbCfg();
  if(!cfg)throw new ErroDados(TIPO_SERVIDOR,"A app não está configurada (falta o config.local.js).");
  let r;
  try{
    r=await fetch(cfg.url+"/auth/v1/"+caminho,{
      method:metodo,
      headers:{apikey:cfg.key,"Content-Type":"application/json"},
      body:corpo?JSON.stringify(corpo):undefined
    });
  }catch(e){ throw new ErroDados(TIPO_REDE,"sem ligação"); }
  ajustaRelogio(r);
  const t=await r.text();
  let d=null; try{ d=t?JSON.parse(t):null; }catch(_){}
  if(!r.ok){
    const det=(d&&(d.error_description||d.msg||d.message||d.error))||("erro "+r.status);
    throw new ErroDados(r.status===400||r.status===422?TIPO_SERVIDOR:TIPO_SESSAO,det,det);
  }
  return d;
}

/* Traduz o que o Supabase responde em inglês para algo que se perceba. */
function traduzAuth(msg){
  const m=String(msg||"").toLowerCase();
  if(m.includes("invalid login credentials"))return "Email ou palavra-passe errados.";
  if(m.includes("email not confirmed"))      return "Ainda não confirmaste o email. Vê a tua caixa de entrada.";
  if(m.includes("user already registered")||m.includes("already been registered"))
                                             return "Já existe uma conta com esse email. Entra, ou recupera a palavra-passe.";
  if(m.includes("password should be at least"))return "A palavra-passe tem de ter pelo menos 6 caracteres.";
  if(m.includes("unable to validate email")||m.includes("invalid email"))
                                             return "Esse email não parece válido.";
  if(m.includes("for security purposes")||m.includes("rate limit"))
                                             return "Demasiadas tentativas seguidas. Espera um minuto.";
  if(m.includes("token has expired")||m.includes("invalid or has expired"))
                                             return "Essa ligação já expirou. Pede outra.";
  return msg||"Não consegui.";
}

async function registaConta(email,pass,nome){
  const d=await authReq("signup",{
    email,password:pass,
    data:{nome},
    // volta para a app depois de carregar na ligação do email
    gotrue_meta_security:{}
  });
  // Com confirmação de email ligada, o Supabase devolve o utilizador sem
  // sessão. É por isso que aqui não se entra: espera-se pelo email.
  return {precisaConfirmar:!d||!d.access_token, dados:d};
}

async function entraConta(email,pass){
  const d=await authReq("token?grant_type=password",{email,password:pass});
  const cfg=sbCfg();
  SY.url=cfg.url; SY.key=cfg.key; SY.email=email;
  SY.access=d.access_token; SY.refresh=d.refresh_token;
  SY.exp=Date.now()/1000+(d.expires_in||3600);
  SY.pass="";
  saveSY();
  return d;
}

async function pedeRecuperacao(email){
  await authReq("recover",{email,
    // para onde o email leva a pessoa de volta
    ...(location.origin.startsWith("http")?{redirect_to:location.origin+location.pathname}:{})
  });
}

async function reenviaConfirmacao(email){
  await authReq("resend",{type:"signup",email});
}

/* Quando alguém chega vindo do email de recuperação, o Supabase põe os tokens
   no fragmento do endereço (#access_token=...&type=recovery). Apanhamos isso
   ANTES de qualquer outra coisa e pedimos a palavra-passe nova. */
function tokensDoEndereco(){
  const h=location.hash||"";
  if(!h.includes("access_token"))return null;
  const p=new URLSearchParams(h.replace(/^#/,""));
  const o={
    access:p.get("access_token"), refresh:p.get("refresh_token"),
    tipo:p.get("type"), erro:p.get("error_description")||p.get("error")
  };
  // limpar o endereço para os tokens não ficarem no histórico do browser
  try{history.replaceState(null,"",location.pathname+location.search);}catch(_){}
  return o;
}

async function defineNovaPass(nova){
  const cfg=sbCfg();
  const r=await fetch(cfg.url+"/auth/v1/user",{
    method:"PUT",
    headers:{apikey:cfg.key,Authorization:"Bearer "+SY.access,"Content-Type":"application/json"},
    body:JSON.stringify({password:nova})
  });
  if(!r.ok){
    let det="";try{const j=await r.json();det=j.msg||j.message||j.error_description||"";}catch(_){}
    throw new ErroDados(TIPO_SERVIDOR,traduzAuth(det),det);
  }
}

async function terminaSessao(){
  const nFila=leFila().length;
  if(nFila&&!await confirma(nFila+(nFila>1?" alterações feitas sem rede ainda não foram enviadas":" alteração feita sem rede ainda não foi enviada")+
      ". Se saíres agora, perdem-se.",{titulo:"Há coisas por enviar",confirmar:"Sair na mesma",perigo:true}))return;
  apagaDadosLocais();
  try{ await desligaAvisos(true); }catch(_){}
  try{
    const cfg=sbCfg();
    if(SY.access)await fetch(cfg.url+"/auth/v1/logout",{
      method:"POST",headers:{apikey:cfg.key,Authorization:"Bearer "+SY.access}});
  }catch(_){}
  SY={off:relogioOffset}; saveSY();
  EQUIPA=null; EUMEMBRO=null;
  try{localStorage.removeItem(K_EPOCA);}catch(_){}
  location.reload();
}

/* ===========================================================================
 * EQUIPAS: criar ou entrar com código
 * ---------------------------------------------------------------------------
 * As duas passam por funções do PostgreSQL em vez de escritas diretas, e a
 * razão é de segurança, não de gosto: para validar um código é preciso ler a
 * tabela das equipas, e quem ainda não é membro não pode lê-la — senão bastava
 * pedir a lista de códigos todos.
 * ========================================================================= */

async function chamaRpc(nome,args){
  return sbReq("POST","rpc/"+nome,args||{});
}

async function criaEquipa(nome,meuNome){
  const d=await chamaRpc("criar_equipa",{p_nome:nome,p_meu_nome:meuNome||null});
  const linha=Array.isArray(d)?d[0]:d;
  return linha; // {equipa_id, codigo}
}

async function entraEquipa(codigo,meuNome){
  const d=await chamaRpc("entrar_com_codigo",{p_codigo:codigo,p_meu_nome:meuNome||null});
  const linha=Array.isArray(d)?d[0]:d;
  return linha; // {equipa_id, equipa_nome, papel}
}

async function rodaCodigo(){
  return chamaRpc("rodar_codigo",{p_equipa:EQUIPA.id});
}

/* Descobre a que equipa pertenço. Devolve null se ainda não pertenço a
   nenhuma — e nesse caso o ecrã seguinte é sempre criar/entrar, nunca um
   ecrã vazio sem explicação. */
async function descobreEquipa(){
  // Filtrar por user_id é obrigatório, não é otimização: um membro vê os outros
  // membros da equipa, por isso sem este filtro a app podia apanhar a linha de
  // outra pessoa e dar-me o papel dela. Já aconteceu uma vez nos testes: o
  // assistente ficou responsável porque veio primeiro na lista.
  const meu=await idDoUtilizador();
  if(!meu)return null;
  // "*" e não a lista de colunas: `aprovado` e `codigo_expira_em` só existem
  // depois do sql/05, e pedi-las por nome antes disso partia o arranque.
  const membros=await sbReq("GET",
    "membros_equipa?select=*,equipas(*)&ativo=is.true&user_id=eq."+encodeURIComponent(meu));
  if(!membros||!membros.length){ EUMEMBRO=null; EQUIPA=null; return null; }
  // Uma pessoa pode vir a ter várias equipas; por agora fica a primeira, mas o
  // modelo já aguenta várias (é uma relação, não um campo no perfil). Uma
  // equipa onde já fui aprovado ganha a uma onde ainda estou à espera.
  const minhas=membros.filter(m=>m.user_id===meu);
  const escolhido=minhas.find(m=>m.aprovado!==false)||minhas[0]||membros[0];
  EUMEMBRO={id:escolhido.id,nome:escolhido.nome,alias:escolhido.alias||"",
            papel:escolhido.papel,funcao:escolhido.funcao_habitual,
            pendente:escolhido.aprovado===false};
  // Quem está pendente não lê a tabela das equipas: o nome vem do que o
  // servidor respondeu quando entrou com o código.
  const e=escolhido.equipas||{};
  EQUIPA={id:escolhido.equipa_id,nome:e.nome||leEquipaPendente()||"A minha equipa",
          codigo:e.codigo_convite||"",codigoExpira:e.codigo_expira_em||"",categorias:e.categorias||[]};
  return EQUIPA;
}

/* ===========================================================================
 * ECRÃ DE CONTA — um só ecrã com quatro estados
 * ---------------------------------------------------------------------------
 * entrar | registar | recuperar | nova palavra-passe
 * Um ecrã só, porque saltar entre páginas a meio de um registo é onde as
 * pessoas desistem. O estado muda, o sítio é o mesmo.
 * ========================================================================= */
let modoConta="entrar";

function precisaConta(){ return !(SY.email&&SY.refresh); }

function fechaConta(){
  document.body.classList.remove("login-on");
  const e=$("#loginScr"); if(e)e.remove();
}

function mostraLogin(modo){
  modoConta=modo||"entrar";
  fechaConta();
  document.body.classList.add("login-on");
  const div=document.createElement("div"); div.id="loginScr";
  div.innerHTML=`<div class="lbox" id="cxConta"></div>`;
  document.body.appendChild(div);
  pintaConta();
}

function pintaConta(){
  const cx=$("#cxConta"); if(!cx)return;
  const cfg=sbCfg();
  const cab=`<div class="emblem" style="width:64px;height:64px;font-size:1.35rem;margin:0 auto 12px;border-radius:20px">ER</div>`;

  if(!cfg){
    cx.innerHTML=cab+`<h2 style="text-align:center;font-size:1.2rem;font-weight:800">Falta configurar</h2>
      <div class="mut sub" style="text-align:center;margin-top:10px">
        Esta cópia da app não sabe a que base de dados se ligar. Falta o ficheiro
        <b>config.local.js</b> ao lado do index.html.</div>`;
    return;
  }

  if(modoConta==="novapass"){
    cx.innerHTML=cab+`
    <h2 style="text-align:center;margin-bottom:6px;font-size:1.2rem;font-weight:800">Nova palavra-passe</h2>
    <div class="mut sub" style="text-align:center;margin-bottom:14px">Escolhe uma palavra-passe nova. Mínimo 6 caracteres.</div>
    <label for="cP1">Palavra-passe nova</label><input id="cP1" type="password" autocomplete="new-password">
    <label for="cP2">Outra vez, para confirmar</label><input id="cP2" type="password" autocomplete="new-password">
    <div class="neg sub" id="cErr" style="margin-top:8px" role="alert"></div>
    <button class="btn pri" style="width:100%;margin-top:16px" id="cGo">Guardar palavra-passe</button>`;
    $("#cGo").onclick=async()=>{
      const err=$("#cErr"); err.textContent="";
      const a=$("#cP1").value, b=$("#cP2").value;
      if(a.length<6){err.textContent="A palavra-passe tem de ter pelo menos 6 caracteres.";return;}
      if(a!==b){err.textContent="As duas palavras-passe não são iguais.";return;}
      ocupado("#cGo","A guardar…");
      try{
        await defineNovaPass(a);
        toast("Palavra-passe alterada ✅");
        await entraDepoisDeAutenticar();
      }catch(e){ livre("#cGo","Guardar palavra-passe"); err.textContent=mensagemAuth(e); }
    };
    return;
  }

  if(modoConta==="recuperar"){
    cx.innerHTML=cab+`
    <h2 style="text-align:center;margin-bottom:6px;font-size:1.2rem;font-weight:800">Recuperar acesso</h2>
    <div class="mut sub" style="text-align:center;margin-bottom:14px">Escreve o teu email e enviamos-te uma ligação para escolheres uma palavra-passe nova. Se o email não chegar, o responsável da equipa consegue dar-te uma à mão.</div>
    <label for="cE">Email</label><input id="cE" type="email" autocomplete="username" inputmode="email" value="${esc(SY.email||"")}">
    <div class="neg sub" id="cErr" style="margin-top:8px" role="alert"></div>
    <div class="ok sub" id="cOk" style="margin-top:8px" role="status"></div>
    <button class="btn pri" style="width:100%;margin-top:16px" id="cGo">Enviar ligação</button>
    <button class="btn" style="width:100%;margin-top:8px" id="cVolta">Voltar</button>`;
    $("#cVolta").onclick=()=>{modoConta="entrar";pintaConta();};
    $("#cGo").onclick=async()=>{
      const err=$("#cErr"),ok=$("#cOk"); err.textContent="";ok.textContent="";
      const em=$("#cE").value.trim();
      if(!em){err.textContent="Falta o email.";return;}
      ocupado("#cGo","A enviar…");
      try{
        await pedeRecuperacao(em);
        ok.innerHTML="Enviado. Vê a tua caixa de entrada — e o spam.<br>"+
          "Se não chegar nada em poucos minutos, pede ao responsável da equipa "+
          "para te dar uma palavra-passe nova.";
        livre("#cGo","Enviar outra vez");
      }catch(e){ livre("#cGo","Enviar ligação"); err.textContent=mensagemAuth(e); }
    };
    return;
  }

  if(modoConta==="registar"){
    cx.innerHTML=cab+`
    <h2 style="text-align:center;margin-bottom:6px;font-size:1.2rem;font-weight:800">Criar conta</h2>
    <div class="mut sub" style="text-align:center;margin-bottom:14px">Cada pessoa da equipa tem a sua conta.</div>
    <label for="cN">O teu nome</label><input id="cN" autocomplete="name" placeholder="como apareces nas convocatórias">
    <label for="cE">Email</label><input id="cE" type="email" autocomplete="username" inputmode="email">
    <label for="cP">Palavra-passe</label><input id="cP" type="password" autocomplete="new-password" placeholder="mínimo 6 caracteres">
    <div class="neg sub" id="cErr" style="margin-top:8px" role="alert"></div>
    <button class="btn pri" style="width:100%;margin-top:16px" id="cGo">Criar conta</button>
    <button class="btn" style="width:100%;margin-top:8px" id="cVolta">Já tenho conta</button>`;
    $("#cP").addEventListener("keydown",e=>{if(e.key==="Enter")$("#cGo").click();});
    $("#cVolta").onclick=()=>{modoConta="entrar";pintaConta();};
    $("#cGo").onclick=async()=>{
      const err=$("#cErr"); err.textContent="";
      const nome=$("#cN").value.trim(), em=$("#cE").value.trim(), pw=$("#cP").value;
      if(!nome){err.textContent="Falta o teu nome.";return;}
      if(!em){err.textContent="Falta o email.";return;}
      if(pw.length<6){err.textContent="A palavra-passe tem de ter pelo menos 6 caracteres.";return;}
      ocupado("#cGo","A criar…");
      try{
        const r=await registaConta(em,pw,nome);
        if(r.precisaConfirmar){
          nomeEscolhido=nome;
          cx.innerHTML=cab+`
            <h2 style="text-align:center;margin-bottom:6px;font-size:1.2rem;font-weight:800">Confirma o email</h2>
            <div class="mut sub" style="text-align:center;margin-bottom:14px">
              Enviámos uma mensagem para <b>${esc(em)}</b>. Carrega na ligação que lá está e
              volta aqui para entrar.</div>
            <div class="neg sub" id="cErr" role="alert"></div>
            <div class="ok sub" id="cOk" role="status"></div>
            <button class="btn" style="width:100%;margin-top:12px" id="cRe">Não recebi — enviar outra vez</button>
            <button class="btn pri" style="width:100%;margin-top:8px" id="cVolta">Já confirmei, entrar</button>`;
          $("#cVolta").onclick=()=>{SY.email=em;saveSY();modoConta="entrar";pintaConta();};
          $("#cRe").onclick=async()=>{
            ocupado("#cRe","A enviar…");
            try{ await reenviaConfirmacao(em); $("#cOk").textContent="Enviado outra vez."; }
            catch(e){ $("#cErr").textContent=mensagemAuth(e); }
            livre("#cRe","Enviar outra vez");
          };
        }else{
          // confirmação de email desligada no projeto: entra logo
          nomeEscolhido=nome;
          await entraConta(em,pw);
          await entraDepoisDeAutenticar();
        }
      }catch(e){ livre("#cGo","Criar conta"); err.textContent=mensagemAuth(e); }
    };
    return;
  }

  // ---- entrar ----
  cx.innerHTML=cab+`
  <h2 style="text-align:center;margin-bottom:14px;font-size:1.2rem;font-weight:800">Entrar</h2>
  <label for="cE">Email</label><input id="cE" type="email" autocomplete="username" inputmode="email" value="${esc(SY.email||"")}">
  <label for="cP">Palavra-passe</label><input id="cP" type="password" autocomplete="current-password">
  <div class="neg sub" id="cErr" style="margin-top:8px" role="alert"></div>
  <button class="btn pri" style="width:100%;margin-top:16px" id="cGo">Entrar</button>
  <button class="btn" style="width:100%;margin-top:8px" id="cNovo">Criar conta</button>
  <button class="btn" style="width:100%;margin-top:8px;background:none;border:none" id="cEsq">Esqueci-me da palavra-passe</button>`;
  $("#cP").addEventListener("keydown",e=>{if(e.key==="Enter")$("#cGo").click();});
  $("#cNovo").onclick=()=>{modoConta="registar";pintaConta();};
  $("#cEsq").onclick=()=>{modoConta="recuperar";pintaConta();};
  $("#cGo").onclick=async()=>{
    const err=$("#cErr"); err.textContent="";
    const em=$("#cE").value.trim(), pw=$("#cP").value;
    if(!em||!pw){err.textContent="Preenche o email e a palavra-passe.";return;}
    ocupado("#cGo","A entrar…");
    try{
      await entraConta(em,pw);
      await entraDepoisDeAutenticar();
    }catch(e){ livre("#cGo","Entrar"); err.textContent=mensagemAuth(e); }
  };
}

let nomeEscolhido="";
function mensagemAuth(e){
  if(e instanceof ErroDados&&e.tipo===TIPO_REDE)return "Sem ligação. Tenta outra vez quando tiveres rede.";
  return traduzAuth((e&&(e.detalhe||e.message))||e);
}
function ocupado(sel,txt){const b=$(sel);if(b){b.disabled=true;b.dataset.antes=b.textContent;b.textContent=txt;}}
function livre(sel,txt){const b=$(sel);if(b){b.disabled=false;b.textContent=txt||b.dataset.antes||"";}}

/* Depois de a sessão estar iniciada: ou já tenho equipa e entro na app, ou
   vou direto ao ecrã de criar/entrar. Ninguém fica num ecrã vazio sem saber
   o que fazer a seguir — era isso que acontecia antes. */
async function entraDepoisDeAutenticar(){
  try{
    const eq=await descobreEquipa();
    if(!eq){ mostraEquipa(); return; }
    if(EUMEMBRO&&EUMEMBRO.pendente){ mostraPendente(); return; }
    fechaConta();
    await recarrega();
    const np=souResponsavel()?(S.pedidos||[]).length:0;
    if(np)toast(np+(np>1?" pedidos":" pedido")+" para entrar na equipa",
      {accao:{rotulo:"Ver",fn:()=>vaiParaSecao("membros")}});
    else toast("Olá"+(EUMEMBRO&&EUMEMBRO.nome?", "+EUMEMBRO.nome.split(" ")[0]:"")+
          (souResponsavel()?" ✏️":" 👀"));
    aplicaPedidoUrl();
  }catch(e){
    const err=classifica(e);
    // Falhar a chegar ao servidor no arranque não pode deixar a pessoa a olhar
    // para uma app vazia: diz-se o que se passa e dá-se um botão.
    if(err.tipo===TIPO_REDE){ if(!abreDaCopia())mostraSemLigacao(); return; }
    if(err.tipo===TIPO_SESSAO){ mostraLogin("entrar"); return; }
    falhou(err);
  }
}

/* ===========================================================================
 * ECRÃ DE EQUIPA — criar ou entrar com código
 * ========================================================================= */
function mostraEquipa(){
  fechaConta();
  document.body.classList.add("login-on");
  const div=document.createElement("div"); div.id="loginScr";
  div.innerHTML=`<div class="lbox" id="cxEquipa"></div>`;
  document.body.appendChild(div);
  pintaEquipa();
}

function pintaEquipa(){
  const cx=$("#cxEquipa"); if(!cx)return;
  cx.innerHTML=`
  <h2 style="text-align:center;margin-bottom:6px;font-size:1.2rem;font-weight:800">A tua equipa</h2>
  <div class="mut sub" style="text-align:center;margin-bottom:16px">
    Tens um código de convite? Usa-o. Se és tu que mandas na equipa, cria-a.</div>

  <div class="card" style="padding:14px">
    <b>Entrar com código</b>
    <div class="mut sub" style="margin:4px 0 8px">Seis letras e números que o responsável te deu.</div>
    <label for="eqC">Código</label>
    <input id="eqC" inputmode="text" autocapitalize="characters" maxlength="6"
           placeholder="ABC123" style="text-transform:uppercase;letter-spacing:.18em;font-weight:700;text-align:center">
    <label for="eqN1">O teu nome na equipa</label>
    <input id="eqN1" placeholder="como apareces nas convocatórias" value="${esc(nomeEscolhido)}">
    <button class="btn pri" style="width:100%;margin-top:12px" id="eqGo">Entrar na equipa</button>
  </div>

  <div class="card" style="padding:14px;margin-top:12px">
    <b>Criar equipa</b>
    <div class="mut sub" style="margin:4px 0 8px">Ficas responsável e recebes um código para dar aos outros.</div>
    <label for="eqNome">Nome da equipa</label>
    <input id="eqNome" placeholder="ex: Equipa Telmo Paiva">
    <label for="eqN2">O teu nome</label>
    <input id="eqN2" placeholder="como apareces nas convocatórias" value="${esc(nomeEscolhido)}">
    <button class="btn" style="width:100%;margin-top:12px" id="eqCria">Criar equipa</button>
  </div>

  <div class="neg sub" id="eqErr" style="margin-top:10px" role="alert"></div>
  <button class="btn" style="width:100%;margin-top:10px;background:none;border:none" id="eqSair">Terminar sessão</button>`;

  $("#eqSair").onclick=()=>terminaSessao();

  $("#eqGo").onclick=async()=>{
    const err=$("#eqErr"); err.textContent="";
    const cod=$("#eqC").value.trim().toUpperCase(), nome=$("#eqN1").value.trim();
    if(cod.length<4){err.textContent="O código tem seis caracteres.";return;}
    if(!nome){err.textContent="Falta o teu nome.";return;}
    ocupado("#eqGo","A entrar…");
    try{
      const r=await entraEquipa(cod,nome);
      // Com o sql/05, um código errado ou expirado responde sem linhas (para a
      // tentativa ficar contada) em vez de dar erro.
      if(!r){ livre("#eqGo","Entrar na equipa");
        err.textContent="Esse código não existe ou já expirou. Pede um código novo ao responsável."; return; }
      guardaEquipaPendente(r.equipa_nome||"");
      await descobreEquipa();
      if(EUMEMBRO&&EUMEMBRO.pendente){ mostraPendente(); return; }
      fechaConta();
      await recarrega();
      toast("Entraste na equipa "+(EQUIPA?EQUIPA.nome:""));
    }catch(e){
      livre("#eqGo","Entrar na equipa");
      const err2=classifica(e);
      const det=err2.detalhe||err2.message||"";
      err.textContent=err2.tipo===TIPO_REDE?"Sem ligação. Tenta outra vez quando tiveres rede."
        :/Demasiadas tentativas/i.test(det)?det
        :/c[oó]digo/i.test(det)?"Esse código não corresponde a nenhuma equipa."
        :mensagemDoErro(err2);
    }
  };

  $("#eqCria").onclick=async()=>{
    const err=$("#eqErr"); err.textContent="";
    const nomeEq=$("#eqNome").value.trim(), nome=$("#eqN2").value.trim();
    if(!nomeEq){err.textContent="Falta o nome da equipa.";return;}
    if(!nome){err.textContent="Falta o teu nome.";return;}
    ocupado("#eqCria","A criar…");
    try{
      const r=await criaEquipa(nomeEq,nome);
      await descobreEquipa();
      await criaEpocaInicial();
      fechaConta();
      await recarrega();
      toast("Equipa criada. O código é "+(r&&r.codigo?r.codigo:EQUIPA.codigo));
    }catch(e){ livre("#eqCria","Criar equipa"); err.textContent=mensagemDoErro(classifica(e)); }
  };
}

/* A app abriu (o ficheiro veio da cache do service worker) mas não chegou ao
   servidor. Não é a sessão que caiu, e não é a época que está vazia: são três
   coisas diferentes e esta é a terceira. */
function mostraSemLigacao(){
  fechaConta();
  document.body.classList.add("login-on");
  const div=document.createElement("div"); div.id="loginScr";
  div.innerHTML=`<div class="lbox" style="text-align:center">
    <div class="emblem" style="width:64px;height:64px;font-size:1.35rem;margin:0 auto 12px;border-radius:20px">ER</div>
    <h2 style="font-size:1.2rem;font-weight:800;margin-bottom:6px">Sem ligação</h2>
    <div class="mut sub">A app abriu, mas não consegui chegar ao servidor. Os teus jogos estão lá — é a ligação que falta.</div>
    <button class="btn pri" style="width:100%;margin-top:16px" id="slOutra">Tentar outra vez</button>
    <button class="btn" style="width:100%;margin-top:8px;background:none;border:none" id="slSair">Entrar com outra conta</button>
  </div>`;
  document.body.appendChild(div);
  $("#slOutra").onclick=async()=>{
    ocupado("#slOutra","A tentar…");
    try{ await sbAuth(); await entraDepoisDeAutenticar(); }
    catch(e){
      livre("#slOutra","Tentar outra vez");
      const err=classifica(e);
      if(err.tipo!==TIPO_REDE){ mostraLogin("entrar"); }
      else toast("Ainda sem ligação.","erro");
    }
  };
  $("#slSair").onclick=()=>{ SY={off:relogioOffset}; saveSY(); mostraLogin("entrar"); };
  window.addEventListener("online",()=>{ if($("#slOutra"))$("#slOutra").click(); },{once:true});
}

/* Entrou com o código, mas o responsável ainda não aprovou (sql/05). Sem este
   ecrã a pessoa via uma app vazia e não sabia porquê. */
const K_PEND="arbEquipaPendente";
function guardaEquipaPendente(n){try{localStorage.setItem(K_PEND,n||"");}catch(_){}}
function leEquipaPendente(){try{return localStorage.getItem(K_PEND)||"";}catch(_){return "";}}
function mostraPendente(){
  fechaConta();
  document.body.classList.add("login-on");
  const div=document.createElement("div"); div.id="loginScr";
  div.innerHTML=`<div class="lbox" id="cxPendente" style="text-align:center">
    <div class="eico" aria-hidden="true" style="font-size:2.4rem;margin-bottom:8px">⏳</div>
    <h2 style="font-size:1.2rem;font-weight:800;margin-bottom:6px">À espera de aprovação</h2>
    <div class="mut sub" style="line-height:1.5">O teu pedido para entrar em <b>${esc(EQUIPA&&EQUIPA.nome||"a equipa")}</b> foi enviado.
      Assim que o responsável o aprovar em Definições → Membros, entras com tudo o que é teu.</div>
    <button class="btn pri" style="width:100%;margin-top:16px" id="pdVerifica">Verificar outra vez</button>
    <button class="btn" style="width:100%;margin-top:8px;background:none;border:none" id="pdSair">Terminar sessão</button>
    <div class="mut sub" id="pdMsg" role="status" style="margin-top:10px"></div>
  </div>`;
  document.body.appendChild(div);
  $("#pdVerifica").onclick=async()=>{
    ocupado("#pdVerifica","A verificar…");
    try{
      const eq=await descobreEquipa();
      if(!eq){ mostraEquipa(); const e=$("#eqErr"); if(e)e.textContent="O pedido foi recusado. Fala com o responsável da equipa."; return; }
      if(!EUMEMBRO.pendente){ await entraDepoisDeAutenticar(); return; }
      livre("#pdVerifica");
      $("#pdMsg").textContent="Ainda não foi aprovado. Pede ao responsável para abrir Definições → Membros.";
    }catch(e){ livre("#pdVerifica"); $("#pdMsg").textContent=mensagemDoErro(classifica(e)); }
  };
  $("#pdSair").onclick=()=>terminaSessao();
}

/* Equipa nova nasce com época, tarifas e regulamento — senão o primeiro jogo
   não tinha onde se pendurar e o ecrã abria vazio sem explicação. */
async function criaEpocaInicial(){
  const hoje=new Date();
  const ano=hoje.getMonth()>=6?hoje.getFullYear():hoje.getFullYear()-1;
  const ep={id:criaId(),nome:ano+"/"+String(ano+1).slice(2),anoInicio:ano,valorKm:0.36,
            deslocacoes:[{tipo:"Distrital",modo:"fixo",valor:15},{tipo:"Nacional",modo:"km",valor:0.36}]};
  await guarda("epocas",ep);
  guardaEpocaEscolhida(ep.id);
  const base=seed();
  for(const t of base.tabela)   await guarda("tabela",{...t,id:criaId(),epocaId:ep.id});
  for(const a of base.almocos)  await guarda("almocos",{...a,id:criaId(),epocaId:ep.id});
  for(const ar of base.artigos) await guarda("artigos",{...ar,id:criaId()});
}
