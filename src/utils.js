// Pure utility functions — no module dependencies.

export const uid = () => '_' + Math.random().toString(36).slice(2, 9);

export function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Due-date helpers ────────────────────────────────────────────────────────
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return null;
  return Math.round((d - today) / 86400000);
}

export function dueStatus(card) {
  const days = daysUntil(card.due);
  if (days === null) return 'none';
  if (days < 0) return 'overdue';
  if (days <= 1) return 'urgent';
  if (days <= 3) return 'soon';
  if (days <= 7) return 'upcoming';
  return 'normal';
}

export function formatDue(card) {
  const days = daysUntil(card.due);
  if (days === null) return '';
  if (days === 0) return '오늘';
  if (days === 1) return '내일';
  if (days < 0) return `${-days}일 지남`;
  if (days <= 7) return `D-${days}`;
  const d = new Date(card.due + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
