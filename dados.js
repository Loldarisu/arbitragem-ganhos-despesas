/* ===========================================================================
 * dados.js — a app fala com a base de dados
 * ---------------------------------------------------------------------------
 * Antes havia uma linha só, com o estado todo lá dentro em JSON. Agora há
 * tabelas a sério, e é aqui que se faz a tradução entre as duas formas:
 *
 *   base de dados          ->  ecrã
 *   membros_equipa             S.membros
 *   epocas                     S.epocas
 *   tabela_valores             S.tabela
 *   almocos                    S.almocos
 *   artigos_multa              S.artigos
 *   jogos + participacoes      S.jogos  (as participações vêm dentro do jogo,
 *                                        no campo `atribuicoes`, tal como o
 *                                        resto da app já espera)
 *   despesas                   S.despesas
 *   multas                     S.multas
 *   pagamentos                 S.pagamentos
 *   fundo_gastos               S.fundo
 *   distancias                 S.distancias
 *
 * Porquê manter os nomes antigos do lado do ecrã: são 2000 linhas de interface
 * que já sabem ler `j.atribuicoes` e `S.membros`. Trocar os nomes todos era
 * arriscar partir coisas que funcionam, sem o utilizador ganhar nada.
 *
 * Este ficheiro não toca no DOM. Fala com a rede e devolve dados ou atira
 * erros classificados (ver ErroDados).
 * =========================================================================== */

/* ---------------------------------------------------------------------------
 * Erros com nome, porque o utilizador tem de ver TRÊS mensagens diferentes:
 * ficar sem rede, não haver nada para mostrar, e a sessão ter expirado.
 * Um "algo correu mal" para os três casos é inútil no meio de um campo.
 * ------------------------------------------------------------------------- */
class ErroDados extends Error{
  constructor(tipo, msg, detalhe){
    super(msg); this.name="ErroDados"; this.tipo=tipo; this.detalhe=detalhe||"";
  }
}
const TIPO_REDE      = "rede";       // o telemóvel não chegou ao servidor
const TIPO_SESSAO    = "sessao";     // o servidor respondeu: já não te conheço
const TIPO_PERMISSAO = "permissao";  // respondeu: conheço-te, mas não podes
const TIPO_SERVIDOR  = "servidor";   // respondeu outra coisa qualquer

function mensagemDoErro(e){
  if(!(e instanceof ErroDados)) return "Não consegui concluir: "+(e&&e.message||"erro desconhecido");
  switch(e.tipo){
    case TIPO_REDE:      return "Sem ligação. Nada foi gravado — o que preencheste continua aqui.";
    case TIPO_SESSAO:    return "A tua sessão expirou. Entra outra vez para continuares.";
    case TIPO_PERMISSAO: return "Só o responsável da equipa pode alterar isto.";
    default:             return "O servidor recusou: "+(e.detalhe||e.message);
  }
}

/* ---------------------------------------------------------------------------
 * Tradutores. Um por coleção: como se escreve na base de dados (`paraBD`) e
 * como se lê de volta (`daBD`).
 *
 * Duas regras que se repetem:
 *  - o ecrã trabalha com "" para "vazio"; a base de dados quer null;
 *  - o ecrã escreve vírgula decimal; a base de dados quer ponto. A conversão
 *    já existe em num()/num0() no engine.js e é feita antes de chegar aqui.
 * ------------------------------------------------------------------------- */
const vz  = v => (v===""||v===undefined||v===null) ? null : v;          // "" -> null
const txt = v => (v===null||v===undefined) ? "" : v;                     // null -> ""
const nm  = v => (v===null||v===undefined||v==="") ? "" : Number(v);     // null -> "" (o ecrã distingue 0 de vazio)

const MAPA={
  membros:{
    tabela:"membros_equipa",
    // "*" e não a lista de colunas: `aprovado` e `reclama_id` só existem depois
    // do sql/05. Pedi-las por nome antes disso partia o arranque da app.
    colunas:"*",
    daBD:  r=>({id:r.id,nome:r.nome,alias:txt(r.alias),papel:r.papel,
                funcao:r.funcao_habitual,ativo:r.ativo!==false,contaLigada:!!r.user_id,
                aprovado:r.aprovado!==false,reclamaId:txt(r.reclama_id)}),
    paraBD:(o,eq)=>({id:o.id,equipa_id:eq,nome:o.nome,alias:txt(o.alias),
                     papel:o.papel||"assistente",funcao_habitual:o.funcao||"AA2",
                     ativo:o.ativo!==false})
  },
  epocas:{
    tabela:"epocas",
    colunas:"id,nome,ano_inicio,valor_km,deslocacoes",
    daBD:  r=>({id:r.id,nome:r.nome,anoInicio:r.ano_inicio,valorKm:Number(r.valor_km),
                deslocacoes:r.deslocacoes||[]}),
    paraBD:(o,eq)=>({id:o.id,equipa_id:eq,nome:o.nome,ano_inicio:o.anoInicio,
                     valor_km:o.valorKm,deslocacoes:o.deslocacoes||[]})
  },
  tabela:{
    tabela:"tabela_valores",
    colunas:"id,epoca_id,tipo,escalao,funcao,valor",
    daBD:  r=>({id:r.id,epocaId:r.epoca_id,tipo:r.tipo,escalao:r.escalao,
                funcao:r.funcao,valor:Number(r.valor)}),
    paraBD:(o,eq)=>({id:o.id,equipa_id:eq,epoca_id:o.epocaId,tipo:o.tipo,
                     escalao:o.escalao,funcao:o.funcao,valor:o.valor})
  },
  almocos:{
    tabela:"almocos",
    colunas:"id,epoca_id,nome,valor",
    daBD:  r=>({id:r.id,epocaId:r.epoca_id,nome:r.nome,valor:Number(r.valor)}),
    paraBD:(o,eq)=>({id:o.id,equipa_id:eq,epoca_id:o.epocaId,nome:o.nome,valor:o.valor})
  },
  artigos:{
    // O ecrã chama-lhe `nome` (é o texto do artigo do regulamento); a coluna
    // chama-se `descricao`. `regra` marca o Art. 19, que se lê mas não se
    // escolhe como infração.
    tabela:"artigos_multa",
    colunas:"id,num,descricao,valor,por_unidade,regra",
    daBD:  r=>({id:r.id,num:r.num,nome:txt(r.descricao),valor:Number(r.valor),
                porUnidade:!!r.por_unidade,regra:!!r.regra}),
    paraBD:(o,eq)=>({id:o.id,equipa_id:eq,num:o.num,
                     descricao:txt(o.nome!==undefined?o.nome:o.descricao),
                     valor:o.valor,por_unidade:!!o.porUnidade,regra:!!o.regra})
  },
  despesas:{
    tabela:"despesas",
    colunas:"id,epoca_id,membro_id,data,categoria,tipo_lanc,descricao,valor",
    daBD:  r=>({id:r.id,epocaId:r.epoca_id,membroId:txt(r.membro_id),data:r.data,
                categoria:r.categoria,tipoLanc:r.tipo_lanc,descricao:txt(r.descricao),
                valor:Number(r.valor)}),
    paraBD:(o,eq)=>({id:o.id,equipa_id:eq,epoca_id:o.epocaId,membro_id:vz(o.membroId),
                     data:o.data,categoria:o.categoria||"Outro",
                     tipo_lanc:o.tipoLanc==="receita"?"receita":"despesa",
                     descricao:txt(o.descricao),valor:o.valor})
  },
  multas:{
    tabela:"multas",
    colunas:"id,epoca_id,membro_id,artigo_id,data,descricao,valor,pago,data_pagamento",
    daBD:  r=>({id:r.id,epocaId:r.epoca_id,membroId:txt(r.membro_id),artigoId:txt(r.artigo_id),
                data:r.data,descricao:txt(r.descricao),valor:Number(r.valor),
                pago:!!r.pago,dataPagamento:txt(r.data_pagamento)}),
    paraBD:(o,eq)=>({id:o.id,equipa_id:eq,epoca_id:o.epocaId,membro_id:vz(o.membroId),
                     artigo_id:vz(o.artigoId),data:o.data,descricao:txt(o.descricao),
                     valor:o.valor,pago:!!o.pago,data_pagamento:vz(o.dataPagamento)})
  },
  pagamentos:{
    // Um pagamento é (pessoa, mês, tipo de jogo): a associação paga ao fim do
    // mês, a cada árbitro, e manda uma folha por competição.
    tabela:"pagamentos",
    colunas:"id,epoca_id,membro_id,tipo,mes,valor,data",
    daBD:  r=>({id:r.id,epocaId:r.epoca_id,membroId:txt(r.membro_id),tipo:txt(r.tipo),
                mes:r.mes,valor:Number(r.valor),data:txt(r.data)}),
    paraBD:(o,eq)=>({id:o.id,equipa_id:eq,epoca_id:o.epocaId,membro_id:vz(o.membroId),
                     tipo:txt(o.tipo),mes:o.mes,valor:o.valor,data:vz(o.data)})
  },
  fundo:{
    tabela:"fundo_gastos",
    colunas:"id,epoca_id,descricao,data,valor",
    daBD:  r=>({id:r.id,epocaId:r.epoca_id,descricao:txt(r.descricao),data:r.data,
                valor:Number(r.valor)}),
    paraBD:(o,eq)=>({id:o.id,equipa_id:eq,epoca_id:o.epocaId,
                     descricao:txt(o.descricao),data:o.data,valor:o.valor})
  },
  distancias:{
    tabela:"distancias",
    colunas:"id,membro_id,local,km",
    daBD:  r=>({id:r.id,membroId:txt(r.membro_id),local:r.local,km:Number(r.km)}),
    paraBD:(o,eq)=>({id:o.id,equipa_id:eq,membro_id:vz(o.membroId),local:o.local,km:o.km})
  }
};

/* Os jogos são o caso especial: uma linha em `jogos` mais N linhas em
   `participacoes`. O ecrã quer isso tudo num objeto só. */
function jogoDaBD(r){
  return {
    id:r.id, epocaId:r.epoca_id, data:r.data, hora:txt(r.hora)||"15:00",
    tipo:r.tipo, escalao:txt(r.escalao),
    equipaA:txt(r.equipa_a), equipaB:txt(r.equipa_b),
    local:txt(r.local),
    // "pago" era um estado do jogo quando o pagamento era por jogo. Agora o
    // pagamento é da pessoa, por mês e por competição, e o estado do jogo só
    // diz se ele se realizou.
    estado:(r.estado==="pago")?"realizado":r.estado,
    valorRecebido:nm(r.valor_recebido), dataPagamento:txt(r.data_pagamento),
    numJogo:txt(r.num_jogo),
    confirmada:!!r.confirmada, horasMarcadas:!!r.horas_marcadas,
    atribuicoes:(r.participacoes||[]).map(p=>({
      id:p.id, membroId:txt(p.membro_id), funcao:p.funcao,
      almocoId:txt(p.almoco_id), km:nm(p.km), override:nm(p.override),
      deslocFixa:p.desloc_fixa?"1":"",
      valor:Number(p.valor), calcKey:txt(p.calc_key), nomeSms:txt(p.nome_sms)
    }))
  };
}
function jogoParaBD(j,eq){
  return {
    id:j.id, equipa_id:eq, epoca_id:j.epocaId, data:j.data,
    hora:txt(j.hora)||"15:00", tipo:j.tipo, escalao:txt(j.escalao),
    equipa_a:txt(j.equipaA), equipa_b:txt(j.equipaB),
    local:txt(j.local), estado:j.estado||"agendado",
    valor_recebido:vz(j.valorRecebido), data_pagamento:vz(j.dataPagamento),
    // Estes três ficavam de fora: o "Confirmar nomeação" e o "Marcar horas"
    // gravavam no ecrã mas não na base de dados, e voltavam ao recarregar.
    num_jogo:txt(j.numJogo), confirmada:!!j.confirmada, horas_marcadas:!!j.horasMarcadas
  };
}
function partParaBD(a,j,eq){
  return {
    id:a.id||criaId(), equipa_id:eq, jogo_id:j.id, membro_id:vz(a.membroId),
    funcao:a.funcao, almoco_id:vz(a.almocoId), km:vz(a.km),
    override:vz(a.override), desloc_fixa:!!a.deslocFixa, valor:Number(a.valor)||0,
    calc_key:txt(a.calcKey), nome_sms:txt(a.nomeSms)
  };
}

/* Ids: a base de dados usa uuid. Geramos do lado do cliente para o objeto ter
   id antes de a gravação responder — a interface precisa dele para se pintar. */
function criaId(){
  if(globalThis.crypto&&crypto.randomUUID) return crypto.randomUUID();
  // telemóveis antigos sem crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{
    const r=Math.random()*16|0, v=c==="x"?r:(r&0x3|0x8);
    return v.toString(16);
  });
}

/* Ficheiro de script normal, como o engine.js: sem módulos, sem build step.
   Tudo o que está aqui em cima fica disponível para o index.html. */
