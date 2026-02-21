// ═══════════════════════════════════════════════════════
// 구몬수학 뷰어 Service Worker
// 오프라인에서도 앱이 작동하도록 파일을 캐시합니다
// ═══════════════════════════════════════════════════════

const CACHE_NAME = 'kumon-viewer-v1';
const CACHE_NAME_PDF = 'kumon-pdf-v1';

// 앱 핵심 파일 (항상 캐시)
const APP_ASSETS = [
  '/kumon-math-viewer/',
  '/kumon-math-viewer/index.html',
  '/kumon-math-viewer/manifest.json',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&family=DM+Mono:wght@300;400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
];

// PDF 파일 (네트워크 우선 → 캐시 fallback)
const PDF_FILES = [
  '/kumon-math-viewer/구몬수학A단계테스트10장.pdf',
  '/kumon-math-viewer/구몬수학B단계테스트10장.pdf',
  '/kumon-math-viewer/구몬수학C단계테스트10장.pdf',
];

// ── 설치: 핵심 파일 캐시 ────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] 설치 중...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] 앱 파일 캐시 저장');
      return cache.addAll(APP_ASSETS).catch(err => {
        // 일부 실패해도 설치는 계속
        console.warn('[SW] 일부 캐시 실패:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── 활성화: 구버전 캐시 정리 ────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] 활성화');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== CACHE_NAME_PDF)
            .map(k => { console.log('[SW] 구 캐시 삭제:', k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: 요청 전략 ────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // PDF 파일: 캐시 우선 → 없으면 네트워크 후 캐시 저장
  if (PDF_FILES.some(p => event.request.url.includes(p.split('/').pop()))) {
    event.respondWith(pdfStrategy(event.request));
    return;
  }

  // 나머지: 캐시 우선 → 없으면 네트워크
  event.respondWith(cacheFirstStrategy(event.request));
});

// 캐시 우선 전략
async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // 오프라인이고 캐시도 없을 때
    return new Response('오프라인 상태입니다.', { status: 503 });
  }
}

// PDF 캐시 전략 (캐시 우선 → 네트워크 후 저장)
async function pdfStrategy(request) {
  const cached = await caches.match(request);
  if (cached) {
    console.log('[SW] PDF 캐시에서 로드:', request.url);
    return cached;
  }
  try {
    console.log('[SW] PDF 네트워크에서 로드:', request.url);
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME_PDF);
      cache.put(request, response.clone());
      console.log('[SW] PDF 캐시 저장 완료');
    }
    return response;
  } catch {
    return new Response('PDF를 불러올 수 없습니다. 인터넷 연결을 확인해 주세요.', { status: 503 });
  }
}

// ── 메시지 수신 (캐시 강제 갱신) ───────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_PDF_CACHE') {
    caches.delete(CACHE_NAME_PDF).then(() => {
      event.source.postMessage('PDF_CACHE_CLEARED');
    });
  }
});
