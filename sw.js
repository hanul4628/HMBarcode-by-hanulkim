/* HKMC 2D Barcode Reader — 오프라인 동작용 서비스 워커
 *
 * - 앱 화면(index.html): 인터넷 우선. 3초 안에 응답이 없거나 오프라인이면 저장본 사용
 *   → 온라인이면 수정사항이 바로 반영되고, 오프라인/약한 신호에서도 열림
 * - 라이브러리·판독 엔진·글꼴: 저장본 우선 (버전이 고정된 파일이라 안전)
 *
 * vendor/ 파일이나 아래 PRECACHE 목록을 바꿀 때는 VERSION 숫자를 올려야 함
 */
var VERSION = 'v1';
var CACHE = 'hkmc-barcode-' + VERSION;

// 설치 시 반드시 받아 둘 파일 (같은 저장소)
var PRECACHE = [
  './',
  './index.html',
  './vendor/html5-qrcode.min.js',
  './vendor/html2canvas.min.js',
  './vendor/lottie.min.js'
];

// 설치 시 받아 두되, 실패해도 설치는 진행 (외부 서버)
var PRECACHE_OPTIONAL = [
  'https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.6/dist/iife/reader/index.js',
  'https://fastly.jsdelivr.net/npm/zxing-wasm@3.1.6/dist/reader/zxing_reader.wasm',
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css'
];

// 쓰는 도중 받은 파일을 저장해 둘 외부 서버 (글꼴 등)
var RUNTIME_HOSTS = [
  'cdn.jsdelivr.net',
  'fastly.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

var NAV_TIMEOUT_MS = 3000;

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(PRECACHE).then(function () {
        return Promise.all(PRECACHE_OPTIONAL.map(function (url) {
          return fetch(url, { mode: 'cors' }).then(function (res) {
            if (res.ok) return cache.put(url, res);
          }).catch(function () {});
        }));
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf('hkmc-barcode-') === 0 && k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  var sameOrigin = url.origin === self.location.origin;
  if (sameOrigin || RUNTIME_HOSTS.indexOf(url.hostname) >= 0) {
    event.respondWith(cacheFirst(req));
  }
});

// 앱 화면: 인터넷 우선, 늦거나 실패하면 저장본
function networkFirst(req) {
  return caches.open(CACHE).then(function (cache) {
    var network = fetch(req).then(function (res) {
      // 앱은 화면이 하나뿐이므로 어떤 주소로 열든 최신본을 한 곳에 저장하고 거기서 꺼냄
      if (res.ok) {
        cache.put('./index.html', res.clone());
        cache.put('./', res.clone());
      }
      return res;
    });
    var cached = cache.match('./index.html');

    return cached.then(function (saved) {
      if (!saved) return network;               // 저장본이 없으면 인터넷을 끝까지 기다림
      var timeout = new Promise(function (resolve) {
        setTimeout(function () { resolve(saved); }, NAV_TIMEOUT_MS);
      });
      return Promise.race([
        network.catch(function () { return saved; }),
        timeout
      ]);
    });
  });
}

// 라이브러리·글꼴: 저장본 우선, 없으면 받아서 저장
function cacheFirst(req) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(req, { ignoreVary: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      });
    });
  });
}
