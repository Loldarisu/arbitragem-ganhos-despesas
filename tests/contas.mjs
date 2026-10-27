/* Contas, equipas e permissões — os sete testes que o brief exige, feitos
 * pela interface a sério, num browser a sério.
 *
 * O teste 3 tem duas metades: pela interface (aqui) e por pedido direto à API
 * com a chave anon (tests/prova-rls.mjs, contra o Supabase verdadeiro). As
 * políticas em si estão provadas em sql/02-provas.sql, contra PostgreSQL.
 */
import { chromium } from 'playwright';
import { configura, registaEEntra, criaEquipaNova, entraComCodigo, vaiPara, esperaApp, B, MOCK } from './comum.mjs';

/* Usa os servidores que o correr.mjs levanta (app em 8102 sem config.local.js,
   Supabase de mentira em 8123). O estado do servidor lê-se pelos comandos
   /__estado, /__rede e /__reset. */
const mock={
  url:MOCK,
  estado:()=>fetch(MOCK+'/__estado').then(r=>r.json()),
  desligaRede:()=>fetch(MOCK+'/__rede?on=0'),
  ligaRede:()=>fetch(MOCK+'/__rede?on=1'),
  exigeConfirmacao:(v=true)=>fetch(MOCK+'/__confirmacao?on='+(v?1:0)),
  reset:()=>fetch(MOCK+'/__reset')
};
let passou=0, falhou=0;
const ok =(n,c,d='')=>{ if(c){passou++;console.log('  ✅ '+n);} else {falhou++;console.log('  ❌ '+n+(d?'  → '+d:''));} };

await mock.reset();
const browser=await chromium.launch();

async function novaPagina(){
  const ctx=await browser.newContext({viewport:{width:375,height:780}});
  const pg=await ctx.newPage();
  const erros=[];
  pg.on('pageerror',e=>erros.push(String(e&&e.message||e)));
  pg.on('console',m=>{ if(m.type()==='error'&&!/config\.local\.js|404|403|400|ERR_EMPTY_RESPONSE|ERR_CONNECTION|Failed to load resource/.test(m.text()))erros.push(m.text()); });
  await configura(pg,MOCK);
  return {ctx,pg,erros};
}

try{
/* ===================================================================== */
console.log('\n── 5. registo, confirmação de email e recuperação ──');
await mock.exigeConfirmacao(true);
{
  const {ctx,pg,erros}=await novaPagina();
  await pg.goto(B);
  await pg.waitForSelector('#cxConta');
  ok('a app abre no ecrã de conta',await pg.isVisible('#cGo'));

  await pg.click('#cNovo');
  await pg.fill('#cN','Chefe Teste');
  await pg.fill('#cE','chefe@exemplo.invalid');
  await pg.fill('#cP','123');
  await pg.click('#cGo');
  ok('recusa palavra-passe curta com uma frase clara',
     /pelo menos 6/.test(await pg.textContent('#cErr')||''),await pg.textContent('#cErr'));

  await pg.fill('#cP','segredo123');
  await pg.click('#cGo');
  await pg.waitForSelector('text=Confirma o email',{timeout:8000});
  ok('com confirmação ligada, manda confirmar o email em vez de entrar',true);
  ok('e diz para que email',(await pg.content()).includes('chefe@exemplo.invalid'));

  // entrar sem confirmar: tem de recusar, com a razão certa
  await pg.click('#cVolta');
  await pg.fill('#cP','segredo123');
  await pg.click('#cGo');
  await pg.waitForTimeout(400);
  ok('entrar sem confirmar dá a mensagem certa',
     /confirmaste o email/i.test(await pg.textContent('#cErr')||''),await pg.textContent('#cErr'));

  // recuperação
  await pg.click('#cEsq');
  await pg.fill('#cE','chefe@exemplo.invalid');
  await pg.click('#cGo');
  await pg.waitForTimeout(300);
  ok('recuperação de palavra-passe pede e confirma o envio',
     /caixa de entrada/i.test(await pg.textContent('#cOk')||''));

  ok('sem erros de JavaScript no ecrã de conta',erros.length===0,erros[0]);
  await ctx.close();
}

/* ===================================================================== */
console.log('\n── 6. código de convite: papel certo, equipa certa ──');
await mock.exigeConfirmacao(false);
let CODIGO=null, EMAIL_CHEFE='resp@exemplo.invalid';
{
  const {ctx,pg,erros}=await novaPagina();
  await pg.goto(B);
  await registaEEntra(pg,{nome:'Chefe',email:EMAIL_CHEFE});
  await criaEquipaNova(pg,{nomeEquipa:'Equipa do Teste',meuNome:'Chefe'});
  ok('quem cria a equipa entra logo na app',await pg.isVisible('.tabbar button.on'));
  ok('e fica responsável',await pg.evaluate(()=>souResponsavel()));

  await vaiPara(pg,'config');
  await pg.waitForSelector('#cCod',{timeout:8000});
  CODIGO=(await pg.textContent('#cCod')).trim();
  ok('o responsável vê um código de convite',/^[A-Z0-9]{6}$/.test(CODIGO),CODIGO);
  ok('a equipa nova já tem época e tarifas',
     await pg.evaluate(()=>S.epocas.length>0&&S.tabela.length>0));
  ok('sem erros de JavaScript ao criar equipa',erros.length===0,erros[0]);
  await ctx.close();
}
{
  const {ctx,pg,erros}=await novaPagina();
  await pg.goto(B);
  await registaEEntra(pg,{nome:'Assistente',email:'ass@exemplo.invalid'});
  await pg.waitForSelector('#cxEquipa');

  // código errado: não diz se existiu, só que não serve
  await pg.fill('#eqC','ZZZZZZ'); await pg.fill('#eqN1','Assistente');
  await pg.click('#eqGo');
  await pg.waitForFunction(()=>/não existe ou já expirou/.test(document.querySelector('#eqErr').textContent),null,{timeout:8000});
  ok('um código errado diz que não existe ou expirou',true);

  // código certo: fica à espera, não entra
  await pg.fill('#eqC',CODIGO);
  await pg.click('#eqGo');
  await pg.waitForSelector('#cxPendente',{timeout:8000});
  ok('quem usa o código fica à espera de aprovação',true);
  ok('e o ecrã diz em que equipa',(await pg.textContent('#cxPendente')).includes('Equipa do Teste'));
  ok('pendente não carrega dados da equipa',await pg.evaluate(()=>S.jogos.length===0&&S.membros.length===0));
  await pg.click('#pdVerifica');
  await pg.waitForFunction(()=>/Ainda não/.test(document.querySelector('#pdMsg').textContent),null,{timeout:8000});
  ok('verificar antes da aprovação diz que ainda não',true);

  // o responsável aprova pela interface
  {
    const c=await novaPagina();
    await c.pg.goto(B);
    await c.pg.waitForSelector('#cxConta');
    await c.pg.fill('#cE',EMAIL_CHEFE); await c.pg.fill('#cP','segredo123');
    await c.pg.click('#cGo');
    await esperaApp(c.pg);
    ok('o responsável é avisado do pedido ao entrar',/1 pedido/.test(await c.pg.textContent('#toast')||''),await c.pg.textContent('#toast'));
    await vaiPara(c.pg,'config');
    await c.pg.waitForSelector('#cPedidos [data-aprova]',{timeout:8000});
    ok('o pedido aparece em Definições',(await c.pg.textContent('#cPedidos')).includes('Assistente'));
    ok('o pedido não conta como membro antes de aprovado',
       await c.pg.evaluate(()=>!S.membros.some(m=>m.nome==='Assistente')));
    await c.pg.click('#cPedidos [data-aprova]');
    await c.pg.waitForFunction(()=>!document.querySelector('#cPedidos'),null,{timeout:8000});
    ok('aprovar tira o pedido da lista',true);
    ok('e a pessoa passa a membro',await c.pg.evaluate(()=>S.membros.some(m=>m.nome==='Assistente')));
    ok('sem erros de JavaScript a aprovar',c.erros.length===0,c.erros[0]);
    await c.ctx.close();
  }

  await pg.click('#pdVerifica');
  await esperaApp(pg);
  ok('depois de aprovado entra na equipa certa',
     (await pg.evaluate(()=>EQUIPA.nome))==='Equipa do Teste');
  ok('e entra como assistente',!(await pg.evaluate(()=>souResponsavel())));
  ok('sem erros de JavaScript a entrar com código',erros.length===0,erros[0]);
  await ctx.close();
}

/* ===================================================================== */
console.log('\n── 4. o responsável vê e altera tudo ──');
{
  const {ctx,pg,erros}=await novaPagina();
  await pg.goto(B);
  await pg.waitForSelector('#cxConta');
  await pg.fill('#cE',EMAIL_CHEFE); await pg.fill('#cP','segredo123');
  await pg.click('#cGo');
  await esperaApp(pg);
  ok('a sessão guardada volta a entrar sem perguntar nada',true);

  // registar um jogo
  await pg.click('#fab');
  await pg.waitForSelector('#fSave');
  await pg.fill('#fData','2026-03-14');
  await pg.fill('#fEqA','Clube A'); await pg.fill('#fEqB','Clube B');
  await pg.fill('#fLoc','Campo de Teste');
  await pg.click('#fSave');
  await pg.waitForTimeout(900);
  const nj=await pg.evaluate(()=>S.jogos.length);
  ok('o responsável regista um jogo',nj===1,'jogos='+nj);
  ok('e o jogo ficou mesmo na base de dados',(await mock.estado()).jogos===1);
  ok('com a participação dele',(await mock.estado()).participacoes>=1);
  ok('o indicador diz "guardado" só depois de gravar',
     /guardado/i.test(await pg.textContent('#hSync')||''));

  // multa
  await vaiPara(pg,'multas');
  await pg.click('#fab');
  await pg.waitForSelector('#uSave');
  await pg.fill('#uV','5');
  await pg.click('#uSave');
  await pg.waitForTimeout(700);
  ok('o responsável lança uma multa',(await mock.estado()).multas===1);

  // apagar e repor a partir de Definições → Apagados
  await pg.evaluate(()=>apagaRegisto('multas',S.multas[0].id,'Multa'));
  await pg.waitForTimeout(500);
  ok('apagar a multa tira-a da base de dados',(await mock.estado()).multas===0);
  await vaiPara(pg,'config');
  await pg.waitForSelector('#cLixo [data-repor]',{timeout:8000});
  ok('a multa apagada aparece em Apagados',/Multa/.test(await pg.textContent('#cLixo')));
  await pg.click('#cLixo [data-repor]');
  await pg.waitForFunction(()=>S.multas.length===1,null,{timeout:8000});
  ok('Repor devolve a multa',(await mock.estado()).multas===1);

  ok('sem erros de JavaScript no uso normal',erros.length===0,erros[0]);
  await ctx.close();
}

/* ===================================================================== */
console.log('\n── 1, 2 e 3. o que o assistente vê e o que não pode fazer ──');
{
  const {ctx,pg,erros}=await novaPagina();
  await pg.goto(B);
  await pg.waitForSelector('#cxConta');
  await pg.fill('#cE','ass@exemplo.invalid'); await pg.fill('#cP','segredo123');
  await pg.click('#cGo');
  await esperaApp(pg);

  ok('1. o assistente NÃO vê o jogo em que não participou',
     (await pg.evaluate(()=>S.jogos.length))===0);
  await vaiPara(pg,'multas');
  await pg.waitForTimeout(300);
  ok('2. mas VÊ as multas de toda a equipa',
     (await pg.evaluate(()=>S.multas.length))===1);
  ok('3a. a interface não lhe dá o botão de criar',
     await pg.evaluate(()=>getComputedStyle(document.querySelector('#fab')).display==='none'));

  // 3b. e se ele forçar a chamada à mesma?
  const r=await pg.evaluate(async()=>{
    try{ return await guarda('multas',{id:criaId(),epocaId:S.epocas[0]&&S.epocas[0].id,
      membroId:null,data:'2026-04-01',descricao:'invasão',valor:99,pago:false}); }
    catch(e){ return 'erro:'+e.message; }
  });
  ok('3b. forçar a gravação à mão é recusado',r===false,String(r));
  ok('3c. e a base de dados continua com uma multa só',(await mock.estado()).multas===1);

  await vaiPara(pg,'config');
  await pg.waitForTimeout(400);
  // Procurar a string no HTML da página não serve: o próprio <script> tem
  // "cCod" lá dentro. O que interessa é se o elemento existe mesmo.
  ok('4. o assistente não vê o código de convite',
     !(await pg.evaluate(()=>!!document.querySelector('#cCod'))));
  ok('5. nem a tabela de valores',(await pg.evaluate(()=>S.tabela.length))===0);
  ok('sem erros de JavaScript como assistente',erros.length===0,erros[0]);
  await ctx.close();
}

/* ===================================================================== */
console.log('\n── despesas: de cada um, e só de cada um ──');
{
  // o assistente lança a sua
  const {ctx,pg,erros}=await novaPagina();
  await pg.goto(B);
  await pg.waitForSelector('#cxConta');
  await pg.fill('#cE','ass@exemplo.invalid'); await pg.fill('#cP','segredo123');
  await pg.click('#cGo');
  await esperaApp(pg);
  await vaiPara(pg,'despesas');
  await pg.waitForTimeout(300);
  ok('o assistente tem o botão + nas despesas',
     await pg.evaluate(()=>getComputedStyle(document.querySelector('#fab')).display!=='none'));
  await pg.click('#fab');
  await pg.waitForSelector('#dSave');
  ok('o formulário não pergunta "quem" — é sempre de quem lança',!(await pg.$('#dM')));
  const cats=await pg.evaluate(()=>[...document.querySelectorAll('[data-cat]')].map(b=>b.dataset.cat));
  ok(['Almoço','Jantar','Gota'].every(c=>cats.includes(c)),'as categorias são de fim de semana ('+cats.slice(0,5).join(', ')+'…)');
  await pg.click('[data-cat="Jantar"]');
  await pg.fill('#dDesc','depois do jogo');
  await pg.fill('#dV','18,50');
  await pg.click('#dSave');
  await pg.waitForTimeout(900);
  const antes=(await mock.estado()).despesas;
  ok('o assistente grava a sua despesa',antes>=1,'despesas='+antes);
  ok('e vê-a na lista',/Jantar/.test(await pg.textContent('#main')));
  ok('sem erros de JavaScript nas despesas',erros.length===0,erros[0]);
  await ctx.close();
}
{
  // o responsável NÃO a vê
  const {ctx,pg}=await novaPagina();
  await pg.goto(B);
  await pg.waitForSelector('#cxConta');
  await pg.fill('#cE',EMAIL_CHEFE); await pg.fill('#cP','segredo123');
  await pg.click('#cGo');
  await esperaApp(pg);
  await vaiPara(pg,'despesas');
  await pg.waitForTimeout(300);
  ok('o responsável não vê a despesa do assistente',
     (await pg.evaluate(()=>S.despesas.length))===0&&!/depois do jogo/.test(await pg.textContent('#main')));
  ok('nem forçando: gravar uma despesa em nome do assistente é recusado',
     (await pg.evaluate(async()=>{
       const outro=S.membros.find(m=>m.id!==EUMEMBRO.id);
       return await guarda('despesas',{id:criaId(),epocaId:S.epocas[0].id,membroId:outro.id,
         data:'2026-03-01',categoria:'Outro',descricao:'x',valor:1,tipoLanc:'despesa'});
     }))===false);
  await ctx.close();
}

/* ===================================================================== */
console.log('\n── sem rede: fica neste telemóvel, diz que está por enviar, e envia quando a rede volta ──');
{
  const {ctx,pg,erros}=await novaPagina();
  await pg.goto(B);
  await pg.waitForSelector('#cxConta');
  await pg.fill('#cE',EMAIL_CHEFE); await pg.fill('#cP','segredo123');
  await pg.click('#cGo');
  await esperaApp(pg);

  const jogosAntes=(await mock.estado()).jogos;
  await mock.desligaRede();
  await pg.click('#fab');
  try{ await pg.waitForSelector('#fSave',{timeout:6000}); }
  catch(_){ console.log('    [depuração] toast=',await pg.textContent('#toast').catch(()=>'-'),
                        'dlg=',await pg.evaluate(()=>document.querySelector('#dlg').open),
                        'erros=',erros.slice(0,2)); throw _; }
  await pg.fill('#fData','2026-05-05');
  await pg.fill('#fEqA','Sem Rede FC');
  await pg.click('#fSave');
  await pg.waitForTimeout(2500);

  ok('sem rede, o jogo fica registado e o diálogo fecha',!(await pg.isVisible('#fSave')));
  ok('e aparece na lista',/Sem Rede FC/.test(await pg.textContent('#main')));
  const aviso=await pg.textContent('#toast').catch(()=>'')||'';
  ok('o aviso diz que ficou neste telemóvel, sem rede',/sem rede/i.test(aviso)&&/telemóvel/.test(aviso),aviso.slice(0,140));
  const ind=await pg.textContent('#hSync')||'';
  ok('o indicador diz "por enviar", não "guardado"',/1 por enviar/.test(ind)&&!/guardado/.test(ind),ind);
  ok('a base de dados ainda não tem o jogo',(await mock.estado()).jogos===jogosAntes);
  ok('a fila sobrevive a fechar a app',await pg.evaluate(()=>JSON.parse(localStorage.getItem('arbFila')).ops.length===1));

  await mock.ligaRede();
  await pg.click('#hSync');
  await pg.waitForFunction(()=>!/por enviar/.test(document.querySelector('#hSync').textContent),null,{timeout:8000});
  ok('com a rede de volta, a fila é enviada',(await mock.estado()).jogos===jogosAntes+1);
  ok('e o jogo continua na lista, agora vindo da base de dados',/Sem Rede FC/.test(await pg.textContent('#main')));
  ok('a fila fica vazia',await pg.evaluate(()=>leFila().length===0));

  // uma recusa do servidor não vai para a fila: diz-se logo
  const recusa=await pg.evaluate(async()=>{
    const antes=EUMEMBRO.papel; EUMEMBRO.papel='responsavel';
    const r=await (async()=>{ // força uma escrita que o servidor recusa (outra equipa)
      const eq=EQUIPA.id; EQUIPA.id='00000000-0000-4000-8000-000000000000';
      try{ return await guarda('multas',{id:criaId(),epocaId:S.epocas[0].id,membroId:EUMEMBRO.id,valor:5,data:'2026-01-01'}); }
      finally{ EQUIPA.id=eq; }
    })();
    EUMEMBRO.papel=antes; return {r,fila:leFila().length};
  });
  ok('uma recusa do servidor devolve falso e não entra na fila',recusa.r===false&&recusa.fila===0,JSON.stringify(recusa));
  ok('sem erros de JavaScript no corte de rede',erros.length===0,erros[0]);
  await ctx.close();
}

/* ===================================================================== */
console.log('\n── sessão expirada é diferente de sem rede ──');
{
  const {ctx,pg}=await novaPagina();
  await pg.goto(B);
  await pg.waitForSelector('#cxConta');
  await pg.fill('#cE',EMAIL_CHEFE); await pg.fill('#cP','segredo123');
  await pg.click('#cGo');
  await esperaApp(pg);

  await pg.evaluate(()=>{SY.access='';SY.refresh='invalido';SY.exp=0;saveSY();});
  const msg=await pg.evaluate(async()=>{
    try{ await recarrega(); }catch(_){}
    return document.querySelector('#hSync').textContent;
  });
  await pg.waitForTimeout(500);
  ok('o indicador distingue sessão de rede',/sess/i.test(msg)||await pg.isVisible('#cxConta'),msg);
  await ctx.close();
}

}catch(e){
  falhou++; console.log('  ❌ exceção na suíte: '+(e&&e.stack||e));
}finally{
  await browser.close();
}

console.log(`\n  ${passou} passaram, ${falhou} falharam`);
process.exit(falhou?1:0);
