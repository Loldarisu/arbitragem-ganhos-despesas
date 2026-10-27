/* js/sessao.js — Sessão no Supabase, pedido cru à API, indicador de sincronização e recarregar quando faz sentido.
   Script normal (sem módulos nem build), carregado pelo index.html por esta
   ordem: base, calculo, jogos, despesas-multas, resumo, bd, conta, sessao,
   definicoes, arranque. Partilham o mesmo âmbito global, como quando eram um
   <script> só. */
"use strict";

/* ============ Sessão e ligação ao Supabase ============
   O que sobrou da antiga "sincronização": a sessão (SY) e o pedido cru à API.
   O resto — fundir estados, resolver conflitos, lápides — deixou de existir
   quando a base de dados passou a ser a única verdade. */
const SYNCKEY="arbSync_v1";
let SY;try{SY=JSON.parse(localStorage.getItem(SYNCKEY))||{};}catch(e){SY={};}
relogioOffset=Number(SY.off)||0;
function saveSY(){localStorage.setItem(SYNCKEY,JSON.stringify(SY));}
const sbCfg=()=>{const u=(typeof SB_CONFIG!=="undefined"&&SB_CONFIG&&SB_CONFIG.url)||SY.url,
                       k=(typeof SB_CONFIG!=="undefined"&&SB_CONFIG&&SB_CONFIG.key)||SY.key;
                 return (u&&k)?{url:u,key:k}:null;};
let mostrarGuardadoAte=0;

/* O indicador do cabeçalho. Diz uma de quatro coisas, e nunca diz "guardado"
   sem a base de dados ter confirmado — é o que confirmaGravado() garante. */
function pintaSync(){
  const el=$("#hSync"); if(!el)return;
  el.hidden=false;
  // O aria-label fixo ("Estado da sincronização") escondia o estado ao leitor
  // de ecrã: passa a dizer o mesmo que o title, que é a frase completa.
  const pinta=(cls,txt,tit)=>{el.className="syncdot "+cls;el.textContent=txt;el.title=tit;el.setAttribute("aria-label",tit);};
  const nFila=leFila().length;
  if(nFila)return pinta("a","⏳ "+nFila+" por enviar",
    nFila+(nFila>1?" alterações guardadas":" alteração guardada")+" neste telemóvel, à espera de rede — toca para enviar agora");
  if(Date.now()<mostrarGuardadoAte)return pinta("ok","✓ guardado","Gravado na base de dados");
  if(aCarregar)return pinta("a","☁ a carregar…","A ir buscar os dados");
  if(estadoDados==="erro")return pinta("e","⚠ sem ligação","Não cheguei ao servidor — toca para tentar outra vez");
  if(estadoDados==="sessao")return pinta("e","⚠ sessão","A sessão expirou — entra outra vez");
  pinta("ok",souResponsavel()?"✏️":"👀",
    (EQUIPA?EQUIPA.nome+" · ":"")+(souResponsavel()?"podes editar":"só consulta")+" — toca para atualizar");
}

/* Renovar a sessão.
 *
 * O erro que isto ANTES cometia, e que os testes apanharam: se o telemóvel não
 * conseguia chegar ao servidor para renovar, a app dizia "a sessão expirou" e
 * mandava a pessoa entrar outra vez — quando o problema era não haver rede.
 * São coisas diferentes e resolvem-se de maneiras diferentes, e o brief é
 * explícito sobre isso. Agora distingue-se: sem resposta é rede; com resposta
 * a recusar é sessão.
 */
async function sbAuth(){
  const now=Date.now()/1000;
  if(SY.access&&SY.exp&&now<SY.exp-60)return SY.access;
  if(!SY.refresh)
    throw new ErroDados(TIPO_SESSAO,"sessão expirada");

  let r;
  try{
    r=await fetch(SY.url+"/auth/v1/token?grant_type=refresh_token",{
      method:"POST",headers:{apikey:SY.key,"Content-Type":"application/json"},
      body:JSON.stringify({refresh_token:SY.refresh})});
  }catch(e){
    // Não houve resposta nenhuma. A sessão pode estar perfeitamente boa.
    throw new ErroDados(TIPO_REDE,"sem ligação");
  }
  ajustaRelogio(r);
  if(r.ok){
    const d=await r.json();
    SY.access=d.access_token; SY.refresh=d.refresh_token||SY.refresh;
    SY.exp=now+(d.expires_in||3600);
    if(SY.pass)SY.pass="";
    saveSY();
    return SY.access;
  }
  if(r.status>=500)
    throw new ErroDados(TIPO_SERVIDOR,"o servidor está com problemas ("+r.status+")");
  // O servidor respondeu e recusou: aí sim, a sessão acabou.
  SY.access=""; SY.refresh=""; SY.exp=0; saveSY();
  throw new ErroDados(TIPO_SESSAO,"sessão expirada");
}
async function sbReq(method,path,body,headers={}){
  const tk=await sbAuth();
  let r;
  try{
    r=await fetch(SY.url+"/rest/v1/"+path,{method,headers:{apikey:SY.key,Authorization:"Bearer "+tk,"Content-Type":"application/json",...headers},body:body?JSON.stringify(body):undefined});
  }catch(e){ throw new ErroDados(TIPO_REDE,"sem ligação"); }
  ajustaRelogio(r);
  if(r.status===401){ SY.access=""; SY.exp=0; saveSY(); throw new ErroDados(TIPO_SESSAO,"sessão expirada"); }
  if(r.status===403){ throw new ErroDados(TIPO_PERMISSAO,"sem permissão"); }
  if(!r.ok){
    let det="";try{const j=JSON.parse(await r.text());det=j.message||j.msg||j.hint||j.error_description||j.error||"";}catch(_){/**/}
    if(r.status===404&&!det)det="tabela não existe — corre os ficheiros da pasta sql/ no SQL Editor";
    throw new Error("servidor "+r.status+(det?": "+det:""));
  }
  const t=await r.text();
  return t?JSON.parse(t):null;
}
/* ===========================================================================
 * Recarregar quando faz sentido
 * ---------------------------------------------------------------------------
 * A sincronização de estado inteiro desapareceu — já não há estado inteiro. O
 * que sobra é ir buscar os dados outra vez quando há razão para eles terem
 * mudado: a rede voltou, ou a app voltou ao ecrã depois de estar de lado.
 * Não há temporizador de fundo a bater na base de dados de cinco em cinco
 * minutos com a app aberta em cima da mesa.
 * ========================================================================= */
window.addEventListener("online",()=>{ if(EQUIPA)recarrega(true); });
document.addEventListener("visibilitychange",()=>{
  if(!document.hidden&&EQUIPA&&!$("#dlg").open)recarrega(true);
});

/* Quem pode editar vem de membros_equipa.papel, lido no arranque. Não há lista
   de administradores à parte nem escrita de teste: o papel está na mesma linha
   que diz que pertenço à equipa, e a RLS decide a sério do lado do servidor.
   Esconder botões aqui é só cortesia. */
function soLeitura(){
  if(!souResponsavel()){toast("Só o responsável da equipa pode alterar isto 👀");return true;}
  return false;
}

/* Os ecrãs antigos de boas-vindas e de login saíram daqui. O que fazem agora
   está lá em cima, em "ECRÃ DE CONTA" e "ECRÃ DE EQUIPA": quem chega sem
   sessão vê o ecrã de conta, quem tem sessão mas ainda não tem equipa vê o de
   equipa, e nunca ninguém fica num ecrã vazio sem saber o que fazer. */
