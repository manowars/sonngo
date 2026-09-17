// Sync layer: the git repository *is* the database. One JSON file per month
// plus a topics.json, written through the GitHub Contents API. That keeps the
// desktop side trivial — `git pull` and Claude Code sees plain JSON.

import {
  state, persist, emit, mergeRemote, dirtyMonths, notesForMonth,
  markClean, serializeNote, applyTopics,
} from './store.js';
import { monthKey } from './classify.js';

const API = 'https://api.github.com';

function encodeBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function decodeBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function isConfigured(s = state.settings) {
  return Boolean(s.owner && s.repo && s.token);
}

async function api(path, options = {}) {
  const { token } = state.settings;
  const res = await fetch(`${API}${path}`, {
    // GitHub answers authenticated reads with `Cache-Control: private,
    // max-age=60`, so without this a note pushed seconds ago stays invisible.
    cache: 'no-store',
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 404) return { notFound: true, res };
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch { /* ignore */ }
    throw new Error(`GitHub ${res.status}: ${detail || res.statusText}`);
  }
  return { data: await res.json(), res };
}

function basePath() {
  return String(state.settings.path || 'linknotes/data').replace(/^\/+|\/+$/g, '');
}

function contentsUrl(file) {
  const { owner, repo, branch } = state.settings;
  const p = file ? `${basePath()}/${file}` : basePath();
  return `/repos/${owner}/${repo}/contents/${encodeURI(p)}?ref=${encodeURIComponent(branch || 'main')}`;
}

export async function verifyAccess() {
  const { owner, repo } = state.settings;
  const { notFound, data } = await api(`/repos/${owner}/${repo}`);
  if (notFound) throw new Error('Repo not found, or the token has no access to it.');
  return { private: data.private, defaultBranch: data.default_branch };
}

async function listRemoteFiles() {
  const { notFound, data } = await api(contentsUrl(''));
  if (notFound || !Array.isArray(data)) return [];
  return data
    .filter((f) => f.type === 'file' && f.name.endsWith('.json'))
    .map((f) => ({ name: f.name, sha: f.sha }));
}

async function readJsonFile(name) {
  const { notFound, data } = await api(contentsUrl(name));
  if (notFound) return { sha: null, json: null };
  try {
    return { sha: data.sha, json: JSON.parse(decodeBase64(data.content || '')) };
  } catch (err) {
    throw new Error(`${name} is not valid JSON: ${err.message}`);
  }
}

async function writeJsonFile(name, json, sha, message) {
  const { owner, repo, branch } = state.settings;
  const body = {
    message,
    content: encodeBase64(`${JSON.stringify(json, null, 2)}\n`),
    branch: branch || 'main',
  };
  if (sha) body.sha = sha;
  const res = await fetch(
    `${API}/repos/${owner}/${repo}/contents/${encodeURI(`${basePath()}/${name}`)}`,
    {
      method: 'PUT',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${state.settings.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  if (res.status === 409 || res.status === 422) return { conflict: true };
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch { /* ignore */ }
    throw new Error(`GitHub ${res.status}: ${detail || res.statusText}`);
  }
  return { data: await res.json() };
}

function setStatus(status, message = '') {
  state.syncStatus = status;
  state.syncMessage = message;
  emit();
}

export async function pull() {
  const files = await listRemoteFiles();
  const remoteNotes = [];
  for (const file of files) {
    if (file.name === 'topics.json') continue;
    const { json } = await readJsonFile(file.name);
    if (json && Array.isArray(json.items)) remoteNotes.push(...json.items);
  }
  const changed = mergeRemote(remoteNotes);
  const topics = await readJsonFile('topics.json');
  if (topics.json && Array.isArray(topics.json.topics) && topics.json.topics.length
      && JSON.stringify(topics.json.topics) !== JSON.stringify(state.topics)) {
    const reclassified = applyTopics(topics.json.topics);
    if (reclassified) console.info(`linknotes: luật topic mới, phân loại lại ${reclassified} note`);
  }
  return { changed, months: files.length };
}

async function pushMonth(month) {
  const name = `${month}.json`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { sha, json } = await readJsonFile(name);
    if (json && Array.isArray(json.items)) mergeRemote(json.items);
    const items = notesForMonth(month).map(serializeNote);
    if (!items.length) return { skipped: true };
    const payload = {
      month,
      updatedAt: new Date().toISOString(),
      count: items.filter((i) => !i.deletedAt).length,
      items: items.sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0)),
    };
    const result = await writeJsonFile(
      name, payload, sha,
      `linknotes: sync ${month} (${payload.count} links)`
    );
    if (!result.conflict) {
      await markClean(items.map((i) => i.id));
      return { pushed: items.length };
    }
  }
  throw new Error(`Could not write ${name} — conflict after retry.`);
}

export async function pushTopics() {
  const { sha } = await readJsonFile('topics.json');
  await writeJsonFile(
    'topics.json',
    { updatedAt: new Date().toISOString(), topics: state.topics },
    sha,
    'linknotes: update topic rules'
  );
}

export async function sync({ silent = false } = {}) {
  if (!isConfigured()) {
    if (!silent) setStatus('error', 'Chưa cấu hình GitHub (Settings).');
    return { ok: false, reason: 'not-configured' };
  }
  if (!navigator.onLine) {
    if (!silent) setStatus('offline', 'Đang offline — sẽ đồng bộ khi có mạng.');
    return { ok: false, reason: 'offline' };
  }
  if (state.syncStatus === 'syncing') return { ok: false, reason: 'busy' };
  setStatus('syncing', 'Đang đồng bộ…');
  try {
    const pulled = await pull();
    const months = dirtyMonths();
    let pushed = 0;
    for (const month of months) {
      const r = await pushMonth(month);
      pushed += r.pushed || 0;
    }
    state.lastSync = new Date().toISOString();
    await persist();
    setStatus('ok', `Đã đồng bộ · ${pulled.changed} về / ${pushed} đi`);
    return { ok: true, pulled: pulled.changed, pushed };
  } catch (err) {
    setStatus('error', err.message);
    return { ok: false, error: err.message };
  }
}

export { monthKey };
