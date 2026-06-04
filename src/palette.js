// ⌘K command palette: fuzzy-jump to any card / project / view, run commands,
// or quick-add a card with the "> " prefix.

import {
  state, ALL_PROJECT_ID, VIEW_PREFIX, BUILTIN_VIEWS, activeProject,
  pushUndo, save, projectHue,
} from './state.js';
import { allCards } from './query.js';
import { uid, escHtml } from './utils.js';
import { switchProject, addProject } from './sidebar.js';
import { setView, refreshAll } from './refresh.js';
import { openModal, flashMsg } from './modal.js';

let pal = null; // { items, sel }

// ── Open / close ─────────────────────────────────────────────────────────────
export function openPalette() {
  const ov = document.getElementById('paletteOverlay');
  const input = document.getElementById('paletteInput');
  ov.classList.add('open');
  input.value = '';
  pal = { items: [], sel: 0 };
  rebuild('');
  input.focus();
}

export function closePalette() {
  document.getElementById('paletteOverlay').classList.remove('open');
  pal = null;
}

function isOpen() { return !!pal; }

// ── Wiring (called once from main.js) ────────────────────────────────────────
export function initPalette() {
  const ov = document.getElementById('paletteOverlay');
  const input = document.getElementById('paletteInput');

  input.addEventListener('input', () => rebuild(input.value));
  input.addEventListener('keydown', onKey);
  ov.addEventListener('click', (e) => { if (e.target === ov) closePalette(); });
}

function onKey(e) {
  if (!isOpen()) return;
  if (e.key === 'Escape')      { e.preventDefault(); closePalette(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
  else if (e.key === 'ArrowUp')   { e.preventDefault(); move(-1); }
  else if (e.key === 'Enter')     { e.preventDefault(); exec(pal.items[pal.sel]); }
}

function move(d) {
  if (!pal.items.length) return;
  pal.sel = (pal.sel + d + pal.items.length) % pal.items.length;
  render();
}

// ── Build candidate list ─────────────────────────────────────────────────────
function rebuild(raw) {
  const q = raw.trim();
  pal.sel = 0;

  if (q.startsWith('>')) {
    pal.items = quickAddItems(q.slice(1).trim());
    render();
    return;
  }

  const items = [];
  // Commands
  commandDefs().forEach(c => {
    const sc = q ? fuzzy(q, c.label) : 0;
    if (sc >= 0) items.push({ ...c, kind: 'cmd', score: sc });
  });
  // Views (전체 + built-ins + saved)
  viewDefs().forEach(v => {
    const sc = q ? fuzzy(q, v.label) : 0;
    if (sc >= 0) items.push({ ...v, kind: 'view', score: sc + 2 });
  });
  // Projects
  state.projects.forEach(p => {
    const sc = q ? fuzzy(q, p.name) : 0;
    if (sc >= 0) items.push({
      kind: 'project', label: p.name, icon: '📁', score: sc,
      run: () => switchProject(p.id),
    });
  });
  // Cards
  if (q) {
    const hits = [];
    for (const e of allCards()) {
      const hay = e.card.title + ' ' + (e.card.tags || []).join(' ');
      const sc = fuzzy(q, hay);
      if (sc >= 0) hits.push({ e, sc });
    }
    hits.sort((a, b) => b.sc - a.sc);
    hits.slice(0, 8).forEach(({ e, sc }) => items.push({
      kind: 'card', label: e.card.title, sub: e.project.name,
      hue: projectHue(e.project.id), score: sc,
      run: () => openModal(e.card.id, { projectId: e.project.id, returnTo: state.activeProjectId }),
    }));
  }

  // Sort: when there's a query, by score; otherwise keep natural grouping.
  if (q) items.sort((a, b) => b.score - a.score);
  pal.items = items.slice(0, 24);
  render();
}

function quickAddItems(rest) {
  const { title, tags, projName } = parseQuickAdd(rest);
  const project = projName
    ? (state.projects.find(p => p.name.toLowerCase().includes(projName.toLowerCase())) || activeProject())
    : activeProject();
  const sub = `${project.name} · 할 일` + (tags.length ? `  #${tags.join(' #')}` : '');
  return [{
    kind: 'add',
    label: title ? `추가: ${title}` : '추가할 제목을 입력하세요…',
    sub,
    icon: '➕',
    disabled: !title,
    run: () => { if (title) createQuickCard(project, title, tags); },
  }];
}

function parseQuickAdd(s) {
  const tags = [];
  let projName = null;
  const title = s
    .replace(/#(\S+)/g, (_, t) => { tags.push(t); return ''; })
    .replace(/@(\S+)/g, (_, p) => { projName = p; return ''; })
    .replace(/\s+/g, ' ')
    .trim();
  return { title, tags, projName };
}

function createQuickCard(project, title, tags) {
  const col = project.columns.find(c => c.title === '할 일') || project.columns[0];
  pushUndo();
  col.cards.push({
    id: uid(), title, desc: '', priority: 'none', tags: [...tags],
    due: '', checklist: [], recurrence: 'none', updatedAt: Date.now(),
  });
  save();
  switchProject(project.id); // surface the new card's project
  closePalette();
  flashMsg('카드 추가됨 ✓');
}

// ── Static defs ──────────────────────────────────────────────────────────────
function viewDefs() {
  const out = [{ id: ALL_PROJECT_ID, label: '전체', icon: '📋', run: () => switchProject(ALL_PROJECT_ID) }];
  BUILTIN_VIEWS.forEach(v => out.push({
    label: v.name, icon: v.icon, run: () => switchProject(VIEW_PREFIX + v.id),
  }));
  (state.savedViews || []).forEach(v => out.push({
    label: v.name, icon: v.icon || '🔖', run: () => switchProject(VIEW_PREFIX + v.id),
  }));
  return out;
}

function commandDefs() {
  const toRealProject = () => {
    if (!state.projects.find(p => p.id === state.activeProjectId)) {
      switchProject(state.projects[0].id);
    }
  };
  return [
    { label: '보드 보기',    icon: '▦', run: () => { toRealProject(); setView('board'); } },
    { label: '캘린더 보기',  icon: '🗓', run: () => { toRealProject(); setView('calendar'); } },
    { label: '새 프로젝트',  icon: '＋', run: () => addProject() },
    { label: '아카이브 열기', icon: '📦', run: () => document.getElementById('archiveOpenBtn')?.click() },
    { label: '알림 설정',    icon: '🔔', run: () => document.getElementById('notifBtn')?.click() },
  ];
}

// ── Render ───────────────────────────────────────────────────────────────────
function render() {
  const box = document.getElementById('paletteResults');
  if (!pal.items.length) {
    box.innerHTML = '<div class="pal-empty">결과 없음</div>';
    return;
  }
  box.innerHTML = '';
  pal.items.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'pal-row' + (i === pal.sel ? ' sel' : '') + (it.disabled ? ' disabled' : '');
    if (it.hue != null) row.style.setProperty('--ph', it.hue);
    row.innerHTML = `
      <span class="pal-ico">${it.icon || (it.kind === 'card' ? '🗂' : '•')}</span>
      <span class="pal-label">${escHtml(it.label)}</span>
      ${it.sub ? `<span class="pal-sub">${escHtml(it.sub)}</span>` : ''}
      <span class="pal-kind">${kindLabel(it.kind)}</span>`;
    row.addEventListener('mousemove', () => { if (pal.sel !== i) { pal.sel = i; render(); } });
    row.addEventListener('click', () => exec(it));
    box.appendChild(row);
  });
  const sel = box.querySelector('.pal-row.sel');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

function kindLabel(kind) {
  return { card: '카드', project: '프로젝트', view: '뷰', cmd: '명령', add: '추가' }[kind] || '';
}

function exec(item) {
  if (!item || item.disabled) return;
  // openModal / switchProject handle their own refresh.
  const run = item.run;
  if (item.kind !== 'add') closePalette();
  if (run) run();
}

// ── Tiny fuzzy matcher (subsequence with contiguity/prefix bonuses) ──────────
function fuzzy(query, text) {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  let qi = 0, score = 0, streak = 0, prevIdx = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 1;
      if (prevIdx === ti - 1) { streak++; score += streak; } else streak = 0;
      if (ti === 0 || /\s/.test(t[ti - 1])) score += 3; // word-start bonus
      prevIdx = ti;
      qi++;
    }
  }
  if (qi < q.length) return -1;          // not all query chars matched
  score -= (t.length - q.length) * 0.05; // mild brevity preference
  return score;
}
