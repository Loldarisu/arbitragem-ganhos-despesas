/* js/offline.js — Usar a app sem rede.
   Script normal (sem módulos nem build), carregado a seguir ao bd.js.

   Dois guardados neste telemóvel, os dois apagados ao terminar sessão:

   · A CÓPIA — a última fotografia dos dados da equipa que veio da base de
     dados. Deixa a app abrir sem rede (num campo sem cobertura) e mostrar o
     que havia da última vez. Não é a verdade: é o que o servidor disse da
     última vez que respondeu.

   · A FILA — as alterações feitas sem rede (gravar, gravar jogo, apagar), por
     ordem. Enviadas sozinhas quando a rede volta, a app volta ao ecrã, ou se
     toca no indicador do cabeçalho. Uma alteração que o servidor RECUSE
     (sem permissão, dados inválidos) não é repetida para sempre: fica marcada
     com o erro e aparece em Definições, para a pessoa decidir.

   A base de dados continua a ser quem manda: a cópia é substituída sempre que
   o servidor responde, e a fila só existe enquanto não há rede. */
"use strict";

const K_FILA="arbFila", K_COPIA="arbCopia";

/* ---- Fila ---------------------------------------------------------------- */
function leFilaToda(){
  try{
    const f=JSON.parse(localStorage.getItem(K_FILA));
    // a fila é de uma conta: outra pessoa que entre neste telemóvel não a vê
    return (f&&f.email===SY.email&&Array.isArray(f.ops))?f.ops:[];
  }catch(_){return [];}
}
const leFila=()=>leFilaToda().filter(op=>!op.erro);
function gravaFila(ops){
  try{ localStorage.setItem(K_FILA,JSON.stringify({email:SY.email,ops})); }
  catch(_){ toast("O telemóvel não tem espaço para guardar o que está por enviar.","erro"); }
  pintaSync();
}
function enfileira(op){
  op.fila=criaId(); op.em=Date.now();
  gravaFila(leFilaToda().concat([op]));
  aplicaOp(S,op);
}

/* Aplica uma alteração ao estado do ecrã, como se o servidor já a tivesse. */
function aplicaOp(estado,op){
  if(!estado)return;
  if(op.tipo==="jogo"){ upsertEm(estado,"jogos",op.j); return; }
  const lista=estado[op.col]; if(!Array.isArray(lista))return;
  if(op.tipo==="apaga"){ estado[op.col]=lista.filter(x=>x.id!==op.id); return; }
  // um membro "removido" é um membro desativado: sai das listas
  if(op.col==="membros"&&op.obj.ativo===false){ estado.membros=lista.filter(x=>x.id!==op.obj.id); return; }
  upsertEm(estado,op.col,op.obj);
}
function upsertEm(estado,col,obj){
  const copia=JSON.parse(JSON.stringify(obj));
  const i=estado[col].findIndex(x=>x.id===obj.id);
  if(i>=0)estado[col][i]=copia; else estado[col].push(copia);
}
function aplicaFilaEm(estado){ for(const op of leFila())aplicaOp(estado,op); }

/* Envia a fila por ordem. Devolve true se ficou vazia, false se a rede
   voltou a falhar a meio (o resto fica para a próxima). */
/* Um envio de cada vez: quem chama a meio recebe o mesmo envio. A limpeza de
   `aEnviarFila` é feita depois de a promessa estar guardada — com a fila vazia
   a função acaba logo, e um `finally` lá dentro corria ANTES da atribuição e
   deixava uma promessa velha a responder "enviado" para sempre. */
let aEnviarFila=null;
function enviaFila(){
  if(aEnviarFila)return aEnviarFila;
  const envio=(async()=>{
    for(const op of leFila()){
      try{ await executaOp(op); }
      catch(e){
        const err=classifica(e);
        if(err.tipo===TIPO_REDE||err.tipo===TIPO_SESSAO)return false;
        // recusado: marcado, não se repete, e diz-se
        gravaFila(leFilaToda().map(x=>x.fila===op.fila?{...x,erro:mensagemDoErro(err)}:x));
        toast("Não consegui enviar "+descreveOp(op)+": "+mensagemDoErro(err),"erro");
        continue;
      }
      gravaFila(leFilaToda().filter(x=>x.fila!==op.fila));
    }
    return true;
  })();
  aEnviarFila=envio;
  envio.catch(()=>{}).then(()=>{ if(aEnviarFila===envio)aEnviarFila=null; pintaSync(); });
  return envio;
}

const NOME_COL={jogos:"o jogo",despesas:"a despesa",multas:"a multa",pagamentos:"o pagamento",
  fundo:"o gasto do fundo",distancias:"a distância",membros:"o membro",epocas:"a época",
  tabela:"a tarifa",almocos:"o almoço",artigos:"o artigo"};
function descreveOp(op){
  if(op.tipo==="jogo")return "o jogo "+(op.j.equipaA||"?")+" vs "+(op.j.equipaB||"?");
  return (op.tipo==="apaga"?"apagar ":"")+(NOME_COL[op.col]||op.col);
}
function descartaDaFila(id){
  gravaFila(leFilaToda().filter(x=>x.fila!==id));
}

/* ---- Cópia --------------------------------------------------------------- */
function guardaCopia(){
  if(!SY.email||!EQUIPA||!EUMEMBRO||EUMEMBRO.pendente)return;
  try{
    localStorage.setItem(K_COPIA,JSON.stringify({email:SY.email,em:Date.now(),S,EQUIPA,EUMEMBRO}));
  }catch(_){ /* sem espaço: a app funciona na mesma com rede */ }
}
function leCopia(){
  try{
    const c=JSON.parse(localStorage.getItem(K_COPIA));
    return (c&&c.email&&c.email===SY.email&&c.S&&c.EQUIPA&&c.EUMEMBRO)?c:null;
  }catch(_){return null;}
}
function apagaDadosLocais(){
  try{ localStorage.removeItem(K_COPIA); localStorage.removeItem(K_FILA); }catch(_){}
}

/* Abre a app com a cópia, sem rede. Devolve false se não houver cópia desta
   conta — aí o ecrã certo continua a ser o "Sem ligação". */
function abreDaCopia(){
  const c=leCopia(); if(!c)return false;
  S=c.S; EQUIPA=c.EQUIPA; EUMEMBRO=c.EUMEMBRO;
  aplicaFilaEm(S);
  fechaConta();
  pintaEstado("erro");
  render();
  const quando=new Date(c.em).toLocaleString("pt-PT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
  toast("Sem rede — a mostrar os dados de "+quando+". O que registares segue quando houver ligação.",{ms:6000});
  return true;
}

/* A rede de volta e a app de volta ao ecrã já chamam recarrega() (js/sessao.js),
   e recarrega() começa por enviar a fila. */
