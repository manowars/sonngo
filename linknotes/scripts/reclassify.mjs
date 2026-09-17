#!/usr/bin/env node
// Re-runs the classification rules over every stored note. Use after editing
// topics.json (by hand or with Claude Code).
//   node scripts/reclassify.mjs [--data <dir>] [--dry]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir, monthFiles, loadTopics, writeMonth } from './lib.mjs';
import { classify } from '../web/js/classify.js';

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const dir = dataDir(argv);
const topics = loadTopics(dir);

let touched = 0;
let total = 0;
for (const file of monthFiles(dir)) {
  const json = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const month = file.replace('.json', '');
  const next = (json.items || []).map((item) => {
    total += 1;
    if (item.deletedAt) return item;
    const before = JSON.stringify([item.topics, item.kind, item.tags, item.domain]);
    const re = classify(item, topics);
    const after = JSON.stringify([re.topics, re.kind, re.tags, re.domain]);
    if (before !== after) {
      touched += 1;
      console.log(`  ~ ${re.title || re.url}`);
      console.log(`      topics: ${(item.topics || []).join(',') || '-'} → ${re.topics.join(',') || '-'}`);
      return { ...re, updatedAt: new Date().toISOString() };
    }
    return item;
  });
  if (!dry) writeMonth(dir, month, next);
}
console.log(`${dry ? '[dry-run] ' : ''}${touched}/${total} note thay đổi · ${topics.length} topic`);
