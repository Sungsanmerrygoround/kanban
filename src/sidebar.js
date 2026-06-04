// Left sidebar: project tree rendering + project CRUD (add / switch / delete / rename).

import {
  state, save, activeProject, filter, projectHue,
  ALL_PROJECT_ID, isAllView, VIEW_PREFIX, isViewActive, activeViewId, BUILTIN_VIEWS,
  hasAdHocFilter,
} from './state.js';
import {
  allCards, matchesFilter, isOverdue, isToday, isWithinDays, isDone,
} from './query.js';
import { uid, escHtml, MOUSE_THRESHOLD, TOUCH_LONG_PRESS, TOUCH_CANCEL_DIST } from './utils.js';
import { refreshAll } from './refresh.js';

// ── Render ──────────────────────────────────────────────────────────────────
export function renderSidebar() {
  renderViewList();

  const list = document.getElementById('projectList');
  list.innerHTML = '';
  const statsEl = document.getElementById('sidebarStats');

  state.projects.forEach(proj => {
    const liveCards = proj.columns.reduce((sum, c) => sum + c.cards.filter(cd => !cd.archived).length, 0);
    const hue = projectHue(proj.id);
    const isActive = proj.id === state.activeProjectId;
    const item = document.createElement('div');
    item.className = 'project-item' + (isActive ? ' active' : '');
    item.style.setProperty('--ph', hue);
    item.innerHTML = `
      <span class="project-dot"></span>
      <span class="project-name" data-pid="${proj.id}">${escHtml(proj.name)}</span>
      <span class="project-count">${liveCards}</span>
      <button class="project-delete" title="프로젝트 삭제">×</button>
    `;
    const nameEl = item.querySelector('.project-name');

    item.addEventListener('click', e => {
      if (item.dataset.suppressClick) return;        // ignore click synthesized after a drag-reorder
      if (e.target.closest('.project-delete')) return;
      if (nameEl.isContentEditable) return;
      switchProject(proj.id);
    });
    item.querySelector('.project-delete').addEventListener('click', e => {
      e.stopPropagation();
      deleteProject(proj.id);
    });
    nameEl.addEventListener('dblclick', e => {
      e.stopPropagation();
      startProjectRename(nameEl);
    });
    item.addEventListener('pointerdown', e => onProjPointerDown(e, proj, item));

    list.appendChild(item);
  });

  // 하단 통계 영역 갱신
  if (statsEl) {
    const totalCards = state.projects.reduce((s, p) =>
      s + p.columns.reduce((s2, c) => s2 + c.cards.filter(cd => !cd.archived).length, 0), 0);
    const totalArchived = state.projects.reduce((s, p) =>
      s + p.columns.reduce((s2, c) => s2 + c.cards.filter(cd => cd.archived).length, 0), 0);
    const totalProjects = state.projects.length;
    statsEl.innerHTML = `
      <div class="stats-row">
        <span class="stats-item">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="6" height="16" rx="1"/><rect x="11" y="4" width="6" height="10" rx="1"/></svg>
          프로젝트 ${totalProjects}
        </span>
        <span class="stats-dot-sep"></span>
        <span class="stats-item">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          카드 ${totalCards}
        </span>
        ${totalArchived > 0 ? `<span class="stats-dot-sep"></span><span class="stats-item stats-archived">${totalArchived} 보관</span>` : ''}
      </div>
    `;
  }
}

export function renderNavbarTitle() {
  let title;
  if (hasAdHocFilter())     title = '필터 결과';
  else if (isAllView())     title = '전체';
  else if (isViewActive())  title = viewLabel(activeViewId());
  else                      title = activeProject().name;
  document.getElementById('projectTitleName').textContent = title;
}

// ── View list (전체 + smart views + saved views) ─────────────────────────────
function viewLabel(id) {
  const b = BUILTIN_VIEWS.find(v => v.id === id);
  if (b) return b.name;
  const sv = (state.savedViews || []).find(v => v.id === id);
  return sv ? sv.name : '뷰';
}

function viewCounts() {
  const cards = allCards();
  const c = { all: cards.length, today: 0, week: 0, overdue: 0, saved: {} };
  for (const e of cards) {
    const done = isDone(e);
    if (!done && isOverdue(e.card)) { c.overdue++; c.today++; }
    else if (!done && isToday(e.card)) { c.today++; }
    if (!done && isWithinDays(e.card, 7)) c.week++;
  }
  for (const sv of (state.savedViews || [])) {
    c.saved[sv.id] = cards.filter(e => matchesFilter(e, sv.filter)).length;
  }
  return c;
}

function renderViewList() {
  const wrap = document.getElementById('viewList');
  if (!wrap) return;
  wrap.innerHTML = '';
  const counts = viewCounts();

  wrap.appendChild(buildViewItem({
    sel: ALL_PROJECT_ID, icon: '📋', name: '전체', count: counts.all,
    active: isAllView(),
  }));

  const curView = isViewActive() ? activeViewId() : null;
  BUILTIN_VIEWS.forEach(v => {
    wrap.appendChild(buildViewItem({
      sel: VIEW_PREFIX + v.id, icon: v.icon, name: v.name, count: counts[v.id] || 0,
      active: curView === v.id,
    }));
  });

  (state.savedViews || []).forEach(v => {
    wrap.appendChild(buildViewItem({
      sel: VIEW_PREFIX + v.id, icon: v.icon || '🔖', name: v.name,
      count: counts.saved[v.id] || 0, active: curView === v.id, savedId: v.id,
    }));
  });
}

function buildViewItem({ sel, icon, name, count, active, savedId }) {
  const item = document.createElement('div');
  item.className = 'view-item' + (active ? ' active' : '');
  item.innerHTML = `
    <span class="view-icon">${icon}</span>
    <span class="view-name">${escHtml(name)}</span>
    <span class="view-count">${count}</span>
    ${savedId ? '<button class="view-delete" title="뷰 삭제">×</button>' : ''}
  `;
  item.addEventListener('click', (e) => {
    if (e.target.closest('.view-delete')) return;
    switchProject(sel);
  });
  if (savedId) {
    item.querySelector('.view-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSavedView(savedId);
    });
  }
  return item;
}

function deleteSavedView(id) {
  const sv = (state.savedViews || []).find(v => v.id === id);
  if (!sv) return;
  if (!confirm(`"${sv.name}" 뷰를 삭제할까요?`)) return;
  state.savedViews = state.savedViews.filter(v => v.id !== id);
  if (isViewActive() && activeViewId() === id) {
    state.activeProjectId = state.projects[0].id;
  }
  save();
  refreshAll();
}

// ── Actions ─────────────────────────────────────────────────────────────────
export function switchProject(id) {
  // No-op only when nothing would change (same selection, no active filters).
  if (state.activeProjectId === id && !filter.query && !hasAdHocFilter()) return;
  state.activeProjectId = id;
  filter.query = '';
  filter.tags = [];
  filter.priorities = [];
  filter.due = null;
  filter.projectId = null;
  const si = document.getElementById('searchInput');
  if (si) si.value = '';
  save();
  refreshAll();
}

export function addProject() {
  const newProj = {
    id: uid(),
    name: '새 프로젝트',
    columns: [
      { id: uid(), title: '할 일',   color: '#10a37f', cards: [] },
      { id: uid(), title: '진행 중', color: '#84cc16', cards: [] },
      { id: uid(), title: '완료',   color: '#0d9488', cards: [] },
    ],
  };
  state.projects.push(newProj);
  state.activeProjectId = newProj.id;
  save();
  refreshAll();

  // Focus new project name for immediate renaming.
  setTimeout(() => {
    const active = document.querySelector('.project-item.active .project-name');
    if (active) startProjectRename(active);
  }, 50);
}

export function deleteProject(id) {
  if (state.projects.length <= 1) {
    alert('마지막 프로젝트는 삭제할 수 없어요.');
    return;
  }
  const proj = state.projects.find(p => p.id === id);
  if (!proj) return;
  const total = proj.columns.reduce((s, c) => s + c.cards.length, 0);
  const msg = total > 0
    ? `"${proj.name}" 프로젝트와 카드 ${total}개를 모두 삭제할까요?`
    : `"${proj.name}" 프로젝트를 삭제할까요?`;
  if (!confirm(msg)) return;

  state.projects = state.projects.filter(p => p.id !== id);
  if (state.activeProjectId === id) state.activeProjectId = state.projects[0].id;
  save();
  refreshAll();
}

export function startProjectRename(el) {
  el.contentEditable = 'true';
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const pid = el.dataset.pid;
  const original = state.projects.find(p => p.id === pid)?.name || '';

  const finish = () => {
    el.contentEditable = 'false';
    el.removeEventListener('blur', finish);
    el.removeEventListener('keydown', onKey);
    const proj = state.projects.find(p => p.id === pid);
    if (!proj) return;
    proj.name = el.textContent.trim() || original;
    save();
    renderNavbarTitle();
  };
  const onKey = e => {
    if (e.key === 'Enter')  { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { el.textContent = original; el.blur(); }
  };
  el.addEventListener('blur', finish);
  el.addEventListener('keydown', onKey);
}

// ── Project drag-to-reorder (pointer: mouse + touch) ─────────────────────────
let projDrag = null;

function onProjPointerDown(e, proj, itemEl) {
  if (projDrag) return;
  if (e.button !== undefined && e.button !== 0) return;       // left mouse only
  if (e.target.closest('.project-delete')) return;            // delete button
  const nameEl = itemEl.querySelector('.project-name');
  if (nameEl && nameEl.isContentEditable) return;             // mid-rename

  projDrag = {
    projId: proj.id, itemEl,
    pointerId: e.pointerId, pointerType: e.pointerType,
    startX: e.clientX, startY: e.clientY,
    started: false, ghost: null, insertBeforeId: null,
    offsetX: 0, offsetY: 0, longPressTimer: null,
  };

  if (e.pointerType === 'touch') {
    projDrag.longPressTimer = setTimeout(() => {
      if (projDrag && !projDrag.started) startProjDrag(projDrag.startX, projDrag.startY);
    }, TOUCH_LONG_PRESS);
  }
  window.addEventListener('pointermove', onProjMove);
  window.addEventListener('pointerup', onProjUp);
  window.addEventListener('pointercancel', onProjUp);
}

function onProjMove(e) {
  if (!projDrag || e.pointerId !== projDrag.pointerId) return;
  const dist = Math.hypot(e.clientX - projDrag.startX, e.clientY - projDrag.startY);

  if (!projDrag.started) {
    if (projDrag.pointerType === 'touch') {
      if (dist > TOUCH_CANCEL_DIST) { clearTimeout(projDrag.longPressTimer); projCleanup(); }
    } else if (dist > MOUSE_THRESHOLD) {
      startProjDrag(e.clientX, e.clientY);
    }
    return;
  }
  e.preventDefault();
  moveProjGhost(e.clientX, e.clientY);
  updateProjDropTarget(e.clientY);
}

function startProjDrag(x, y) {
  const rect = projDrag.itemEl.getBoundingClientRect();
  projDrag.offsetX = projDrag.startX - rect.left;
  projDrag.offsetY = projDrag.startY - rect.top;
  projDrag.started = true;

  const ghost = projDrag.itemEl.cloneNode(true);
  ghost.classList.add('project-ghost');
  ghost.style.width = rect.width + 'px';
  document.body.appendChild(ghost);
  projDrag.ghost = ghost;

  projDrag.itemEl.classList.add('dragging');
  document.body.classList.add('dragging-active');
  try { projDrag.itemEl.setPointerCapture(projDrag.pointerId); } catch (_) {}

  moveProjGhost(x, y);
  updateProjDropTarget(y);
  if (projDrag.pointerType === 'touch' && navigator.vibrate) navigator.vibrate(15);
}

function moveProjGhost(x, y) {
  projDrag.ghost.style.left = (x - projDrag.offsetX) + 'px';
  projDrag.ghost.style.top  = (y - projDrag.offsetY) + 'px';
}

function updateProjDropTarget(y) {
  clearProjPlaceholders();
  const list = document.getElementById('projectList');
  const items = [...list.querySelectorAll('.project-item:not(.dragging):not(.all-item)')];

  let insertBefore = null;
  for (const it of items) {
    const r = it.getBoundingClientRect();
    if (y < r.top + r.height / 2) { insertBefore = it; break; }
  }

  const ph = document.createElement('div');
  ph.className = 'project-drop-ph';
  if (insertBefore) {
    list.insertBefore(ph, insertBefore);
    projDrag.insertBeforeId = insertBefore.querySelector('.project-name')?.dataset.pid || null;
  } else {
    list.appendChild(ph);
    projDrag.insertBeforeId = null;
  }
}

function onProjUp(e) {
  if (!projDrag || e.pointerId !== projDrag.pointerId) return;
  clearTimeout(projDrag.longPressTimer);
  if (projDrag.started) {
    // Block the synthetic click that follows pointerup so a reorder doesn't
    // also switch the active project (same guard as card/calendar drags).
    const itemEl = projDrag.itemEl;
    if (itemEl) {
      itemEl.dataset.suppressClick = '1';
      setTimeout(() => { delete itemEl.dataset.suppressClick; }, 300);
    }
    performProjReorder();
  }
  projCleanup();
}

function performProjReorder() {
  const arr = state.projects;
  const from = arr.findIndex(p => p.id === projDrag.projId);
  if (from < 0) return;
  const [moved] = arr.splice(from, 1);
  if (projDrag.insertBeforeId == null) {
    arr.push(moved);
  } else {
    let to = arr.findIndex(p => p.id === projDrag.insertBeforeId);
    if (to < 0) to = arr.length;
    arr.splice(to, 0, moved);
  }
  save();
  refreshAll();
}

function projCleanup() {
  if (projDrag) {
    if (projDrag.ghost) projDrag.ghost.remove();
    if (projDrag.itemEl) projDrag.itemEl.classList.remove('dragging');
    try { projDrag.itemEl.releasePointerCapture(projDrag.pointerId); } catch (_) {}
  }
  document.body.classList.remove('dragging-active');
  clearProjPlaceholders();
  window.removeEventListener('pointermove', onProjMove);
  window.removeEventListener('pointerup', onProjUp);
  window.removeEventListener('pointercancel', onProjUp);
  projDrag = null;
}

function clearProjPlaceholders() {
  document.querySelectorAll('.project-drop-ph').forEach(p => p.remove());
}
