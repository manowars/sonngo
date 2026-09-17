#!/usr/bin/env node
// Flat exports for spreadsheets or other tools.
//   node scripts/export.mjs --format csv --out links.csv
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { dataDir, loadAll, loadTopics } from './lib.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] ? argv[i + 1] : d; };
const dir = dataDir(argv);
const format = arg('--format', 'csv');
const out = resolve(arg('--out', join(dir, '..', `links.${format === 'md' ? 'md' : format}`)));

const topics = loadTopics(dir);
const label = new Map(topics.map((t) => [t.id, t.label]));
const items = loadAll(dir);

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

let body;
if (format === 'csv') {
  const head = ['createdAt', 'title', 'url', 'domain', 'kind', 'topics', 'tags', 'fav', 'note'];
  body = [head.join(','), ...items.map((i) => [
    i.createdAt, i.title, i.url, i.domain, i.kind,
    (i.topics || []).map((t) => label.get(t) || t).join('|'),
    (i.tags || []).join('|'), i.fav ? 1 : 0, (i.note || '').replace(/\n/g, ' '),
  ].map(csvCell).join(','))].join('\n');
} else if (format === 'json') {
  body = JSON.stringify({ exportedAt: new Date().toISOString(), topics, items }, null, 2);
} else {
  body = items.map((i) => `- [${i.title || i.url}](${i.url}) — ${i.createdAt.slice(0, 10)}${i.note ? ` — ${i.note.replace(/\n/g, ' ')}` : ''}`).join('\n');
}
writeFileSync(out, `${body}\n`);
console.log(`${items.length} link → ${out}`);
