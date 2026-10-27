# Avisos no telemóvel (push) — como ligar

Os avisos chegam mesmo com a app fechada:

- **Art. 3**: entre as 19h e as 22h, se a nomeação ainda não estiver confirmada;
- **Art. 4**: entre as 18h e as 20h da véspera, se as horas não estiverem marcadas;
- **Saída**: cerca de 2 horas antes do apito, com o campo.

Cada aviso sai uma vez por jogo e por pessoa. Quem decide e envia é uma função no Supabase
(`supabase/functions/avisos-prazos`), chamada de 10 em 10 minutos. A app só pede autorização
e regista o telemóvel.

É preciso fazer isto **uma vez**, no computador, na pasta `_github`. Leva uns 15 minutos.

## Antes de começar

- Os ficheiros `sql/01` a `sql/05` já correram no Supabase.
- Tens o Node instalado (`node --version` responde).
- Sabes o **ref do projeto**: é o que aparece em `https://<REF>.supabase.co`
  (Project Settings → General → Reference ID).

## 1. Criar as chaves VAPID

```bash
npx web-push generate-vapid-keys
```

Aparecem duas chaves:

- A **Public Key** vai para a app (passo 6).
- A **Private Key** é secreta. Só vai para o Supabase (passo 3), nunca para a app nem para o GitHub.

## 2. Ligar a pasta ao projeto do Supabase

```bash
npx supabase login
```

```bash
npx supabase init
```

(só se ainda não existir `supabase/config.toml`; responde "N" às perguntas extra)

```bash
npx supabase link --project-ref <REF>
```

## 3. Guardar os segredos no Supabase

Primeiro, gera um segredo para o agendamento:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Depois guarda os quatro segredos (troca os valores):

```bash
npx supabase secrets set VAPID_PUBLICA=<Public Key> VAPID_PRIVADA=<Private Key> VAPID_CONTACTO=mailto:<o-teu-email> CRON_SEGREDO=<o segredo gerado acima>
```

## 4. Publicar a função

```bash
npx supabase functions deploy avisos-prazos --no-verify-jwt
```

O `--no-verify-jwt` é de propósito: quem chama a função é o agendamento, não a app, e ela
protege-se com o `CRON_SEGREDO`.

## 5. Base de dados

No Supabase → SQL Editor, corre:

1. `sql/07-avisos-push.sql`: cria as tabelas e deve acabar em **"TUDO PASSOU"**.
2. `sql/08-agendamento-avisos.sql`: **antes de correr**, troca `<REF-DO-PROJETO>` e
   `<CRON_SEGREDO>` pelos valores verdadeiros.

## 6. A chave pública na app

No `config.local.js` (o de `_github` e o de `publicar`), acrescenta a Public Key:

```js
window.SB_CONFIG = {
  url: "https://<REF>.supabase.co",
  key: "eyJ...",
  vapid: "<Public Key>"
};
```

Depois publica a app outra vez.

## 7. Experimentar

1. No telemóvel, com a app **instalada**, vai a **Definições → Avisos no telemóvel → Ligar avisos**.
2. Para forçar uma volta sem esperar pelos 10 minutos:

   ```bash
   curl -X POST https://<REF>.supabase.co/functions/v1/avisos-prazos -H "Authorization: Bearer <CRON_SEGREDO>"
   ```

   A resposta diz quantos avisos saíram: `{"enviados":1,...}`. Se não houver nenhum jogo nas
   janelas de aviso, é `{"enviados":0}`, e isso está certo.

3. Para ver se o agendamento corre, no SQL Editor:

   ```sql
   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
   ```

## Se não chegar nada

| Sintoma | Causa provável |
|---|---|
| O cartão diz "ainda não foram ligados no servidor" | Falta o `vapid` no `config.local.js` publicado. |
| O cartão diz "bloqueadas" | As notificações da app foram recusadas no telemóvel: Definições do Chrome → Sites → Notificações. |
| No iPhone não aparece o botão | Só funciona com a app instalada no ecrã principal e iOS 16.4 ou mais recente. |
| `curl` responde 401 | O `CRON_SEGREDO` do `curl` (ou do ficheiro 08) não é igual ao do passo 3. Se acabaste de mudar o segredo, **volta a publicar a função** (passo 4): às vezes ela só apanha o valor novo depois disso. |
| A linha do segredo não entrou toda | Confirma com `npx supabase secrets list` que aparecem os quatro nomes. A função responde `erro: falta o segredo <NOME>` quando falta um. |
| `curl` responde 500 "falta o segredo …" | Falta um dos segredos do passo 3. |
| `enviados: 0` com um jogo daqui a 2 horas | O jogo não está "agendado", não tens participação nele, ou o aviso já tinha saído (ver a tabela `avisos_enviados`). |

Ao terminar sessão, os avisos desse telemóvel são desligados, para quem entrar a seguir não
receber os da conta anterior.
