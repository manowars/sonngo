// Builds the "tổng hợp" text: a Markdown roll-up of the current slice that can
// be pasted straight into Claude Code, a note, or an email.

import { KIND_META, monthKey } from '../classify.js';
import { countBy, rank } from './data.js';

const d10 = (iso) => String(iso || '').slice(0, 10);

export function buildDigest(items, topics, { rangeLabel = 'tất cả', filterNote = '' } = {}) {
  const label = new Map(topics.map((t) => [t.id, t.label]));
  const lines = [];
  const L = (s = '') => lines.push(s);

  L('# Tổng hợp LinkNotes');
  L();
  L(`_Phạm vi: ${rangeLabel}${filterNote ? ` · ${filterNote}` : ''} · ${items.length} link · tạo lúc ${new Date().toLocaleString('vi-VN')}_`);
  L();

  if (!items.length) {
    L('Không có link nào trong phạm vi này.');
    return lines.join('\n');
  }

  // ---- overview ----
  const domains = rank(countBy(items, (i) => i.domain), 8);
  const kinds = rank(countBy(items, (i) => i.kind), 8);
  const days = countBy(items, (i) => d10(i.createdAt));
  const busiest = [...days.entries()].sort((a, b) => b[1] - a[1])[0];

  L('## Nhìn nhanh');
  L();
  L(`- **${items.length}** link, trải trên **${new Set(items.map((i) => monthKey(i.createdAt))).size}** tháng`);
  if (busiest) L(`- Ngày lưu nhiều nhất: **${busiest[0]}** (${busiest[1]} link)`);
  L(`- Nguồn hay lưu: ${domains.map(([d, n]) => `\`${d}\` (${n})`).join(', ')}`);
  L(`- Loại: ${kinds.map(([k, n]) => `${(KIND_META[k] || KIND_META.link).label} ${n}`).join(' · ')}`);
  const starred = items.filter((i) => i.fav);
  if (starred.length) L(`- Đã ghim: **${starred.length}**`);
  L();

  // ---- by topic ----
  const buckets = new Map();
  for (const i of items) {
    for (const t of ((i.topics || []).length ? i.topics : ['__none'])) {
      if (!buckets.has(t)) buckets.set(t, []);
      buckets.get(t).push(i);
    }
  }
  const ordered = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length);

  L('## Theo topic');
  L();
  for (const [id, list] of ordered) {
    L(`### ${id === '__none' ? 'Chưa phân loại' : label.get(id) || id} — ${list.length} link`);
    L();
    const months = new Map();
    for (const i of list) {
      const m = monthKey(i.createdAt);
      if (!months.has(m)) months.set(m, []);
      months.get(m).push(i);
    }
    for (const [m, group] of [...months.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
      L(`**${m}**`);
      L();
      for (const i of group.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))) {
        const meta = KIND_META[i.kind] || KIND_META.link;
        const tags = (i.tags || []).map((t) => `#${t}`).join(' ');
        const note = i.note ? ` — ${i.note.replace(/\s*\n\s*/g, ' ')}` : '';
        L(`- ${meta.icon} [${i.title || i.url}](${i.url}) \`${d10(i.createdAt)}\`${i.fav ? ' ⭐' : ''}${tags ? ` ${tags}` : ''}${note}`);
      }
      L();
    }
  }

  return lines.join('\n');
}

// A ready-made prompt so the digest can go straight into Claude Code.
export function buildPrompt(items, rangeLabel) {
  return [
    `Đây là ${items.length} link tôi đã lưu (phạm vi: ${rangeLabel}), kèm topic, loại và ghi chú.`,
    '',
    'Giúp tôi:',
    '1. Gom thành các chủ đề thực sự (không nhất thiết theo topic tự động bên dưới) và đặt tên cho từng nhóm.',
    '2. Với mỗi nhóm, viết 2–3 câu vì sao nó đáng chú ý với hướng nghiên cứu của tôi.',
    '3. Chỉ ra link trùng nội dung, link đã cũ, và 5 link nên đọc trước — kèm lý do.',
    '4. Đề xuất vài topic mới nên thêm vào topics.json, kèm từ khoá.',
    '',
    '---',
    '',
  ].join('\n');
}
