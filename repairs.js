// repairs.js — 가구 보수 이력 (2026-11-09 신설). 근무자 휴대폰 '가구 보수 접수' + 관리자 '가구 보수' 탭
// 데이터: Firestore inv_repairs/{자동} = 날짜·호실·품목·수량·접수자·비고·입력자·상태(접수/완료)·완료일
// 근무자는 '접수' 줄 만들기만, 완료 처리·고치기·지우기는 관리자만 (보안 규칙 v11)
import { REPAIRS_SEED } from './repairs_seed.js';

export const R_ITEMS = ['소파쿠션', '3인소파 본체', '사각의자(가죽)', '라운드의자'];
export const R_BY = ['객실과', 'CRO'];

export function setupRepairs(ctx) {
  const { S, esc, toast, report, seoulDate } = ctx;
  let list = [], ready = false, sub = null, err = '', retryT = 0;
  // 근무자 접수 칸
  let f = blank(true);
  function blank(all) { const o = { room: '', item: '', qty: 1, cush: [], memo: '' }; if (all || !f) { o.date = seoulDate(); o.by = '객실과'; } else { o.date = f.date; o.by = f.by; } return o; }
  // 관리자 보기
  let flt = { month: '', st: '', q: '' }, seeding = false, af = { date: seoulDate(), room: '', item: R_ITEMS[0], qty: 1, by: '객실과', memo: '' };

  function start() {
    if (sub) return;
    clearTimeout(retryT);
    sub = S.listenQuery('inv_repairs', null, docs => {
      list = docs.map(d => Object.assign({ id: d.id, pending: d.pending }, d.data)).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.clientAt || 0) - (b.clientAt || 0));
      ready = true; err = ''; ctx.redraw();
    }, e => {
      // 권한(규칙)·인터넷 문제로 읽기가 끊기면 '불러오는 중'에 멈추지 않고 알린 뒤 15초마다 다시 시도
      err = (e && e.code) || 'error'; report('보수 읽기', err);
      if (sub) { try { sub(); } catch (x) {} sub = null; }
      ctx.redraw(); retryT = setTimeout(start, 15000);
    });
  }
  function stop() { clearTimeout(retryT); if (sub) { sub(); sub = null; } }
  window.addEventListener('online', () => { if (err) { err = ''; start(); } });
  const errBox = () => '<div class="notice err-box"><strong>가구 보수 기록을 읽지 못했어요.</strong><br>' +
    (/permission/.test(err) ? '권한이 막혀 있어요 — 관리자에게 알려 주세요 (보안 규칙 v11 게시 확인).' : '인터넷 연결을 확인해 주세요.') + '<br><small>15초마다 자동으로 다시 시도해요.</small></div>';

  const md = d => d ? (+d.slice(5, 7)) + '월 ' + (+d.slice(8, 10)) + '일' : '';
  const mmdd = d => d ? d.slice(5, 7) + '월 ' + d.slice(8, 10) + '일' : '';
  function byRoom() { const m = {}; list.forEach(x => { (m[x.room] = m[x.room] || []).push(x); }); return m; }
  function memoOf() { const c = f.cush.slice().sort().join('.'); return [c ? c + '번' : '', f.memo.trim()].filter(Boolean).join(' ').slice(0, 100); }

  // =====================================================================
  // 근무자 휴대폰: 가구 보수 접수
  // =====================================================================
  function worker(m, name) {
    const hist = /^[0-9]{3,4}$/.test(f.room) ? (byRoom()[f.room] || []) : [];
    const recent = list.slice().reverse().slice(0, 8);
    const tg = (k, v, on, t) => '<button class="tg' + (on ? ' on' : '') + '" data-rf="' + k + '" data-v="' + esc(v) + '">' + esc(t || v) + '</button>';
    m.innerHTML =
      '<section class="card rform">' +
      '<div class="frow"><label class="l">날짜</label><input type="date" class="txt sm" data-rk="date" value="' + esc(f.date) + '"></div>' +
      '<div class="frow"><label class="l" for="rroom">호실</label><input id="rroom" class="txt big-in" data-rk="room" type="text" inputmode="numeric" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="예: 1713" value="' + esc(f.room) + '"></div>' +
      (hist.length ? '<div class="rhist">이 호실 이전 보수 <b>' + hist.length + '건</b> · ' + hist.slice(-3).reverse().map(x => md(x.date) + ' ' + esc(x.item)).join(' · ') + '</div>' : '') +
      '<label class="l">품목</label><div class="tgs g2">' + R_ITEMS.map(v => tg('item', v, f.item === v)).join('') + '</div>' +
      (f.item === '소파쿠션' ? '<label class="l">쿠션 번호 <small>(여러 개 고를 수 있어요)</small></label><div class="tgs g3">' + ['1', '2', '3'].map(v => tg('cush', v, f.cush.indexOf(v) >= 0, v + '번')).join('') + '</div>' : '') +
      '<label class="l">수량</label><div class="ctl rq"><button class="pm" data-rq="-1">−</button><div class="qty rqn num">' + f.qty + '</div><button class="pm" data-rq="1">＋</button><span class="u">개</span></div>' +
      '<label class="l">접수자</label><div class="tgs g2">' + R_BY.map(v => tg('by', v, f.by === v)).join('') + '</div>' +
      '<label class="l" for="rmemo">메모 <small>(없으면 비워 두세요)</small></label><input id="rmemo" class="txt" data-rk="memo" maxlength="60" placeholder="예: 등받이 흔들림" value="' + esc(f.memo) + '">' +
      '</section>' +
      '<button class="btn" data-rsave="1">접수하기</button>' +
      '<div class="sec">최근 접수</div>' +
      (err ? errBox() : ready ? (recent.length ? recent.map(x => '<div class="rrow"><div><b>' + esc(x.room) + '호</b> · ' + esc(x.item) + ' ' + x.qty + '개' + (x.memo ? ' <small>(' + esc(x.memo) + ')</small>' : '') + '<div class="s">' + md(x.date) + ' · ' + esc(x.by) + (x.who ? ' · ' + esc(x.who) : '') + '</div></div>' +
        (x.pending ? '<span class="pill">보내는 중</span>' : x.status === '완료' ? '<span class="pill ok">완료</span>' : '<span class="pill warn">접수</span>') + '</div>').join('') : '<div class="notice">아직 접수된 게 없어요.</div>')
        : '<div class="notice">불러오는 중이에요…</div>');
  }
  function workerSave(name, user) {
    if (!/^[0-9]{3,4}$/.test(f.room)) { toast('호실을 숫자로 적어 주세요 (예: 1713)'); const r = document.getElementById('rroom'); if (r) r.focus(); return; }
    if (!f.item) { toast('품목을 골라 주세요'); return; }
    if (!f.date) { toast('날짜를 골라 주세요'); return; }
    const d = { date: f.date, room: f.room, item: f.item, qty: f.qty, by: f.by, memo: memoOf(), who: name, status: '접수', at: S.SERVER_TIME, clientAt: new Date(), uid: user.uid };
    const w = S.add('inv_repairs', d);
    w.done.then(() => toast(d.room + '호 ' + d.item + ' 접수됐어요')).catch(e => { toast('접수가 막혔어요: ' + ((e && e.code) || e)); report('보수 접수', (e && e.code || '') + ' ' + (e && e.message || e)); });
    toast('접수했어요 · 보내는 중…');
    f = blank(false); ctx.redraw(); window.scrollTo(0, 0);
  }
  function workerClick(t, name, user) {
    const d = t.dataset;
    if (d.rf) {
      if (d.rf === 'item') { f.item = d.v; if (d.v !== '소파쿠션') f.cush = []; }
      if (d.rf === 'by') f.by = d.v;
      if (d.rf === 'cush') { const k = f.cush.indexOf(d.v); if (k >= 0) f.cush.splice(k, 1); else f.cush.push(d.v); if (f.cush.length) f.qty = f.cush.length; }
      keepInputs(); ctx.redraw(); return true;
    }
    if (d.rq) { f.qty = Math.max(1, Math.min(50, f.qty + (+d.rq))); keepInputs(); ctx.redraw(); return true; }
    if (d.rsave) { keepInputs(); workerSave(name, user); return true; }
    return false;
  }
  // 다시 그리기 전에 적던 칸 값을 챙김
  // 칸 값은 숫자만 4자리까지 — maxlength 대신 (일부 휴대폰 키보드에서 마지막 자리가 빠지는 문제, 11/9)
  const roomOf = v => String(v || '').replace(/[^0-9]/g, '').slice(0, 4);
  function keepInputs() { document.querySelectorAll('[data-rk]').forEach(i => { const k = i.dataset.rk; f[k] = k === 'room' ? roomOf(i.value) : i.value; }); }
  function workerChange(i) {
    if (!i.dataset.rk) return false;
    keepInputs(); if (i.dataset.rk === 'room') ctx.redraw();
    return true;
  }

  // =====================================================================
  // 관리자 '가구 보수' 탭
  // =====================================================================
  function filtered() {
    const q = flt.q.trim();
    return list.filter(x => (!flt.month || (x.date || '').slice(0, 7) === flt.month) && (!flt.st || (flt.st === '미완료' ? x.status !== '완료' : x.status === '완료')) && (!q || String(x.room).indexOf(q) >= 0 || (x.item || '').indexOf(q) >= 0));
  }
  function admin() {
    if (err) return errBox();
    if (!ready) return '<div class="notice">불러오는 중이에요…</div>';
    let h = '';
    if (!list.length) h += '<div class="acard"><h2>가구 보수 이력이 아직 없어요</h2><div class="s">지금 쓰시는 \'가구 보수 이력 현황\'(2025년 11월 26일 ~ 2026년 10월 17일) <b>' + REPAIRS_SEED.length + '건</b>을 한 번에 넣어요. 이전 기록이라 상태는 \'완료\'로 들어가요.</div><div class="tools"><button class="btn" data-rseed="1"' + (seeding ? ' disabled' : '') + '>' + (seeding ? '넣는 중…' : '기존 이력 ' + REPAIRS_SEED.length + '건 넣기') + '</button></div></div>';
    const open = list.filter(x => x.status !== '완료'), month = seoulDate().slice(0, 7), rooms = byRoom();
    const rep = Object.keys(rooms).filter(k => rooms[k].length >= 2).sort((a, b) => rooms[b].length - rooms[a].length || a.localeCompare(b));
    if (open.length) h += '<div class="band err"><b>아직 보수 안 된 접수 ' + open.length + '건</b> — 고치면 \'완료\'를 눌러 주세요.<button data-rflt-st="미완료">미완료만 보기</button></div>';
    h += '<div class="grid3">' +
      '<div class="acard"><h2>미완료</h2><div class="big-n"><span class="num" style="color:' + (open.length ? 'var(--warn)' : 'var(--done)') + '">' + open.length + '</span><small>건</small></div></div>' +
      '<div class="acard"><h2>이번 달 접수</h2><div class="big-n"><span class="num">' + list.filter(x => (x.date || '').slice(0, 7) === month).length + '</span><small>건</small></div></div>' +
      '<div class="acard"><h2>반복 호실 <small>2번 이상</small></h2><div class="big-n"><span class="num">' + rep.length + '</span><small>곳</small></div><div class="s">' + rep.slice(0, 8).map(k => '<button class="lnk2" data-rq-room="' + esc(k) + '">' + esc(k) + '호 ' + rooms[k].length + '번</button>').join(' ') + '</div></div></div>';
    // 직접 추가 (관리자)
    const sel = (k, arr, v) => '<select data-ak="' + k + '">' + arr.map(o => '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>';
    h += '<div class="acard"><h2>접수 추가</h2><div class="tools radd">' +
      '<input type="date" data-ak="date" value="' + esc(af.date) + '"><input class="ti" data-ak="room" placeholder="호실 (4자리)" inputmode="numeric" autocomplete="off" value="' + esc(af.room) + '" style="width:110px;min-width:0">' +
      sel('item', R_ITEMS, af.item) + '<input class="ni" data-ak="qty" value="' + af.qty + '" style="width:56px">' + sel('by', R_BY, af.by) +
      '<input class="ti" data-ak="memo" placeholder="비고 (예: 1.3번)" maxlength="60" value="' + esc(af.memo) + '" style="width:180px">' +
      '<button class="btn" data-radd="1">추가</button></div></div>';
    // 목록
    const months = Array.from(new Set(list.map(x => (x.date || '').slice(0, 7)))).sort().reverse();
    const L = filtered();
    h += '<div class="acard"><div class="tools" style="margin-top:0">' +
      '<select data-rflt="month"><option value="">전체 기간</option>' + months.map(v => '<option value="' + v + '"' + (flt.month === v ? ' selected' : '') + '>' + v.slice(0, 4) + '년 ' + (+v.slice(5)) + '월</option>').join('') + '</select>' +
      '<select data-rflt="st">' + [['', '전체 상태'], ['미완료', '미완료만'], ['완료', '완료만']].map(([v, t]) => '<option value="' + v + '"' + (flt.st === v ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>' +
      '<input class="ti" data-rflt="q" placeholder="호실 · 품목 찾기" value="' + esc(flt.q) + '" style="width:150px;min-width:0">' +
      (flt.month || flt.st || flt.q ? '<button class="btn ghost" data-rflt-clear="1">조건 지우기</button>' : '') +
      '<span class="s">' + L.length + '건 · 수량 ' + L.reduce((a, x) => a + (x.qty || 0), 0) + '개</span>' +
      '<button class="btn blue" data-rprint="1" style="margin-left:auto">인쇄 · PDF 저장</button><button class="btn ghost" data-rxls="1">엑셀 내려받기</button></div>' +
      '<div class="scroll" style="margin-top:12px"><table class="t"><thead><tr><th>NO</th><th>날짜</th><th>호실</th><th>품목</th><th>수량</th><th>접수자</th><th>비고</th><th>입력</th><th>상태</th><th></th></tr></thead><tbody>' +
      L.slice().reverse().map((x, i) => { const n = rooms[x.room] ? rooms[x.room].length : 0;
        return '<tr class="' + (x.status === '완료' ? '' : 'open') + '"><td class="n">' + (L.length - i) + '</td><td class="nowrap">' + esc(x.date) + '</td>' +
          '<td class="nowrap"><b>' + esc(x.room) + '</b>' + (n >= 2 ? ' <span class="rep">반복 ' + n + '</span>' : '') + '</td><td>' + esc(x.item) + '</td><td class="n">' + x.qty + '</td><td class="c">' + esc(x.by) + '</td>' +
          '<td>' + esc(x.memo || '') + '</td><td class="sm">' + esc(x.who || '') + '</td>' +
          '<td class="c nowrap">' + (x.status === '완료' ? '<span class="pill ok">완료' + (x.done ? ' ' + (+x.done.slice(5, 7)) + '/' + (+x.done.slice(8)) : '') + '</span> <button class="mini" data-rundo="' + x.id + '" title="접수로 되돌리기">↺</button>'
            : '<button class="mini go" data-rdone="' + x.id + '">완료 처리</button>') + '</td>' +
          '<td class="c"><button class="mini del" data-rdel="' + x.id + '">삭제</button></td></tr>'; }).join('') +
      '</tbody></table></div></div>';
    // 품목별 · 월별
    const cnt = (arr, key) => { const m = {}; arr.forEach(x => { const k = key(x); m[k] = m[k] || { n: 0, q: 0 }; m[k].n++; m[k].q += x.qty || 0; }); return m; };
    const byItem = cnt(L, x => x.item), byMonth = cnt(L, x => (x.date || '').slice(0, 7));
    h += '<div class="grid2"><div class="acard"><h2>품목별 <small>' + (flt.month ? flt.month : '전체 기간') + '</small></h2><table class="t"><tr><th>품목</th><th>건수</th><th>수량</th></tr>' +
      Object.keys(byItem).sort((a, b) => byItem[b].n - byItem[a].n).map(k => '<tr><td>' + esc(k) + '</td><td class="n">' + byItem[k].n + '</td><td class="n">' + byItem[k].q + '</td></tr>').join('') + '</table></div>' +
      '<div class="acard"><h2>월별</h2><div class="scroll" style="max-height:320px"><table class="t"><tr><th>월</th><th>건수</th><th>수량</th></tr>' +
      Object.keys(byMonth).sort().reverse().map(k => '<tr><td>' + k.slice(0, 4) + '년 ' + (+k.slice(5)) + '월</td><td class="n">' + byMonth[k].n + '</td><td class="n">' + byMonth[k].q + '</td></tr>').join('') + '</table></div></div></div>';
    return h;
  }
  // 'PDF 그대로' 가구 보수 이력 현황 (한 장 30줄, 오래된 순)
  function papers() {
    const L = filtered(); const pages = [];
    for (let p = 0; p < Math.max(1, Math.ceil(L.length / 30)); p++) {
      let rows = '';
      for (let i = 0; i < 30; i++) { const x = L[p * 30 + i];
        rows += '<tr><td class="c no">' + (i + 1) + '</td><td class="c">' + (x ? mmdd(x.date) : '') + '</td><td class="c">' + (x ? esc(x.room) : '') + '</td><td class="c">' + (x ? esc(x.item) : '') + '</td><td class="c">' + (x ? x.qty : '') + '</td><td class="c">' + (x ? esc(x.by) : '') + '</td><td class="c">' + (x ? esc(x.memo || '') : '') + '</td></tr>'; }
      pages.push('<div class="paper prp"><h1>가구 보수 이력 현황</h1><table><thead><tr><th style="width:44px">NO.</th><th>날짜</th><th>호실</th><th>품목</th><th style="width:48px">수량</th><th>접수자</th><th>비고</th></tr></thead><tbody>' + rows + '</tbody></table></div>');
    }
    return pages.join('');
  }
  async function xls(loadXl, box, fill, cellAll) {
    const X = await loadXl(); const L = filtered();
    const wb = new X.Workbook(), ws = wb.addWorksheet('가구 보수 이력');
    ws.columns = [6, 12, 8, 16, 6, 9, 16, 10, 8, 12].map(w => ({ width: w }));
    ws.mergeCells('A1:J1'); ws.getCell('A1').value = '가구 보수 이력 현황'; ws.getCell('A1').font = { bold: true, size: 16 }; ws.getCell('A1').alignment = { horizontal: 'center' }; ws.getRow(1).height = 30;
    ws.getRow(3).values = ['NO.', '날짜', '호실', '품목', '수량', '접수자', '비고', '입력', '상태', '완료일'];
    L.forEach((x, i) => { ws.getRow(4 + i).values = [i + 1, x.date, x.room, x.item, x.qty, x.by, x.memo || '', x.who || '', x.status || '', x.done || '']; });
    cellAll(ws, 3, 3 + L.length, 1, 10, (c, rr) => { c.border = box; c.alignment = { horizontal: 'center', vertical: 'middle' }; if (rr === 3) { c.fill = fill('EDEDED'); c.font = { bold: true }; } });
    ws.views = [{ state: 'frozen', ySplit: 3 }];
    const buf = await wb.xlsx.writeBuffer(), fname = '가구 보수 이력 ' + seoulDate() + '.xlsx';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = fname;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast(fname + ' 내려받았어요');
  }
  const w = (p, ok) => p.then(() => { if (ok) toast(ok); }).catch(e => { toast('저장 실패: ' + ((e && e.code) || e)); report('보수 저장', (e && e.code || '') + ' ' + (e && e.message || e)); });
  function adminClick(t, tools) {
    const d = t.dataset;
    if (d.rseed) {
      if (list.length || seeding) return true;
      seeding = true; ctx.redraw();
      Promise.all(REPAIRS_SEED.map((r, i) => S.set('inv_repairs/h' + String(i + 1).padStart(3, '0'), { date: r[0], room: r[1], item: r[2], qty: r[3], by: r[4], memo: r[5], who: '이전 기록', status: '완료', done: '', at: S.SERVER_TIME, clientAt: new Date(Date.parse(r[0] + 'T09:00:00+09:00')), uid: ctx.user().uid })))
        .then(() => { seeding = false; toast('기존 이력 ' + REPAIRS_SEED.length + '건을 넣었어요'); ctx.redraw(); })
        .catch(e => { seeding = false; toast('넣지 못했어요: ' + (e && e.code || e)); ctx.redraw(); });
      return true;
    }
    if (d.radd) {
      keepAdmin();
      if (!/^[0-9]{3,4}$/.test(af.room)) { toast('호실을 숫자로 적어 주세요'); return true; }
      w(S.add('inv_repairs', { date: af.date || seoulDate(), room: af.room, item: af.item, qty: Math.max(1, Math.min(50, +af.qty || 1)), by: af.by, memo: af.memo.trim().slice(0, 100), who: ctx.who() || '관리자', status: '접수', at: S.SERVER_TIME, clientAt: new Date(), uid: ctx.user().uid }).done, af.room + '호 접수 추가했어요');
      af = Object.assign({}, af, { room: '', memo: '', qty: 1 }); ctx.redraw(); return true;
    }
    if (d.rdone) { w(S.patch('inv_repairs/' + d.rdone, { status: '완료', done: seoulDate(), doneBy: ctx.who() }), '완료 처리했어요'); return true; }
    if (d.rundo) { w(S.patch('inv_repairs/' + d.rundo, { status: '접수', done: '' }), '접수로 되돌렸어요'); return true; }
    if (d.rdel) {
      if (!t.dataset.sure) { t.dataset.sure = '1'; t.textContent = '정말 삭제?'; t.classList.add('sure'); setTimeout(() => { if (t.isConnected) { delete t.dataset.sure; t.textContent = '삭제'; t.classList.remove('sure'); } }, 4000); return true; }
      w(S.del('inv_repairs/' + d.rdel), '삭제했어요'); return true;
    }
    if (d.rfltSt !== undefined) { flt.st = d.rfltSt; ctx.redraw(); return true; }
    if (d.rqRoom) { flt = { month: '', st: '', q: d.rqRoom }; ctx.redraw(); return true; }
    if (d.rfltClear) { flt = { month: '', st: '', q: '' }; ctx.redraw(); return true; }
    if (d.rprint) { tools.print(papers()); return true; }
    if (d.rxls) { xls(tools.loadXl, tools.box, tools.fill, tools.cellAll).catch(e => toast('엑셀을 만들지 못했어요: ' + (e && e.message || e))); return true; }
    return false;
  }
  function keepAdmin() { document.querySelectorAll('[data-ak]').forEach(i => { af[i.dataset.ak] = i.dataset.ak === 'room' ? roomOf(i.value) : i.value; }); }
  function adminChange(i) {
    if (i.dataset.ak) { keepAdmin(); return true; }
    if (i.dataset.rflt) { flt[i.dataset.rflt] = i.value; ctx.redraw(); return true; }
    return false;
  }
  return { start, stop, worker, workerClick, workerChange, admin, adminClick, adminChange, papers, _list: () => list };
}
