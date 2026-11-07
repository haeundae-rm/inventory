// 재고조사 앱 (Firebase) — 근무자(하우스맨 · 사우나 근무자) 휴대폰 화면 + 관리자 로그인 · 공통 도구
// 2026-11-07 첫 버전. 데이터 읽기·쓰기는 store.js 한 곳, 관리자 화면은 admin.js 한 모듈 (나중에 '객실 통합 관리' 메뉴로 옮기기 쉽게)
import * as S from './store.js';
import { WAREHOUSES, SAUNA_GROUPS } from './items.js';
import { setupAdmin } from './admin.js';

const APP_VER = '2026.11.07-2';
// 관리자 = 보안 규칙 isAdmin 과 같은 목록 (UID 는 공개돼도 되는 값)
const ADMINS = [
  { uid: 'Fz4T5ZzIxShOdVkNpF9gzMmOLED2', label: '부소장', email: 'unieshaeundae+sub@gmail.com' },
  { uid: 'iw2orXgIgPgTbLUQa0b41XJ9Dvd2', label: '소장', email: 'unieshaeundae+admin@gmail.com' }
];

// ---------- 상태
let user = null, isAdm = false, mode = 'worker';           // mode: worker / admin
let items = [], itemsReady = false, rounds = [], roundsReady = false;
let name = lsGet('inv_name') || '', part = null, wh = null, screen = 'home', filter = 'all';
// 앱을 다시 열어도 보던 곳(구분·창고)으로 돌아감 (휴대폰이 잠기거나 새로 고침돼도)
try { const p = JSON.parse(lsGet('inv_pos') || 'null'); if (p && name && (p.part === '객실' || p.part === '사우나')) { part = p.part; wh = p.wh === undefined ? null : p.wh; screen = p.screen === 'count' || p.screen === 'wh' ? p.screen : 'home'; } } catch (e) {}
function savePos() { lsSet('inv_pos', part ? JSON.stringify({ part, wh, screen }) : null); }
let cnt = {}, cntSub = null, cntKey = '', cntReady = false;   // 근무자: 이 회차·구분 기록 { 품목ID: { qty, pending, at, by } }
const drafts = {}, timers = {};                              // 누르는 중인 숫자 (0.7초 뒤 저장)
let failed = 0, dlg = null, busy = false, newVer = '', renderLater = false, subs = [];

// ---------- 도구
const $ = s => document.querySelector(s);
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
export function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export function seoulDate(t) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t ? new Date(t) : new Date()); }
function hm(ms) { if (!ms) return ''; const d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
let toastT = 0;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2800); }
function errText(e) {
  const c = e && e.code || '';
  if (/wrong-password|invalid-credential|invalid-login/.test(c)) return '비밀번호가 맞지 않아요.';
  if (/too-many-requests/.test(c)) return '여러 번 틀려서 잠시 막혔어요. 몇 분 뒤 다시 해 주세요.';
  if (/network/.test(c)) return '인터넷 연결을 확인해 주세요.';
  if (/permission-denied/.test(c)) return '권한이 없어요 (보안 규칙에 막힘).';
  return (e && e.message) || String(e);
}
const sortItems = a => a.slice().sort((x, y) => (x.order || 0) - (y.order || 0) || String(x.id).localeCompare(String(y.id)));
const live = p => sortItems(items.filter(x => x.part === p && x.use !== false));
function openRound() { return rounds.filter(r => r.status === '진행').sort((a, b) => b.id.localeCompare(a.id))[0] || null; }
// 같은 품목 기록이 여러 줄이면 마지막(누른 시각) 줄이 지금 값
export function latest(docs) {
  const m = {};
  docs.forEach(d => { const x = d.data, t = x.clientAt || x.at || 0, o = m[x.item]; if (!o || t >= o.t) m[x.item] = { qty: x.qty, by: x.by, t, at: x.at, pending: d.pending, part: x.part }; });
  return m;
}

// =====================================================================
// 시작 · 로그인 · 구독
// =====================================================================
S.onUser(u => {
  user = u;
  subs.forEach(f => f()); subs = [];
  if (!u) { S.signInAnon().catch(e => { $('#main').innerHTML = '<div class="notice"><strong>연결하지 못했어요.</strong><br>' + esc(errText(e)) + '<br>인터넷을 확인하고 다시 열어 주세요.</div>'; }); return; }
  isAdm = !u.anon && ADMINS.some(a => a.uid === u.uid);
  if (isAdm && lsGet('inv_mode') !== 'worker') mode = 'admin'; else mode = 'worker';
  const lost = e => { report('읽기', (e && e.code || '') + ' ' + (e && e.message || e)); };
  subs.push(S.listenQuery('inv_items', null, docs => { items = docs.map(d => Object.assign({ id: d.id }, d.data)); itemsReady = true; update(); }, lost));
  subs.push(S.listenQuery('inv_rounds', null, docs => { rounds = docs.map(d => Object.assign({ id: d.id }, d.data)); roundsReady = true; update(); }, lost));
  if (isAdm) ADM.start(); else ADM.stop();
  update();
});

function watchCounts() {
  const r = openRound(), key = r && part ? r.id + '|' + part : '';
  if (key === cntKey) return;
  if (cntSub) { cntSub(); cntSub = null; }
  cntKey = key; cnt = {}; cntReady = false;
  if (!key) return;
  cntSub = S.listenQuery('inv_counts', [['round', '==', r.id], ['part', '==', part]], docs => {
    cnt = latest(docs); cntReady = true;
    Object.keys(drafts).forEach(k => { if (!timers[k] && cnt[k] && cnt[k].qty === drafts[k]) delete drafts[k]; });
    update();
  }, e => report('기록 읽기', (e && e.code || '') + ' ' + (e && e.message || e)));
}

// 숫자 저장: 줄을 쌓기만 함 (고치기·지우기 없음 — 마지막 줄이 지금 값)
function saveQty(id) {
  const r = openRound(); const q = drafts[id];
  delete timers[id];
  if (!r || q === undefined) return;
  if (cnt[id] && cnt[id].qty === q) { delete drafts[id]; drawItem(id); return; }
  const w = S.add('inv_counts', { round: r.id, part, item: id, qty: q, by: name, at: S.SERVER_TIME, clientAt: new Date(), uid: user.uid });
  w.done.then(() => { drawSync(); }).catch(e => {
    failed++; report('저장', id + ' ' + (e && e.code || '') + ' ' + (e && e.message || e));
    toast('저장이 막혔어요: ' + errText(e)); update();
  });
}
function setDraft(id, q) {
  q = Math.max(0, Math.min(100000, Math.round(q)));
  drafts[id] = q; clearTimeout(timers[id]);
  timers[id] = setTimeout(() => saveQty(id), 700);
  drawItem(id); drawHead();
}
function flushAll() { Object.keys(timers).forEach(k => { clearTimeout(timers[k]); saveQty(k); }); }
window.addEventListener('pagehide', flushAll);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });

// =====================================================================
// 그리기
// =====================================================================
function update() {
  watchCounts();
  if (typing()) { renderLater = true; drawSync(); return; }
  render();
}
// 칸에 숫자를 넣는 중이면 화면을 다시 그리지 않음 (커서가 사라지지 않게) → 칸에서 나오면 그림
function typing() { const a = document.activeElement; return !!(a && a.matches && a.matches('#main input:not([type=checkbox]):not([type=date])')); }
function render() {
  renderLater = false; savePos();
  if (mode === 'admin' && isAdm) { document.body.classList.add('adm'); $('#top').innerHTML = ''; ADM.render($('#main')); drawBands(); return; }
  document.body.classList.remove('adm');
  const r = openRound();
  let back = '', title = '재고조사', sub = r ? r.title : '';
  if (screen === 'wh') { back = 'home'; title = '객실 재고조사'; }
  if (screen === 'count') { back = part === '객실' ? 'wh' : 'home'; title = part === '객실' ? whName(wh) : '사우나 재고조사'; sub = (name || '') + (r ? ' · ' + r.title : ''); }
  $('#top').innerHTML = '<div class="top-row">' + (back ? '<button class="back" data-go="' + back + '">‹ 뒤로</button>' : '') + '<h1>' + esc(title) + '</h1></div>' +
    (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '<div class="sync" id="sync"></div>';
  drawSync(); drawBands();
  document.documentElement.style.setProperty('--top-h', $('#top').offsetHeight + 'px');
  const m = $('#main');
  if (!user || !itemsReady || !roundsReady) { m.innerHTML = '<div class="notice"><strong>불러오는 중이에요…</strong></div>'; return; }
  if (!r) { m.innerHTML = '<div class="notice"><strong>지금 진행 중인 재고조사가 없어요.</strong><br>관리자가 이번 달 조사를 열면 여기에 나와요.</div>' + adminLink(); screen = 'home'; return; }
  if (screen === 'home' || !part) return homeV(m);
  if (screen === 'wh') return whV(m);
  if (screen === 'done') return doneV(m);
  countV(m);
}
function adminLink() { return '<button class="adminin" data-admin-in="1">' + (isAdm ? '관리자 화면으로' : '관리자 로그인') + '</button>'; }
function whName(id) { return (WAREHOUSES.filter(w => w.id === id)[0] || { name: '창고 미지정' }).name; }
function whList() { const ids = WAREHOUSES.map(w => w.id); const extra = live('객실').some(x => ids.indexOf(x.wh) < 0); return extra ? WAREHOUSES.concat([{ id: '', name: '창고 미지정' }]) : WAREHOUSES; }
const inWh = (x, id) => id ? x.wh === id : WAREHOUSES.every(w => w.id !== x.wh);
function homeV(m) {
  const nR = live('객실').length, nS = live('사우나').length;
  m.innerHTML = '<section class="card"><label class="l" for="nm">이름</label><input class="txt" id="nm" maxlength="20" autocomplete="off" placeholder="이름을 적어 주세요" value="' + esc(name) + '"></section>' +
    '<button class="big" data-part="객실"><span class="t">객실 재고조사</span><span class="d">하우스맨(키퍼) · 창고 ' + WAREHOUSES.length + '곳 · ' + nR + '개 품목</span></button>' +
    '<button class="big" data-part="사우나"><span class="t">사우나 재고조사</span><span class="d">사우나 근무자 · ' + nS + '개 품목</span></button>' +
    '<p class="hint">· 숫자를 넣으면 바로 휴대폰에 저장돼요.<br>· 인터넷이 끊겨도 괜찮아요. 연결되면 자동으로 보내요.</p>' + adminLink();
}
function prog(list) { return [list.filter(x => has(x.id)).length, list.length]; }
function has(id) { return drafts[id] !== undefined || (cnt[id] && cnt[id].qty !== undefined); }
function valOf(id) { return drafts[id] !== undefined ? drafts[id] : cnt[id] ? cnt[id].qty : ''; }
function bar(d, t) { return '<div class="meter"><i class="' + (t && d === t ? 'full' : '') + '" style="width:' + (t ? d / t * 100 : 0) + '%"></i></div>'; }
function whV(m) {
  const all = live('객실'); const [d, t] = prog(all);
  m.innerHTML = '<div class="card head"><div class="row"><b>전체 <span class="num">' + d + ' / ' + t + '</span></b><span class="pill ' + (d === t ? 'ok' : '') + '">' + (d === t ? '다 셌음' : '남은 ' + (t - d) + '개') + '</span></div>' + bar(d, t) + '</div>' +
    '<p class="hint" style="margin:0 2px">창고를 골라 주세요.</p>' +
    whList().map(w => { const l = all.filter(x => inWh(x, w.id)); if (!l.length) return ''; const [a, b] = prog(l);
      return '<button class="big wh" data-wh="' + w.id + '"><span class="row"><span class="t">' + esc(w.name) + '</span><span class="pill ' + (a === b ? 'ok' : '') + '">' + (a === b ? '완료' : a + ' / ' + b) + '</span></span>' + bar(a, b) + '</button>'; }).join('') +
    '<button class="btn" data-finish="1">객실 조사 다 했어요</button>';
}
function curList() { return part === '객실' ? live('객실').filter(x => inWh(x, wh)) : live('사우나'); }
function countV(m) {
  const L = curList(); const shown = L.filter(x => filter === 'all' || !has(x.id));
  let rows = '';
  if (!cntReady) rows = '<div class="notice">기록을 불러오는 중이에요…</div>';
  else if (!shown.length) rows = '<div class="card alldone">이 목록은 다 셌어요 👍</div>';
  else if (part === '사우나') SAUNA_GROUPS.forEach(([a, b, g]) => { const l = shown.filter(x => x.order >= a && x.order <= b); if (l.length) rows += '<div class="sec">' + g + '</div>' + l.map(itemV).join(''); });
  else rows = shown.map(itemV).join('');
  m.innerHTML = '<div class="stick"><div class="card head" id="head"></div>' +
    '<div class="chips"><button class="chip ' + (filter === 'all' ? 'on' : '') + '" data-f="all">전체</button><button class="chip ' + (filter === 'left' ? 'on' : '') + '" data-f="left">안 센 것만</button></div></div>' +
    rows + (part === '객실' ? '<button class="btn" data-go="wh">창고 목록으로</button>' : '<button class="btn" data-finish="1">사우나 조사 다 했어요</button>');
  drawHead();
}
function drawHead() {
  const h = $('#head'); if (!h) return;
  const [d, t] = prog(curList());
  h.innerHTML = '<div class="row"><b>입력 <span class="num">' + d + ' / ' + t + '</span></b><span class="pill ' + (d === t ? 'ok' : '') + '">' + (d === t ? '다 셌음' : '남은 ' + (t - d) + '개') + '</span></div>' + bar(d, t);
}
function itemState(id) {
  if (drafts[id] !== undefined) return '<span class="stt wait">입력 중…</span>';
  const c = cnt[id]; if (!c) return '';
  if (c.pending) return '<span class="stt wait">휴대폰에 보관됨 · 보내는 중</span>';
  return '<span class="stt ok">✓ 저장됨 ' + hm(c.t) + (c.by && c.by !== name ? ' · ' + esc(c.by) : '') + '</span>';
}
function itemV(x) {
  const v = valOf(x.id), h = v !== '';
  return '<div class="item ' + (h ? 'has' : '') + '" id="it-' + x.id + '"><div class="nm">' + esc(x.name) + '</div>' +
    (part === '사우나' && x.memo ? '<div class="memo">' + esc(x.memo) + '</div>' : '') +
    '<div class="ctl"><button class="pm" data-d="-1" data-id="' + x.id + '" aria-label="하나 빼기">−</button>' +
    '<input class="qty" inputmode="numeric" pattern="[0-9]*" data-id="' + x.id + '" value="' + v + '" placeholder="–" aria-label="' + esc(x.name) + ' 수량">' +
    '<button class="pm" data-d="1" data-id="' + x.id + '" aria-label="하나 더하기">＋</button><span class="u">' + esc(x.unit || '') + '</span></div>' +
    '<div class="state">' + itemState(x.id) + '</div></div>';
}
function drawItem(id) {
  const el = document.getElementById('it-' + id); if (!el) return;
  const x = items.filter(i => i.id === id)[0]; if (!x) return;
  const a = document.activeElement, focused = a && a.dataset && a.dataset.id === id;
  if (focused) { el.classList.toggle('has', valOf(id) !== ''); el.querySelector('.state').innerHTML = itemState(id); return; }
  el.outerHTML = itemV(x);
}
function doneV(m) {
  const pend = Object.keys(cnt).filter(k => cnt[k].pending).length + Object.keys(drafts).length;
  m.innerHTML = '<div class="done"><div class="ck">✓</div><h2>' + part + ' 재고조사를<br>마쳤어요</h2>' +
    (pend ? '<p class="wait">아직 보내는 중인 기록이 ' + pend + '건 있어요.<br>인터넷 되는 곳에서 앱을 잠깐 열어 두세요.</p>' : '<p>모든 숫자가 저장됐어요. 고생하셨습니다.</p>') +
    '<p class="hint">고칠 숫자가 있으면 다시 들어가서 바꾸면 돼요 (관리자가 마감하기 전까지).</p></div><button class="btn ghost" data-go="home">처음으로</button>';
}
function drawSync() {
  const el = $('#sync'); if (!el) return;
  const pend = Object.keys(cnt).filter(k => cnt[k].pending).length;
  const off = navigator.onLine === false;
  el.textContent = off ? '인터넷 끊김 · 숫자는 휴대폰에 먼저 저장돼요' + (pend ? ' (보낼 것 ' + pend + '건)' : '')
    : pend ? '보내는 중 ' + pend + '건…' : cntReady ? '모두 저장됨' : '';
}
function drawBands() {
  let h = '';
  if (failed) h += '<div class="band err"><b>저장이 막힌 숫자가 있어요.</b> 관리자에게 알려 주세요.<button data-x-failed="1">닫기</button></div>';
  if (newVer) h += '<div class="band ver"><span>새 버전이 나왔어요.</span><button data-reload="1">새로 고침</button></div>';
  $('#bands').innerHTML = h;
}

// =====================================================================
// 관리자 로그인 창
// =====================================================================
function drawDlg() {
  const el = $('#sheet');
  if (!dlg) { el.innerHTML = ''; el.className = ''; return; }
  el.className = 'on';
  if (isAdm) {
    el.innerHTML = '<div class="dlg"><h3>관리자</h3><p>' + esc((ADMINS.filter(a => a.uid === user.uid)[0] || {}).label) + '로 로그인되어 있어요.</p>' +
      '<button class="btn" data-adm-go="1">관리자 화면</button><button class="btn ghost" data-logout="1">로그아웃 (근무자 휴대폰으로)</button><button class="btn ghost" data-close="1">닫기</button></div>';
    return;
  }
  el.innerHTML = '<div class="dlg"><h3>관리자 로그인</h3><p>처음 한 번만 로그인하면 이 기기에서는 계속 관리자로 열려요.</p>' +
    '<div class="seg">' + ADMINS.map((a, i) => '<button data-who="' + i + '" class="' + ((dlg.who || 0) === i ? 'on' : '') + '">' + a.label + '</button>').join('') + '</div>' +
    '<input class="txt" id="pw" type="password" autocomplete="current-password" placeholder="비밀번호">' +
    (dlg.err ? '<p class="err">' + esc(dlg.err) + '</p>' : '') +
    '<button class="btn" data-login="1"' + (busy ? ' disabled' : '') + '>' + (busy ? '확인 중…' : '로그인') + '</button><button class="btn ghost" data-close="1">닫기</button></div>';
  setTimeout(() => { const p = $('#pw'); if (p) p.focus(); }, 50);
}
function login() {
  const pw = ($('#pw') || {}).value || ''; if (!pw) { dlg.err = '비밀번호를 넣어 주세요.'; drawDlg(); return; }
  busy = true; drawDlg();
  S.signInEmail(ADMINS[dlg.who || 0].email, pw).then(() => { busy = false; dlg = null; lsSet('inv_mode', null); drawDlg(); window.scrollTo(0, 0); })
    .catch(e => { busy = false; dlg.err = errText(e); drawDlg(); });
}

// =====================================================================
// 누르기
// =====================================================================
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) { if (e.target.id === 'sheet') { dlg = null; drawDlg(); } return; }
  const d = t.dataset;
  if (d.reload) { location.reload(); return; }
  if (d.xFailed) { failed = 0; drawBands(); return; }
  if (d.adminIn) { if (isAdm) { mode = 'admin'; lsSet('inv_mode', null); render(); window.scrollTo(0, 0); } else { dlg = { who: 0 }; drawDlg(); } return; }
  if (d.who) { dlg.who = +d.who; dlg.err = ''; drawDlg(); return; }
  if (d.login) { login(); return; }
  if (d.close) { dlg = null; drawDlg(); return; }
  if (d.admGo) { dlg = null; drawDlg(); mode = 'admin'; lsSet('inv_mode', null); render(); return; }
  if (d.logout) { dlg = null; drawDlg(); lsSet('inv_mode', null); mode = 'worker'; S.signOut(); return; }
  if (d.toWorker) { mode = 'worker'; lsSet('inv_mode', 'worker'); screen = 'home'; render(); window.scrollTo(0, 0); return; }
  if (mode === 'admin' && isAdm) { ADM.click(t, e); return; }
  if (d.part) {
    const n = ($('#nm') || {}).value; if (n !== undefined) name = n.trim().slice(0, 20);
    if (!name) { toast('이름을 먼저 적어 주세요'); $('#nm').focus(); return; }
    lsSet('inv_name', name); part = d.part; filter = 'all'; screen = part === '객실' ? 'wh' : 'count'; update(); window.scrollTo(0, 0); return;
  }
  if (d.go) { flushAll(); screen = d.go; filter = 'all'; if (d.go === 'home') part = null; update(); window.scrollTo(0, 0); return; }
  if (d.wh !== undefined) { wh = d.wh; screen = 'count'; filter = 'all'; render(); window.scrollTo(0, 0); return; }
  if (d.f) { filter = d.f; render(); return; }
  if (d.d) { const id = d.id, cur = valOf(id); setDraft(id, (cur === '' ? 0 : +cur) + (+d.d)); return; }
  if (d.finish) {
    flushAll();
    const L = part === '객실' ? live('객실') : live('사우나'); const left = L.filter(x => !has(x.id)).length;
    if (left) {
      toast('아직 안 센 품목이 ' + left + '개 있어요');
      if (part === '사우나') { filter = 'left'; render(); window.scrollTo(0, 0); }
      return;
    }
    screen = 'done'; render(); window.scrollTo(0, 0); return;
  }
});
document.addEventListener('change', e => {
  const i = e.target;
  if (mode === 'admin' && isAdm) { ADM.change(i, e); return; }
  if (i.matches('input.qty')) {
    const v = i.value.replace(/[^0-9]/g, '');
    if (v === '') { delete drafts[i.dataset.id]; clearTimeout(timers[i.dataset.id]); delete timers[i.dataset.id]; i.value = valOf(i.dataset.id); drawItem(i.dataset.id); return; }
    setDraft(i.dataset.id, +v);
  }
  if (i.id === 'nm') { name = i.value.trim().slice(0, 20); lsSet('inv_name', name); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('input.qty')) {
    e.preventDefault(); const ins = [...document.querySelectorAll('input.qty')]; const k = ins.indexOf(e.target);
    e.target.blur(); if (ins[k + 1]) ins[k + 1].focus();
  }
  if (e.key === 'Enter' && e.target.id === 'pw') login();
});
document.addEventListener('focusout', () => { setTimeout(() => { if (renderLater && !typing()) { const y = window.scrollY; render(); window.scrollTo(0, y); } }, 0); });

// =====================================================================
// 휴대폰 오류 자동 기록 → Firestore inv_errors (같은 오류는 한 번, 한 번 열 때 최대 5건)
// =====================================================================
const errSent = {}; let errCount = 0;
export function report(where, msg) {
  try {
    const m = String(msg || '').slice(0, 500), k = where + '|' + m;
    if (!user || errSent[k] || errCount >= 5) return;
    errSent[k] = 1; errCount++;
    S.add('inv_errors', { at: S.SERVER_TIME, day: seoulDate(), uid: user.uid, name: String(name || (isAdm ? '관리자' : '')).slice(0, 20), ver: APP_VER, where: String(where).slice(0, 40), msg: m, ua: navigator.userAgent.slice(0, 200) }).done.catch(() => {});
  } catch (e) {}
}
window.addEventListener('error', e => report('화면', (e.message || '') + ' @' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || '')));
window.addEventListener('unhandledrejection', e => report('화면', 'promise: ' + (e.reason && (e.reason.message || e.reason) || '')));

// ---------- 관리자 화면 (admin.js)
const ADM = setupAdmin({
  S, esc, toast, report, seoulDate, latest, sortItems, WAREHOUSES,
  items: () => items, rounds: () => rounds, user: () => user,
  who: () => (ADMINS.filter(a => user && a.uid === user.uid)[0] || {}).label || '',
  redraw: () => { if (mode === 'admin' && isAdm) { if (typing()) { renderLater = true; return; } const y = window.scrollY; render(); window.scrollTo(0, y); } },
  ver: APP_VER
});

// ---------- 연결 상태 · 새 버전
window.addEventListener('online', update); window.addEventListener('offline', update);
setInterval(() => { if (mode === 'worker') drawSync(); }, 3000);
async function checkVer() {
  try { const r = await fetch(new URL('version.json', import.meta.url).href + '?t=' + Date.now(), { cache: 'no-store' }); const j = await r.json(); if (j && j.v && j.v !== APP_VER && j.v !== newVer) { newVer = j.v; drawBands(); } } catch (e) {}
}
checkVer(); setInterval(() => { if (document.visibilityState === 'visible') checkVer(); }, 5 * 60000);
if ('serviceWorker' in navigator && !window.__fake) navigator.serviceWorker.register('sw.js').catch(() => {});
window.__inv = { ver: APP_VER, state: () => ({ user, isAdm, mode, screen, part, wh, name, cnt, drafts, items: items.length, rounds }) };   // 시험·점검용
render();
