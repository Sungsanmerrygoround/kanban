// Render coordinator + view-mode dispatcher.
// Lives alone to avoid circular imports between action modules and UI modules.

import { renderSidebar, renderNavbarTitle } from './sidebar.js';
import { renderBoard } from './board.js';
import { renderCalendar } from './calendar.js';
import { renderDashboard } from './dashboard.js';
import { renderFilterBar } from './filterbar.js';
import { filter, isAllView, isViewActive, hasAdHocFilter } from './state.js';

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
  const adhoc = hasAdHocFilter();
  document.body.classList.toggle('all-view', isAllView());
  document.body.classList.toggle('dashboard-view', isViewActive() || adhoc);
  renderSidebar();
  renderNavbarTitle();
  // Text search → cross-project board results; ad-hoc filter / smart view → dashboard.
  if (filter.query)          renderBoard();
  else if (adhoc)            renderDashboard();
  else if (isViewActive())   renderDashboard();
  else if (viewMode === 'board') renderBoard();
  else                       renderCalendar();
  renderFilterBar();
  syncToggleUI();
}
