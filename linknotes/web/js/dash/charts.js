// Hand-rolled SVG charts. No chart library — the rest of this project has no
// build step and these forms are small enough to draw directly.
//
// Marks follow one fixed spec: bars <=24px with a 4px rounded data-end square at
// the baseline, 2px lines, >=8px markers ringed in the surface colour, area fills
// at 10% opacity, hairline solid grid. Touching fills are separated by a 2px gap
// in the surface colour, never by a stroke.

const NS = 'http://www.w3.org/2000/svg';
const GAP = 2;          // surface gap between touching fills
const RADIUS = 4;       // rounded data-end
const MAX_BAR = 24;     // bar/column thickness cap

export function token(name, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

function el(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) node.setAttribute(k, String(v));
  }
  if (parent) parent.appendChild(node);
  return node;
}

function svgRoot(host, width, height) {
  host.textContent = '';
  const svg = el('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width: '100%',
    height,
    role: 'img',
    preserveAspectRatio: 'xMidYMid meet',
  }, host);
  return svg;
}

// Charts are drawn at the container's real pixel width so one user unit is one
// CSS pixel: no letterboxing, and text keeps its intended size at any width.
function measure(host, { min = 320, fallback = 760 } = {}) {
  const w = Math.floor(host.clientWidth || 0);
  return Math.max(min, w || fallback);
}

// Column growing up from the baseline: rounded top, square bottom.
function columnPath(x, y, w, h, round) {
  const r = round ? Math.min(RADIUS, w / 2, h) : 0;
  if (h <= 0) return '';
  return `M${x},${y + h}L${x},${y + r}Q${x},${y} ${x + r},${y}L${x + w - r},${y}Q${x + w},${y} ${x + w},${y + r}L${x + w},${y + h}Z`;
}

// Horizontal bar growing right from the baseline: rounded right end.
function barPath(x, y, w, h, round) {
  const r = round ? Math.min(RADIUS, h / 2, w) : 0;
  if (w <= 0) return '';
  return `M${x},${y}L${x + w - r},${y}Q${x + w},${y} ${x + w},${y + r}L${x + w},${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}L${x},${y + h}Z`;
}

function niceTicks(max, count = 4) {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
  const ticks = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

const fmt = (n) => n.toLocaleString('vi-VN');

/* ---------------- tooltip ---------------- */

function ensureTooltip(card) {
  let tip = card.querySelector('.viz-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'viz-tip';
    tip.setAttribute('role', 'status');
    card.appendChild(tip);
  }
  return tip;
}

// Rows are {label, value, color?}. Labels come from user data, so every string
// goes in through textContent.
function showTip(card, tip, x, y, title, rows) {
  tip.textContent = '';
  const head = document.createElement('div');
  head.className = 'viz-tip-title';
  head.textContent = title;
  tip.appendChild(head);
  for (const row of rows) {
    const line = document.createElement('div');
    line.className = 'viz-tip-row';
    if (row.color) {
      const key = document.createElement('span');
      key.className = 'viz-tip-key';
      key.style.background = row.color;
      line.appendChild(key);
    }
    const val = document.createElement('b');
    val.textContent = row.value;
    const name = document.createElement('span');
    name.className = 'viz-tip-name';
    name.textContent = row.label;
    line.append(val, name);
    tip.appendChild(line);
  }
  tip.classList.add('show');
  const box = card.getBoundingClientRect();
  const tipBox = tip.getBoundingClientRect();
  let left = x + 14;
  if (left + tipBox.width > box.width - 8) left = x - tipBox.width - 14;
  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${Math.max(8, Math.min(y - 12, box.height - tipBox.height - 8))}px`;
}

function hideTip(tip) { tip.classList.remove('show'); }

/* ---------------- 1. trend: single-series area + line ---------------- */

export function trendChart(host, points, { label = 'link', unit = 'ngày' } = {}) {
  const card = host.closest('.card') || host;
  const tip = ensureTooltip(card);
  const W = measure(host);
  const H = 240;
  const pad = { t: 16, r: 16, b: 30, l: 40 };
  const svg = svgRoot(host, W, H);
  if (!points.length) return;

  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const max = Math.max(1, ...points.map((p) => p.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const X = (i) => pad.l + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const Y = (v) => pad.t + plotH - (v / top) * plotH;

  const grid = token('--viz-grid');
  const axis = token('--viz-axis');
  const surface = token('--viz-surface');
  const series = token('--viz-s1');

  for (const t of ticks) {
    el('line', { x1: pad.l, x2: W - pad.r, y1: Y(t), y2: Y(t), stroke: t === 0 ? axis : grid, 'stroke-width': 1 }, svg);
    const label = el('text', { x: pad.l - 8, y: Y(t) + 4, 'text-anchor': 'end', class: 'viz-axis-text' }, svg);
    label.textContent = fmt(t);
  }

  const area = points.map((p, i) => `${i ? 'L' : 'M'}${X(i)},${Y(p.value)}`).join('')
    + `L${X(points.length - 1)},${Y(0)}L${X(0)},${Y(0)}Z`;
  el('path', { d: area, fill: series, 'fill-opacity': 0.1 }, svg);
  el('path', {
    d: points.map((p, i) => `${i ? 'L' : 'M'}${X(i)},${Y(p.value)}`).join(''),
    fill: 'none', stroke: series, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  }, svg);

  // X labels: first, middle, last only — enough to orient without crowding.
  const dateLabel = (d) => d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  for (const i of [...new Set([0, Math.floor(points.length / 2), points.length - 1])]) {
    const t = el('text', {
      x: X(i), y: H - 10,
      'text-anchor': i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle',
      class: 'viz-axis-text',
    }, svg);
    t.textContent = dateLabel(points[i].date);
  }

  // Direct-label the peak only; the axis and tooltip carry the rest.
  const peak = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);
  if (points[peak].value > 0) {
    const py = Y(points[peak].value);
    const above = py - 10 >= pad.t + 10;
    const px = X(peak);
    const anchor = px < pad.l + 24 ? 'start' : px > W - pad.r - 24 ? 'end' : 'middle';
    const t = el('text', {
      x: px, y: above ? py - 10 : py + 18, 'text-anchor': anchor, class: 'viz-peak-text',
    }, svg);
    t.textContent = fmt(points[peak].value);
  }

  const hair = el('line', { y1: pad.t, y2: pad.t + plotH, stroke: axis, 'stroke-width': 1, opacity: 0 }, svg);
  const ring = el('circle', { r: 5, fill: series, stroke: surface, 'stroke-width': 2, opacity: 0 }, svg);

  const hit = el('rect', { x: pad.l, y: pad.t, width: plotW, height: plotH, fill: 'transparent', tabindex: 0 }, svg);
  const move = (clientX) => {
    const box = svg.getBoundingClientRect();
    const rel = ((clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(points.length - 1,
      Math.round(((rel - pad.l) / plotW) * (points.length - 1))));
    const p = points[i];
    hair.setAttribute('x1', X(i)); hair.setAttribute('x2', X(i)); hair.setAttribute('opacity', 1);
    ring.setAttribute('cx', X(i)); ring.setAttribute('cy', Y(p.value)); ring.setAttribute('opacity', 1);
    const cardBox = card.getBoundingClientRect();
    const svgBox = svg.getBoundingClientRect();
    const px = svgBox.left - cardBox.left + (X(i) / W) * svgBox.width;
    const py = svgBox.top - cardBox.top + (Y(p.value) / H) * svgBox.height;
    showTip(card, tip, px, py,
      p.date.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }),
      [{ label, value: fmt(p.value), color: series }]);
  };
  hit.addEventListener('pointermove', (e) => move(e.clientX));
  hit.addEventListener('pointerleave', () => {
    hair.setAttribute('opacity', 0); ring.setAttribute('opacity', 0); hideTip(tip);
  });
  hit.addEventListener('focus', () => move(svg.getBoundingClientRect().left + svg.getBoundingClientRect().width / 2));
  hit.addEventListener('blur', () => { hair.setAttribute('opacity', 0); ring.setAttribute('opacity', 0); hideTip(tip); });
  host.dataset.unit = unit;
}

/* ---------------- 2. calendar heatmap (sequential) ---------------- */

export function calendarHeatmap(host, days, ramp) {
  const card = host.closest('.card') || host;
  const tip = ensureTooltip(card);
  if (!days.length) { host.textContent = ''; return; }

  const PADC = 3;
  const left = 30;
  const topPad = 18;
  const rightPad = 46;      // room for the last month label
  const weeks = [];
  let col = null;
  for (const d of days) {
    const dow = (d.date.getDay() + 6) % 7; // Monday = 0
    if (!col || dow === 0) { col = new Array(7).fill(null); weeks.push(col); }
    col[dow] = d;
  }
  // Grow the cells to use the card's width, within a sane range.
  const avail = (host.clientWidth || 760) - left - rightPad;
  const CELL = Math.max(11, Math.min(26, Math.floor(avail / weeks.length) - PADC));
  const W = left + weeks.length * (CELL + PADC) + rightPad;
  const H = topPad + 7 * (CELL + PADC) + 4;
  const svg = svgRoot(host, W, H);
  // Fixed pixel width: stretching the grid would distort square cells.
  svg.setAttribute('width', W);
  svg.style.maxWidth = 'none';

  const empty = token('--viz-grid');
  const steps = ramp.map((s) => token(s));

  // Quantile buckets over the non-zero days. A linear split on the maximum
  // collapses this kind of data — most days hold one link, a few hold ten — into
  // the lowest step, which makes the whole grid read as empty.
  const nonZero = days.map((d) => d.value).filter((v) => v > 0).sort((a, b) => a - b);
  const breaks = [];
  for (let i = 1; i < steps.length; i += 1) {
    const q = nonZero[Math.floor((i / steps.length) * nonZero.length)];
    const prev = breaks.length ? breaks[breaks.length - 1] : 1;
    breaks.push(Math.max(prev + (q > prev ? 0 : 1), q || prev + 1));
  }
  const colorFor = (v) => {
    if (!v) return empty;
    let idx = 0;
    while (idx < breaks.length && v >= breaks[idx]) idx += 1;
    return steps[Math.min(idx, steps.length - 1)];
  };

  ['T2', '', 'T4', '', 'T6', '', 'CN'].forEach((lbl, i) => {
    if (!lbl) return;
    const t = el('text', { x: left - 6, y: topPad + i * (CELL + PADC) + CELL - 2, 'text-anchor': 'end', class: 'viz-axis-text' }, svg);
    t.textContent = lbl;
  });

  let lastMonth = '';
  let lastLabelX = -Infinity;
  weeks.forEach((week, wi) => {
    const first = week.find(Boolean);
    if (first) {
      const m = first.date.toLocaleDateString('vi-VN', { month: 'short' });
      const x = left + wi * (CELL + PADC);
      // Skip a label that would run into the previous one.
      if (m !== lastMonth && x - lastLabelX >= 58) {
        lastMonth = m;
        lastLabelX = x;
        const t = el('text', { x, y: 10, class: 'viz-axis-text' }, svg);
        t.textContent = m;
      } else if (m !== lastMonth) {
        lastMonth = m;
      }
    }
    week.forEach((d, di) => {
      if (!d) return;
      const x = left + wi * (CELL + PADC);
      const y = topPad + di * (CELL + PADC);
      const cell = el('rect', {
        x, y, width: CELL, height: CELL, rx: 3,
        fill: colorFor(d.value), tabindex: 0, role: 'img',
      }, svg);
      const title = d.date.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
      cell.setAttribute('aria-label', `${title}: ${d.value} link`);
      const show = () => {
        const cardBox = card.getBoundingClientRect();
        const svgBox = svg.getBoundingClientRect();
        const scale = svgBox.width / W;
        showTip(card, tip,
          svgBox.left - cardBox.left + (x + CELL / 2) * scale,
          svgBox.top - cardBox.top + y * scale,
          title, [{ label: 'link', value: fmt(d.value) }]);
      };
      cell.addEventListener('pointerenter', show);
      cell.addEventListener('focus', show);
      cell.addEventListener('pointerleave', () => hideTip(tip));
      cell.addEventListener('blur', () => hideTip(tip));
    });
  });
}

/* ---------------- 3. stacked columns (categorical) ---------------- */

export function stackedColumns(host, rows, slots) {
  const card = host.closest('.card') || host;
  const tip = ensureTooltip(card);
  const W = measure(host);
  const H = 260;
  const pad = { t: 16, r: 16, b: 34, l: 40 };
  const svg = svgRoot(host, W, H);
  if (!rows.length) return;

  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const max = Math.max(1, ...rows.map((r) => r.total));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const band = plotW / rows.length;
  const barW = Math.min(MAX_BAR, band * 0.62);
  const Y = (v) => pad.t + plotH - (v / top) * plotH;

  const grid = token('--viz-grid');
  const axis = token('--viz-axis');

  for (const t of ticks) {
    el('line', { x1: pad.l, x2: W - pad.r, y1: Y(t), y2: Y(t), stroke: t === 0 ? axis : grid, 'stroke-width': 1 }, svg);
    const lab = el('text', { x: pad.l - 8, y: Y(t) + 4, 'text-anchor': 'end', class: 'viz-axis-text' }, svg);
    lab.textContent = fmt(t);
  }

  rows.forEach((row, ri) => {
    const cx = pad.l + band * ri + band / 2;
    const x = cx - barW / 2;
    let cursor = 0;
    const present = slots.filter((s) => (row.values.get(s.id) || 0) > 0);
    present.forEach((slot, si) => {
      const v = row.values.get(slot.id) || 0;
      const isTop = si === present.length - 1;
      const yTop = Y(cursor + v);
      const yBottom = Y(cursor);
      // The 2px surface gap lives inside the segment, never as a stroke.
      const h = Math.max(0, yBottom - yTop - (isTop ? 0 : GAP));
      if (h > 0) {
        el('path', { d: columnPath(x, yTop, barW, h, isTop), fill: slot.color }, svg);
      }
      cursor += v;
    });

    const lab = el('text', { x: cx, y: H - 12, 'text-anchor': 'middle', class: 'viz-axis-text' }, svg);
    lab.textContent = row.month.slice(2);

    // Hit target spans the whole band so the pointer never has to find a segment.
    const hit = el('rect', { x: pad.l + band * ri, y: pad.t, width: band, height: plotH, fill: 'transparent', tabindex: 0 }, svg);
    const show = () => {
      const cardBox = card.getBoundingClientRect();
      const svgBox = svg.getBoundingClientRect();
      const scale = svgBox.width / W;
      const listed = slots.filter((s) => (row.values.get(s.id) || 0) > 0)
        .sort((a, b) => (row.values.get(b.id) || 0) - (row.values.get(a.id) || 0));
      showTip(card, tip,
        svgBox.left - cardBox.left + cx * scale,
        svgBox.top - cardBox.top + Y(row.total) * scale,
        row.month,
        listed.map((s) => ({ label: s.label, value: fmt(row.values.get(s.id) || 0), color: s.color })));
    };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('pointermove', show);
    hit.addEventListener('focus', show);
    hit.addEventListener('pointerleave', () => hideTip(tip));
    hit.addEventListener('blur', () => hideTip(tip));
  });
}

/* ---------------- 4. horizontal bars (one series, one colour) ---------------- */

export function barList(host, entries, { color, formatLabel = (k) => k } = {}) {
  const card = host.closest('.card') || host;
  const tip = ensureTooltip(card);
  host.textContent = '';
  if (!entries.length) return;
  const max = Math.max(...entries.map(([, v]) => v));
  const fill = token(color);

  for (const [key, value] of entries) {
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.tabIndex = 0;

    const name = document.createElement('span');
    name.className = 'bar-name';
    name.textContent = formatLabel(key);

    const track = document.createElement('div');
    track.className = 'bar-track';
    // Plain element rather than a stretched SVG: a non-uniformly scaled SVG
    // turns the 4px rounded data-end into an ellipse.
    const bar = document.createElement('div');
    bar.className = 'bar-fill';
    bar.style.width = `${Math.max(1.5, (value / max) * 100)}%`;
    bar.style.background = fill;
    track.appendChild(bar);

    const val = document.createElement('span');
    val.className = 'bar-value';
    val.textContent = fmt(value);

    row.append(name, track, val);
    host.appendChild(row);

    const show = () => {
      const cardBox = card.getBoundingClientRect();
      const rowBox = row.getBoundingClientRect();
      showTip(card, tip, rowBox.left - cardBox.left + rowBox.width * 0.5,
        rowBox.top - cardBox.top, formatLabel(key),
        [{ label: `link · ${Math.round((value / max) * 100)}% so với nhiều nhất`, value: fmt(value), color: fill }]);
    };
    row.addEventListener('pointerenter', show);
    row.addEventListener('focus', show);
    row.addEventListener('pointerleave', () => hideTip(tip));
    row.addEventListener('blur', () => hideTip(tip));
  }
}

// Relative luminance, then whichever of near-black / white contrasts better.
export function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  const withWhite = 1.05 / (L + 0.05);
  const withInk = (L + 0.05) / 0.0532;
  return withInk >= withWhite ? '#0b0b0b' : '#ffffff';
}

/* ---------------- 5. part-to-whole: one stacked horizontal bar ---------------- */

export function partToWhole(host, slots) {
  const card = host.closest('.card') || host;
  const tip = ensureTooltip(card);
  const W = measure(host);
  const H = 34;
  const svg = svgRoot(host, W, H);
  const total = slots.reduce((s, x) => s + x.value, 0);
  if (!total) return;

  let x = 0;
  slots.forEach((slot, i) => {
    const raw = (slot.value / total) * W;
    const isLast = i === slots.length - 1;
    const w = Math.max(0, raw - (isLast ? 0 : GAP));
    if (w <= 0) return;
    el('path', { d: barPath(x, 4, w, 22, i === 0 || isLast), fill: slot.color }, svg);

    // Only label inside the segment when the text demonstrably fits.
    const text = `${Math.round((slot.value / total) * 100)}%`;
    if (w > text.length * 9 + 14) {
      const t = el('text', {
        x: x + w / 2, y: 20, 'text-anchor': 'middle',
        class: 'viz-inbar-text', fill: slot.ink || '#fff',
      }, svg);
      t.textContent = text;
    }

    const hit = el('rect', { x, y: 0, width: Math.max(raw, 24), height: H, fill: 'transparent', tabindex: 0 }, svg);
    const show = () => {
      const cardBox = card.getBoundingClientRect();
      const svgBox = svg.getBoundingClientRect();
      const scale = svgBox.width / W;
      showTip(card, tip, svgBox.left - cardBox.left + (x + w / 2) * scale,
        svgBox.top - cardBox.top, slot.label,
        [{ label: `link · ${Math.round((slot.value / total) * 100)}%`, value: fmt(slot.value), color: slot.color }]);
    };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('focus', show);
    hit.addEventListener('pointerleave', () => hideTip(tip));
    hit.addEventListener('blur', () => hideTip(tip));
    x += raw;
  });
}

/* ---------------- sparkline (stat tiles) ---------------- */

export function sparkline(host, values) {
  const W = 120;
  const H = 28;
  const svg = svgRoot(host, W, H);
  if (values.length < 2) return;
  const max = Math.max(1, ...values);
  const X = (i) => (i / (values.length - 1)) * W;
  const Y = (v) => H - 2 - (v / max) * (H - 6);
  el('path', {
    d: values.map((v, i) => `${i ? 'L' : 'M'}${X(i)},${Y(v)}`).join(''),
    fill: 'none', stroke: token('--viz-spark'), 'stroke-width': 2,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, svg);
  el('circle', {
    cx: X(values.length - 1), cy: Y(values[values.length - 1]), r: 4,
    fill: token('--viz-s1'), stroke: token('--viz-surface'), 'stroke-width': 2,
  }, svg);
}

/* ---------------- legend + table twin ---------------- */

export function legend(host, slots, { shape = 'rect' } = {}) {
  host.textContent = '';
  for (const slot of slots) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const key = document.createElement('span');
    key.className = shape === 'line' ? 'legend-line' : 'legend-swatch';
    key.style.background = slot.color;
    const label = document.createElement('span');
    label.textContent = slot.label;
    item.append(key, label);
    host.appendChild(item);
  }
}

// Every chart ships a table twin: the WCAG-clean equivalent, and the relief for
// light-mode hues that sit below 3:1 against the surface.
export function table(host, columns, rows) {
  host.textContent = '';
  const t = document.createElement('table');
  t.className = 'viz-table';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const c of columns) {
    const th = document.createElement('th');
    th.textContent = c.label;
    if (c.numeric) th.className = 'num';
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    columns.forEach((c, i) => {
      const td = document.createElement('td');
      if (c.numeric) td.className = 'num';
      if (i === 0 && row.color) {
        const dot = document.createElement('span');
        dot.className = 'legend-swatch';
        dot.style.background = row.color;
        td.appendChild(dot);
        td.appendChild(document.createTextNode(String(row.cells[i])));
      } else {
        td.textContent = String(row.cells[i]);
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  t.append(thead, tbody);
  host.appendChild(t);
}
