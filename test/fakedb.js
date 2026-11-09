// fakedb.js — 시험용 메모리 Firestore + 보안 규칙 v10 의 inv_* 블록을 JS 로 그대로 옮긴 검사
// (규칙에 막히는 쓰기는 시험에서도 막힘). Node 쪽에서 돌고, 휴대폰(브라우저 창)들은 window.__fdb 로 부름
const ADMINS = ['wytSL9o4vvN4U2G3z6R64hafC9t2', 'Fz4T5ZzIxShOdVkNpF9gzMmOLED2', 'iw2orXgIgPgTbLUQa0b41XJ9Dvd2'];
const EMAILS = { 'unieshaeundae+sub@gmail.com': 'Fz4T5ZzIxShOdVkNpF9gzMmOLED2', 'unieshaeundae+admin@gmail.com': 'iw2orXgIgPgTbLUQa0b41XJ9Dvd2' };
const PW = 'test-pw';

function makeDb() {
  const docs = new Map(), sessions = {}, log = [];
  const isAdmin = uid => !!uid && ADMINS.includes(uid);
  const signedIn = uid => !!uid;
  const isName = n => typeof n === 'string' && n.length > 0 && n.length <= 20;
  const str = (v, n) => typeof v === 'string' && v.length <= n;
  const hasOnly = (d, ks) => Object.keys(d).every(k => ks.includes(k));
  const isTs = v => v && typeof v === 'object' && v.__ts !== undefined;
  const isServer = v => v && typeof v === 'object' && v.__server;
  function deepMerge(a, b) { const o = Object.assign({}, a); Object.keys(b).forEach(k => { o[k] = (b[k] && typeof b[k] === 'object' && !isServer(b[k]) && !isTs(b[k]) && a[k] && typeof a[k] === 'object') ? deepMerge(a[k], b[k]) : b[k]; }); return o; }
  function stamp(v, t) { if (isServer(v)) return { __ts: t }; if (Array.isArray(v)) return v.map(x => stamp(x, t)); if (v && typeof v === 'object' && !isTs(v)) { const o = {}; Object.keys(v).forEach(k => { o[k] = stamp(v[k], t); }); return o; } return v; }

  function validInvCount(d, uid) {
    const r = typeof d.round === 'string' ? docs.get('inv_rounds/' + d.round) : null;
    return signedIn(uid)
      && hasOnly(d, ['round', 'part', 'item', 'qty', 'by', 'at', 'clientAt', 'uid'])
      && typeof d.round === 'string' && /^[0-9]{4}-[0-9]{2}$/.test(d.round)
      && ['객실', '사우나', '사무실'].includes(d.part)   // v10
      && typeof d.item === 'string' && d.item.length > 0 && d.item.length <= 40
      && (d.qty === null || (Number.isInteger(d.qty) && d.qty >= 0 && d.qty <= 100000))   // v9: null = 지움
      && isName(d.by)
      && isServer(d.at) && isTs(d.clientAt) && d.uid === uid
      && !!r && r.status === '진행';
  }
  function validErr(d, uid) {
    return signedIn(uid) && hasOnly(d, ['at', 'day', 'uid', 'name', 'ver', 'where', 'msg', 'ua']) && d.uid === uid && isServer(d.at)
      && typeof d.day === 'string' && d.day.length === 10 && str(d.msg, 500) && str(d.where, 40) && str(d.name, 20) && str(d.ver, 20) && str(d.ua, 200);
  }
  // 쓰기 허용? (Firestore 규칙과 같은 판단)
  function canWrite(path, incoming, uid, exists) {
    const [c] = path.split('/');
    if (c === 'inv_items' || c === 'inv_rounds' || c === 'inv_buy') return isAdmin(uid);
    if (c === 'inv_counts') return exists ? isAdmin(uid) : (isAdmin(uid) || validInvCount(incoming, uid));
    if (c === 'inv_errors') return !exists && validErr(incoming, uid);
    return false;   // 그 밖은 막힘
  }
  function canRead(c, uid) {
    if (c === 'inv_buy' || c === 'inv_errors') return isAdmin(uid);
    if (['inv_items', 'inv_rounds', 'inv_counts'].includes(c)) return signedIn(uid);
    return false;
  }
  const out = (path, data) => ({ path, data });
  async function call(op, a) {
    const uid = a.uid;
    if (op === 'session') return sessions[a.phone] || null;
    if (op === 'signin') {
      if (a.anon) return (sessions[a.phone] = { uid: 'anon-' + a.phone, anon: true, email: '' });
      const u = EMAILS[a.email]; if (!u || a.pw !== PW) return null;
      return (sessions[a.phone] = { uid: u, anon: false, email: a.email });
    }
    if (op === 'signout') { delete sessions[a.phone]; return true; }
    if (op === 'get') { const c = a.path.split('/')[0]; if (!canRead(c, uid)) return { denied: true }; return docs.has(a.path) ? out(a.path, docs.get(a.path)) : null; }
    if (op === 'query') {
      if (!canRead(a.c, uid)) return { denied: true };
      const res = [];
      docs.forEach((d, p) => { if (p.startsWith(a.c + '/') && p.split('/').length === 2 && (!a.w || a.w.every(([f, o, v]) => d[f] === v))) res.push(out(p, d)); });
      return res;
    }
    if (op === 'write') {
      const ex = docs.has(a.path), cur = docs.get(a.path);
      const incoming = a.merge && cur ? deepMerge(cur, a.data) : a.data;
      const ok = canWrite(a.path, incoming, uid, ex);
      log.push({ path: a.path, uid, ok });
      if (!ok) return { denied: true };
      docs.set(a.path, stamp(incoming, Date.now()));
      return { ok: true };
    }
    if (op === 'del') { if (!isAdmin(uid)) return { denied: true }; docs.delete(a.path); return { ok: true }; }
    throw new Error('op? ' + op);
  }
  return { call, docs, log, sessions, PW };
}
module.exports = { makeDb, PW };
