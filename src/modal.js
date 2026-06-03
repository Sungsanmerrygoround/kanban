// Card edit modal: open, render priority/tags/checklist, save, archive, delete.
// Also handles: recurrence, duplicate, save-as-template, markdown preview, image paste.

import {
  save, findCard, getColById, activeColumns, activeProject, tagColor, state, pushUndo,
  setActiveProject, ALL_PROJECT_ID,
} from './state.js';
import { escHtml, renderMarkdown, compressImageBlob, nextDueDate } from './utils.js';
import { refreshAll } from './refresh.js';
import { uid } from './utils.js';

// ── Per-open state ──────────────────────────────────────────────────────────
// Note page state
const np = {
  cardId:    null,
  fromModal: false,
  returnToAll: false,
  priority:  'none',
  tags:      [],
  viewMode:  'edit',
};

const m = {
  cardId: null,
  colId: null,
  priority: 'none',
  tags: [],
  checklist: [],
  recurrence: 'none',
  returnToAll: false,   // opened from the "전체" view → restore it on close
};

// ── Open / close ────────────────────────────────────────────────────────────
export function openModal(cardId, opts = {}) {
  // When opened from the cross-project "전체" board, switch to the card's own
  // project first (the modal edits the active project) and remember to return.
  if (opts.projectId && opts.projectId !== state.activeProjectId) {
    setActiveProject(opts.projectId);
    refreshAll();
  }
  m.returnToAll = !!opts.returnToAll;

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
  document.getElementById('mStart').value = card.start || '';
  document.getElementById('mDue').value   = card.due  || '';
  document.getElementById('mRecurrence').value = m.recurrence;

  // Eyebrow: project · column
  const proj = (typeof activeProject === 'function' && activeProject()) || null;
  document.getElementById('mEyebrow').textContent =
    (proj ? proj.name : '') + (col ? ` · ${col.title}` : '');

  const sel = document.getElementById('mColSelect');
  sel.innerHTML = activeColumns().map(c =>
    `<option value="${c.id}" ${c.id === col.id ? 'selected' : ''}>${escHtml(c.title)}</option>`
  ).join('');

  // Reset notes mode to edit.
  setNotesMode('edit');

  renderPriorityPills();
  renderTagPills();
  renderChecklist();
  applyPriorityStrip();

  document.getElementById('overlay').classList.add('open');
  document.getElementById('mTitle').focus();
  requestAnimationFrame(() => autoResize(document.getElementById('mDesc')));
}

function applyPriorityStrip() {
  const modal = document.getElementById('modal');
  if (modal) modal.dataset.priority = m.priority;
}

function autoResize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(Math.max(el.scrollHeight, 140), 480) + 'px';
}

export function closeModal() {
  document.getElementById('overlay').classList.remove('open');
  const returnToAll = m.returnToAll;
  m.cardId = null;
  m.colId  = null;
  m.returnToAll = false;
  // If this card was opened from the "전체" board, go back to it.
  if (returnToAll && state.activeProjectId !== ALL_PROJECT_ID) {
    state.activeProjectId = ALL_PROJECT_ID;
    refreshAll();
  }
}

// ── Read-from-DOM helper ────────────────────────────────────────────────────
function readForm() {
  let start = document.getElementById('mStart').value || '';
  let due   = document.getElementById('mDue').value   || '';

  // Normalize: if user only entered a start date, treat as a single-day on that date.
  if (start && !due) { due = start; start = ''; }
  // Swap if start > due so the user doesn't end up with an invalid range.
  if (start && due && start > due) [start, due] = [due, start];
  // If start === due, drop start — it's a single-day card.
  if (start && start === due) start = '';

  return {
    title:      document.getElementById('mTitle').value.trim(),
    desc:       document.getElementById('mDesc').value.trim(),
    start,
    due,
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

  pushUndo();
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

  pushUndo();
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
  pushUndo();
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
  // Preserve "전체"-view origin so the clone's modal also returns there.
  const returnToAll = m.returnToAll;
  const projId = state.activeProjectId;

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
  // Open the clone for immediate editing (re-entering its project if we came
  // from the "전체" board, since closeModal switched back to it).
  setTimeout(
    () => openModal(clone.id, returnToAll ? { projectId: projId, returnToAll: true } : undefined),
    50,
  );
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

export function flashMsg(text) {
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
  // np-editor fills its parent; auto-resize is for the modal mDesc only.
  if (!ta.classList.contains('np-editor')) autoResize(ta);
  // Trigger input event so listeners (e.g. split-mode preview) update.
  ta.dispatchEvent(new Event('input', { bubbles: true }));
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
      applyPriorityStrip();
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

  const clInput = document.getElementById('checklistInput');

  // Clicking the + icon: add item if input has text, otherwise focus input
  document.querySelector('.checklist-add-icon').addEventListener('click', () => {
    const v = clInput.value.trim();
    if (v) {
      m.checklist.push({ text: v, done: false });
      clInput.value = '';
      renderChecklist();
    }
    clInput.focus();
  });

  // Clicking anywhere in the add row focuses the input
  document.querySelector('.checklist-add').addEventListener('click', (e) => {
    if (e.target !== clInput) clInput.focus();
  });

  clInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const v = e.target.value.trim();
      if (!v) return;
      e.preventDefault();
      m.checklist.push({ text: v, done: false });
      e.target.value = '';
      renderChecklist();
      clInput.focus();
    }
  });

  // Expand to full-screen note page
  document.getElementById('notesExpand').addEventListener('click', () => {
    if (!m.cardId) return;
    // Flush in-progress modal edits (incl. checklist/recurrence which the note
    // page doesn't surface) to the card so they aren't lost on round-trip.
    const result = findCard(m.cardId);
    if (result) {
      const form = readForm();
      if (form.title) Object.assign(result.card, form);
    }
    // Hand the 전체-view origin to the note page; clear it on the modal so the
    // upcoming closeModal() just hides the modal without switching the view.
    const returnToAll = m.returnToAll;
    m.returnToAll = false;
    openNotePage(m.cardId, true);
    np.returnToAll = returnToAll;
    closeModal();
  });
}

// ── Full-screen Note Page ────────────────────────────────────────────────────
export function openNotePage(cardId, fromModal = false) {
  const result = findCard(cardId);
  if (!result) return;
  const { card, col } = result;

  np.cardId    = cardId;
  np.fromModal = fromModal;
  np.returnToAll = false;   // notesExpand sets this after, for 전체-view origin
  np.priority  = fromModal ? m.priority : card.priority;
  np.tags      = fromModal ? [...m.tags] : [...(card.tags || [])];
  np.viewMode  = 'edit';

  // Prefer modal's live values when coming from modal
  const title = fromModal
    ? (document.getElementById('mTitle').value || card.title)
    : card.title;
  const desc = fromModal
    ? document.getElementById('mDesc').value
    : (card.desc || '');
  const due = fromModal
    ? (document.getElementById('mDue').value || card.due || '')
    : (card.due || '');

  document.getElementById('npTitle').value  = title;
  document.getElementById('npEditor').value = desc;
  document.getElementById('npDue').value    = due;

  const proj = activeProject();
  document.getElementById('npBreadcrumb').textContent =
    (proj ? proj.name : '') + (col ? ` · ${col.title}` : '');

  const sel = document.getElementById('npColSelect');
  sel.innerHTML = activeColumns().map(c =>
    `<option value="${c.id}" ${c.id === col.id ? 'selected' : ''}>${escHtml(c.title)}</option>`
  ).join('');

  renderNpPriorityPills();
  renderNpTags();
  setNpViewMode('edit');

  document.getElementById('notePageOverlay').classList.add('open');
  document.getElementById('npEditor').focus();
}

function saveNotePageData() {
  if (!np.cardId) return false;
  const result = findCard(np.cardId);
  if (!result) return false;
  const { card, col: srcCol } = result;

  const title = document.getElementById('npTitle').value.trim();
  if (!title) { document.getElementById('npTitle').focus(); return false; }

  const desc     = document.getElementById('npEditor').value;
  const due      = document.getElementById('npDue').value || '';
  const newColId = document.getElementById('npColSelect').value;

  pushUndo();
  card.title    = title;
  card.desc     = desc;
  card.due      = due;
  card.priority = np.priority;
  card.tags     = [...np.tags];

  if (newColId !== srcCol.id) {
    srcCol.cards = srcCol.cards.filter(c => c.id !== np.cardId);
    getColById(newColId).cards.push(card);
  }

  save();
  refreshAll();
  return true;
}

function closeNotePage() {
  const cardId     = np.cardId;
  const fromModal  = np.fromModal;
  const returnToAll = np.returnToAll;
  document.getElementById('notePageOverlay').classList.remove('open');
  np.cardId    = null;
  np.fromModal = false;
  np.returnToAll = false;

  if (fromModal && cardId) {
    // Re-open modal so user can continue editing other fields (carrying the
    // 전체-view origin so its eventual close returns there).
    openModal(cardId, returnToAll ? { returnToAll: true } : undefined);
  } else if (returnToAll && state.activeProjectId !== ALL_PROJECT_ID) {
    state.activeProjectId = ALL_PROJECT_ID;
    refreshAll();
  }
}

function setNpViewMode(mode) {
  np.viewMode = mode;
  const area    = document.getElementById('npEditorArea');
  const editor  = document.getElementById('npEditor');
  const preview = document.getElementById('npPreviewPane');

  area.className = 'np-editor-area mode-' + mode;

  if (mode === 'edit') {
    editor.style.display  = '';
    preview.style.display = 'none';
  } else if (mode === 'preview') {
    editor.style.display  = 'none';
    preview.style.display = '';
    preview.innerHTML = renderMarkdown(editor.value) ||
      '<div class="np-empty-preview">내용 없음</div>';
  } else { // split
    editor.style.display  = '';
    preview.style.display = '';
    preview.innerHTML = renderMarkdown(editor.value) ||
      '<div class="np-empty-preview">내용 없음</div>';
  }

  document.querySelectorAll('.np-vb').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === mode)
  );
}

function renderNpPriorityPills() {
  document.querySelectorAll('.np-pri-pill').forEach(p => {
    p.className = 'np-pri-pill' +
      (p.dataset.p === np.priority ? ` sel-${np.priority}` : '');
  });
}

function renderNpTags() {
  const box = document.getElementById('npTagsBox');
  const txt = document.getElementById('npTagsText');
  box.innerHTML = '';
  np.tags.forEach((tag, i) => {
    const pill = document.createElement('div');
    pill.className = `tag-pill c-${tagColor(tag)}`;
    pill.innerHTML = `${escHtml(tag)}<button data-i="${i}">×</button>`;
    pill.querySelector('button').addEventListener('click', ev => {
      ev.stopPropagation();
      np.tags.splice(i, 1);
      renderNpTags();
    });
    box.appendChild(pill);
  });
  box.appendChild(txt);
  txt.value = '';
}

export function initNotePage() {
  document.getElementById('npBack').addEventListener('click', () => {
    // If save fails (e.g. empty title), don't close — keep user in the editor.
    if (!saveNotePageData()) return;
    closeNotePage();
  });

  document.getElementById('npSave').addEventListener('click', () => {
    if (saveNotePageData()) flashMsg('저장됨 ✓');
  });

  // View mode buttons
  document.querySelectorAll('.np-vb').forEach(b =>
    b.addEventListener('click', () => setNpViewMode(b.dataset.mode))
  );

  // Priority pills
  document.querySelectorAll('.np-pri-pill').forEach(p =>
    p.addEventListener('click', () => {
      np.priority = p.dataset.p;
      renderNpPriorityPills();
    })
  );

  // Tags
  document.getElementById('npTagsBox').addEventListener('click', () =>
    document.getElementById('npTagsText').focus()
  );
  document.getElementById('npTagsText').addEventListener('keydown', e => {
    const v = e.target.value.trim();
    if ((e.key === 'Enter' || e.key === ',') && v) {
      e.preventDefault();
      const clean = v.replace(/,/g, '');
      if (clean && !np.tags.includes(clean)) np.tags.push(clean);
      renderNpTags();
    } else if (e.key === 'Backspace' && !e.target.value && np.tags.length) {
      np.tags.pop();
      renderNpTags();
    }
  });

  // Image paste
  document.getElementById('npEditor').addEventListener('paste', handlePaste);

  // Live preview in split mode
  document.getElementById('npEditor').addEventListener('input', () => {
    if (np.viewMode === 'split') {
      const p = document.getElementById('npPreviewPane');
      p.innerHTML = renderMarkdown(document.getElementById('npEditor').value) ||
        '<div class="np-empty-preview">내용 없음</div>';
    }
  });

  // Ctrl+S / ⌘S to save
  document.getElementById('notePageOverlay').addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (saveNotePageData()) flashMsg('저장됨 ✓');
    }
  });
}
