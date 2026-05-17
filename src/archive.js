// Archive overlay: list archived cards for the active project + restore.

import { save, activeProject, activeColumns } from './state.js';
import { escHtml } from './utils.js';
import { refreshAll } from './refresh.js';

export function openArchive() {
  renderArchive();
  document.getElementById('archiveOverlay').classList.add('open');
}

export function closeArchive() {
  document.getElementById('archiveOverlay').classList.remove('open');
}

function renderArchive() {
  const list = document.getElementById('archiveList');
  list.innerHTML = '';

  const items = [];
  for (const col of activeColumns()) {
    for (const card of col.cards) {
      if (card.archived) items.push({ card, col });
    }
  }
  // Newest archives first
  items.sort((a, b) => (b.card.archivedAt || '').localeCompare(a.card.archivedAt || ''));

  if (items.length === 0) {
    list.innerHTML = `<div class="archive-empty">아카이브된 카드가 없습니다.</div>`;
    return;
  }

  items.forEach(({ card, col }) => {
    const row = document.createElement('div');
    row.className = 'archive-item';
    const dateStr = card.archivedAt
      ? new Date(card.archivedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
      : '';
    row.innerHTML = `
      <div class="archive-item-main">
        <div class="archive-item-title">${escHtml(card.title)}</div>
        <div class="archive-item-meta">${escHtml(col.title)}${dateStr ? ' · ' + dateStr : ''}</div>
      </div>
      <button class="archive-restore" data-card-id="${card.id}">복원</button>
      <button class="archive-delete" data-card-id="${card.id}" title="완전 삭제">×</button>
    `;
    row.querySelector('.archive-restore').addEventListener('click', () => {
      card.archived = false;
      delete card.archivedAt;
      save();
      refreshAll();
      renderArchive();
    });
    row.querySelector('.archive-delete').addEventListener('click', () => {
      if (!confirm(`"${card.title}" 를 완전히 삭제할까요?`)) return;
      col.cards = col.cards.filter(c => c.id !== card.id);
      save();
      refreshAll();
      renderArchive();
    });
    list.appendChild(row);
  });
}

export function initArchive() {
  document.getElementById('archiveOpenBtn').addEventListener('click', openArchive);
  document.getElementById('archiveClose').addEventListener('click', closeArchive);
  document.getElementById('archiveOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('archiveOverlay')) closeArchive();
  });
}
