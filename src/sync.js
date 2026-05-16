// Firestore CRUD for the per-user state document.

import { db } from './firebase.js';
import {
  doc, getDoc, setDoc, serverTimestamp,
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
