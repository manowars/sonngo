// Rendering: filter chips, grouped list, cards.

import { KIND_META, dayKey, monthKey } from './classify.js';

const DAY = 86400000;

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function relativeDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Không rõ ngày';
  const today = startOfDay();
  const diff = Math.round((today - startOfDay(d)) / DAY);
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Hôm qua';
  if (diff < 7) return `${diff} ngày trước`;
  return d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function shortTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export function matchesFilter(note, filter) {
  if (!filter || filter === 'all') return true;
  if (filter === 'star') return Boolean(note.fav);
  if (filter === 'today') return dayKey(note.createdAt) === dayKey(new Date().toISOString());
  if (filter === 'week') return (Date.now() - (Date.parse(note.createdAt) || 0)) < 7 * DAY;
  if (filter === 'untagged') return !(note.topics || []).length;
  if (filter.startsWith('topic:')) return (note.topics || []).includes(filter.slice(6));
  if (filter.startsWith('kind:')) return note.kind === filter.slice(5);
  if (filter.startsWith('tag:')) return (note.tags || []).includes(filter.slice(4));
  return true;
}

export function matchesQuery(note, q) {
  if (!q) return true;
  const needle = q.toLowerCase().trim();
  if (!needle) return true;
  return [note.title, note.url, note.note, note.domain, (note.tags || []).join(' '), (note.topics || []).join(' ')]
    .filter(Boolean).join(' ').toLowerCase().includes(needle);
}

export function groupNotes(notes, mode, topics) {
  const topicLabel = new Map(topics.map((t) => [t.id, t.label]));
  const buckets = new Map();
  const push = (key, label, order, note) => {
    if (!buckets.has(key)) buckets.set(key, { key, label, order, items: [] });
    buckets.get(key).items.push(note);
  };
  for (const n of notes) {
    if (mode === 'date') {
      push(dayKey(n.createdAt), relativeDay(n.createdAt), -(Date.parse(n.createdAt) || 0), n);
    } else if (mode === 'topic') {
      const list = (n.topics || []).length ? n.topics : ['__none'];
      for (const t of list) push(t, t === '__none' ? 'Chưa phân loại' : (topicLabel.get(t) || t), 0, n);
    } else if (mode === 'kind') {
      const meta = KIND_META[n.kind] || KIND_META.link;
      push(n.kind, `${meta.icon} ${meta.label}`, 0, n);
    } else {
      push(n.domain || '(khác)', n.domain || '(khác)', 0, n);
    }
  }
  const groups = [...buckets.values()];
  if (mode === 'date') groups.sort((a, b) => a.order - b.order);
  else groups.sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label));
  return groups;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function faviconUrl(domain) {
  if (!domain || !showFavicons) return '';
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function topicBadges(note, topics) {
  const byId = new Map(topics.map((t) => [t.id, t]));
  return (note.topics || []).map((id) => {
    const t = byId.get(id);
    if (!t) return '';
    const pinned = (note.manualTopics || []).includes(id) ? '📌' : '';
    return `<span class="badge topic" style="background:${esc(t.color || '#64748b')}">${pinned}${esc(t.label)}</span>`;
  }).join('');
}

export function renderChips(el, notes, topics, active) {
  const count = (fn) => notes.filter(fn).length;
  const items = [
    { id: 'all', label: 'Tất cả', n: notes.length },
    { id: 'today', label: 'Hôm nay', n: count((n) => matchesFilter(n, 'today')) },
    { id: 'week', label: '7 ngày', n: count((n) => matchesFilter(n, 'week')) },
    { id: 'star', label: '★ Ghim', n: count((n) => n.fav) },
    { id: 'untagged', label: 'Chưa phân loại', n: count((n) => !(n.topics || []).length) },
  ];
  for (const t of topics) {
    const n = count((x) => (x.topics || []).includes(t.id));
    if (n) items.push({ id: `topic:${t.id}`, label: t.label, n, color: t.color });
  }
  const kinds = new Map();
  for (const n of notes) kinds.set(n.kind, (kinds.get(n.kind) || 0) + 1);
  for (const [kind, n] of [...kinds.entries()].sort((a, b) => b[1] - a[1])) {
    const meta = KIND_META[kind] || KIND_META.link;
    items.push({ id: `kind:${kind}`, label: `${meta.icon} ${meta.label}`, n });
  }
  el.innerHTML = items.map((i) => `
    <button class="chip" data-filter="${esc(i.id)}" aria-pressed="${i.id === active}">
      ${i.color ? `<span class="swatch" style="background:${esc(i.color)}"></span>` : ''}
      ${esc(i.label)} <span class="n">${i.n}</span>
    </button>`).join('');
}

let showFavicons = true;
export function setFaviconMode(on) { showFavicons = on; }

export function renderList(el, groups, topics, totalAll) {
  if (!groups.length) {
    el.innerHTML = totalAll
      ? `<div class="empty"><div class="big">🔍</div>Không có link nào khớp bộ lọc.</div>`
      : `<div class="empty"><div class="big">🔗</div>
           <b>Chưa có link nào</b>
           <p>Dán một link vào ô trên, hoặc chia sẻ link từ Chrome / YouTube / Facebook vào app này.</p>
         </div>`;
    return;
  }
  el.innerHTML = groups.map((g) => `
    <section>
      <h2 class="group-title">${esc(g.label)} <span class="count">${g.items.length}</span></h2>
      ${g.items.map((n) => card(n, topics)).join('')}
    </section>`).join('');
}

function card(n, topics) {
  const meta = KIND_META[n.kind] || KIND_META.link;
  const fav = faviconUrl(n.domain);
  return `
  <article class="card${n.fav ? ' starred' : ''}" data-id="${esc(n.id)}">
    <div class="fav-ico"><span class="glyph">${meta.icon}</span>${fav ? `<img src="${esc(fav)}" alt="" loading="lazy" style="display:none"
      onload="this.style.display='';this.previousElementSibling.style.display='none'"
      onerror="this.remove()">` : ''}</div>
    <div class="body">
      <div class="title"><a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title || n.url)}</a></div>
      <div class="meta">
        <span>${esc(n.domain || 'ghi chú')}</span>
        <span>·</span>
        <span>${esc(relativeDay(n.createdAt))} ${esc(shortTime(n.createdAt))}</span>
        ${topicBadges(n, topics)}
        ${(n.tags || []).map((t) => `<span class="badge tag">#${esc(t)}</span>`).join('')}
      </div>
      ${n.note ? `<div class="note">${esc(n.note)}</div>` : ''}
    </div>
    <div class="actions">
      <button data-act="star" title="Ghim" aria-label="Ghim">${n.fav ? '★' : '☆'}</button>
      <button data-act="edit" title="Sửa" aria-label="Sửa">✏️</button>
      <button data-act="copy" title="Chép link" aria-label="Chép link">📋</button>
      <button data-act="del" title="Xoá" aria-label="Xoá">🗑️</button>
    </div>
  </article>`;
}

export function renderStats(el, notes, topics, lastSync) {
  const today = notes.filter((n) => matchesFilter(n, 'today')).length;
  const week = notes.filter((n) => matchesFilter(n, 'week')).length;
  const months = new Set(notes.map((n) => monthKey(n.createdAt))).size;
  const dirty = notes.filter((n) => n.dirty).length;
  el.innerHTML = [
    { v: notes.length, k: 'tổng link' },
    { v: today, k: 'hôm nay' },
    { v: week, k: '7 ngày' },
    { v: months, k: 'file tháng' },
    { v: dirty, k: 'chờ đẩy lên' },
  ].map((s) => `<div class="stat"><div class="v">${s.v}</div><div class="k">${s.k}</div></div>`).join('')
    + (lastSync ? `<div class="stat"><div class="v" style="font-size:13px">${new Date(lastSync).toLocaleString('vi-VN')}</div><div class="k">đồng bộ lần cuối</div></div>` : '');
}
