const CACHE_NAME = 'fit-data-pro-red-v1';

// Lista de archivos que se guardarán en el teléfono del usuario
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/data.js', // CRÍTICO: Se guarda para que el Lazy Load funcione offline
  './logo.png',
  './manifest.json'
];

// 1. INSTALACIÓN: Descarga y guarda los archivos vitales
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()) // Fuerza al SW a activarse de inmediato
  );
});

// 2. ACTIVACIÓN: Limpia cachés antiguas si subes una nueva versión (v2, v3...)
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      })
    ))
  );
  self.clients.claim(); // Toma control de la página inmediatamente
});

// 3. INTERCEPTOR DE RED (Estrategia: Stale-While-Revalidate)
// Sirve lo guardado RAPIDÍSIMO, y busca actualizaciones en segundo plano
self.addEventListener('fetch', (e) => {
  // Ignoramos peticiones a la base de datos (Firestore) para que siempre sean datos frescos
  if (e.request.url.includes('firestore') || e.request.url.includes('googleapis')) return;

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      // Lanzamos la petición a internet en paralelo para actualizar la caché
      const networkFetch = fetch(e.request).then((networkResponse) => {
        // Si la red responde bien, guardamos la copia nueva para la próxima vez
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseClone));
        }
        return networkResponse;
      }).catch(() => {
        // Si no hay internet, no pasa nada, ya tenemos la caché
      });

      // Devolvemos la caché si existe (velocidad instantánea), si no, esperamos a la red
      return cachedResponse || networkFetch;
    })
  );
});
