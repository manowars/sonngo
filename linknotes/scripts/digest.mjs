#!/usr/bin/env node
// Builds DIGEST.md — a human/Claude readable roll-up of every saved link,
// grouped by topic and by month.
//   node scripts/digest.mjs [--data <dir>] [--out <file>] [--days N]
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { dataDir, loadAll, loadTopics, fmtDate } from './lib.mjs';
import { KIND_META, monthKey } from '../web/js/classify.js';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const dir = dataDir(argv);
const out = resolve(arg('--out', join(dir, '..', 'DIGEST.md')));
const days = Number(arg('--days', '0')) || 0;

const topics = loadTopics(dir);
const topicLabel = new Map(topics.map((t) => [t.id, t.label]));
let items = loadAll(dir);
if (days) {
  const cutoff = Date.now() - days * 86400000;
  items = items.filter((i) => (Date.parse(i.createdAt) || 0) >= cutoff);
}

const lines = [];
const L = (s = '') => lines.push(s);

L('# LinkNotes — Digest');
L();
L(`_Tạo lúc ${new Date().toISOString()} · ${items.length} link${days ? ` · ${days} ngày gần nhất` : ''}_`);
L();

// ---- Overview ----
const byTopic = new Map();
const byKind = new Map();
const byDomain = new Map();
const byMonth = new Map();
for (const i of items) {
  const ts = (i.topics || []).length ? i.topics : ['__none'];
  for (const t of ts) byTopic.set(t, [...(byTopic.get(t) || []), i]);
  byKind.set(i.kind, (byKind.get(i.kind) || 0) + 1);
  if (i.domain) byDomain.set(i.domain, (byDomain.get(i.domain) || 0) + 1);
  const m = monthKey(i.createdAt);
  byMonth.set(m, (byMonth.get(m) || 0) + 1);
}

L('## Tổng quan');
L();
L('| Topic | Số link |');
L('| --- | ---: |');
for (const [id, list] of [...byTopic.entries()].sort((a, b) => b[1].length - a[1].length)) {
  L(`| ${id === '__none' ? '_(chưa phân loại)_' : topicLabel.get(id) || id} | ${list.length} |`);
}
L();
L('| Loại | Số link |');
L('| --- | ---: |');
for (const [kind, n] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) {
  const meta = KIND_META[kind] || KIND_META.link;
  L(`| ${meta.icon} ${meta.label} | ${n} |`);
}
L();
L('**Nguồn hay lưu nhất:** ' + [...byDomain.entries()]
  .sort((a, b) => b[1] - a[1]).slice(0, 12)
  .map(([d, n]) => `\`${d}\` (${n})`).join(', '));
L();

// ---- By topic ----
L('## Theo topic');
L();
const ordered = [...byTopic.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [id, list] of ordered) {
  L(`### ${id === '__none' ? 'Chưa phân loại' : topicLabel.get(id) || id} (${list.length})`);
  L();
  const months = new Map();
  for (const i of list) {
    const m = monthKey(i.createdAt);
    months.set(m, [...(months.get(m) || []), i]);
  }
  for (const [m, group] of [...months.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
    L(`**${m}**`);
    L();
    for (const i of group) {
      const meta = KIND_META[i.kind] || KIND_META.link;
      const tags = (i.tags || []).map((t) => `#${t}`).join(' ');
      const note = i.note ? ` — ${i.note.replace(/\n+/g, ' ')}` : '';
      L(`- ${meta.icon} [${i.title || i.url}](${i.url}) \`${fmtDate(i.createdAt)}\`${i.fav ? ' ⭐' : ''}${tags ? ` ${tags}` : ''}${note}`);
    }
    L();
  }
}

// ---- Timeline ----
L('## Dòng thời gian');
L();
for (const [m, n] of [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
  L(`- **${m}** — ${n} link`);
}
L();

writeFileSync(out, `${lines.join('\n')}\n`);
console.log(`DIGEST → ${out} (${items.length} link, ${byTopic.size} topic)`);
