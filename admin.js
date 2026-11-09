// admin.js — 재고조사 관리자 화면 (부소장 PC · 소장). 화면 그리기·누르기를 이 모듈 하나에 모음
// → 나중에 '객실 통합 관리' 관리자 메뉴의 '재고' 탭으로 옮길 때 setupAdmin(ctx) 만 불러 쓰면 됨
// 탭: 진행 현황 · 사우나 결산 · 사우나 구매신청서 · 객실 조사표 · 품목 · 창고 · 회차
import { seedItems } from './items.js';

const TABS = [['prog', '진행 현황'], ['settle', '사우나 결산'], ['buy', '사우나 구매신청서'], ['room', '객실 조사표'], ['office', '사무실 조사표'], ['items', '품목 · 창고'], ['rounds', '회차']];
const ST = { g: '긴급', y: '입고 완료', r: '미입고' };
const ST_FILL = { g: '92D050', y: 'FFF200', r: 'FF7B7B', gray: 'D9D9D9' };
const EXCELJS = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';

export function setupAdmin(ctx) {
  const { S, esc, toast, report, seoulDate, latest, sortItems, WAREHOUSES } = ctx;
  let tab = 'prog', sel = null, want = null, cnt = {}, cntKey = '', cntSub = null, cntReady = false, cntBy = {};
  let buys = {}, errs = [], subs = [], seeding = false, newRound = null;

  function start() {
    stop();
    subs.push(S.listenQuery('inv_buy', null, docs => { buys = {}; docs.forEach(d => { buys[d.id] = d.data; }); ctx.redraw(); }, e => report('구매 읽기', e && e.code)));
    subs.push(S.listenQuery('inv_errors', null, docs => { errs = docs.map(d => Object.assign({ id: d.id }, d.data)).sort((a, b) => (b.at || 0) - (a.at || 0)); ctx.redraw(); }, () => {}));
  }
  function stop() { subs.forEach(f => f()); subs = []; if (cntSub) { cntSub(); cntSub = null; } cntKey = ''; }

  // ---------- 자료 도우미
  const items = () => ctx.items();
  const rounds = () => ctx.rounds().slice().sort((a, b) => b.id.localeCompare(a.id));
  const live = p => sortItems(items().filter(x => x.part === p && x.use !== false));
  function round() {
    const rs = rounds();
    if (want && rs.some(r => r.id === want)) { sel = want; want = null; }   // 방금 연 회차 (서버에서 돌아오기 전에는 그대로 기다림)
    if (!want && (!sel || !rs.some(r => r.id === sel))) sel = (rs.filter(r => r.status === '진행')[0] || rs[0] || {}).id || null;
    return rs.filter(r => r.id === sel)[0] || null;
  }
  function prevRound(r) { return rounds().filter(x => x.id < r.id)[0] || null; }
  function watch() {
    const r = round(), key = r ? r.id : '';
    if (key === cntKey) return;
    if (cntSub) { cntSub(); cntSub = null; }
    cntKey = key; cnt = {}; cntBy = {}; cntReady = false;
    if (!key) return;
    cntSub = S.listenQuery('inv_counts', [['round', '==', key]], docs => {
      cnt = latest(docs); cntReady = true; cntBy = { 객실: {}, 사우나: {}, 사무실: {} };
      docs.forEach(d => { const x = d.data; if (cntBy[x.part]) { const o = cntBy[x.part][x.by] || (cntBy[x.part][x.by] = { n: 0, t: 0 }); o.n++; o.t = Math.max(o.t, x.clientAt || 0); } });
      ctx.redraw();
    }, e => report('기록 읽기', e && e.code));
  }
  // 이번 회차 숫자 (마감된 회차는 마감 때 남긴 final 이 기준)
  function qty(r, id) {
    if (r && r.status === '마감' && r.final && r.final[id] !== undefined && r.final[id] !== null) return r.final[id];
    return cnt[id] && cnt[id].qty !== null ? cnt[id].qty : undefined;   // null = 지움(안 셈)
  }
  function carryOf(r, id) {
    if (r.carry && r.carry[id] !== undefined && r.carry[id] !== null) return { v: r.carry[id], src: '직접' };
    const p = prevRound(r);
    if (p && p.final && p.final[id] !== undefined && p.final[id] !== null) return { v: p.final[id], src: '지난달' };
    return { v: 0, src: '' };
  }
  function inbOf(r, id) {
    if (r.inb && r.inb[id] !== undefined && r.inb[id] !== null) return { v: r.inb[id], src: '직접' };
    const p = prevRound(r), b = p && buys[p.id];
    if (b && b.st && b.st[id] === 'y' && b.qty && b.qty[id]) return { v: b.qty[id], src: '입고 완료' };
    return { v: 0, src: '' };
  }
  const ym = r => ({ y: r.y, m: r.m, yy: String(r.y).slice(2) });
  function lastDay(y, m) { return new Date(y, m, 0).getDate(); }
  function fmtDate(d) { if (!d) return ''; const [y, m, dd] = d.split('-'); return y + '년 ' + (+m) + '월 ' + (+dd) + '일'; }
  function whName(id) { return (WAREHOUSES.filter(w => w.id === id)[0] || { name: '창고 미지정' }).name; }
  const n0 = v => (v === undefined || v === null || v === '' ? '' : v);

  // =====================================================================
  // 그리기
  // =====================================================================
  function render(main) {
    watch();
    const r = round(), rs = rounds();
    let h = '<header class="ahd"><div class="ahd-row"><h1>재고조사 · 관리자</h1>' +
      (rs.length ? '<select class="rsel" data-k="round" aria-label="회차">' + rs.map(x => '<option value="' + x.id + '"' + (r && x.id === r.id ? ' selected' : '') + '>' + esc(x.title) + ' · ' + x.status + '</option>').join('') + '</select>' : '') +
      '<span class="who">' + esc(ctx.who()) + '</span><button class="lnk" data-to-worker="1">근무자 화면</button><button class="lnk" data-admin-in="1">로그아웃</button></div>' +
      '<nav class="tabs">' + TABS.map(([k, n]) => '<button data-tab="' + k + '" class="' + (tab === k ? 'on' : '') + '">' + n + '</button>').join('') + '</nav></header>';
    if (!items().length && tab !== 'items') h += '<div class="band err"><b>품목이 아직 없어요.</b> \'품목 · 창고\' 탭에서 기본 품목을 넣어 주세요.<button data-tab="items">가기</button></div>';
    else if (!r && tab !== 'rounds' && tab !== 'items') h += '<div class="band err"><b>재고조사 회차가 없어요.</b> \'회차\' 탭에서 이번 달 조사를 열어 주세요.<button data-tab="rounds">가기</button></div>';
    h += '<div class="pane">' + (({ prog, settle, buy, room, office, items: itemsT, rounds: roundsT })[tab])(r) + '</div><p class="ver">재고조사 앱 ' + ctx.ver + '</p>';
    const sc = main.querySelector('.scroll'), st = sc ? sc.scrollTop : 0;
    main.innerHTML = h;
    const s2 = main.querySelector('.scroll'); if (s2) s2.scrollTop = st;
  }

  // ---------- 진행 현황
  function prog(r) {
    if (!r) return '';
    let h = '';
    const neg = live('사우나').filter(x => qty(r, x.id) !== undefined && carryOf(r, x.id).src && carryOf(r, x.id).v + inbOf(r, x.id).v - qty(r, x.id) < 0);
    if (neg.length) h += '<div class="band err"><b>사우나 결산 확인 필요 ' + neg.length + '건</b> — 조사 재고가 (전월이월 + 입고)보다 많아요: ' + neg.map(x => esc(x.name)).join(', ') + '<button data-tab="settle">결산 보기</button></div>';
    const card = (p, sub, extra) => {
      const L = live(p), d = L.filter(x => qty(r, x.id) !== undefined).length, t = L.length;
      const by = cntBy[p] ? Object.keys(cntBy[p]) : [];
      return '<div class="acard"><h2>' + p + ' 재고조사</h2><div class="s">' + sub + '</div>' +
        '<div class="big-n"><span class="num">' + d + '</span> <small>/ ' + t + '</small>' + (d === t && t ? '<span class="pill ok">다 셌음</span>' : '') + '</div>' +
        '<div class="meter"><i class="' + (d === t && t ? 'full' : '') + '" style="width:' + (t ? d / t * 100 : 0) + '%"></i></div>' + (extra ? extra(L) : '') +
        '<div class="s" style="margin-top:10px">입력한 사람: ' + (by.length ? by.map(n => esc(n || '(이름 없음)')).join(', ') : '아직 없음') + '</div>' +
        (d < t ? '<details><summary>안 센 품목 ' + (t - d) + '개 보기</summary><p class="left">' + L.filter(x => qty(r, x.id) === undefined).map(x => esc(x.name)).join(' · ') + '</p></details>' : '') + '</div>';
    };
    h += '<div class="grid2">' + card('객실', '하우스맨(키퍼) · 월말 1회', L => WAREHOUSES.map(w => { const l = L.filter(x => x.wh === w.id), d = l.filter(x => qty(r, x.id) !== undefined).length;
      return l.length ? '<div class="whrow"><span>' + esc(w.name) + '</span><div class="meter"><i class="' + (d === l.length ? 'full' : '') + '" style="width:' + d / l.length * 100 + '%"></i></div><span class="num">' + d + '/' + l.length + '</span></div>' : ''; }).join('')) +
      card('사우나', '사우나 근무자 · 월말 1회') +
      (live('사무실').length ? card('사무실', '사무실 · 월말 1회') : '<div class="acard"><h2>사무실 재고조사</h2><div class="s">아직 품목이 없어요. \'품목 · 창고\' 탭 맨 아래 \'사무실 품목\'에서 넣으면 근무자 첫 화면에 \'사무실 재고조사\' 버튼이 생겨요.</div><div class="tools"><button class="btn ghost" data-tab="items">품목 넣으러 가기</button></div></div>') + '</div>';
    h += '<div class="acard"><h2>' + esc(r.title) + ' · ' + r.status + '</h2><div class="s">조사일 ' + fmtDate(r.day) + '. 조사가 끝나면 → <b>사우나 결산</b> 확인 → <b>사우나 구매신청서</b> 작성·인쇄 → <b>조사 마감</b> 순서로 해 주세요.<br>' +
      '마감하면 근무자 휴대폰에서 숫자를 더 못 바꾸고, 이번 재고가 다음 달 \'전월이월\'로 넘어가요.</div><div class="tools">' +
      (r.status === '진행' ? '<button class="btn" data-close-round="1">조사 마감</button>' : '<button class="btn ghost" data-reopen="1">마감 풀기 (다시 진행)</button>') + '</div></div>';
    if (errs.length) h += '<details class="acard"><summary>📵 휴대폰 오류 ' + errs.length + '건</summary><table class="t"><tr><th>시각</th><th>이름</th><th>어디</th><th>내용</th></tr>' +
      errs.slice(0, 20).map(e => '<tr><td>' + esc(e.day || '') + ' ' + (e.at ? new Date(e.at).toTimeString().slice(0, 5) : '') + '</td><td>' + esc(e.name) + '</td><td>' + esc(e.where) + '</td><td class="sm">' + esc(e.msg) + '</td></tr>').join('') + '</table></details>';
    return h;
  }

  // ---------- 사우나 결산
  function settleRows(r) {
    return live('사우나').map((x, i) => { const c = carryOf(r, x.id), b = inbOf(r, x.id), q = qty(r, x.id);
      return { x, no: i + 1, c, b, q, out: q === undefined ? undefined : c.v + b.v - q }; });
  }
  function settle(r) {
    if (!r) return '';
    const rows = settleRows(r), first = !prevRound(r), lock = r.status === '마감';
    return '<div class="note"><b>세는 것은 재고 하나만.</b> 전월이월 = 지난달 조사값, 당월입고 = 지난달 구매신청서에서 \'입고 완료\' 표시한 수량이 자동으로 들어가요. ' +
      '<b>당월출고 = 전월이월 + 당월입고 − 당월재고</b> 로 계산돼요. 흰 칸은 직접 고칠 수 있어요 (고친 칸은 \'직접\').' +
      (first ? '<br><b>첫 달이라 지난달 기록이 없어요</b> → 전월이월을 지금 쓰시는 세부결산 엑셀의 숫자로 한 번만 넣어 주세요.' : '') + '</div>' +
      '<div class="tools"><button class="btn" data-xls="settle">엑셀 내려받기 (소모품 세부결산 양식)</button>' + (cntReady ? '' : '<span class="s">불러오는 중…</span>') + '</div>' +
      '<div class="scroll"><table class="t"><thead><tr><th>NO</th><th>품목</th><th>단위</th><th>전월이월</th><th>당월입고</th><th>당월출고 (자동)</th><th>당월재고 (조사)</th></tr></thead><tbody>' +
      rows.map(o => '<tr><td class="n">' + o.no + '</td><td>' + esc(o.x.name) + '</td><td class="c">' + esc(o.x.unit) + '</td>' +
        '<td class="n"><input class="ni" data-k="carry" data-id="' + o.x.id + '" value="' + o.c.v + '"' + (lock ? ' disabled' : '') + '><small>' + o.c.src + '</small></td>' +
        '<td class="n"><input class="ni" data-k="inb" data-id="' + o.x.id + '" value="' + o.b.v + '"' + (lock ? ' disabled' : '') + '><small>' + o.b.src + '</small></td>' +
        '<td class="n ' + (o.out !== undefined && o.out < 0 ? 'bad' : 'auto') + '">' + (o.out === undefined ? '—' : o.out + (o.out < 0 ? ' ⚠' : '')) + '</td>' +
        '<td class="n">' + (o.q === undefined ? '<span class="s">안 셈</span>' : o.q) + '</td></tr>').join('') + '</tbody></table></div>';
  }

  // ---------- 사우나 구매신청서
  function buyDoc(r) { return (r && buys[r.id]) || {}; }
  // 줄 색: 표시(긴급·입고 완료·미입고)한 줄만. 나머지는 흰 바탕 (11/7 사용자 요청 — 발주 0 회색 없앰)
  function rowCls(b, id) { return (b.st && b.st[id]) || ''; }
  function buyPaper(r) {
    const b = buyDoc(r), L = live('사우나');
    let rows = L.map((x, i) => { const q = qty(r, x.id);
      return '<tr class="' + rowCls(b, x.id) + '"><td class="c">' + (i + 1) + '</td><td>' + esc(x.name) + '</td><td class="n">' + n0(q) + '</td><td class="c">' + esc(x.unit) + '</td><td class="n">' + n0(b.qty && b.qty[x.id]) + '</td><td class="sm">' + esc(x.memo) + '</td></tr>'; }).join('');
    for (let i = L.length + 1; i <= Math.max(35, L.length + 1); i++) rows += '<tr><td class="c">' + i + '</td><td></td><td></td><td></td><td></td><td></td></tr>';
    return '<div class="paper pf"><h1>사 우 나 구 매 신 청 서</h1><div class="date">신청 일자 ' + fmtDate(b.date || r.day) + '</div>' +
      '<table><thead><tr><th style="width:36px">번호</th><th>품 명</th><th style="width:64px">현재 재고</th><th style="width:44px">단위</th><th style="width:64px">구매수량</th><th>비 고</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="leg"><span style="--c:#FFF200">입고 완료</span><span style="--c:#FF7B7B">미입고</span><span style="--c:#92D050">긴급 요청 건</span></div></div>';
  }
  function buy(r) {
    if (!r) return '';
    const b = buyDoc(r), L = live('사우나'), n = L.filter(x => b.qty && b.qty[x.id]).length;
    const sb = (id, k) => '<button data-bs="' + k + '" data-id="' + id + '" class="' + k + (b.st && b.st[id] === k ? ' on' : '') + '">' + ST[k] + '</button>';
    return '<div class="note"><b>현재 재고는 이번 조사 숫자가 자동으로 들어가요.</b> 구매수량만 적으면 오른쪽 신청서가 바로 바뀌어요. 줄 색은 긴급(초록) · 입고 완료(노랑) · 미입고(빨강)만, 나머지는 흰 바탕이에요. ' +
      '물건이 들어오면 \'입고 완료\'를 눌러 주세요 → 다음 달 결산의 \'당월입고\'로 자동으로 들어가요.</div>' +
      '<div class="tools"><label class="s">신청 일자 <input type="date" data-k="bdate" value="' + esc(b.date || r.day) + '"></label>' +
      '<button class="btn blue" data-print="buy">인쇄 · PDF 저장</button><button class="btn ghost" data-xls="buy">엑셀 내려받기</button><span class="s">' + n + '개 품목 신청</span></div>' +
      '<div class="split"><div class="scroll"><table class="t"><thead><tr><th>번호</th><th>품명</th><th>현재 재고</th><th>구매수량</th><th>표시</th></tr></thead><tbody>' +
      L.map((x, i) => '<tr><td class="n">' + (i + 1) + '</td><td>' + esc(x.name) + '</td><td class="n auto">' + n0(qty(r, x.id)) + ' <small>' + esc(x.unit) + '</small></td>' +
        '<td><input class="ni" data-k="bq" data-id="' + x.id + '" value="' + n0(b.qty && b.qty[x.id]) + '" placeholder="0"></td>' +
        '<td><div class="stb">' + sb(x.id, 'g') + sb(x.id, 'y') + sb(x.id, 'r') + '</div></td></tr>').join('') + '</tbody></table></div>' +
      '<div class="pwrap"><div class="pscale">' + buyPaper(r) + '</div></div></div>';
  }

  // ---------- 객실 조사표 (지금 쓰는 '저장품 재고조사' 3단 표 그대로) · 사무실 조사표 (같은 틀, 11/9 신설)
  const PAPER = { 객실: { title: '저장품 재고조사', dept: '객실팀' }, 사무실: { title: '사무실 재고조사', dept: '객실팀 사무실' } };
  function roomNames(r, p) { p = p || '객실'; const by = cntBy[p] ? Object.keys(cntBy[p]).filter(Boolean) : []; return by.join(', '); }
  function roomPaper(r, p) {
    p = p || '객실';
    const L = live(p), per = Math.max(30, Math.ceil(L.length / 3));
    let rows = '';
    for (let i = 0; i < per; i++) rows += '<tr>' + [i, i + per, i + per * 2].map(k => { const x = L[k];
      return '<td class="c">' + (k + 1) + '</td><td>' + (x ? esc(x.name) : '') + '</td><td class="n">' + (x ? n0(qty(r, x.id)) : '') + '</td>'; }).join('') + '</tr>';
    return '<div class="paper pr"><h1>' + r.y + '년 ' + r.m + '월 ' + PAPER[p].title + '</h1><table><thead><tr>' + '<th style="width:30px">NO</th><th>품목</th><th style="width:58px">재고량</th>'.repeat(3) + '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="sign">이름 : ' + esc(roomNames(r, p)) + '<span>부서 : ' + PAPER[p].dept + '</span><span>조사일 : ' + fmtDate(r.day) + '</span></div></div>';
  }
  function office(r) {
    if (!r) return '';
    if (!live('사무실').length) return '<div class="acard"><h2>사무실 품목이 아직 없어요</h2><div class="s">\'품목 · 창고\' 탭 맨 아래 \'사무실 품목\'에서 품목을 넣어 주세요. 넣는 순서대로 표에 나와요.</div><div class="tools"><button class="btn" data-tab="items">품목 넣으러 가기</button></div></div>';
    return '<div class="note">사무실 재고조사표예요. 객실 조사표와 같은 3단 표에 품목 순서대로 숫자가 채워지고, 이름 칸에는 입력한 사람이 자동으로 들어가요.</div>' +
      '<div class="tools"><button class="btn blue" data-print="office">인쇄 · PDF 저장</button><button class="btn ghost" data-xls="office">엑셀 내려받기</button></div>' +
      '<div class="pwrap"><div class="pscale">' + roomPaper(r, '사무실') + '</div></div>';
  }
  function room(r) {
    if (!r) return '';
    return '<div class="note">지금 쓰시는 <b>\'저장품 재고조사\' 표 그대로</b> 숫자가 채워져요. 근무자는 창고별로 세고, 표는 품목 순서대로 나와요. 이름 칸에는 입력한 사람이 자동으로 들어가요.</div>' +
      '<div class="tools"><button class="btn blue" data-print="room">인쇄 · PDF 저장</button><button class="btn ghost" data-xls="room">엑셀 내려받기</button></div>' +
      '<div class="pwrap"><div class="pscale">' + roomPaper(r) + '</div></div>';
  }

  // ---------- 품목 · 창고
  function itemsT() {
    if (!items().length) return '<div class="acard"><h2>품목이 아직 없어요</h2><div class="s">지금 쓰시는 양식의 품목(객실 ' + seedItems().filter(x => x.data.part === '객실').length + '개 · 사우나 ' + seedItems().filter(x => x.data.part === '사우나').length + '개)을 한 번에 넣어요.</div>' +
      '<div class="tools"><button class="btn" data-seed="1"' + (seeding ? ' disabled' : '') + '>' + (seeding ? '넣는 중…' : '기본 품목 넣기') + '</button></div></div>';
    const opt = v => WAREHOUSES.map(w => '<option value="' + w.id + '"' + (v === w.id ? ' selected' : '') + '>' + esc(w.name) + '</option>').join('');
    const all = p => sortItems(items().filter(x => x.part === p));
    const row = (x, i, L) => '<tr class="' + (x.use === false ? 'off' : '') + '"><td class="n">' + (i + 1) + '</td>' +
      '<td><input class="ti" data-k="iname" data-id="' + x.id + '" value="' + esc(x.name) + '" maxlength="40"></td>' +
      '<td><input class="ti u" data-k="iunit" data-id="' + x.id + '" value="' + esc(x.unit) + '" maxlength="8"></td>' +
      (x.part === '객실' ? '<td><select data-k="iwh" data-id="' + x.id + '">' + opt(x.wh) + (WAREHOUSES.some(w => w.id === x.wh) ? '' : '<option value="" selected>창고 미지정</option>') + '</select></td>'
        : '<td class="sm">' + esc(x.code || '') + '</td>') +
      '<td class="c"><label class="chk"><input type="checkbox" data-k="iuse" data-id="' + x.id + '"' + (x.use === false ? '' : ' checked') + '> 사용</label></td>' +
      '<td class="c nowrap"><button class="mv" data-mv="-1" data-id="' + x.id + '"' + (i ? '' : ' disabled') + '>▲</button><button class="mv" data-mv="1" data-id="' + x.id + '"' + (i < L.length - 1 ? '' : ' disabled') + '>▼</button></td></tr>';
    const tbl = (p, h3) => { const L = all(p); return '<div class="acard"><h2>' + h3 + ' <small>' + L.filter(x => x.use !== false).length + '개 사용</small></h2>' +
      '<div class="scroll"><table class="t"><thead><tr><th>순서</th><th>품목</th><th>단위</th><th>' + (p === '객실' ? '창고' : '자재코드') + '</th><th>사용</th><th>순서</th></tr></thead><tbody>' + L.map((x, i) => row(x, i, L)).join('') + '</tbody></table></div>' +
      '<div class="tools"><input class="ti" id="new-' + p + '" placeholder="새 품목 이름" maxlength="40"><button class="btn ghost" data-add="' + p + '">' + p + ' 품목 추가</button></div></div>'; };
    return '<div class="note">고친 내용은 칸에서 나오면 바로 저장되고 근무자 휴대폰에도 바로 반영돼요. 안 쓰는 품목은 지우지 말고 \'사용\'을 끄세요 (지난 기록이 남아요).</div>' +
      '<div class="grid2">' + tbl('객실', '객실 품목') + tbl('사우나', '사우나 품목') + '</div>' + tbl('사무실', '사무실 품목');
  }

  // ---------- 회차
  function roundsT() {
    const rs = rounds(), open = rs.filter(x => x.status === '진행')[0];
    const now = seoulDate().split('-'), latestR = rs[0];
    let y = +now[0], m = +now[1];
    if (latestR && (latestR.y > y || (latestR.y === y && latestR.m >= m))) { y = latestR.y; m = latestR.m + 1; if (m > 12) { m = 1; y++; } }
    const nr = newRound || { y, m };
    return '<div class="acard"><h2>새 회차 열기</h2><div class="s">월말 재고조사 한 번 = 회차 하나. 열면 근무자 휴대폰에 바로 나와요.' + (open ? '<br><b>지금 진행 중: ' + esc(open.title) + '</b> — 먼저 마감해야 새 회차를 열 수 있어요.' : '') + '</div>' +
      '<div class="tools"><select data-k="ny">' + [y - 1, y, y + 1].map(v => '<option' + (v === nr.y ? ' selected' : '') + '>' + v + '</option>').join('') + '</select>년 ' +
      '<select data-k="nm">' + Array.from({ length: 12 }, (_, i) => '<option' + (i + 1 === nr.m ? ' selected' : '') + '>' + (i + 1) + '</option>').join('') + '</select>월 ' +
      '<button class="btn" data-open-round="1"' + (open ? ' disabled' : '') + '>' + nr.y + '년 ' + nr.m + '월 재고조사 열기</button></div></div>' +
      '<div class="acard"><h2>지난 회차</h2>' + (rs.length ? '<table class="t"><tr><th>회차</th><th>조사일</th><th>상태</th><th></th></tr>' + rs.map(x => '<tr><td>' + esc(x.title) + '</td><td>' + fmtDate(x.day) + '</td><td>' + x.status + '</td><td><button class="btn ghost sm" data-pick="' + x.id + '">보기</button></td></tr>').join('') + '</table>' : '<div class="s">아직 없어요.</div>') + '</div>';
  }

  // =====================================================================
  // 누르기 · 고치기
  // =====================================================================
  const w = (p, ok) => p.then(() => { if (ok) toast(ok); }).catch(e => { toast('저장 실패: ' + ((e && e.code) || e)); report('관리자 저장', (e && e.code || '') + ' ' + (e && e.message || e)); });
  function click(t) {
    const d = t.dataset, r = round();
    if (d.tab) { tab = d.tab; ctx.redraw(); window.scrollTo(0, 0); return; }
    if (d.pick) { sel = d.pick; tab = 'prog'; ctx.redraw(); window.scrollTo(0, 0); return; }
    if (d.seed) {
      if (items().length || seeding) return;
      seeding = true; ctx.redraw();
      Promise.all(seedItems().map(x => S.set('inv_items/' + x.id, x.data))).then(() => { seeding = false; toast('기본 품목을 넣었어요'); ctx.redraw(); })
        .catch(e => { seeding = false; toast('넣지 못했어요: ' + (e && e.code || e)); ctx.redraw(); });
      return;
    }
    if (d.openRound) {
      const nr = newRound || {}; const y = +(nr.y || document.querySelector('[data-k=ny]').value), m = +(nr.m || document.querySelector('[data-k=nm]').value);
      const id = y + '-' + String(m).padStart(2, '0');
      if (rounds().some(x => x.id === id)) { toast('이미 있는 회차예요'); return; }
      if (rounds().some(x => x.status === '진행')) { toast('진행 중인 회차를 먼저 마감해 주세요'); return; }
      sel = want = id; newRound = null;
      w(S.set('inv_rounds/' + id, { title: y + '년 ' + m + '월 월말 재고조사', y, m, day: id + '-' + String(lastDay(y, m)).padStart(2, '0'), status: '진행', createdAt: S.SERVER_TIME, by: ctx.who() }), '회차를 열었어요 — 근무자 휴대폰에 나와요');
      tab = 'prog'; ctx.redraw(); return;
    }
    if (d.closeRound && r) {
      const all = items().filter(x => x.use !== false), left = all.filter(x => qty(r, x.id) === undefined).length;
      if (!t.dataset.sure) { t.dataset.sure = '1'; t.textContent = left ? '안 센 품목 ' + left + '개 — 그래도 마감 (한 번 더 누르기)' : '정말 마감할까요? (한 번 더 누르기)'; t.classList.add('red'); return; }
      const final = {}; Object.keys(cnt).forEach(k => { if (cnt[k].qty !== null && cnt[k].qty !== undefined) final[k] = cnt[k].qty; });
      w(S.patch('inv_rounds/' + r.id, { status: '마감', final, closedAt: S.SERVER_TIME, closedBy: ctx.who() }), '마감했어요');
      return;
    }
    if (d.reopen && r) { w(S.patch('inv_rounds/' + r.id, { status: '진행' }), '다시 진행으로 바꿨어요'); return; }
    if (d.bs && r) { const b = buyDoc(r), cur = b.st && b.st[d.id]; w(S.patch('inv_buy/' + r.id, { st: { [d.id]: cur === d.bs ? null : d.bs }, date: b.date || r.day })); return; }
    if (d.print && r) { print(d.print === 'buy' ? buyPaper(r) : roomPaper(r, d.print === 'office' ? '사무실' : '객실')); return; }
    if (d.xls && r) { xls(d.xls, r); return; }
    if (d.add) {
      const inp = document.getElementById('new-' + d.add), nm = (inp.value || '').trim(); if (!nm) { toast('새 품목 이름을 적어 주세요'); inp.focus(); return; }
      const L = items().filter(x => x.part === d.add), order = L.reduce((a, x) => Math.max(a, x.order || 0), 0) + 1;
      const id = ({ 객실: 'r', 사우나: 's', 사무실: 'o' })[d.add] + Date.now().toString(36);
      w(S.set('inv_items/' + id, { part: d.add, order, name: nm, unit: d.add === '사우나' ? 'EA' : '개', wh: d.add === '객실' ? WAREHOUSES[0].id : '', code: '', memo: '', use: true }), nm + ' 추가했어요');
      inp.value = '';
      return;
    }
    if (d.mv) {
      const x = items().filter(i => i.id === d.id)[0]; if (!x) return;
      const L = sortItems(items().filter(i => i.part === x.part)), k = L.indexOf(x), o = L[k + (+d.mv)]; if (!o) return;
      // 순서 번호를 1부터 다시 매기고 둘만 바꿈 (같은 번호가 섞여 있어도 안전)
      L.splice(k, 1); L.splice(k + (+d.mv), 0, x);
      L.forEach((it, i) => { if (it.order !== i + 1) w(S.patch('inv_items/' + it.id, { order: i + 1 })); });
      return;
    }
  }
  function num(v) { v = String(v).replace(/[^0-9]/g, ''); return v === '' ? null : Math.min(100000, +v); }
  function change(i) {
    const d = i.dataset, r = round();
    if (d.k === 'round') { sel = i.value; ctx.redraw(); return; }
    if (d.k === 'ny' || d.k === 'nm') { newRound = { y: +document.querySelector('[data-k=ny]').value, m: +document.querySelector('[data-k=nm]').value }; ctx.redraw(); return; }
    if (d.k === 'carry' && r) { w(S.patch('inv_rounds/' + r.id, { carry: { [d.id]: num(i.value) } })); return; }
    if (d.k === 'inb' && r) { w(S.patch('inv_rounds/' + r.id, { inb: { [d.id]: num(i.value) } })); return; }
    if (d.k === 'bq' && r) { w(S.patch('inv_buy/' + r.id, { qty: { [d.id]: num(i.value) }, date: buyDoc(r).date || r.day })); return; }
    if (d.k === 'bdate' && r) { if (i.value) w(S.patch('inv_buy/' + r.id, { date: i.value })); return; }
    if (d.k === 'iname') { const v = i.value.trim(); if (v) w(S.patch('inv_items/' + d.id, { name: v.slice(0, 40) })); return; }
    if (d.k === 'iunit') { w(S.patch('inv_items/' + d.id, { unit: i.value.trim().slice(0, 8) })); return; }
    if (d.k === 'iwh') { w(S.patch('inv_items/' + d.id, { wh: i.value }), '창고를 바꿨어요'); return; }
    if (d.k === 'iuse') { w(S.patch('inv_items/' + d.id, { use: i.checked })); return; }
  }

  // ---------- 인쇄 (A4 한 장) — 인쇄 창에서 'PDF로 저장'을 고르면 PDF
  function print(html) {
    const p = document.getElementById('print');
    p.innerHTML = html; document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); p.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { try { window.print(); } catch (e) { toast('인쇄 창을 열지 못했어요'); done(); } }, 60);
  }

  // ---------- 엑셀 (지금 쓰는 양식 그대로)
  let xlP = null;
  function loadXl() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (!xlP) xlP = new Promise((ok, no) => { const s = document.createElement('script'); s.src = EXCELJS; s.onload = () => ok(window.ExcelJS); s.onerror = () => { xlP = null; no(new Error('엑셀 프로그램을 받지 못했어요 (인터넷 확인)')); }; document.head.appendChild(s); });
    return xlP;
  }
  const thin = { style: 'thin', color: { argb: 'FF000000' } }, box = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = c => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + c } });
  function cellAll(ws, r1, r2, c1, c2, fn) { for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) fn(ws.getCell(r, c), r, c); }
  async function xls(kind, r) {
    let X; try { X = await loadXl(); } catch (e) { toast(e.message); return; }
    try {
      const wb = new X.Workbook(), { y, m, yy } = ym(r); let fname = '';
      wb.creator = '재고조사 앱';
      if (kind === 'settle') {
        const ws = wb.addWorksheet('원본'), rows = settleRows(r);
        ws.columns = [6, 30, 9, 9, 9, 9, 9, 9, 9, 9].map(w => ({ width: w }));
        ws.mergeCells('A1:J1'); ws.getCell('A1').value = yy + '년 ' + m + '월 소모품 세부결산 (단가변동 물품 익월 제외 예정)';
        ws.getCell('A1').font = { bold: true, size: 14 }; ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }; ws.getRow(1).height = 30;
        ws.mergeCells('A2:A3'); ws.mergeCells('B2:B3'); ['C2:D2', 'E2:F2', 'G2:H2', 'I2:J2'].forEach(a => ws.mergeCells(a));
        ws.getCell('A2').value = 'NO'; ws.getCell('B2').value = '품목'; ws.getCell('C2').value = '전월이월'; ws.getCell('E2').value = '당월입고'; ws.getCell('G2').value = '당월출고'; ws.getCell('I2').value = '당월재고';
        ['C', 'E', 'G', 'I'].forEach(c => { ws.getCell(c + '3').value = '수량'; ws.getCell(String.fromCharCode(c.charCodeAt(0) + 1) + '3').value = '금액'; });
        rows.forEach((o, i) => { const rr = 4 + i; ws.getRow(rr).values = [o.no, o.x.name, o.c.v, 0, o.b.v, 0, o.out === undefined ? null : o.out, 0, o.q === undefined ? null : o.q, 0]; });
        const last = 3 + rows.length;
        cellAll(ws, 2, last, 1, 10, (c, rr, cc) => { c.border = box; c.alignment = { horizontal: cc === 2 && rr > 3 ? 'left' : 'center', vertical: 'middle' }; if (rr <= 3) { c.fill = fill('EDEDED'); c.font = { bold: true }; } });
        fname = yy + '년 ' + m + '월 소모품 세부결산.xlsx';
      } else if (kind === 'buy') {
        const ws = wb.addWorksheet('구매원본'), b = buyDoc(r), L = live('사우나');
        ws.columns = [3, 6, 26, 10, 7, 10, 52, 3, 3, 14].map(w => ({ width: w }));
        ws.mergeCells('B2:G2'); ws.getCell('B2').value = '사 우 나 구 매 신 청 서'; ws.getCell('B2').font = { bold: true, size: 20 }; ws.getCell('B2').alignment = { horizontal: 'center', vertical: 'middle' }; ws.getRow(2).height = 40;
        cellAll(ws, 2, 2, 2, 7, c => { c.border = { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'medium' }, right: { style: 'medium' } }; });
        ws.mergeCells('B3:G3'); ws.getCell('B3').value = '신청 일자 ' + fmtDate(b.date || r.day); ws.getCell('B3').alignment = { horizontal: 'right' };
        ws.getRow(4).values = [null, '번호', '품 명', '현재 재고', '단위', '구매수량', '비 고'];
        const n = Math.max(35, L.length + 1);
        for (let i = 0; i < n; i++) { const x = L[i], rr = 5 + i;
          ws.getRow(rr).values = x ? [null, i + 1, x.name, qty(r, x.id) === undefined ? null : qty(r, x.id), x.unit, (b.qty && b.qty[x.id]) || null, x.memo] : [null, i + 1];
          const cls = x ? rowCls(b, x.id) : '';
          cellAll(ws, rr, rr, 2, 7, c => { if (cls) c.fill = fill(ST_FILL[cls]); }); }
        cellAll(ws, 4, 4 + n, 2, 7, (c, rr, cc) => { c.border = box; c.alignment = { horizontal: cc === 3 || cc === 7 ? 'left' : 'center', vertical: 'middle', wrapText: cc === 7 }; if (rr === 4) { c.fill = fill('EDEDED'); c.font = { bold: true }; } });
        [['y', '입고 완료'], ['r', '미입고'], ['g', '긴급 요청 건']].forEach(([k, t], i) => { const c = ws.getCell('J' + (5 + i * 2)); c.value = t; c.fill = fill(ST_FILL[k]); c.border = box; c.alignment = { horizontal: 'center' }; });
        ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1, printArea: 'B2:G' + (4 + n) };
        fname = '사우나 구매신청서 ' + (b.date || r.day) + '.xlsx';
      } else {
        const p = kind === 'office' ? '사무실' : '객실', T = PAPER[p];
        const ws = wb.addWorksheet('재고조사'), L = live(p), per = Math.max(30, Math.ceil(L.length / 3));
        ws.columns = [5, 20, 9, 5, 20, 9, 5, 20, 9].map(w => ({ width: w }));
        ws.mergeCells('A1:I1'); ws.getCell('A1').value = y + '년 ' + m + '월 ' + T.title; ws.getCell('A1').font = { bold: true, size: 16 }; ws.getCell('A1').alignment = { horizontal: 'center' }; ws.getRow(1).height = 30;
        ws.getRow(3).values = ['NO', '품목', '재고량', 'NO', '품목', '재고량', 'NO', '품목', '재고량'];
        for (let i = 0; i < per; i++) { const v = []; [i, i + per, i + per * 2].forEach(k => { const x = L[k]; v.push(k + 1, x ? x.name : null, x && qty(r, x.id) !== undefined ? qty(r, x.id) : null); }); ws.getRow(4 + i).values = v; }
        cellAll(ws, 3, 3 + per, 1, 9, (c, rr, cc) => { c.border = box; c.alignment = { horizontal: cc % 3 === 2 && rr > 3 ? 'left' : 'center', vertical: 'middle' }; if (rr === 3) { c.fill = fill('EDEDED'); c.font = { bold: true }; } });
        const fr = 5 + per; ws.mergeCells('A' + fr + ':I' + fr); ws.getCell('A' + fr).value = '이름 : ' + roomNames(r, p) + '          부서 : ' + T.dept + '          조사일 : ' + fmtDate(r.day);
        ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
        fname = y + '년 ' + m + '월 ' + T.title + '.xlsx';
      }
      const buf = await wb.xlsx.writeBuffer();
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = fname;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast(fname + ' 내려받았어요');
    } catch (e) { toast('엑셀을 만들지 못했어요: ' + (e && e.message || e)); report('엑셀', e && e.message || e); }
  }

  return { start, stop, render, click, change, _test: { settleRows: r => settleRows(r), round } };
}
