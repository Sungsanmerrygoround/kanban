// Cross-project card query engine — shared by smart views, the today
// dashboard, and the command palette. Pure-ish: reads state, returns plain
// arrays of { card, col, project } entries.

import { state, STD_COLUMNS } from './state.js';
import { daysUntil } from './utils.js';

// Iterate every card across all projects as { card, col, project } entries.
export function allCards({ includeArchived = false } = {}) {
  const out = [];
  for (const project of state.projects) {
    for (const col of project.columns) {
      for (const card of col.cards) {
        if (!includeArchived && card.archived) continue;
        out.push({ card, col, project });
      }
    }
  }
  return out;
}

// Find the first card whose title matches (case-insensitive) — wiki links.
export function findCardByTitle(title) {
  const t = (title || '').trim().toLowerCase();
  if (!t) return null;
  for (const e of allCards()) {
    if (e.card.title.trim().toLowerCase() === t) return e;
  }
  return null;
}

// Cards whose notes reference the given title via [[title]].
export function backlinksTo(title, selfId) {
  const needle = `[[${title}]]`.toLowerCase();
  return allCards().filter(e =>
    e.card.id !== selfId && (e.card.desc || '').toLowerCase().includes(needle));
}

// ── Date predicates ──────────────────────────────────────────────────────────
export function isOverdue(card) {
  const d = daysUntil(card.due);
  return d !== null && d < 0;
}
export function isToday(card) {
  return !!card.due && daysUntil(card.due) === 0;
}
export function isWithinDays(card, n) {
  const d = daysUntil(card.due);
  return d !== null && d >= 0 && d <= n;
}

// A card is "done" when it sits in the standard 완료 column.
export function isDone(entry) {
  return entry.col.title === STD_COLUMNS[2]; // '완료'
}

// ── Filtering ────────────────────────────────────────────────────────────────
// filter = { query, tags[], priorities[], due:'today'|'overdue'|'week'|'none', projectId }
export function matchesFilter(entry, filter) {
  if (!filter) return true;
  const { card, project } = entry;

  if (filter.projectId && project.id !== filter.projectId) return false;

  if (filter.query) {
    const q = filter.query.toLowerCase();
    const hit = card.title.toLowerCase().includes(q)
      || (card.desc || '').toLowerCase().includes(q)
      || (card.tags || []).some(t => t.toLowerCase().includes(q));
    if (!hit) return false;
  }

  if (filter.priorities && filter.priorities.length) {
    if (!filter.priorities.includes(card.priority)) return false;
  }

  if (filter.tags && filter.tags.length) {
    const ct = (card.tags || []).map(t => t.toLowerCase());
    if (!filter.tags.every(t => ct.includes(t.toLowerCase()))) return false; // AND
  }

  if (filter.due) {
    if (filter.due === 'today'   && !isToday(card))          return false;
    if (filter.due === 'overdue' && !isOverdue(card))        return false;
    if (filter.due === 'week'    && !isWithinDays(card, 7))  return false;
    if (filter.due === 'none'    && card.due)                return false;
  }

  return true;
}

// ── Sorting ──────────────────────────────────────────────────────────────────
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2, none: 3 };

function dueKey(card) {
  const d = daysUntil(card.due);
  return d === null ? Infinity : d; // undated cards sink to the bottom
}

export function sortCards(entries, by = 'smart') {
  const arr = [...entries];
  if (by === 'updated') {
    arr.sort((a, b) => (b.card.updatedAt || 0) - (a.card.updatedAt || 0));
  } else if (by === 'due') {
    arr.sort((a, b) =>
      dueKey(a.card) - dueKey(b.card) ||
      a.card.title.localeCompare(b.card.title, 'ko'));
  } else { // 'smart': nearest due first, then priority, then title
    arr.sort((a, b) => {
      const da = dueKey(a.card), db = dueKey(b.card);
      if (da !== db) return da - db;
      const pa = PRIORITY_ORDER[a.card.priority] ?? 3;
      const pb = PRIORITY_ORDER[b.card.priority] ?? 3;
      if (pa !== pb) return pa - pb;
      return a.card.title.localeCompare(b.card.title, 'ko');
    });
  }
  return arr;
}
