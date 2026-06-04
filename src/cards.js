// Card rendering, inline add form, pointer-based boardDrag & drop (mouse + touch).

import {
  save, getColById, findCard, tagColor, state, pushUndo, projectHue, makeCard,
} from './state.js';
import {
  escHtml, dueStatus, formatDue, displayTitle, RECURRENCE_LABELS,
  PRIORITY_LABELS, PRIORITY_COLORS,
  MOUSE_THRESHOLD, TOUCH_LONG_PRESS, TOUCH_CANCEL_DIST,
} from './utils.js';
import { refreshAll } from './refresh.js';
import { openModal } from './modal.js';

// ── Drag state (per-session, in-memory only) ────────────────────────────────
let boardDrag = null;

// ── Build ───────────────────────────────────────────────────────────────────
export function buildCard(card, projectId) {
  const el = document.createElement('div');
  const status = dueStatus(card);
  if (projectId != null) el.style.setProperty('--ph', projectHue(projectId));

  let cls = 'card';
  if (card.priority !== 'none')           cls += ' p-' + card.priority;
  if (status !== 'none' && status !== 'normal') cls += ' due-' + status;
  el.className = cls;
  el.dataset.cardId = card.id;

  const priorityBadge = card.priority !== 'none'
    ? `<span class="p-badge c-${priorityColor(card.priority)}">${priorityLabel(card.priority)}</span>`
    : '';

  const tagsHtml = card.tags.map(t =>
    `<span class="tag c-${tagColor(t)}">${escHtml(t)}</span>`).join('');

  const dueText = formatDue(card);
  const dueBadge = dueText
    ? `<span class="due-badge due-${status}">${calendarIcon()}${escHtml(dueText)}</span>`
    : '';

  const cl = card.checklist || [];
  const clDone = cl.filter(i => i.done).length;
  const clBadge = cl.length
    ? `<span class="checklist-badge ${clDone === cl.length ? 'done' : ''}">${checkIcon()}${clDone}/${cl.length}</span>`
    : '';

  const recurBadge = (card.recurrence && card.recurrence !== 'none')
    ? `<span class="recur-badge" title="반복: ${RECURRENCE_LABELS[card.recurrence] || ''}">🔁</span>`
    : '';

  // Show desc as plain text (first 2 lines via CSS), stripped of markdown markers
  // so a paste of "**중요**" doesn't look like literal asterisks on the card.
  const descPlain = card.desc ? stripMarkdown(card.desc) : '';

  const hasMeta = tagsHtml || priorityBadge || dueBadge || clBadge || recurBadge;
  el.innerHTML = `
    <div class="card-title">${escHtml(displayTitle(card.title))}${recurBadge}</div>
    ${descPlain ? `<div class="card-desc">${escHtml(descPlain)}</div>` : ''}
    ${hasMeta ? `<div class="card-meta">${tagsHtml}${dueBadge}${clBadge}${priorityBadge}</div>` : ''}
  `;

  el.addEventListener('click', (e) => {
    if (el.dataset.suppressClick) return;
    openModal(card.id);
  });
  el.addEventListener('pointerdown', (e) => onPointerDown(e, card, el));

  return el;
}

// ── Pointer boardDrag pipeline ───────────────────────────────────────────────────
function onPointerDown(e, card, cardEl) {
  if (boardDrag) return;
  if (e.button !== undefined && e.button !== 0) return; // left mouse only
  // Ignore touch starts on interactive children (none for now, but future-proof)
  const result = findCard(card.id);
  if (!result) return;

  boardDrag = {
    cardId: card.id,
    srcColId: result.col.id,
    cardEl,
    pointerId: e.pointerId,
    pointerType: e.pointerType,
    startX: e.clientX,
    startY: e.clientY,
    offsetX: 0,
    offsetY: 0,
    started: false,
    ghost: null,
    targetColId: null,
    afterCardId: null,
    longPressTimer: null,
  };

  if (e.pointerType === 'touch') {
    boardDrag.longPressTimer = setTimeout(() => {
      if (boardDrag && !boardDrag.started) startDrag(boardDrag.startX, boardDrag.startY);
    }, TOUCH_LONG_PRESS);
  }

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
}

function onPointerMove(e) {
  if (!boardDrag || e.pointerId !== boardDrag.pointerId) return;
  const dx = e.clientX - boardDrag.startX;
  const dy = e.clientY - boardDrag.startY;
  const dist = Math.hypot(dx, dy);

  if (!boardDrag.started) {
    if (boardDrag.pointerType === 'touch') {
      // Movement before long-press fires ⇒ user is scrolling, abort boardDrag.
      if (dist > TOUCH_CANCEL_DIST) {
        clearTimeout(boardDrag.longPressTimer);
        cleanup(false);
      }
    } else if (dist > MOUSE_THRESHOLD) {
      startDrag(e.clientX, e.clientY);
    }
    return;
  }

  e.preventDefault();
  moveGhost(e.clientX, e.clientY);
  updateDropTarget(e.clientX, e.clientY);
  autoScrollBoard(e.clientX);
}

function startDrag(x, y) {
  const rect = boardDrag.cardEl.getBoundingClientRect();
  boardDrag.offsetX = boardDrag.startX - rect.left;
  boardDrag.offsetY = boardDrag.startY - rect.top;
  boardDrag.started = true;

  const ghost = boardDrag.cardEl.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.style.width = rect.width + 'px';
  document.body.appendChild(ghost);
  boardDrag.ghost = ghost;

  boardDrag.cardEl.classList.add('dragging');
  document.body.classList.add('dragging-active');

  // Lock pointer to the card so we keep receiving moves even off-element.
  try { boardDrag.cardEl.setPointerCapture(boardDrag.pointerId); } catch (_) { /* ignore */ }

  moveGhost(x, y);
  updateDropTarget(x, y);

  if (boardDrag.pointerType === 'touch' && navigator.vibrate) navigator.vibrate(15);
}

function moveGhost(x, y) {
  boardDrag.ghost.style.left = (x - boardDrag.offsetX) + 'px';
  boardDrag.ghost.style.top  = (y - boardDrag.offsetY) + 'px';
}

function updateDropTarget(x, y) {
  // Hide the ghost so it doesn't intercept the hit test.
  const prev = boardDrag.ghost.style.display;
  boardDrag.ghost.style.display = 'none';
  const el = document.elementFromPoint(x, y);
  boardDrag.ghost.style.display = prev;

  clearPlaceholders();
  document.querySelectorAll('.column.drag-over').forEach(c => c.classList.remove('drag-over'));

  const area = el && el.closest('.cards-area');
  if (!area) { boardDrag.targetColId = null; boardDrag.afterCardId = null; return; }

  area.closest('.column').classList.add('drag-over');
  boardDrag.targetColId = area.dataset.colId;

  const ph = document.createElement('div');
  ph.className = 'drop-ph';
  const after = afterElementAt(area, y);
  if (after == null) area.appendChild(ph);
  else area.insertBefore(ph, after);
  boardDrag.afterCardId = after ? after.dataset.cardId : null;
}

function autoScrollBoard(x) {
  const board = document.getElementById('board');
  const r = board.getBoundingClientRect();
  const margin = 70;
  if (x - r.left < margin)        board.scrollLeft -= 14;
  else if (r.right - x < margin)  board.scrollLeft += 14;
}

function onPointerUp(e) {
  if (!boardDrag || e.pointerId !== boardDrag.pointerId) return;
  clearTimeout(boardDrag.longPressTimer);

  if (boardDrag.started) {
    performDrop();
    // Block the synthetic click that follows pointerup so the modal doesn't open.
    boardDrag.cardEl.dataset.suppressClick = '1';
    const cardEl = boardDrag.cardEl;
    setTimeout(() => delete cardEl.dataset.suppressClick, 300);
    cleanup(true);
  } else {
    cleanup(false);
  }
}

function performDrop() {
  if (!boardDrag.targetColId) return;
  const srcCol = getColById(boardDrag.srcColId);
  if (!srcCol) return;
  const idx = srcCol.cards.findIndex(c => c.id === boardDrag.cardId);
  if (idx < 0) return;

  pushUndo();
  const [card] = srcCol.cards.splice(idx, 1);
  const dstCol = getColById(boardDrag.targetColId);

  if (boardDrag.afterCardId == null) {
    dstCol.cards.push(card);
  } else {
    const i = dstCol.cards.findIndex(c => c.id === boardDrag.afterCardId);
    dstCol.cards.splice(i < 0 ? dstCol.cards.length : i, 0, card);
  }

  save();
  refreshAll();
}

function cleanup(_dropped) {
  if (boardDrag) {
    if (boardDrag.ghost) boardDrag.ghost.remove();
    if (boardDrag.cardEl) boardDrag.cardEl.classList.remove('dragging');
    try { boardDrag.cardEl.releasePointerCapture(boardDrag.pointerId); } catch (_) {}
  }
  document.body.classList.remove('dragging-active');
  document.querySelectorAll('.column.drag-over').forEach(c => c.classList.remove('drag-over'));
  clearPlaceholders();
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
  boardDrag = null;
}

// ── Inline add card form (wired by board.js when columns are rendered) ──────
export function openQuickForm(colId) {
  const btn = document.querySelector(`.add-card-btn[data-col-id="${colId}"]`);
  if (btn) btn.style.display = 'none';
  const form = document.getElementById('qf-' + colId);
  if (!form) return;
  form.classList.add('open');
  form.querySelector('textarea').focus();
}

export function closeQuickForm(colId) {
  const form = document.getElementById('qf-' + colId);
  if (!form) return;
  form.classList.remove('open');
  form.querySelector('textarea').value = '';
  const btn = document.querySelector(`.add-card-btn[data-col-id="${colId}"]`);
  if (btn) btn.style.display = '';
}

export function submitQuickForm(colId) {
  const form = document.getElementById('qf-' + colId);
  const ta = form.querySelector('textarea');
  const title = ta.value.trim();
  const tplSel = form.querySelector('.qf-template');
  const tplId  = tplSel ? tplSel.value : '';
  const col = getColById(colId);

  if (tplId) {
    const t = (state.templates || []).find(x => x.id === tplId);
    if (t) {
      col.cards.push(makeCard({
        title: title || t.title,
        desc: t.desc || '',
        priority: t.priority || 'none',
        tags: [...(t.tags || [])],
        checklist: (t.checklist || []).map(i => ({ text: i.text, done: false })),
        recurrence: t.recurrence || 'none',
      }));
      ta.value = '';
      if (tplSel) tplSel.value = '';
      save();
      refreshAll();
      return;
    }
  }

  if (!title) return;
  col.cards.push(makeCard({ title }));
  ta.value = '';
  save();
  refreshAll();
}

// ── Internal helpers ────────────────────────────────────────────────────────
function afterElementAt(container, y) {
  const cards = [...container.querySelectorAll('.card:not(.dragging)')];
  let best = null, bestOff = Infinity;
  for (const c of cards) {
    const { top, height } = c.getBoundingClientRect();
    const off = y - top - height / 2;
    if (off < 0 && Math.abs(off) < bestOff) {
      bestOff = Math.abs(off);
      best = c;
    }
  }
  return best;
}

function clearPlaceholders() {
  document.querySelectorAll('.drop-ph').forEach(p => p.remove());
}

function stripMarkdown(s) {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[이미지]')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*#>_~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function priorityLabel(p) { return PRIORITY_LABELS[p] || ''; }
function priorityColor(p) { return PRIORITY_COLORS[p] || 'gray'; }

function calendarIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;
}

function checkIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
}
