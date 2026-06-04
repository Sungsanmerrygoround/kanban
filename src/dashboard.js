// Dashboard / smart-view renderer. Renders the active smart view
// (활성 selection = '__view__:<id>') as sectioned or flat card lists.
// Shared by the built-in views (오늘 / 이번 주 / 지연됨) and saved views.

import {
  state, save, pushUndo, projectHue, activeViewId, viewName,
  STD_COLUMNS, touchCard, filter, hasAdHocFilter,
} from './state.js';
import {
  allCards, matchesFilter, sortCards, isOverdue, isToday, isDone,
} from './query.js';
import { escHtml, displayTitle, formatDue, dueStatus } from './utils.js';
import { openModal } from './modal.js';
import { refreshAll } from './refresh.js';

export function renderDashboard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  board.classList.remove('search-mode');

  const id = activeViewId();
  const wrap = document.createElement('div');
  wrap.className = 'dash-wrap';

  if (hasAdHocFilter()) {
    renderAdHoc(wrap);
  } else if (id === 'today') {
    renderToday(wrap);
  } else {
    renderFiltered(wrap, id);
  }

  board.appendChild(wrap);
}

// Transient "필터 결과" from the filter bar (priority/tag/due chips).
function renderAdHoc(wrap) {
  const f = { priorities: filter.priorities, tags: filter.tags, due: filter.due };
  const entries = sortCards(allCards().filter(e => matchesFilter(e, f)), 'smart');
  wrap.appendChild(dashHead('필터 결과', entries.length));
  if (entries.length === 0) {
    wrap.appendChild(emptyState('조건에 맞는 카드가 없어요.'));
    return;
  }
  const list = document.createElement('div');
  list.className = 'dash-list';
  entries.forEach(e => list.appendChild(buildRow(e)));
  wrap.appendChild(list);
}

// ── 오늘: multi-section, deduped across sections ─────────────────────────────
function renderToday(wrap) {
  const shown = new Set();
  const pool = allCards();
  let total = 0;

  const pick = (predicate, sortBy) => {
    const got = sortCards(
      pool.filter(e => !shown.has(e.card.id) && predicate(e)), sortBy);
    got.forEach(e => shown.add(e.card.id));
    total += got.length;
    return got;
  };

  const overdue  = pick(e => !isDone(e) && isOverdue(e.card), 'due');
  const today    = pick(e => !isDone(e) && isToday(e.card),  'smart');
  const doing    = pick(e => e.col.title === STD_COLUMNS[1], 'smart'); // 진행 중
  const recent   = pick(e => !!e.card.updatedAt, 'updated').slice(0, 8);

  const heading = `${todayLabel()} · 오늘`;
  wrap.appendChild(dashHead(heading, total));

  if (total === 0) {
    wrap.appendChild(emptyState('오늘 처리할 카드가 없어요 ✨'));
    return;
  }
  addSection(wrap, '🔴 지연됨',   overdue);
  addSection(wrap, '📅 오늘 마감', today);
  addSection(wrap, '🔵 진행 중',   doing);
  addSection(wrap, '🕒 최근 편집', recent);
}

// ── 이번 주 / 지연됨 / 저장된 뷰: single filtered list ────────────────────────
function renderFiltered(wrap, id) {
  let filter;
  if (id === 'week')         filter = { due: 'week' };
  else if (id === 'overdue') filter = { due: 'overdue' };
  else {
    const sv = (state.savedViews || []).find(v => v.id === id);
    filter = sv ? sv.filter : {};
  }

  const builtinExcludesDone = id === 'week' || id === 'overdue';
  let entries = allCards().filter(e =>
    (!builtinExcludesDone || !isDone(e)) && matchesFilter(e, filter));
  entries = sortCards(entries, 'smart');

  wrap.appendChild(dashHead(viewName(id), entries.length));
  if (entries.length === 0) {
    wrap.appendChild(emptyState('조건에 맞는 카드가 없어요.'));
    return;
  }
  const list = document.createElement('div');
  list.className = 'dash-list';
  entries.forEach(e => list.appendChild(buildRow(e)));
  wrap.appendChild(list);
}

// ── Building blocks ─────────────────────────────────────────────────────────
function dashHead(title, count) {
  const head = document.createElement('div');
  head.className = 'dash-head';
  head.innerHTML = `
    <div class="dash-title">${escHtml(title)}</div>
    <div class="dash-count">${count}</div>`;
  return head;
}

function addSection(wrap, title, entries) {
  if (!entries.length) return;
  const sec = document.createElement('div');
  sec.className = 'dash-section';
  sec.innerHTML = `<div class="dash-section-title">${escHtml(title)}<span class="dash-section-count">${entries.length}</span></div>`;
  const list = document.createElement('div');
  list.className = 'dash-list';
  entries.forEach(e => list.appendChild(buildRow(e)));
  sec.appendChild(list);
  wrap.appendChild(sec);
}

function emptyState(msg) {
  const el = document.createElement('div');
  el.className = 'dash-empty';
  el.textContent = msg;
  return el;
}

function buildRow(entry) {
  const { card, col, project } = entry;
  const done = isDone(entry);
  const status = dueStatus(card);

  const row = document.createElement('div');
  row.className = 'dash-row' + (done ? ' is-done' : '');
  row.style.setProperty('--ph', projectHue(project.id));

  const pri = card.priority && card.priority !== 'none' ? card.priority : '';
  const dueTxt = formatDue(card);
  const cl = card.checklist || [];
  const clDone = cl.filter(i => i.done).length;

  row.innerHTML = `
    <button class="dash-check${done ? ' checked' : ''}" title="${done ? '완료됨' : '완료로 이동'}" aria-label="완료">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </button>
    <div class="dash-main">
      <div class="dash-row-title">${pri ? `<span class="dash-pri p-${pri}"></span>` : ''}${escHtml(displayTitle(card.title))}</div>
      <div class="dash-meta">
        <span class="dash-proj">${escHtml(project.name)}</span>
        <span class="dash-status">${escHtml(col.title)}</span>
        ${cl.length ? `<span class="dash-cl">☑ ${clDone}/${cl.length}</span>` : ''}
      </div>
    </div>
    ${dueTxt ? `<span class="dash-due due-${status}">${escHtml(dueTxt)}</span>` : ''}
  `;

  row.querySelector('.dash-check').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!done) completeCard(entry);
  });
  row.addEventListener('click', () => {
    openModal(card.id, { projectId: project.id, returnTo: state.activeProjectId });
  });
  return row;
}

// Move a card into its project's 완료 column.
function completeCard(entry) {
  const { card, col, project } = entry;
  const dest = project.columns.find(c => c.title === STD_COLUMNS[2]); // 완료
  if (!dest || dest === col) return;
  pushUndo();
  col.cards = col.cards.filter(c => c.id !== card.id);
  dest.cards.push(card);
  touchCard(card);
  save();
  refreshAll();
}

function todayLabel() {
  const d = new Date();
  const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${dow})`;
}
