// 재고조사 서비스 워커 (정비 레포트 sw.js 그대로, 2026-11-07)
// - 앱 화면 파일(index.html·app.js·style.css …)은 '인터넷 먼저': 연결되면 늘 새 파일을 받고(예전 화면이 남지 않게) 사본을 휴대폰에 저장
//   인터넷이 끊겼거나 4초 넘게 응답이 없으면 저장해 둔 사본으로 열기 → 지하·엘리베이터에서도 앱이 열림
// - Firebase 프로그램·글꼴(주소에 버전이 들어 있어 안 바뀜)은 '저장본 먼저'
// - version.json(새 버전 확인)과 Firestore 자료는 건드리지 않음 (자료는 Firestore 가 휴대폰에 따로 보관)
const CACHE = 'inv-shell-v1';
const WAIT = 4000;
const SCOPE = new URL(self.registration.scope).pathname;
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k.indexOf('inv-shell-') === 0 && k !== CACHE).map(k => caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === self.location.origin && u.pathname.indexOf(SCOPE) === 0) {
    if (/version\.json$/.test(u.pathname)) return;
    e.respondWith(netFirst(e, req));
  } else if ((u.origin === 'https://www.gstatic.com' && u.pathname.indexOf('/firebasejs/') === 0) || u.origin === 'https://fonts.googleapis.com' || u.origin === 'https://fonts.gstatic.com') {
    e.respondWith(cacheFirst(e, req));
  }
});
function keep(e, req, res) {
  if (res && (res.ok || res.type === 'opaque')) { const c = res.clone(); e.waitUntil(caches.open(CACHE).then(x => x.put(req, c)).catch(() => {})); }
  return res;
}
async function fromCache(req) {
  const c = await caches.open(CACHE);
  return (await c.match(req)) || (await c.match(req, { ignoreSearch: true })) ||
    (req.mode === 'navigate' ? (await c.match(SCOPE)) || (await c.match(SCOPE + 'index.html', { ignoreSearch: true })) : undefined);
}
function netFirst(e, req) {
  return new Promise(resolve => {
    let done = false;
    const fin = r => { if (!done && r) { done = true; resolve(r); } };
    const net = fetch(req).then(res => keep(e, req, res));
    e.waitUntil(net.catch(() => {}));
    const fallback = async () => { const c = await fromCache(req); if (c) fin(c); return c; };
    const t = setTimeout(fallback, WAIT);
    net.then(res => { clearTimeout(t); fin(res); })
      .catch(async () => { clearTimeout(t); if (!(await fallback())) fin(Response.error()); });
  });
}
async function cacheFirst(e, req) {
  const c = await caches.open(CACHE), hit = await c.match(req);
  if (hit) return hit;
  return keep(e, req, await fetch(req));
}
