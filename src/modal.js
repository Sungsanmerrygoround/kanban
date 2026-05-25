// Card edit modal: open, render priority/tags/checklist, save, archive, delete.
// Also handles: recurrence, duplicate, save-as-template, markdown preview, image paste.

import {
  save, findCard, getColById, activeColumns, tagColor, state,
} from './state.js';
import { escHtml, renderMarkdown, compressImageBlob, nextDueDate } from './utils.js';
import { refreshAll } from './refresh.js';
import { uid } from './utils.js';

// ── Per-open state ──────────────────────────────────────────────────────────
const m = {
  cardId: null,
  colId: null,
  priority: 'none',
  tags: [],
  checklist: [],
  recurrence: 'none',
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
  m.recurrence = card.recurrence || 'none';

  document.getElementById('mTitle').value = card.title;
  document.getElementById('mDesc').value  = card.desc || '';
  document.getElementById('mDue').value   = card.due  || '';
  document.getElementById('mRecurrence').value = m.recurrence;

  const sel = document.getElementById('mColSelect');
  sel.innerHTML = activeColumns().map(c =>
    `<option value="${c.id}" ${c.id === col.id ? 'selected' : ''}>${escHtml(c.title)}</option>`
  ).join('');

  // Reset notes mode to edit.
  setNotesMode('edit');

  renderPriorityPills();
  renderTagPills();
  renderChecklist();

  document.getElementById('overlay').classList.add('open');
  document.getElementById('mTitle').focus();
  requestAnimationFrame(() => autoResize(document.getElementById('mDesc')));
}

function autoResize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(Math.max(el.scrollHeight, 140), 480) + 'px';
}

export function closeModal() {
  document.getElementById('overlay').classList.remove('open');
  m.cardId = null;
  m.colId  = null;
}

// ── Read-from-DOM helper ────────────────────────────────────────────────────
function readForm() {
  return {
    title:      document.getElementById('mTitle').value.trim(),
    desc:       document.getElementById('mDesc').value.trim(),
    due:        document.getElementById('mDue').value || '',
    recurrence: document.getElementById('mRecurrence').value || 'none',
    priority:   m.priority,
    tags:       [...m.tags],
    checklist:  m.checklist.map(i => ({ text: i.text, done: !!i.done })),
  };
}

// ── Save / archive / delete / duplicate / template ──────────────────────────
function saveModal() {
  if (!m.cardId) return;
  const result = findCard(m.cardId);
  if (!result) return;

  const form = readForm();
  if (!form.title) { document.getElementById('mTitle').focus(); return; }

  const newColId = document.getElementById('mColSelect').value;
  const { card, col: srcCol } = result;

  Object.assign(card, form);

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

  const { card, col } = result;
  // Persist any in-progress edits first.
  Object.assign(card, readForm());

  // If recurring + has due, spawn next instance before archiving.
  if (card.recurrence && card.recurrence !== 'none' && card.due) {
    const next = {
      ...structuredClone(card),
      id: uid(),
      due: nextDueDate(card.due, card.recurrence),
      checklist: (card.checklist || []).map(i => ({ text: i.text, done: false })),
      archived: false,
      archivedAt: undefined,
    };
    delete next.archivedAt;
    col.cards.push(next);
  }

  card.archived  = true;
  card.archivedAt = new Date().toISOString();
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

function duplicateCard() {
  if (!m.cardId) return;
  const result = findCard(m.cardId);
  if (!result) return;
  const { card, col } = result;

  // Apply any unsaved edits to source before cloning, so the clone reflects them.
  Object.assign(card, readForm());

  const clone = {
    ...structuredClone(card),
    id: uid(),
    title: card.title + ' (복사)',
    checklist: (card.checklist || []).map(i => ({ text: i.text, done: false })),
    archived: false,
  };
  delete clone.archivedAt;

  const idx = col.cards.findIndex(c => c.id === card.id);
  col.cards.splice(idx + 1, 0, clone);

  save();
  refreshAll();
  closeModal();
  // Open the clone for immediate editing.
  setTimeout(() => openModal(clone.id), 50);
}

function saveAsTemplate() {
  if (!m.cardId) return;
  const form = readForm();
  if (!form.title) { alert('템플릿 이름이 될 제목을 먼저 입력하세요.'); return; }
  const name = prompt('템플릿 이름:', form.title);
  if (!name) return;

  if (!Array.isArray(state.templates)) state.templates = [];
  state.templates.push({
    id: uid(),
    name: name.trim(),
    title: form.title,
    desc: form.desc,
    priority: form.priority,
    tags: form.tags,
    checklist: form.checklist.map(i => ({ text: i.text, done: false })),
    recurrence: form.recurrence,
  });
  save();
  refreshAll();
  flashMsg('템플릿으로 저장됨');
}

function flashMsg(text) {
  let el = document.getElementById('flashMsg');
  if (!el) {
    el = document.createElement('div');
    el.id = 'flashMsg';
    el.className = 'flash-msg';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(flashMsg._t);
  flashMsg._t = setTimeout(() => el.classList.remove('show'), 1800);
}

// ── Notes preview toggle + image paste ──────────────────────────────────────
function setNotesMode(mode) {
  const ta = document.getElementById('mDesc');
  const pv = document.getElementById('notesPreview');
  const tg = document.getElementById('notesToggle');
  if (mode === 'preview') {
    pv.innerHTML = renderMarkdown(ta.value) || '<div class="notes-empty">(내용 없음)</div>';
    pv.hidden = false;
    ta.hidden = true;
    tg.textContent = '편집';
    tg.dataset.mode = 'preview';
  } else {
    pv.hidden = true;
    ta.hidden = false;
    tg.textContent = '미리보기';
    tg.dataset.mode = 'edit';
    requestAnimationFrame(() => autoResize(ta));
  }
}

async function handlePaste(e) {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (const it of items) {
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      e.preventDefault();
      const blob = it.getAsFile();
      if (!blob) continue;
      try {
        flashMsg('이미지 처리 중...');
        const dataUrl = await compressImageBlob(blob);
        insertAtCursor(e.target, `\n\n![image](${dataUrl})\n\n`);
        flashMsg('이미지 삽입됨');
      } catch (err) {
        console.warn('Image paste failed:', err);
        flashMsg('이미지 처리 실패');
      }
      return;
    }
  }
}

function insertAtCursor(ta, text) {
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
  const pos = start + text.length;
  ta.selectionStart = ta.selectionEnd = pos;
  autoResize(ta);
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

  const total = m.checklist.length;
  const done  = m.checklist.filter(i => i.done).length;
  const pct   = total ? Math.round((done / total) * 100) : 0;

  const progressEl = document.getElementById('checklistProgress');
  const fillEl     = document.getElementById('checklistBarFill');
  const barWrap    = document.getElementById('checklistBar');
  if (progressEl) progressEl.textContent = total ? `${done} / ${total}` : '';
  if (fillEl)     fillEl.style.width = pct + '%';
  if (barWrap)    barWrap.style.display = total ? '' : 'none';

  m.checklist.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'checklist-row' + (item.done ? ' done' : '');
    row.innerHTML = `
      <button type="button" class="checklist-box" aria-label="${item.done ? '완료 해제' : '완료'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <input type="text" class="checklist-text" value="${escHtml(item.text)}" placeholder="항목 입력..." />
      <button class="checklist-del" title="삭제" aria-label="삭제">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
      </button>
    `;
    row.querySelector('.checklist-box').addEventListener('click', () => {
      m.checklist[i].done = !m.checklist[i].done;
      renderChecklist();
    });
    row.querySelector('.checklist-text').addEventListener('input', e => {
      m.checklist[i].text = e.target.value;
    });
    row.querySelector('.checklist-text').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('checklistInput').focus();
      } else if (e.key === 'Backspace' && !e.target.value) {
        e.preventDefault();
        m.checklist.splice(i, 1);
        renderChecklist();
        const prev = list.querySelectorAll('.checklist-text')[i - 1];
        (prev || document.getElementById('checklistInput')).focus();
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
  document.getElementById('mDuplicate').addEventListener('click', duplicateCard);
  document.getElementById('mSaveTemplate').addEventListener('click', saveAsTemplate);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('notesToggle').addEventListener('click', () => {
    const cur = document.getElementById('notesToggle').dataset.mode;
    setNotesMode(cur === 'edit' ? 'preview' : 'edit');
  });

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

  const desc = document.getElementById('mDesc');
  desc.addEventListener('input', e => autoResize(e.target));
  desc.addEventListener('paste', handlePaste);

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
