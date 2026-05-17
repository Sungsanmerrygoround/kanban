// Firestore CRUD + real-time subscription for the per-user state document.

import { db } from './firebase.js';
import {
  doc, getDoc, setDoc, onSnapshot, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

const userDoc = (uid) => doc(db, 'users', uid);

export async function fetchUserState(uid) {
  const snap = await getDoc(userDoc(uid));
  return snap.exists() ? snap.data() : null;
}

export async function writeUserState(uid, payload) {
  await setDoc(userDoc(uid), {
    ...payload,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// Subscribe to remote changes. Calls onUpdate({ empty, data }) on every
// change, including the initial snapshot. Returns an unsubscribe function.
export function subscribeUserState(uid, onUpdate) {
  return onSnapshot(userDoc(uid), (snap) => {
    if (!snap.exists()) {
      onUpdate({ empty: true, data: null });
    } else {
      onUpdate({ empty: false, data: snap.data() });
    }
  }, (err) => {
    console.error('Snapshot listener error:', err);
  });
}
