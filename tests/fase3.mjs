/* Fase 3: partilhar para a app, atalhos do ícone, cartão "Jogo de hoje" e
 * resumo do ano civil. Pela interface, num browser a sério, contra o Supabase
 * de mentira (8123) e a app servida sem config.local.js (8102). */
import { chromium } from 'playwright';
import { arranca, semeia, vaiPara, esperaApp, garanteEquipa, B } from './comum.mjs';

let passou=0, falhou=0;
const ok=(n,c,d='')=>{ if(c){passou++;console.log('  ✅ '+n);} else {falhou++;console.log('  ❌ '+n+(d?'  → '+d:''));} };

const CONV='1128030020 INI#CD 1 Div Sub/15#UD Fermedo*UD Mourisquense#CAMPO DA JUNTA 20/09/2025 15:00 AA1-A Nunes AA2-X Brito';
const browser=await chromium.launch();
try{
  const ctx=await browser.newContext({viewport:{width:375,height:780},acceptDownloads:true});
  const pg=await ctx.newPage();
  const erros=[];
  pg.on('pageerror',e=>erros.push(String(e&&e.message||e)));
  await arranca(pg);

  console.log('\n── manifest ──');
  {
    const m=await pg.evaluate(()=>fetch('manifest.webmanifest').then(r=>r.json()));
    ok('declara share_target com o texto partilhado',!!(m.share_target&&m.share_target.params&&m.share_target.params.text==='text'));
    ok('tem os três atalhos do ícone',Array.isArray(m.shortcuts)&&m.shortcuts.length===3,JSON.stringify(m.shortcuts&&m.shortcuts.map(s=>s.url)));
    ok('ícones any e maskable separados',m.icons.some(i=>i.purpose==='maskable')&&!m.icons.some(i=>/any maskable/.test(i.purpose)));
  }

  console.log('\n── partilhar uma mensagem para a app ──');
  {
    await pg.goto(B+'?text='+encodeURIComponent(CONV));
    await esperaApp(pg);
    await pg.waitForSelector('#cvTxt',{timeout:8000});
    ok('abre a convocatória com a mensagem já colada',(await pg.inputValue('#cvTxt'))===CONV);
    ok('o texto sai do endereço (recarregar não repete)',!/text=/.test(pg.url()),pg.url());
    await pg.click('#cvCancel');
  }

  console.log('\n── atalhos do ícone ──');
  {
    await pg.goto(B+'?acao=novo-jogo');
    await esperaApp(pg);
    await pg.waitForSelector('#fSave',{timeout:8000});
    ok('"Novo jogo" abre o formulário',true);
    await pg.keyboard.press('Escape');
    await pg.goto(B+'?separador=resumo');
    await esperaApp(pg);
    await pg.waitForSelector('.tabbar button[data-tab="resumo"].on',{timeout:8000});
    ok('"Resumo" abre no separador Resumo',true);
    await pg.goto(B+'?separador=nao-existe');
    await esperaApp(pg);
    ok('um separador inventado é ignorado',await pg.isVisible('.tabbar button[data-tab="jogos"].on'));
  }

  console.log('\n── convocatória de seniores (SEN + "CD 1") ──');
  {
    // mensagem real de 27/09/2026, com nomes e telefones dos árbitros inventados
    await pg.evaluate(()=>formConv("2322 100010060 AA1 SEN#CD 1#C.D.Gouveia -SAD*SCMeda#EM FARVAO<GOUVEIA>27/09/2026 15:15 A-J Silva900000001 AA2-M Costa900000002"));
    await pg.click('#cvGo');
    await pg.waitForSelector('#fSave');
    ok('o escalão fica "1ª divisão" (e não "SEN", que não existe na tabela)',(await pg.inputValue('#fEscSel'))==='1ª divisão',await pg.inputValue('#fEscSel'));
    ok('a minha linha tem valor da tabela (AA na 1.ª divisão: 33 €)',/33,00/.test(await pg.textContent('#fTot')),await pg.textContent('#fTot'));
    const linhas=await pg.$$eval('#dlg .atr',as=>as.map(a=>({rot:a.innerText.trim().split('·')[0].trim(),
      quem:a.querySelector('[data-f="membroId"]').value})));
    const eu=await pg.evaluate(()=>EUMEMBRO.id);
    ok('as linhas seguem a mensagem: A, depois eu como AA1, depois o AA2',
       linhas.map(l=>l.rot).join(',')==='A,AA1,AA2'&&linhas[1].quem===eu,JSON.stringify(linhas));
    await pg.click('#fCancel').catch(()=>pg.keyboard.press('Escape'));
  }

  console.log('\n── jogo de hoje ──');
  {
    const d=new Date(Date.now()+2*3600e3);
    const p2=n=>String(n).padStart(2,'0');
    const data=d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate());
    const hora=p2(d.getHours())+':'+p2(d.getMinutes());
    await semeia(pg,{jogos:[{data,hora,tipo:'Distrital',escalao:'2ª divisão',equipaA:'Fermedo',equipaB:'Mourisca',
      local:'Campo da Junta, Fermedo',estado:'agendado',atribuicoes:[{membroId:0,funcao:'A',override:'34'}]}]});
    await vaiPara(pg,'jogos');
    await pg.waitForSelector('section.hoje',{timeout:8000});
    const txt=await pg.textContent('section.hoje');
    ok('aparece o cartão do jogo',/Fermedo/.test(txt)&&/(Hoje|Amanhã)/.test(txt),txt.slice(0,80));
    ok('diz quanto falta para o apito',/apito daqui a/.test(txt),txt.slice(0,120));
    const href=await pg.getAttribute('section.hoje a[href*="google.com/maps"]','href');
    ok('o botão do Maps leva o campo',href&&href.includes(encodeURIComponent('Campo da Junta, Fermedo')),href);
    ok('e há botão do Waze',await pg.isVisible('section.hoje a[href*="waze.com"]'));
    ok('a lista de equipamento segue o escalão (2.ª divisão -> Art. 7)',/Art\. 7/.test(txt));
    await pg.click('section.hoje summary');
    await pg.check('section.hoje [data-chk]');
    ok('marcar um item atualiza a contagem',/\(1\/3\)/.test(await pg.textContent('section.hoje summary')),await pg.textContent('section.hoje summary'));
    await pg.evaluate(()=>render());
    ok('o que foi marcado fica marcado',await pg.isChecked('section.hoje [data-chk]'));
  }

  console.log('\n── ano civil ──');
  {
    await semeia(pg,{jogos:[
      {data:'2025-12-10',hora:'15:00',tipo:'Distrital',escalao:'sub 14 IN',equipaA:'A',equipaB:'B',estado:'realizado',
       atribuicoes:[{membroId:0,funcao:'A',override:'30',valor:30}]},
      {data:'2026-01-10',hora:'15:00',tipo:'Distrital',escalao:'sub 14 IN',equipaA:'C',equipaB:'D',estado:'realizado',
       atribuicoes:[{membroId:0,funcao:'A',override:'40',valor:40}]}]});
    await pg.evaluate(async()=>{
      await guarda('pagamentos',{id:criaId(),epocaId:S.epocas[0].id,membroId:EUMEMBRO.id,tipo:'Distrital',
        mes:'2025-12',valor:30,data:'2026-01-05'});
      await recarrega(true);
    });
    await vaiPara(pg,'resumo');
    await pg.waitForSelector('#cAno');
    await pg.click('[data-ano="2026"]');
    await pg.waitForSelector('[data-ano="2026"].on');
    let t=await pg.textContent('#cAno');
    ok('2026: só o jogo de janeiro conta como apitado',/Jogos apitados \(1\)\s*40,00/.test(t.replace(/\s+/g,' ')),t.replace(/\s+/g,' ').slice(0,200));
    ok('2026: a folha de dezembro paga em janeiro conta em 2026',/Recebido da associação \(1 folha\)\s*30,00/.test(t.replace(/\s+/g,' ')));
    await pg.click('[data-ano="2025"]');
    await pg.waitForSelector('[data-ano="2025"].on');
    t=(await pg.textContent('#cAno')).replace(/\s+/g,' ');
    ok('2025: só o jogo de dezembro',/Jogos apitados \(1\)\s*30,00/.test(t),t.slice(0,200));
    ok('2025: nada recebido nesse ano',/Recebido da associação \(0 folhas\)\s*0,00/.test(t));
    const [dl]=await Promise.all([pg.waitForEvent('download',{timeout:8000}),pg.click('#anoCsv')]);
    const csv=await (await dl.createReadStream()).toArray().then(b=>Buffer.concat(b).toString('utf8'));
    ok('o CSV do ano tem o jogo e os totais',/2025-12-10/.test(csv)&&/Total jogos apitados/.test(csv)&&!/2026-01-10/.test(csv));
    ok('e o nome do ficheiro diz o ano',/^ano_2025_/.test(dl.suggestedFilename()),dl.suggestedFilename());
  }

  console.log('\n── Aveiro: nomeado sozinho ("A TD Sub/15 Feminina") ──');
  {
    await garanteEquipa(pg);
    // um jogo anterior com dois colegas: é o trio que a app NÃO pode copiar
    await semeia(pg,{jogos:[{data:'2026-05-01',hora:'10:00',tipo:'Distrital',escalao:'sub 14 IN',equipaA:'X',equipaB:'Y',
      estado:'realizado',atribuicoes:[{membroId:0,funcao:'A',valor:23},{membroId:1,funcao:'AA',valor:18.5}]}]});
    await vaiPara(pg,'jogos');
    await pg.evaluate(()=>formConv('1873700090 A TD Sub/15 Feminina#UD Fermedo*C ALBERGARIA#CAMPO RESUMIL<FERMEDO>17/05/2026 11:00'));
    await pg.click('#cvGo');
    await pg.waitForSelector('#fSave');
    const linhas=await pg.$$eval('#dlg .atr',as=>as.map(a=>a.innerText.trim().split('·')[0].trim()));
    ok('fica só uma linha, a minha, como A (sem copiar o trio do último jogo)',linhas.join(',')==='A',JSON.stringify(linhas));
    ok('e o aviso explica porquê',/só te nomeia a ti/.test(await pg.textContent('#toast')),await pg.textContent('#toast'));
    await pg.click('#fCancel');
  }

  ok('sem erros de JavaScript',erros.length===0,erros[0]);
  await ctx.close();
}catch(e){
  falhou++; console.log('  ❌ exceção na suíte: '+(e&&e.stack||e));
}finally{
  await browser.close();
}
console.log(`\n  ${passou} passaram, ${falhou} falharam`);
process.exit(falhou?1:0);
