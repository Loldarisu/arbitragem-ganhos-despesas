# Arbitragem — Ganhos & Despesas (PWA)

App para substituir a folha de Excel de gestão de jogos, ganhos e despesas de arbitragem. Funciona 100% offline; os dados ficam guardados no próprio dispositivo (localStorage).

## Ficheiros

- `index.html` — a app completa (podes abri-la já no browser do PC para experimentar)
- `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png` — ficheiros PWA (instalação no Android + cache offline)

## O que já vem configurado

- Tabela de valores importada do teu Excel (22 tarifas Distrital/Nacional)
- Almoços: Distrital 7,50 € · Nacional 17,50 € · Nacional +100km 35,00 €
- Membros: Bruno, Pedro, Ânia, Gabriel, Tiago
- **Valor por km: 0,36 €/km (valor por defeito — confirma e ajusta em Definições)**
- Época 2025/26 (Set–Jun)

Tudo é editável em **Definições** (tarifas, almoços, €/km, membros, época).

## Como instalar no Android

Para instalar como app é preciso pôr os ficheiros online (HTTPS). O mais simples:

1. Vai a **app.netlify.com/drop** (grátis, sem código) e arrasta esta pasta — recebes um link tipo `https://xxxx.netlify.app`. Alternativa: GitHub Pages.
2. Abre esse link no Chrome do telemóvel.
3. Menu ⋮ → **"Instalar aplicação"** (ou "Adicionar ao ecrã principal").
4. A partir daí funciona offline como app normal.

## Sincronização automática na cloud (Supabase — grátis, recomendado)

Com isto configurado, os telemóveis da equipa sincronizam sozinhos (ao abrir a app, após cada alteração e quando a rede volta). Funciona offline na mesma — sincroniza quando houver ligação. Configuração única, feita por uma pessoa:

1. Vai a **supabase.com** → "Start your project" → cria conta grátis (com Google/GitHub). Cria um projeto (nome: elite-referees; região: West EU; guarda a password da base de dados, não vais precisar dela na app).
2. No menu lateral: **SQL Editor** → New query → cola o conteúdo do ficheiro `supabase-setup.sql` desta pasta → **Run**.
3. **Authentication → Users → Add user**: cria **dois** utilizadores (marca "Auto Confirm User" em ambos): o do **chefe** (ex: `chefe@equipa.pt` — o único que pode editar; tem de ser o mesmo email que puseste no script SQL) e o da **equipa** (ex: `equipa@equipa.pt` — só consegue consultar; partilham esta password entre os restantes).
4. **Authentication → Sign In / Up**: desativa "Allow new users to sign up" (para mais ninguém poder registar-se).
5. **Project Settings → API**: copia o **Project URL** e a chave **anon public**.
6. Ao abrir a app pela primeira vez aparece o **ecrã de login**: cada um entra com o email/password (o chefe com o dele, os outros com o da equipa). A app deteta sozinha quem pode editar (✏️) e quem só consulta (👀). A sessão fica guardada — só pede login uma vez por dispositivo, e depois funciona offline.

**Dica:** para o login pedir só email+password (sem URL/chave), edita o `index.html` e preenche o `SB_CONFIG` no topo do script com o URL e a chave anon do projeto, antes de arrastares a pasta para o Netlify. Também podes "Terminar sessão" em Definições.

Em conflitos (dois a editar o mesmo), ganha a edição mais recente; eliminações propagam-se. O plano grátis do Supabase chega de sobra para a equipa. O Backup JSON continua a ser boa prática.

## Sincronizar entre telemóveis (sem cloud)

Cada telemóvel guarda os seus dados. Para juntar tudo (ex: cada um regista os seus jogos e no fim do mês juntam):

1. No telemóvel A: **Resumo → Partilhar backup 📤** → envia por WhatsApp/email.
2. No telemóvel B: descarrega o ficheiro → **Resumo → Fundir backup (juntar dados)**.
3. A fusão junta jogos/despesas/tarifas de ambos **sem apagar nada**; se o mesmo registo foi editado nos dois, ganha a edição mais recente; registos apagados num telemóvel são também removidos no outro.
4. Para ficarem os dois iguais, repete no sentido inverso (ou o B partilha o resultado fundido de volta).

**Fundir** = juntar (seguro). **Restaurar** = substituir tudo (usa só para recuperar um backup).

## Funcionalidades

- Registo de jogos com várias pessoas por jogo (função, almoço, km) e cálculo automático via tabela de valores; aviso quando a combinação não existe; valor manual (override) com registo do cálculo original
- **📋 Colar convocatória**: cola a mensagem da nomeação (formato `nºjogo INI#CD 1 Div Sub/15#Equipa A*Equipa B#CAMPO...data hora AA1-... AA2-...`) e a app extrai data, hora, escalão, equipas, campo e funções. O principal não vem na mensagem, por isso em cada colagem escolhes **quem recebeu a mensagem** (pré-selecionado com o "Eu sou" das Definições). Nomes tipo "A Gomes"/"X.Bastos" são reconhecidos por inicial+apelido ou pelo alias do membro (a app **aprende** quando confirmas); árbitros que não são da equipa ficam "(fora da equipa)" e são ignorados ao guardar
- **Deslocações por tipo de jogo** (Definições): Distrital = valor fixo por jogo (15 €), Nacional = por km (0,36 €/km) — editável e copiado para a época seguinte
- **⚖️ Multas & Fundo da equipa**: separador com o Regime Disciplinar do regulamento (22 artigos pré-carregados com valores), multas por minuto/clique (Art. 6 e 11), **duplicação automática à 3ª reincidência (Art. 19)**, estado pendente/paga com aviso "em atraso" após 7 dias, e saldo do fundo (multas pagas revertem para convívios — Cap. VII)
- **Pagamentos mensais**: como a associação paga ao fim do mês, o Resumo tem "Pagamentos da associação (por mês)" — cada mês mostra o valor calculado a receber (⏳); ao carregar em "Pago" registas o valor realmente recebido e a data, a app mostra a diferença face ao calculado e marca os jogos do mês como pagos (reversível)
- **Filtro por pessoa**: chips com os nomes em Jogos, Despesas e Resumo para ver só os registos de cada um
- Autocomplete de equipas e escalões com base no histórico; duplicar jogo; estados agendado/realizado/pago/cancelado (cancelados não contam nos totais)
- **Várias épocas**: em Definições podes criar a época seguinte (copia as tarifas da atual) e alternar entre épocas sem perder histórico; cada época tem a sua tabela de valores e €/km
- Despesas e receitas extra por pessoa/categoria
- Resumo por mês/época: totais por pessoa (bruto e líquido), gráfico mensal, jogos por escalão
- Exportação CSV (abre no Excel) e backup/restauro JSON

## Backup — importante

Os dados vivem no browser do dispositivo. Faz **Backup JSON** regularmente (Resumo → Exportar), sobretudo antes de limpar dados do browser.
