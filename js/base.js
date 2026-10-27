/* js/base.js — Estado da app, utilitários de ecrã (diálogos, avisos, confirmações) e apagar com "Anular".
   Script normal (sem módulos nem build), carregado pelo index.html por esta
   ordem: base, calculo, jogos, despesas-multas, resumo, bd, conta, sessao,
   definicoes, arranque. Partilham o mesmo âmbito global, como quando eram um
   <script> só. */
"use strict";

/* ============ Estado ============ */
// Credenciais vindas de config.local.js (não versionado). Sem esse ficheiro fica vazio
// e o ecrã de login pede URL + chave — a app nunca traz credenciais no código.
const SB_CONFIG=Object.assign({url:"",key:""},(typeof window!=="undefined"&&window.SB_CONFIG)||{});
const FUNCOES=["1 arb","2 arb","A","AA"];
/* "pago" saiu daqui. O pagamento deixou de ser do jogo e passou a ser da
   pessoa, por mês e por competição — é a associação que paga assim. O estado
   do jogo só diz se ele se realizou. */
const ESTADOS=["agendado","realizado","cancelado"];
const MESES_EPOCA=[8,9,10,11,0,1,2,3,4,5]; // Set..Jun (0-based)
const NOME_MES=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function seedArtigos(){
  const a=[[1,"Dispensa em cima do dia de jogo",5,0],[2,"Indisponibilidade comunicada fora de prazo",3,0],
  [3,"Não confirmar nomeação até às 22h",2,0],[4,"Não marcar horas até às 20h da véspera",2,0],
  [5,"Divulgar nomeações a terceiros",10,0],[6,"Atraso (por minuto, após 10 min de tolerância)",2,1],
  [7,"Falta de fato de treino (2ª Div. Distrital)",3,0],[8,"Falta de camisa/polo e calça de sarja (1ª Div.)",5,0],
  [9,"Falta de camisa/polo e calça (Camp. SABSEG)",10,0],[10,"Falta de material obrigatório",5,0],
  [11,"Carregar +5x após o banho (por clique extra)",2,1],[12,"Sujar o carro por falta de cuidado",10,0],
  [13,"Erro no relatório Score",5,0],[14,"Erro nas fichas de jogo (os 3 elementos)",10,0],
  [15,"Equipamento mal preparado",3,0],[16,"Não comunicar atraso logo que conhecido",2,0],
  [17,"Falta de respeito (imagem da equipa)",5,0],[18,"Não cumprir tarefa previamente aceite",3,0],
  [20,"Ausência em formação/reunião obrigatória",10,0],[21,"Desistência de evento após confirmação",10,0],
  [22,"Não comunicar impedimento para nomeação",5,0],[23,"Incumprir orientações do Chefe de Equipa",5,0]];
  const arts=a.map(x=>({id:"art"+x[0],num:x[0],nome:x[1],valor:x[2],porUnidade:!!x[3]}));
  // O Art. 19 não é uma multa que se escolha: é a regra que duplica o valor à
  // 3.ª ocorrência do mesmo artigo. Fica listado para o regulamento estar
  // completo, mas marcado como regra e fora do seletor.
  arts.push({id:"art19",num:19,nome:"Reincidência: à 3.ª ocorrência do mesmo artigo na época, o valor duplica",valor:0,porUnidade:false,regra:true});
  return arts.sort((x,y)=>x.num-y.num);
}
/* Os valores com que nasce uma equipa nova (ver criaEpocaInicial). */
function seed(){
  const t=[["Distrital","sub 10 BEM","1 arb",15],["Distrital","sub 10 BEM","2 arb",10],
  ["Distrital","sub 12 INF","1 arb",22.5],["Distrital","sub 12 INF","2 arb",15],
  ["Distrital","sub 14 IN","A",23],["Distrital","sub 14 IN","AA",18.5],
  ["Distrital","sub 16 JUV","A",24],["Distrital","sub 16 JUV","AA",19.5],
  ["Distrital","Sub 19 JUN","A",25],["Distrital","Sub 19 JUN","AA",20.5],
  ["Distrital","sub 23/vet","A",30],["Distrital","sub 23/vet","AA",24],
  ["Distrital","taça de honra","A",39],["Distrital","taça de honra","AA",33],
  ["Distrital","2ª divisão","A",34],["Distrital","2ª divisão","AA",28],
  ["Distrital","1ª divisão","A",39],["Distrital","1ª divisão","AA",33],
  ["Nacional","Sub 15","AA",35],["Nacional","Sub 17","AA",47.5],
  ["Nacional","Sub 19","AA",47.5],["Nacional","Fem","AA",47]];
  return {
    version:2,
    settings:{epocaAtivaId:"e1",membroEuId:"",mostrarEquipa:true,equipa:""},
    epocas:[{id:"e1",nome:"2025/26",anoInicio:2025,valorKm:0.36,deslocacoes:[{tipo:"Distrital",modo:"fixo",valor:15},{tipo:"Nacional",modo:"km",valor:0.36}]}],
    // Sem nomes de ninguém: a equipa é perguntada na primeira abertura. Isto
    // vinha com cinco pessoas reais gravadas num repositório público.
    membros:[],
    tabela:t.map((r,i)=>({id:"t"+(i+1),epocaId:"e1",tipo:r[0],escalao:r[1],funcao:r[2],valor:r[3]})),
    almocos:[{id:"a1",epocaId:"e1",nome:"Distrital",valor:7.5},{id:"a2",epocaId:"e1",nome:"Nacional",valor:17.5},{id:"a3",epocaId:"e1",nome:"Nacional +100km",valor:35}],
    categorias:["Equipamento","Inscrição","Deslocação","Formação","Quotas","Outro"],
    jogos:[],despesas:[],multas:[],pagamentos:[],artigos:seedArtigos(),distancias:[],fundo:[],convFalhadas:[],tombs:[]
  };
}
/* O S deixou de ser o dono dos dados e passou a ser só o que está no ecrã
   agora: uma fotografia do que veio da base de dados no último carregamento.
   Arranca vazio — nada se mostra antes de a base de dados responder. */
let S=estadoVazio();
function estadoVazio(){
  return {version:3,settings:{epocaAtivaId:"",membroEuId:"",mostrarEquipa:true,equipa:""},
    membros:[],epocas:[],tabela:[],almocos:[],artigos:[],jogos:[],despesas:[],
    multas:[],pagamentos:[],fundo:[],distancias:[],pedidos:[],
    categorias:["Equipamento","Inscrição","Deslocação","Formação","Quotas","Outro"],
    convFalhadas:[],tombs:[]};
}
function epAtiva(){
  return S.epocas.find(e=>e.id===S.settings.epocaAtivaId)||S.epocas[0]
      ||{id:"",nome:"—",anoInicio:new Date().getFullYear(),valorKm:0.36,deslocacoes:[]};
}
const daEpoca=x=>x.epocaId===epAtiva().id;
/* O indicador do cabeçalho diz "guardado" durante dois segundos, e só depois
   de a base de dados ter confirmado a gravação. */
function confirmaGravado(){
  mostrarGuardadoAte=Date.now()+2000;
  pintaSync(); setTimeout(pintaSync,2050);
}
/* Os conflitos entre dispositivos são decididos pelo campo "up". Se esse carimbo
   viesse do relógio local, um telemóvel adiantado ganhava sempre e apagava
   edições boas dos outros. Calibramos um desvio com a hora que o Supabase
   devolve no cabeçalho Date e carimbamos tudo com agora(). */
let relogioOffset=0;
const agora=()=>Date.now()+relogioOffset;
function ajustaRelogio(resp){
  try{
    const d=resp&&resp.headers&&resp.headers.get("date");
    if(!d)return;
    const t=Date.parse(d);
    if(isNaN(t))return;
    relogioOffset=t-Date.now();
    if(typeof SY!=="undefined"&&SY){SY.off=relogioOffset;saveSY();}
  }catch(_){}
}
/* O carimbo "quem mexeu e quando" vive num gatilho do PostgreSQL
   (jogos.atualizado_em / atualizado_por), que não depende do relógio do
   telemóvel. */
const $=(s,el=document)=>el.querySelector(s);
const $$=(s,el=document)=>[...el.querySelectorAll(s)];
// Construir um Intl.NumberFormat é caro e isto é chamado milhares de vezes por
// render. A instância é criada uma vez e reutilizada.
let seqTit=0,seqCampo=0;
/* Os rótulos existiam mas sem `for`: tocar neles não focava o campo e um leitor
   de ecrã anunciava "caixa de edição" sem dizer qual. Em vez de mexer em
   sessenta sítios de marcação, liga-se tudo depois de desenhar. */
function ligaLabels(raiz){
  if(!raiz)return;
  $$("label",raiz).forEach(l=>{
    if(l.getAttribute("for")||l.querySelector("input,select,textarea"))return;
    let el=l.nextElementSibling;
    while(el&&!/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)){
      const dentro=el.querySelector&&el.querySelector("input,select,textarea");
      if(dentro){el=dentro;break;}
      el=el.nextElementSibling;
    }
    if(!el||!/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName))return;
    if(!el.id)el.id="cmp"+(++seqCampo);
    l.setAttribute("for",el.id);
  });
}
/* Um <dialog> sem nome é anunciado como "diálogo" e nada mais. Damos-lhe o
   título que já lá está e pomos o foco no primeiro campo, em vez de no botão
   que calhar ser o primeiro do DOM. */
function abreDlg(dlg){
  const h=$("h2",dlg);
  if(h){if(!h.id)h.id="tituloDlg"+(++seqTit);dlg.setAttribute("aria-labelledby",h.id);}
  else dlg.removeAttribute("aria-labelledby");
  ligaLabels(dlg);
  // showModal() num <dialog> já aberto atira InvalidStateError, e a chamada que
  // estava à espera nunca recebia resposta — o ecrã ficava parado sem dizer
  // nada. Fechar primeiro é mais barato do que descobrir isso num campo.
  if(dlg.open){try{dlg.close();}catch(_){}}
  try{dlg.showModal();}catch(_){try{dlg.show();}catch(__){}}
  const alvo=$("input:not([type=hidden]),select,textarea",dlg)||$("button",dlg);
  if(alvo)try{alvo.focus({preventScroll:true});}catch(_){try{alvo.focus();}catch(__){}}
}
let toastTimer=null;
/* Posto a true quando uma alteração vai para a fila (sem rede): o aviso
   seguinte ("Jogo guardado") diz que ficou neste telemóvel, em vez de deixar
   pensar que já chegou à base de dados. */
let avisoFila=false;
/* Um erro de sincronização a desaparecer em 2,2 s não chega para ser lido, e um
   "apagado" sem saída não perdoa enganos: daí a severidade e a acção. */
function toast(m,opts){
  const o=(typeof opts==="string")?{tipo:opts}:(opts||{});
  if(avisoFila&&o.tipo!=="erro"){ m+=" — sem rede: fica neste telemóvel e segue quando houver ligação"; avisoFila=false; o.ms=o.ms||5000; }
  const t=$("#toast");
  t.className="toast"+(o.tipo==="erro"?" erro":"")+(o.accao?" com-accao":"");
  t.textContent="";
  const sp=document.createElement("span");sp.textContent=m;t.appendChild(sp);
  if(o.accao){
    const b=document.createElement("button");
    b.className="btn sm";b.textContent=o.accao.rotulo;
    b.onclick=()=>{clearTimeout(toastTimer);t.classList.remove("show");o.accao.fn();};
    t.appendChild(b);
  }
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove("show"),o.ms||(o.accao?9000:(o.tipo==="erro"?6000:2400)));
}
/* F3: confirm()/prompt() nativos bloqueiam a página, destoam do resto e em
   algumas PWA instaladas o prompt() é simplesmente ignorado. */
function confirma(msg,opts={}){
  return new Promise(res=>{
    const d=$("#dlg2");
    let resolvido=false;
    const fecha=v=>{if(resolvido)return;resolvido=true;d.oncancel=null;try{d.close();}catch(_){}res(v);};
    d.innerHTML=`<h2>${esc(opts.titulo||"Confirmar")}</h2>
    <div class="sub" style="margin-top:6px;line-height:1.5;color:var(--mut)">${esc(msg)}</div>
    <div class="btnrow"><button class="btn" id="c2Nao">${esc(opts.cancelar||"Cancelar")}</button>
    <button class="btn ${opts.perigo?"dngr":"pri"}" id="c2Sim">${esc(opts.confirmar||"Confirmar")}</button></div>`;
    $("#c2Nao",d).onclick=()=>fecha(false);
    $("#c2Sim",d).onclick=()=>fecha(true);
    d.oncancel=()=>fecha(false);
    abreDlg(d);
    // Em ações destrutivas o foco vai para Cancelar: um Enter distraído não apaga nada.
    const foco=opts.perigo?$("#c2Nao",d):$("#c2Sim",d);
    if(foco)try{foco.focus({preventScroll:true});}catch(_){}
  });
}
function pergunta(titulo,label,valor=""){
  return new Promise(res=>{
    const d=$("#dlg2");
    let resolvido=false;
    const fecha=v=>{if(resolvido)return;resolvido=true;d.oncancel=null;try{d.close();}catch(_){}res(v);};
    d.innerHTML=`<h2>${esc(titulo)}</h2><label>${esc(label)}</label><input id="p2V" value="${esc(valor)}">
    <div class="btnrow"><button class="btn" id="p2Nao">Cancelar</button><button class="btn pri" id="p2Ok">Continuar</button></div>`;
    $("#p2Nao",d).onclick=()=>fecha(null);
    $("#p2Ok",d).onclick=()=>fecha($("#p2V",d).value);
    $("#p2V",d).addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("#p2Ok",d).click();}});
    d.oncancel=()=>fecha(null);
    abreDlg(d);
  });
}
/* Apagar continua a ter volta atrás, mas agora a volta atrás também vai à base
   de dados: o "Anular" volta a inserir a linha com o mesmo id. As lápides
   desapareceram — serviam para a fusão entre telemóveis, que já não existe. */
async function apagaRegisto(col,id,rotulo){
  const arr=S[col]||[];
  const ix=arr.findIndex(x=>x.id===id);
  if(ix<0)return;
  const copia=JSON.parse(JSON.stringify(arr[ix]));
  if(!await apagaNaBD(col,id))return;          // falhou: nada mudou no ecrã
  S[col]=arr.filter(x=>x.id!==id);
  confirmaGravado(); render();
  // "Multa apagada", "Jogo apagado": o aviso concorda com o que foi apagado
  const fem=["Multa","Despesa"].includes(rotulo), o=fem?"a":"o";
  toast(rotulo+" apagad"+o,{accao:{rotulo:"Anular",fn:async()=>{
    // Os jogos repõem-se com as suas participações; o resto é um registo só.
    const reposto=(col==="jogos")?await guardaJogo(copia):await guarda(col,copia);
    if(reposto){ S[col]=(S[col]||[]).concat([copia]); render(); toast(rotulo+" repost"+o); }
  }}});
}

/* Desfazer um engano: o "Anular" do aviso logo a seguir a apagar e, depois
   disso, Definições → Apagados, que lê o lixo do servidor (sql/05). */
