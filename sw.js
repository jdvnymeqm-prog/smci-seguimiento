// Service worker: permite instalar la aplicación en PC y Android y la hace arrancar rápido.
// Los datos nunca se guardan aquí: siempre se piden a Supabase (requiere internet).
const VERSION = 'smci-v21';
const BASE = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/lib.js', 'js/config.js', 'js/componentes.js', 'js/datos/dedh_2026.js',
  'js/vistas/tablero.js', 'js/vistas/proyectos.js', 'js/vistas/ficha.js', 'js/vistas/miunidad.js',
  'js/vistas/admin.js', 'js/vistas/importador.js', 'js/vistas/validaciones.js', 'js/exportar.js', 'js/respaldo_mensual.js',
  'iconos/icono-192.png', 'iconos/icono-512.png', 'iconos/icono-maskable-512.png', 'iconos/apple-touch-icon.png',
];
const CDN = ['esm.sh', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Archivos propios: primero la red (así llegan las actualizaciones), si no hay red, la copia guardada
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
      return r;
    }).catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
    return;
  }
  // Librerías con versión fija: primero la copia guardada
  if (CDN.includes(url.hostname)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copia = res.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
      return res;
    })));
  }
  // Supabase y lo demás: directo a la red, sin guardar
});
