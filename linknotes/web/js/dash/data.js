// Read-only data layer for the desktop dashboard.
//
// It reuses the phone app's saved settings (same origin, so the token is
// already in localStorage) but never writes to the repository — a read-only
// token is enough here.

import { loadSettings, idbGet, idbSet } from '../store.js';
import { DEFAULT_TOPICS, monthKey, dayKey } from '../classify.js';

const API = 'https://api.github.com';
const CACHE_KEY = 'dashCache';

function decodeBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function settings() {
  return loadSettings();
}

export function isConfigured(s = settings()) {
  return Boolean(s.owner && s.repo && s.token);
}

async function api(path, token) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`,
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch { /* ignore */ }
    throw new Error(`GitHub ${res.status}: ${detail || res.statusText}`);
  }
  return res.json();
}

export async function pullFromGitHub() {
  const s = settings();
  if (!isConfigured(s)) throw new Error('Chưa cấu hình GitHub. Mở app điện thoại/web và điền ở ⚙️, hoặc nạp file JSON.');
  const base = String(s.path || 'linknotes/data').replace(/^\/+|\/+$/g, '');
  const ref = encodeURIComponent(s.branch || 'main');
  const dir = await api(`/repos/${s.owner}/${s.repo}/contents/${encodeURI(base)}?ref=${ref}`, s.token);
  if (!Array.isArray(dir)) throw new Error(`Không thấy thư mục ${base} trong ${s.owner}/${s.repo}.`);

  const files = dir.filter((f) => f.type === 'file' && f.name.endsWith('.json'));
  const items = [];
  let topics = null;
  for (const f of files) {
    const file = await api(`/repos/${s.owner}/${s.repo}/contents/${encodeURI(`${base}/${f.name}`)}?ref=${ref}`, s.token);
    if (!file || !file.content) continue;
    let json;
    try { json = JSON.parse(decodeBase64(file.content)); } catch { continue; }
    if (f.name === 'topics.json') {
      if (Array.isArray(json.topics) && json.topics.length) topics = json.topics;
    } else if (Array.isArray(json.items)) {
      items.push(...json.items);
    }
  }
  const dataset = normalize(items, topics);
  dataset.source = `${s.owner}/${s.repo}@${s.branch || 'main'}`;
  await idbSet(CACHE_KEY, dataset).catch(() => {});
  return dataset;
}

export async function loadCached() {
  try {
    const cached = await idbGet(CACHE_KEY);
    return cached && Array.isArray(cached.items) ? cached : null;
  } catch {
    return null;
  }
}

// Accepts either an app export ({items, topics}) or a single month file.
export function fromJsonFiles(parsedFiles) {
  const items = [];
  let topics = null;
  for (const json of parsedFiles) {
    if (!json) continue;
    if (Array.isArray(json.topics) && json.topics.length && !Array.isArray(json.items)) topics = json.topics;
    if (Array.isArray(json.topics) && json.topics.length && Array.isArray(json.items)) topics = json.topics;
    if (Array.isArray(json.items)) items.push(...json.items);
  }
  if (!items.length) throw new Error('Không tìm thấy mảng "items" nào trong các file đã chọn.');
  const dataset = normalize(items, topics);
  dataset.source = 'file cục bộ';
  return dataset;
}

function normalize(rawItems, rawTopics) {
  const byId = new Map();
  for (const item of rawItems) {
    if (!item || !item.id) continue;
    const prev = byId.get(item.id);
    if (!prev || (Date.parse(item.updatedAt) || 0) > (Date.parse(prev.updatedAt) || 0)) byId.set(item.id, item);
  }
  const items = [...byId.values()]
    .filter((i) => !i.deletedAt)
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  return {
    items,
    topics: rawTopics && rawTopics.length ? rawTopics : DEFAULT_TOPICS,
    pulledAt: new Date().toISOString(),
    source: '',
  };
}

/* ---------------- filtering ---------------- */

export const RANGES = [
  { id: '7', label: '7 ngày', days: 7 },
  { id: '30', label: '30 ngày', days: 30 },
  { id: '90', label: '90 ngày', days: 90 },
  { id: '365', label: '1 năm', days: 365 },
  { id: 'all', label: 'Tất cả', days: null },
];

export function applyFilters(items, { range = '90', topic = 'all', kind = 'all', query = '' } = {}) {
  const preset = RANGES.find((r) => r.id === range) || RANGES[2];
  const cutoff = preset.days ? Date.now() - preset.days * 86400000 : null;
  const needle = query.trim().toLowerCase();
  return items.filter((i) => {
    if (cutoff && (Date.parse(i.createdAt) || 0) < cutoff) return false;
    if (topic !== 'all') {
      if (topic === '__none') { if ((i.topics || []).length) return false; }
      else if (!(i.topics || []).includes(topic)) return false;
    }
    if (kind !== 'all' && i.kind !== kind) return false;
    if (needle) {
      const hay = [i.title, i.url, i.note, i.domain, (i.tags || []).join(' ')]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

/* ---------------- aggregation ---------------- */

export function countBy(items, keyFn) {
  const map = new Map();
  for (const i of items) {
    for (const k of [].concat(keyFn(i))) {
      if (k === undefined || k === null || k === '') continue;
      map.set(k, (map.get(k) || 0) + 1);
    }
  }
  return map;
}

export function rank(map, limit, otherLabel = 'Khác') {
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  if (sorted.length <= limit) return sorted;
  const head = sorted.slice(0, limit - 1);
  const tail = sorted.slice(limit - 1).reduce((sum, [, n]) => sum + n, 0);
  return tail ? [...head, [otherLabel, tail]] : head;
}

// Dense day series between two dates so the chart has no invisible gaps.
export function daySeries(items, fromDate, toDate) {
  const counts = countBy(items, (i) => dayKey(i.createdAt));
  const out = [];
  const cursor = new Date(fromDate);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(toDate);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    const key = dayKey(cursor.toISOString());
    out.push({ date: new Date(cursor), key, value: counts.get(key) || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function weekSeries(days) {
  const out = [];
  let bucket = null;
  for (const d of days) {
    // ISO weeks: Monday starts a bucket.
    if (!bucket || d.date.getDay() === 1) {
      bucket = { date: new Date(d.date), key: d.key, value: 0 };
      out.push(bucket);
    }
    bucket.value += d.value;
  }
  return out;
}

// Stacked series: one row per month, one column per topic slot.
export function topicsByMonth(items, topicOrder) {
  const months = [...new Set(items.map((i) => monthKey(i.createdAt)))].sort();
  const rows = months.map((m) => ({ month: m, total: 0, values: new Map() }));
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const known = new Set(topicOrder.map((t) => t.id));
  for (const i of items) {
    const row = byMonth.get(monthKey(i.createdAt));
    if (!row) continue;
    const list = (i.topics || []).filter((t) => known.has(t));
    const keys = list.length ? list : ['__none'];
    for (const k of keys) row.values.set(k, (row.values.get(k) || 0) + 1);
    row.total += keys.length;
  }
  return rows;
}

export { monthKey, dayKey };
