import {
  pullFromGitHub, loadCached, fromJsonFiles, settings, isConfigured,
  applyFilters, countBy, rank, daySeries, weekSeries, topicsByMonth, RANGES,
} from './data.js';
import {
  trendChart, calendarHeatmap, stackedColumns, barList, partToWhole,
  sparkline, legend, table, token, inkOn,
} from './charts.js';
import { buildDigest, buildPrompt } from './digest.js';
import { KIND_META, dayKey } from '../classify.js';
import { saveSettings } from '../store.js';

const $ = (id) => document.getElementById(id);
const DAY = 86400000;

const ui = { range: '90', topic: 'all', kind: 'all', query: '', sort: 'new', page: 1 };
const PAGE = 50;
let data = null;
let slice = [];

/* ---------------- helpers ---------------- */

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

const fmt = (n) => n.toLocaleString('vi-VN');

// Slot colours are assigned by the entity's stable position, never by current
// rank, so filtering never repaints the survivors.
const SLOT_VARS = ['--viz-s1', '--viz-s2', '--viz-s3', '--viz-s4', '--viz-s5', '--viz-s6', '--viz-s7', '--viz-s8'];

// Keeps at most 8 coloured slots; the tail folds into "Khác".
//
// Membership and colour are decided once from the WHOLE dataset, never from the
// current slice — so a filter never re-seats a category or repaints a survivor.
function buildSlots(order, labelFor) {
  const head = order.slice(0, order.length > 8 ? 7 : 8);
  const slots = head.map((id, i) => ({ id, label: labelFor(id), color: token(SLOT_VARS[i]) }));
  const tail = order.slice(head.length);
  if (tail.length) {
    // A residual bucket is not an identity, so it takes the de-emphasis gray
    // rather than a categorical hue.
    slots.push({ id: '__other', label: 'Khác', color: token('--viz-axis'), members: tail });
  }
  return slots;
}

// Called once per dataset load (and again on a theme change, since the colours
// are read from CSS custom properties).
function computeSlotOrder() {
  const labelForTopic = new Map(data.topics.map((t) => [t.id, t.label]));
  const topicCounts = countBy(data.items, (i) => i.topics || []);
  const topicOrder = data.topics.map((t) => t.id)
    .filter((id) => topicCounts.has(id))
    .sort((a, b) => (topicCounts.get(b) || 0) - (topicCounts.get(a) || 0));

  const kindCounts = countBy(data.items, (i) => i.kind);
  const kindOrder = [...kindCounts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([k]) => k);

  data.topicSlots = buildSlots(topicOrder, (id) => labelForTopic.get(id) || id);
  data.kindSlots = buildSlots(kindOrder, (id) => (KIND_META[id] || KIND_META.link).label)
    .map((s) => ({ ...s, ink: inkOn(s.color) }));
}

function foldRows(rows, slots) {
  const other = slots.find((s) => s.id === '__other');
  if (!other) return rows;
  return rows.map((row) => {
    const values = new Map(row.values);
    let sum = 0;
    for (const id of other.members) { sum += values.get(id) || 0; values.delete(id); }
    if (sum) values.set('__other', sum);
    return { ...row, values };
  });
}

/* ---------------- render ---------------- */

function render() {
  if (!data) return;
  slice = applyFilters(data.items, ui);
  const rangeMeta = RANGES.find((r) => r.id === ui.range) || RANGES[2];

  $('sliceCount').textContent = `${fmt(slice.length)} / ${fmt(data.items.length)} link`;
  $('source').textContent = data.source
    ? `${data.source} · tải lúc ${new Date(data.pulledAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
    : '';

  const hint = $('emptyHint');
  if (!data.items.length) {
    hint.hidden = false;
    hint.textContent = '';
    const p = document.createElement('p');
    p.style.margin = '0';
    const b = document.createElement('b');
    b.textContent = 'Kho note đang trống.';
    p.append(b, document.createTextNode(
      ' Không có file YYYY-MM.json nào trong thư mục dữ liệu, nên chưa có gì để vẽ.'
      + ' Thường là vì điện thoại chưa đẩy note lên:'));
    const ol = document.createElement('ol');
    for (const step of [
      'Mở app ghi link trên điện thoại và xem thanh cảnh báo / nút đồng bộ ở đầu màn hình.',
      'Nếu đó là APK: APK chạy ở một origin riêng, không dùng chung cấu hình với web — phải điền GitHub trong ⚙️ của chính APK.',
      'Kiểm tra repo, branch và thư mục dữ liệu ở đây khớp với cấu hình trong app.',
    ]) {
      const li = document.createElement('li');
      li.textContent = step;
      ol.appendChild(li);
    }
    p.appendChild(ol);
    hint.appendChild(p);
  } else {
    hint.hidden = true;
  }

  renderHeroAndKpis(rangeMeta);
  renderTrend(rangeMeta);
  renderCalendar(rangeMeta);
  renderTopics();
  renderKinds();
  renderDomains();
  renderTags();
  renderDigest(rangeMeta);
  ui.page = 1;
  renderNotes();
}

function daysSinceOldest() {
  const oldest = data.items.reduce((min, i) => Math.min(min, Date.parse(i.createdAt) || Infinity), Infinity);
  if (!Number.isFinite(oldest)) return 56;
  return Math.ceil((Date.now() - oldest) / DAY);
}

function sliceBounds(rangeMeta) {
  const to = new Date();
  let from;
  if (rangeMeta.days) {
    from = new Date(Date.now() - (rangeMeta.days - 1) * DAY);
  } else {
    const oldest = data.items.reduce((min, i) => Math.min(min, Date.parse(i.createdAt) || Infinity), Infinity);
    from = new Date(Number.isFinite(oldest) ? oldest : Date.now());
  }
  return { from, to };
}

function renderHeroAndKpis(rangeMeta) {
  $('heroValue').textContent = fmt(slice.length);
  const { from, to } = sliceBounds(rangeMeta);
  const starred = slice.filter((i) => i.fav).length;
  $('heroSub').textContent = `${from.toLocaleDateString('vi-VN')} → ${to.toLocaleDateString('vi-VN')}`
    + (starred ? ` · ${fmt(starred)} đã ghim` : '');

  const days = daySeries(slice, from, to);
  const perWeek = days.length / 7;
  const last7 = data.items.filter((i) => Date.now() - (Date.parse(i.createdAt) || 0) < 7 * DAY).length;
  const prev7 = data.items.filter((i) => {
    const age = Date.now() - (Date.parse(i.createdAt) || 0);
    return age >= 7 * DAY && age < 14 * DAY;
  }).length;
  const delta = last7 - prev7;

  const tiles = [
    {
      k: '7 ngày qua', v: last7,
      d: prev7 || last7 ? `${delta >= 0 ? '+' : ''}${delta} so với tuần trước` : '',
      dir: delta > 0 ? 'up' : delta < 0 ? 'down' : '',
      spark: weekSeries(daySeries(data.items, new Date(Date.now() - 83 * DAY), new Date())).map((w) => w.value),
    },
    { k: 'Trung bình mỗi tuần', v: perWeek ? Math.round((slice.length / perWeek) * 10) / 10 : 0 },
    { k: 'Chưa phân loại', v: slice.filter((i) => !(i.topics || []).length).length },
    { k: 'Nguồn khác nhau', v: new Set(slice.map((i) => i.domain).filter(Boolean)).size },
  ];

  const host = $('kpis');
  host.textContent = '';
  for (const t of tiles) {
    const card = document.createElement('div');
    card.className = 'kpi';
    const k = document.createElement('div'); k.className = 'k'; k.textContent = t.k;
    const v = document.createElement('div'); v.className = 'v'; v.textContent = fmt(t.v);
    card.append(k, v);
    if (t.d) {
      const d = document.createElement('div');
      d.className = `d ${t.dir}`.trim();
      d.textContent = t.d;
      card.appendChild(d);
    }
    if (t.spark && t.spark.length > 1) {
      const s = document.createElement('div');
      s.className = 'spark';
      card.appendChild(s);
      sparkline(s, t.spark);
    }
    host.appendChild(card);
  }
}

function renderTrend(rangeMeta) {
  const { from, to } = sliceBounds(rangeMeta);
  const days = daySeries(slice, from, to);
  const useWeeks = days.length > 120;
  const points = useWeeks ? weekSeries(days) : days;
  $('trendSub').textContent = useWeeks ? 'Số link lưu mỗi tuần' : 'Số link lưu mỗi ngày';
  trendChart($('trendPlot'), points, { label: 'link' });
  table($('trendTable'),
    [{ label: useWeeks ? 'Tuần bắt đầu' : 'Ngày' }, { label: 'Link', numeric: true }],
    points.filter((p) => p.value > 0).reverse()
      .map((p) => ({ cells: [p.date.toLocaleDateString('vi-VN'), fmt(p.value)] })));
}

function renderCalendar(rangeMeta) {
  // The filter row scopes every card, so the calendar window tracks it too —
  // clamped to whole weeks between ~8 and 52 so the grid stays readable.
  const span = Math.min(364, Math.max(56, (rangeMeta.days || Infinity) === Infinity
    ? daysSinceOldest() : rangeMeta.days));
  const to = new Date();
  const from = new Date(Date.now() - (Math.ceil(span / 7) * 7 - 1) * DAY);
  const days = daySeries(slice, from, to);
  const ramp = ['--viz-q1', '--viz-q2', '--viz-q3', '--viz-q4', '--viz-q5'];
  calendarHeatmap($('calPlot'), days, ramp);

  const lg = $('calLegend');
  lg.textContent = '';
  const less = document.createElement('span'); less.textContent = 'ít';
  lg.appendChild(less);
  const empty = document.createElement('i');
  empty.style.background = token('--viz-grid');
  lg.appendChild(empty);
  for (const step of ramp) {
    const i = document.createElement('i');
    i.style.background = token(step);
    lg.appendChild(i);
  }
  const more = document.createElement('span'); more.textContent = 'nhiều';
  lg.appendChild(more);

  table($('calTable'), [{ label: 'Ngày' }, { label: 'Link', numeric: true }],
    days.filter((d) => d.value > 0).reverse()
      .map((d) => ({ cells: [d.date.toLocaleDateString('vi-VN'), fmt(d.value)] })));
}

function renderTopics() {
  const rows0 = topicsByMonth(slice, data.topics);
  const all = [...data.topicSlots, { id: '__none', label: 'Chưa phân loại', color: token('--viz-axis') }];
  const rows = foldRows(rows0, all);

  // Show only the slots present in this slice; the survivors keep their colour.
  const used = new Set();
  for (const r of rows) for (const [k, v] of r.values) if (v) used.add(k);
  const slots = all.filter((s) => used.has(s.id));

  legend($('topicLegend'), slots);
  stackedColumns($('topicPlot'), rows, slots);

  table($('topicTable'),
    [{ label: 'Tháng' }, ...slots.map((s) => ({ label: s.label, numeric: true })), { label: 'Tổng', numeric: true }],
    rows.slice().reverse().map((r) => ({
      cells: [r.month, ...slots.map((s) => fmt(r.values.get(s.id) || 0)), fmt(r.total)],
    })));
}

function renderKinds() {
  const counts = countBy(slice, (i) => i.kind);
  const withValues = data.kindSlots.map((s) => ({
    ...s,
    value: s.id === '__other'
      ? s.members.reduce((sum, id) => sum + (counts.get(id) || 0), 0)
      : counts.get(s.id) || 0,
  })).filter((s) => s.value > 0);

  legend($('kindLegend'), withValues);
  partToWhole($('kindPlot'), withValues);

  const total = withValues.reduce((s, x) => s + x.value, 0) || 1;
  table($('kindTable'),
    [{ label: 'Loại' }, { label: 'Link', numeric: true }, { label: 'Tỉ lệ', numeric: true }],
    withValues.map((s) => ({
      color: s.color,
      cells: [s.label, fmt(s.value), `${Math.round((s.value / total) * 100)}%`],
    })));
}

function renderDomains() {
  const entries = rank(countBy(slice, (i) => i.domain), 12);
  barList($('domainPlot'), entries, { color: '--viz-s1' });
  table($('domainTable'), [{ label: 'Nguồn' }, { label: 'Link', numeric: true }],
    entries.map(([k, v]) => ({ cells: [k, fmt(v)] })));
}

function renderTags() {
  const entries = rank(countBy(slice, (i) => i.tags || []), 12);
  const host = $('tagPlot');
  if (!entries.length) {
    host.textContent = '';
    const p = document.createElement('p');
    p.className = 'empty-note';
    p.textContent = 'Chưa có #tag nào trong phạm vi này.';
    host.appendChild(p);
  } else {
    barList(host, entries, { color: '--viz-s3', formatLabel: (k) => `#${k}` });
  }
  table($('tagTable'), [{ label: 'Tag' }, { label: 'Link', numeric: true }],
    entries.map(([k, v]) => ({ cells: [`#${k}`, fmt(v)] })));
}

function filterNote() {
  const bits = [];
  if (ui.topic !== 'all') {
    const t = data.topics.find((x) => x.id === ui.topic);
    bits.push(`topic: ${ui.topic === '__none' ? 'chưa phân loại' : (t ? t.label : ui.topic)}`);
  }
  if (ui.kind !== 'all') bits.push(`loại: ${(KIND_META[ui.kind] || KIND_META.link).label}`);
  if (ui.query.trim()) bits.push(`tìm: "${ui.query.trim()}"`);
  return bits.join(' · ');
}

function renderDigest(rangeMeta) {
  $('digest').textContent = buildDigest(slice, data.topics, {
    rangeLabel: rangeMeta.label, filterNote: filterNote(),
  });
}

function sortedSlice() {
  const arr = slice.slice();
  const t = (x) => Date.parse(x.createdAt) || 0;
  if (ui.sort === 'new') arr.sort((a, b) => t(b) - t(a));
  if (ui.sort === 'old') arr.sort((a, b) => t(a) - t(b));
  if (ui.sort === 'title') arr.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'vi'));
  if (ui.sort === 'domain') arr.sort((a, b) => (a.domain || '').localeCompare(b.domain || ''));
  return arr;
}

function renderNotes() {
  const all = sortedSlice();
  const rows = all.slice(0, ui.page * PAGE);
  $('listSub').textContent = `Hiện ${fmt(rows.length)} / ${fmt(all.length)} link`;
  $('btnMore').hidden = rows.length >= all.length;

  const labelFor = new Map(data.topics.map((t) => [t.id, t.label]));
  const host = $('notesTable');
  host.textContent = '';
  if (!rows.length) {
    const p = document.createElement('p');
    p.className = 'empty-note';
    p.textContent = 'Không có link nào khớp bộ lọc.';
    host.appendChild(p);
    return;
  }

  const t = document.createElement('table');
  t.className = 'viz-table';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const h of ['Ngày', 'Tiêu đề', 'Nguồn', 'Loại', 'Topic', 'Ghi chú']) {
    const th = document.createElement('th');
    th.textContent = h;
    hr.appendChild(th);
  }
  thead.appendChild(hr);

  const tbody = document.createElement('tbody');
  for (const n of rows) {
    const tr = document.createElement('tr');

    const date = document.createElement('td');
    date.textContent = String(n.createdAt || '').slice(0, 10);
    date.className = 'num';

    const title = document.createElement('td');
    if (n.url) {
      const a = document.createElement('a');
      a.href = n.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = n.title || n.url;   // untrusted text never goes through innerHTML
      title.appendChild(a);
    } else {
      title.textContent = n.title || '';
    }
    if (n.fav) title.appendChild(document.createTextNode(' ⭐'));

    const domain = document.createElement('td');
    domain.textContent = n.domain || '';

    const kind = document.createElement('td');
    const meta = KIND_META[n.kind] || KIND_META.link;
    kind.textContent = `${meta.icon} ${meta.label}`;

    const topics = document.createElement('td');
    topics.textContent = (n.topics || []).map((id) => labelFor.get(id) || id).join(', ');

    const note = document.createElement('td');
    note.className = 'cell-note';
    note.textContent = [n.note, (n.tags || []).map((x) => `#${x}`).join(' ')].filter(Boolean).join(' ');

    tr.append(date, title, domain, kind, topics, note);
    tbody.appendChild(tr);
  }
  t.append(thead, tbody);
  host.appendChild(t);
}

/* ---------------- controls ---------------- */

function buildFilterControls() {
  const seg = $('rangeSeg');
  seg.textContent = '';
  for (const r of RANGES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = r.label;
    b.setAttribute('aria-pressed', String(r.id === ui.range));
    b.addEventListener('click', () => {
      ui.range = r.id;
      for (const other of seg.children) other.setAttribute('aria-pressed', String(other === b));
      render();
    });
    seg.appendChild(b);
  }

  const topicSel = $('fTopic');
  topicSel.textContent = '';
  const mkOption = (value, label) => {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    return o;
  };
  topicSel.append(mkOption('all', 'Tất cả'));
  for (const t of data.topics) topicSel.append(mkOption(t.id, t.label));
  topicSel.append(mkOption('__none', 'Chưa phân loại'));

  const kindSel = $('fKind');
  kindSel.textContent = '';
  kindSel.append(mkOption('all', 'Tất cả'));
  for (const k of [...new Set(data.items.map((i) => i.kind))].filter(Boolean).sort()) {
    kindSel.append(mkOption(k, (KIND_META[k] || KIND_META.link).label));
  }

  // Rebuilding the options resets the control, so re-apply the active filter —
  // and drop it if the new dataset no longer offers that value.
  if (![...topicSel.options].some((o) => o.value === ui.topic)) ui.topic = 'all';
  if (![...kindSel.options].some((o) => o.value === ui.kind)) ui.kind = 'all';
  topicSel.value = ui.topic;
  kindSel.value = ui.kind;
  $('fSearch').value = ui.query;
}

function wire() {
  $('fTopic').addEventListener('change', (e) => { ui.topic = e.target.value; render(); });
  $('fKind').addEventListener('change', (e) => { ui.kind = e.target.value; render(); });

  let timer = null;
  $('fSearch').addEventListener('input', (e) => {
    clearTimeout(timer);
    const v = e.target.value;
    timer = setTimeout(() => { ui.query = v; render(); }, 200);
  });

  $('sortBy').addEventListener('change', (e) => { ui.sort = e.target.value; ui.page = 1; renderNotes(); });
  $('btnMore').addEventListener('click', () => { ui.page += 1; renderNotes(); });

  for (const btn of document.querySelectorAll('.toggle[data-table]')) {
    btn.addEventListener('click', () => {
      const card = btn.closest('.card');
      const tableEl = card.querySelector('.table-twin');
      const plots = card.querySelectorAll('.plot, .legend, .scale-legend');
      const showTable = tableEl.hidden;
      tableEl.hidden = !showTable;
      for (const p of plots) p.hidden = showTable;
      btn.setAttribute('aria-pressed', String(showTable));
      btn.textContent = showTable ? 'Biểu đồ' : 'Bảng';
    });
  }

  $('btnCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('digest').textContent); toast('Đã chép bản tổng hợp'); }
    catch { toast('Trình duyệt chặn clipboard — hãy bôi đen và chép tay'); }
  });

  $('btnCopyPrompt').addEventListener('click', async () => {
    const rangeMeta = RANGES.find((r) => r.id === ui.range) || RANGES[2];
    const text = buildPrompt(slice, rangeMeta.label) + $('digest').textContent;
    try { await navigator.clipboard.writeText(text); toast('Đã chép prompt + tổng hợp'); }
    catch { toast('Trình duyệt chặn clipboard'); }
  });

  $('btnDownload').addEventListener('click', () => {
    const blob = new Blob([$('digest').textContent], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `linknotes-tong-hop-${dayKey(new Date().toISOString())}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });

  $('btnRefresh').addEventListener('click', () => refresh(true));
  $('staleRetry').addEventListener('click', () => refresh(true));

  // Charts are drawn at the container's pixel width, so a resize needs a redraw.
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (data && !$('main').hidden) render(); }, 160);
  }, { passive: true });

  $('btnTheme').addEventListener('click', () => {
    const root = document.documentElement;
    const now = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = now;
    saveSettings({ theme: now });
    // Charts read colours from CSS custom properties, so the slots are re-read.
    if (data) { computeSlotOrder(); render(); }
  });

  $('btnConnect').addEventListener('click', async () => {
    saveSettings({
      owner: $('sOwner').value.trim(),
      repo: $('sRepo').value.trim(),
      branch: $('sBranch').value.trim() || 'main',
      path: $('sPath').value.trim() || 'linknotes/data',
      token: $('sToken').value.trim(),
    });
    await refresh(true);
  });

  const drop = $('drop');
  const input = $('fileInput');
  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => readFiles([...input.files]));
  for (const ev of ['dragenter', 'dragover']) {
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
  }
  for (const ev of ['dragleave', 'drop']) {
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); });
  }
  drop.addEventListener('drop', (e) => readFiles([...(e.dataTransfer?.files || [])]));
}

async function readFiles(files) {
  const json = [];
  for (const f of files) {
    try { json.push(JSON.parse(await f.text())); }
    catch { showSetupError(`${f.name} không phải JSON hợp lệ.`); return; }
  }
  try {
    data = fromJsonFiles(json);
    showDashboard();
  } catch (err) {
    showSetupError(err.message);
  }
}

/* ---------------- boot ---------------- */

// A failed refresh leaves the previous pull on screen; without this the
// dashboard is indistinguishable from one that is simply up to date.
function showStale(msg) {
  const bar = $('staleBar');
  bar.hidden = !msg;
  if (!msg) return;
  const when = data && data.pulledAt
    ? new Date(data.pulledAt).toLocaleString('vi-VN') : 'trước đó';
  $('staleText').textContent = `Không tải lại được từ GitHub: ${msg} — đang hiển thị bản đã lưu lúc ${when}.`;
}

function showSetupError(msg) {
  const el = $('setupErr');
  el.textContent = msg;
  el.hidden = !msg;
}

function showDashboard() {
  $('setup').hidden = true;
  $('filters').hidden = false;
  $('main').hidden = false;
  computeSlotOrder();
  buildFilterControls();
  render();
}

function showSetup() {
  const s = settings();
  $('sOwner').value = s.owner;
  $('sRepo').value = s.repo;
  $('sBranch').value = s.branch;
  $('sPath').value = s.path;
  $('sToken').value = s.token;
  $('setup').hidden = false;
}

async function refresh(explicit) {
  if (!isConfigured()) {
    if (explicit) showSetupError('Thiếu owner / repo / token.');
    return false;
  }
  const btn = $('btnRefresh');
  btn.disabled = true;
  btn.textContent = 'Đang tải…';
  // Keep the previous render on screen while refetching — no skeleton, no jump.
  $('main').style.opacity = data ? '.55' : '';
  try {
    data = await pullFromGitHub();
    showSetupError('');
    showStale('');
    showDashboard();
    if (explicit) toast(`Đã tải ${data.items.length} link`);
    return true;
  } catch (err) {
    showSetupError(err.message);
    if (data) showStale(err.message); else showSetup();
    return false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Tải lại từ GitHub';
    $('main').style.opacity = '';
  }
}

async function boot() {
  wire();
  const cached = await loadCached();
  if (cached) {
    data = cached;
    showDashboard();
  } else {
    showSetup();
  }
  if (isConfigured()) refresh(false);
}

boot();
