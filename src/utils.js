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

// ── Recurrence ──────────────────────────────────────────────────────────────
export function nextDueDate(dueStr, freq) {
  if (!dueStr || freq === 'none' || !freq) return '';
  const d = new Date(dueStr + 'T00:00:00');
  if (isNaN(d)) return '';
  if (freq === 'daily')   d.setDate(d.getDate() + 1);
  if (freq === 'weekly')  d.setDate(d.getDate() + 7);
  if (freq === 'monthly') d.setMonth(d.getMonth() + 1);
  // Format as local YYYY-MM-DD (avoid timezone shift from toISOString).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const RECURRENCE_LABELS = {
  none:    '반복 없음',
  daily:   '매일',
  weekly:  '매주',
  monthly: '매월',
};

// ── Tiny Markdown renderer (safe: input is escaped first) ───────────────────
// Supports: # ## ###, **bold**, *italic*, `code`, [text](url),
// ![alt](url), - lists, autolink, paragraphs.
export function renderMarkdown(src) {
  if (!src) return '';
  let s = escHtml(src);

  // images: ![alt](url) — only data:, http(s)
  s = s.replace(/!\[([^\]]*)\]\(((?:data:image|https?:)[^)]+)\)/g,
    (_, alt, url) => `<img alt="${alt}" src="${url}" class="md-img" />`);

  // links: [text](url)
  s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // autolink bare URLs (avoid ones already inside href="")
  s = s.replace(/(^|[^"=>])(https?:\/\/[^\s<)]+)/g,
    '$1<a href="$2" target="_blank" rel="noopener">$2</a>');

  // headings (line-start)
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  s = s.replace(/^# (.+)$/gm,   '<h1>$1</h1>');

  // bold/italic/code
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // unordered lists — group consecutive "- " lines
  s = s.replace(/(?:^|\n)((?:- [^\n]+(?:\n|$))+)/g, (m, items) => {
    const lis = items.trim().split(/\n/).map(line =>
      `<li>${line.replace(/^- /, '')}</li>`).join('');
    return `\n<ul>${lis}</ul>`;
  });

  // paragraphs: split on blank lines; leave block elements alone
  s = s.split(/\n{2,}/).map(block => {
    const t = block.trim();
    if (!t) return '';
    if (/^<(h[1-3]|ul|img|p)/.test(t)) return t;
    return `<p>${t.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');

  return s;
}

// ── Image compression for paste ─────────────────────────────────────────────
export async function compressImageBlob(blob, maxDim = 1400, quality = 0.82) {
  const img = await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const i = new Image();
    i.onload  = () => { URL.revokeObjectURL(url); resolve(i); };
    i.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    i.src = url;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}
