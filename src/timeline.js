// Timeline (Gantt) view — cards with due dates as horizontal bars on a time grid.

import { state, setActiveProject, projectHue } from './state.js';
import { escHtml, displayTitle, ymd } from './utils.js';
import { openModal } from './modal.js';
import { refreshAll } from './refresh.js';

// ── Persistent view state ────────────────────────────────────────────────────
const TL_SCOPE_KEY = 'kb_tl_scope';
const TL_ZOOM_KEY  = 'kb_tl_zoom';
let tlScope = localStorage.getItem(TL_SCOPE_KEY) || 'all';
let tlZoom  = parseInt(localStorage.getItem(TL_ZOOM_KEY) || '32', 10); // px per day

const LEFT_W  = 220;  // label column width  (px)
const ROW_H   = 34;   // card row height      (px)
const GROUP_H = 38;   // group header height  (px)
const HEAD_H  = 54;   // date ruler height    (px)

const MONTH_NAMES = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

// ── Main render ──────────────────────────────────────────────────────────────
export function renderTimeline() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  board.classList.remove('search-mode');

  const wrap = document.createElement('div');
  wrap.className = 'tl-wrap';
  wrap.appendChild(buildControls());

  // Collect card groups
  const groups = [];
  for (const project of state.projects) {
    if (tlScope !== 'all' && project.id !== tlScope) continue;
    const cards = [];
    for (const col of project.columns) {
      for (const card of col.cards) {
        if (card.archived || !card.due) continue;
        cards.push({ card, project, col });
      }
    }
    if (!cards.length) continue;
    cards.sort((a, b) => {
      const sa = (a.card.start && a.card.start <= a.card.due) ? a.card.start : a.card.due;
      const sb = (b.card.start && b.card.start <= b.card.due) ? b.card.start : b.card.due;
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });
    groups.push({ project, cards });
  }

  if (!groups.length) {
    const empty = document.createElement('div');
    empty.className = 'tl-empty';
    empty.innerHTML = '<div class="tl-empty-icon">📅</div><div>마감일이 있는 카드가 없어요.</div>';
    wrap.appendChild(empty);
    board.appendChild(wrap);
    return;
  }

  // Date range
  let minStr = '9999-12-31', maxStr = '0000-01-01';
  for (const { cards } of groups) {
    for (const { card } of cards) {
      const s = (card.start && card.start <= card.due) ? card.start : card.due;
      if (s < minStr) minStr = s;
      if (card.due > maxStr) maxStr = card.due;
    }
  }

  // Pad start to previous Sunday − 1 week, end to next Saturday + 2 weeks
  const startDate = new Date(minStr + 'T00:00:00');
  startDate.setDate(startDate.getDate() - startDate.getDay() - 7);
  const endDate = new Date(maxStr + 'T00:00:00');
  endDate.setDate(endDate.getDate() + (6 - endDate.getDay()) + 14);

  const totalDays  = Math.round((endDate - startDate) / 86400000) + 1;
  const gridW      = totalDays * tlZoom;
  const todayStr   = ymd(new Date());
  const todayIdx   = Math.round((new Date(todayStr + 'T00:00:00') - startDate) / 86400000);

  // ── Scroll container ────────────────────────────────────────────────────────
  const scroll = document.createElement('div');
  scroll.className = 'tl-scroll';

  // ── Grid ────────────────────────────────────────────────────────────────────
  const grid = document.createElement('div');
  grid.className = 'tl-grid';
  grid.style.gridTemplateColumns = `${LEFT_W}px ${gridW}px`;

  // Sticky corner + date ruler
  const corner = document.createElement('div');
  corner.className = 'tl-corner';
  grid.appendChild(corner);
  grid.appendChild(buildDateRuler(startDate, totalDays));

  // Rows
  let totalRowHeight = HEAD_H;
  for (const { project, cards } of groups) {
    const hue = projectHue(project.id);

    // Group header
    const ghLeft = document.createElement('div');
    ghLeft.className = 'tl-group-head';
    ghLeft.style.setProperty('--ph', hue);
    ghLeft.innerHTML = `<span>${escHtml(project.name)}</span>`;
    grid.appendChild(ghLeft);

    const ghRight = document.createElement('div');
    ghRight.className = 'tl-group-right';
    ghRight.style.setProperty('--ph', hue);
    grid.appendChild(ghRight);
    totalRowHeight += GROUP_H;

    // Card rows
    for (const { card, project: proj } of cards) {
      const ph = projectHue(proj.id);

      const label = document.createElement('div');
      label.className = 'tl-label';
      label.innerHTML = `<span class="tl-label-dot" style="background:hsl(${ph},60%,50%)"></span>
        <span class="tl-label-text" title="${escHtml(card.title)}">${escHtml(displayTitle(card.title))}</span>`;
      label.style.cursor = 'pointer';
      label.addEventListener('click', () => {
        setActiveProject(proj.id);
        openModal(card.id);
      });
      grid.appendChild(label);

      const track = document.createElement('div');
      track.className = 'tl-track';

      const startStr = (card.start && card.start <= card.due) ? card.start : card.due;
      const startIdx = Math.round((new Date(startStr + 'T00:00:00') - startDate) / 86400000);
      const endIdx   = Math.round((new Date(card.due  + 'T00:00:00') - startDate) / 86400000);
      const barLeft  = startIdx * tlZoom;
      const barWidth = Math.max(tlZoom, (endIdx - startIdx + 1) * tlZoom);

      const bar = document.createElement('div');
      bar.className = 'tl-bar';
      bar.style.left  = barLeft + 'px';
      bar.style.width = barWidth + 'px';
      bar.style.setProperty('--ph', ph);
      // Priority overrides left-border colour
      const priColor = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' }[card.priority];
      if (priColor) bar.style.borderLeftColor = priColor;

      bar.innerHTML = `<span class="tl-bar-label">${escHtml(displayTitle(card.title))}</span>`;
      bar.title = `${card.title}\n${startStr === card.due ? card.due : startStr + ' → ' + card.due}`;
      bar.addEventListener('click', (e) => {
        e.stopPropagation();
        setActiveProject(proj.id);
        openModal(card.id);
      });
      track.appendChild(bar);
      grid.appendChild(track);
      totalRowHeight += ROW_H;
    }
  }

  // Today line (absolute, inside grid)
  if (todayIdx >= 0 && todayIdx < totalDays) {
    const tl = document.createElement('div');
    tl.className = 'tl-today-line';
    // left = LEFT_W col + offset within right col: subtract LEFT_W because grid-column:2 starts at LEFT_W
    tl.style.cssText = `left:${LEFT_W + todayIdx * tlZoom + Math.round(tlZoom / 2)}px; height:${totalRowHeight}px;`;
    grid.appendChild(tl);
  }

  scroll.appendChild(grid);
  wrap.appendChild(scroll);
  board.appendChild(wrap);

  // Scroll to centre today
  requestAnimationFrame(() => {
    const visW = scroll.clientWidth - LEFT_W;
    scroll.scrollLeft = Math.max(0, todayIdx * tlZoom - visW / 2 + tlZoom / 2);
  });
}

// ── Controls bar ─────────────────────────────────────────────────────────────
function buildControls() {
  const ctrl = document.createElement('div');
  ctrl.className = 'tl-controls';
  ctrl.innerHTML = `
    <div class="cal-scope">
      <select id="tlScopeSelect">
        <option value="all" ${tlScope === 'all' ? 'selected' : ''}>모든 프로젝트</option>
        ${state.projects.map(p =>
          `<option value="${p.id}" ${tlScope === p.id ? 'selected' : ''}>${escHtml(p.name)}</option>`
        ).join('')}
      </select>
    </div>
    <div class="tl-zoom-ctrl">
      <button class="cal-btn" id="tlZoomOut" title="축소">−</button>
      <span class="tl-zoom-label">${tlZoom < 24 ? '좁게' : tlZoom < 42 ? '보통' : '넓게'}</span>
      <button class="cal-btn" id="tlZoomIn" title="확대">+</button>
    </div>
    <button class="cal-btn cal-today-btn" id="tlToday">오늘</button>
  `;

  ctrl.querySelector('#tlScopeSelect').onchange = (e) => {
    tlScope = e.target.value;
    localStorage.setItem(TL_SCOPE_KEY, tlScope);
    renderTimeline();
  };
  ctrl.querySelector('#tlZoomOut').onclick = () => {
    tlZoom = Math.max(16, tlZoom - 8);
    localStorage.setItem(TL_ZOOM_KEY, tlZoom);
    renderTimeline();
  };
  ctrl.querySelector('#tlZoomIn').onclick = () => {
    tlZoom = Math.min(64, tlZoom + 8);
    localStorage.setItem(TL_ZOOM_KEY, tlZoom);
    renderTimeline();
  };
  ctrl.querySelector('#tlToday').onclick = () => renderTimeline();
  return ctrl;
}

// ── Date ruler (sticky top row) ───────────────────────────────────────────────
function buildDateRuler(startDate, totalDays) {
  const ruler = document.createElement('div');
  ruler.className = 'tl-date-ruler';

  // Month strip
  const months = document.createElement('div');
  months.className = 'tl-months';

  // Day strip
  const days = document.createElement('div');
  days.className = 'tl-days';

  const todayStr = ymd(new Date());
  let curMonth = -1, curYear = -1, monthEl = null;

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const dow = d.getDay();

    // Month label
    if (d.getMonth() !== curMonth || d.getFullYear() !== curYear) {
      if (monthEl) monthEl.style.width = ((i - parseInt(monthEl.dataset.start, 10)) * tlZoom) + 'px';
      curMonth = d.getMonth();
      curYear  = d.getFullYear();
      monthEl  = document.createElement('div');
      monthEl.className = 'tl-month-label';
      monthEl.dataset.start = i;
      monthEl.textContent = `${curYear}년 ${MONTH_NAMES[curMonth]}`;
      months.appendChild(monthEl);
    }

    // Day cell
    const dc = document.createElement('div');
    dc.className = 'tl-day-cell'
      + (dow === 0 || dow === 6 ? ' weekend' : '')
      + (ymd(d) === todayStr    ? ' today'   : '');
    dc.style.width = tlZoom + 'px';
    if (tlZoom >= 22) dc.textContent = d.getDate();
    days.appendChild(dc);
  }
  if (monthEl) monthEl.style.width = ((totalDays - parseInt(monthEl.dataset.start, 10)) * tlZoom) + 'px';

  ruler.appendChild(months);
  ruler.appendChild(days);
  return ruler;
}

export function initTimeline() { /* placeholder for future keyboard nav */ }
