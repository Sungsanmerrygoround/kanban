// Card edit modal: open, render priority/tags/checklist, save, archive, delete.

import { save, findCard, getColById, activeColumns, tagColor } from './state.js';
import { escHtml } from './utils.js';
import { refreshAll } from './refresh.js';

// ── Per-open state ──────────────────────────────────────────────────────────
const m = {
  cardId: null,
  colId: null,
  priority: 'none',
  tags: [],
  checklist: [],
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
  m.checklist = (card.checklist || []).map(i => ({ text: i.text, done: !!i.done }));

  document.getElementById('mTitle').value = card.title;
  document.getElementById('mDesc').value  = card.desc || '';
  document.getElementById('mDue').value   = card.due  || '';

  const sel = document.getElementById('mColSelect');
  sel.innerHTML = activeColumns().map(c =>
    `<option value="${c.id}" ${c.id === col.id ? 'selected' : ''}>${escHtml(c.title)}</option>`
  ).join('');

  renderPriorityPills();
  renderTagPills();
  renderChecklist();

  document.getElementById('overlay').classList.add('open');
  document.getElementById('mTitle').focus();
}

export function closeModal() {
  document.getElementById('overlay').classList.remove('open');
  m.cardId = null;
  m.colId  = null;
}

// ── Save / archive / delete ─────────────────────────────────────────────────
function saveModal() {
  if (!m.cardId) return;
  const result = findCard(m.cardId);
  if (!result) return;

  const title = document.getElementById('mTitle').value.trim();
  if (!title) { document.getElementById('mTitle').focus(); return; }

  const newColId = document.getElementById('mColSelect').value;
  const { card, col: srcCol } = result;

  card.title     = title;
  card.desc      = document.getElementById('mDesc').value.trim();
  card.priority  = m.priority;
  card.tags      = [...m.tags];
  card.due       = document.getElementById('mDue').value || '';
  card.checklist = m.checklist.map(i => ({ text: i.text, done: !!i.done }));

  // Move column if changed
  if (newColId !== srcCol.id) {
    srcCol.cards = srcCol.cards.filter(c => c.id !== m.cardId);
    getColById(newColId).cards.push(card);
  }

  save();
  refreshAll();
  closeModal();
}

function archiveCard() {
  if (!m.cardId) return;
  const result = findCard(m.cardId);
  if (!result) return;
  result.card.archived  = true;
  result.card.archivedAt = new Date().toISOString();
  save();
  refreshAll();
  closeModal();
}

function deleteCard() {
  if (!m.cardId) return;
  if (!confirm('이 카드를 완전히 삭제할까요? (아카이브로 보내려면 "아카이브" 버튼을 쓰세요)')) return;
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

// ── Checklist ───────────────────────────────────────────────────────────────
function renderChecklist() {
  const list = document.getElementById('checklistList');
  list.innerHTML = '';
  m.checklist.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'checklist-row' + (item.done ? ' done' : '');
    row.innerHTML = `
      <input type="checkbox" class="checklist-check" ${item.done ? 'checked' : ''} />
      <input type="text" class="checklist-text" value="${escHtml(item.text)}" />
      <button class="checklist-del" title="삭제">×</button>
    `;
    row.querySelector('.checklist-check').addEventListener('change', e => {
      m.checklist[i].done = e.target.checked;
      renderChecklist();
    });
    row.querySelector('.checklist-text').addEventListener('input', e => {
      m.checklist[i].text = e.target.value;
    });
    row.querySelector('.checklist-text').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('checklistInput').focus();
      }
    });
    row.querySelector('.checklist-del').addEventListener('click', () => {
      m.checklist.splice(i, 1);
      renderChecklist();
    });
    list.appendChild(row);
  });
}

// ── Wiring (called once at startup by main.js) ──────────────────────────────
export function initModal() {
  document.getElementById('mSave').addEventListener('click', saveModal);
  document.getElementById('mArchive').addEventListener('click', archiveCard);
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

  document.getElementById('checklistInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const v = e.target.value.trim();
      if (!v) return;
      e.preventDefault();
      m.checklist.push({ text: v, done: false });
      e.target.value = '';
      renderChecklist();
    }
  });
}
