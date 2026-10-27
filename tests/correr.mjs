// Corre todas as suítes: levanta os servidores precisos, executa cada ficheiro
// e resume no fim. É isto que o `npm test` e o GitHub Actions usam.
import { spawn } from 'node:child_process';
import { serve } from './servidor.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
/* A suíte sync.mjs desapareceu com o que testava: a fusão de estados inteiros
   entre telemóveis. O que a substitui é a contas.mjs (permissões, gravação com
   resposta esperada) e as provas SQL contra PostgreSQL. */
const SUITES=['contas.mjs','smoke.mjs','calendario.mjs','interface.mjs','produto.mjs','offline.mjs','pedidos.mjs','fase3.mjs','fase4.mjs'];

const correr=f=>new Promise(res=>{
  const p=spawn(process.execPath,[path.join(RAIZ,'tests',f)],{stdio:'inherit',cwd:RAIZ});
  p.on('close',c=>res(c===0));
});

const servidores=[
  await serve(RAIZ,8099),
  // segunda cópia sem config.local.js, para reproduzir um deploy feito a partir
  // do repositório (onde esse ficheiro não existe)
  await serve(RAIZ,8102,{excluir:['config.local.js']})
];
const mock=spawn(process.execPath,[path.join(RAIZ,'tests','mock-supabase.mjs'),'8123'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,600));

const resultados=[];

// Primeiro os testes de unidade do motor: correm em milissegundos e, se algo
// ali está partido, não vale a pena levantar seis browsers.
console.log('\n══════ unidade (motor) ══════');
resultados.push(['unidade.mjs',await new Promise(res=>{
  const p=spawn(process.execPath,['--test',path.join(RAIZ,'tests','unidade.mjs')],{stdio:'inherit',cwd:RAIZ});
  p.on('close',c=>res(c===0));
})]);

console.log('\n══════ avisos (regras das notificações) ══════');
resultados.push(['avisos.mjs',await new Promise(res=>{
  const p=spawn(process.execPath,['--test',path.join(RAIZ,'tests','avisos.mjs')],{stdio:'inherit',cwd:RAIZ});
  p.on('close',c=>res(c===0));
})]);

for(const f of SUITES){
  console.log('\n══════ '+f+' ══════');
  resultados.push([f,await correr(f)]);
}

mock.kill();
servidores.forEach(s=>s.close());

console.log('\n══════ resumo ══════');
for(const [f,ok] of resultados)console.log((ok?'  ✅ ':'  ❌ ')+f);
const falhou=resultados.filter(([,ok])=>!ok).length;
console.log(falhou?`\n${falhou} suíte(s) com falhas`:'\nTudo a passar');
process.exit(falhou?1:0);
