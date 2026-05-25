// Calendar view: month grid showing cards by due date, with drag-to-reschedule.

import {
  state, findCardAnywhere, setActiveProject, save,
} from './state.js';
import { escHtml } from './utils.js';
import { openModal } from './modal.js';
import { refreshAll } from './refresh.js';

// ── Persistent view state ───────────────────────────────────────────────────
const SCOPE_KEY = 'kb_cal_scope';
let viewYear, viewMonth;             // viewMonth is 0-indexed
let scope = localStorage.getItem(SCOPE_KEY) || 'all';

// ── Drag state ──────────────────────────────────────────────────────────────
let drag = null;
const MOUSE_THRESHOLD   = 5;
const TOUCH_LONG_PRESS  = 250;
const TOUCH_CANCEL_DIST = 10;

// ── Render ──────────────────────────────────────────────────────────────────
export function renderCalendar() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  board.classList.remove('search-mode');

  if (viewYear === undefined) {
    const now = new Date();
    viewYear  = now.getFullYear();
    viewMonth = now.getMonth();
  }

  const wrap = document.createElement('div');
  wrap.className = 'cal-wrap';
  wrap.appendChild(buildHeader());
  wrap.appendChild(buildGrid());
  wrap.appendChild(buildNoDueTray());
  board.appendChild(wrap);
}

// ── Header (month nav + scope filter) ───────────────────────────────────────
function buildHeader() {
  const head = document.createElement('div');
  head.className = 'cal-head';
  head.innerHTML = `
    <div class="cal-title">${viewYear}년 ${viewMonth + 1}월</div>
    <div class="cal-nav">
      <button class="cal-btn" id="calPrev" title="이전 달" aria-label="이전 달">‹</button>
      <button class="cal-btn cal-today-btn" id="calToday">오늘</button>
      <button class="cal-btn" id="calNext" title="다음 달" aria-label="다음 달">›</button>
    </div>
    <div class="cal-scope">
      <select id="calScope" aria-label="범위 선택">
        <option value="all" ${scope === 'all' ? 'selected' : ''}>모든 프로젝트</option>
        ${state.projects.map(p =>
          `<option value="${p.id}" ${scope === p.id ? 'selected' : ''}>${escHtml((p.icon || '📁') + ' ' + p.name)}</option>`
        ).join('')}
      </select>
    </div>
  `;
  head.querySelector('#calPrev').onclick   = () => changeMonth(-1);
  head.querySelector('#calNext').onclick   = () => changeMonth( 1);
  head.querySelector('#calToday').onclick  = () => gotoToday();
  head.querySelector('#calScope').onchange = (e) => {
    scope = e.target.value;
    localStorage.setItem(SCOPE_KEY, scope);
    renderCalendar();
  };
  return head;
}

function changeMonth(delta) {
  viewMonth += delta;
  if (viewMonth < 0)        { viewMonth = 11; viewYear--; }
  else if (viewMonth > 11)  { viewMonth = 0;  viewYear++; }
  renderCalendar();
}

function gotoToday() {
  const now = new Date();
  viewYear  = now.getFullYear();
  viewMonth = now.getMonth();
  renderCalendar();
}

// ── Grid ────────────────────────────────────────────────────────────────────
function buildGrid() {
  const first = new Date(viewYear, viewMonth, 1);
  const startDay = first.getDay();
  const gridStart = new Date(viewYear, viewMonth, 1 - startDay);

  const byDate = collectCardsByDate();
  const todayStr = ymd(new Date());

  const grid = document.createElement('div');
  grid.className = 'cal-grid';

  // Day-of-week header
  ['일', '월', '화', '수', '목', '금', '토'].forEach((d, i) => {
    const h = document.createElement('div');
    h.className = 'cal-dow' + (i === 0 ? ' sun' : '') + (i === 6 ? ' sat' : '');
    h.textContent = d;
    grid.appendChild(h);
  });

  // 6 weeks × 7 days = 42 cells
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    grid.appendChild(buildCell(d, byDate, todayStr));
  }

  return grid;
}

function buildCell(d, byDate, todayStr) {
  const dateStr = ymd(d);
  const inMonth = d.getMonth() === viewMonth;
  const isToday = dateStr === todayStr;
  const dow = d.getDay();

  const cell = document.createElement('div');
  cell.className = 'cal-cell'
    + (inMonth ? '' : ' off')
    + (isToday ? ' today' : '')
    + (dow === 0 ? ' sun' : '')
    + (dow === 6 ? ' sat' : '');
  cell.dataset.date = dateStr;

  // Date number
  const num = document.createElement('div');
  num.className = 'cal-date-num';
  num.innerHTML = `<span>${d.getDate()}</span>`;
  cell.appendChild(num);

  // Card chips
  const cards = byDate[dateStr] || [];
  const list = document.createElement('div');
  list.className = 'cal-cell-cards';

  const MAX_VISIBLE = window.matchMedia('(max-width: 768px)').matches ? 2 : 4;
  const visible = cards.slice(0, MAX_VISIBLE);
  visible.forEach(({ card, project }) => {
    list.appendChild(buildChip(card, project));
  });
  if (cards.length > MAX_VISIBLE) {
    const more = document.createElement('button');
    more.className = 'cal-more';
    more.textContent = `+ ${cards.length - MAX_VISIBLE}개 더`;
    more.onclick = (e) => { e.stopPropagation(); openDayDetail(dateStr, cards); };
    list.appendChild(more);
  }
  cell.appendChild(list);

  // Click empty area of cell to view day detail (helpful for adding context).
  cell.addEventListener('click', (e) => {
    if (e.target.closest('.cal-chip, .cal-more')) return;
    if (cards.length === 0) return;
    openDayDetail(dateStr, cards);
  });

  return cell;
}

// ── Collect cards by ISO date string ────────────────────────────────────────
function collectCardsByDate() {
  const map = {};
  for (const project of state.projects) {
    if (scope !== 'all' && project.id !== scope) continue;
    for (const col of project.columns) {
      for (const card of col.cards) {
        if (card.archived) continue;
        if (!card.due) continue;
        (map[card.due] = map[card.due] || []).push({ card, project, col });
      }
    }
  }
  // Sort each bucket by priority then title.
  const order = { high: 0, medium: 1, low: 2, none: 3 };
  for (const k of Object.keys(map)) {
    map[k].sort((a, b) => {
      const pa = order[a.card.priority] ?? 3;
      const pb = order[b.card.priority] ?? 3;
      if (pa !== pb) return pa - pb;
      return a.card.title.localeCompare(b.card.title, 'ko');
    });
  }
  return map;
}

// ── Chip ────────────────────────────────────────────────────────────────────
function buildChip(card, project) {
  const chip = document.createElement('div');
  const pri = card.priority && card.priority !== 'none' ? ` p-${card.priority}` : '';
  chip.className = 'cal-chip' + pri;
  chip.dataset.cardId = card.id;
  chip.dataset.projectId = project.id;

  const icon = (scope === 'all')
    ? `<span class="cal-chip-icon">${escHtml(project.icon || '📁')}</span>`
    : '';
  const recur = (card.recurrence && card.recurrence !== 'none')
    ? `<span class="cal-chip-recur" title="반복">🔁</span>` : '';

  chip.innerHTML = `${icon}<span class="cal-chip-title">${escHtml(card.title)}</span>${recur}`;

  chip.addEventListener('click', (e) => {
    if (chip.dataset.suppressClick) return;
    e.stopPropagation();
    jumpToCard(card.id, project.id);
  });
  chip.addEventListener('pointerdown', (e) => onChipPointerDown(e, card, project, chip));
  return chip;
}

function jumpToCard(cardId, projectId) {
  // Close any open day-detail popover first.
  document.querySelectorAll('.cal-day-popover').forEach(p => p.remove());

  if (projectId !== state.activeProjectId) {
    setActiveProject(projectId);
    refreshAll();   // sync sidebar highlight
  }
  openModal(cardId);
}

// ── Day detail popover ──────────────────────────────────────────────────────
function openDayDetail(dateStr, cards) {
  // Close any existing first.
  document.querySelectorAll('.cal-day-popover').forEach(p => p.remove());

  const ov = document.createElement('div');
  ov.className = 'cal-day-popover';

  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dowLabel = ['일','월','화','수','목','금','토'][dateObj.getDay()];
  const heading = `${m}월 ${d}일 (${dowLabel})`;

  ov.innerHTML = `
    <div class="cal-day-popover-card">
      <div class="cal-day-popover-head">
        <div class="cal-day-popover-title">${heading}<span class="cal-day-popover-count">${cards.length}</span></div>
        <button class="modal-x" aria-label="닫기">✕</button>
      </div>
      <div class="cal-day-popover-list"></div>
    </div>
  `;
  const list = ov.querySelector('.cal-day-popover-list');
  cards.forEach(({ card, project }) => {
    const row = document.createElement('div');
    row.className = 'cal-day-row';
    const pri = card.priority && card.priority !== 'none' ? ` p-${card.priority}` : '';
    row.innerHTML = `
      <div class="cal-day-row-stripe${pri}"></div>
      <div class="cal-day-row-main">
        <div class="cal-day-row-title">${escHtml(card.title)}</div>
        <div class="cal-day-row-meta">${escHtml((project.icon || '📁') + ' ' + project.name)}</div>
      </div>
    `;
    row.addEventListener('click', () => jumpToCard(card.id, project.id));
    list.appendChild(row);
  });

  ov.querySelector('.modal-x').onclick = () => ov.remove();
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}

// ── "기한 없음" tray ────────────────────────────────────────────────────────
function buildNoDueTray() {
  // Collect cards without due dates in the current scope.
  const noDue = [];
  for (const project of state.projects) {
    if (scope !== 'all' && project.id !== scope) continue;
    for (const col of project.columns) {
      for (const card of col.cards) {
        if (card.archived) continue;
        if (card.due) continue;
        noDue.push({ card, project });
      }
    }
  }

  const tray = document.createElement('details');
  tray.className = 'cal-nodue';
  tray.open = false;
  tray.innerHTML = `
    <summary class="cal-nodue-head">
      <span>기한 없는 카드</span>
      <span class="cal-nodue-count">${noDue.length}</span>
    </summary>
    <div class="cal-nodue-list"></div>
  `;
  const list = tray.querySelector('.cal-nodue-list');
  if (noDue.length === 0) {
    list.innerHTML = `<div class="cal-nodue-empty">모두 마감일이 지정되어 있어요 ✨</div>`;
  } else {
    noDue.forEach(({ card, project }) => {
      list.appendChild(buildChip(card, project));
    });
  }
  return tray;
}

// ── Pointer drag (chip → reschedule) ────────────────────────────────────────
function onChipPointerDown(e, card, project, chipEl) {
  if (drag) return;
  if (e.button !== undefined && e.button !== 0) return;

  drag = {
    cardId: card.id,
    projectId: project.id,
    chipEl,
    pointerId: e.pointerId,
    pointerType: e.pointerType,
    startX: e.clientX,
    startY: e.clientY,
    offsetX: 0,
    offsetY: 0,
    started: false,
    ghost: null,
    targetDate: null,
    longPressTimer: null,
  };

  if (e.pointerType === 'touch') {
    drag.longPressTimer = setTimeout(() => {
      if (drag && !drag.started) startChipDrag(drag.startX, drag.startY);
    }, TOUCH_LONG_PRESS);
  }

  window.addEventListener('pointermove', onChipPointerMove);
  window.addEventListener('pointerup', onChipPointerUp);
  window.addEventListener('pointercancel', onChipPointerUp);
}

function onChipPointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;
  const dist = Math.hypot(dx, dy);

  if (!drag.started) {
    if (drag.pointerType === 'touch') {
      if (dist > TOUCH_CANCEL_DIST) {
        clearTimeout(drag.longPressTimer);
        chipCleanup();
      }
    } else if (dist > MOUSE_THRESHOLD) {
      startChipDrag(e.clientX, e.clientY);
    }
    return;
  }

  e.preventDefault();
  moveChipGhost(e.clientX, e.clientY);
  updateChipDropTarget(e.clientX, e.clientY);
}

function startChipDrag(x, y) {
  const rect = drag.chipEl.getBoundingClientRect();
  drag.offsetX = drag.startX - rect.left;
  drag.offsetY = drag.startY - rect.top;
  drag.started = true;

  const ghost = drag.chipEl.cloneNode(true);
  ghost.classList.add('cal-chip-ghost');
  ghost.style.width = rect.width + 'px';
  document.body.appendChild(ghost);
  drag.ghost = ghost;

  drag.chipEl.classList.add('dragging');
  document.body.classList.add('dragging-active');

  try { drag.chipEl.setPointerCapture(drag.pointerId); } catch {}
  moveChipGhost(x, y);
  updateChipDropTarget(x, y);
  if (drag.pointerType === 'touch' && navigator.vibrate) navigator.vibrate(15);
}

function moveChipGhost(x, y) {
  drag.ghost.style.left = (x - drag.offsetX) + 'px';
  drag.ghost.style.top  = (y - drag.offsetY) + 'px';
}

function updateChipDropTarget(x, y) {
  const prevDisp = drag.ghost.style.display;
  drag.ghost.style.display = 'none';
  const el = document.elementFromPoint(x, y);
  drag.ghost.style.display = prevDisp;

  document.querySelectorAll('.cal-cell.drag-over').forEach(c => c.classList.remove('drag-over'));

  const cell = el && el.closest('.cal-cell');
  if (!cell) { drag.targetDate = null; return; }
  cell.classList.add('drag-over');
  drag.targetDate = cell.dataset.date;
}

function onChipPointerUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  clearTimeout(drag.longPressTimer);

  if (drag.started) {
    if (drag.targetDate) {
      const r = findCardAnywhere(drag.cardId);
      if (r && r.card.due !== drag.targetDate) {
        r.card.due = drag.targetDate;
        save();
      }
    }
    // Block the synthetic click that follows.
    drag.chipEl.dataset.suppressClick = '1';
    const chip = drag.chipEl;
    setTimeout(() => delete chip.dataset.suppressClick, 300);
    chipCleanup();
    refreshAll();
  } else {
    chipCleanup();
  }
}

function chipCleanup() {
  if (drag) {
    if (drag.ghost) drag.ghost.remove();
    if (drag.chipEl) drag.chipEl.classList.remove('dragging');
    try { drag.chipEl.releasePointerCapture(drag.pointerId); } catch {}
  }
  document.body.classList.remove('dragging-active');
  document.querySelectorAll('.cal-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
  window.removeEventListener('pointermove', onChipPointerMove);
  window.removeEventListener('pointerup', onChipPointerUp);
  window.removeEventListener('pointercancel', onChipPointerUp);
  drag = null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Keyboard nav (left/right = month) ───────────────────────────────────────
export function initCalendar() {
  document.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('view-calendar')) return;
    // Don't hijack while typing in inputs.
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (document.querySelector('.overlay.open')) return;

    if (e.key === 'ArrowLeft')      { changeMonth(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight'){ changeMonth( 1); e.preventDefault(); }
    else if (e.key === 't' || e.key === 'T') { gotoToday(); }
  });
}
