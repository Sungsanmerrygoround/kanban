// Browser notifications for due-soon cards.
// In-foreground polling — no FCM / server push. Survives PWA standalone mode.

import { state } from './state.js';
import { daysUntil } from './utils.js';

const SEEN_KEY = 'kb_notif_seen';   // {[cardId+'@'+due]: true}
const POLL_MS  = 5 * 60 * 1000;     // every 5 minutes
let pollTimer = null;

// ── Permission UI ───────────────────────────────────────────────────────────
export function initNotifications() {
  const btn = document.getElementById('notifBtn');
  if (!btn) return;

  const supported = 'Notification' in window;
  if (!supported) {
    btn.style.display = 'none';
    return;
  }

  syncBtn();

  btn.addEventListener('click', async () => {
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
      syncBtn();
      if (Notification.permission === 'granted') {
        startPolling();
        // Friendly first-time ping so user sees it works.
        new Notification('✅ 알림 켜짐', { body: '마감일 카드가 임박하면 알려드릴게요.' });
      }
    } else if (Notification.permission === 'granted') {
      // Toggle off by clearing seen + stopping polling temporarily isn't ideal;
      // just open a quick test instead.
      checkOnce(true);
    } else {
      alert('브라우저 설정에서 알림 권한을 직접 허용해주세요.');
    }
  });

  if (Notification.permission === 'granted') startPolling();
}

function syncBtn() {
  const btn = document.getElementById('notifBtn');
  if (!btn) return;
  const p = Notification.permission;
  btn.classList.toggle('on', p === 'granted');
  btn.classList.toggle('off', p === 'denied');
  if (p === 'granted')      btn.title = '알림 켜짐 (클릭하면 지금 확인)';
  else if (p === 'denied')  btn.title = '알림 차단됨 — 브라우저 설정에서 허용';
  else                       btn.title = '알림 켜기';
}

// ── Polling ─────────────────────────────────────────────────────────────────
function startPolling() {
  if (pollTimer) return;
  // Fire once immediately, then on interval.
  checkOnce(false);
  pollTimer = setInterval(() => checkOnce(false), POLL_MS);
}

function loadSeen() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); }
  catch { return {}; }
}
function saveSeen(seen) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch {}
}

// `force=true` ignores the seen set — used as "check now" test action.
function checkOnce(force) {
  if (Notification.permission !== 'granted') return;
  const seen = force ? {} : loadSeen();
  let pinged = 0;

  for (const project of state.projects || []) {
    for (const col of project.columns || []) {
      for (const card of col.cards || []) {
        if (card.archived) continue;
        if (!card.due) continue;
        const days = daysUntil(card.due);
        if (days === null) continue;
        // Notify for: overdue / today / tomorrow only.
        if (days > 1) continue;

        const key = `${card.id}@${card.due}`;
        if (!force && seen[key]) continue;
        seen[key] = true;
        pinged++;

        const when = days < 0 ? `${-days}일 지남` : days === 0 ? '오늘' : '내일';
        const body = `${project.icon || '📌'} ${project.name} · ${col.title}`;
        try {
          new Notification(`[${when}] ${card.title}`, {
            body,
            tag:  key,            // dedupe across rapid re-fires
            icon: './icon.svg',
          });
        } catch (e) { /* some browsers throw on missing icon — ignore */ }
      }
    }
  }
  saveSeen(seen);
  if (force && pinged === 0) {
    new Notification('알림 점검', { body: '오늘/내일 마감인 카드가 없습니다.' });
  }
}
