// Shared helpers for the desktop-side scripts.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_TOPICS } from '../web/js/classify.js';

const HERE = dirname(fileURLToPath(import.meta.url));

export function dataDir(argv = process.argv.slice(2)) {
  const flag = argv.indexOf('--data');
  if (flag !== -1 && argv[flag + 1]) return resolve(argv[flag + 1]);
  if (process.env.LINKNOTES_DATA) return resolve(process.env.LINKNOTES_DATA);
  return resolve(join(HERE, '..', 'data'));
}

export function monthFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
    .sort();
}

export function loadTopics(dir) {
  const path = join(dir, 'topics.json');
  if (!existsSync(path)) return DEFAULT_TOPICS;
  try {
    const json = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(json.topics) && json.topics.length ? json.topics : DEFAULT_TOPICS;
  } catch {
    return DEFAULT_TOPICS;
  }
}

export function loadAll(dir, { includeDeleted = false } = {}) {
  const items = [];
  for (const file of monthFiles(dir)) {
    const json = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    for (const item of json.items || []) {
      if (!includeDeleted && item.deletedAt) continue;
      items.push(item);
    }
  }
  items.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  return items;
}

export function writeMonth(dir, month, items) {
  const payload = {
    month,
    updatedAt: new Date().toISOString(),
    count: items.filter((i) => !i.deletedAt).length,
    items: items.sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0)),
  };
  writeFileSync(join(dir, `${month}.json`), `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

export function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '?' : d.toISOString().slice(0, 10);
}
