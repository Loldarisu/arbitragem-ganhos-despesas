// Copia este ficheiro para "config.local.js" e preenche com os dados do teu projeto
// Supabase (Project Settings → API). O config.local.js está no .gitignore e nunca
// é enviado para o GitHub.
//
// Sem este ficheiro a app funciona na mesma: o ecrã de login pede o URL e a chave.
window.SB_CONFIG = {
  url: "https://xxxxxxxx.supabase.co",
  key: "eyJ...", // chave "anon public" — é pública por design; quem protege os dados é a RLS
  vapid: ""      // chave PÚBLICA VAPID dos avisos push (opcional) — ver docs/AVISOS-PUSH.md
};
