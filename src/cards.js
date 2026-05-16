// Card rendering, inline add form, drag & drop logic.

import {
  state, save, getColById, findCard, tagColor,
} from './state.js';
import { uid, escHtml, dueStatus, formatDue } from './utils.js';
import { refreshAll } from './refresh.js';
import { openModal } from './modal.js';

// ── Drag state (per-session, in-memory only) ────────────────────────────────
const drag = { cardId: null, srcColId: null };

// ── Build ───────────────────────────────────────────────────────────────────
export function buildCard(card) {
  const el = document.createElement('div');
  const status = dueStatus(card);

  let cls = 'card';
  if (card.priority !== 'none')           cls += ' p-' + card.priority;
  if (status !== 'none' && status !== 'normal') cls += ' due-' + status;
  el.className = cls;
  el.dataset.cardId = card.id;
  el.draggable = true;

  const priorityBadge = card.priority !== 'none'
    ? `<span class="p-badge c-${priorityColor(card.priority)}">${priorityLabel(card.priority)}</span>`
    : '';

  const tagsHtml = card.tags.map(t =>
    `<span class="tag c-${tagColor(t)}">${escHtml(t)}</span>`).join('');

  const dueText = formatDue(card);
  const dueBadge = dueText
    ? `<span class="due-badge due-${status}">${calendarIcon()}${escHtml(dueText)}</span>`
    : '';

  const hasMeta = tagsHtml || priorityBadge || dueBadge;
  el.innerHTML = `
    <div class="card-title">${escHtml(card.title)}</div>
    ${card.desc ? `<div class="card-desc">${escHtml(card.desc)}</div>` : ''}
    ${hasMeta ? `<div class="card-meta">${tagsHtml}${dueBadge}${priorityBadge}</div>` : ''}
  `;

  el.addEventListener('click', () => openModal(card.id));
  el.addEventListener('dragstart', e => {
    drag.cardId = card.id;
    drag.srcColId = findCard(card.id)?.col?.id;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  el.addEventListener('dragend', clearDragVisuals);

  return el;
}

// ── Drop zone setup (called by board.js per column) ─────────────────────────
export function setupDropZone(area, colId) {
  area.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    area.closest('.column').classList.add('drag-over');

    clearPlaceholders();
    const ph = document.createElement('div');
    ph.className = 'drop-ph';
    const after = afterElementAt(area, e.clientY);
    if (after == null) area.appendChild(ph);
    else area.insertBefore(ph, after);
  });

  area.addEventListener('dragleave', e => {
    if (!area.contains(e.relatedTarget)) {
      area.closest('.column').classList.remove('drag-over');
    }
  });

  area.addEventListener('drop', e => {
    e.preventDefault();
    clearPlaceholders();
    area.closest('.column').classList.remove('drag-over');
    if (!drag.cardId) return;

    const after = afterElementAt(area, e.clientY);
    const srcCol = getColById(drag.srcColId);
    const idx = srcCol.cards.findIndex(c => c.id === drag.cardId);
    const [card] = srcCol.cards.splice(idx, 1);

    const dstCol = getColById(colId);
    if (after == null) {
      dstCol.cards.push(card);
    } else {
      const i = dstCol.cards.findIndex(c => c.id === after.dataset.cardId);
      dstCol.cards.splice(i, 0, card);
    }

    drag.cardId = null;
    drag.srcColId = null;
    save();
    refreshAll();
  });
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
  const title = form.querySelector('textarea').value.trim();
  if (!title) return;
  const col = getColById(colId);
  col.cards.push({ id: uid(), title, desc: '', priority: 'none', tags: [], due: '' });
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

function clearDragVisuals() {
  document.querySelectorAll('.card.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.column.drag-over').forEach(c => c.classList.remove('drag-over'));
  clearPlaceholders();
}

function clearPlaceholders() {
  document.querySelectorAll('.drop-ph').forEach(p => p.remove());
}

const PRIORITY_LABELS = { high: '높음', medium: '중간', low: '낮음' };
const PRIORITY_COLORS = { high: 'red', medium: 'yellow', low: 'green' };
function priorityLabel(p) { return PRIORITY_LABELS[p] || ''; }
function priorityColor(p) { return PRIORITY_COLORS[p] || 'gray'; }

function calendarIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;
}
