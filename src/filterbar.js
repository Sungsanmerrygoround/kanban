// Filter bar: ad-hoc priority/tag/due filtering that renders a transient
// "필터 결과" dashboard, plus saving the current filter as a named smart view.

import { state, save, filter, hasAdHocFilter, VIEW_PREFIX } from './state.js';
import { allCards } from './query.js';
import { uid, escHtml } from './utils.js';
import { refreshAll } from './refresh.js';
import { switchProject } from './sidebar.js';

const DUE_OPTS  = [['today', '오늘'], ['week', '이번 주'], ['overdue', '지남'], ['none', '기한 없음']];
const PRIO_OPTS = [['high', '높음'], ['medium', '중간'], ['low', '낮음']];
const DUE_LABEL  = { today: '오늘', week: '이번 주', overdue: '지남', none: '기한없음' };
const PRIO_LABEL = { high: '높음', medium: '중간', low: '낮음' };

export function initFilterBar() {
  document.getElementById('filterBtn').addEventListener('click', toggleFilterBar);
  updateBadge();
}

function toggleFilterBar() {
  const bar = document.getElementById('filterBar');
  bar.hidden = !bar.hidden;
  document.body.classList.toggle('filters-open', !bar.hidden);
  if (!bar.hidden) renderFilterBar();
}

// Called by refreshAll — keeps the badge fresh and rebuilds the bar if open.
export function renderFilterBar() {
  updateBadge();
  const bar = document.getElementById('filterBar');
  if (!bar || bar.hidden) return;

  // Preserve the tag row's horizontal scroll across rebuilds (toggling a chip
  // re-renders the whole bar via refreshAll).
  const prevTagScroll = bar.querySelector('.fb-tags')?.scrollLeft || 0;

  const tags = [...new Set(allCards().flatMap(e => e.card.tags || []))]
    .sort((a, b) => a.localeCompare(b, 'ko'));

  bar.innerHTML = `
    <div class="fb-group"><span class="fb-label">기한</span>
      ${DUE_OPTS.map(([v, l]) => chip('due', v, l, filter.due === v)).join('')}</div>
    <div class="fb-group"><span class="fb-label">우선순위</span>
      ${PRIO_OPTS.map(([v, l]) => chip('prio', v, l, filter.priorities.includes(v))).join('')}</div>
    ${tags.length ? `<div class="fb-group fb-tags"><span class="fb-label">태그</span>
      ${tags.map(t => chip('tag', t, t, filter.tags.includes(t))).join('')}</div>` : ''}
    <div class="fb-actions">
      <button class="fb-btn fb-save" id="fbSave">필터 저장</button>
      <button class="fb-btn fb-clear" id="fbClear">초기화</button>
    </div>
  `;
  bar.querySelectorAll('.fb-chip').forEach(c =>
    c.addEventListener('click', () => onChip(c.dataset.type, c.dataset.val)));
  bar.querySelector('#fbSave').addEventListener('click', saveCurrentView);
  bar.querySelector('#fbClear').addEventListener('click', clearFilters);

  const tagsEl = bar.querySelector('.fb-tags');
  if (tagsEl) tagsEl.scrollLeft = prevTagScroll;
}

function chip(type, val, label, active) {
  return `<button class="fb-chip${active ? ' active' : ''}" data-type="${type}" data-val="${escHtml(val)}">${escHtml(label)}</button>`;
}

function onChip(type, val) {
  if (type === 'due') {
    filter.due = filter.due === val ? null : val;
  } else if (type === 'prio') {
    const i = filter.priorities.indexOf(val);
    if (i >= 0) filter.priorities.splice(i, 1); else filter.priorities.push(val);
  } else if (type === 'tag') {
    const i = filter.tags.indexOf(val);
    if (i >= 0) filter.tags.splice(i, 1); else filter.tags.push(val);
  }
  refreshAll();
}

function clearFilters() {
  filter.due = null;
  filter.priorities = [];
  filter.tags = [];
  filter.projectId = null;
  refreshAll();
}

function saveCurrentView() {
  if (!hasAdHocFilter()) { alert('저장할 필터를 먼저 선택하세요.'); return; }
  const name = prompt('뷰 이름:', defaultName());
  if (!name) return;
  const id = uid();
  if (!Array.isArray(state.savedViews)) state.savedViews = [];
  state.savedViews.push({
    id, name: name.trim(), icon: '🔖',
    filter: { priorities: [...filter.priorities], tags: [...filter.tags], due: filter.due },
  });
  // Clear the ad-hoc filter and jump to the freshly saved view.
  filter.due = null; filter.priorities = []; filter.tags = [];
  save();
  switchProject(VIEW_PREFIX + id);
}

function defaultName() {
  const parts = [];
  if (filter.due) parts.push(DUE_LABEL[filter.due]);
  if (filter.priorities.length) parts.push(filter.priorities.map(p => PRIO_LABEL[p]).join('/'));
  if (filter.tags.length) parts.push('#' + filter.tags.join(' #'));
  return parts.join(' · ') || '내 뷰';
}

function updateBadge() {
  const badge = document.getElementById('filterBadge');
  if (!badge) return;
  const n = (filter.due ? 1 : 0) + filter.priorities.length + filter.tags.length;
  if (n > 0) { badge.textContent = n; badge.hidden = false; }
  else badge.hidden = true;
}
