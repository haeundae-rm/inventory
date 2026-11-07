// fake_store.js — 시험용 가짜 store.js (store.js 와 같은 함수). 진짜 데이터는 Node 쪽 메모리 DB (window.__fdb)
// 오프라인(window.__offline) · 대기 쓰기(휴대폰 보관, 다시 열어도 남음) · 규칙 거절까지 흉내
export const SERVER_TIME = { __server: 1 };
export const kind = 'fake';
window.__fake = true;
const LS = 'fakeq:' + (window.__phone || 'p');
let user = null, userCbs = [];
let queue = []; try { queue = JSON.parse(localStorage.getItem(LS) || '[]'); } catch (e) {}
const waiters = {};
const saveQ = () => { try { localStorage.setItem(LS, JSON.stringify(queue)); } catch (e) {} };

function enc(v) {
  if (v === SERVER_TIME) return { __server: 1 };
  if (v instanceof Date) return { __ts: v.getTime() };
  if (Array.isArray(v)) return v.map(enc);
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { if (v[k] !== undefined) o[k] = enc(v[k]); }); return o; }
  return v;
}
function dec(v, est) {
  if (v && typeof v === 'object' && v.__server) return est || Date.now();
  if (v && typeof v === 'object' && v.__ts !== undefined) return v.__ts;
  if (Array.isArray(v)) return v.map(x => dec(x, est));
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { o[k] = dec(v[k], est); }); return o; }
  return v;
}
const fdb = (op, a) => window.__fdb(op, Object.assign({ uid: user && user.uid }, a));
function emit() { userCbs.forEach(cb => cb(user ? Object.assign({}, user) : null)); }

export function onUser(cb) {
  userCbs.push(cb);
  setTimeout(async () => { const s = await window.__fdb('session', { phone: window.__phone }); user = s; cb(user); }, 30);
  return () => {};
}
export async function signInAnon() { user = await window.__fdb('signin', { phone: window.__phone, anon: true }); setTimeout(emit, 10); }
export async function signInEmail(email, pw) {
  const u = await window.__fdb('signin', { phone: window.__phone, email, pw });
  if (!u) { const e = new Error('wrong'); e.code = 'auth/invalid-credential'; throw e; }
  user = u; setTimeout(emit, 10);
}
export async function signOut() { await window.__fdb('signout', { phone: window.__phone }); user = null; setTimeout(emit, 10); }
export async function idToken() { return 'fake'; }

// 서버 문서 + 아직 안 보낸 내 쓰기를 합친 모습
function merged(serverDocs, filt) {
  const m = {}; serverDocs.forEach(d => { m[d.path] = { data: d.data, pending: false }; });
  queue.forEach(w => {
    if (filt && !filt(w.path)) return;
    const cur = m[w.path];
    m[w.path] = { data: w.merge && cur ? deepMerge(cur.data, w.data) : w.data, pending: true };
  });
  return m;
}
function deepMerge(a, b) { const o = Object.assign({}, a); Object.keys(b).forEach(k => { o[k] = (b[k] && typeof b[k] === 'object' && !b[k].__server && !b[k].__ts && a[k] && typeof a[k] === 'object') ? deepMerge(a[k], b[k]) : b[k]; }); return o; }
const inCol = (c, p) => p.startsWith(c + '/') && p.split('/').length === c.split('/').length + 1;
function match(data, w) { return !w || w.every(([f, op, v]) => op === '==' && data[f] === v); }

function poller(fn) {
  let last = '', stop = false;
  const tick = async () => { if (stop) return; try { await fn(s => { if (s !== last) { last = s; return true; } return false; }); } catch (e) {} if (!stop) setTimeout(tick, 200); };
  tick(); return () => { stop = true; };
}
export function listenDoc(path, cb, onErr) {
  return poller(async changed => {
    let r = null;
    if (!window.__offline) { r = await fdb('get', { path }); if (r && r.denied) { onErr && onErr({ code: 'permission-denied' }); return; } }
    const m = merged(r ? [r] : [], p => p === path)[path];
    const s = JSON.stringify(m || null);
    if (changed(s)) cb(m ? dec(m.data) : null, { pending: !!(m && m.pending), fromCache: !!window.__offline });
  });
}
let cacheQ = {};
export function listenQuery(c, w, cb, onErr) {
  const key = c + JSON.stringify(w || []);
  return poller(async changed => {
    let docs;
    if (window.__offline) docs = cacheQ[key] || [];
    else { const r = await fdb('query', { c, w }); if (r && r.denied) { onErr && onErr({ code: 'permission-denied' }); return; } docs = r; cacheQ[key] = r; }
    const m = merged(docs, p => inCol(c, p));
    const out = Object.keys(m).filter(p => match(dec(m[p].data), w)).map(p => ({ id: p.split('/').pop(), data: dec(m[p].data), pending: m[p].pending }));
    const s = JSON.stringify(out);
    if (changed(s)) cb(out, { fromCache: !!window.__offline, pending: out.filter(d => d.pending).length });
  });
}
export async function get(path) { const r = await fdb('get', { path }); return r && !r.denied ? dec(r.data) : null; }
export async function getQuery(c, w) { const r = await fdb('query', { c, w }); return r.map(d => ({ id: d.path.split('/').pop(), data: dec(d.data) })); }

function push(path, data, merge) {
  const w = { k: Math.random().toString(36).slice(2), path, data: enc(data), merge: !!merge };
  queue.push(w); saveQ();
  return new Promise((ok, no) => { waiters[w.k] = { ok, no }; flush(); });
}
let flushing = false;
async function flush() {
  if (flushing || window.__offline || !user) return;
  flushing = true;
  try {
    while (queue.length && !window.__offline) {
      const w = queue[0];
      const r = await fdb('write', { path: w.path, data: w.data, merge: w.merge });
      queue.shift(); saveQ();
      const h = waiters[w.k]; delete waiters[w.k];
      if (r && r.denied) { if (h) { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; h.no(e); } }
      else if (h) h.ok();
    }
  } finally { flushing = false; }
}
setInterval(flush, 300);
export function set(path, data) { return push(path, data, false); }
export function patch(path, data) { return push(path, data, true); }
export function add(c, data) { const id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); return { id, done: push(c + '/' + id, data, false) }; }
export function del(path) { return fdb('del', { path }); }
