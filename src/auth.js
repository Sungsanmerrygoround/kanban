// Auth UI: email/password sign-in and sign-up, plus session helpers.

import { auth } from './firebase.js';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';

let currentUser = null;
const listeners = new Set();

export function getUser() { return currentUser; }
export function onUserChange(fn) {
  listeners.add(fn);
  // Fire immediately with current value so late subscribers don't miss the initial state.
  queueMicrotask(() => fn(currentUser));
  return () => listeners.delete(fn);
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  listeners.forEach(fn => fn(user));
  renderAuthUI(user);
});

// ── UI ─────────────────────────────────────────────────────────────────────
function renderAuthUI(user) {
  const overlay = document.getElementById('authOverlay');
  const chip    = document.getElementById('userChip');
  if (user) {
    overlay.classList.remove('open');
    chip.classList.add('visible');
    chip.querySelector('.user-email').textContent = user.email;
  } else {
    overlay.classList.add('open');
    chip.classList.remove('visible');
  }
}

function setMsg(text, isErr = true) {
  const m = document.getElementById('authMsg');
  m.textContent = text || '';
  m.className = 'auth-msg' + (isErr ? ' err' : ' ok');
}

function readableAuthError(code) {
  const map = {
    'auth/invalid-email': '이메일 형식이 올바르지 않습니다.',
    'auth/missing-password': '비밀번호를 입력하세요.',
    'auth/weak-password': '비밀번호는 6자 이상이어야 합니다.',
    'auth/email-already-in-use': '이미 가입된 이메일입니다.',
    'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.',
    'auth/user-not-found': '계정을 찾을 수 없습니다.',
    'auth/wrong-password': '비밀번호가 올바르지 않습니다.',
    'auth/network-request-failed': '네트워크 오류. 연결을 확인하세요.',
  };
  return map[code] || ('오류: ' + code);
}

export function initAuth() {
  const emailEl = document.getElementById('authEmail');
  const pwEl    = document.getElementById('authPassword');

  document.getElementById('authSignIn').addEventListener('click', async () => {
    setMsg('');
    try {
      await signInWithEmailAndPassword(auth, emailEl.value.trim(), pwEl.value);
    } catch (e) { setMsg(readableAuthError(e.code)); }
  });

  document.getElementById('authSignUp').addEventListener('click', async () => {
    setMsg('');
    try {
      await createUserWithEmailAndPassword(auth, emailEl.value.trim(), pwEl.value);
    } catch (e) { setMsg(readableAuthError(e.code)); }
  });

  document.getElementById('authLogout').addEventListener('click', async () => {
    await signOut(auth);
  });

  // Submit on Enter inside auth form
  [emailEl, pwEl].forEach(el => el.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('authSignIn').click(); }
  }));
}
