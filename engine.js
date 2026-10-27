/* =========================================================================
   Motor — funções puras da app de arbitragem.

   Vive à parte do index.html por dois motivos: mantém o ficheiro da interface
   com um tamanho navegável, e permite testar esta parte em Node sem browser
   nenhum (ver tests/unidade.mjs), o que dá um ciclo de segundos em vez de
   minutos. Nada aqui toca no DOM nem no estado global: tudo o que é preciso
   entra por argumento.

   Carregado como script clássico antes do index.html — sem imports, sem build.
   ========================================================================= */
"use strict";

const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const FMT_EUR=new Intl.NumberFormat("pt-PT",{style:"currency",currency:"EUR"});

const fmt=n=>FMT_EUR.format(n||0);

const fmtD=d=>{const[y,m,dd]=d.split("-");return `${dd}/${m}/${y}`;};

const diaSem=d=>["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][new Date(d+"T12:00").getDay()];

const norm=s=>String(s||"").trim().toLowerCase();

const normLocal=s=>String(s||"").trim().toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();

const p2=n=>String(n).padStart(2,"0");

const dtLocal=d=>`${d.getFullYear()}${p2(d.getMonth()+1)}${p2(d.getDate())}T${p2(d.getHours())}${p2(d.getMinutes())}00`;

const dtUTC=d=>d.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");

const icsEsc=s=>String(s??"").replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\r?\n/g,"\\n");

const PAPEL_FUNCAO={"A":"A","A1":"1 arb","A2":"2 arb","AA1":"AA","AA2":"AA","4A":"AA"};

const CODIGOS_PAPEL=/^(4A|AA[12]?|A[12]?)$/i;

const SEPARADORES=[/\s+vs\.?\s+/i,/\s+[–—]\s+/,/\s+-\s+/,/\s+x\s+/i];

const PEDACO_EQUIPA="[A-Za-zÀ-ÿ0-9.'-]{2,}(?:[ ][A-Za-zÀ-ÿ0-9.'-]{2,}){0,4}";

function icsDobra(linha){
  // RFC 5545: linhas até 75 octetos, continuação com um espaço à frente.
  const enc=new TextEncoder();
  let out="",atual="";
  for(const ch of [...linha]){
    if(enc.encode(atual+ch).length>73){out+=atual+"\r\n ";atual="";}
    atual+=ch;
  }
  return out+atual;
}

function mergeState(a,b){
  const out=JSON.parse(JSON.stringify(a));
  out.tombs=[...(a.tombs||[]),...(b.tombs||[])];
  const seen=new Set();
  out.tombs=out.tombs.filter(t=>{const k=t.col+":"+t.id;if(seen.has(k))return false;seen.add(k);return true;});
  const tombMap={};
  for(const t of out.tombs)tombMap[t.col+":"+t.id]=t.t;
  for(const col of ["epocas","jogos","despesas","multas","pagamentos","artigos","tabela","almocos","membros","distancias","fundo"]){
    const map=new Map();
    for(const it of (a[col]||[]))map.set(it.id,it);
    for(const it of (b[col]||[])){
      const ex=map.get(it.id);
      if(!ex||((it.up||0)>(ex.up||0)))map.set(it.id,it);
    }
    out[col]=[...map.values()].filter(it=>{
      const tt=tombMap[col+":"+it.id];
      return !(tt&&tt>=(it.up||0));
    });
  }
  out.categorias=[...new Set([...(a.categorias||[]),...(b.categorias||[])])];
  if(!out.epocas.length)out.epocas=JSON.parse(JSON.stringify(a.epocas||b.epocas||[]));
  if(!out.epocas.some(e=>e.id===out.settings.epocaAtivaId))out.settings.epocaAtivaId=out.epocas[0].id;
  return out;
}

function extraiEquipas(t){
  for(const sep of SEPARADORES){
    const m=t.match(new RegExp("("+PEDACO_EQUIPA+")"+sep.source+"("+PEDACO_EQUIPA+")",sep.flags));
    if(!m)continue;
    const a=m[1].trim(), b=m[2].trim();
    if(CODIGOS_PAPEL.test(a)||CODIGOS_PAPEL.test(b))continue;
    if(/^[\d.]+$/.test(a)||/^[\d.]+$/.test(b))continue;
    return {equipaA:a,equipaB:b};
  }
  return null;
}

function iniJogo(j){
  const d=new Date(j.data+"T"+(j.hora||"15:00"));
  return isNaN(d.getTime())?null:d;
}

function vespera20(j){
  const ini=iniJogo(j);
  if(!ini)return null;
  const v=new Date(ini.getTime());
  v.setDate(v.getDate()-1);
  v.setHours(20,0,0,0);
  return v;
}

function papelAtr(atrs,i){
  const f=atrs[i].funcao;
  if(f==="A")return "A";
  if(f==="1 arb")return "A1";
  if(f==="2 arb")return "A2";
  let n=0;for(let k=0;k<=i;k++)if(atrs[k].funcao==="AA")n++;
  return "AA"+n;
}

/* O chefe do jogo é o árbitro principal: "A", ou "1 arb" nos escalões com
   dois árbitros. É ele que leva o carro, por isso é o único a quem a app põe
   o transporte num jogo novo. Devolve o índice da primeira linha da equipa
   com essa função, ou -1 (o principal é de fora da equipa, ou não há). */
function indiceChefe(atrs){
  return (atrs||[]).findIndex(a=>a&&a.membroId&&(a.funcao==="A"||a.funcao==="1 arb"));
}

function temRecebido(j){return j.valorRecebido!==undefined&&j.valorRecebido!==null&&j.valorRecebido!=="";}


/* ===========================================================================
 * Ler a convocatória
 * ---------------------------------------------------------------------------
 * As mensagens variam de associação para associação e entre competições. Duas
 * reais, que são as que interessam:
 *
 *   Nacional
 *   5549 341020170 CN S17 II DIV#CD Tondela*UD Oliveirense#Campo Corte<CAMPO BESTEIROS>19/09/2026 11:00
 *
 *   Distrital da Guarda
 *   2322 114010120 AA2 JUV#CD JUV#Guarda Unid.*V.Formoso#CAMPO ZAMBITO<GUARDA>15/02/2026 10:00 A-B Lima900000011 AA1-T ROSA900000012
 *
 * Reparar: uma tem três campos e a outra quatro, e a competição muda de sítio.
 * Por isso NÃO se conta os campos. Procura-se o que tem o `*` — esse é sempre
 * o dos clubes — e daí para trás é cabeçalho, daí para a frente é campo, data,
 * hora e quem vai nomeado.
 *
 * Os DOIS números do princípio são coisas diferentes, e confundi-los seria o
 * erro fácil:
 *   5549 / 2322  -> o número de árbitro de QUEM RECEBEU a mensagem
 *   341020170    -> o número do jogo (nove dígitos)
 * Daí procurar-se o do jogo por comprimento (8+) e não "o primeiro número".
 *
 * O Nacional não traz nomes: é sempre o mesmo trio. A app trata disso sozinha,
 * copiando a nomeação do último jogo do mesmo tipo.
 * ========================================================================= */

/* As abreviaturas dos escalões, tal como vêm nas mensagens. */
const SIGLAS_ESCALAO={BEM:"BEM",BEN:"BEM",INF:"INF",INI:"IN",IN:"IN",
                      JUV:"JUV",JUN:"JUN",VET:"VET",SEN:"SEN",FEM:"FEM"};
const PAPEIS_CONV=["4A","AA1","AA2","A1","A2","A"];

/* Descobre a que escalão da tabela de valores corresponde o que vem na
   mensagem. `escaloes` tanto pode ser uma lista de nomes como uma lista de
   {tipo,escalao} — nesse caso só se procura nos do tipo certo, senão o "S17"
   do Nacional podia ir buscar um escalão do Distrital com um 17 no meio. */
function resolveEscalao(cab,escaloes,tipo){
  let lista=(escaloes||[]).map(e=>(e&&typeof e==="object")?e:{tipo:null,escalao:e});
  const doTipo=lista.filter(e=>!e.tipo||norm(e.tipo)===norm(tipo||""));
  if(doTipo.length)lista=doTipo;
  const nomes=lista.map(e=>e.escalao).filter(Boolean);

  /* Cada associação escreve as mensagens à sua maneira e cada equipa dá os
     seus nomes aos escalões ("sub 14 IN" na Guarda, "Taça Lanidor" em
     Aveiro). Por isso a procura é feita contra a tabela da equipa, do mais
     específico para o mais genérico:
       1. um nome próprio do escalão escrito na mensagem (Sabseg, Lanidor,
          Pecol…) — ganha a tudo, porque uma taça paga diferente do escalão;
       2. a sigla (INI, INF, JUV, JUN, VET…) igual a uma palavra do escalão —
          "INI … Sub/15" são os iniciados, mesmo que a tabela diga "sub 14 IN";
       3. o número (Sub/15, S17) — é o que o Nacional traz;
       4. nos seniores, a divisão ("CD 1", "1 Div") ou a taça. */
  const semAcento=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
  const palavras=s=>semAcento(s).split(/[^a-z0-9ªº]+/).filter(Boolean);
  const cabP=palavras(cab);
  const num=cab.match(/\bS\s*\/?\s*(\d{2})\b/i)||cab.match(/\bsub\s*\/?\s*(\d{1,2})\b/i);
  const temNum=e=>num&&new RegExp("\\b"+num[1]+"\\b").test(String(e));

  // 1. nome próprio (palavras com 5+ letras que não sejam genéricas; "feminino"
  //    e "feminina" contam como a mesma, pelas primeiras 6 letras)
  const GENERICAS=new Set(["taca","divisao","honra","distrital","nacional","campeonato","liga","sub"]);
  const proprias=e=>palavras(e).filter(w=>w.length>=5&&!/\d/.test(w)&&!GENERICAS.has(w));
  const bate=w=>cabP.some(c=>c.length>=5&&c.slice(0,6)===w.slice(0,6));
  const porNome=nomes.filter(e=>proprias(e).some(bate));
  if(porNome.length)return porNome.find(temNum)||porNome[0];

  // 2. sigla
  let seniores=false, siglaSolta="";
  for(const tok of cabP.map(t=>t.toUpperCase())){
    const alvo=SIGLAS_ESCALAO[tok];
    if(!alvo)continue;
    const achou=nomes.find(e=>palavras(e).some(w=>w.toUpperCase()===alvo||w.toUpperCase()===tok));
    if(achou)return achou;
    // Os seniores não têm escalão próprio na tabela: o valor é o da divisão
    // ("SEN#CD 1" é a 1.ª divisão). Segue para as divisões em vez de parar.
    if(alvo==="SEN"){seniores=true;continue;}
    siglaSolta=siglaSolta||alvo;
  }

  // 3. número
  if(num){
    const achou=nomes.find(temNum);
    if(achou)return achou;
  }

  // 4. divisões: "1 Div", "1ª Div", e também "CD 1" / "CD 2" (Campeonato
  //    Distrital). Só sem número de escalão: "CD 1 Div Sub/15" é formação, e
  //    não pode ir parar à 1.ª divisão dos seniores.
  if(!num){
    if(/\b1\S?\s*div/i.test(cab)||/\bCD\s*1\b/i.test(cab))return nomes.find(e=>/1/.test(e)&&/div/i.test(e))||"1ª divisão";
    if(/\b2\S?\s*div/i.test(cab)||/\bCD\s*2\b/i.test(cab))return nomes.find(e=>/2/.test(e)&&/div/i.test(e))||"2ª divisão";
    if(/ta[cç]a/i.test(cab))return nomes.find(e=>/ta[cç]a/i.test(e))||"taça de honra";
  }

  // Nada na tabela: devolve o que se leu, para a pessoa ver e escolher.
  if(num)return "Sub "+num[1];
  return siglaSolta||(seniores?"SEN":"");
}

/* O campo vem como "NOME DO CAMPO<LOCALIDADE>". Guardamos os dois, porque é o
   nome do campo que a app usa para se lembrar dos km — e há campos com o mesmo
   nome em terras diferentes. */
function localDaConv(txt){
  const m=String(txt||"").match(/^([^<]*)<([^>]*)>/);
  if(!m)return String(txt||"").replace(/[<>]/g," ").replace(/\s+/g," ").trim();
  const campo=m[1].replace(/\s+/g," ").trim();
  const terra=m[2].replace(/\s+/g," ").trim();
  if(!campo)return terra;
  if(!terra||norm(campo).includes(norm(terra)))return campo;
  return campo+" ("+terra+")";
}

function parseConv(txt,escaloes){
  txt=String(txt||"").replace(/\s+/g," ").trim();
  const partes=txt.split("#").map(x=>x.trim());
  if(partes.length<3)return null;

  // O campo dos clubes é o que tem o `*`. É a única âncora fiável.
  const iEq=partes.findIndex(x=>x.includes("*"));
  if(iEq<1)return null;

  const cab=partes.slice(0,iEq).join(" ");
  const resto=partes.slice(iEq+1).join("#");
  const out={nomeacoes:[]};

  out.tipo=/\bCN\b/i.test(cab)||/nacional/i.test(cab)?"Nacional":"Distrital";
  out.escalao=resolveEscalao(cab,escaloes,out.tipo);

  const eq=partes[iEq].split("*");
  out.equipaA=(eq[0]||"").trim();
  out.equipaB=(eq[1]||"").trim();

  const numJogo=cab.match(/\b(\d{8,})\b/);
  if(numJogo)out.numJogo=numJogo[1];
  // O número de árbitro de quem recebeu a mensagem, quando vem à frente.
  const numArb=cab.match(/^\s*(\d{3,5})\b/);
  if(numArb)out.numArbitro=numArb[1];

  /* A minha função vem logo a seguir ao número do jogo, quando vem:
     "... 114010120 AA2 JUV" -> AA2. Procurar um "A" solto em todo o cabeçalho
     dava falsos positivos num "DIV A". */
  if(numJogo){
    const depois=cab.slice(cab.indexOf(numJogo[1])+numJogo[1].length).trim().split(/\s+/)[0]||"";
    const p=depois.toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(PAPEIS_CONV.includes(p))out.meuPapel=p;
  }

  const dm=resto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if(dm)out.data=`${dm[3]}-${dm[2]}-${dm[1]}`;
  const hm=resto.match(/(\d{1,2}):(\d{2})/);
  if(hm)out.hora=`${hm[1].padStart(2,"0")}:${hm[2]}`;

  out.local=localDaConv(resto.split(/\d{2}\/\d{2}\/\d{4}/)[0]||"");

  const re=/\b(4A|AA1|AA2|A1|A2|A)\s*-\s*([A-Za-zÀ-ÿ.'\s]+?)\s*(?:\d{9})?(?=\s*\b(?:4A|AA1|AA2|A1|A2|A)\s*-|\s*$)/g;
  let m;
  while((m=re.exec(resto))!==null)out.nomeacoes.push({papel:m[1],nome:m[2].trim()});

  // Sem data nem clubes não vale a pena: é outra coisa qualquer.
  if(!out.equipaA)return null;
  return out;
}

function parseConvLivre(txt,escaloes){
  const t=String(txt||"").replace(/\s+/g," ").trim();
  if(!t)return null;
  const out={nomeacoes:[]};
  const dm=t.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if(dm){const ano=dm[3].length===2?"20"+dm[3]:dm[3];out.data=`${ano}-${p2(+dm[2])}-${p2(+dm[1])}`;}
  const hm=t.match(/\b(\d{1,2})[:h](\d{2})\b/);
  if(hm)out.hora=p2(+hm[1])+":"+hm[2];
  const eq=extraiEquipas(t);
  if(eq){out.equipaA=eq.equipaA;out.equipaB=eq.equipaB;}
  out.tipo=/\b(CN|nacional)\b/i.test(t)?"Nacional":"Distrital";
  escaloes=escaloes||[];
  const sub=t.match(/sub\s*\/?\s*(\d+)/i);
  if(sub){const alvo="sub "+sub[1];out.escalao=escaloes.find(e=>norm(e).replace(/\s+/g," ").includes(norm(alvo)))||alvo;}
  else if(/1\S?\s*div/i.test(t))out.escalao=escaloes.find(e=>/1/.test(e)&&/div/i.test(e))||"1ª divisão";
  else if(/2\S?\s*div/i.test(t))out.escalao=escaloes.find(e=>/2/.test(e)&&/div/i.test(e))||"2ª divisão";
  const re=/\b(4A|AA1|AA2|A1|A2)\s*[-:]\s*([A-Za-zÀ-ÿ.'\s]{2,40}?)(?=\s*\b(?:4A|AA1|AA2|A1|A2)\s*[-:]|\s*$)/g;
  let m;
  while((m=re.exec(t))!==null)out.nomeacoes.push({papel:m[1],nome:m[2].trim()});
  return out.equipaA?out:null;
}

function matchMembro(nomeSms,membros){
  const flat=s=>norm(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z]/g,"");
  const alvo=flat(nomeSms);
  if(!alvo)return null;
  let m=membros.find(mb=>mb.alias&&flat(mb.alias)===alvo);
  if(m)return m;
  const toks=norm(nomeSms).normalize("NFD").replace(/[\u0300-\u036f]/g,"").split(/[\s.]+/).filter(Boolean);
  const ntoksDe=mb=>norm(mb.nome).normalize("NFD").replace(/[\u0300-\u036f]/g,"").split(/\s+/);
  if(toks.length>=2&&toks[0].length===1){
    m=membros.find(mb=>{
      const ntoks=ntoksDe(mb);
      return ntoks.length&&ntoks[0].startsWith(toks[0])&&toks.slice(1).every(t=>ntoks.some(nt=>nt.includes(t)));
    });
    if(m)return m;
    // inicial única: se só um membro começa por essa letra, é ele (ex: "A Nunes" → Ânia)
    const cands=membros.filter(mb=>{const n=ntoksDe(mb);return n.length&&n[0].startsWith(toks[0]);});
    if(cands.length===1)return cands[0];
  }
  return membros.find(mb=>{
    const ntoks=norm(mb.nome).normalize("NFD").replace(/[\u0300-\u036f]/g,"").split(/\s+/);
    return toks.filter(t=>t.length>2).some(t=>ntoks.some(nt=>nt.includes(t)||t.includes(nt)));
  })||null;
}

/* Em Portugal escreve-se 12,50. Um <input type="number"> engolia a vírgula sem
   avisar — "12,50" ficava "1250" e o jogo passava a valer cem vezes mais. Estes
   campos passaram a type="text" com inputmode="decimal" (mesmo teclado no
   telemóvel) e a leitura passa por aqui. */
function num(v){
  if(v===null||v===undefined)return NaN;
  // O € só se tira das pontas: "12€50" não é doze euros e cinquenta, é lixo,
  // e limpá-lo no meio dava 1250 — exatamente o erro que isto veio corrigir.
  const s=String(v).trim().replace(/\s/g,"").replace(/^€+|€+$/g,"").replace(",",".");
  if(s===""||!/^-?\d*\.?\d*$/.test(s)||s==="."||s==="-")return NaN;
  return parseFloat(s);
}
const num0=v=>{const n=num(v);return isNaN(n)?0:n;};
// Valor para dentro de um campo de texto, com vírgula.
const numTxt=v=>(v===null||v===undefined||v==="")?"":String(v).replace(".",",");

/* O nome da época já diz o ano ("2025/26"). Havia um campo separado para o ano
   de início que tinha de ser mantido coerente à mão — e se ficasse errado, os
   meses da época ficavam errados sem ninguém dar por isso. */
function anoDoNome(nome){
  const m=String(nome||"").match(/\b(19|20)(\d{2})\b/);
  return m?+(m[1]+m[2]):null;
}

/* O valor de um jogo era calculado na hora a partir da tabela. Bastava atualizar
   uma tarifa para um jogo de setembro, já recebido e fechado, passar a valer
   outra coisa. Agora o valor congela ao gravar; esta chave diz o que entrou no
   cálculo, para saber quando é legítimo recalcular (mudou a função, o escalão,
   os km…) e quando não é (mudou só a tabela). */
function chaveCalculo(j,a){
  return [norm(j.tipo),norm(j.escalao),norm(a.funcao),a.almocoId||"",
          String(a.km??""),a.deslocFixa?"1":"",String(a.override??"")].join("|");
}
const temValorFixo=a=>a&&a.valor!==undefined&&a.valor!==null&&a.valor!=="";

/* Iniciais para o emblema do topo, a partir do nome da equipa. Sem nome, fica
   "AR" de arbitragem — a app deixou de trazer a identidade de uma equipa
   concreta escrita no código. */
function iniciais(nome){
  const p=String(nome||"").replace(/[·|–—-]/g," ").split(/\s+/).filter(w=>w.length>1);
  if(!p.length)return "AR";
  return (p[0][0]+(p[1]?p[1][0]:"")).toUpperCase();
}

/* ===========================================================================
 * Funções: os dois nomes para a mesma coisa
 * ---------------------------------------------------------------------------
 * A tabela de valores usa dois vocabulários, e não é engano: nos escalões mais
 * novos o jogo tem dois árbitros e as linhas chamam-se "1 arb" e "2 arb"; nos
 * restantes há trio e chamam-se "A" e "AA". É a mesma pessoa a fazer o mesmo
 * papel.
 *
 * Sem isto, mudar o escalão de "sub 14 IN" para "sub 10 BEM" deixava a função
 * em "A" — que nesse escalão não existe — e a app dizia "sem tarifa" sem a
 * pessoa ter feito nada de errado.
 * ========================================================================= */
const PAR_FUNCAO={"A":"1 arb","1 arb":"A","AA":"2 arb","2 arb":"AA"};

/* A função a usar neste escalão: a escolhida, se existir; senão a equivalente;
   senão a escolhida na mesma (e aí o aviso de "sem tarifa" é merecido). */
function funcaoNoEscalao(funcao,disponiveis){
  if(!disponiveis||!disponiveis.length)return funcao;
  if(disponiveis.some(f=>norm(f)===norm(funcao)))return funcao;
  const par=PAR_FUNCAO[funcao];
  if(par&&disponiveis.some(f=>norm(f)===norm(par)))return par;
  return funcao;
}

/* A função habitual de um membro, no vocabulário da tabela de valores.
   O papel na app (responsável/assistente) não tem nada a ver com isto. */
function funcaoDoMembro(m){
  return (m&&m.funcao==="arbitro")?"A":"AA";
}
