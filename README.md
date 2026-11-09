# inventory — 재고조사 앱

객실 통합 관리 시스템의 **객실 재고조사 · 사우나 재고조사** 앱 (Firebase `haeundae-rm`, 컬렉션은 `inv_` 로 시작하는 것만)

- 주소: https://haeundae-rm.github.io/inventory/
- 근무자(하우스맨 · 사우나 근무자): 이름 → 객실/사우나 → (객실은 창고) → 지금 재고 숫자만 입력. 인터넷이 끊겨도 휴대폰에 먼저 저장 후 자동 전송
- 관리자(부소장 · 소장): 진행 현황 · 사우나 결산(출고 자동 계산) · 사우나 구매신청서(A4 인쇄 · PDF · 엑셀) · 객실 조사표(인쇄 · 엑셀) · 품목 · 창고 · 회차

## 파일
| 파일 | 하는 일 |
|---|---|
| `index.html` | 화면 틀 (스크립트·스타일 주소 끝 `?v=버전`) |
| `app.js` | 근무자 화면 · 관리자 로그인 · 공통 (APP_VER) |
| `admin.js` | 관리자 화면 전부 (`setupAdmin(ctx)` 하나 — 나중에 '객실 통합 관리' 재고 메뉴로 옮기기 쉽게) |
| `items.js` | 처음 품목 목록 · 창고 4곳 (관리자 '기본 품목 넣기' 때 한 번만 사용) |
| `store.js` | Firestore 읽기·쓰기 한 곳 (정비 레포트 `app/store.js` 복사 + `patch`) |
| `style.css` · `sw.js` · `manifest.json` · `version.json` · `icon-*.png` | 디자인 · 오프라인 열기 · 홈 화면 아이콘 · 새 버전 확인 |
| `rules/firestore_v12.rules` | 보안 규칙 v12 = v11 합본(11/9 16:08 게시) + 근무자 품목 추가 (**콘솔에 게시하는 전체 파일** — 게시 전 콘솔 맨 위 별표가 v11 인지 확인) |
| `test/` | 가짜 Firebase(규칙 포함) 시험 |

## 데이터
- `inv_items/{r001…|s01…}` 품목 (part 객실/사우나 · order · name · unit · wh 창고 · code 자재코드 · memo 비고 · use)
- `inv_rounds/{YYYY-MM}` 회차 (status 진행/마감 · day 조사일 · carry 전월이월 고친 값 · inb 당월입고 고친 값 · final 마감 재고)
- `inv_counts/{자동}` 조사 한 줄 (round · part · item · qty · by · at · clientAt · uid) — 쌓기만, 같은 품목은 마지막 줄이 지금 값
- `inv_buy/{YYYY-MM}` 사우나 구매신청서 (date · qty · st 긴급 g / 입고 완료 y / 미입고 r) — 관리자만
- `inv_errors` 휴대폰 오류 기록
- 결산: 전월이월 = 지난 회차 final, 당월입고 = 지난 회차 구매신청서의 '입고 완료' 수량, **당월출고 = 이월 + 입고 − 재고**

## 버전 올리기
`index.html`(두 곳) · `app.js`(APP_VER) · `version.json` 을 같이 `2026.MM.DD-n` 으로.

## 시험
```
cd test && npm i exceljs   # 처음 한 번 (엑셀 내려받기 시험용)
LANG=C.UTF-8 NODE_PATH=/opt/node22/lib/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node test/test.js test/node_modules/exceljs/dist/exceljs.min.js
```
