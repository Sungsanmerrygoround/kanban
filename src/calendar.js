// Calendar view: month grid showing cards by due date, with drag-to-reschedule.

import {
  state, findCardAnywhere, setActiveProject, save,
} from './state.js';
import { escHtml, displayTitle } from './utils.js';
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

// ── Grid (month container with week-rows, absolute span layer per week) ────
function buildGrid() {
  const first = new Date(viewYear, viewMonth, 1);
  const startDay = first.getDay();
  const gridStart = new Date(viewYear, viewMonth, 1 - startDay);

  const { singleByDate, spans } = collectAllCards();
  const todayStr = ymd(new Date());

  const month = document.createElement('div');
  month.className = 'cal-month';

  // Day-of-week header (once)
  const dowRow = document.createElement('div');
  dowRow.className = 'cal-dow-row';
  ['일', '월', '화', '수', '목', '금', '토'].forEach((d, i) => {
    const h = document.createElement('div');
    h.className = 'cal-dow' + (i === 0 ? ' sun' : '') + (i === 6 ? ' sat' : '');
    h.textContent = d;
    dowRow.appendChild(h);
  });
  month.appendChild(dowRow);

  // 6 weeks
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + w * 7 + i
      ));
    }
    month.appendChild(buildWeek(week, singleByDate, spans, todayStr));
  }

  return month;
}

function buildWeek(week, singleByDate, allSpans, todayStr) {
  const weekStart    = week[0];
  const weekEnd      = week[6];
  const weekStartTm  = weekStart.getTime();
  const weekEndTm    = weekEnd.getTime() + 86399999; // include the whole last day

  // Spans intersecting this week, lane-assigned greedily by start time
  const inter = allSpans.filter(s =>
    s.endTime >= weekStartTm && s.startTime <= weekEndTm
  );
  inter.sort((a, b) => a.startTime - b.startTime || (b.endTime - b.startTime) - (a.endTime - a.startTime));

  const lanes = []; // lanes[i] = [{s,e}] — day indices within week
  const assigned = [];
  inter.forEach(s => {
    const dayStart = Math.max(0, Math.round((s.startTime - weekStartTm) / 86400000));
    const dayEnd   = Math.min(6, Math.round((s.endTime   - weekStartTm) / 86400000));
    let lane = 0;
    while (true) {
      const conflicts = (lanes[lane] || []).some(r => !(r.e < dayStart || r.s > dayEnd));
      if (!conflicts) break;
      lane++;
    }
    if (!lanes[lane]) lanes[lane] = [];
    lanes[lane].push({ s: dayStart, e: dayEnd });
    assigned.push({ span: s, lane, dayStart, dayEnd });
  });
  const laneCount = lanes.length;

  const weekEl = document.createElement('div');
  weekEl.className = 'cal-week';
  // Push cell content down so single-day chips don't sit under the span bars.
  weekEl.style.setProperty('--lanes', String(laneCount));

  // 7 day cells
  week.forEach(d => weekEl.appendChild(buildDayCell(d, singleByDate, todayStr, laneCount)));

  // Absolute span layer above the cells
  const layer = document.createElement('div');
  layer.className = 'cal-span-layer';
  assigned.forEach(a => layer.appendChild(buildSpanBar(a, weekStartTm, weekEndTm)));
  weekEl.appendChild(layer);

  return weekEl;
}

function buildDayCell(d, singleByDate, todayStr, laneCount) {
  const dateStr = ymd(d);
  const inMonth = d.getMonth() === viewMonth;
  const isToday = dateStr === todayStr;
  const dow = d.getDay();

  const cell = document.createElement('div');
  cell.className = 'cal-day-cell'
    + (inMonth ? '' : ' off')
    + (isToday ? ' today' : '')
    + (dow === 0 ? ' sun' : '')
    + (dow === 6 ? ' sat' : '');
  cell.dataset.date = dateStr;

  // Date number (top)
  const num = document.createElement('div');
  num.className = 'cal-date-num';
  num.innerHTML = `<span>${d.getDate()}</span>`;
  cell.appendChild(num);

  // Single-day chips below the span lane area
  const cards = singleByDate[dateStr] || [];
  const list = document.createElement('div');
  list.className = 'cal-cell-cards';

  // Tighter visible cap if there are span lanes consuming vertical space.
  const baseMax = window.matchMedia('(max-width: 768px)').matches ? 2 : 4;
  const MAX_VISIBLE = Math.max(0, baseMax - Math.max(0, laneCount - 1));
  const visible = cards.slice(0, MAX_VISIBLE);
  visible.forEach(({ card, project }) => {
    list.appendChild(buildChip(card, project, 'single'));
  });
  if (cards.length > MAX_VISIBLE) {
    const more = document.createElement('button');
    more.className = 'cal-more';
    more.textContent = `+ ${cards.length - MAX_VISIBLE}개 더`;
    more.onclick = (e) => { e.stopPropagation(); openDayDetail(dateStr, cards); };
    list.appendChild(more);
  }
  cell.appendChild(list);

  // Click empty area of cell → if any cards (single or spanning), show day detail.
  cell.addEventListener('click', (e) => {
    if (e.target.closest('.cal-chip, .cal-more, .cal-span-bar')) return;
    const spanCards = collectSpansOnDate(dateStr);
    const all = [...spanCards, ...cards];
    if (all.length === 0) return;
    openDayDetail(dateStr, all);
  });

  return cell;
}

// Find all spans active on a given date — used by day-detail popover.
function collectSpansOnDate(dateStr) {
  const target = new Date(dateStr + 'T00:00:00').getTime();
  const out = [];
  for (const project of state.projects) {
    if (scope !== 'all' && project.id !== scope) continue;
    for (const col of project.columns) {
      for (const card of col.cards) {
        if (card.archived || !card.due || !card.start || card.start === card.due) continue;
        const s = new Date(card.start + 'T00:00:00').getTime();
        const e = new Date(card.due   + 'T00:00:00').getTime();
        if (target >= s && target <= e) out.push({ card, project, col, spanRole: 'bar' });
      }
    }
  }
  return out;
}

function buildSpanBar({ span, lane, dayStart, dayEnd }, weekStartTm, weekEndTm) {
  const { card, project } = span;
  const pri = card.priority && card.priority !== 'none' ? ` p-${card.priority}` : '';
  const continuesLeft  = span.startTime < weekStartTm;
  const continuesRight = span.endTime   > weekEndTm;

  const bar = document.createElement('div');
  bar.className = `cal-span-bar${pri}`
    + (continuesLeft  ? ' continues-left'  : '')
    + (continuesRight ? ' continues-right' : '');
  bar.dataset.cardId    = card.id;
  bar.dataset.projectId = project.id;
  bar.dataset.spanRole  = 'bar';

  // Geometry: each lane is 22px tall, sitting under the date number area.
  bar.style.left  = (dayStart / 7 * 100) + '%';
  bar.style.width = ((dayEnd - dayStart + 1) / 7 * 100) + '%';
  bar.style.top   = `calc(var(--date-num-h) + ${lane} * (var(--lane-h) + var(--lane-gap)))`;

  const icon = (scope === 'all')
    ? `<span class="cal-chip-icon">${escHtml(project.icon || '📁')}</span>`
    : '';
  const recur = (card.recurrence && card.recurrence !== 'none')
    ? `<span class="cal-chip-recur" title="반복">🔁</span>` : '';

  bar.innerHTML = `${icon}<span class="cal-bar-title">${escHtml(displayTitle(card.title))}</span>${recur}`;
  bar.dataset.dayCount = String(dayEnd - dayStart + 1);

  bar.addEventListener('click', (e) => {
    if (bar.dataset.suppressClick) return;
    e.stopPropagation();
    jumpToCard(card.id, project.id);
  });
  bar.addEventListener('pointerdown', (e) => onBarPointerDown(e, card, project, bar));

  // Hover cursor cue: show ew-resize over the start/end day of the span so the
  // user discovers the resize affordance. Light math, no DOM lookups.
  bar.addEventListener('mousemove', (e) => {
    if (drag) return;
    const rect = bar.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const days = parseInt(bar.dataset.dayCount, 10) || 1;
    const dayW = rect.width / days;
    const idx = Math.min(days - 1, Math.max(0, Math.floor(offsetX / dayW)));
    const isStart = idx === 0          && !bar.classList.contains('continues-left');
    const isEnd   = idx === days - 1   && !bar.classList.contains('continues-right');
    bar.style.cursor = (isStart || isEnd) ? 'ew-resize' : 'grab';
  });

  return bar;
}

// ── Collect cards: split into single-day (by date map) and spans (list) ─────
function collectAllCards() {
  const singleByDate = {};
  const spans = [];

  for (const project of state.projects) {
    if (scope !== 'all' && project.id !== scope) continue;
    for (const col of project.columns) {
      for (const card of col.cards) {
        if (card.archived) continue;
        if (!card.due) continue;

        const startStr = (card.start && card.start <= card.due) ? card.start : card.due;
        const endStr   = card.due;

        if (startStr === endStr) {
          (singleByDate[endStr] = singleByDate[endStr] || []).push({ card, project, col });
        } else {
          spans.push({
            card, project, col,
            startStr, endStr,
            startTime: new Date(startStr + 'T00:00:00').getTime(),
            endTime:   new Date(endStr   + 'T00:00:00').getTime(),
          });
        }
      }
    }
  }
  // Sort single-day buckets by priority then title.
  const order = { high: 0, medium: 1, low: 2, none: 3 };
  for (const k of Object.keys(singleByDate)) {
    singleByDate[k].sort((a, b) => {
      const pa = order[a.card.priority] ?? 3;
      const pb = order[b.card.priority] ?? 3;
      if (pa !== pb) return pa - pb;
      return a.card.title.localeCompare(b.card.title, 'ko');
    });
  }
  return { singleByDate, spans };
}

// ── Chip (single-day or tray) ───────────────────────────────────────────────
function buildChip(card, project, spanRole = 'single') {
  const chip = document.createElement('div');
  const pri = card.priority && card.priority !== 'none' ? ` p-${card.priority}` : '';
  chip.className = `cal-chip span-${spanRole}${pri}`;
  chip.dataset.cardId = card.id;
  chip.dataset.projectId = project.id;
  chip.dataset.spanRole = spanRole;

  const icon = (scope === 'all')
    ? `<span class="cal-chip-icon">${escHtml(project.icon || '📁')}</span>`
    : '';
  const recur = (card.recurrence && card.recurrence !== 'none')
    ? `<span class="cal-chip-recur" title="반복">🔁</span>` : '';

  chip.innerHTML = `${icon}<span class="cal-chip-title">${escHtml(displayTitle(card.title))}</span>${recur}`;

  chip.addEventListener('click', (e) => {
    if (chip.dataset.suppressClick) return;
    e.stopPropagation();
    jumpToCard(card.id, project.id);
  });
  chip.addEventListener('pointerdown', (e) => onChipPointerDown(e, card, project, chip));
  return chip;
}

// Span-bar pointerdown — role is determined by which DAY of the span the user
// pressed on:
//   pressed day === card.start  → 'start'  (resize start)
//   pressed day === card.due    → 'end'    (resize end)
//   else                          → 'bar'   (shift whole range)
// "continues-left/right" weeks: pressing the visible edge does NOT match the
// real start/end date, so naturally falls back to 'bar' (correct).
function onBarPointerDown(e, card, project, barEl) {
  if (drag) return;
  if (e.button !== undefined && e.button !== 0) return;

  // Identify the cell directly under the press (the day the user actually clicked).
  const prev = barEl.style.pointerEvents;
  barEl.style.pointerEvents = 'none';
  const under = document.elementFromPoint(e.clientX, e.clientY);
  barEl.style.pointerEvents = prev;
  const cell = under && under.closest('.cal-day-cell');
  const chipDate = cell ? cell.dataset.date : null;

  let role = 'bar';
  if (chipDate === card.start)    role = 'start';
  else if (chipDate === card.due) role = 'end';

  drag = {
    cardId: card.id,
    projectId: project.id,
    chipEl: barEl,
    chipDate,
    spanRole: role,
    // Snapshot original geometry so we can restore on cancel + drive live preview.
    origLeft:  barEl.style.left,
    origWidth: barEl.style.width,
    origCardStart: card.start,
    origCardDue:   card.due,
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
        <div class="cal-day-row-title">${escHtml(displayTitle(card.title))}</div>
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

  // Day the chip is rendered on (null for chips in the no-due tray).
  const cell = chipEl.closest('.cal-day-cell');
  const chipDate = cell ? cell.dataset.date : null;
  const spanRole = chipEl.dataset.spanRole || 'single';

  drag = {
    cardId: card.id,
    projectId: project.id,
    chipEl,
    chipDate,
    spanRole,
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
  if (drag.ghost) moveChipGhost(e.clientX, e.clientY);
  updateChipDropTarget(e.clientX, e.clientY);
}

function startChipDrag(x, y) {
  drag.started = true;
  document.body.classList.add('dragging-active');

  const isResize = drag.spanRole === 'start' || drag.spanRole === 'end';

  if (!isResize) {
    const rect = drag.chipEl.getBoundingClientRect();
    drag.offsetX = drag.startX - rect.left;
    drag.offsetY = drag.startY - rect.top;
    const ghost = drag.chipEl.cloneNode(true);
    ghost.classList.add('cal-chip-ghost');
    ghost.style.width = rect.width + 'px';
    ghost.style.left = '';   // clear inline % from span bars so fixed-pos px works
    ghost.style.top  = '';
    document.body.appendChild(ghost);
    drag.ghost = ghost;
    moveChipGhost(x, y);
  }

  drag.chipEl.classList.add(isResize ? 'resizing' : 'dragging');
  document.body.dataset.dragMode = isResize ? 'resize' : 'shift';

  try { drag.chipEl.setPointerCapture(drag.pointerId); } catch {}
  updateChipDropTarget(x, y);
  if (drag.pointerType === 'touch' && navigator.vibrate) navigator.vibrate(15);
}

function moveChipGhost(x, y) {
  drag.ghost.style.left = (x - drag.offsetX) + 'px';
  drag.ghost.style.top  = (y - drag.offsetY) + 'px';
}

function updateChipDropTarget(x, y) {
  // Temporarily hide whatever follows the pointer (ghost if shift, the bar
  // itself if resize) so hit-testing finds the cell underneath.
  const hiddenEl = drag.ghost || drag.chipEl;
  const prevDisp = hiddenEl.style.display;
  const prevPe   = hiddenEl.style.pointerEvents;
  if (drag.ghost) hiddenEl.style.display = 'none';
  else            hiddenEl.style.pointerEvents = 'none';
  const el = document.elementFromPoint(x, y);
  if (drag.ghost) hiddenEl.style.display = prevDisp;
  else            hiddenEl.style.pointerEvents = prevPe;

  document.querySelectorAll('.cal-day-cell.drag-over').forEach(c => c.classList.remove('drag-over'));

  const cell = el && el.closest('.cal-day-cell');
  if (!cell) { drag.targetDate = null; return; }
  cell.classList.add('drag-over');
  drag.targetDate = cell.dataset.date;

  // Live preview for in-week resize: visually move the bar's start/end edge.
  if (drag.spanRole === 'start' || drag.spanRole === 'end') {
    liveResizePreview(cell);
  }
}

// While resizing, if the target cell sits in the same week-row as the bar,
// update the bar's left/width in real time so the user sees the new size.
// Cross-week drops fall back to cell-highlight only (the bar will redraw
// across multiple weeks after refreshAll on drop).
function liveResizePreview(targetCell) {
  if (!drag || !drag.chipEl) return;
  const barWeek    = drag.chipEl.closest('.cal-week');
  const targetWeek = targetCell.closest('.cal-week');
  if (barWeek !== targetWeek) {
    // Different week — restore original geometry visually.
    drag.chipEl.style.left  = drag.origLeft;
    drag.chipEl.style.width = drag.origWidth;
    return;
  }
  const cells = [...barWeek.querySelectorAll('.cal-day-cell')];
  const targetIdx = cells.indexOf(targetCell);
  if (targetIdx < 0) return;

  // Decode current bar geometry from inline %.
  const left  = parseFloat(drag.origLeft);                 // e.g. 28.57
  const width = parseFloat(drag.origWidth);                 // e.g. 42.85
  const COL = 100 / 7;
  let dayStart = Math.round(left / COL);
  let dayEnd   = dayStart + Math.round(width / COL) - 1;

  if (drag.spanRole === 'start') {
    dayStart = Math.min(targetIdx, dayEnd);
  } else if (drag.spanRole === 'end') {
    dayEnd   = Math.max(targetIdx, dayStart);
  }
  drag.chipEl.style.left  = (dayStart * COL) + '%';
  drag.chipEl.style.width = ((dayEnd - dayStart + 1) * COL) + '%';
}

function onChipPointerUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  clearTimeout(drag.longPressTimer);

  if (drag.started) {
    const applied = !!drag.targetDate;
    if (applied) applyDrop(drag);
    // Block the synthetic click that follows.
    drag.chipEl.dataset.suppressClick = '1';
    const chip = drag.chipEl;
    setTimeout(() => delete chip.dataset.suppressClick, 300);
    chipCleanup(applied);
    if (applied) refreshAll();
  } else {
    chipCleanup(false);
  }
}

function chipCleanup(dropApplied) {
  if (drag) {
    if (drag.ghost) drag.ghost.remove();
    if (drag.chipEl) drag.chipEl.classList.remove('dragging', 'resizing');
    try { drag.chipEl.releasePointerCapture(drag.pointerId); } catch {}

    // If a resize was previewed but not applied (cancel / no target), revert.
    if (!dropApplied
        && (drag.spanRole === 'start' || drag.spanRole === 'end')
        && drag.origLeft != null) {
      drag.chipEl.style.left  = drag.origLeft;
      drag.chipEl.style.width = drag.origWidth;
    }
  }
  document.body.classList.remove('dragging-active');
  delete document.body.dataset.dragMode;
  document.querySelectorAll('.cal-day-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
  window.removeEventListener('pointermove', onChipPointerMove);
  window.removeEventListener('pointerup', onChipPointerUp);
  window.removeEventListener('pointercancel', onChipPointerUp);
  drag = null;
}

// Apply the drop:
//   - Tray chip (no chipDate)            → assign due = target, clear start
//   - Single-day card                    → due = target
//   - Span bar, role='start'             → resize start (clamp to ≤ due)
//   - Span bar, role='end'               → resize end   (clamp to ≥ start)
//   - Span bar, role='bar' (middle/body) → shift whole range by (target - chipDate)
function applyDrop(d) {
  const r = findCardAnywhere(d.cardId);
  if (!r) return;
  const c = r.card;

  if (!d.chipDate && d.spanRole !== 'start' && d.spanRole !== 'end') {
    if (c.due !== d.targetDate) { c.due = d.targetDate; c.start = ''; save(); }
    return;
  }
  if (!c.start || c.start === c.due) {
    // Single-day card — straight reschedule.
    if (c.due !== d.targetDate) { c.due = d.targetDate; save(); }
    return;
  }

  // Multi-day card from here on.
  if (d.spanRole === 'start') {
    let s = d.targetDate;
    if (s > c.due) s = c.due;          // clamp: start can't pass end
    if (s !== c.start) {
      c.start = (s === c.due) ? '' : s; // collapse to single-day if they meet
      save();
    }
  } else if (d.spanRole === 'end') {
    let e = d.targetDate;
    if (e < c.start) e = c.start;      // clamp: end can't pass start
    if (e !== c.due) {
      c.due = e;
      if (e === c.start) c.start = ''; // collapse to single-day if they meet
      save();
    }
  } else {
    // 'bar' or fallback → shift entire range
    const delta = daysBetween(d.chipDate, d.targetDate);
    if (delta !== 0) {
      c.start = addDaysISO(c.start, delta);
      c.due   = addDaysISO(c.due,   delta);
      save();
    }
  }
}

function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}
function addDaysISO(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return ymd(d);
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
