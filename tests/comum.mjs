// Arranque comum das suítes, para o modelo de contas e equipas.
// A app já não abre com um ecrã de boas-vindas nem com dados locais: abre com
// o ecrã de conta. Cada teste começa por criar (ou reutilizar) uma conta.
export const EQUIPA=['A. Primeiro','B. Segundo','C. Terceiro'];

/* A app é servida SEM o config.local.js (porta 8102): senão esse ficheiro
   reescrevia o SB_CONFIG que os testes injetam e a app ia falar com o Supabase
   verdadeiro. O Supabase de mentira está em 8123, levantado pelo correr.mjs. */
export const B='http://127.0.0.1:8102/index.html';
export const MOCK='http://127.0.0.1:8123';

export async function configura(pg,urlMock){
  await pg.addInitScript(u=>{ window.SB_CONFIG={url:u,key:'chave-anon-de-teste'}; },urlMock);
}

/* Esperar por `.tabbar button.on` não servia: esse botão está no HTML desde o
   início, por isso o teste seguia em frente com o ecrã de conta ainda por cima
   e os cliques iam parar ao sítio errado. O sinal certo é o ecrã de conta
   desaparecer. */
export async function esperaApp(pg,ms=15000){
  await pg.waitForSelector('#loginScr',{state:'detached',timeout:ms});
  // e esperar que os dados tenham CHEGADO, não só que o ecrã tenha fechado:
  // o ecrã de conta fecha antes do carregamento acabar, e um teste que siga
  // aí desliga a rede a meio de um pedido e culpa a app pelo resultado.
  await pg.waitForFunction(()=>typeof EQUIPA!=='undefined'&&EQUIPA!==null
    &&typeof S!=='undefined'&&S.membros&&S.membros.length>0,null,{timeout:ms});
}

export async function registaEEntra(pg,{nome='A. Primeiro',email,pass='segredo123'}={}){
  email=email||('t'+Math.random().toString(36).slice(2,8)+'@exemplo.invalid');
  await pg.waitForSelector('#cxConta');
  await pg.click('#cNovo');
  await pg.fill('#cN',nome);
  await pg.fill('#cE',email);
  await pg.fill('#cP',pass);
  await pg.click('#cGo');
  return {email,pass,nome};
}

export async function criaEquipaNova(pg,{nomeEquipa='Equipa de Teste',meuNome='A. Primeiro',epoca='2025/26'}={}){
  await pg.waitForSelector('#cxEquipa');
  await pg.fill('#eqNome',nomeEquipa);
  await pg.fill('#eqN2',meuNome);
  await pg.click('#eqCria');
  await esperaApp(pg);
  // A época de uma equipa nova sai da data de hoje, o que faria os testes mudar
  // de resultado conforme o mês em que corressem. Fixa-se numa época conhecida.
  if(epoca)await pg.evaluate(async n=>{
    const e=S.epocas[0]; e.nome=n; e.anoInicio=parseInt(n)||2025;
    await guarda('epocas',e); await recarrega(true);
    // o filtro de mês foi decidido antes de a época existir: repor em "Todos"
    mesSel="all"; mesRes="all"; mesDesp="all"; mesMul="all"; render();
  },epoca);
}

/* Com o sql/05, quem entra com código fica à espera de aprovação. As suítes
   que só precisam de um assistente lá dentro aprovam-no pelo mock (/__aprova);
   o caminho pela interface do responsável é testado à parte, em contas.mjs. */
export async function entraComCodigo(pg,codigo,meuNome,{aprova=true,mock=MOCK}={}){
  await pg.waitForSelector('#cxEquipa');
  await pg.fill('#eqC',codigo);
  await pg.fill('#eqN1',meuNome);
  await pg.click('#eqGo');
  await pg.waitForSelector('#cxPendente');
  if(!aprova)return;
  await fetch(mock+'/__aprova');
  await pg.click('#pdVerifica');
  await esperaApp(pg);
}

/* Responsável com equipa nova e vazia, já dentro da app.
   Cada chamada cria uma conta e uma equipa próprias, por isso as suítes não
   se pisam umas às outras nem dependem da ordem por que correm. */
export async function arranca(pg,opcoes={}){
  await configura(pg,opcoes.mock||MOCK);
  await pg.goto(opcoes.url||B);
  const conta=await registaEEntra(pg,opcoes);
  await criaEquipaNova(pg,opcoes);
  return conta;
}

/* Acrescenta os outros membros da equipa, para as suítes que precisam de mais
   do que uma pessoa nas listas de nomeação. */
export async function garanteEquipa(pg,nomes=EQUIPA){
  await pg.evaluate(async ns=>{
    for(const n of ns){
      if(S.membros.some(m=>m.nome===n))continue;
      await guarda('membros',{id:criaId(),nome:n,alias:'',papel:'assistente',funcao:'AA2',ativo:true});
    }
    await recarrega(true);
  },nomes);
}

export function vaiPara(pg,aba){
  return pg.click(`.tabbar button[data-tab="${aba}"]`);
}

/* Semear dados nos testes.
 *
 * Antes bastava atribuir a S e chamar save(): o estado vivia no telemóvel.
 * Agora tem de passar pela base de dados, como qualquer gravação a sério —
 * o que também faz destes testes uma verificação a mais do caminho de escrita.
 *
 * Os `id` antigos ("art3", "j1") são traduzidos: os artigos por número, tudo
 * o resto ganha um uuid novo. */
export async function semeia(pg,dados){
  await pg.evaluate(async d=>{
    const artPorNum=n=>{
      const m=String(n||'').match(/^art(\d+)$/);
      if(!m)return n||null;
      const a=S.artigos.find(x=>x.num===Number(m[1]));
      return a?a.id:null;
    };
    for(const j of (d.jogos||[])){
      const novo={...j,id:criaId(),epocaId:S.epocas[0].id,
        atribuicoes:(j.atribuicoes||[]).map(a=>({...a,id:criaId(),
          membroId:typeof a.membroId==='number'?(S.membros[a.membroId]||{}).id:a.membroId}))};
      await guardaJogo(novo);
    }
    for(const m of (d.multas||[])) await guarda('multas',{...m,id:criaId(),
      epocaId:S.epocas[0].id,artigoId:artPorNum(m.artigoId),
      membroId:typeof m.membroId==='number'?(S.membros[m.membroId]||{}).id:m.membroId});
    for(const f of (d.fundo||[]))  await guarda('fundo',{...f,id:criaId(),epocaId:S.epocas[0].id});
    for(const x of (d.distancias||[])) await guarda('distancias',{...x,id:criaId(),
      membroId:typeof x.membroId==='number'?(S.membros[x.membroId]||{}).id:x.membroId});
    // As despesas são sempre de quem as lança: a base de dados não aceita outra coisa.
    for(const x of (d.despesas||[])) await guarda('despesas',{...x,id:criaId(),epocaId:S.epocas[0].id,
      membroId:EUMEMBRO.id});
    await recarrega(true);
  },dados);
}

/* Apaga tudo o que a equipa tem de uma coleção — o equivalente ao antigo
   `S.jogos=[]` seguido de save(). */
export async function limpa(pg,col){
  await pg.evaluate(async c=>{
    for(const r of [...(S[c]||[])]) await apagaNaBD(c,r.id);
    await recarrega(true);
  },col);
}
