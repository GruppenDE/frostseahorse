// Service Worker de Frost Seahorse
// IMPORTANTE: sube este número CADA VEZ que publiques cambios (junto con
// APP_VERSION en index.html). Esto es lo que dispara la limpieza automática
// de caché en el celular de los usuarios sin que tengan que borrar cookies.
const CACHE_VERSION = 'frost-seahorse-v3';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

// Instalación: precachea el shell de la app
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activación: limpia caches de versiones anteriores y toma control inmediato
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
     .then(() => {
        // Avisa a todas las pestañas abiertas que hay una versión nueva activa
        return self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
        });
     })
  );
});

// Permite forzar la activación inmediata desde la página (mensaje "SKIP_WAITING")
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch: solo intercepta peticiones del mismo origen (el juego en sí).
// Todo lo externo (Firebase, Firestore, Analytics, fuentes, etc.) pasa
// directo a la red sin tocarlo, para no romper el marcador ni el login online.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = event.request.mode === 'navigate';

  if (!isSameOrigin) return; // deja pasar firebase/firestore/etc. tal cual

  if (isNavigation) {
    // Network-first para la navegación, forzando bypass del cache HTTP
    // (GitHub Pages cachea ~10 min por defecto; sin "no-store" seguirías
    // viendo la versión vieja aunque la estrategia sea "network-first").
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', clone));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Stale-while-revalidate para el resto de assets propios (iconos, manifest, etc.):
  // responde rápido con lo cacheado, pero siempre revisa la red en segundo plano
  // y actualiza el cache, así la próxima visita ya trae lo nuevo sin esperar
  // a que expire manualmente el CACHE_VERSION.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request, { cache: 'no-store' }).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});
