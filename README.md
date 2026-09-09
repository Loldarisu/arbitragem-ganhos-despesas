# Arbitragem — Ganhos & Despesas (PWA)

App web (PWA) para gerir jogos, ganhos, despesas e multas de arbitragem de futebol.
Substitui a folha de Excel: funciona offline, instala-se no telemóvel e — opcionalmente —
sincroniza a equipa através do Supabase.

## Stack

- **Frontend:** HTML/CSS/JavaScript num único ficheiro (`index.html`), sem build nem dependências
- **Offline:** service worker (`sw.js`) + `manifest.webmanifest` (instalável no Android/iOS)
- **Dados:** `localStorage` no dispositivo; sincronização opcional via **Supabase** (PostgreSQL + Auth + RLS)

## Ficheiros

| Ficheiro | Descrição |
|---|---|
| `index.html` | Aplicação completa (UI + lógica + sincronização) |
| `sw.js` | Service worker — cache offline, estratégia cache-first |
| `manifest.webmanifest` | Manifesto PWA |
| `icon-192.png`, `icon-512.png` | Ícones da app |
| `supabase-setup.sql` | Criação da tabela `estado` e políticas RLS |
| `LEIA-ME.md` | Manual de utilização detalhado (funcionalidades, backups, multas) |

## Como usar

Abrir `index.html` no browser já chega para experimentar. Para instalar como app é preciso
servir os ficheiros por HTTPS (GitHub Pages, Netlify Drop, etc.) e depois usar
"Instalar aplicação" no Chrome.

## Configuração do Supabase (opcional)

1. Criar um projeto em [supabase.com](https://supabase.com).
2. **SQL Editor** → correr `supabase-setup.sql` (substituir `o-teu-email@exemplo.com` pelo email
   de quem pode editar).
3. **Authentication → Users** → criar os utilizadores da equipa e desativar o registo livre.
4. **Project Settings → API** → copiar o *Project URL* e a chave *anon public*.
5. Introduzir esses dados no ecrã de login da app — ou preencher o `SB_CONFIG` no topo do
   script em `index.html` para que o login só peça email e password:

```js
const SB_CONFIG = { url: "https://xxxx.supabase.co", key: "eyJ..." };
```

> Neste repositório o `SB_CONFIG` está vazio de propósito — as credenciais do projeto não são
> versionadas.

Detalhes completos (sincronização, backups, colar convocatórias, regime disciplinar) em
[`LEIA-ME.md`](LEIA-ME.md).
