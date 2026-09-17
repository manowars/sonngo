#!/usr/bin/env node
// Scaffolds a fresh (private) notes repository so the phone has somewhere to
// sync to:  node scripts/bootstrap.mjs ~/notes
import { mkdirSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_TOPICS } from '../web/js/classify.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const target = resolve(process.argv[2] || '.');
const dataDir = join(target, 'linknotes', 'data');

mkdirSync(dataDir, { recursive: true });

const write = (path, content) => {
  if (existsSync(path)) { console.log(`· giữ nguyên ${path}`); return; }
  writeFileSync(path, content);
  console.log(`· tạo ${path}`);
};

write(join(dataDir, 'topics.json'),
  `${JSON.stringify({ updatedAt: new Date().toISOString(), topics: DEFAULT_TOPICS }, null, 2)}\n`);

write(join(dataDir, '.gitkeep'), '');

write(join(target, '.gitignore'), 'node_modules/\n.DS_Store\n');

write(join(target, 'README.md'), `# Notes

Kho dữ liệu riêng của LinkNotes. Mỗi tháng một file JSON trong
\`linknotes/data/\`. App trên điện thoại ghi vào đây qua GitHub API.

Repo này **nên để private**.

Xem \`CLAUDE.md\` để biết định dạng và các lệnh tổng hợp.
`);

if (existsSync(join(HERE, '..', 'CLAUDE.md'))) {
  const dest = join(target, 'CLAUDE.md');
  if (!existsSync(dest)) {
    copyFileSync(join(HERE, '..', 'CLAUDE.md'), dest);
    console.log(`· tạo ${dest}`);
  }
}

console.log(`
Xong. Tiếp theo:
  cd ${target}
  git init && git add -A && git commit -m "khởi tạo kho LinkNotes"
  # tạo repo PRIVATE trên GitHub rồi:
  git remote add origin git@github.com:<user>/<repo>.git && git push -u origin main

Rồi mở app → ⚙️ → điền user / repo / branch / path = linknotes/data / token.
`);
