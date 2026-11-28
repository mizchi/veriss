// The property the safe-subset fuzzer holds every case to, in one browser:
// - every box veriss gives a rectangle (or a size) is where the browser draws it, within the rounding of that engine;
// - every geometric violation veriss reports is a breakage the browser shows at that box (it sticks out of its parent,
//   its grid area or a sibling's place, or its children stick out of it);
// - a verified page has no breakage the browser shows (no box sticking out of its parent's content box);
// - Unknown is always acceptable, and counted.
import {analyzeHTML} from '../../packages/veriss/src/html.mjs';
import {renderCase, nodes} from './layout-fuzz.mjs';

// A measured float as the exact decimal it is (layout units are binary fractions: 35.578125).
const decimal = v => Number(v.toFixed(6));
const num = t => t === undefined ? 0 : Number(String(t).split('/').reduce((x, y) => x / y));
const at = (a, w, h) => a == null ? null : num(a.constant) + num(a.coefficient) * w + num(a.heightCoefficient) * h;

// `text` maps a text leaf's id to the width the browser draws its word at (nowrap: its min- and max-content width);
// with its px line-height that is the trusted text contract veriss is given (docs/layout-checking.md, boxes).
export function analyzeCase(c, text = {}) {
  const {css, html} = renderCase(c);
  const lineHeight = n => Number(String(n.decl['line-height']).slice(0, -2));
  const boxes = Object.fromEntries(nodes(c).filter(x => x.n.text && text[x.n.id] != null).map(({n}) => [`#n${n.id}`, {minInlineSize: text[n.id], maxInlineSize: text[n.id], intrinsicBlockSize: lineHeight(n)}]));
  return analyzeHTML(html, {name: 'P', css, boxes, viewport: {min: c.width, max: c.width, height: {min: c.height, max: c.height}}, scrollIntent: 'css'});
}

// Everything the check needs from the page, in one round trip.
export async function measure(page, c) {
  const {css, body} = renderCase(c);
  await page.setViewportSize({width: c.width, height: c.height});
  await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${body}</body></html>`);
  return page.evaluate(ids => {
    const out = {boxes: {}, page: {scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight}};
    const px = v => parseFloat(v) || 0;
    for (const id of ids) {
      const e = document.getElementById(`n${id}`);
      const s = getComputedStyle(e), r = e.getBoundingClientRect();
      if (s.display === 'none') { out.boxes[id] = null; continue; }
      const content = {left: r.left + px(s.borderLeftWidth) + px(s.paddingLeft), right: r.right - px(s.borderRightWidth) - px(s.paddingRight), top: r.top + px(s.borderTopWidth) + px(s.paddingTop), bottom: r.bottom - px(s.borderBottomWidth) - px(s.paddingBottom)};
      // Resolved grid lines (computed grid-template-* is the used track sizes in all three engines).
      let lines = null;
      if (s.display === 'grid') {
        const cut = (list, gap, start) => { const at = [start]; list.split(' ').filter(Boolean).forEach((t, i) => { if (i) at.push(at[at.length - 1] + px(gap)); at.push(at[at.length - 1] + px(t)); }); return at; };
        lines = {columns: cut(s.gridTemplateColumns, s.columnGap, content.left), rows: cut(s.gridTemplateRows, s.rowGap, content.top)};
      }
      const p = e.parentElement;
      // The containing block of an absolute box: the padding box of the nearest positioned ancestor (or the viewport).
      let cb = null;
      if (s.position === 'absolute') { let a = e.parentElement; while (a && a !== document.documentElement && getComputedStyle(a).position === 'static') a = a.parentElement;
        if (a && a !== document.documentElement) { const as = getComputedStyle(a), ar = a.getBoundingClientRect(); cb = {left: ar.left + px(as.borderLeftWidth), right: ar.right - px(as.borderRightWidth), top: ar.top + px(as.borderTopWidth), bottom: ar.bottom - px(as.borderBottomWidth)}; }
        else cb = {left: 0, right: innerWidth, top: 0, bottom: innerHeight}; }
      const edges = {inline: px(s.paddingLeft) + px(s.paddingRight) + px(s.borderLeftWidth) + px(s.borderRightWidth), block: px(s.paddingTop) + px(s.paddingBottom) + px(s.borderTopWidth) + px(s.borderBottomWidth)};
      // A text leaf: the width its word is drawn at, and how far the word reaches past its content box.
      let text = null;
      if (e.childNodes.length === 1 && e.firstChild.nodeType === 3) { const range = document.createRange(); range.selectNodeContents(e); const t = range.getBoundingClientRect(); text = {width: t.width, over: Math.max(0, t.right - content.right, content.left - t.left), overBlock: Math.max(0, content.top + px(s.lineHeight) - content.bottom)}; }
      out.boxes[id] = {rect: [r.left, r.top, r.width, r.height], content, lines, cb, edges, text, position: s.position, parent: p.id ? Number(p.id.slice(1)) : null,
        negative: {inline: px(s.marginLeft) < 0 || px(s.marginRight) < 0, block: px(s.marginTop) < 0 || px(s.marginBottom) < 0},
        tracks: lines ? {columns: s.gridTemplateColumns.split(' ').filter(Boolean).length, rows: s.gridTemplateRows.split(' ').filter(Boolean).length} : null};
    }
    // Grid areas: stretch every in-flow grid item with a zero content size (placement does not depend on sizes), read
    // which lines it now spans, then map those indices back onto the real lines.
    const grids = ids.filter(id => out.boxes[id]?.lines);
    const probe = 'justify-self:stretch!important;align-self:stretch!important;width:auto!important;height:auto!important;min-width:1px!important;min-height:1px!important;max-width:none!important;max-height:none!important;margin:0!important;contain:size!important;aspect-ratio:auto!important';
    const items = ids.filter(id => out.boxes[id] && grids.includes(out.boxes[id].parent) && out.boxes[id].position !== 'absolute' && out.boxes[id].position !== 'fixed');
    const saved = items.map(id => { const e = document.getElementById(`n${id}`); const old = e.getAttribute('style'); e.setAttribute('style', probe); return [e, old]; });
    const probeLines = Object.fromEntries(grids.map(id => { const e = document.getElementById(`n${id}`), s = getComputedStyle(e), r = e.getBoundingClientRect();
      const left = r.left + px(s.borderLeftWidth) + px(s.paddingLeft), top = r.top + px(s.borderTopWidth) + px(s.paddingTop);
      const cut = (list, gap, start) => { const at = [start]; list.split(' ').filter(Boolean).forEach((t, i) => { if (i) at.push(at[at.length - 1] + px(gap)); at.push(at[at.length - 1] + px(t)); }); return at; };
      return [id, {columns: cut(s.gridTemplateColumns, s.columnGap, left), rows: cut(s.gridTemplateRows, s.rowGap, top)}]; }));
    const nearest = (list, v) => list.reduce((best, x, i) => Math.abs(x - v) < Math.abs(list[best] - v) ? i : best, 0);
    for (const id of items) { const r = document.getElementById(`n${id}`).getBoundingClientRect(), L = probeLines[out.boxes[id].parent], real = out.boxes[out.boxes[id].parent].lines;
      const c0 = nearest(L.columns, r.left), c1 = nearest(L.columns, r.right), r0 = nearest(L.rows, r.top), r1 = nearest(L.rows, r.bottom);
      out.boxes[id].area = {left: real.columns[c0], right: real.columns[c1], top: real.rows[r0], bottom: real.rows[r1]}; }
    for (const [e, old] of saved) old == null ? e.removeAttribute('style') : e.setAttribute('style', old);
    return out;
  }, nodes(c).map(x => x.n.id));
}

// How much a box sticks out of a rectangle along an axis (0 when inside).
const outside = (r, area, axis) => axis === 'inline' ? Math.max(0, area.left - r[0], r[0] + r[2] - area.right) : Math.max(0, area.top - r[1], r[1] + r[3] - area.bottom);

// The breakage the browser shows at a box along an axis, in px (0 = none): the box out of its parent's content box,
// a child out of the box's content box, or two in-flow siblings overlapping.
export function breakage(m, id, axis, tol) {
  const b = m.boxes[id];
  if (!b) return 0;
  let worst = 0;
  const parent = b.parent != null ? m.boxes[b.parent] : null;
  if (b.cb) worst = Math.max(worst, outside(b.rect, b.cb, axis));
  else if (parent && b.position !== 'fixed') worst = Math.max(worst, outside(b.rect, parent.content, axis));
  if (b.area) worst = Math.max(worst, outside(b.rect, b.area, axis));
  // A word drawn past its box's content edge.
  // (On the block axis its one line box, as tall as its px line-height, past the content box: not the glyphs'
  // rectangle, and not scrollHeight, which leaves out the block-end padding in Firefox.)
  if (b.text) worst = Math.max(worst, axis === 'inline' ? b.text.over : b.text.overBlock);
  // A grid whose tracks and gaps are longer than its content box.
  if (b.lines) { const l = axis === 'inline' ? b.lines.columns : b.lines.rows; worst = Math.max(worst, l.at(-1) - (axis === 'inline' ? b.content.right : b.content.bottom), (axis === 'inline' ? b.content.left : b.content.top) - l[0]); }
  // A box whose padding and border do not fit its size: the browser draws the edges, the content box is empty.
  const size = axis === 'inline' ? b.rect[2] : b.rect[3];
  if (b.edges[axis] > 0 && size - b.edges[axis] <= tol) worst = Math.max(worst, b.edges[axis]);
  for (const [k, x] of Object.entries(m.boxes)) if (x && x.parent === id && x.position !== 'absolute' && x.position !== 'fixed') worst = Math.max(worst, outside(x.rect, b.content, axis));
  if (parent) for (const [k, x] of Object.entries(m.boxes)) {
    if (!x || Number(k) === id || x.parent !== b.parent || x.position === 'absolute' || b.position === 'absolute') continue;
    const ix = Math.min(b.rect[0] + b.rect[2], x.rect[0] + x.rect[2]) - Math.max(b.rect[0], x.rect[0]);
    const iy = Math.min(b.rect[1] + b.rect[3], x.rect[1] + x.rect[3]) - Math.max(b.rect[1], x.rect[1]);
    if (ix > tol && iy > tol) worst = Math.max(worst, Math.min(ix, iy));
  }
  return worst > tol ? worst : 0;
}

const GEOMETRY = new Set(['E_LAYOUT_ITEM_SIZE', 'E_LAYOUT_TRACKS', 'E_LAYOUT_BOX_EDGES', 'E_LAYOUT_PROTRUSION', 'E_LAYOUT_OVERLAP', 'E_LAYOUT_CONTENT', 'E_LAYOUT_ABSOLUTE_START', 'E_LAYOUT_ABSOLUTE_END']);

// Check one case in one browser. `tolerance(depth)` is the rounding the engine may accumulate at that depth.
export async function checkCase(page, c, tolerance) {
  const m = await measure(page, c);
  const widths = Object.fromEntries(Object.entries(m.boxes).filter(([, b]) => b?.text).map(([id, b]) => [id, decimal(b.text.width)]));
  const report = analyzeCase(c, widths);
  // Rounding steps to a box: its depth plus its index among its siblings (each sibling before it may round once).
  const depth = Object.fromEntries(nodes(c).map(x => [x.n.id, x.depth + x.index]));
  const mismatches = [];
  let verifiedBoxes = 0;
  for (const row of report.sizes) {
    const id = /^#n(\d+)$/.exec(row.box)?.[1];
    if (id == null || !(row.rect || row.inlineSize)) continue;
    const b = m.boxes[id];
    if (!b) continue;
    const model = row.rect ? [row.rect.inlineStart, row.rect.blockStart, row.rect.inlineSize, row.rect.blockSize].map(a => at(a, c.width, c.height)) : [NaN, NaN, at(row.inlineSize, c.width, c.height), at(row.blockSize, c.width, c.height)];
    verifiedBoxes++;
    const tol = tolerance(depth[id]);
    if (model.some((v, i) => v != null && !Number.isNaN(v) && Math.abs(v - b.rect[i]) > tol)) mismatches.push({kind: 'geometry', box: `#n${id}`, model, browser: b.rect});
  }
  const violations = report.diagnostics.filter(d => d.severity === 'error');
  for (const d of violations) {
    if (d.code === 'E_LAYOUT_PAGE_OVERFLOW') { if (m.page.scrollWidth <= m.page.clientWidth) mismatches.push({kind: 'violation', code: d.code, message: d.message, browser: m.page}); continue; }
    const id = /^#n(\d+)$/.exec(d.box ?? '')?.[1];
    if (id == null) continue;
    // Outside the explicit grid: the browser adds implicit tracks to the parent.
    if (d.code === 'E_LAYOUT_PLACEMENT') { const p = m.boxes[m.boxes[id]?.parent], key = /rows/.test(d.message) ? 'rows' : 'columns';
      const declared = (nodes(c).find(x => x.n.id === m.boxes[id]?.parent)?.n.decl[`grid-template-${key}`] ?? '').split(' ').filter(Boolean).length;
      if (!p?.tracks || p.tracks[key] <= declared) mismatches.push({kind: 'violation', code: d.code, box: d.box, message: d.message}); continue; }
    if (!GEOMETRY.has(d.code)) continue;
    const axis = d.axis ?? 'inline';
    if (!breakage(m, Number(id), axis, tolerance(depth[id]))) mismatches.push({kind: 'violation', code: d.code, box: d.box, axis, message: d.message});
  }
  if (report.status === 'verified') for (const [id, b] of Object.entries(m.boxes)) for (const axis of ['inline', 'block']) {
    if (!b || b.parent == null || b.position === 'absolute' || b.position === 'fixed' || b.negative[axis]) continue;
    const by = Math.max(outside(b.rect, m.boxes[b.parent].content, axis), b.area ? outside(b.rect, b.area, axis) : 0);
    if (by > tolerance(depth[id])) mismatches.push({kind: 'verified-breakage', box: `#n${id}`, axis, by});
  }
  const nodesCount = nodes(c).length;
  return {status: report.status, mismatches, verifiedBoxes, boxes: nodesCount, violations: violations.length, report};
}
