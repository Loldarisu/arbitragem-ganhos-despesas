/* js/bd.js — Ler e gravar na base de dados: carregar tudo, guardar, guardar jogo, apagar.
   Script normal (sem módulos nem build), carregado pelo index.html por esta
   ordem: base, calculo, jogos, despesas-multas, resumo, bd, conta, sessao,
   definicoes, arranque. Partilham o mesmo âmbito global, como quando eram um
   <script> só. */
"use strict";

/* ===========================================================================
 * O QUE O ECRÃ DIZ QUANDO NÃO HÁ NADA PARA MOSTRAR
 * ---------------------------------------------------------------------------
 * Três situações que davam todas o mesmo ecrã vazio e não são a mesma coisa:
 *
 *   1. não há registos    -> "Ainda não há jogos nesta época."   (normal)
 *   2. a rede falhou      -> "Não consegui chegar ao servidor."  (tenta outra vez)
 *   3. a sessão expirou   -> "A tua sessão expirou."             (entra outra vez)
 *
 * `estadoDados` guarda em qual delas estamos, e `vazio()` escreve a certa.
 * ========================================================================= */
let estadoDados="ok";           // ok | erro | sessao
let aCarregar=false;

function pintaEstado(e){ estadoDados=e||"ok"; pintaSync(); }
function marcaACarregar(v){ aCarregar=!!v; pintaSync(); }

/* Devolve o HTML de uma lista vazia, com a mensagem certa para a situação.
   `oQue` é o plural do que devia lá estar: "jogos", "despesas", "multas". */
function vazio(oQue,extra){
  if(estadoDados==="sessao")
    return `<div class="card vazio"><b>A tua sessão expirou</b>
      <div class="mut sub">Entra outra vez para veres ${esc(oQue)}.</div>
      <button class="btn pri" style="margin-top:10px" onclick="mostraLogin()">Entrar</button></div>`;
  if(estadoDados==="erro")
    return `<div class="card vazio"><b>Não consegui chegar ao servidor</b>
      <div class="mut sub">Os ${esc(oQue)} estão lá — é a ligação que não chegou lá.</div>
      <button class="btn pri" style="margin-top:10px" onclick="recarrega()">Tentar outra vez</button></div>`;
  return `<div class="card vazio"><b>Ainda não há ${esc(oQue)}</b>
    ${extra?`<div class="mut sub">${extra}</div>`:""}</div>`;
}

/* ===========================================================================
 * A BASE DE DADOS É A ÚNICA VERDADE
 * ---------------------------------------------------------------------------
 * A app já não guarda a época no telemóvel. Cada gravação vai à base de dados
 * e ESPERA pela resposta antes de dizer que gravou. Foi a tua decisão, e tem
 * uma consequência que o utilizador tem de perceber no momento: sem rede, não
 * se regista. Por isso as mensagens de falha são três, distintas, e o que
 * estava preenchido nunca se perde — o diálogo fica aberto.
 * ========================================================================= */

let EQUIPA=null;      // {id, nome, codigo_convite, categorias}
let EUMEMBRO=null;    // a minha linha em membros_equipa
const souResponsavel=()=>!!(EUMEMBRO&&EUMEMBRO.papel==="responsavel");

/* Classifica a falha. Distinguir isto é o que separa "sem rede" de "a sessão
   expirou" de "não tens permissão" — três coisas que se resolvem de maneiras
   diferentes e que antes davam todas o mesmo aviso inútil. */
function classifica(e){
  if(e instanceof ErroDados)return e;
  const m=String(e&&e.message||e);
  if(/sess[aã]o expirada|refresh|invalid.*token|401/i.test(m))
    return new ErroDados(TIPO_SESSAO,m);
  if(/Failed to fetch|NetworkError|Load failed|network|ligaç/i.test(m)||!navigator.onLine)
    return new ErroDados(TIPO_REDE,m);
  if(/42501|row-level security|permission denied|403/i.test(m))
    return new ErroDados(TIPO_PERMISSAO,m);
  return new ErroDados(TIPO_SERVIDOR,m,m.replace(/^servidor \d+: ?/,""));
}

/* Mostra a falha e devolve sempre false, para os sítios que chamam poderem
   escrever `if(!await guarda(...))return;` e ficar tudo dito. */
function falhou(e){
  const err=classifica(e);
  toast(mensagemDoErro(err),"erro");
  if(err.tipo===TIPO_SESSAO)setTimeout(()=>mostraLogin(),1200);
  return false;
}

/* --- LEITURA -------------------------------------------------------------
 * Uma passagem por todas as tabelas da equipa. É a única forma de encher o S.
 * As participações vêm agarradas ao jogo (`participacoes(*)`), num pedido só:
 * 30 jogos davam 31 pedidos se fosse um a um.
 * ----------------------------------------------------------------------- */
async function carregaTudo(){
  if(!EQUIPA)throw new ErroDados(TIPO_SESSAO,"sem equipa");
  const eq=EQUIPA.id;
  const q=(t,cols)=>sbReq("GET",`${t}?equipa_id=eq.${eq}&select=${cols}`);
  const [membros,epocas,tab,almocos,artigos,jogos,despesas,multas,pagamentos,fundo,dist]=
    await Promise.all([
      q("membros_equipa",MAPA.membros.colunas),
      q("epocas",        MAPA.epocas.colunas),
      // a tabela de valores é reservada ao responsável: para o assistente a RLS
      // devolve lista vazia, e isso não é um erro, é a regra a funcionar
      q("tabela_valores",MAPA.tabela.colunas).catch(()=>[]),
      q("almocos",       MAPA.almocos.colunas),
      q("artigos_multa", MAPA.artigos.colunas),
      sbReq("GET",`jogos?equipa_id=eq.${eq}&select=*,participacoes(*)&order=data.desc`),
      q("despesas",      MAPA.despesas.colunas),
      q("multas",        MAPA.multas.colunas),
      q("pagamentos",    MAPA.pagamentos.colunas).catch(()=>[]),
      q("fundo_gastos",  MAPA.fundo.colunas),
      q("distancias",    MAPA.distancias.colunas)
    ]);

  const novo={
    version:3,
    settings:{
      epocaAtivaId:(S&&S.settings&&S.settings.epocaAtivaId)||"",
      membroEuId:EUMEMBRO?EUMEMBRO.id:"",
      mostrarEquipa:(S&&S.settings&&S.settings.mostrarEquipa)!==false,
      equipa:EQUIPA.nome
    },
    membros:  (membros||[]).map(MAPA.membros.daBD).filter(m=>m.ativo&&m.aprovado),
    // Pedidos para entrar (sql/05): não contam como membros — não aparecem nas
    // nomeações nem nos totais — até o responsável os aprovar.
    pedidos:  (membros||[]).map(MAPA.membros.daBD).filter(m=>m.ativo&&!m.aprovado),
    epocas:   (epocas||[]).map(MAPA.epocas.daBD),
    tabela:   (tab||[]).map(MAPA.tabela.daBD),
    almocos:  (almocos||[]).map(MAPA.almocos.daBD),
    artigos:  (artigos||[]).map(MAPA.artigos.daBD),
    jogos:    (jogos||[]).map(jogoDaBD),
    despesas: (despesas||[]).map(MAPA.despesas.daBD),
    multas:   (multas||[]).map(MAPA.multas.daBD),
    pagamentos:(pagamentos||[]).map(MAPA.pagamentos.daBD),
    fundo:    (fundo||[]).map(MAPA.fundo.daBD),
    distancias:(dist||[]).map(MAPA.distancias.daBD),
    categorias:(EQUIPA.categorias&&EQUIPA.categorias.length)?EQUIPA.categorias
              :["Equipamento","Inscrição","Deslocação","Formação","Quotas","Outro"],
    convFalhadas:leConvFalhadas(),
    tombs:[]
  };
  if(!novo.epocas.length){
    // Equipa acabada de criar: sem época não há onde pendurar nada.
    novo.epocas=[];
  }else if(!novo.epocas.some(e=>e.id===novo.settings.epocaAtivaId)){
    novo.settings.epocaAtivaId=novo.epocas[novo.epocas.length-1].id;
  }
  guardaEpocaEscolhida(novo.settings.epocaAtivaId);
  return novo;
}

/* Recarrega e repinta. Antes de ler, envia o que estiver na fila: senão a
   leitura trazia a base de dados SEM as alterações feitas sem rede, e elas
   desapareciam do ecrã até serem enviadas. Sem rede, fica o que está no ecrã
   (a cópia deste telemóvel) e o indicador diz porquê. */
async function recarrega(silencioso=false){
  if(EUMEMBRO&&EUMEMBRO.pendente)return false;
  try{
    marcaACarregar(true);
    if(!await enviaFila())throw new ErroDados(TIPO_REDE,"sem ligação");
    const novo=await carregaTudo();
    aplicaFilaEm(novo);           // as que ficaram com erro continuam à vista
    S=novo;
    guardaCopia();
    pintaEstado("ok");
    render();
    return true;
  }catch(e){
    // O indicador tem de dizer QUAL das três coisas correu mal, não "erro".
    const err=classifica(e);
    if(err.tipo===TIPO_REDE){
      pintaEstado("erro");
      if(!silencioso)toast("Sem ligação — estás a ver o que está neste telemóvel.");
      return false;
    }
    pintaEstado(err.tipo===TIPO_SESSAO?"sessao":"erro");
    return falhou(err);
  }
  finally{ marcaACarregar(false); }
}

/* --- ESCRITA -------------------------------------------------------------
 * Um registo de cada vez, com resposta esperada. Devolve true quando a base
 * de dados confirmou OU quando, sem rede, a alteração ficou na fila deste
 * telemóvel para ser enviada depois (js/offline.js). Devolve false quando o
 * servidor recusou — e aí quem chama deixa o diálogo aberto com tudo lá.
 *
 * Só a falta de rede vai para a fila. Uma recusa (sem permissão, dados
 * inválidos) não melhora por se tentar mais tarde, e diz-se logo.
 * ----------------------------------------------------------------------- */
/* As despesas são a exceção: cada pessoa grava as suas. O servidor impõe o
   mesmo (política "so as minhas"), por isso isto é só para não fazer um
   pedido que se sabe que vai ser recusado. */
const minhaDespesa=o=>!!(o&&EUMEMBRO&&o.membroId===EUMEMBRO.id);
async function guarda(col,obj){
  const m=MAPA[col];
  if(!m){console.warn("coleção desconhecida:",col);return false;}
  const pode=souResponsavel()?col!=="despesas"||minhaDespesa(obj):col==="despesas"&&minhaDespesa(obj);
  if(!pode){toast(col==="despesas"?"Só podes lançar as tuas próprias despesas.":"Só o responsável da equipa pode alterar isto.","erro");return false;}
  if(!obj.id)obj.id=criaId();
  return escreve({tipo:"guarda",col,obj});
}

/* O jogo e as suas participações vão juntos: se as participações falharem, o
   jogo sozinho não vale nada (ninguém recebeu nada). Por isso vão numa só
   chamada à função guardar_jogo (sql/04-guardar-jogo.sql), que é uma transação:
   ou fica tudo, ou não fica nada. */
async function guardaJogo(j){
  if(!souResponsavel()){toast("Só o responsável da equipa pode alterar isto.","erro");return false;}
  if(!j.id)j.id=criaId();
  for(const a of (j.atribuicoes||[]))if(a.membroId&&!a.id)a.id=criaId();
  return escreve({tipo:"jogo",j});
}

async function apagaNaBD(col,id){
  const tabela=(col==="jogos")?"jogos":(MAPA[col]&&MAPA[col].tabela);
  if(!tabela)return false;
  const alvo=(S[col]||[]).find(x=>x.id===id);
  const pode=(col==="despesas")?minhaDespesa(alvo):souResponsavel();
  if(!pode){toast(col==="despesas"?"Só podes apagar as tuas próprias despesas.":"Só o responsável da equipa pode alterar isto.","erro");return false;}
  return escreve({tipo:"apaga",col,id});
}

/* Envia já, ou põe na fila. Com a fila por esvaziar, o novo vai para o fim
   dela: a ordem das alterações tem de ser a ordem em que foram feitas (apagar
   um jogo não pode chegar antes de o gravar). */
async function escreve(op){
  op=JSON.parse(JSON.stringify(op));   // o que vai na fila não muda se o ecrã mexer no objeto
  if(leFila().length){ enfileira(op); enviaFila(); return true; }
  try{ await executaOp(op); return true; }
  catch(e){
    const err=classifica(e);
    // o próximo aviso ("Jogo guardado") diz que ficou neste telemóvel
    if(err.tipo===TIPO_REDE){ enfileira(op); avisoFila=true; return true; }
    return falhou(err);
  }
}

/* O pedido a sério, sem decisões: a fila e o envio direto passam os dois por
   aqui. Os três são idempotentes (upsert por id, apagar por id), por isso uma
   alteração enviada duas vezes — a resposta perdeu-se, a fila reenvia — não
   duplica nada. */
let temGuardarJogo=true;
const funcaoEmFalta=e=>/servidor 404/.test(String(e&&e.message))&&/function|fun[cç][aã]o|PGRST202/i.test(String(e&&e.message));
async function executaOp(op){
  if(op.tipo==="guarda"){
    const m=MAPA[op.col];
    await sbReq("POST",m.tabela,[m.paraBD(op.obj,EQUIPA.id)],{Prefer:"resolution=merge-duplicates,return=minimal"});
    return;
  }
  if(op.tipo==="apaga"){
    const tabela=(op.col==="jogos")?"jogos":MAPA[op.col].tabela;
    await sbReq("DELETE",`${tabela}?id=eq.${op.id}`,null,{Prefer:"return=minimal"});
    return;
  }
  if(op.tipo==="jogo"){
    const j=op.j;
    const linhas=(j.atribuicoes||[]).filter(a=>a.membroId).map(a=>partParaBD(a,j,EQUIPA.id));
    if(temGuardarJogo){
      try{
        await chamaRpc("guardar_jogo",{p_jogo:jogoParaBD(j,EQUIPA.id),p_participacoes:linhas});
        return;
      }catch(e){
        if(!funcaoEmFalta(e))throw e;
        temGuardarJogo=false;
        console.warn("guardar_jogo não existe no servidor — corre o sql/04-guardar-jogo.sql. A usar o caminho antigo.");
      }
    }
    // Caminho antigo, em três pedidos, até o sql/04 estar corrido.
    await sbReq("POST","jogos",[jogoParaBD(j,EQUIPA.id)],
      {Prefer:"resolution=merge-duplicates,return=minimal"});
    const fica=linhas.map(l=>l.id);
    await sbReq("DELETE",`participacoes?jogo_id=eq.${j.id}`+
      (fica.length?`&id=not.in.(${fica.join(",")})`:""),null,{Prefer:"return=minimal"});
    if(linhas.length)
      await sbReq("POST","participacoes",linhas,
        {Prefer:"resolution=merge-duplicates,return=minimal"});
    return;
  }
  throw new Error("operação desconhecida: "+op.tipo);
}

/* --- Preferências deste telemóvel ----------------------------------------
 * Não são dados da equipa: a época que estou a ver, o tema e as convocatórias
 * por ler (chegaram a ESTE telemóvel). A cópia dos dados para usar sem rede e
 * a fila do que está por enviar vivem em js/offline.js.
 * ----------------------------------------------------------------------- */
const K_EPOCA="arbEpocaVista", K_CONV="arbConvFalhadas";
function guardaEpocaEscolhida(id){try{localStorage.setItem(K_EPOCA,id||"");}catch(_){}}
function leEpocaEscolhida(){try{return localStorage.getItem(K_EPOCA)||"";}catch(_){return "";}}
function leConvFalhadas(){try{return JSON.parse(localStorage.getItem(K_CONV))||[];}catch(_){return [];}}
function guardaConvFalhadas(v){try{localStorage.setItem(K_CONV,JSON.stringify(v||[]));}catch(_){}}
