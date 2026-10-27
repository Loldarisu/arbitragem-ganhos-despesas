// Gera as imagens do README. Os dados são inventados de propósito: o
// repositório é público e não faz sentido expor nomes e ganhos reais da equipa.
import { chromium } from 'playwright';
import { arranca } from './comum.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const RAIZ=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DESTINO=path.join(RAIZ,'docs','capturas');
fs.mkdirSync(DESTINO,{recursive:true});
const B=process.env.APP_URL||'http://localhost:8099/index.html';

const SEMENTE=()=>{
  const hoje=new Date();
  const dia=n=>{const d=new Date(hoje.getTime()+n*86400000);return d.toISOString().slice(0,10);};
  // a época acompanha a data de hoje, para as capturas não ficarem incoerentes
  const anoEp=hoje.getMonth()>=7?hoje.getFullYear():hoje.getFullYear()-1;
  epAtiva().anoInicio=anoEp;
  epAtiva().nome=`${anoEp}/${String(anoEp+1).slice(2)}`;
  S.settings.equipa="Árbitros do Vale";        // inventado, como o resto
  S.membros=[{id:"m1",nome:"J. Almeida"},{id:"m2",nome:"M. Sousa"},{id:"m3",nome:"R. Pinto"},
             {id:"m4",nome:"C. Lima"},{id:"m5",nome:"T. Faria"}];
  S.settings.membroEuId="m1";
  // Combinações que existem na tabela de valores, para as capturas não
  // mostrarem avisos de tarifa em falta.
  const jogos=[
    {d:dia(3), h:"15:00", esc:"Sub 17",      tipo:"Nacional", a:"CD Vale Novo", b:"AD Pinheiro",   est:"agendado",  km:"84", conf:false,horas:false,loc:"Campo da Bouça"},
    {d:dia(6), h:"11:00", esc:"2ª divisão",  tipo:"Distrital",a:"GD Ribeira",   b:"SC Alvorada",   est:"agendado",  km:"",   conf:true, horas:false,loc:"Parque Municipal"},
    {d:dia(-4),h:"16:00", esc:"sub 16 JUV",  tipo:"Distrital",a:"UD Carvalhal", b:"CF Monte Claro",est:"realizado", km:"",   conf:true, horas:true, loc:"Campo do Souto"},
    {d:dia(-11),h:"10:30",esc:"Sub 19",      tipo:"Nacional", a:"AC Lagoa",     b:"SR Fontinha",   est:"pago",      km:"120",conf:true, horas:true, loc:"Estádio da Várzea"},
    {d:dia(-18),h:"15:30",esc:"1ª divisão",  tipo:"Distrital",a:"GDC Alves",    b:"CD Vale Novo",  est:"pago",      km:"",   conf:true, horas:true, loc:"Campo da Bouça"},
    {d:dia(-25),h:"10:00",esc:"sub 14 IN",   tipo:"Distrital",a:"SC Alvorada",  b:"UD Carvalhal",  est:"pago",      km:"",   conf:true, horas:true, loc:"Parque Municipal"}
  ];
  S.jogos=jogos.map((j,i)=>({
    id:"cap"+i,epocaId:epAtiva().id,criadoEm:Date.now(),data:j.d,hora:j.h,escalao:j.esc,
    equipaA:j.a,equipaB:j.b,local:j.loc,tipo:j.tipo,estado:j.est,valorRecebido:"",dataPagamento:"",
    confirmada:j.conf,horasMarcadas:j.horas,
    atribuicoes:j.tipo==="Nacional"
      ? [{membroId:"m1",funcao:"AA",almocoId:"a2",km:j.km,override:""},
         {membroId:"m2",funcao:"AA",almocoId:"a2",km:j.km,override:""}]
      : [{membroId:"m1",funcao:"A", almocoId:"a1",km:"",deslocFixa:"1",override:""},
         {membroId:"m2",funcao:"AA",almocoId:"a1",km:"",deslocFixa:"1",override:""}]
  }));
  S.distancias=[{id:"ck1",membroId:"m1",local:"Campo da Bouça",km:84},{id:"ck2",membroId:"m1",local:"Estádio da Várzea",km:120}];
  S.despesas=[{id:"cd1",epocaId:epAtiva().id,membroId:"m1",data:dia(-20),categoria:"Equipamento",descricao:"Meias de jogo",valor:18,tipoLanc:"despesa"},
              {id:"cd2",epocaId:epAtiva().id,membroId:"m1",data:dia(-9),categoria:"Formação",descricao:"Ação de arbitragem",valor:25,tipoLanc:"despesa"}];
  S.multas=[{id:"cm1",epocaId:epAtiva().id,membroId:"m3",data:dia(-21),artigoId:"art3",descricao:"",valor:2,pago:true,dataPagamento:dia(-19)},
            {id:"cm2",epocaId:epAtiva().id,membroId:"m2",data:dia(-14),artigoId:"art6",descricao:"7 minutos",valor:14,pago:true,dataPagamento:dia(-13)},
            {id:"cm3",epocaId:epAtiva().id,membroId:"m4",data:dia(-3),artigoId:"art10",descricao:"",valor:5,pago:false}];
  S.fundo=[{id:"cf1",epocaId:epAtiva().id,data:dia(-7),descricao:"Convívio de meio da época",valor:9}];
  S.pagamentos=[];
  S.settings.ultimoBackup=Date.now();   // sem o aviso de cópia em falta nas capturas
  save0();
};

const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:400,height:880},deviceScaleFactor:2,colorScheme:'dark'});
const pg=await ctx.newPage();
await pg.goto(B);
await arranca(pg);
await pg.evaluate(SEMENTE);
await pg.evaluate(()=>render());

for(const [tab,ficheiro] of [["jogos","jogos"],["resumo","resumo"],["multas","multas"]]){
  await pg.click(`.tabbar button[data-tab="${tab}"]`);
  await pg.waitForTimeout(400);
  const caminho=path.join(DESTINO,ficheiro+'.png');
  await pg.screenshot({path:caminho});
  console.log('gravado',path.relative(RAIZ,caminho));
}
await browser.close();
