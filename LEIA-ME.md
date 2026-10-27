# Arbitragem — Ganhos & Despesas (PWA)

App para substituir a folha de Excel de gestão de jogos, ganhos, despesas e multas de uma equipa de
arbitragem. Instala-se no telemóvel, cada árbitro tem a sua conta, e a equipa vê os mesmos dados.
Funciona também sem rede: o que registares num campo sem cobertura é enviado quando a rede voltar.

## Instalar no telemóvel

A app tem de estar publicada num endereço HTTPS (GitHub Pages ou **app.netlify.com/drop**, a
arrastar a pasta `publicar`).

- **Android (Chrome):** abre o endereço → menu ⋮ → **Instalar aplicação**.
- **iPhone (Safari):** abre o endereço → Partilhar → **Adicionar ao ecrã principal**. Instalada, a
  app não perde os dados ao fim de 7 dias sem uso (regra do Safari) e pode receber avisos (iOS
  16.4 ou mais recente).

Com a app instalada no Android, carregar sem soltar no ícone mostra três atalhos: **Colar
convocatória**, **Novo jogo** e **Resumo**.

## Primeira vez: conta e equipa

1. **Criar conta** com o teu email e uma palavra-passe (se a confirmação de email estiver ligada no
   Supabase, chega um email para confirmar). A palavra-passe não fica guardada no telemóvel: a
   sessão mantém-se sozinha e só volta a pedir se expirar.
2. Depois, uma de duas:
   - **Criar equipa** — ficas **responsável** e recebes um código de convite de 6 caracteres.
     A equipa nasce com a época, as tarifas, os almoços e o regulamento de multas.
   - **Entrar com código** — escreves o código que o responsável te deu e o teu nome. Ficas **à
     espera de aprovação**: até o responsável aprovar, não vês nada da equipa. Se o nome
     corresponder a um lugar que já existe (alguém que o responsável acrescentou antes), ficas com
     o histórico desse lugar quando fores aprovado.
3. O responsável recebe um aviso ao entrar e aprova (ou recusa) em **Definições → Membros**.

O código vale 30 dias; **Gerar outro** faz um novo e invalida o anterior. Depois de 10 tentativas
com códigos errados numa hora, a conta tem de esperar.

### Quem vê o quê

| | Responsável ✏️ | Assistente 👀 |
|---|---|---|
| Jogos | todos, e regista/edita | só aqueles em que participou |
| Valores, pagamentos, distâncias | de toda a equipa | só os seus |
| Multas e fundo | vê e regista | vê as de toda a equipa |
| Despesas | só as suas | só as suas |
| Tabela de valores | vê e edita | não vê |

Estas regras vivem na base de dados: mesmo forçando um botão, o servidor recusa.

## Registar jogos

- **+** no separador Jogos abre o formulário: data, hora, tipo, escalão, equipas, campo e quem vai,
  com a função, o almoço e a deslocação de cada pessoa. O valor é calculado pela tabela de valores
  da época e fica **congelado** ao gravar — mudar a tabela depois não reescreve o passado. Dá para
  pôr um valor manual numa linha.
- **Deslocações por tipo de jogo** (Definições): Distrital = valor fixo por jogo (15 €), Nacional
  = por km (0,36 €/km). Num jogo novo, o transporte vai só para o **chefe** (árbitro principal —
  A ou 1 arb), porque é ele que leva o carro.
- **Km guardados por campo:** a primeira vez que registas um jogo num campo com km, a app guarda a
  distância para essa pessoa; da próxima vez, os km aparecem sozinhos. "CAMPO DA JUNTA" e "Campo da
  Junta" são o mesmo sítio. A lista está em **Definições → Distâncias por campo**.
- **Estados:** agendado → realizado (ou cancelado, que não conta nos totais). Um jogo que já passou
  e continua "agendado" é assinalado para confirmares.

### Convocatória: colar ou partilhar

Cola a mensagem da nomeação em **📋 Convocatória** — ou, no Android com a app instalada, carrega
sem soltar na mensagem do WhatsApp ou das SMS → **Partilhar → Arbitragem**, e a app abre com ela já
colada.

O formato habitual (`nºjogo INI#CD 1 Div Sub/15#Equipa A*Equipa B#CAMPO...data hora AA1-... AA2-...`)
é lido por inteiro: data, hora, escalão, equipas, campo e funções. O principal não vem na
mensagem, por isso escolhes quem a recebeu. Nomes como "A Nunes" ou "X.Brito" são reconhecidos por
inicial e apelido ou pelo nome que a app aprendeu da última vez. Se a mensagem vier noutro
formato, a app tenta na mesma; se não conseguir, guarda-a em **Definições → Neste telemóvel →
Convocatórias por ler**.

### Jogo de hoje

No topo de Jogos aparece o teu jogo de hoje (ou o de amanhã, se hoje não houver): a hora, quanto
falta para o apito, a tua função, botões **Abrir no Maps** e **Abrir no Waze** com o campo, e a
lista **Não esquecer** — o equipamento que o regulamento multa se faltar, conforme o escalão, com o
valor da multa ao lado. O que marcas fica guardado neste telemóvel.

## Prazos do regulamento e avisos

- **📋 A tratar antes do jogo** (separador Jogos): para os próximos 10 dias, o que falta — confirmar
  a nomeação (Art. 3) e marcar horas até às 20h da véspera (Art. 4). Quando o prazo passa, o botão
  fica vermelho com o valor da multa. Toca para marcar como tratado.
- **Avisos no telemóvel** (Definições → Avisos): uma notificação mesmo com a app fechada — ao fim
  da tarde se a nomeação não estiver confirmada, entre as 18h e as 20h da véspera se as horas não
  estiverem marcadas, e cerca de 2 horas antes do apito. Precisa de ser ligado uma vez no servidor
  pelo responsável: guia em `docs/AVISOS-PUSH.md`.
- **📅 Calendário (.ics):** cada jogo tem um botão 📅, e o Resumo exporta todos os que estás a ver.
  Cada evento leva alarmes às 20h da véspera e 2 h antes. É o alarme mais fiável: toca sem rede.

## Despesas, multas e fundo

- **Despesas e receitas** são de cada pessoa: só tu vês e lanças as tuas.
- **Gota:** escreves o valor gasto ou, em **Calcular pelos km**, os km feitos, a média do carro (L/100 km) e o preço (€/L), e a app faz a conta. O telemóvel lembra-se da opção que usas e do último preço e média; a conta fica escrita na descrição.
- **⚖️ Multas:** o Regime Disciplinar vem pré-carregado com valores; multas por minuto ou por
  clique (Art. 6 e 11); **o valor duplica à 3.ª reincidência** do mesmo artigo na época (Art. 19,
  que aparece no regulamento como regra, não como infração); pendente/paga com aviso "em atraso"
  ao fim de 7 dias.
- **Fundo da equipa:** entradas (multas pagas), saídas (gastos em convívios) e saldo.

## Resumo

- **Recebido, por receber e por jogar**, por mês e por pessoa, gráfico mensal e jogos por escalão.
  Abre sempre no mês corrente e no teu nome.
- **Pagamentos da associação:** a associação paga ao fim do mês, uma folha por competição. Em cada
  folha, **Conferir** mostra os jogos e o calculado; registas o valor que chegou e a data, e a app
  mostra a diferença.
- **Ano civil (para o IRS):** de janeiro a dezembro, em todas as épocas — jogos apitados, recebido
  da associação (pela data em que a folha foi paga) e as tuas despesas, com **CSV do ano** para
  levar a quem faz a declaração. A app não diz como declarar: junta os números.
- **🖨️ Relatório da época**, pronto a imprimir ou guardar em PDF pelo browser.
- **Exportar** (Definições → Os meus dados): CSV para o Excel e JSON com o que é teu.

## Sem rede

A app abre sem rede com os dados da última vez que houve ligação e diz de quando são. O que
registares ou apagares fica numa fila neste telemóvel; o indicador do cabeçalho mostra **⏳ N por
enviar**, e tudo é enviado por ordem quando a rede volta (ou quando tocas no indicador).

Se o servidor recusar alguma dessas alterações (por exemplo, perdeste a permissão entretanto), ela
não é repetida para sempre: aparece em **Definições → Neste telemóvel → Por enviar** com o motivo,
para a descartares.

**Terminar sessão** apaga deste telemóvel a cópia dos dados e a fila — se houver coisas por enviar,
a app avisa antes — e desliga os avisos, para quem entrar a seguir não receber os teus.

## Enganos

- Depois de apagar, aparece **Anular** durante alguns segundos.
- Depois disso, **Definições → Apagados** guarda 30 dias o que foi apagado (jogos, despesas,
  multas, pagamentos, tarifas…). **Repor** devolve o registo; um jogo volta com quem estava
  nomeado. O responsável vê os apagados da equipa; cada pessoa vê as suas despesas.

## Definições

Conta (nome, função habitual, palavra-passe), equipa, **membros e pedidos para entrar**, código de
convite, **época** (criar a seguinte copia as tarifas; dá para alternar sem perder histórico; **Apagar a época** leva tudo o que é dela e não tem volta — pede o nome escrito e não apaga a única época),
**tabela de valores**, almoços e deslocações, distâncias por campo, **avisos**, **apagados**,
aparência (claro, escuro ou como o telemóvel) e exportações.

## Atualizações da app

Quando há uma versão nova, aparece a barra **"Nova versão disponível"** com *Atualizar* e *Depois*
— a app nunca recarrega por baixo de um formulário a meio.

## Configurar o servidor (uma vez, pelo responsável)

Os passos estão no [`README.md`](README.md#configuração-do-supabase): criar o projeto no Supabase,
correr os ficheiros da pasta `sql/` por ordem, deixar o registo de contas ligado e pôr o URL e a
chave no `config.local.js`. Os avisos push têm guia próprio em
[`docs/AVISOS-PUSH.md`](docs/AVISOS-PUSH.md).
