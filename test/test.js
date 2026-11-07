// 재고조사 앱 시험 — 가짜 Firebase(규칙 포함)로 실제 index.html · app.js · admin.js · style.css 를 휴대폰 여러 대로 돌려 봄
// 실행: NODE_PATH=/opt/node22/lib/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node test/test.js [EXCELJS 경로]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { makeDb, PW } = require('./fakedb.js');
const ROOT = path.join(__dirname, '..'), OUT = process.env.OUT || '/tmp/invtest';
const EXCELJS = process.argv[2] || '/home/claude/emu/node_modules/exceljs/dist/exceljs.min.js';
fs.mkdirSync(OUT, { recursive: true });
const db = makeDb();
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { fails++; console.log('  ✗ ' + m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

async function phone(browser, name, vp) {
  const ctx = await browser.newContext({ viewport: vp || { width: 360, height: 740 }, acceptDownloads: true, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  await ctx.exposeBinding('__fdb', (src, op, a) => db.call(op, a));
  await ctx.addInitScript(n => { window.__phone = n; }, name);
  await ctx.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.host === 'inv.test') {
      let p = u.pathname.replace(/^\/+/, '') || 'index.html';
      if (p === 'store.js') p = 'test/fake_store.js';
      const f = path.join(ROOT, p);
      if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      return route.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
    }
    if (u.host === 'cdn.jsdelivr.net' && u.pathname.includes('exceljs')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(EXCELJS) });
    return route.abort();
  });
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) page.errs.push(m.text()); });
  await page.goto('https://inv.test/');
  page.ctx = ctx;
  return page;
}
const shot = (p, n, full) => p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: !!full });
async function waitFor(p, fn, arg, ms) { try { await p.waitForFunction(fn, arg, { timeout: ms || 5000 }); return true; } catch (e) { return false; } }
const text = p => p.evaluate(() => document.body.innerText);

(async () => {
  const browser = await chromium.launch();

  console.log('1. 관리자 로그인 · 품목 넣기 · 회차 열기');
  const adm = await phone(browser, 'admin', { width: 1280, height: 900 });
  ok(await waitFor(adm, () => /진행 중인 재고조사가 없어요/.test(document.body.innerText)), '처음: 진행 중 회차 없음 안내');
  await adm.click('[data-admin-in]');
  await adm.fill('#pw', 'wrong'); await adm.click('[data-login]');
  ok(await waitFor(adm, () => /비밀번호가 맞지 않아요/.test(document.body.innerText)), '틀린 비밀번호 → 안내');
  await adm.fill('#pw', PW); await adm.click('[data-login]');
  ok(await waitFor(adm, () => /재고조사 · 관리자/.test(document.body.innerText)), '부소장 로그인 → 관리자 화면');
  await adm.click('[data-tab=items]'); await adm.click('[data-seed]');
  ok(await waitFor(adm, () => document.querySelectorAll('input[data-k=iname]').length === 110, null, 8000), '기본 품목 110개 (객실 76 · 사우나 34)');
  await adm.click('[data-tab=rounds]');
  await adm.selectOption('[data-k=ny]', '2026'); await adm.selectOption('[data-k=nm]', '11');
  await adm.click('[data-open-round]');
  ok(await waitFor(adm, () => /2026년 11월 월말 재고조사 · 진행/.test(document.body.innerText)), '2026-11 회차 열림');
  await adm.click('[data-tab=prog]'); await sleep(400);
  await shot(adm, 'a1_progress_empty');

  console.log('2. 하우스맨 휴대폰 (360px) — 객실');
  const hm = await phone(browser, 'hm');
  ok(await waitFor(hm, () => !!document.querySelector('[data-part="객실"]')), '근무자 첫 화면');
  await shot(hm, 'w1_home');
  await hm.click('[data-part="객실"]');
  ok(await waitFor(hm, () => /이름을 먼저/.test(document.getElementById('toast').textContent)), '이름 없으면 막힘');
  await hm.fill('#nm', '홍길순'); await hm.click('[data-part="객실"]');
  ok(await waitFor(hm, () => document.querySelectorAll('[data-wh]').length === 4), '창고 4곳 (기타 없음)');
  const t1 = await text(hm);
  ok(!/생수/.test(t1), '생수 없음');
  await shot(hm, 'w2_warehouses');
  await hm.click('[data-wh=b4]');
  ok(await waitFor(hm, () => /핸드타올\(미화\)/.test(document.body.innerText)), '핸드타올(미화) → 지하4층 소모품 창고');
  const sheets = await hm.evaluate(() => [...document.querySelectorAll('.item .nm')].filter(e => /^시트/.test(e.textContent)).length);
  ok(sheets === 1, '시트 하나로 통일');
  // ＋ 3번 → 3, 입력칸에 12
  const first = await hm.evaluate(() => document.querySelector('.item').id.slice(3));
  for (let i = 0; i < 3; i++) await hm.click('#it-' + first + ' [data-d="1"]');
  ok(await waitFor(hm, id => document.querySelector('#it-' + id + ' .qty').value === '3', first), '＋ 세 번 → 3');
  ok(await waitFor(hm, id => /저장됨/.test(document.querySelector('#it-' + id + ' .state').textContent), first, 6000), '서버 저장 확인 뒤 ✓ 저장됨');
  const ins = await hm.$$('input.qty');
  await ins[1].fill('12'); await ins[1].press('Enter');
  ok(await waitFor(hm, () => document.activeElement && document.activeElement.classList.contains('qty') && [...document.querySelectorAll('input.qty')].indexOf(document.activeElement) === 2), 'Enter → 다음 칸으로');
  await hm.keyboard.type('7'); await hm.keyboard.press('Tab');
  ok(await waitFor(hm, () => document.querySelectorAll('.item.has').length >= 3, null, 6000), '세 품목 입력됨');
  // 11/7 수정: ＋ 했다가 − 로 내리면 '안 셈'으로 돌아가야 함
  const hd = () => hm.evaluate(() => document.getElementById('head').textContent.replace(/\s+/g, ' '));
  const h0 = await hd();
  const six = await hm.evaluate(() => document.querySelectorAll('.item')[6].id.slice(3));
  await hm.click('#it-' + six + ' [data-d="1"]'); await hm.click('#it-' + six + ' [data-d="-1"]');
  ok(await waitFor(hm, id => document.querySelector('#it-' + id + ' .qty').value === '0', six), '＋ → − : 0 (재고 0개로 센 것)');
  await hm.click('#it-' + six + ' [data-d="-1"]');
  ok(await waitFor(hm, id => document.querySelector('#it-' + id + ' .qty').value === '' && !document.querySelector('#it-' + id).classList.contains('has'), six), '0 에서 − 한 번 더 → 빈 칸 (안 셈)');
  await sleep(1500);
  ok((await hd()) === h0, '진행률이 원래대로 (' + h0.trim() + ')');
  // 저장된 품목을 지우기: 칸 비우기
  const seven = await hm.evaluate(() => document.querySelectorAll('.item')[7].id.slice(3));
  await hm.locator('#it-' + seven + ' .qty').fill('5'); await hm.locator('#it-' + seven + ' .qty').press('Tab');
  ok(await waitFor(hm, id => /저장됨/.test(document.querySelector('#it-' + id + ' .state').textContent), seven, 6000), '5 저장됨');
  await hm.locator('#it-' + seven + ' .qty').fill(''); await hm.locator('#it-' + seven + ' .qty').press('Tab');
  ok(await waitFor(hm, id => /안 셈으로 되돌림/.test(document.querySelector('#it-' + id + ' .state').textContent), seven, 6000), '칸을 비우면 → 안 셈으로 되돌림 (서버 저장 확인)');
  const recs = [...db.docs.entries()].filter(([k, d]) => k.startsWith('inv_counts/') && d.item === seven).map(([k, d]) => d).sort((a, b) => a.clientAt.__ts - b.clientAt.__ts);
  ok(recs.length === 2 && recs[0].qty === 5 && recs[1].qty === null, '기록은 쌓기: 5 → 지움(null) 두 줄');
  await shot(hm, 'w3_count_b4');
  // 관리자 화면에 실시간 반영
  ok(await waitFor(adm, () => /입력한 사람: 홍길순/.test(document.body.innerText), null, 6000), '관리자 화면에 실시간 반영 (입력한 사람)');

  console.log('3. 오프라인 입력 → 다시 열기 → 자동 전송');
  ok(await waitFor(hm, () => { const st = window.__inv.state(); return !Object.keys(st.drafts).length && Object.values(st.cnt).every(c => !c.pending); }, null, 6000), '끊기 전: 모두 서버 저장됨');
  await hm.evaluate(() => { window.__offline = true; });
  const ins2 = await hm.$$('input.qty');
  await ins2[3].fill('44'); await ins2[3].press('Tab'); await sleep(1200);
  ok(await waitFor(hm, () => /휴대폰에 보관됨/.test(document.body.innerText)), '끊김: "휴대폰에 보관됨 · 보내는 중" 표시');
  const before = [...db.docs.keys()].filter(k => k.startsWith('inv_counts/')).length;
  await hm.reload(); await sleep(300);
  await hm.evaluate(() => { window.__offline = false; });
  ok(await waitFor(hm, () => !!document.querySelector('.item')), '다시 열기 → 보던 창고 목록으로 바로 돌아옴');
  await sleep(1500);
  const after = [...db.docs.keys()].filter(k => k.startsWith('inv_counts/')).length;
  ok(after === before + 1, '다시 열고 연결되자 대기 기록 자동 전송 (' + before + ' → ' + after + ')');
  const has44 = [...db.docs.values()].some(d => d.qty === 44);
  ok(has44, '보관했던 44 가 서버에 들어감');

  console.log('4. 사우나 휴대폰 — 34개 전부 입력');
  const sn = await phone(browser, 'sauna');
  await waitFor(sn, () => !!document.querySelector('[data-part]'));
  await sn.fill('#nm', '이나'); await sn.click('[data-part="사우나"]');
  ok(await waitFor(sn, () => document.querySelectorAll('.item').length === 34), '사우나 34개 품목');
  ok(/추가 품목/.test(await text(sn)) && /락카키밴드/.test(await text(sn)), '추가 품목 4개 (헤어젤·도크매트 소/대·락카키밴드)');
  await shot(sn, 'w4_sauna');
  // 11월 결산 엑셀의 당월재고 (예시)
  const SAMPLE = [43, 63, 0, 0, 29, 43, 18, 35, 44, 13, 15, 14, 3, 0, 52, 8, 18, 2, 300, 320, 2, 0, 14, 13, 9, 8, 8, 17, 0, 10, 0, 0, 0, 0];
  await sn.click('[data-finish]');
  ok(await waitFor(sn, () => /안 센 품목이 34개/.test(document.getElementById('toast').textContent)), '덜 셌으면 "다 했어요" 막힘');
  await sn.click('[data-f=all]');
  for (let i = 0; i < 34; i++) await sn.locator('input.qty').nth(i).fill(String(SAMPLE[i]));
  await sn.evaluate(() => document.activeElement.blur());
  ok(await waitFor(sn, () => document.querySelectorAll('.item.has').length === 34, null, 8000), '34개 입력');
  await sleep(1800);
  await sn.click('[data-finish]');
  ok(await waitFor(sn, () => /재고조사를/.test(document.body.innerText) && /마쳤어요/.test(document.body.innerText)), '"다 했어요" → 완료 화면');
  await shot(sn, 'w5_done');
  const sCount = [...db.docs.entries()].filter(([k, d]) => k.startsWith('inv_counts/') && d.part === '사우나').length;
  ok(sCount === 34, '서버에 사우나 34줄 (' + sCount + ')');

  console.log('5. 권한 (보안 규칙)');
  const deny1 = await sn.evaluate(() => window.__fdb('write', { uid: 'anon-sauna', path: 'inv_items/hack', data: { name: 'x' } }));
  ok(deny1 && deny1.denied, '근무자 → 품목 쓰기 거절');
  const deny2 = await sn.evaluate(() => window.__fdb('query', { uid: 'anon-sauna', c: 'inv_buy' }));
  ok(deny2 && deny2.denied, '근무자 → 구매신청서 읽기 거절');
  const deny3 = await sn.evaluate(() => window.__fdb('write', { uid: 'anon-sauna', path: 'inv_counts/x1', data: { round: '2026-11', part: '사우나', item: 's01', qty: -3, by: '이나', at: { __server: 1 }, clientAt: { __ts: 1 }, uid: 'anon-sauna' } }));
  ok(deny3 && deny3.denied, '음수 수량 거절');
  const deny4 = await sn.evaluate(() => window.__fdb('write', { uid: 'anon-sauna', path: 'inv_counts/x2', data: { round: '2026-11', part: '사우나', item: 's01', qty: 3, by: '이나', at: { __server: 1 }, clientAt: { __ts: 1 }, uid: 'someone-else' } }));
  ok(deny4 && deny4.denied, '남의 uid 로 쓰기 거절');
  const deny5 = await sn.evaluate(() => window.__fdb('write', { uid: 'anon-sauna', path: 'days/2026-11-07', data: { x: 1 } }));
  ok(deny5 && deny5.denied, '다른 앱 경로(days) 쓰기 거절');
  const anyCount = [...db.docs.keys()].find(k => k.startsWith('inv_counts/'));
  const deny6 = await sn.evaluate(p => window.__fdb('write', { uid: 'anon-sauna', path: p, data: { qty: 1 }, merge: true }), anyCount);
  ok(deny6 && deny6.denied, '근무자 → 기록 고치기 거절 (쌓기만)');

  console.log('6. 관리자 — 사우나 결산 · 구매신청서 · 객실 조사표');
  await adm.click('[data-tab=prog]');
  ok(await waitFor(adm, () => /34 \/ 34/.test(document.body.innerText.replace(/\s+/g, ' '))), '진행 현황: 사우나 34/34');
  await shot(adm, 'a2_progress', true);
  await adm.click('[data-tab=settle]');
  ok(await waitFor(adm, () => /첫 달이라/.test(document.body.innerText)), '첫 달: 전월이월 직접 입력 안내');
  // 11월 결산 엑셀의 전월이월 · 당월입고 (탕의자 20/0, 드라이기 3/10)
  const CARRY = [30, 40, 0, 0, 32, 27, 33, 32, 28, 32, 41, 14, 1, 0, 69, 3, 23, 2, 100, 400, 2, 0, 16, 20, 9, 8, 9, 17, 0, 3];
  const INB = [42, 42, 0, 0, 20, 30, 10, 16, 32, 0, 0, 30, 5, 0, 20, 5, 0, 5, 390, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10];
  for (let i = 0; i < 30; i++) {
    if (CARRY[i]) { const c = adm.locator('input[data-k=carry]').nth(i); await c.fill(String(CARRY[i])); await c.press('Tab'); }
    if (INB[i]) { const c = adm.locator('input[data-k=inb]').nth(i); await c.fill(String(INB[i])); await c.press('Tab'); }
  }
  await adm.evaluate(() => document.activeElement.blur()); await sleep(1500);
  const outs = await adm.evaluate(() => [...document.querySelectorAll('table.t tbody tr')].map(tr => tr.children[5].textContent.trim()));
  ok(outs[0] === '29' && outs[1] === '19', '출고 자동: 엠케어 스킨 29 · 로션 19 (엑셀과 같음)');
  ok(outs[23] === '7', '사우나탕의자 출고 7 (엑셀에서 빠졌던 출고)');
  ok(outs[29] === '3', '헤어드라이기 출고 3 (엑셀에서 빠졌던 출고)');
  ok(outs[18] === '190' && outs[19] === '180', '거품타올 남 190 · 여 180');
  await shot(adm, 'a3_settle');
  let dl = adm.waitForEvent('download'); await adm.click('[data-xls=settle]'); dl = await dl;
  const f1 = path.join(OUT, dl.suggestedFilename()); await dl.saveAs(f1);
  ok(fs.existsSync(f1), '결산 엑셀 내려받기: ' + dl.suggestedFilename());

  await adm.click('[data-tab=buy]');
  await waitFor(adm, () => document.querySelectorAll('input[data-k=bq]').length === 34);
  const BUY = { 0: 20, 1: 20, 6: 10, 7: 16, 18: 200, 19: 100 };
  for (const k of Object.keys(BUY)) { const c = adm.locator('input[data-k=bq]').nth(+k); await c.fill(String(BUY[k])); await c.press('Tab'); }
  await adm.evaluate(() => document.activeElement.blur()); await sleep(800);
  await adm.click('[data-bs=g][data-id=s19]');
  ok(await waitFor(adm, () => document.querySelectorAll('.pf tr.g').length === 1, null, 5000), '긴급 표시 → 신청서 초록 줄');
  ok(await waitFor(adm, () => document.querySelectorAll('.pf tbody tr.gray').length === 0 && document.querySelectorAll('.pf tbody tr:not(.g)').length === 34), '표시 안 한 줄은 모두 흰 바탕 (회색 없음)');
  ok(/6개 품목 신청/.test(await text(adm)), '6개 품목 신청');
  await shot(adm, 'a4_buy');
  dl = adm.waitForEvent('download'); await adm.click('[data-xls=buy]'); dl = await dl;
  const f2 = path.join(OUT, dl.suggestedFilename()); await dl.saveAs(f2);
  ok(fs.existsSync(f2), '구매신청서 엑셀: ' + dl.suggestedFilename());
  // 인쇄 → PDF (인쇄 창 대신 같은 화면을 PDF 로)
  await adm.evaluate(() => { window.print = () => { window.__printed = document.getElementById('print').innerHTML.length; }; });
  await adm.click('[data-print=buy]'); await sleep(200);
  ok(await adm.evaluate(() => window.__printed > 1000), '인쇄 버튼 → 인쇄용 신청서 준비');
  await adm.evaluate(() => { const p = document.getElementById('print'); p.innerHTML = document.querySelector('.pscale').innerHTML; document.body.classList.add('printing'); });
  await adm.emulateMedia({ media: 'print' });
  await adm.pdf({ path: path.join(OUT, '사우나_구매신청서_시험.pdf'), format: 'A4', printBackground: true, margin: { top: '8mm', bottom: '8mm', left: '8mm', right: '8mm' } });
  await adm.emulateMedia({ media: 'screen' }); await adm.evaluate(() => { document.body.classList.remove('printing'); document.getElementById('print').innerHTML = ''; });
  ok(fs.existsSync(path.join(OUT, '사우나_구매신청서_시험.pdf')), 'A4 PDF 만들어짐');

  await adm.click('[data-tab=room]'); await sleep(400);
  ok(/이름 : 홍길순/.test(await text(adm)), '객실 조사표 이름 칸 자동 (홍길순)');
  await shot(adm, 'a5_room');
  dl = adm.waitForEvent('download'); await adm.click('[data-xls=room]'); dl = await dl;
  const f3 = path.join(OUT, dl.suggestedFilename()); await dl.saveAs(f3);
  ok(fs.existsSync(f3), '객실 조사표 엑셀: ' + dl.suggestedFilename());
  await adm.evaluate(() => { const p = document.getElementById('print'); p.innerHTML = document.querySelector('.pscale').innerHTML; document.body.classList.add('printing'); });
  await adm.emulateMedia({ media: 'print' });
  await adm.pdf({ path: path.join(OUT, '객실_저장품재고조사_시험.pdf'), format: 'A4', printBackground: true, margin: { top: '8mm', bottom: '8mm', left: '8mm', right: '8mm' } });
  await adm.emulateMedia({ media: 'screen' }); await adm.evaluate(() => { document.body.classList.remove('printing'); document.getElementById('print').innerHTML = ''; });

  console.log('7. 품목 · 창고 고치기 → 근무자 휴대폰 실시간');
  await adm.click('[data-tab=items]'); await sleep(300);
  await adm.selectOption('select[data-k=iwh][data-id=r001]', 'f16');
  await hm.click('[data-go=wh]').catch(() => {});
  ok(await waitFor(hm, () => [...document.querySelectorAll('[data-wh=f16]')].some(b => /16층/.test(b.textContent)), null, 5000), '창고 목록 그대로');
  await hm.click('[data-wh=f16]');
  ok(await waitFor(hm, () => /전기포트/.test(document.body.innerText), null, 5000), '관리자가 전기포트를 16층으로 옮기자 하우스맨 휴대폰 16층 목록에 바로 나옴');
  await adm.selectOption('select[data-k=iwh][data-id=r001]', 'w14');
  await shot(adm, 'a6_items');

  console.log('8. 마감 → 근무자 저장 막힘(빨간 띠) → 다음 달 전월이월');
  await adm.click('[data-tab=prog]'); await sleep(200);
  await adm.click('[data-close-round]'); await adm.click('[data-close-round]');
  ok(await waitFor(adm, () => /· 마감/.test(document.body.innerText)), '조사 마감');
  ok(await waitFor(hm, () => /진행 중인 재고조사가 없어요/.test(document.body.innerText), null, 5000), '마감 → 근무자 화면 "진행 중 없음"');
  // 마감 직전에 화면에 남아 있던 휴대폰이 저장하려 하면 → 거절 + 빨간 띠
  const late = await sn.evaluate(() => window.__fdb('write', { uid: 'anon-sauna', path: 'inv_counts/late', data: { round: '2026-11', part: '사우나', item: 's01', qty: 3, by: '이나', at: { __server: 1 }, clientAt: { __ts: 1 }, uid: 'anon-sauna' } }));
  ok(late && late.denied, '마감된 회차에 기록 쓰기 거절');
  // 입고 완료 → 다음 달 당월입고
  await adm.click('[data-tab=buy]'); await sleep(300);
  await adm.click('[data-bs=y][data-id=s01]');
  await sleep(600);
  await adm.click('[data-tab=rounds]');
  await adm.selectOption('[data-k=ny]', '2026'); await adm.selectOption('[data-k=nm]', '12');
  await adm.click('[data-open-round]');
  ok(await waitFor(adm, () => /2026년 12월 월말 재고조사 · 진행/.test(document.body.innerText)), '12월 회차 열림');
  await adm.click('[data-tab=settle]'); await sleep(600);
  const dec1 = await adm.evaluate(() => { const tr = document.querySelector('table.t tbody tr'); return [tr.querySelector('[data-k=carry]').value, tr.children[3].textContent, tr.querySelector('[data-k=inb]').value, tr.children[4].textContent]; });
  console.log('    dec1', JSON.stringify(dec1));
  ok(dec1[0] === '43' && /지난달/.test(dec1[1]), '12월 전월이월 = 11월 마감 재고 43 (지난달)');
  ok(dec1[2] === '20' && /입고 완료/.test(dec1[3]), '12월 당월입고 = 11월 구매 20 (입고 완료)');

  console.log('9. 화면 오류 · 넓이');
  for (const p of [adm, hm, sn]) ok(p.errs.length === 0, p === adm ? '관리자' : p === hm ? '하우스맨' : '사우나' + ' 화면 오류 0건' + (p.errs.length ? ' ' + p.errs.join(' | ') : ''));
  const wide = await hm.evaluate(() => document.documentElement.scrollWidth <= 360);
  ok(wide, '360px 에서 가로로 넘치지 않음');
  const errDocs = [...db.docs.keys()].filter(k => k.startsWith('inv_errors/'));
  ok(errDocs.length === 0, '휴대폰 오류 기록 0건' + (errDocs.length ? ' ' + JSON.stringify(errDocs.map(k => db.docs.get(k).msg)) : ''));
  // 360px 사우나 목록 캡처
  await sn.click('[data-go=home]').catch(() => {});

  fs.writeFileSync(path.join(OUT, 'files.json'), JSON.stringify({ settle: f1, buy: f2, room: f3 }));
  console.log('\n결과: 통과 ' + passes + ' · 실패 ' + fails);
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
