// Left sidebar: project tree rendering + project CRUD (add / switch / delete / rename).

import { state, save, activeProject, filter, PROJECT_ICONS } from './state.js';
import { uid, escHtml } from './utils.js';
import { refreshAll } from './refresh.js';

// ── Render ──────────────────────────────────────────────────────────────────
export function renderSidebar() {
  const list = document.getElementById('projectList');
  list.innerHTML = '';

  state.projects.forEach(proj => {
    const total = proj.columns.reduce((sum, c) => sum + c.cards.length, 0);
    const item = document.createElement('div');
    item.className = 'project-item' + (proj.id === state.activeProjectId ? ' active' : '');
    item.innerHTML = `
      <span class="project-icon">${proj.icon || '📁'}</span>
      <span class="project-name" data-pid="${proj.id}">${escHtml(proj.name)}</span>
      <span class="project-count">${total}</span>
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
}

export function renderNavbarTitle() {
  const proj = activeProject();
  document.getElementById('projectTitleIcon').textContent = proj.icon || '📁';
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
  const icon = PROJECT_ICONS[state.projects.length % PROJECT_ICONS.length];
  const newProj = {
    id: uid(),
    name: '새 프로젝트',
    icon,
    columns: [
      { id: uid(), title: '📋 할 일',   color: '#10a37f', cards: [] },
      { id: uid(), title: '🔄 진행 중', color: '#84cc16', cards: [] },
      { id: uid(), title: '✅ 완료',   color: '#0d9488', cards: [] },
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
