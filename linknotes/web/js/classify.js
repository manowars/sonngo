// Auto-classification rules shared by the web app (browser) and the desktop
// scripts (node). Keep this file free of DOM and node APIs.

export const KIND_RULES = [
  { kind: 'paper',   label: 'Paper',      icon: '📄', domains: ['arxiv.org', 'doi.org', 'sciencedirect.com', 'springer.com', 'link.springer.com', 'nature.com', 'onlinelibrary.wiley.com', 'pubs.acs.org', 'pubs.rsc.org', 'pubs.aip.org', 'iopscience.iop.org', 'mdpi.com', 'researchgate.net', 'scholar.google.com', 'semanticscholar.org', 'biorxiv.org', 'ssrn.com', 'tandfonline.com', 'pubmed.ncbi.nlm.nih.gov', 'osti.gov', 'aiaa.org', 'asme.org'] },
  { kind: 'code',    label: 'Code',       icon: '💻', domains: ['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org', 'sourceforge.net', 'npmjs.com', 'pypi.org', 'crates.io'] },
  { kind: 'video',   label: 'Video',      icon: '🎬', domains: ['youtube.com', 'youtu.be', 'vimeo.com', 'bilibili.com', 'twitch.tv', 'ted.com'] },
  { kind: 'course',  label: 'Course',     icon: '🎓', domains: ['coursera.org', 'udemy.com', 'edx.org', 'khanacademy.org', 'datacamp.com', 'deeplearning.ai', 'fast.ai'] },
  { kind: 'dataset', label: 'Data/Model', icon: '📊', domains: ['kaggle.com', 'huggingface.co', 'zenodo.org', 'figshare.com', 'data.gov', 'openml.org'] },
  { kind: 'qa',      label: 'Q&A',        icon: '❓', domains: ['stackoverflow.com', 'stackexchange.com', 'superuser.com', 'serverfault.com', 'askubuntu.com', 'cfd-online.com'] },
  { kind: 'docs',    label: 'Docs',       icon: '📘', domains: ['developer.mozilla.org', 'docs.python.org', 'readthedocs.io', 'devdocs.io', 'wikipedia.org', 'w3schools.com', 'learn.microsoft.com', 'docs.ansys.com', 'openfoam.com', 'openfoam.org', 'cfd.direct'] },
  { kind: 'social',  label: 'Social',     icon: '💬', domains: ['x.com', 'twitter.com', 'facebook.com', 'fb.com', 'linkedin.com', 'reddit.com', 'threads.net', 'instagram.com', 'tiktok.com', 'discord.com', 'news.ycombinator.com', 'quora.com'] },
  { kind: 'article', label: 'Article',    icon: '📰', domains: ['medium.com', 'substack.com', 'dev.to', 'hashnode.com', 'towardsdatascience.com', 'techcrunch.com', 'theverge.com', 'wired.com', 'bbc.com', 'vnexpress.net', 'tuoitre.vn', 'thanhnien.vn', 'naver.com', 'tistory.com', 'velog.io'] },
  { kind: 'tool',    label: 'Tool',       icon: '🛠️', domains: ['colab.research.google.com', 'notion.so', 'figma.com', 'overleaf.com', 'netlify.com', 'vercel.com', 'claude.ai', 'chatgpt.com', 'openai.com', 'anthropic.com', 'perplexity.ai'] },
  { kind: 'drive',   label: 'File',       icon: '🗂️', domains: ['drive.google.com', 'docs.google.com', 'dropbox.com', 'onedrive.live.com', 'mega.nz'] },
];

export const KIND_META = Object.fromEntries(
  KIND_RULES.map((r) => [r.kind, { label: r.label, icon: r.icon }])
);
KIND_META.pdf = { label: 'PDF', icon: '📕' };
KIND_META.link = { label: 'Link', icon: '🔗' };

// Default topic rules. Tuned for the owner's research area (CFD / AI / energy)
// plus generic buckets. Fully editable from Settings and synced as topics.json,
// so Claude Code on the desktop can refine them over time.
export const DEFAULT_TOPICS = [
  { id: 'cfd',       label: 'CFD & Simulation', color: '#2563eb', keywords: ['cfd', 'computational fluid', 'openfoam', 'ansys', 'fluent', 'star-ccm', 'comsol', 'navier-stokes', 'navier stokes', 'turbulence', 'les ', 'rans', 'mesh', 'solver', 'multiphase', 'fluidized', 'fluidised', 'reactor', 'combustion', 'heat transfer', 'lattice boltzmann', 'dem simulation', 'mô phỏng'] },
  { id: 'ai',        label: 'AI & ML',          color: '#7c3aed', keywords: ['machine learning', 'deep learning', 'neural network', 'pinn', 'physics-informed', 'transformer', 'llm', 'gpt', 'claude', 'pytorch', 'tensorflow', 'jax', 'diffusion model', 'reinforcement learning', 'surrogate model', 'xgboost', 'scikit', 'huggingface', 'fine-tun', 'embedding', 'rag ', 'agent'] },
  { id: 'energy',    label: 'Energy & H2',      color: '#059669', keywords: ['hydrogen', 'h2 production', 'co2', 'carbon capture', 'ccus', 'gasification', 'pyrolysis', 'electrolysis', 'fuel cell', 'biomass', 'renewable', 'solar', 'wind turbine', 'battery', 'net zero', 'decarboni'] },
  { id: 'research',  label: 'Research & Career',color: '#d97706', keywords: ['call for paper', 'conference', 'journal', 'impact factor', 'grant', 'funding', 'postdoc', 'professor', 'tenure', 'peer review', 'scopus', 'web of science', 'nrf', 'proposal', 'cv ', 'academic'] },
  { id: 'dev',       label: 'Programming',      color: '#0891b2', keywords: ['python', 'javascript', 'typescript', 'fortran', 'c++', 'rust', 'golang', 'docker', 'kubernetes', 'linux', 'bash', 'git ', 'github action', 'api', 'regex', 'vscode', 'cursor', 'numpy', 'pandas', 'matplotlib', 'hpc', 'slurm', 'mpi', 'cuda'] },
  { id: 'writing',   label: 'Writing & Viz',    color: '#db2777', keywords: ['latex', 'overleaf', 'bibtex', 'zotero', 'mendeley', 'figure', 'plot', 'visualization', 'paraview', 'tecplot', 'diagram', 'presentation', 'slide', 'poster'] },
  { id: 'korea',     label: 'Korea & Life',     color: '#ea580c', keywords: ['korea', 'korean', 'hankyong', 'hknu', 'seoul', 'visa', 'f-2', 'f-5', 'topik', 'hàn quốc', 'tiếng hàn', '한국'] },
  { id: 'learning',  label: 'Learning',         color: '#4f46e5', keywords: ['tutorial', 'course', 'lecture', 'how to', 'guide', 'introduction to', 'cheat sheet', 'roadmap', 'khoá học', 'hướng dẫn'] },
];

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|igshid|mc_eid|mc_cid|ref_src|ref_url|si$|feature$|spm$|from$)/i;

export function normalizeUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    if (u.hash === '#') u.hash = '';
    let out = u.toString();
    if (out.endsWith('/') && u.pathname === '/' && !u.search && !u.hash) out = out.slice(0, -1);
    return out;
  } catch {
    return trimmed;
  }
}

// Returns both the substring as typed and its normalized form, so callers can
// strip exactly what they matched from the surrounding note text.
export function extractUrlMatch(text) {
  const match = String(text || '').match(/https?:\/\/[^\s<>"')\]]+/i);
  if (!match) return null;
  const raw = match[0].replace(/[.,;:!?)\]]+$/, '');
  return { raw, url: normalizeUrl(raw) };
}

export function extractUrl(text) {
  const m = extractUrlMatch(text);
  return m ? m.url : '';
}

export function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function detectKind(url) {
  const domain = getDomain(url);
  if (!domain) return 'link';
  let path = '';
  try { path = new URL(url).pathname.toLowerCase(); } catch { /* ignore */ }
  if (path.endsWith('.pdf')) return 'pdf';
  for (const rule of KIND_RULES) {
    if (rule.domains.some((d) => domain === d || domain.endsWith(`.${d}`))) return rule.kind;
  }
  if (/^docs?\./.test(domain) || /^blog\./.test(domain)) {
    return /^blog\./.test(domain) ? 'article' : 'docs';
  }
  return 'link';
}

export function extractTags(text) {
  const found = String(text || '').match(/#[\p{L}\p{N}_-]{2,30}/gu) || [];
  return [...new Set(found.map((t) => t.slice(1).toLowerCase()))];
}

export function detectTopics(item, topics = DEFAULT_TOPICS) {
  const haystack = [item.url, item.title, item.note, (item.tags || []).join(' ')]
    .filter(Boolean).join(' ').toLowerCase();
  if (!haystack) return [];
  const domain = getDomain(item.url || '');
  const hits = [];
  for (const topic of topics) {
    let score = 0;
    for (const kw of topic.keywords || []) {
      if (kw && haystack.includes(kw.toLowerCase())) score += 1;
    }
    for (const d of topic.domains || []) {
      if (domain && (domain === d || domain.endsWith(`.${d}`))) score += 3;
    }
    if (score > 0) hits.push({ id: topic.id, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, 3).map((h) => h.id);
}

// Fills every derived field of a note. `keepManual` preserves topics the user
// pinned by hand (stored in item.manualTopics).
export function classify(item, topics = DEFAULT_TOPICS) {
  const url = normalizeUrl(item.url || '');
  const tags = [...new Set([...(item.tags || []), ...extractTags(item.note), ...extractTags(item.title)])];
  const next = { ...item, url, tags };
  next.domain = getDomain(url);
  next.kind = item.kindLocked ? (item.kind || 'link') : detectKind(url);
  const auto = detectTopics(next, topics);
  const manual = item.manualTopics || [];
  next.topics = [...new Set([...manual, ...auto])];
  if (!next.title) next.title = titleFromUrl(url);
  return next;
}

const GENERIC_SEGMENTS = new Set([
  'watch', 'index', 'view', 'abs', 'pdf', 'html', 'home', 'post', 'posts',
  'article', 'articles', 'blog', 'p', 's', 'd', 'e', 'en', 'vi', 'ko', 'ja',
  'video', 'story', 'status', 'item', 'detail', 'page', 'content', 'full',
]);

// Fallback title when no page metadata is available: the most descriptive path
// segment, or the domain when the path is only ids and routing noise.
export function titleFromUrl(url) {
  if (!url) return '(không có tiêu đề)';
  let u;
  try { u = new URL(url); } catch { return url.slice(0, 80); }
  const host = u.hostname.replace(/^www\./, '');
  const segments = u.pathname.split('/').filter(Boolean)
    .map((s) => decodeURIComponent(s).replace(/\.(html?|php|aspx?|pdf)$/i, ''));
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const seg = segments[i];
    if (GENERIC_SEGMENTS.has(seg.toLowerCase())) continue;
    const words = seg.replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim();
    const letters = words.replace(/[^\p{L}]/gu, '');
    // Skip bare ids like "2403.12345" or "s41560-024-01".
    if (letters.length < 3 || letters.length / words.length < 0.4) continue;
    return `${words} · ${host}`;
  }
  return host;
}

export function monthKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function dayKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
