// Card edit modal: open, render priority/tags, save, delete.

import { state, save, findCard, getColById, activeColumns, tagColor } from './state.js';
import { escHtml } from './utils.js';
import { refreshAll } from './refresh.js';

// ── Per-open state ──────────────────────────────────────────────────────────
const m = {
  cardId: null,
  colId: null,
  priority: 'none',
  tags: [],
};

// ── Open / close ────────────────────────────────────────────────────────────
export function openModal(cardId) {
  const result = findCard(cardId);
  if (!result) return;
  const { card, col } = result;

  m.cardId = cardId;
  m.colId = col.id;
  m.priority = card.priority;
  m.tags = [...card.tags];

  document.getElementById('mTitle').value = card.title;
  document.getElementById('mDesc').value  = card.desc || '';
  document.getElementById('mDue').value   = card.due  || '';

  const sel = document.getElementById('mColSelect');
  sel.innerHTML = activeColumns().map(c =>
    `<option value="${c.id}" ${c.id === col.id ? 'selected' : ''}>${escHtml(c.title)}</option>`
  ).join('');

  renderPriorityPills();
  renderTagPills();

  document.getElementById('overlay').classList.add('open');
  document.getElementById('mTitle').focus();
}

export function closeModal() {
  document.getElementById('overlay').classList.remove('open');
  m.cardId = null;
  m.colId  = null;
}

// ── Save / delete ───────────────────────────────────────────────────────────
function saveModal() {
  if (!m.cardId) return;
  const result = findCard(m.cardId);
  if (!result) return;

  const title = document.getElementById('mTitle').value.trim();
  if (!title) { document.getElementById('mTitle').focus(); return; }

  const newColId = document.getElementById('mColSelect').value;
  const { card, col: srcCol } = result;

  card.title    = title;
  card.desc     = document.getElementById('mDesc').value.trim();
  card.priority = m.priority;
  card.tags     = [...m.tags];
  card.due      = document.getElementById('mDue').value || '';

  // Move column if changed
  if (newColId !== srcCol.id) {
    srcCol.cards = srcCol.cards.filter(c => c.id !== m.cardId);
    getColById(newColId).cards.push(card);
  }

  save();
  refreshAll();
  closeModal();
}

function deleteCard() {
  if (!m.cardId) return;
  if (!confirm('이 카드를 삭제할까요?')) return;
  const { col } = findCard(m.cardId);
  col.cards = col.cards.filter(c => c.id !== m.cardId);
  save();
  refreshAll();
  closeModal();
}

// ── Pills (priority + tags) ─────────────────────────────────────────────────
function renderPriorityPills() {
  document.querySelectorAll('.pri-pill').forEach(p => {
    p.className = 'pri-pill' + (p.dataset.p === m.priority ? ` sel-${m.priority}` : '');
  });
}

function renderTagPills() {
  const box = document.getElementById('tagsBox');
  const txt = document.getElementById('tagsText');
  box.innerHTML = '';
  m.tags.forEach((tag, i) => {
    const pill = document.createElement('div');
    pill.className = `tag-pill c-${tagColor(tag)}`;
    pill.innerHTML = `${escHtml(tag)}<button data-i="${i}">×</button>`;
    pill.querySelector('button').addEventListener('click', ev => {
      ev.stopPropagation();
      m.tags.splice(i, 1);
      renderTagPills();
    });
    box.appendChild(pill);
  });
  box.appendChild(txt);
  txt.value = '';
}

// ── Wiring (called once at startup by main.js) ──────────────────────────────
export function initModal() {
  document.getElementById('mSave').addEventListener('click', saveModal);
  document.getElementById('mDelete').addEventListener('click', deleteCard);
  document.getElementById('modalClose').addEventListener('click', closeModal);

  document.getElementById('overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('overlay')) closeModal();
  });

  document.querySelectorAll('.pri-pill').forEach(p => {
    p.addEventListener('click', () => {
      m.priority = p.dataset.p;
      renderPriorityPills();
    });
  });

  document.getElementById('tagsBox').addEventListener('click', () =>
    document.getElementById('tagsText').focus()
  );

  document.getElementById('tagsText').addEventListener('keydown', e => {
    const v = e.target.value.trim();
    if ((e.key === 'Enter' || e.key === ',') && v) {
      e.preventDefault();
      const clean = v.replace(/,/g, '');
      if (clean && !m.tags.includes(clean)) m.tags.push(clean);
      renderTagPills();
    } else if (e.key === 'Backspace' && !e.target.value && m.tags.length) {
      m.tags.pop();
      renderTagPills();
    }
  });
}
