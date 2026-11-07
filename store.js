// store.js — 재고조사 앱의 데이터 읽기·쓰기는 전부 여기 한 곳 (Firebase Firestore)
// 정비 레포트 app/store.js 를 그대로 복사 (2026-11-07) + patch(합쳐 쓰기) 하나 추가
// 화면(app.js · admin.js)은 Firebase 를 직접 모름 → 시험 때 이 파일만 메모리 가짜로 바꿔 끼움
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signOut as fbSignOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, onSnapshot, getDoc, getDocs, getDocFromServer, setDoc, deleteDoc, query, where,
  serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const app = initializeApp({
  apiKey: 'AIzaSyCyESLB9lGONuwXQUWBz6hPw09u9Zq9yFQ',
  authDomain: 'haeundae-rm.firebaseapp.com',
  projectId: 'haeundae-rm',
  storageBucket: 'haeundae-rm.firebasestorage.app',
  messagingSenderId: '468580994597',
  appId: '1:468580994597:web:b2c841463ec39b577679cc'
});
const auth = getAuth(app);
// 오프라인 보관: 누른 기록은 휴대폰(브라우저 저장소)에 먼저 남고, 연결되면 자동으로 보냄. 앱을 껐다 켜도 남아 있음
let db;
try { db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
catch (e) { console.warn('오프라인 보관을 켜지 못했어요 (사생활 보호 모드 등)', e); db = initializeFirestore(app, {}); }

export const SERVER_TIME = { __server: 1 };
export const kind = 'firebase';

// ---------- 값 바꾸기: 앱 ↔ Firestore
// 쓰기: Date → Timestamp, SERVER_TIME → 서버 시각 / 읽기: Timestamp → 밀리초 숫자
function enc(v) {
  if (v === SERVER_TIME) return serverTimestamp();
  if (v instanceof Date) return Timestamp.fromDate(v);
  if (Array.isArray(v)) return v.map(enc);
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { if (v[k] !== undefined) o[k] = enc(v[k]); }); return o; }
  return v;
}
function dec(v) {
  if (v instanceof Timestamp) return v.toMillis();
  if (Array.isArray(v)) return v.map(dec);
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { o[k] = dec(v[k]); }); return o; }
  return v;
}
const ref = p => doc(db, ...p.split('/'));
const col = p => collection(db, ...p.split('/'));
const q = (c, w) => (w && w.length ? query(col(c), ...w.map(x => where(x[0], x[1], x[2]))) : col(c));
const snapData = s => dec(s.data({ serverTimestamps: 'estimate' }));

// ---------- 로그인
export function onUser(cb) {
  return onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, anon: u.isAnonymous, email: u.email || '' } : null));
}
export function signInAnon() { return signInAnonymously(auth); }
export function signInEmail(email, pw) { return signInWithEmailAndPassword(auth, email, pw); }
export function signOut() { return fbSignOut(auth); }
// 로그인 표 (Apps Script '내 근무' 연결에서 본인 확인용). 만료됐으면 새로 받음
export async function idToken() { const u = auth.currentUser; if (!u) throw new Error('로그인 안 됨'); return u.getIdToken(); }

// ---------- 읽기 (실시간)
// cb(data|null, { pending: 휴대폰에만 있고 아직 서버에 안 간 것, fromCache: 서버와 연결 안 된 상태의 값 })
export function listenDoc(path, cb, onErr) {
  return onSnapshot(ref(path), { includeMetadataChanges: true },
    s => cb(s.exists() ? snapData(s) : null, { pending: s.metadata.hasPendingWrites, fromCache: s.metadata.fromCache }),
    e => onErr && onErr(e));
}
// where: [['maid','==','김가'], ...]  → cb([{ id, data, pending }], { fromCache, pending: 대기 수 })
export function listenQuery(c, w, cb, onErr) {
  return onSnapshot(q(c, w), { includeMetadataChanges: true }, s => {
    const docs = s.docs.map(d => ({ id: d.id, data: snapData(d), pending: d.metadata.hasPendingWrites }));
    cb(docs, { fromCache: s.metadata.fromCache, pending: docs.filter(d => d.pending).length });
  }, e => onErr && onErr(e));
}
// ---------- 읽기 (한 번) — 서버 먼저, 안 되면 휴대폰에 보관된 값
export async function get(path, serverOnly) {
  const s = serverOnly ? await getDocFromServer(ref(path)) : await getDoc(ref(path));
  return s.exists() ? snapData(s) : null;
}
export async function getQuery(c, w) {
  const s = await getDocs(q(c, w));
  return s.docs.map(d => ({ id: d.id, data: snapData(d) }));
}

// ---------- 쓰기: 화면엔 바로 반영(휴대폰 보관), 돌려주는 약속(promise)은 서버가 받아야 끝남
export function set(path, data) { return setDoc(ref(path), enc(data)); }
export function add(c, data) { const r = doc(col(c)); return { id: r.id, done: setDoc(r, enc(data)) }; }
export function del(path) { return deleteDoc(ref(path)); }
// 문서 일부만 바꾸기 (없으면 만듦). { inb: { s01: 5 } } 처럼 안쪽 칸 하나만 바꿔도 나머지는 그대로
export function patch(path, data) { return setDoc(ref(path), enc(data), { merge: true }); }
