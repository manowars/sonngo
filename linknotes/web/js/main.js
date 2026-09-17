import {
  state, load, subscribe, saveSettings, loadSettings,
  addNote, updateNote, removeNote, liveNotes,
} from './store.js';
import { sync, isConfigured, verifyAccess, pushTopics } from './github.js';
import { extractUrl, extractUrlMatch, normalizeUrl, classify } from './classify.js';
import {
  renderChips, renderList, renderStats, groupNotes, matchesFilter, matchesQuery,
  setFaviconMode,
} from './ui.js';

const $ = (id) => document.getElementById(id);
const ui = {
  filter: 'all',
  query: '',
  groupBy: 'date',
  editing: null,
  pinned: [],
};

/* ---------------- toast ---------------- */
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------------- render ---------------- */
function render() {
  setFaviconMode(state.settings.favicons !== false);
  const notes = liveNotes();
  renderChips($('filterChips'), notes, state.topics, ui.filter);
  const filtered = notes.filter((n) => matchesFilter(n, ui.filter) && matchesQuery(n, ui.query));
  renderList($('list'), groupNotes(filtered, ui.groupBy, state.topics), state.topics, notes.length);
  renderStats($('stats'), notes, state.topics, state.lastSync);

  renderBanner(notes);

  const pill = $('syncPill');
  pill.dataset.status = state.syncStatus;
  const pending = notes.filter((n) => n.dirty).length;
  $('syncText').textContent = state.syncMessage
    || (state.lastSync ? `Đồng bộ ${new Date(state.lastSync).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : 'Chưa đồng bộ')
    + (pending ? ` · ${pending} chờ` : '');
}
subscribe(render);

// Notes that live only on this device are the single most confusing state in
// the app — you save something, and nothing downstream ever sees it. Say so
// plainly instead of leaving a small number in the header pill.
function renderBanner(notes) {
  const banner = $('banner');
  const pending = notes.filter((n) => n.dirty).length;
  const configured = isConfigured();

  let tone = 'warn';
  let text = '';
  let action = '';
  let onAction = null;

  if (!configured && notes.length) {
    text = `${pending || notes.length} note mới chỉ nằm trên máy này — chưa kết nối GitHub nên máy tính và dashboard không thấy được.`;
    action = 'Kết nối';
    onAction = openSettings;
  } else if (configured && state.syncStatus === 'error') {
    tone = 'error';
    text = `Đồng bộ lỗi: ${state.syncMessage}${pending ? ` · ${pending} note đang chờ.` : ''}`;
    action = 'Thử lại';
    onAction = () => sync();
  } else if (configured && pending && !navigator.onLine) {
    text = `Đang offline · ${pending} note sẽ tự đẩy lên khi có mạng.`;
    action = 'Thử lại';
    onAction = () => sync();
  } else if (configured && pending && state.syncStatus !== 'syncing') {
    text = `${pending} note chưa lên GitHub.`;
    action = 'Đồng bộ';
    onAction = () => sync();
  }

  banner.hidden = !text;
  if (!text) return;
  banner.dataset.tone = tone;
  $('bannerText').textContent = text;
  const btn = $('bannerAction');
  btn.textContent = action;
  btn.onclick = onAction;
}

/* ---------------- metadata ---------------- */
async function fetchMeta(url) {
  const s = state.settings;
  if (!s.fetchMeta || !navigator.onLine || !url) return null;
  const endpoint = s.metaEndpoint || '/.netlify/functions/meta';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${endpoint}?url=${encodeURIComponent(url)}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.title ? data : null;
  } catch {
    return null;
  }
}

async function enrich(noteId, url) {
  const meta = await fetchMeta(url);
  if (!meta) return;
  const note = state.notes.find((n) => n.id === noteId);
  if (!note || note.deletedAt) return;
  const autoTitle = classify({ ...note, title: '' }, state.topics).title;
  const shouldReplace = !note.title || note.title === autoTitle;
  await updateNote(noteId, {
    title: shouldReplace ? meta.title : note.title,
    meta: { description: meta.description || '', image: meta.image || '', siteName: meta.siteName || '' },
  });
}

/* ---------------- add ---------------- */
async function quickAdd(text) {
  const raw = String(text || '').trim();
  if (!raw) return;
  const match = extractUrlMatch(raw);
  let payload;
  if (match) {
    const note = raw.replace(match.raw, '').replace(/^\s*[-–—:|]\s*/, '').trim();
    payload = { url: match.url, note, title: '' };
  } else if (raw.length <= 120) {
    payload = { url: '', note: '', title: raw };
  } else {
    payload = { url: '', note: raw, title: `${raw.slice(0, 110).trim()}…` };
  }
  const created = await addNote(payload);
  toast(match ? 'Đã lưu link' : 'Đã lưu ghi chú');
  if (match) enrich(created.id, match.url);
  maybeAutoSync();
  return created;
}

let syncDebounce = null;
function maybeAutoSync() {
  if (!state.settings.autoSync || !isConfigured()) return;
  clearTimeout(syncDebounce);
  syncDebounce = setTimeout(() => { sync({ silent: true }); }, 4000);
}

/* ---------------- edit sheet ---------------- */
function openEdit(note) {
  ui.editing = note ? note.id : null;
  ui.pinned = note ? [...(note.manualTopics || [])] : [];
  $('editTitle').textContent = note ? 'Sửa link' : 'Link mới';
  $('fUrl').value = note ? note.url : '';
  $('fTitle').value = note ? note.title : '';
  $('fNote').value = note ? note.note : '';
  $('metaHint').textContent = '';
  renderTopicPickers();
  $('editSheet').showModal();
  if (!note) setTimeout(() => $('fUrl').focus(), 60);
}

function renderTopicPickers() {
  $('topicPickers').innerHTML = state.topics.map((t) => `
    <button type="button" class="chip" data-topic="${t.id}" aria-pressed="${ui.pinned.includes(t.id)}">
      <span class="swatch" style="background:${t.color}"></span>${t.label}
    </button>`).join('');
}

async function saveEdit() {
  const url = normalizeUrl($('fUrl').value);
  const payload = {
    url,
    title: $('fTitle').value.trim(),
    note: $('fNote').value.trim(),
    manualTopics: ui.pinned,
  };
  if (!payload.url && !payload.note && !payload.title) {
    toast('Cần ít nhất một link hoặc ghi chú');
    return;
  }
  let id = ui.editing;
  if (id) {
    await updateNote(id, payload);
  } else {
    const created = await addNote(payload);
    id = created.id;
  }
  $('editSheet').close();
  toast('Đã lưu');
  if (payload.url && !payload.title) enrich(id, payload.url);
  maybeAutoSync();
}

/* ---------------- settings sheet ---------------- */
function openSettings() {
  const s = loadSettings();
  $('sOwner').value = s.owner;
  $('sRepo').value = s.repo;
  $('sBranch').value = s.branch;
  $('sPath').value = s.path;
  $('sToken').value = s.token;
  $('sAutoSync').checked = s.autoSync;
  $('sFetchMeta').checked = s.fetchMeta;
  $('sFavicons').checked = s.favicons !== false;
  $('sTheme').value = s.theme;
  renderStats($('stats'), liveNotes(), state.topics, state.lastSync);
  $('settingsSheet').showModal();
}

function collectSettings() {
  return {
    owner: $('sOwner').value.trim(),
    repo: $('sRepo').value.trim(),
    branch: $('sBranch').value.trim() || 'main',
    path: $('sPath').value.trim() || 'linknotes/data',
    token: $('sToken').value.trim(),
    autoSync: $('sAutoSync').checked,
    fetchMeta: $('sFetchMeta').checked,
    favicons: $('sFavicons').checked,
    theme: $('sTheme').value,
  };
}

function applyTheme(theme) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

/* ---------------- share target ---------------- */
const seenShares = new Set();

function consumeShareParams() {
  const p = new URLSearchParams(location.search);
  const text = [p.get('url'), p.get('text'), p.get('title')].filter(Boolean).join(' ');
  if (!text) return;
  history.replaceState(null, '', location.pathname);
  quickAdd(text);
}

function drainAndroidShares() {
  const queue = window.__shareQueue || [];
  while (queue.length) {
    const item = queue.shift();
    const token = item.token || `${item.text}|${item.subject}`;
    if (seenShares.has(token)) continue;
    seenShares.add(token);
    const text = [item.text, item.subject].filter(Boolean).join(' ');
    if (text.trim()) quickAdd(text);
  }
}
window.__onShare = drainAndroidShares;

/* ---------------- events ---------------- */
function wire() {
  $('quickForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('quickInput');
    await quickAdd(input.value);
    input.value = '';
    input.blur();
  });

  $('fab').addEventListener('click', async () => {
    let prefill = '';
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const t = await navigator.clipboard.readText();
        if (extractUrl(t)) prefill = extractUrl(t);
      }
    } catch { /* clipboard denied */ }
    openEdit(null);
    if (prefill) $('fUrl').value = prefill;
  });

  $('filterChips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    ui.filter = ui.filter === btn.dataset.filter ? 'all' : btn.dataset.filter;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  let searchTimer = null;
  $('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const v = e.target.value;
    searchTimer = setTimeout(() => { ui.query = v; render(); }, 180);
  });

  $('groupBy').addEventListener('change', (e) => { ui.groupBy = e.target.value; render(); });

  $('list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = e.target.closest('.card').dataset.id;
    const note = state.notes.find((n) => n.id === id);
    if (!note) return;
    const act = btn.dataset.act;
    if (act === 'star') { await updateNote(id, { fav: !note.fav }); maybeAutoSync(); }
    if (act === 'edit') openEdit(note);
    if (act === 'copy') {
      try { await navigator.clipboard.writeText(note.url || note.note); toast('Đã chép'); }
      catch { toast('Không chép được'); }
    }
    if (act === 'del') {
      if (confirm('Xoá link này?')) { await removeNote(id); toast('Đã xoá'); maybeAutoSync(); }
    }
  });

  $('topicPickers').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-topic]');
    if (!btn) return;
    const id = btn.dataset.topic;
    ui.pinned = ui.pinned.includes(id) ? ui.pinned.filter((t) => t !== id) : [...ui.pinned, id];
    renderTopicPickers();
  });

  $('saveNote').addEventListener('click', saveEdit);
  $('btnSettings').addEventListener('click', openSettings);
  $('syncPill').addEventListener('click', async () => {
    const r = await sync();
    if (r.ok) toast(`Đồng bộ xong: ${r.pulled} về, ${r.pushed} đi`);
    else if (r.reason === 'not-configured') { toast('Hãy cấu hình GitHub trước'); openSettings(); }
  });

  $('btnSaveSettings').addEventListener('click', async () => {
    const next = collectSettings();
    state.settings = saveSettings(next);
    applyTheme(next.theme);
    $('settingsSheet').close();
    toast('Đã lưu cài đặt');
    const r = await sync();
    if (r.ok) toast(`Đồng bộ xong: ${r.pulled} về, ${r.pushed} đi`);
    else if (r.error) toast(r.error);
  });

  $('btnTest').addEventListener('click', async () => {
    state.settings = saveSettings(collectSettings());
    if (!isConfigured()) { toast('Thiếu owner / repo / token'); return; }
    try {
      const info = await verifyAccess();
      toast(info.private ? '✅ OK — repo private, an toàn' : '⚠️ OK nhưng repo đang PUBLIC');
    } catch (err) {
      toast(`❌ ${err.message}`);
    }
  });

  $('btnPushTopics').addEventListener('click', async () => {
    if (!isConfigured()) { toast('Cấu hình GitHub trước đã'); return; }
    try { await pushTopics(); toast('Đã đẩy topics.json'); }
    catch (err) { toast(err.message); }
  });

  $('btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), topics: state.topics, items: state.notes }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `linknotes-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });

  for (const btn of document.querySelectorAll('[data-close]')) {
    btn.addEventListener('click', () => btn.closest('dialog').close());
  }

  window.addEventListener('scroll', () => {
    $('topbar').classList.toggle('scrolled', window.scrollY > 4);
  }, { passive: true });

  const syncTopbarHeight = () => {
    document.documentElement.style.setProperty('--topbar-h', `${$('topbar').offsetHeight}px`);
  };
  syncTopbarHeight();
  if (window.ResizeObserver) new ResizeObserver(syncTopbarHeight).observe($('topbar'));
  window.addEventListener('resize', syncTopbarHeight, { passive: true });

  window.addEventListener('online', () => { if (state.settings.autoSync) sync({ silent: true }); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { drainAndroidShares(); if (state.settings.autoSync) sync({ silent: true }); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      $('searchInput').focus();
    }
  });
}

/* ---------------- boot ---------------- */
async function boot() {
  await load();
  applyTheme(state.settings.theme);
  wire();
  render();
  consumeShareParams();
  drainAndroidShares();
  if (state.settings.autoSync && isConfigured()) sync({ silent: true });
  if (!isConfigured()) setTimeout(() => { if (!liveNotes().length) openSettings(); }, 700);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode optional */ });
  }
}

boot();
