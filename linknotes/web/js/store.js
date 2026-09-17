// Offline-first storage. Notes live in IndexedDB (survives reloads, no 5MB
// localStorage ceiling); settings live in localStorage so the sync layer can
// read them synchronously at boot.

import { classify, monthKey, DEFAULT_TOPICS } from './classify.js';

const DB_NAME = 'linknotes';
const DB_VERSION = 1;
const STORE = 'kv';
const SETTINGS_KEY = 'linknotes.settings';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const DEFAULT_SETTINGS = {
  owner: '',
  repo: '',
  branch: 'main',
  path: 'linknotes/data',
  token: '',
  autoSync: true,
  fetchMeta: true,
  favicons: true,
  metaEndpoint: '/.netlify/functions/meta',
  theme: 'auto',
  device: 'web',
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}

export function newId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `l${Date.now().toString(36)}${rand}`;
}

export const state = {
  notes: [],
  topics: DEFAULT_TOPICS.map((t) => ({ ...t })),
  settings: loadSettings(),
  lastSync: null,
  syncStatus: 'idle',
  syncMessage: '',
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit() { for (const fn of listeners) fn(state); }

export async function load() {
  const [notes, topics, meta] = await Promise.all([
    idbGet('notes'), idbGet('topics'), idbGet('meta'),
  ]);
  state.notes = Array.isArray(notes) ? notes : [];
  state.topics = Array.isArray(topics) && topics.length ? topics : DEFAULT_TOPICS.map((t) => ({ ...t }));
  state.lastSync = meta?.lastSync || null;
  state.settings = loadSettings();
  emit();
}

export async function persist() {
  await Promise.all([
    idbSet('notes', state.notes),
    idbSet('topics', state.topics),
    idbSet('meta', { lastSync: state.lastSync }),
  ]);
}

export function liveNotes() {
  return state.notes.filter((n) => !n.deletedAt);
}

export function findByUrl(url) {
  return liveNotes().find((n) => n.url === url);
}

export async function addNote(input) {
  const now = new Date().toISOString();
  const base = classify({
    id: newId(),
    url: input.url || '',
    title: input.title || '',
    note: input.note || '',
    tags: input.tags || [],
    manualTopics: input.manualTopics || [],
    fav: false,
    status: 'inbox',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    dirty: true,
    device: state.settings.device,
  }, state.topics);
  const existing = base.url ? findByUrl(base.url) : null;
  if (existing) {
    return updateNote(existing.id, {
      note: [existing.note, base.note].filter(Boolean).join('\n'),
      title: existing.title || base.title,
    });
  }
  state.notes.unshift(base);
  await persist();
  emit();
  return base;
}

export async function updateNote(id, patch) {
  const idx = state.notes.findIndex((n) => n.id === id);
  if (idx === -1) return null;
  const merged = classify({
    ...state.notes[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
    dirty: true,
  }, state.topics);
  state.notes[idx] = merged;
  await persist();
  emit();
  return merged;
}

export async function removeNote(id) {
  const idx = state.notes.findIndex((n) => n.id === id);
  if (idx === -1) return;
  const now = new Date().toISOString();
  state.notes[idx] = { ...state.notes[idx], deletedAt: now, updatedAt: now, dirty: true };
  await persist();
  emit();
}

export async function restoreNote(id) {
  const idx = state.notes.findIndex((n) => n.id === id);
  if (idx === -1) return;
  const now = new Date().toISOString();
  state.notes[idx] = { ...state.notes[idx], deletedAt: null, updatedAt: now, dirty: true };
  await persist();
  emit();
}

// Swaps in a new rule set and re-derives every note. Only notes whose derived
// fields actually moved are marked dirty, so pulling unchanged rules from the
// repo does not trigger a pointless full re-upload.
export function applyTopics(topics) {
  state.topics = topics;
  let changed = 0;
  state.notes = state.notes.map((n) => {
    if (n.deletedAt) return n;
    const re = classify(n, topics);
    const same = re.kind === n.kind
      && JSON.stringify(re.topics) === JSON.stringify(n.topics)
      && JSON.stringify(re.tags) === JSON.stringify(n.tags);
    if (same) return n;
    changed += 1;
    return { ...re, updatedAt: new Date().toISOString(), dirty: true };
  });
  return changed;
}

// Merge remote notes into local state. Newest updatedAt wins; ties keep local.
export function mergeRemote(remoteNotes) {
  const byId = new Map(state.notes.map((n) => [n.id, n]));
  let changed = 0;
  for (const remote of remoteNotes) {
    if (!remote || !remote.id) continue;
    const local = byId.get(remote.id);
    if (!local) {
      byId.set(remote.id, { ...remote, dirty: false });
      changed += 1;
      continue;
    }
    const localTime = Date.parse(local.updatedAt || 0) || 0;
    const remoteTime = Date.parse(remote.updatedAt || 0) || 0;
    if (remoteTime > localTime) {
      byId.set(remote.id, { ...remote, dirty: false });
      changed += 1;
    }
  }
  state.notes = [...byId.values()].sort(
    (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
  );
  return changed;
}

export function dirtyMonths() {
  const months = new Set();
  for (const n of state.notes) {
    if (n.dirty) months.add(monthKey(n.createdAt));
  }
  return [...months];
}

export function notesForMonth(month) {
  return state.notes.filter((n) => monthKey(n.createdAt) === month);
}

export async function markClean(ids) {
  const set = new Set(ids);
  state.notes = state.notes.map((n) => (set.has(n.id) ? { ...n, dirty: false } : n));
  await persist();
}

// Fields written to the repo. `dirty` is a local-only flag.
export function serializeNote(n) {
  const rest = { ...n };
  delete rest.dirty;
  return rest;
}

// Exposed for the desktop dashboard, which caches its last GitHub pull in the
// same database so it renders instantly and still works offline.
export { idbGet, idbSet };
