// Builds the static site into dist/ for Netlify.
//
//   content/blog/*.md       Markdown posts with YAML front matter (edited in Pages CMS)
//   content/gallery/*.json  one gallery item per file (edited in Pages CMS)
//   images/uploads/         media uploaded through Pages CMS
//
// Output: the homepage and assets as-is, plus /blog/, /blog/<slug>/, /gallery/,
// /data/posts.json (latest posts for the homepage), 404.html and, when Netlify
// provides the site URL, sitemap.xml + robots.txt.
//
// INCLUDE_DRAFTS=1 also publishes posts marked `draft: true` (local preview).

import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { load as parseYaml } from 'js-yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
const INCLUDE_DRAFTS = process.env.INCLUDE_DRAFTS === '1';
const SITE_URL = (process.env.URL || '').replace(/\/+$/, '');

const LANGS = ['en', 'vi', 'ko'];
const LANG_EN = { en: 'English', vi: 'Vietnamese', ko: 'Korean' };
const CATS = ['cfd', 'lab', 'conference', 'teaching', 'other'];
const CAT_EN = { cfd: 'CFD simulation', lab: 'Laboratory', conference: 'Conference', teaching: 'Teaching', other: 'Other' };

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Only site-relative paths and http(s) URLs may end up in src/href attributes.
function safeUrl(u) {
  if (typeof u !== 'string') return '';
  u = u.trim();
  if (!u) return '';
  if (/^images\//.test(u)) u = '/' + u;
  return /^(\/(?!\/)|https?:\/\/)/i.test(u) ? u : '';
}

function dateStr(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const m = String(v ?? '').match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : '';
}

function slugify(name) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function splitFrontMatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
  return m ? { data: parseYaml(m[1]) || {}, body: m[2] } : { data: {}, body: src };
}

async function listFiles(dir, ext) {
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((f) => f.endsWith(ext) && !f.startsWith('.')).sort();
}

// ---------------------------------------------------------------- content

async function loadPosts() {
  const dir = path.join(ROOT, 'content/blog');
  const used = new Set();
  const posts = [];
  for (const file of await listFiles(dir, '.md')) {
    const { data, body } = splitFrontMatter(await readFile(path.join(dir, file), 'utf8'));
    if (data.draft === true && !INCLUDE_DRAFTS) continue;
    const title = String(data.title ?? '').trim();
    const date = dateStr(data.date);
    if (!title || !date) {
      console.warn(`skip content/blog/${file}: needs a title and a date`);
      continue;
    }
    let slug = slugify(file.replace(/\.md$/, '')) || `post-${date}`;
    for (let i = 2; used.has(slug); i++) slug = `${slug.replace(/-\d+$/, '')}-${i}`;
    used.add(slug);
    const html = marked.parse(body);
    const words = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    posts.push({
      slug, title, date,
      lang: LANGS.includes(data.lang) ? data.lang : 'en',
      summary: String(data.summary ?? '').trim(),
      cover: safeUrl(data.cover),
      tags: (Array.isArray(data.tags) ? data.tags : []).map((t) => String(t).trim()).filter(Boolean),
      draft: data.draft === true,
      minutes: Math.max(1, Math.round(words / 200)),
      html,
    });
  }
  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

async function loadGallery() {
  const dir = path.join(ROOT, 'content/gallery');
  const items = [];
  for (const file of await listFiles(dir, '.json')) {
    let d;
    try {
      d = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
    } catch (e) {
      console.warn(`skip content/gallery/${file}: ${e.message}`);
      continue;
    }
    const image = safeUrl(d.image);
    const video = safeUrl(d.video);
    if (!image && !video) {
      console.warn(`skip content/gallery/${file}: needs an image or a video`);
      continue;
    }
    const str = (k) => String(d[k] ?? '').trim();
    // An optional WebM next to an MP4 (same name) is offered as a fallback source.
    const webm = /\.mp4$/i.test(video) && video.startsWith('/') && existsSync(path.join(ROOT, video.replace(/\.mp4$/i, '.webm')))
      ? video.replace(/\.mp4$/i, '.webm') : '';
    items.push({
      // English text plus optional Vietnamese / Korean versions
      title: str('title'), title_vi: str('title_vi'), title_ko: str('title_ko'),
      caption: str('caption'), caption_vi: str('caption_vi'), caption_ko: str('caption_ko'),
      category: CATS.includes(d.category) ? d.category : 'other',
      date: dateStr(d.date),
      featured: d.featured === true,
      image, video, webm,
    });
  }
  return items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// ---------------------------------------------------------------- templates

const NAV = [
  ['/#about', 'nav.about', 'About'],
  ['/#experience', 'nav.experience', 'Experience'],
  ['/#publications', 'nav.publications', 'Publications'],
  ['/#projects', 'nav.projects', 'Projects'],
  ['/blog/', 'nav.blog', 'Blog'],
  ['/gallery/', 'nav.gallery', 'Gallery'],
  ['/#contact', 'nav.contact', 'Contact'],
];

function layout({ title, description, active, body, urlPath, image, lang = 'en', extra = '' }) {
  const fullTitle = title ? `${title} — Son Ich Ngo` : 'Son Ich Ngo, Ph.D.';
  const canonical = SITE_URL && urlPath ? SITE_URL + urlPath : '';
  const ogImage = SITE_URL ? SITE_URL + (image && image.startsWith('/') ? image : '/assets/portrait.jpg') : '';
  const nav = NAV.map(([href, key, label]) =>
    `<a href="${href}" data-i18n="${key}"${href === active ? ' aria-current="page"' : ''}>${label}</a>`).join('\n  ');
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n<meta property="og:url" content="${esc(canonical)}">\n` : ''}${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">\n` : ''}<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%8C%8A%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
<div class="bg-grid"></div>
<div class="aurora a1"></div><div class="aurora a2"></div>

<nav>
  <a href="/" class="brand">SIN</a>
  ${nav}
  <div class="lang-switch" role="group" aria-label="Language">
    <button type="button" data-lang="en" aria-pressed="true">EN</button><button type="button" data-lang="vi" aria-pressed="false">VI</button><button type="button" data-lang="ko" aria-pressed="false">KO</button>
  </div>
</nav>

${body}

<footer>
  <div class="wrap">
    <div>© ${new Date().getFullYear()} Son Ich Ngo. <span data-i18n="footer.rights">All rights reserved.</span></div>
    <div data-i18n="footer.addr">Dept. of Chemical Engineering · Hankyong National University · Anseong, Korea</div>
  </div>
</footer>
${extra}
<script src="/assets/i18n.js"></script>
<script src="/assets/pages.js"></script>
</body>
</html>
`;
}

// Text with optional VI/KO versions, swapped client-side by i18n.js.
function l10n(tag, item, key) {
  const vi = item[`${key}_vi`], ko = item[`${key}_ko`];
  return `<${tag}${vi || ko ? ` data-l10n${vi ? ` data-vi="${esc(vi)}"` : ''}${ko ? ` data-ko="${esc(ko)}"` : ''}` : ''}>${esc(item[key])}</${tag}>`;
}
const captionOf = (i, sfx = '') => [i[`title${sfx}`] || i.title, i[`caption${sfx}`] || i.caption].filter(Boolean).join(' — ');

const videoSources = (i) => `<source src="${esc(i.video)}"${/\.mp4$/i.test(i.video) ? ' type="video/mp4"' : ''}>` +
  (i.webm ? `<source src="${esc(i.webm)}" type="video/webm">` : '');

const time = (d) => `<time datetime="${esc(d)}">${esc(d)}</time>`;
const langBadge = (l) => `<span class="lang-badge">${esc(l.toUpperCase())}</span>`;
const readTime = (n) => `<span data-rt="${n}">${n} min read</span>`;

function chips(target, key, values, labelOf) {
  if (values.length < 2) return '';
  const btns = values.map((v) => {
    const [i18nKey, en] = labelOf(v);
    return `<button type="button" data-value="${esc(v)}" aria-pressed="false" data-i18n="${i18nKey}">${esc(en)}</button>`;
  }).join('');
  return `<div class="chips" data-target="${target}" data-key="${key}" role="group">` +
    `<button type="button" data-value="all" aria-pressed="true" data-i18n="cat.all">All</button>${btns}</div>`;
}

function blogIndex(posts) {
  const langs = LANGS.filter((l) => posts.some((p) => p.lang === l));
  const cards = posts.map((p) => `<a class="post-card" href="/blog/${p.slug}/" data-lang="${p.lang}">
      ${p.cover ? `<img class="post-cover" src="${esc(p.cover)}" alt="" loading="lazy">` : ''}
      <div class="post-body" lang="${p.lang}">
        <div class="post-meta">${time(p.date)}${langBadge(p.lang)}${readTime(p.minutes)}</div>
        <h2>${esc(p.title)}</h2>
        ${p.summary ? `<p>${esc(p.summary)}</p>` : ''}
        <span class="more" data-i18n="blog.read">Read more →</span>
      </div>
    </a>`).join('\n    ');
  const body = `<main class="wrap">
  <header class="page-head">
    <div class="kicker" data-i18n="blog.kicker">Notes</div>
    <h1 data-i18n="blog.title">Blog</h1>
    <p data-i18n="blog.intro">Notes on research, CFD, teaching and academic life.</p>
  </header>
  ${posts.length
    ? `${chips('#posts', 'lang', langs, (l) => [`lang.name.${l}`, LANG_EN[l]])}
  <div class="post-grid" id="posts">
    ${cards}
  </div>`
    : '<div class="empty" data-i18n="blog.empty">No posts yet — check back soon.</div>'}
</main>`;
  return layout({
    title: 'Blog', active: '/blog/', urlPath: '/blog/', body,
    description: 'Notes on research, computational fluid dynamics, teaching and academic life by Son Ich Ngo.',
  });
}

function blogPost(p) {
  const tags = p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  const body = `<main class="wrap">
  <article class="post">
    <a class="back" href="/blog/" data-i18n="blog.back">← All posts</a>
    <div lang="${p.lang}">
      <h1>${esc(p.title)}</h1>
      <div class="post-meta">${time(p.date)}${langBadge(p.lang)}${readTime(p.minutes)}${tags}</div>
      ${p.cover ? `<img class="hero-img" src="${esc(p.cover)}" alt="">` : ''}
      <div class="prose" style="margin-top:28px">
${p.html}
      </div>
    </div>
  </article>
</main>`;
  return layout({
    title: p.title, active: '/blog/', urlPath: `/blog/${p.slug}/`, image: p.cover, lang: p.lang, body,
    description: p.summary || `${p.title} — blog post by Son Ich Ngo.`,
  });
}

function galleryPage(items) {
  const cats = CATS.filter((c) => items.some((i) => i.category === c));
  const cards = items.map((i) => {
    const media = i.video
      ? `<video${i.image ? ` poster="${esc(i.image)}" preload="none"` : ' preload="metadata"'} muted loop playsinline>${videoSources(i)}</video>`
      : `<img src="${esc(i.image)}" alt="${esc(i.title || i.caption)}" loading="lazy">`;
    return `<button type="button" class="g-item" data-cat="${i.category}" data-full="${esc(i.image)}" data-video="${esc(i.video)}" data-webm="${esc(i.webm)}" data-caption="${esc(captionOf(i))}" data-caption-vi="${esc(captionOf(i, '_vi'))}" data-caption-ko="${esc(captionOf(i, '_ko'))}">
      ${media}
      ${i.title || i.caption || i.date ? `<div class="g-cap">
        ${i.title ? l10n('h3', i, 'title') : ''}
        ${i.caption ? l10n('p', i, 'caption') : ''}
        <div class="post-meta"><span class="tag" data-i18n="cat.${i.category}">${CAT_EN[i.category]}</span>${i.date ? time(i.date) : ''}</div>
      </div>` : ''}
    </button>`;
  }).join('\n    ');
  const body = `<main class="wrap">
  <header class="page-head">
    <div class="kicker" data-i18n="gallery.kicker">Visual research</div>
    <h1 data-i18n="gallery.title">Gallery</h1>
    <p data-i18n="gallery.intro">CFD simulations, lab work, conferences and teaching moments.</p>
  </header>
  ${items.length
    ? `${chips('#gallery', 'cat', cats, (c) => [`cat.${c}`, CAT_EN[c]])}
  <div class="gallery" id="gallery">
    ${cards}
  </div>`
    : '<div class="empty" data-i18n="gallery.empty">The gallery is being prepared — new images and CFD animations are coming soon.</div>'}
</main>`;
  const lightbox = `<div class="lightbox" id="lightbox" hidden role="dialog" aria-modal="true">
  <button type="button" class="btn ghost lb-close" data-i18n="ui.close">Close</button>
  <div class="lb-media"></div>
  <div class="lb-cap"></div>
</div>`;
  return layout({
    title: 'Gallery', active: '/gallery/', urlPath: '/gallery/', body, extra: lightbox,
    description: 'CFD simulation animations, laboratory work, conferences and teaching moments by Son Ich Ngo.',
  });
}

function notFound() {
  const body = `<main class="wrap">
  <header class="page-head">
    <div class="kicker">404</div>
    <h1 data-i18n="notfound.title">Page not found</h1>
    <p data-i18n="notfound.text">The page you are looking for does not exist or has moved.</p>
    <p><a class="btn ghost" href="/" style="margin-top:12px" data-i18n="notfound.home">← Back to home</a></p>
  </header>
</main>`;
  return layout({ title: 'Page not found', body, description: 'Page not found.' });
}

// ---------------------------------------------------------------- build

async function write(rel, content) {
  const file = path.join(OUT, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

const posts = await loadPosts();
const gallery = await loadGallery();

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await cp(path.join(ROOT, 'index.html'), path.join(OUT, 'index.html'));
await cp(path.join(ROOT, 'assets'), path.join(OUT, 'assets'), { recursive: true });
if (existsSync(path.join(ROOT, 'images'))) {
  await cp(path.join(ROOT, 'images'), path.join(OUT, 'images'), {
    recursive: true, filter: (src) => !path.basename(src).startsWith('.'),
  });
}

await write('blog/index.html', blogIndex(posts));
for (const p of posts) await write(`blog/${p.slug}/index.html`, blogPost(p));
await write('gallery/index.html', galleryPage(gallery));
await write('404.html', notFound());
await write('data/posts.json', JSON.stringify(posts.slice(0, 3).map((p) => ({
  title: p.title, date: p.date, lang: p.lang, summary: p.summary, cover: p.cover, url: `blog/${p.slug}/`,
})), null, 2));

const pick = (i) => ({
  title: i.title, title_vi: i.title_vi, title_ko: i.title_ko,
  caption: i.caption, caption_vi: i.caption_vi, caption_ko: i.caption_ko,
  image: i.image, video: i.video, webm: i.webm,
});
await write('data/featured.json', JSON.stringify(gallery.filter((i) => i.featured).slice(0, 8).map(pick), null, 2));

if (SITE_URL) {
  const urls = ['/', '/blog/', '/gallery/', ...posts.map((p) => `/blog/${p.slug}/`)];
  await write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(SITE_URL + u)}</loc></url>`).join('\n')}
</urlset>
`);
  await write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
}

console.log(`built dist/: ${posts.length} post(s)${INCLUDE_DRAFTS ? ' incl. drafts' : ''}, ${gallery.length} gallery item(s)`);
