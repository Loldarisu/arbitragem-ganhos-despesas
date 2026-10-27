// Testes do motor (engine.js) em Node, sem browser: correm em milissegundos e
// cobrem a aritmética e o texto, que é onde um erro passa despercebido.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ctx=vm.createContext({console,TextEncoder,Intl,Date,Math,JSON,RegExp,String,Number,Array,Object,parseFloat,parseInt,isNaN,Set});
vm.runInContext(fs.readFileSync(path.join(RAIZ,'engine.js'),'utf8'),ctx);
const E=n=>vm.runInContext(n,ctx);

test('esc fecha as saídas para HTML', () => {
  assert.equal(E('esc')('<img src=x onerror="x">'),'&lt;img src=x onerror=&quot;x&quot;&gt;');
  assert.equal(E('esc')(null),'');
});

test('fmt formata em euros à portuguesa', () => {
  assert.match(E('fmt')(1234.5),/1\s?234,50/);
  assert.equal(E('fmt')(undefined),E('fmt')(0));
});

test('fmtD e diaSem', () => {
  assert.equal(E('fmtD')('2025-09-20'),'20/09/2025');
  assert.equal(E('diaSem')('2025-09-20'),'Sáb');
});

test('normLocal ignora maiúsculas, acentos e espaços a mais', () => {
  const n=E('normLocal');
  assert.equal(n('  CAMPO DA JUNTA '),n('Campo da Junta'));
  assert.equal(n('Estádio  da   Várzea'),n('estadio da varzea'));
  assert.equal(n(''),'');
});

test('papelAtr numera os assistentes por ordem', () => {
  const p=E('papelAtr');
  const atrs=[{funcao:'A'},{funcao:'AA'},{funcao:'AA'}];
  assert.deepEqual([p(atrs,0),p(atrs,1),p(atrs,2)],['A','AA1','AA2']);
  const dois=[{funcao:'1 arb'},{funcao:'2 arb'}];
  assert.deepEqual([p(dois,0),p(dois,1)],['A1','A2']);
});

test('vespera20 dá sempre as 20h do dia anterior', () => {
  const v=E('vespera20')({data:'2025-09-20',hora:'15:00'});
  assert.equal(v.getDate(),19);
  assert.equal(v.getHours(),20);
  assert.equal(v.getMinutes(),0);
  assert.equal(E('vespera20')({data:'lixo',hora:''}),null);
});

test('icsEsc escapa o que a RFC 5545 manda', () => {
  assert.equal(E('icsEsc')('a,b;c\\d\ne'),String.raw`a\,b\;c\\d\n`+'e');
});

test('icsDobra parte linhas longas a 75 octetos', () => {
  const l=E('icsDobra')('SUMMARY:'+'á'.repeat(120));
  for(const parte of l.split('\r\n')) assert.ok(new TextEncoder().encode(parte).length<=75,'linha com '+parte.length);
  assert.equal(l.replace(/\r\n /g,''),'SUMMARY:'+'á'.repeat(120));
});

test('mergeState junta registos dos dois lados', () => {
  const base=n=>({settings:{epocaAtivaId:'e1'},epocas:[{id:'e1'}],jogos:[],despesas:[],multas:[],
    pagamentos:[],artigos:[],tabela:[],almocos:[],membros:[],distancias:[],fundo:[],categorias:[],tombs:[],...n});
  const a=base({jogos:[{id:'j1',equipaA:'A',up:10}]});
  const b=base({jogos:[{id:'j2',equipaA:'B',up:20}]});
  const r=E('mergeState')(a,b);
  assert.deepEqual([...r.jogos.map(j=>j.id)].sort(),['j1','j2']);
});

test('mergeState resolve conflitos pela edição mais recente', () => {
  const base=n=>({settings:{epocaAtivaId:'e1'},epocas:[{id:'e1'}],jogos:[],despesas:[],multas:[],
    pagamentos:[],artigos:[],tabela:[],almocos:[],membros:[],distancias:[],fundo:[],categorias:[],tombs:[],...n});
  const antigo=base({jogos:[{id:'j1',equipaA:'antigo',up:10}]});
  const novo=base({jogos:[{id:'j1',equipaA:'novo',up:99}]});
  assert.equal(E('mergeState')(antigo,novo).jogos[0].equipaA,'novo');
  assert.equal(E('mergeState')(novo,antigo).jogos[0].equipaA,'novo','a ordem dos argumentos não pode mandar');
});

test('mergeState respeita as lápides, e uma edição posterior ressuscita', () => {
  const base=n=>({settings:{epocaAtivaId:'e1'},epocas:[{id:'e1'}],jogos:[],despesas:[],multas:[],
    pagamentos:[],artigos:[],tabela:[],almocos:[],membros:[],distancias:[],fundo:[],categorias:[],tombs:[],...n});
  const apagou=base({tombs:[{col:'jogos',id:'j1',t:50}]});
  const tem=base({jogos:[{id:'j1',up:10}]});
  assert.equal(E('mergeState')(apagou,tem).jogos.length,0,'apagado depois de editado fica apagado');
  const reposto=base({jogos:[{id:'j1',up:80}]});
  assert.equal(E('mergeState')(apagou,reposto).jogos.length,1,'editado depois de apagado volta');
});

test('parseConv lê o formato das convocatórias', () => {
  const p=E('parseConv')("1128030020 INI#CD 1 Div Sub/15#UD Fermedo*UD Mourisquense#CAMPO DA JUNTA 20/09/2025 15:00 AA1-A Nunes AA2-X Brito",['Sub 15']);
  assert.equal(p.equipaA,'UD Fermedo');
  assert.equal(p.equipaB,'UD Mourisquense');
  assert.equal(p.data,'2025-09-20');
  assert.equal(p.hora,'15:00');
  assert.equal(p.escalao,'Sub 15');
  assert.equal(p.numJogo,'1128030020');
  assert.deepEqual([...p.nomeacoes].map(n=>n.papel),['AA1','AA2']);
});

test('parseConvLivre apanha uma mensagem escrita à mão', () => {
  const p=E('parseConvLivre')("sábado 20/09/2025 às 15:00 — UD Fermedo vs UD Mourisquense, Sub/15, AA1-A Nunes",['Sub 15']);
  assert.equal(p.equipaA,'UD Fermedo');
  assert.equal(p.equipaB,'UD Mourisquense');
  assert.equal(p.data,'2025-09-20');
  assert.equal(p.hora,'15:00');
});

test('parseConvLivre não inventa equipas a partir de horas nem de códigos de função', () => {
  assert.equal(E('parseConvLivre')("bom dia, alguém disponível?",[]),null);
  const p=E('parseConvLivre')("15:00 - 16:00 reunião",[]);
  assert.equal(p,null,'"15:00 - 16:00" não são equipas');
});

test('matchMembro reconhece inicial e apelido, e o alias aprendido', () => {
  const membros=[{id:'m1',nome:'Ânia Nunes'},{id:'m2',nome:'Xavier Brito'},{id:'m3',nome:'Bruno Mota'}];
  const m=E('matchMembro');
  assert.equal(m('A Nunes',membros).id,'m1');
  assert.equal(m('X.Brito',membros).id,'m2');
  assert.equal(m('Mota',membros).id,'m3');
  assert.equal(m('Fulano Desconhecido',membros),null);
});

test('temRecebido distingue vazio de zero', () => {
  const t=E('temRecebido');
  assert.equal(t({valorRecebido:''}),false);
  assert.equal(t({}),false);
  assert.equal(t({valorRecebido:0}),true);
});

test('num aceita a vírgula decimal portuguesa', () => {
  const n=E('num');
  assert.equal(n('12,50'),12.5);
  assert.equal(n('12.50'),12.5);
  assert.equal(n(' 12,50 € '),12.5);
  assert.equal(n('0,36'),0.36);
  assert.equal(n(84),84);
  assert.equal(n('-3,5'),-3.5);
});

test('num recusa o que não é número, em vez de inventar um', () => {
  const n=E('num');
  for(const lixo of ['','abc','12,5,0','--3','.',' ','12€50'])
    assert.ok(Number.isNaN(n(lixo)),`"${lixo}" devia dar NaN, deu ${n(lixo)}`);
  assert.ok(Number.isNaN(n(null)));
  assert.ok(Number.isNaN(n(undefined)));
});

test('num0 dá zero onde num daria NaN', () => {
  assert.equal(E('num0')('abc'),0);
  assert.equal(E('num0')(''),0);
  assert.equal(E('num0')('7,25'),7.25);
});

test('numTxt devolve o valor com vírgula para dentro do campo', () => {
  const t=E('numTxt');
  assert.equal(t(12.5),'12,5');
  assert.equal(t('12.50'),'12,50');
  assert.equal(t(''),'');
  assert.equal(t(null),'');
  assert.equal(t(0),'0');
});

test('funcaoNoEscalao troca entre os dois vocabulários da tabela', () => {
  const f=E('funcaoNoEscalao');
  // escalão com trio: A/AA ficam como estão
  assert.equal(f('AA',['A','AA']),'AA');
  assert.equal(f('A',['A','AA']),'A');
  // escalão com dois árbitros: a equivalente
  assert.equal(f('AA',['1 arb','2 arb']),'2 arb');
  assert.equal(f('A',['1 arb','2 arb']),'1 arb');
  // e de volta
  assert.equal(f('2 arb',['A','AA']),'AA');
  assert.equal(f('1 arb',['A','AA']),'A');
  // só existe uma: não inventa
  assert.equal(f('A',['AA']),'A');
  // sem informação nenhuma, não mexe
  assert.equal(f('AA',[]),'AA');
  assert.equal(f('AA',null),'AA');
});

test('funcaoDoMembro traduz a função habitual para a tabela', () => {
  const f=E('funcaoDoMembro');
  assert.equal(f({funcao:'arbitro'}),'A');
  assert.equal(f({funcao:'AA1'}),'AA');
  assert.equal(f({funcao:'AA2'}),'AA');
  assert.equal(f({funcao:'outro'}),'AA');
  assert.equal(f(null),'AA');            // sem membro, o caso mais comum
});


/* As duas mensagens reais do Pedro. Estão aqui tal e qual como chegam ao
   telemóvel: se a associação mudar o formato, é aqui que se vê primeiro. */
const ESC=[
  {tipo:'Distrital',escalao:'sub 10 BEM'},{tipo:'Distrital',escalao:'sub 12 INF'},
  {tipo:'Distrital',escalao:'sub 14 IN'},{tipo:'Distrital',escalao:'sub 16 JUV'},
  {tipo:'Distrital',escalao:'Sub 19 JUN'},{tipo:'Distrital',escalao:'1ª divisão'},
  {tipo:'Nacional',escalao:'Sub 15'},{tipo:'Nacional',escalao:'Sub 17'},{tipo:'Nacional',escalao:'Sub 19'}];

/* Seniores do Distrital: a sigla SEN não é um escalão da tabela — o valor vem
   da divisão, que chega como "CD 1" (Campeonato Distrital da 1.ª divisão).
   Mensagem real de 27/09/2026, com os nomes e telefones dos árbitros trocados
   por inventados. */
test('convocatória de seniores: SEN + "CD 1" é a 1.ª divisão', () => {
  const p=E('parseConv')(
    "2322 100010060 AA1 SEN#CD 1#C.D.Gouveia -SAD*SCMeda#EM FARVAO<GOUVEIA>27/09/2026 15:15 A-J Silva900000001 AA2-M Costa900000002",ESC);
  assert.equal(p.tipo,'Distrital');
  assert.equal(p.escalao,'1ª divisão');
  assert.equal(p.equipaA,'C.D.Gouveia -SAD');
  assert.equal(p.equipaB,'SCMeda');
  assert.equal(p.data,'2026-09-27');
  assert.equal(p.hora,'15:15');
  assert.equal(p.meuPapel,'AA1');
  assert.equal(p.local,'EM FARVAO (GOUVEIA)');
  assert.deepEqual([...p.nomeacoes].map(n=>n.papel+':'+n.nome),['A:J Silva','AA2:M Costa']);
});
test('seniores: "CD 2" é a 2.ª divisão e "Taça" é a taça de honra', () => {
  const esc=[{tipo:'Distrital',escalao:'1ª divisão'},{tipo:'Distrital',escalao:'2ª divisão'},{tipo:'Distrital',escalao:'taça de honra'}];
  const r=cab=>E('parseConv')(`2322 100010061 AA2 ${cab}#Clube A*Clube B#CAMPO<TERRA>04/10/2026 15:00`,esc).escalao;
  assert.equal(r('SEN#CD 2'),'2ª divisão');
  assert.equal(r('SEN#CD 1 Div'),'1ª divisão');
  assert.equal(r('SEN#Taça de Honra'),'taça de honra');
  assert.equal(r('SEN#Liga X'),'SEN');          // sem divisão reconhecível: diz o que leu
});
/* Distrito de Aveiro (Elite Referees): outro formato e outra tabela de valores.
   Mensagens reais de 2026, com nomes e telefones dos árbitros inventados. */
const ELITE=['1ª divisão','2ª divisão','Sabseg','sub 12 INF','Sub 13','sub 14 IN','sub 17 JUV',
  'Sub 19 JUN','sub 23/vet','Taça Lanidor','taça pecol'].map(e=>({tipo:'Distrital',escalao:e}));
const aveiro=cab=>E('parseConv')(`1115000070 ${cab}#FC Arouca*SC Fermentelos#CAMPO DAS RELVAS-MAN<mansores>12/09/2026 11:00 AA1-A Nunes900000001 AA2-X Brito900000002`,ELITE);
test('Aveiro: JUN, JUV, INI e VET encontram o escalão da tabela da equipa', () => {
  assert.equal(aveiro('JUN#CD Honra Sub/19').escalao,'Sub 19 JUN');
  assert.equal(aveiro('JUV#CD 1 Div Sub/17').escalao,'sub 17 JUV');
  assert.equal(aveiro('INI#CD 1 Div Sub/15').escalao,'sub 14 IN');   // iniciados, apesar do "15"
  assert.equal(aveiro('VET#Liga Masters').escalao,'sub 23/vet');     // "vet" dentro de "sub 23/vet"
  assert.equal(aveiro('INF#CD 1 Div Sub/13').escalao,'sub 12 INF');
});
test('Aveiro: o resto da mensagem lê-se como antes', () => {
  const p=aveiro('JUN#CD Honra Sub/19');
  assert.equal(p.equipaA,'FC Arouca'); assert.equal(p.equipaB,'SC Fermentelos');
  assert.equal(p.data,'2026-09-12'); assert.equal(p.hora,'11:00');
  assert.equal(p.local,'CAMPO DAS RELVAS-MAN (mansores)');
  assert.deepEqual([...p.nomeacoes].map(n=>n.papel+':'+n.nome),['AA1:A Nunes','AA2:X Brito']);
});
test('nome próprio do escalão ganha: Sabseg, Pecol, Lanidor', () => {
  assert.equal(aveiro('SEN#Sabseg').escalao,'Sabseg');
  assert.equal(aveiro('SEN#Taça Pecol').escalao,'taça pecol');
  assert.equal(aveiro('INF#Taça Lanidor Sub/13').escalao,'Taça Lanidor');   // a taça paga diferente
});
test('feminino: só se a tabela tiver o escalão; senão diz o que leu, sem inventar', () => {
  assert.equal(aveiro('SEN#TD Feminina').escalao,'SEN');
  assert.equal(E('parseConv')('1873700090 A TD Sub/15 Feminina#UD Fermedo*C ALBERGARIA#CAMPO RESUMIL<FERMEDO>17/05/2026 11:00',ELITE).escalao,'Sub 15');
  const comFem=ELITE.concat([{tipo:'Distrital',escalao:'Feminino'},{tipo:'Distrital',escalao:'Sub 15 Feminino'}]);
  assert.equal(E('parseConv')('1812680020 SEN#TD Feminina#CD Feirense*C ALBERGARIA#X<Y>16/05/2026 15:30',comFem).escalao,'Feminino');
  const p=E('parseConv')('1873700090 A TD Sub/15 Feminina#UD Fermedo*C ALBERGARIA#CAMPO RESUMIL<FERMEDO>17/05/2026 11:00',comFem);
  assert.equal(p.escalao,'Sub 15 Feminino');
  assert.equal(p.meuPapel,'A');
  assert.equal(p.nomeacoes.length,0);
});
test('formação com número que a tabela não tem não vai parar aos seniores', () => {
  const esc=[{tipo:'Distrital',escalao:'1ª divisão'},{tipo:'Distrital',escalao:'Sub 13'}];
  assert.equal(E('parseConv')('1 X#CD 1 Div Sub/15#A*B#C<D>01/01/2026 10:00',esc).escalao,'Sub 15');
});
test('"INI … CD 1 Div Sub/15" são os iniciados, não a 1.ª divisão dos seniores', () => {
  const p=E('parseConv')("1128030020 INI#CD 1 Div Sub/15#UD Fermedo*UD Mourisquense#CAMPO DA JUNTA 20/09/2025 15:00 AA1-A Nunes AA2-X Brito",ESC);
  assert.equal(p.escalao,'sub 14 IN');
});

test('convocatória do Nacional (três campos, sem nomes)', () => {
  const p=E('parseConv')(
    "5549 341020170 CN S17 II DIV#CD Tondela*UD Oliveirense#Campo Corte<CAMPO BESTEIROS>19/09/2026 11:00",ESC);
  assert.equal(p.tipo,'Nacional');
  assert.equal(p.escalao,'Sub 17');            // e não um escalão do Distrital com 17
  assert.equal(p.equipaA,'CD Tondela');
  assert.equal(p.equipaB,'UD Oliveirense');
  assert.equal(p.data,'2026-09-19');
  assert.equal(p.hora,'11:00');
  assert.equal(p.numJogo,'341020170');         // o 5549 da frente não é o jogo
  assert.equal(p.numArbitro,'5549');           // é o número de árbitro de quem recebeu
  assert.equal(p.local,'Campo Corte (CAMPO BESTEIROS)');
  assert.equal(p.nomeacoes.length,0);          // o Nacional não traz nomes
});

test('convocatória do Distrital da Guarda (quatro campos, com nomes)', () => {
  const p=E('parseConv')(
    "2322 114010120 AA2 JUV#CD JUV#Guarda Unid.*V.Formoso#CAMPO ZAMBITO<GUARDA>15/02/2026 10:00 A-B Lima900000011 AA1-T ROSA900000012",ESC);
  assert.equal(p.tipo,'Distrital');
  assert.equal(p.escalao,'sub 16 JUV');
  assert.equal(p.equipaA,'Guarda Unid.');
  assert.equal(p.equipaB,'V.Formoso');
  assert.equal(p.data,'2026-02-15');
  assert.equal(p.hora,'10:00');
  assert.equal(p.numJogo,'114010120');
  assert.equal(p.numArbitro,'2322');
  assert.equal(p.local,'CAMPO ZAMBITO (GUARDA)');
  assert.equal(p.meuPapel,'AA2');              // a minha função vem no cabeçalho
  assert.equal(JSON.stringify(p.nomeacoes),
    JSON.stringify([{papel:'A',nome:'B Lima'},{papel:'AA1',nome:'T ROSA'}]));
});

test('os números de telefone dos colegas não ficam guardados', () => {
  const p=E('parseConv')(
    "2322 114010120 AA2 JUV#CD JUV#Guarda Unid.*V.Formoso#CAMPO ZAMBITO<GUARDA>15/02/2026 10:00 A-B Lima900000011 AA1-T ROSA900000012",ESC);
  assert.equal(JSON.stringify(p).includes('900000011'),false);
  assert.equal(JSON.stringify(p).includes('900000012'),false);
});

test('o campo e a localidade ficam os dois, para os km não se baralharem', () => {
  const f=E('localDaConv');
  assert.equal(f('CAMPO ZAMBITO<GUARDA>'),'CAMPO ZAMBITO (GUARDA)');
  assert.equal(f('Campo Corte<CAMPO BESTEIROS>'),'Campo Corte (CAMPO BESTEIROS)');
  assert.equal(f('GUARDA<GUARDA>'),'GUARDA');        // não repete
  assert.equal(f('CAMPO DA JUNTA'),'CAMPO DA JUNTA'); // sem < > continua a dar
});

test('uma mensagem que não é convocatória continua a não passar', () => {
  assert.equal(E('parseConv')("bom dia, alguém disponível?",ESC),null);
  assert.equal(E('parseConv')("olá#tudo bem?#sim",ESC),null);   // tem # mas não tem clubes
});


test('não confunde o número de árbitro com o número do jogo', () => {
  // São duas coisas diferentes no princípio da mensagem, e trocá-las mandaria o
  // número errado para o jogo. O do jogo tem 8+ dígitos; o de árbitro, 3 a 5.
  const p=E('parseConv')(
    "5549 341020170 CN S17 II DIV#CD Tondela*UD Oliveirense#Campo Corte<CAMPO BESTEIROS>19/09/2026 11:00",ESC);
  assert.notEqual(p.numJogo,'5549');
  assert.equal(p.numJogo.length>=8,true);
  assert.equal(p.numArbitro.length<=5,true);
});

test('indiceChefe encontra o árbitro principal da equipa', () => {
  const f=E('indiceChefe');
  assert.equal(f([{membroId:'a',funcao:'AA'},{membroId:'b',funcao:'A'},{membroId:'c',funcao:'AA'}]),1);
  assert.equal(f([{membroId:'a',funcao:'2 arb'},{membroId:'b',funcao:'1 arb'}]),1);
  // o principal é de fora da equipa: ninguém da equipa leva o transporte
  assert.equal(f([{membroId:'',funcao:'A'},{membroId:'b',funcao:'AA'}]),-1);
  assert.equal(f([]),-1);
  assert.equal(f(undefined),-1);
});
