# Testes

`npm test` corre tudo e resume no fim: levanta a app em dois servidores estáticos (8099 com o
`config.local.js`, 8102 sem ele, como num deploy a partir do repositório) e o Supabase de mentira
em 8123.

```bash
npm install && npx playwright install chromium
npm test
```

> **Windows:** o `npm test` não consegue levantar o Supabase de mentira (a verificação
> `import.meta.url === file://${argv[1]}` nunca dá verdadeiro com as barras do Windows), e as
> suítes end-to-end falham com `ECONNREFUSED 127.0.0.1:8123`. Até isso ser corrigido, levanta-o à
> parte antes do `npm test`, com um ficheiro `.mjs` que faça
> `import { criaMock } from './tests/mock-supabase.mjs'; await criaMock(8123);`.

## O que cada suíte cobre

| Suíte | Cobre |
|---|---|
| `unidade.mjs` | O `engine.js` em Node, sem browser: escapes, formatação, nomes de campo, numeração dos assistentes, o parser das convocatórias nos dois formatos e o reconhecimento de nomes. Corre primeiro — se a aritmética estiver partida, não vale a pena levantar browsers. |
| `avisos.mjs` | As regras dos avisos push (`supabase/functions/avisos-prazos/regras.js`): fuso de Lisboa com mudança de hora, as janelas do Art. 3, do Art. 4 e da saída para o jogo, e cada aviso só uma vez. |
| `contas.mjs` | Registo, confirmação de email e recuperação; criar equipa; entrar com código (código errado, pedido pendente, aprovação pela interface do responsável); o que o assistente vê e não pode fazer; despesas privadas; apagar e repor em Apagados; gravar sem rede (fica na fila, "por enviar", enviado quando a rede volta) e uma recusa do servidor que não vai para a fila; sessão expirada vs. sem rede. |
| `smoke.mjs` | Foco nos campos do formulário do jogo, Resumo sem `Canvas.roundRect`, XSS a partir de dados da base de dados, arranque sem `config.local.js`, e km memorizados por campo. |
| `calendario.mjs` | Estrutura do `.ics` (CRLF, dobragem a 75 octetos, escapes, hora flutuante), alarme das 20h da véspera e o ciclo da lista "A tratar". |
| `interface.mjs` | Diálogos da própria app em vez de `confirm()`/`prompt()`, foco e Esc, Anular, e acessibilidade (separador ativo, `aria-pressed`, gráfico com descrição, botões de 44×44, contraste). |
| `produto.mjs` | Regras de negócio: Art. 19 fora do seletor, o fundo a descer, convocatórias fora do formato e reais de ponta a ponta, valores congelados face à tabela, "Confirmar nomeação"/"Marcar horas" a sobreviver a recarregar, deslocações fixas (e por escalão), pagamentos por mês e por competição, e o relatório da época. |
| `offline.mjs` | Service worker com um ficheiro em falta, navegação offline, abrir sem rede com a cópia do telemóvel e enviar a fila quando a rede volta, abrir sem rede e sem cópia, e a barra de nova versão. |
| `pedidos.mjs` | O Resumo do responsável e o de um assistente (mês corrente, próprio nome, nome à vista), transporte só para o chefe, acrescentar valor em Definições, e a barra de nova versão a não tapar o botão +. |
| `fase3.mjs` | Manifest (partilha e atalhos), partilhar uma mensagem para a app, atalhos do ícone, cartão "Jogo de hoje" e ano civil com CSV. |
| `fase4.mjs` | Ligar e desligar avisos (com um serviço de push de mentira), o service worker a mostrar um push, e "Por enviar" em Definições e ao terminar sessão; a Gota calculada pelos km (conta, guardar, editar, lembrar a opção) e o valor direto a continuar a funcionar. |

As **políticas RLS** são provadas contra PostgreSQL pelos ficheiros `sql/02-provas.sql`,
`sql/06-provas-fase2.sql` e pelo bloco de provas no fim do `sql/07-avisos-push.sql`. O
`prova-rls.mjs` faz o mesmo contra o Supabase verdadeiro, pela API, com duas contas reais.

O `mock-supabase.mjs` repete as regras de permissões do servidor de propósito: se a app passar a
mostrar alguma coisa que o servidor a sério não lhe daria, os testes apanham isso.
