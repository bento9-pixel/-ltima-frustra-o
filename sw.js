/* CEM · service worker (v3). Guarda só a própria app para funcionar sem internet.
   Nunca guarda dados do centro nem pedidos a outros domínios. */
const PREFIXO = 'cem3-';                 // só mexe nas suas próprias caches (não apaga as de outros apps no mesmo github.io)
const VERSAO  = PREFIXO + 'v2';           // mudar este valor a cada nova publicação
const OPCIONAIS = ['./manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon-32.png'];
const ESPERA_REDE_MS = 4000;              // com rede lenta, abre já a versão guardada

// Se a resposta veio de um redireccionamento, o Chrome recusa-a numa navegação: copiamos para uma resposta limpa.
async function limpa(r){
  if(!r.redirected) return r;
  const b = await r.blob();
  return new Response(b, { status: r.status, statusText: r.statusText, headers: r.headers });
}
function comLimite(promessa, ms){
  return new Promise((ok, falha) => {
    const t = setTimeout(() => falha(new Error('lento')), ms);
    promessa.then(r => { clearTimeout(t); ok(r); }, e => { clearTimeout(t); falha(e); });
  });
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSAO);
    // 1) O ESSENCIAL: a própria app. Se isto falhar, a instalação falha (e tenta de novo mais tarde).
    const r = await fetch('./index.html', { cache: 'reload' });
    if(!r.ok) throw new Error('index.html indisponível');
    const limpo = await limpa(r);
    await cache.put('./index.html', limpo.clone());
    await cache.put('./', limpo.clone());
    // 2) OS EXTRAS (ícones, manifesto): um a um; se faltar um, os outros ficam na mesma.
    await Promise.all(OPCIONAIS.map(async u => {
      try{ const x = await fetch(u, { cache: 'reload' }); if(x.ok) await cache.put(u, x); }catch(_){}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith(PREFIXO) && k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if(req.method !== 'GET' || url.origin !== self.location.origin) return;

  if(req.mode === 'navigate'){            // abrir a app: rede primeiro (4 s), cópia guardada como reserva
    e.respondWith((async () => {
      const cache = await caches.open(VERSAO);
      try{
        const r = await comLimite(fetch(req), ESPERA_REDE_MS);
        if(r && r.ok){ const l = await limpa(r); cache.put('./index.html', l.clone()); return l; }
        throw new Error('sem resposta boa');
      }catch(_){
        return (await cache.match('./index.html', { ignoreSearch: true }))
            || (await cache.match('./', { ignoreSearch: true }))
            || Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {            // ícones, manifesto: cópia guardada primeiro
    const c = await caches.match(req, { ignoreSearch: true });
    if(c) return c;
    try{
      const r = await fetch(req);
      if(r && r.ok){ const k = r.clone(); caches.open(VERSAO).then(ca => ca.put(req, k)); }
      return r;
    }catch(_){ return Response.error(); }
  })());
});
