// Application entry point — wires global events, gates load on auth,
// subscribes to Firestore for real-time updates.

import { load, save, applyRemote, filter, setUser, undo, redo } from './state.js';
import { refreshAll, setView } from './refresh.js';
import { addProject } from './sidebar.js';
import { addColumn } from './board.js';
import { initModal, closeModal, flashMsg, initNotePage } from './modal.js';
import { initArchive, closeArchive } from './archive.js';
import { initAuth, onUserChange } from './auth.js';
import { subscribeUserState } from './sync.js';
import { initNotifications } from './notifications.js';
import { initCalendar } from './calendar.js';
import { initPalette, openPalette } from './palette.js';
import { initFilterBar } from './filterbar.js';

// ── Wire global events ──────────────────────────────────────────────────────
document.getElementById('addColNavBtn').addEventListener('click', addColumn);
document.getElementById('addProjectBtn').addEventListener('click', addProject);
document.getElementById('paletteBtn').addEventListener('click', openPalette);

document.getElementById('searchInput').addEventListener('input', e => {
  filter.query = e.target.value;
  refreshAll();
});

// View-mode toggle (board / calendar)
document.querySelectorAll('.vt-btn').forEach(b => {
  b.addEventListener('click', () => setView(b.dataset.view));
});

document.addEventListener('keydown', e => {
  // ⌘K / Ctrl+K — command palette (works even while typing in a field).
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    openPalette();
    return;
  }

  if (e.key === 'Escape') {
    if (document.getElementById('notePageOverlay')?.classList.contains('open')) return;
    closeModal();
    closeArchive();
    document.querySelectorAll('.cal-day-popover').forEach(p => p.remove());
    return;
  }

  const tag = document.activeElement?.tagName;
  const inInput = tag === 'INPUT' || tag === 'TEXTAREA'
    || document.activeElement?.isContentEditable;
  if (inInput) return;

  const mod = e.ctrlKey || e.metaKey;

  if (mod && !e.shiftKey && e.key === 'z') {
    e.preventDefault();
    if (undo()) { refreshAll(); flashMsg('실행 취소 ✓'); }
  }

  if (mod && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
    e.preventDefault();
    if (redo()) { refreshAll(); flashMsg('다시 실행 ✓'); }
  }
});

initModal();
initNotePage();
initArchive();
initAuth();
initSidebarToggle();
initNotifications();
initCalendar();
initPalette();
initFilterBar();

// ── Sidebar collapse toggle ─────────────────────────────────────────────────
function initSidebarToggle() {
  const KEY = 'kb_sidebar_collapsed';
  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

  // Initial state: respect stored pref on desktop; default collapsed on mobile.
  const stored = localStorage.getItem(KEY);
  const initialCollapsed = stored === null ? isMobile() : stored === '1';
  document.body.classList.toggle('sidebar-collapsed', initialCollapsed);

  const apply = (collapsed) => {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    localStorage.setItem(KEY, collapsed ? '1' : '0');
  };

  document.getElementById('sidebarToggle').addEventListener('click', () => apply(true));
  document.getElementById('sidebarOpenBtn').addEventListener('click', () => apply(false));
  document.getElementById('sidebarBackdrop').addEventListener('click', () => apply(true));

  // On mobile, picking a project or view should auto-close the sidebar.
  document.getElementById('projectList').addEventListener('click', (e) => {
    if (isMobile() && e.target.closest('.project-item')) apply(true);
  });
  document.getElementById('viewList').addEventListener('click', (e) => {
    if (isMobile() && e.target.closest('.view-item')) apply(true);
  });
}

// ── Register service worker (PWA / offline) ─────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .catch((err) => console.warn('SW registration failed:', err));
  });
}

// ── Auth-gated init + live sync ─────────────────────────────────────────────
let unsubscribe = null;

onUserChange((user) => {
  // Tear down any previous subscription on logout / user-switch.
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }

  if (user) {
    setUser(user.uid);
    // Show whatever we have locally immediately for snappy UI.
    load();
    refreshAll();

    // Subscribe to remote changes. The first snapshot also delivers current
    // cloud state, which overrides local if it's newer / different.
    unsubscribe = subscribeUserState(user.uid, ({ empty, data }) => {
      if (empty) {
        // No doc yet — push our current state up so other devices can pull it.
        save();
        return;
      }
      if (applyRemote(data)) refreshAll();
    });
  } else {
    setUser(null);
    document.getElementById('board').innerHTML = '';
    document.getElementById('projectList').innerHTML = '';
  }
});
