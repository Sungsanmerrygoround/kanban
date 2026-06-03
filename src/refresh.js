// Render coordinator + view-mode dispatcher.
// Lives alone to avoid circular imports between action modules and UI modules.

import { renderSidebar, renderNavbarTitle } from './sidebar.js';
import { renderBoard } from './board.js';
import { renderCalendar } from './calendar.js';
import { filter, isAllView } from './state.js';

const VIEW_KEY = 'kb_view_mode';
let viewMode = localStorage.getItem(VIEW_KEY) || 'board';
if (viewMode !== 'calendar') viewMode = 'board';   // normalize legacy 'timeline'
applyBodyClass();

function applyBodyClass() {
  document.body.classList.toggle('view-calendar', viewMode === 'calendar');
  document.body.classList.toggle('view-board',    viewMode === 'board');
}

export function getView() { return viewMode; }

export function setView(v) {
  viewMode = (v === 'calendar') ? 'calendar' : 'board';
  localStorage.setItem(VIEW_KEY, viewMode);
  applyBodyClass();
  refreshAll();
}

function syncToggleUI() {
  document.querySelectorAll('.vt-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === viewMode);
  });
}

export function refreshAll() {
  document.body.classList.toggle('all-view', isAllView());
  renderSidebar();
  renderNavbarTitle();
  // Search always falls back to the board view's cross-project search results.
  if (filter.query || viewMode === 'board') renderBoard();
  else renderCalendar();
  syncToggleUI();
}
