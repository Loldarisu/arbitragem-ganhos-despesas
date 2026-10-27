const CACHE = "arb-app-v57";
const ASSETS = ["./", "./index.html", "./engine.js","./dados.js",
  "./js/base.js","./js/calculo.js","./js/jogos.js","./js/despesas-multas.js","./js/resumo.js",
  "./js/bd.js","./js/offline.js","./js/conta.js","./js/sessao.js","./js/definicoes.js","./js/avisos.js","./js/arranque.js",
  "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-192.png", "./icon-maskable-512.png", "./apple-touch-icon.png", "./favicon.svg", "./config.local.js"];
// Uma cópia em cache com menos de uma hora é servida sem tocar na rede. A app
// nova continua a chegar: o registo do service worker é verificado de hora a
// hora e sempre que a app volta ao ecrã.
const REVALIDAR_MS = 60 * 60 * 1000;
const CARIMBO = "x-arb-cached";

// Cada ficheiro é adicionado à parte: um que falte (o config.local.js pode não
// ser publicado) não pode fazer a instalação inteira falhar e deixar a app sem
// offline nenhum, em silêncio — era o que acontecia com um caches.addAll().
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(ASSETS.map(async u => {
      try {
        const res = await fetch(u, { cache: "reload" });
        if (res && res.ok) await guarda(c, u, res);
      } catch (err) { console.warn("[sw] não consegui cachear", u, err); }
    }));
  })());
  // Sem skipWaiting(): a versão nova fica à espera e a app pergunta ao
  // utilizador antes de trocar, para não recarregar por baixo de um formulário.
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", e => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

// Guarda com carimbo de hora, para saber depois se vale a pena revalidar.
async function guarda(cache, req, res) {
  try {
    const h = new Headers(res.headers);
    h.set(CARIMBO, String(Date.now()));
    await cache.put(req, new Response(await res.clone().blob(), { status: res.status, statusText: res.statusText, headers: h }));
  } catch (err) { /* resposta opaca ou sem corpo: não dá para recarimbar */ }
}

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // nunca cachear API externa (Supabase)
  // Uma partilha (?text=…) ou um atalho do ícone (?acao=…) é a mesma app com
  // outro endereço: serve-se o index.html, em vez de guardar uma cópia nova na
  // cache por cada mensagem partilhada — e funciona offline como o resto.
  const pedido = (e.request.mode === "navigate" && url.search) ? "./index.html" : e.request;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(pedido);

    if (cached) {
      const idade = Date.now() - Number(cached.headers.get(CARIMBO) || 0);
      if (idade < REVALIDAR_MS) return cached;          // fresca: nem toca na rede
      // velha: responde já com a cópia e atualiza em segundo plano
      e.waitUntil(fetch(pedido).then(res => { if (res && res.ok) return guarda(cache, pedido, res); }).catch(() => {}));
      return cached;
    }

    try {
      const res = await fetch(pedido);
      if (res && res.ok) e.waitUntil(guarda(cache, pedido, res.clone()));
      return res;
    } catch (_) {
      // Offline e sem cópia em cache: numa navegação devolve a app em vez de um
      // erro de rede cru (por exemplo um atalho para ?separador=resumo).
      if (e.request.mode === "navigate") {
        const idx = await cache.match("./index.html") || await cache.match("./");
        if (idx) return idx;
      }
      return new Response("Offline", { status: 503, statusText: "Offline", headers: { "Content-Type": "text/plain;charset=utf-8" } });
    }
  })());
});

/* Avisos push (Edge Function avisos-prazos). O conteúdo vem em JSON:
   {titulo, corpo, url, tag}. A tag faz o mesmo aviso substituir o anterior
   em vez de empilhar. */
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { corpo: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "Arbitragem", {
    body: d.corpo || "", tag: d.tag || undefined, icon: "./icon-192.png", badge: "./icon-mono-512.png",
    data: { url: d.url || "./index.html" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const alvo = new URL((e.notification.data && e.notification.data.url) || "./index.html", self.registration.scope).href;
  e.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const app = abertas.find(c => c.url.startsWith(self.registration.scope));
    if (app) { await app.focus(); return; }
    await self.clients.openWindow(alvo);
  })());
});
