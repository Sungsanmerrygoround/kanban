// Board area: column rendering + column CRUD (add / delete / rename).

import {
  state, activeProject, activeColumns, getColById, matchesSearch, filter,
  save, setActiveProject, COL_COLORS,
} from './state.js';
import { uid, escHtml } from './utils.js';
import { refreshAll } from './refresh.js';
import { buildCard, setupDropZone, openQuickForm, closeQuickForm, submitQuickForm } from './cards.js';
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
        <span class="search-section-icon">${escHtml(project.icon || '📁')}</span>
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
  const el = buildCard(card);
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
  visibleCards.forEach(card => area.appendChild(buildCard(card)));
  setupDropZone(area, col.id);
  el.appendChild(area);

  // Add-card area
  const addArea = document.createElement('div');
  addArea.className = 'add-area';
  addArea.innerHTML = `
    <button class="add-card-btn" data-col-id="${col.id}">${plusIcon()} 카드 추가</button>
    <div class="quick-form" id="qf-${col.id}">
      <textarea rows="2" placeholder="카드 제목 입력..."></textarea>
      <div class="quick-actions">
        <button class="qa-add" data-col-id="${col.id}">추가</button>
        <button class="qa-cancel" data-col-id="${col.id}">취소</button>
      </div>
    </div>
  `;
  el.appendChild(addArea);

  // Wire column-scope events
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
