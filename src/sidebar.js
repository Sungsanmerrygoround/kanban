// Left sidebar: project tree rendering + project CRUD (add / switch / delete / rename).

import { state, save, activeProject, filter, projectHue } from './state.js';
import { uid, escHtml } from './utils.js';
import { refreshAll } from './refresh.js';

// ── Render ──────────────────────────────────────────────────────────────────
export function renderSidebar() {
  const list = document.getElementById('projectList');
  list.innerHTML = '';
  const statsEl = document.getElementById('sidebarStats');

  state.projects.forEach(proj => {
    const liveCards = proj.columns.reduce((sum, c) => sum + c.cards.filter(cd => !cd.archived).length, 0);
    const hue = projectHue(proj.id);
    const isActive = proj.id === state.activeProjectId;
    const item = document.createElement('div');
    item.className = 'project-item' + (isActive ? ' active' : '');
    item.style.setProperty('--ph', hue);
    item.innerHTML = `
      <span class="project-dot"></span>
      <span class="project-name" data-pid="${proj.id}">${escHtml(proj.name)}</span>
      <span class="project-count">${liveCards}</span>
      <button class="project-delete" title="프로젝트 삭제">×</button>
    `;
    const nameEl = item.querySelector('.project-name');

    item.addEventListener('click', e => {
      if (e.target.closest('.project-delete')) return;
      if (nameEl.isContentEditable) return;
      switchProject(proj.id);
    });
    item.querySelector('.project-delete').addEventListener('click', e => {
      e.stopPropagation();
      deleteProject(proj.id);
    });
    nameEl.addEventListener('dblclick', e => {
      e.stopPropagation();
      startProjectRename(nameEl);
    });

    list.appendChild(item);
  });

  // 하단 통계 영역 갱신
  if (statsEl) {
    const totalCards = state.projects.reduce((s, p) =>
      s + p.columns.reduce((s2, c) => s2 + c.cards.filter(cd => !cd.archived).length, 0), 0);
    const totalArchived = state.projects.reduce((s, p) =>
      s + p.columns.reduce((s2, c) => s2 + c.cards.filter(cd => cd.archived).length, 0), 0);
    const totalProjects = state.projects.length;
    statsEl.innerHTML = `
      <div class="stats-row">
        <span class="stats-item">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="6" height="16" rx="1"/><rect x="11" y="4" width="6" height="10" rx="1"/></svg>
          프로젝트 ${totalProjects}
        </span>
        <span class="stats-dot-sep"></span>
        <span class="stats-item">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          카드 ${totalCards}
        </span>
        ${totalArchived > 0 ? `<span class="stats-dot-sep"></span><span class="stats-item stats-archived">${totalArchived} 보관</span>` : ''}
      </div>
    `;
  }
}

export function renderNavbarTitle() {
  const proj = activeProject();
  document.getElementById('projectTitleName').textContent = proj.name;
}

// ── Actions ─────────────────────────────────────────────────────────────────
export function switchProject(id) {
  if (state.activeProjectId === id) return;
  state.activeProjectId = id;
  filter.query = '';
  const si = document.getElementById('searchInput');
  if (si) si.value = '';
  save();
  refreshAll();
}

export function addProject() {
  const newProj = {
    id: uid(),
    name: '새 프로젝트',
    columns: [
      { id: uid(), title: '할 일',   color: '#10a37f', cards: [] },
      { id: uid(), title: '진행 중', color: '#84cc16', cards: [] },
      { id: uid(), title: '완료',   color: '#0d9488', cards: [] },
    ],
  };
  state.projects.push(newProj);
  state.activeProjectId = newProj.id;
  save();
  refreshAll();

  // Focus new project name for immediate renaming.
  setTimeout(() => {
    const active = document.querySelector('.project-item.active .project-name');
    if (active) startProjectRename(active);
  }, 50);
}

export function deleteProject(id) {
  if (state.projects.length <= 1) {
    alert('마지막 프로젝트는 삭제할 수 없어요.');
    return;
  }
  const proj = state.projects.find(p => p.id === id);
  if (!proj) return;
  const total = proj.columns.reduce((s, c) => s + c.cards.length, 0);
  const msg = total > 0
    ? `"${proj.name}" 프로젝트와 카드 ${total}개를 모두 삭제할까요?`
    : `"${proj.name}" 프로젝트를 삭제할까요?`;
  if (!confirm(msg)) return;

  state.projects = state.projects.filter(p => p.id !== id);
  if (state.activeProjectId === id) state.activeProjectId = state.projects[0].id;
  save();
  refreshAll();
}

export function startProjectRename(el) {
  el.contentEditable = 'true';
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const pid = el.dataset.pid;
  const original = state.projects.find(p => p.id === pid)?.name || '';

  const finish = () => {
    el.contentEditable = 'false';
    el.removeEventListener('blur', finish);
    el.removeEventListener('keydown', onKey);
    const proj = state.projects.find(p => p.id === pid);
    if (!proj) return;
    proj.name = el.textContent.trim() || original;
    save();
    renderNavbarTitle();
  };
  const onKey = e => {
    if (e.key === 'Enter')  { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { el.textContent = original; el.blur(); }
  };
  el.addEventListener('blur', finish);
  el.addEventListener('keydown', onKey);
}
