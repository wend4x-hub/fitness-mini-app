/* Служебный скрипт: держит приложение рабочим без интернета.
   Файл живёт рядом с index.html. Без него всё работает по-прежнему,
   просто без офлайна и без установки на домашний экран.

   Версию менять при каждой выкладке — иначе у тех, кто уже открывал
   приложение, останется старая копия. */
const VERSION = 'v19';
const SHELL = 'shell-' + VERSION;      // сама страница и иконки
const RUNTIME = 'runtime-' + VERSION;  // то, что подтянулось по ходу дела

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL)
      // Кладём по одному: если какого-то файла на сервере нет,
      // addAll отвалился бы целиком и офлайна не было бы вовсе.
      .then(c => Promise.all(SHELL_FILES.map(f => c.add(f).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL && k !== RUNTIME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Сначала сеть, кэш — на случай её отсутствия.
   Наоборот делать нельзя: человек обновит файл на сервере, а у него
   останется открываться старая версия, и он будет думать, что ничего не залилось. */
async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw e;
  }
}

/* Сначала кэш. Для файлов, которые не меняются: модель распознавания лица
   весит мегабайты и скачивать её заново при каждом открытии незачем. */
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Сам Telegram и запросы к его API не трогаем никогда
  if (url.hostname.endsWith('telegram.org')) return;

  // Данные о продуктах меняются — кэшировать ответы нельзя
  if (url.hostname.endsWith('openfoodfacts.org')) return;

  // Страница: свежая версия важнее скорости
  if (req.mode === 'navigate' || url.origin === self.location.origin) {
    e.respondWith(networkFirst(req, SHELL));
    return;
  }

  // Библиотека и модель распознавания лица — большие и неизменные
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'storage.googleapis.com') {
    e.respondWith(cacheFirst(req, RUNTIME));
  }
});
