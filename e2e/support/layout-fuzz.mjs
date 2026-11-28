// Seeded generator of pages inside the safe subset (docs/safe-subset.md §1–§4): nested grid (px, minmax(0,Nfr) and
// Nfr tracks, gaps, spans, explicit lines), flex (row / column, wrap on rows, basis / grow / shrink, min-width: 0, the
// alignment keywords), block flow (px / % widths, max-width, px / negative / auto margins), absolute and fixed boxes
// with insets in both axes, padding / border / box-sizing, px / % / vw / rem / calc lengths, depth 1–4, and leaves
// that are text-free boxes with explicit sizes. A case is a pure function of (seed, index): the same pair is the same
// page on every run, so a failure is reproduced by its two numbers.
//
// A case is data (a tree of nodes with ordered declarations), not a string, so the shrinker can drop subtrees and
// declarations and simplify values. `renderCase` turns it into the HTML and CSS both sides read.

// Mulberry32: small, fast, and the same in Node and every browser.
export function random(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const BASE_CSS = '*{box-sizing:border-box;margin:0}html{scrollbar-width:none;font-size:16px}html,body{display:grid;grid-template-columns:minmax(0,1fr)}';
export const WORDS = ['Home', 'Pricing', 'Documentation', 'Sign in', 'Download', 'Settings', 'OK'];
export const VIEWPORTS = [[320, 640], [375, 700], [400, 600], [600, 800], [768, 900], [1024, 800], [1280, 900]];

export function generateLayoutCase(seed, index) {
  const r = random(Math.imul(seed, 0x9E3779B1) ^ Math.imul(index + 1, 0x85EBCA77));
  const pick = list => list[Math.floor(r() * list.length)], int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1)), chance = p => r() < p;
  let next = 0;
  const [width, height] = pick(VIEWPORTS);
  const px = (lo, hi, step = 1) => `${int(lo, hi) * step}px`;
  const len = () => { const k = r();
    if (k < 0.55) return px(2, 30, 10);
    if (k < 0.7) return `${pick([10, 20, 25, 30, 40, 50, 60, 75, 100])}%`;
    if (k < 0.8) return `${pick([5, 10, 20, 25, 30, 50])}vw`;
    if (k < 0.9) return `${pick([2, 4, 5, 8, 10])}rem`;
    return `calc(${pick([50, 100])}% - ${int(1, 8) * 10}px)`; };
  const blockLen = () => chance(0.8) ? px(1, 8, 10) : `${pick([2, 3, 4])}rem`;
  const spacing = () => chance(0.6) ? '0' : px(1, 4, 4);
  const box = d => {
    if (chance(0.25)) d.padding = chance(0.5) ? px(1, 4, 4) : `${px(0, 3, 4)} ${px(0, 3, 4)}`;
    if (chance(0.15)) d.border = `${int(1, 4)}px solid #000`;
    if (chance(0.15) && (d.padding || d.border)) d['box-sizing'] = 'content-box';
  };
  const leaf = (parentKind, depth) => ({id: next++, decl: {}, kids: [], parentKind, depth});

  // Most cases stay inside the subset by construction, so that most of them are decided; one in eight also writes
  // the forms the subset leaves Unknown (a % flex-basis, a bare fr column with placed items, a flex container item
  // without min-width: 0, justify-items), so the Unknown side is exercised too.
  const wild = chance(0.125);
  // Items of a container: the container's kind (and whether the item is itself a container) decides what is written.
  const item = (n, kind, ctx, container) => {
    const d = n.decl;
    if (kind === 'grid') {
      if (!ctx.bare && chance(0.25)) d['grid-column'] = pick(['span 2', '1 / -1', '2', '1', `span ${Math.max(1, ctx.columns)}`]);
      if (!ctx.bare && chance(0.15)) d['grid-row'] = pick(ctx.rows >= 2 ? ['1', '2', 'span 2'] : ['1', '2']);
      if (chance(container ? 0.15 : 0.4)) d.width = chance(0.7) ? px(2, 30, 10) : len();
      if (/px$/.test(d.width ?? '') && chance(0.4)) d['justify-self'] = pick(['start', 'center', 'end']);
      if (chance(0.25)) d['align-self'] = pick(['start', 'center', 'end', 'stretch']);
      if (chance(0.15)) d['max-width'] = px(5, 30, 10);
    } else if (kind === 'flex') {
      const k = r();
      if (ctx.column) { if (chance(ctx.stretch ? 0.5 : wild ? 0.7 : 1)) d.width = px(2, 30, 10); if (ctx.definite && chance(0.3)) d.flex = pick(['1', '1 1 0']); }
      else if (k < 0.15 && !container) d.width = wild ? len() : px(2, 30, 10);
      else if (k < 0.5) { d.flex = pick(['1', '2', '1 1 0', '0 0 auto']); if (d.flex === '0 0 auto') d.width = px(2, 30, 10); }
      else if (k < 0.65) d['flex-basis'] = wild && chance(0.5) ? `${pick([20, 25, 30, 50, 100])}%` : px(2, 30, 10);
      else d.width = px(2, 30, 10);
      if (!d.flex && chance(0.3)) d['flex-grow'] = ctx.column && !ctx.definite && !wild ? '0' : pick(['0', '1', '2']);
      if (!d.flex && chance(0.3)) d['flex-shrink'] = pick(['0', '1']);
      if (container ? !wild || chance(0.5) : chance(0.5)) d[ctx.column ? 'min-height' : 'min-width'] = '0';
      if (chance(0.2)) d['align-self'] = pick(['flex-start', 'center', 'flex-end', 'stretch']);
    } else if (kind === 'block') {
      // Margins (px, negative, auto) go with a px or % width in the subset (I25, auto margins); other widths with none.
      const m = r(), margin = m < 0.5;
      if (chance(margin ? 0.8 : 0.6)) d.width = (container || margin) && !wild ? (chance(0.6) ? px(5, 40, 10) : `${pick([50, 75, 100])}%`) : len();
      if (chance(0.25)) d['max-width'] = chance(0.7) ? px(5, 40, 10) : '100%';
      if (m < 0.15) d['margin-left'] = px(1, 4, 5);
      else if (m < 0.25) d['margin-left'] = `-${px(1, 4, 5)}`;
      else if (m < 0.35) d['margin-right'] = `-${px(1, 4, 5)}`;
      else if (m < 0.5 && d.width) d.margin = pick(['0 auto', '0 0 0 auto', '0 auto 0 0']);
    }
  };

  const build = (n, depth, parentKind, ctx) => {
    const d = n.decl;
    const kind = depth >= int(1, 4) || chance(0.15) ? 'leaf' : pick(['grid', 'flex', 'flex', 'block']);
    if (parentKind) item(n, parentKind, ctx, kind !== 'leaf');
    box(d);
    if (kind === 'leaf') {
      // A text leaf: one word that does not wrap, its height the px line-height; its width is the browser's own text
      // width, which the check measures and hands to veriss as the trusted text contract (boxes).
      if (chance(0.3)) { n.text = pick(WORDS); d['white-space'] = 'nowrap'; d['line-height'] = pick(['16px', '20px', '24px']); return; }
      d.height = blockLen(); if (!d.width && parentKind === 'block' && chance(0.3)) d.width = len(); return;
    }
    const childCtx = {};
    if (kind === 'grid') {
      d.display = 'grid';
      const columns = int(1, 4), tracks = [], bare = wild && chance(0.5);
      for (let i = 0; i < columns; i++) { const t = r(); tracks.push(t < 0.35 ? px(4, 20, 10) : bare && t > 0.8 ? `${int(1, 2)}fr` : `minmax(0,${int(1, 3)}fr)`); }
      d['grid-template-columns'] = tracks.join(' ');
      if (chance(0.25)) { childCtx.rows = int(1, 2); d['grid-template-rows'] = Array.from({length: childCtx.rows}, () => px(2, 8, 10)).join(' '); }
      if (chance(0.5)) d['column-gap'] = spacing();
      if (chance(0.4)) d['row-gap'] = spacing();
      if (wild && chance(0.3)) d['justify-items'] = pick(['start', 'center', 'end']);
      if (chance(0.2)) d['align-items'] = pick(['start', 'center', 'end']);
      childCtx.columns = columns; childCtx.bare = bare;
    } else if (kind === 'flex') {
      d.display = 'flex';
      const column = chance(0.3);
      if (column) d['flex-direction'] = 'column';
      else if (chance(0.3)) d['flex-wrap'] = 'wrap';
      if (chance(0.5)) d.gap = spacing();
      if (chance(0.4)) d['justify-content'] = pick(['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly']);
      if (chance(0.4)) d['align-items'] = pick(['flex-start', 'center', 'flex-end', 'stretch']);
      if (column && chance(0.4)) d.height = px(10, 30, 10);
      childCtx.column = column; childCtx.definite = !!d.height; childCtx.stretch = ['stretch', undefined].includes(d['align-items']);
    } else d.display = 'block';
    if (chance(0.15)) d.position = 'relative';
    const count = int(1, 4);
    for (let i = 0; i < count; i++) { const c = leaf(kind, depth + 1); n.kids.push(c); build(c, depth + 1, kind, childCtx); }
    // An absolutely positioned child with an inset in both axes (the subset's sure form).
    if (d.position === 'relative' && chance(0.6)) {
      const a = {id: next++, kids: [], decl: {position: 'absolute'}};
      const inset = () => chance(0.7) ? px(0, 6, 5) : `${pick([0, 10, 25, 50])}%`;
      const both = chance(0.3);
      if (both) { a.decl.left = inset(); a.decl.right = inset(); } else a.decl[pick(['left', 'right'])] = inset();
      const bothB = chance(0.3);
      if (bothB) { a.decl.top = inset(); a.decl.bottom = inset(); } else a.decl[pick(['top', 'bottom'])] = inset();
      if (!both) a.decl.width = px(1, 10, 10);
      if (!bothB) a.decl.height = px(1, 6, 10);
      box(a.decl);
      n.kids.push(a);
    }
  };
  const root = {id: next++, decl: {}, kids: []};
  build(root, 0, null, {});
  // A fixed box at the page level, now and then.
  const fixed = [];
  if (wild && chance(0.3)) fixed.push({id: next++, kids: [], decl: {position: 'fixed', [pick(['left', 'right'])]: px(0, 4, 5), [pick(['top', 'bottom'])]: px(0, 4, 5), width: px(2, 10, 10), height: px(2, 6, 10)}});
  return {seed, index, width, height, root, fixed};
}

const declText = d => Object.entries(d).map(([k, v]) => `${k}:${v}`).join(';');
export function renderCase(c) {
  let css = BASE_CSS;
  const html = n => { css += `#n${n.id}{${declText(n.decl)}}`; return `<div id="n${n.id}">${n.text ?? n.kids.map(html).join('')}</div>`; };
  const body = html(c.root) + c.fixed.map(html).join('');
  return {css, body, html: `<html lang="en"><body>${body}</body></html>`};
}

// Every node with its parent, depth and index among its siblings (rounding accumulates along both).
export const nodes = c => { const out = []; const walk = (n, parent, depth, index) => { out.push({n, parent, depth, index}); n.kids.forEach((k, i) => walk(k, n, depth + 1, i)); }; walk(c.root, null, 0, 0); c.fixed.forEach(f => walk(f, null, 0, 0)); return out; };

// Shrinking candidates, smallest first: drop a subtree, drop a declaration, simplify a value. Every candidate is a
// fresh deep copy; the caller keeps the first one that still fails and asks again until none does.
const clone = c => JSON.parse(JSON.stringify(c));
const simpler = v => {
  const out = [];
  if (/^calc\(/.test(v)) out.push(v.match(/\d+%/)?.[0] ?? '0px');
  if (/vw$|rem$|%$/.test(v)) out.push('100px', '50px');
  const m = /^(-?)(\d+)px$/.exec(v);
  if (m && Number(m[2]) > 10) out.push(`${m[1]}${Math.round(Number(m[2]) / 20) * 10 || 10}px`);
  if (m && m[1]) out.push(`${m[2]}px`);
  // A list (tracks, a padding pair) loses its first or last entry; a calc() or a border is not a list.
  if (!/[()]/.test(v.replace(/minmax\(0,\d+fr\)/g, 'm')) && !/solid/.test(v)) { const parts = v.split(' '); if (parts.length > 1) out.push(parts.slice(1).join(' '), parts.slice(0, -1).join(' ')); }
  return out.filter(x => x !== v);
};
export function* shrinkCandidates(c) {
  const all = nodes(c);
  for (let i = all.length - 1; i >= 1; i--) { const x = clone(c), list = nodes(x), {n, parent} = list[i];
    if (parent) parent.kids = parent.kids.filter(k => k !== n); else x.fixed = x.fixed.filter(k => k !== n);
    yield x; }
  // Replace a container by one of its children (lifting the subtree).
  for (let i = 0; i < all.length; i++) for (let j = 0; j < all[i].n.kids.length; j++) if (all[i].n.kids[j].kids.length) {
    const x = clone(c), {n} = nodes(x)[i];
    n.kids = [...n.kids.slice(0, j), ...n.kids[j].kids, ...n.kids.slice(j + 1)];
    yield x; }
  // A text leaf keeps what its trusted contract rests on (one nowrap line of a px line-height): without it the contract
  // the check hands veriss is wrong, and the "mismatch" would be the shrinker's.
  const pinned = (n, k) => n.text && ['white-space', 'line-height'].includes(k);
  for (let i = 0; i < all.length; i++) for (const k of Object.keys(all[i].n.decl)) { if (pinned(all[i].n, k)) continue; const x = clone(c); delete nodes(x)[i].n.decl[k]; yield x; }
  for (let i = 0; i < all.length; i++) for (const [k, v] of Object.entries(all[i].n.decl)) { if (pinned(all[i].n, k)) continue; for (const s of simpler(String(v))) { const x = clone(c); nodes(x)[i].n.decl[k] = s; yield x; } }
  if (c.width !== 400) { const x = clone(c); x.width = 400; x.height = 600; yield x; }
}
export async function shrink(c, fails, budget = 400) {
  let current = c, tries = 0;
  for (let progress = true; progress && tries < budget;) {
    progress = false;
    for (const x of shrinkCandidates(current)) { if (++tries > budget) break; if (await fails(x)) { current = x; progress = true; break; } }
  }
  return current;
}
