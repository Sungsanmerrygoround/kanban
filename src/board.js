// Board area: column rendering + column CRUD (add / delete / rename).

import {
  state, activeProject, activeColumns, getColById, matchesSearch, filter,
  save, setActiveProject, COL_COLORS, pushUndo,
} from './state.js';
import { uid, escHtml, MOUSE_THRESHOLD } from './utils.js';
import { refreshAll } from './refresh.js';
import { buildCard, openQuickForm, closeQuickForm, submitQuickForm } from './cards.js';
import { openModal } from './modal.js';

// ── Render ──────────────────────────────────────────────────────────────────
export function renderBoard() {
  const board = document.getElementById('board');
  const scrollLeft = board.scrollLeft;
  board.innerHTML = '';

  if (filter.query) {
    renderSearchResults(board);
    return;
  }

  board.classList.remove('search-mode');
  activeColumns().forEach(col => board.appendChild(buildColumn(col)));

  // "+ 컬럼 추가" tail button
  const addBtn = document.createElement('button');
  addBtn.className = 'add-col-btn';
  addBtn.innerHTML = plusIcon() + ' 컬럼 추가';
  addBtn.addEventListener('click', addColumn);
  board.appendChild(addBtn);

  board.scrollLeft = scrollLeft;
}

// ── Cross-project search results ────────────────────────────────────────────
function renderSearchResults(board) {
  board.classList.add('search-mode');

  const wrap = document.createElement('div');
  wrap.className = 'search-results';

  let totalHits = 0;
  state.projects.forEach(project => {
    const hits = [];
    for (const col of project.columns) {
      for (const card of col.cards) {
        if (card.archived) continue;
        if (matchesSearch(card)) hits.push({ card, col });
      }
    }
    if (hits.length === 0) return;
    totalHits += hits.length;

    const section = document.createElement('div');
    section.className = 'search-section';
    section.innerHTML = `
      <div class="search-section-head">
        <span class="search-section-name">${escHtml(project.name)}</span>
        <span class="search-section-count">${hits.length}</span>
      </div>
    `;
    const list = document.createElement('div');
    list.className = 'search-section-list';
    hits.forEach(({ card, col }) => list.appendChild(buildSearchCard(card, col, project)));
    section.appendChild(list);
    wrap.appendChild(section);
  });

  if (totalHits === 0) {
    const empty = document.createElement('div');
    empty.className = 'search-empty';
    empty.innerHTML = `
      <div class="search-empty-icon">🔍</div>
      <div class="search-empty-title">검색 결과가 없습니다</div>
      <div class="search-empty-sub">"${escHtml(filter.query)}" 와 일치하는 카드를 찾지 못했어요.</div>
    `;
    wrap.appendChild(empty);
  }

  board.appendChild(wrap);
}

function buildSearchCard(card, col, project) {
  // Reuse the normal card markup but disable drag and add a project/column label.
  const el = buildCard(card, project.id);
  el.classList.add('search-card');

  const meta = document.createElement('div');
  meta.className = 'search-card-loc';
  meta.innerHTML = `<span class="loc-col">${escHtml(col.title)}</span>`;
  el.insertBefore(meta, el.firstChild);

  // Replace click: jump to that project + open the card.
  const fresh = el.cloneNode(true);
  fresh.addEventListener('click', () => {
    setActiveProject(project.id);
    // Clear search so the project board renders normally.
    filter.query = '';
    const input = document.getElementById('searchInput');
    if (input) input.value = '';
    refreshAll();
    openModal(card.id);
  });
  return fresh;
}

function buildColumn(col) {
  const el = document.createElement('div');
  el.className = 'column';
  el.dataset.colId = col.id;

  const liveCards = col.cards.filter(c => !c.archived);
  const visibleCards = liveCards.filter(matchesSearch);

  // Header
  const hdr = document.createElement('div');
  hdr.className = 'col-header';
  hdr.innerHTML = `
    <div class="col-dot" style="background:${col.color}"></div>
    <div class="col-title-wrap">
      <div class="col-title" data-col-id="${col.id}">${escHtml(col.title)}</div>
    </div>
    <div class="col-badge">${liveCards.length}</div>
    <button class="col-delete" data-col-id="${col.id}" title="컬럼 삭제">×</button>
  `;
  el.appendChild(hdr);

  el.appendChild(divider());

  // Cards area
  const area = document.createElement('div');
  area.className = 'cards-area';
  area.dataset.colId = col.id;
  if (visibleCards.length === 0 && !filter.query) {
    const empty = document.createElement('div');
    empty.className = 'empty-col';
    empty.textContent = '카드를 추가하세요';
    area.appendChild(empty);
  }
  const projId = activeProject().id;
  visibleCards.forEach(card => area.appendChild(buildCard(card, projId)));
  el.appendChild(area);

  // Add-card area
  const templates = (state.templates || []);
  const tplSelectHtml = templates.length ? `
    <select class="qf-template" data-col-id="${col.id}">
      <option value="">템플릿에서 시작 (선택)</option>
      ${templates.map(t => `<option value="${t.id}">${escHtml(t.name)}</option>`).join('')}
    </select>
  ` : '';

  const addArea = document.createElement('div');
  addArea.className = 'add-area';
  addArea.innerHTML = `
    <button class="add-card-btn" data-col-id="${col.id}">${plusIcon()} 카드 추가</button>
    <div class="quick-form" id="qf-${col.id}">
      ${tplSelectHtml}
      <textarea rows="2" placeholder="카드 제목 입력..."></textarea>
      <div class="quick-actions">
        <button class="qa-add" data-col-id="${col.id}">추가</button>
        <button class="qa-cancel" data-col-id="${col.id}">취소</button>
      </div>
    </div>
  `;
  el.appendChild(addArea);

  // Wire column-scope events
  hdr.addEventListener('pointerdown', (e) => onColHeaderPointerDown(e, col));
  hdr.querySelector('.col-title').addEventListener('dblclick', startRenameCol);
  hdr.querySelector('.col-title').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  });
  hdr.querySelector('.col-title').addEventListener('blur', finishRenameCol);
  hdr.querySelector('.col-delete').addEventListener('click', e => {
    e.stopPropagation();
    deleteColumn(col.id);
  });

  addArea.querySelector('.add-card-btn').addEventListener('click', () => openQuickForm(col.id));
  addArea.querySelector('.qa-add').addEventListener('click', () => submitQuickForm(col.id));
  addArea.querySelector('.qa-cancel').addEventListener('click', () => closeQuickForm(col.id));
  addArea.querySelector('textarea').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitQuickForm(col.id); }
    if (e.key === 'Escape') closeQuickForm(col.id);
  });

  return el;
}

// ── Column CRUD ─────────────────────────────────────────────────────────────
export function addColumn() {
  const cols = activeColumns();
  const color = COL_COLORS[cols.length % COL_COLORS.length];
  pushUndo();
  cols.push({ id: uid(), title: '새 컬럼', color, cards: [] });
  save();
  refreshAll();

  // Scroll to and focus the new column's title for inline rename.
  setTimeout(() => {
    const b = document.getElementById('board');
    b.scrollLeft = b.scrollWidth;
    const titles = b.querySelectorAll('.col-title');
    const last = titles[titles.length - 1];
    if (last) last.dispatchEvent(new MouseEvent('dblclick'));
  }, 50);
}

function deleteColumn(colId) {
  if (activeColumns().length <= 1) {
    alert('마지막 컬럼은 삭제할 수 없어요.');
    return;
  }
  const col = getColById(colId);
  if (col.cards.length > 0 &&
      !confirm(`"${col.title}" 컬럼과 카드 ${col.cards.length}개를 삭제할까요?`)) {
    return;
  }
  pushUndo();
  activeProject().columns = activeColumns().filter(c => c.id !== colId);
  save();
  refreshAll();
}

function startRenameCol(e) {
  const el = e.currentTarget;
  el.contentEditable = 'true';
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function finishRenameCol(e) {
  const el = e.currentTarget;
  el.contentEditable = 'false';
  const col = getColById(el.dataset.colId);
  if (col) {
    col.title = el.textContent.trim() || col.title;
    save();
  }
}

// ── DOM helpers ─────────────────────────────────────────────────────────────
function divider() {
  const d = document.createElement('div');
  d.className = 'col-divider';
  return d;
}

function plusIcon() {
  return `<svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>`;
}

// ── Column drag-to-reorder ───────────────────────────────────────────────────
let colDrag = null;

function onColHeaderPointerDown(e, col) {
  if (colDrag) return;
  if (e.button !== undefined && e.button !== 0) return;
  if (e.target.closest('.col-delete')) return;
  const titleEl = e.target.closest('.col-title');
  if (titleEl && titleEl.contentEditable === 'true') return;

  colDrag = {
    colId:             col.id,
    pointerId:         e.pointerId,
    startX:            e.clientX,
    startY:            e.clientY,
    started:           false,
    ghost:             null,
    colEl:             e.currentTarget.closest('.column'),
    insertBeforeColId: null,
    offsetX:           0,
    offsetY:           0,
  };

  window.addEventListener('pointermove',   onColPointerMove);
  window.addEventListener('pointerup',     onColPointerUp);
  window.addEventListener('pointercancel', onColPointerUp);
}

function onColPointerMove(e) {
  if (!colDrag || e.pointerId !== colDrag.pointerId) return;
  const dx = e.clientX - colDrag.startX;
  const dy = e.clientY - colDrag.startY;

  if (!colDrag.started) {
    if (Math.hypot(dx, dy) > MOUSE_THRESHOLD) startColDrag(e.clientX, e.clientY);
    return;
  }

  e.preventDefault();
  moveColGhost(e.clientX, e.clientY);
  updateColDropTarget(e.clientX);
  colAutoScroll(e.clientX);
}

function startColDrag(x, y) {
  const rect = colDrag.colEl.getBoundingClientRect();
  colDrag.offsetX = colDrag.startX - rect.left;
  colDrag.offsetY = colDrag.startY - rect.top;
  colDrag.started = true;

  const ghost = colDrag.colEl.cloneNode(true);
  ghost.classList.add('col-ghost');
  ghost.style.width = rect.width + 'px';
  document.body.appendChild(ghost);
  colDrag.ghost = ghost;

  colDrag.colEl.classList.add('dragging-col');
  document.body.classList.add('dragging-active');

  try { colDrag.colEl.setPointerCapture(colDrag.pointerId); } catch (_) {}

  moveColGhost(x, y);
  updateColDropTarget(x);
}

function moveColGhost(x, y) {
  colDrag.ghost.style.left = (x - colDrag.offsetX) + 'px';
  colDrag.ghost.style.top  = (y - colDrag.offsetY) + 'px';
}

function updateColDropTarget(x) {
  clearColPlaceholders();
  const board = document.getElementById('board');
  const cols  = [...board.querySelectorAll('.column:not(.dragging-col)')];

  let insertBefore = null;
  for (const c of cols) {
    const r = c.getBoundingClientRect();
    if (x < r.left + r.width / 2) { insertBefore = c; break; }
  }

  const ph = document.createElement('div');
  ph.className = 'col-ph';
  // Match the dragged column's actual width (avoids 272 vs 296 mismatch).
  const w = colDrag.colEl?.getBoundingClientRect().width;
  if (w) ph.style.width = w + 'px';

  if (insertBefore) {
    board.insertBefore(ph, insertBefore);
    colDrag.insertBeforeColId = insertBefore.dataset.colId;
  } else {
    const addBtn = board.querySelector('.add-col-btn');
    addBtn ? board.insertBefore(ph, addBtn) : board.appendChild(ph);
    colDrag.insertBeforeColId = null;
  }
}

function colAutoScroll(x) {
  const board = document.getElementById('board');
  const r = board.getBoundingClientRect();
  const margin = 80;
  if (x - r.left < margin)       board.scrollLeft -= 16;
  else if (r.right - x < margin) board.scrollLeft += 16;
}

function onColPointerUp(e) {
  if (!colDrag || e.pointerId !== colDrag.pointerId) return;
  if (colDrag.started) performColDrop();
  cleanupColDrag();
}

function performColDrop() {
  const cols   = activeColumns();
  const srcIdx = cols.findIndex(c => c.id === colDrag.colId);
  if (srcIdx < 0) return;

  pushUndo();
  const [col] = cols.splice(srcIdx, 1);

  if (colDrag.insertBeforeColId === null) {
    cols.push(col);
  } else {
    const dstIdx = cols.findIndex(c => c.id === colDrag.insertBeforeColId);
    cols.splice(dstIdx < 0 ? cols.length : dstIdx, 0, col);
  }

  activeProject().columns = cols;
  save();
  refreshAll();
}

function cleanupColDrag() {
  if (colDrag) {
    if (colDrag.ghost) colDrag.ghost.remove();
    if (colDrag.colEl) colDrag.colEl.classList.remove('dragging-col');
    try { colDrag.colEl.releasePointerCapture(colDrag.pointerId); } catch (_) {}
  }
  document.body.classList.remove('dragging-active');
  clearColPlaceholders();
  window.removeEventListener('pointermove',   onColPointerMove);
  window.removeEventListener('pointerup',     onColPointerUp);
  window.removeEventListener('pointercancel', onColPointerUp);
  colDrag = null;
}

function clearColPlaceholders() {
  document.querySelectorAll('.col-ph').forEach(p => p.remove());
}
