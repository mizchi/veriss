// How much of real pages' CSS the safe subset (docs/safe-subset.md) covers, and what veriss decides on them.
//
// Input: the corpus of tools/corpus/capture.mjs (evals/corpus/manifest.json + snapshots/<id>.json, each {html, css, images}).
// For each page:
//  1. Static inventory. Every declaration, selector and at-rule of the CSS, classified by the rules of safe-subset.md
//     (in / cond / off / unlisted, the section it falls under). A rule is weighted by the elements of the snapshot its
//     selector matches (pseudo-classes of state and pseudo-elements taken out, so a superset, as veriss's own §9 rule),
//     matched by Chromium on the snapshot itself (no network, no script).
//  2. Dynamic. veriss (adapter-core analyzeStates, as tools/blocker-weights.mjs) at a phone width and a desktop width,
//     each exact. blocker-weights' method, extended: an Unknown on a box removes the box (its subtree charged to the
//     reason); an Unknown located on a CSS rule or at-rule (a selector or query veriss cannot read; it stops the whole
//     page) removes that rule, charged with the elements its selectors match; an Unknown with neither is charged the
//     rest of the page. Repeat until the page is decided. The elements charged to no reason are the decided share.
//     Pages beyond the analyser's bounds (2048 elements, 64 levels, 1 MB of HTML or CSS) are first brought inside them
//     (long sibling runs cut, CSS rules that match no element dropped), the cut elements charged to the bound.
//
// Usage: node tools/subset-coverage.mjs [--corpus evals/corpus] [--only id,id] [--widths 390x844,1280x800] [--steps 60]
//          [--out evals/results/safe-subset-coverage/coverage.json]
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';
import {chromium} from 'playwright';
import {analyzeStates} from '../packages/adapter-core/src/index.mjs';

const req = createRequire(new URL('../packages/veriss/package.json', import.meta.url));
const postcss = req('postcss'), csstree = req('css-tree'), {parse, serialize} = req('parse5');

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const corpus = resolve(opt('--corpus', 'evals/corpus'));
const only = (opt('--only', '') ?? '').split(',').filter(Boolean);
// WxH[@dpr]: a phone at 3x, a desktop at 1x by default (resolution media queries need the ratio).
const widths = opt('--widths', '390x844@3,1280x800@1').split(',').map(s => { const [size, dpr] = s.split('@'); const [w, h] = size.split('x').map(Number); return {width: w, height: h, dpr: Number(dpr ?? 1)}; });
const maxSteps = Number(opt('--steps', '400'));
// A time budget per page and width (ms): past it the rest of the page is charged to the step limit.
const budget = Number(opt('--budget', '300000'));
const outFile = resolve(opt('--out', 'evals/results/safe-subset-coverage/coverage.json'));

// ---------------------------------------------------------------------------------------------------------------
// Classification by docs/safe-subset.md. verdict: in (a form the doc prescribes) | cond (allowed under conditions the
// doc names) | off (the doc says it is Unknown or not to write it) | unlisted (the doc says nothing about it).
// ---------------------------------------------------------------------------------------------------------------
const STATE_PSEUDOS = new Set(['hover', 'focus', 'focus-visible', 'focus-within', 'active', 'checked', 'target', 'target-within', 'disabled', 'enabled', 'visited', 'link', 'any-link',
  'placeholder-shown', 'invalid', 'valid', 'user-invalid', 'user-valid', 'indeterminate', 'open', 'closed', 'popover-open', 'autofill', '-webkit-autofill', 'default', 'modal', 'fullscreen', 'playing', 'paused', 'current', 'past', 'future', 'blank', 'read-write', 'read-only', 'required', 'optional', 'in-range', 'out-of-range']);
const RELAYOUT_STATES = new Set(['hover', 'focus', 'focus-visible', 'focus-within', 'active']);
const PAINT_PROPS = /^(?:color|background(?:-color|-image|-position.*|-repeat|-size|-clip|-origin|-attachment|-blend-mode)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?-color|border-radius|border-(?:top|bottom)-(?:left|right)-radius|outline(?:-.*)?|box-shadow|text-decoration(?:-.*)?|text-underline-offset|opacity|visibility|cursor|transform|translate|scale|rotate|transform-origin|transition(?:-.*)?|animation(?:-.*)?|fill|fill-opacity|stroke|stroke-opacity|filter|backdrop-filter|-webkit-backdrop-filter|will-change|caret-color|accent-color|text-shadow|-webkit-tap-highlight-color|pointer-events|z-index|mask(?:-.*)?|-webkit-mask(?:-.*)?|text-emphasis-color|outline-offset|scrollbar-color|color-scheme|appearance|-webkit-appearance|user-select|-webkit-user-select|touch-action|content)$/;
const LENGTH_IN = new Set(['px', '%', 'vw', 'vh', 'vmin', 'vmax', 'vi', 'vb', 'rem', 'em']);
const LAYOUT_PROPS = /^(?:display|position|float|clear|columns|column-(?:count|width|span|fill|gap)|flex(?:-.*)?|order|grid(?:-.*)?|(?:justify|align|place)-(?:content|items|self)|gap|row-gap|inset(?:-.*)?|top|right|bottom|left|(?:min-|max-)?(?:width|height|inline-size|block-size)|margin(?:-.*)?|padding(?:-.*)?|box-sizing|aspect-ratio|overflow(?:-.*)?|contain(?:-.*)?|container(?:-.*)?|content-visibility|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-width|-style)?|border-width|border-style|line-height|font(?:-size|-family)?|white-space(?:-collapse)?|text-wrap(?:-mode)?|word-break|overflow-wrap|word-wrap|line-break|hyphens|letter-spacing|word-spacing|text-indent|text-transform|text-box(?:-.*)?|vertical-align|writing-mode|direction|unicode-bidi|text-overflow|-webkit-line-clamp|line-clamp|scrollbar-width|scrollbar-gutter|zoom|table-layout|border-collapse|border-spacing|list-style(?:-.*)?|object-fit)$/;

function valueForms(value) {
  const forms = new Set();
  let ast; try { ast = csstree.parse(value, {context: 'value'}); } catch { forms.add('unparsed'); return forms; }
  csstree.walk(ast, node => {
    if (node.type === 'Dimension') forms.add(`unit:${node.unit.toLowerCase()}`);
    else if (node.type === 'Percentage') forms.add('unit:%');
    else if (node.type === 'Number') forms.add(node.value === '0' ? 'zero' : 'number');
    else if (node.type === 'Function') forms.add(`fn:${node.name.toLowerCase()}`);
    else if (node.type === 'Identifier') forms.add(`kw:${node.name.toLowerCase()}`);
    else if (node.type === 'Hash') forms.add('hash');
    else if (node.type === 'Url') forms.add('url');
    else if (node.type === 'String') forms.add('string');
  });
  return forms;
}
const kw = forms => [...forms].filter(f => f.startsWith('kw:')).map(f => f.slice(3));
const units = forms => [...forms].filter(f => f.startsWith('unit:')).map(f => f.slice(5));
const fns = forms => [...forms].filter(f => f.startsWith('fn:')).map(f => f.slice(3));

/** The checks one declaration falls under: [{id, section, verdict}]. */
function classifyDeclaration(prop, value) {
  const p = prop.toLowerCase(), v = value.trim().toLowerCase().replace(/\s*!important$/, ''), forms = valueForms(v), out = [];
  const add = (id, section, verdict) => out.push({id, section, verdict});
  if (p.startsWith('--')) { add('custom property definition', 'css-variables', 'in'); return out; }
  const wide = /^(?:inherit|initial|unset|revert|revert-layer)$/.test(v);
  if (fns(forms).includes('var')) add('value uses var()', '2', 'cond');
  if (fns(forms).includes('env')) add('value uses env()', '2', 'unlisted');
  if (fns(forms).includes('attr')) add('value uses attr()', '2', 'unlisted');
  if (p.startsWith('-webkit-') || p.startsWith('-moz-') || p.startsWith('-ms-')) add(`vendor property`, 'other', 'unlisted');
  // §1
  if (p === 'display' && !wide) {
    const d = v.split(/\s+/).join(' ');
    if (/^(?:block|flex|grid|none|block flex|block grid)$/.test(d)) add(`display: ${d}`, '1', 'in');
    else if (/^(?:inline-block|inline-flex|inline flex|inline flow-root)$/.test(d)) add(`display: ${d}`, '1', 'cond');
    else if (/^(?:table|inline-table|table-.*)$/.test(d)) add(`display: ${d}`, '1', 'off');
    else if (!d.includes('var(')) add(`display: ${d}`, '1', 'unlisted');
  }
  if (p === 'float' && !/^(?:none|inherit|initial|unset)$/.test(v)) add('float', '1', 'off');
  if (p === 'clear' && !/^(?:none|inherit|initial|unset)$/.test(v)) add('clear', '1', 'off');
  if ((p === 'columns' || p === 'column-count' || p === 'column-width') && !/^(?:auto|initial|unset|inherit)$/.test(v)) add('columns', '1', 'off');
  if (p === 'position') {
    if (/^(?:static|relative)$/.test(v)) add(`position: ${v}`, '1', 'in');
    else if (/^(?:absolute|fixed)$/.test(v)) add(`position: ${v}`, '1', 'cond');
    else if (v === 'sticky' || v === '-webkit-sticky') add('position: sticky', '1', 'unlisted');
  }
  if (p === 'flex-direction' || p === 'flex-flow') {
    if (/reverse/.test(v) && !/wrap-reverse/.test(v)) add('flex-direction: *-reverse', '1', 'off');
  }
  if (p === 'flex-wrap' || p === 'flex-flow') {
    if (/wrap-reverse/.test(v)) add('flex-wrap: wrap-reverse', '1', 'off');
    else if (/\bwrap\b/.test(v)) add('flex-wrap: wrap', '1', 'cond');
  }
  if (p === 'order' && !/^(?:0|initial|unset|inherit)$/.test(v)) add('order ≠ 0', '1', 'off');
  if (p === 'grid-template-columns' || p === 'grid-template' || p === 'grid') {
    if (/\bsubgrid\b/.test(v)) add('grid columns: subgrid', '1', 'unlisted');
    if (/auto-(?:fill|fit)/.test(v)) add('grid columns: repeat(auto-fill|auto-fit)', '1', 'unlisted');
    if (/(?:min|max|fit)-content|fit-content\(/.test(v)) add('grid columns: intrinsic (min/max/fit-content)', '1', 'unlisted');
    // a bare fr outside minmax(0, …)
    const bare = v.replace(/minmax\(\s*0(?:px)?\s*,[^)]*\)/g, '');
    if (/\dfr\b/.test(bare)) add('grid columns: bare fr', '1', 'cond');
    if (/minmax\(\s*0(?:px)?\s*,\s*[\d.]+fr\s*\)/.test(v)) add('grid columns: minmax(0, Nfr)', '1', 'in');
    if (/\bauto\b/.test(bare.replace(/auto-(?:fill|fit)/g, ''))) add('grid columns: auto track', '1', 'unlisted');
  }
  if (p === 'grid-template-areas' || p === 'grid-area' || p === 'grid-row' || p === 'grid-column' || p === 'grid-row-start' || p === 'grid-column-start' || p === 'grid-row-end' || p === 'grid-column-end') add(`grid placement (${p})`, '1', 'unlisted');
  if (p === 'grid-auto-flow' && /dense|column/.test(v)) add(`grid-auto-flow: ${v}`, '1', 'unlisted');
  if (p === 'flex' || p === 'flex-basis') {
    const basisAuto = p === 'flex-basis' ? v === 'auto' || v === 'content' : /^(?:auto|initial)$/.test(v) || /\bauto\b|\bcontent\b/.test(v);
    add(basisAuto ? 'flex-basis: auto (content size)' : 'flex basis given', '1', basisAuto ? 'cond' : 'in');
  }
  if (/^(?:justify-content|align-content|align-items|align-self|justify-items|justify-self|place-.*)$/.test(p) && /center|end|space|baseline|right/.test(v)) add('alignment other than start', '1', 'cond');
  // §2 lengths, on the layout properties
  if (LAYOUT_PROPS.test(p) && !wide) {
    for (const u of units(forms)) add(`unit ${u}`, '2', LENGTH_IN.has(u) ? 'in' : /^(?:dvh|svh|lvh|dvw|svw|lvw|dvi|svi|dvb|svb)$/.test(u) ? 'unlisted' : /^cq/.test(u) ? 'unlisted' : 'unlisted');
    for (const f of fns(forms)) if (['min', 'max', 'clamp'].includes(f)) add(`${f}()`, '2', 'unlisted');
    if (fns(forms).includes('calc')) add('calc()', '2', 'in');
    if (fns(forms).includes('fit-content') || kw(forms).some(k => /^(?:min-content|max-content|fit-content|stretch|-webkit-fill-available)$/.test(k))) add('intrinsic size keyword', '2', 'unlisted');
  }
  if (p === 'max-height') add(/^\d/.test(v) && /px$/.test(v) ? 'max-height: px' : v === 'none' ? 'max-height: none' : 'max-height: % / calc / other', '2', /px$/.test(v) || v === 'none' ? 'in' : 'off');
  if (p === 'box-sizing' && v === 'content-box') add('box-sizing: content-box', '2', 'cond');
  // §3
  if (p === 'line-height' && !wide) add(/^\d*\.?\d+(?:px)?$/.test(v) || v === '0' ? 'line-height: px / number' : `line-height: other (${v.replace(/[\d.]+/g, 'N')})`, '3', /^\d*\.?\d+(?:px)?$/.test(v) ? 'in' : 'off');
  if (p === 'word-break' && v === 'break-all') add('word-break: break-all', '3', 'cond');
  if (p === 'word-break' && v === 'keep-all') add('word-break: keep-all', '3', 'off');
  if (p === 'line-break' && !/^(?:auto|initial|unset)$/.test(v)) add('line-break', '3', 'off');
  if (p.startsWith('text-box')) add('text-box', '3', 'off');
  if (p === 'white-space' && /nowrap|pre/.test(v)) add(`white-space: ${v}`, '3', 'unlisted');
  if ((p === 'text-wrap' || p === 'text-wrap-style') && /balance|pretty/.test(v)) add(`text-wrap: ${v}`, '3', 'unlisted');
  if (p === 'vertical-align' && v !== 'baseline') add('vertical-align ≠ baseline', '3', 'unlisted');
  if (p === 'writing-mode' && !/horizontal-tb/.test(v)) add('writing-mode vertical', '3', 'unlisted');
  if (p === '-webkit-line-clamp' || p === 'line-clamp') add('line-clamp', '3', 'unlisted');
  // §4
  if (/^border-(?:top|bottom|start|end)-(?:left|right|start|end)-radius$/.test(p)) add('per-corner border-*-radius', '4', 'off');
  if (p === 'border-radius') add('border-radius shorthand', '4', 'in');
  if (p.startsWith('border-image') && v !== 'none') add('border-image', '4', 'off');
  // §8
  if (p === 'mix-blend-mode' && v !== 'normal') add('mix-blend-mode', '8', 'off');
  if ((p === 'transform' && /scale\(\s*0\s*\)|scale[xy]\(\s*0\s*\)/.test(v)) || (p === 'scale' && /^0(?:\s+0)?$/.test(v))) add('transform: scale(0)', '8', 'off');
  if (/^stroke(?:-|$)/.test(p) && p !== 'stroke' ) add('SVG stroke-* in CSS', '8', 'off');
  if (p === 'pointer-events' && /^(?:all|visiblepainted|visiblefill|visiblestroke|visible|painted|fill|stroke|bounding-box)$/.test(v)) add('pointer-events: SVG value', '8', 'off');
  if (p === 'scrollbar-width' || p === 'scrollbar-gutter') add(`${p}`, '6', 'in');
  if (p === 'contain' || p === 'content-visibility') add(`${p}: ${v}`, 'other', 'unlisted');
  if (p === 'container-type' || p === 'container') add('container-type', 'other', 'cond');
  return out;
}

/** The checks one selector falls under, from its css-tree AST. */
function classifySelector(selector) {
  const out = [], add = (id, section, verdict) => out.push({id, section, verdict});
  // A rule's selector is a list: parsed as one, each complex selector's compounds checked on their own.
  let ast; try { ast = csstree.parse(selector, {context: 'selectorList'}); } catch { add('unparsed selector', '5', 'unlisted'); return {checks: out, states: []}; }
  const states = [];
  csstree.walk(ast, {visit: 'PseudoClassSelector', enter(node) { add(`:${node.name}`, STATE_PSEUDOS.has(node.name) ? '5' : 'selector', 'feature'); if (STATE_PSEUDOS.has(node.name)) states.push(node.name); }});
  csstree.walk(ast, {visit: 'PseudoElementSelector', enter(node) { add(`::${node.name}`, '6', node.name.startsWith('-webkit-scrollbar') ? 'off' : 'feature'); }});
  csstree.walk(ast, {visit: 'AttributeSelector', enter() { add('[attribute]', 'selector', 'feature'); }});
  csstree.walk(ast, {visit: 'Combinator', enter(node) { add(`combinator '${node.name === ' ' ? 'descendant' : node.name}'`, 'selector', 'feature'); }});
  csstree.walk(ast, {visit: 'TypeSelector', enter(node) { if (node.name === '*') add('universal *', 'selector', 'feature'); }});
  csstree.walk(ast, {visit: 'NestingSelector', enter() { add('nesting &', 'selector', 'feature'); }});
  if (ast.type === 'Raw') add('unparsed selector', '5', 'unlisted');
  for (const complex of ast.type === 'SelectorList' ? ast.children.toArray() : []) {
    if (complex.type !== 'Selector') { add('unparsed selector', '5', 'unlisted'); continue; }
    // Compounds of the complex selector: state count per compound, a state (or pseudo-element) before a combinator.
    const compounds = [[]];
    for (const child of complex.children.toArray()) { if (child.type === 'Combinator') compounds.push(child, []); else compounds.at(-1).push(child); }
    for (let i = 0; i < compounds.length; i += 2) {
      const c = compounds[i], stateCount = c.filter(n => n.type === 'PseudoClassSelector' && STATE_PSEUDOS.has(n.name)).length;
      if (stateCount > 1) add('two states in one compound', '5', 'off');
      if (i + 1 < compounds.length && (stateCount || c.some(n => n.type === 'PseudoElementSelector'))) add('state before a combinator', '5', 'off');
      for (const n of c) if (n.type === 'PseudoClassSelector' && n.name === 'has') {
        const inner = csstree.generate(n);
        if (/:(?:hover|focus|active|checked|focus-visible|focus-within|target|disabled|open)/.test(inner)) add(':has() with a state', '5', 'off');
        else if ((inner.match(/[+~]/g) ?? []).length > 1 || /^:has\([^)]*?[^\s(][^)]*[+~]/.test(inner)) add(':has() with a later + / ~', '5', 'off');
        else add(':has() down the tree', '5', 'in');
      }
    }
  }
  return {checks: out, states};
}

function classifyAtRule(name, params) {
  const out = [], add = (id, section, verdict) => out.push({id, section, verdict});
  name = name.toLowerCase();
  if (name === 'media') {
    const feats = [...params.toLowerCase().matchAll(/\(\s*(?:not\s+)?([a-z-]+)\s*(?=[:<>=)])/g)].map(m => m[1]);
    if (!feats.length) add(`@media type only (${params.trim().slice(0, 20)})`, 'at-rule', 'in');
    for (const f of new Set(feats)) add(`@media (${f})`, 'at-rule', /^(?:min-|max-)?(?:width|height|inline-size|block-size)$/.test(f) ? 'in' : /^prefers-/.test(f) ? 'cond' : /^(?:hover|any-hover|pointer|any-pointer)$/.test(f) ? 'unlisted' : 'unlisted');
    if (/[<>]=?/.test(params)) add('@media range syntax', 'at-rule', 'in');
  } else if (name === 'container') add('@container', 'at-rule', 'cond');
  else if (name === 'supports') add('@supports', 'at-rule', 'unlisted');
  else if (name === 'layer') add('@layer', 'at-rule', 'in');
  else add(`@${name}`, 'at-rule', ['font-face', 'keyframes', '-webkit-keyframes', 'property', 'charset', 'import', 'namespace', 'page', 'counter-style', 'font-feature-values'].includes(name) ? 'n/a' : 'unlisted');
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// CSS walk: style rules with their resolved selector (nesting) and at-rule context, at-rules, declarations.
// ---------------------------------------------------------------------------------------------------------------
function cssRules(css) {
  let root; try { root = postcss.parse(css); } catch (e) { return {error: String(e.message).slice(0, 200), rules: [], atRules: []}; }
  const rules = [], atRules = [];
  const resolveSel = (node) => {
    const own = node.selector;
    let p = node.parent; while (p && p.type !== 'rule' && p.type !== 'root') p = p.parent;
    if (!p || p.type === 'root') return own;
    const parent = resolveSel(p);
    return own.split(/,(?![^(]*\))/).map(s => s.includes('&') ? s.replace(/&/g, `:is(${parent})`) : `:is(${parent}) ${s.trim()}`).join(', ');
  };
  root.walk(node => {
    if (node.type === 'atrule') atRules.push({name: node.name, params: node.params, line: node.source?.start?.line});
    if (node.type === 'rule') {
      const inKeyframes = (() => { for (let p = node.parent; p; p = p.parent) if (p.type === 'atrule' && /keyframes$/i.test(p.name)) return true; return false; })();
      if (inKeyframes) return;
      const decls = (node.nodes ?? []).filter(n => n.type === 'decl').map(d => ({prop: d.prop, value: d.value + (d.important ? ' !important' : '')}));
      rules.push({selector: resolveSel(node), decls, line: node.source?.start?.line});
    }
  });
  return {rules, atRules, root};
}

// A selector the snapshot can be matched with: pseudo-elements and state pseudo-classes taken out (a superset).
function matchable(selector) {
  return selector.split(/,(?![^(]*\))/).map(s => s
    .replace(/::?(?:before|after|placeholder|selection|marker|backdrop|first-line|first-letter|file-selector-button|-webkit-[\w-]+|-moz-[\w-]+|-ms-[\w-]+|part\([^)]*\)|slotted\([^)]*\)|view-transition[\w-]*(?:\([^)]*\))?|highlight\([^)]*\)|details-content|picker\([^)]*\)|picker-icon|checkmark|scroll-[\w-]+)/gi, '')
    .replace(new RegExp(`:(?:${[...STATE_PSEUDOS].map(s => s.replace(/[-]/g, '\\-')).join('|')})(?![\\w-])`, 'g'), '')
    .replace(/:not\(\s*\)/g, '').replace(/:is\(\s*\)|:where\(\s*\)/g, '*')
    .trim() || '*').map(s => /[>+~]\s*$/.test(s) ? `${s} *` : /^[>+~]/.test(s) ? `:scope ${s}` : s).join(', ');
}

// ---------------------------------------------------------------------------------------------------------------
// Snapshot tree: parse5, preorder element indices (html root, head left out) shared with the browser's matching.
// ---------------------------------------------------------------------------------------------------------------
const elementsOf = node => (node.childNodes ?? []).filter(n => n.tagName && n.tagName !== 'head');
const PREORDER_JS = `(() => { const out = []; const walk = el => { out.push(el); for (const c of el.children) if (c.localName !== 'head') walk(c); }; walk(document.documentElement); return out; })()`;

async function matchSelectors(page, selectors) {
  // In chunks: one evaluate returning every match of a large sheet can exhaust the renderer.
  const out = [];
  for (let i = 0; i < selectors.length; i += 500) out.push(...await matchChunk(page, selectors.slice(i, i + 500)));
  return out;
}
async function matchChunk(page, selectors) {
  return page.evaluate(([sels, preorderSrc]) => {
    const all = (0, eval)(preorderSrc), index = new Map(all.map((el, i) => [el, i]));
    return sels.map(s => { try { return [...document.querySelectorAll(s)].map(el => index.get(el)).filter(i => i !== undefined); } catch { return null; } });
  }, [selectors, PREORDER_JS]);
}

const HTML_CHECKS = (tree) => {
  const counts = {};
  const add = (id, section, verdict, k) => { const c = counts[id] ??= {id, section, verdict, elements: []}; c.elements.push(k); };
  (function walk(node) {
    for (const n of elementsOf(node)) {
      const a = Object.fromEntries((n.attrs ?? []).map(x => [x.name, x.value]));
      const tag = n.tagName;
      if (['hr', 'br', 'col', 'colgroup'].includes(tag)) add(`<${tag}>`, '7', 'off', n.__k);
      if (a.contenteditable !== undefined && a.contenteditable !== 'false') add('contenteditable', '7', 'off', n.__k);
      if ((a.width !== undefined || a.height !== undefined) && !['img', 'video', 'canvas', 'iframe', 'svg', 'source', 'embed', 'object', 'rect', 'image', 'use', 'mask', 'pattern', 'foreignObject', 'filter', 'clipPath', 'symbol', 'marker'].includes(tag) && !n.__svg) add('width/height attribute on a non-media element', '7', 'off', n.__k);
      if (['table', 'td', 'th'].includes(tag)) add(`<${tag}>`, '7', 'unlisted', n.__k);
      if (['input', 'select', 'textarea', 'button'].includes(tag)) add('form control', '1', 'cond', n.__k);
      if (tag === 'img') add('<img>', '2', 'cond', n.__k);
      if (tag === 'svg') add('inline <svg>', '1', 'cond', n.__k);
      if (tag === 'iframe' || tag === 'video' || tag === 'canvas') add(`<${tag}>`, '7', 'cond', n.__k);
      const kids = n.childNodes ?? [];
      if (!n.__svg && tag !== 'svg' && kids.some(c => c.nodeName === '#text' && c.value.trim()) && kids.some(c => c.tagName && !['span', 'a', 'strong', 'em', 'b', 'i', 'code', 'small', 'kbd', 'abbr', 'sup', 'sub', 'mark', 'time', 'q', 'cite', 'var', 'samp', 'u', 's', 'del', 'ins', 'bdi', 'bdo', 'data', 'dfn'].includes(c.tagName))) add('text mixed with non-phrasing children', '3', 'cond', n.__k);
      walk(n);
    }
  })(tree);
  return Object.values(counts);
};

// ---------------------------------------------------------------------------------------------------------------
// The dynamic peel.
// ---------------------------------------------------------------------------------------------------------------
const reasonOf = d => `${d.code} ${String(d.message).split('\n')[0]
  .replace(/-?(?:\d+\.?\d*|\.\d+)(px|rem|em|ch|ex|lh|%|vw|vh|vmin|vmax|dvh|svh|lvh|fr|deg|s|ms)\b/g, 'N$1').replace(/-?(?:\d+\.?\d*|\.\d+)%/g, 'N%').replace(/(?:[.#][\w-]+(?:\\:[\w-]+)*)+|[a-z][\w-]*@P[\d/]+/g, '.x')
  .replace(/"[^"]*"/g, '"…"').replace(/\b\d+(\.\d+)?\b/g, 'N').slice(0, 150)}`;

function boundTree(htmlRoot) {
  // Bring a tree inside the analyser's bounds: at most 2000 elements, 60 levels. The longest sibling runs are cut first
  // (to 3 of a kind), then the deepest subtrees. Returns the indices cut.
  const cut = [];
  const count = n => 1 + elementsOf(n).reduce((a, c) => a + count(c), 0);
  const drop = n => { (function mark(x) { cut.push(x.__k); for (const c of elementsOf(x)) mark(c); })(n); n.parentNode.childNodes.splice(n.parentNode.childNodes.indexOf(n), 1); };
  (function depth(n, d) { for (const c of elementsOf(n)) { if (d >= 60) drop(c); else depth(c, d + 1); } })(htmlRoot, 1);
  // A run: siblings of one tag and class list (list items, cards, rows). Cut the largest run to its first 3 first.
  const sig = n => `${n.tagName}.${(n.attrs?.find(a => a.name === 'class')?.value ?? '').trim().split(/\s+/).sort().join('.')}`;
  for (let guard = 0; count(htmlRoot) > 2000 && guard < 5000; guard++) {
    let best = null;
    (function find(n) {
      const groups = new Map(); for (const c of elementsOf(n)) { const g = groups.get(sig(c)) ?? []; g.push(c); groups.set(sig(c), g); }
      for (const g of groups.values()) if (g.length > 3 && (!best || g.length > best.length)) best = g;
      for (const c of elementsOf(n)) find(c);
    })(htmlRoot);
    if (best) { for (const c of best.slice(3)) drop(c); continue; }
    // No runs left: drop the largest subtree that is under half of what is left and not on the main chain.
    let big = null, bigSize = 0; const total = count(htmlRoot);
    (function find(n, d) { for (const c of elementsOf(n)) { const s = count(c); if (d > 2 && s > bigSize && s < total / 2) { big = c; bigSize = s; } find(c, d + 1); } })(htmlRoot, 0);
    if (!big) break; drop(big);
  }
  return cut;
}

function analyze(body, css, wrap, viewport, images) {
  try {
    const result = analyzeStates({states: [{html: body}], css}, {name: 'P', page: wrap, viewport: {min: viewport.width, max: viewport.width, height: {min: viewport.height, max: viewport.height}},
      ...(images && Object.keys(images).length ? {images} : {}), // The snapshot was rendered by Chromium with its UA sheet (body margin 8px, p margins, controls): its profile.
      ua: 'chromium', defaultFontSize: 16, defaultColors: true, scrollIntent: 'css', accessibility: true, integrity: true, selectors: true, assumeText: true,
      devicePixelRatios: [viewport.dpr ?? 1], scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
    return {status: result.status, diagnostics: result.states[0]?.report?.diagnostics ?? result.unknowns ?? []};
  } catch (error) { return {status: 'unknown', diagnostics: [{code: 'U_THROW', severity: 'unknown', message: String(error.message ?? error)}]}; }
}

async function peel(snapshot, viewport, page, total) {
  const html = snapshot.html;
  const htmlOpen = /<html([^>]*)>/i.exec(html), bodyOpen = /<body([^>]*)>/i.exec(html);
  const wrap = h => `<html${htmlOpen?.[1] ?? ''}><body${bodyOpen?.[1] ?? ''}>${h}</body></html>`;
  const tree = parse(html), htmlRoot = elementsOf(tree).find(n => n.tagName === 'html'), bodyNode = elementsOf(htmlRoot).find(n => n.tagName === 'body');
  let k = 0; (function number(n) { n.__k = k++; for (const c of elementsOf(n)) number(c); })(htmlRoot);
  const charges = [], blocked = new Set();
  const charge = (reason, indices, how, extra = {}) => { const fresh = indices.filter(i => !blocked.has(i)); for (const i of fresh) blocked.add(i); charges.push({reason, elements: fresh.length, how, ...extra}); };
  const cut = boundTree(htmlRoot);
  if (cut.length) charge('BOUND more than 2000 elements or 60 levels (input cut to fit)', cut, 'bound');
  let css = snapshot.css;
  if (css.length > 1_000_000) {
    // Drop the rules that match no element: they do nothing on this snapshot (safe-subset.md §9).
    const {root} = cssRules(css);
    const rules = []; root.walk(n => { if (n.type === 'rule' && !(n.parent?.type === 'atrule' && /keyframes$/i.test(n.parent.name))) rules.push(n); });
    const matched = await matchSelectors(page, rules.map(r => matchable(r.selector)));
    rules.forEach((r, i) => { if (matched[i] && matched[i].length === 0) r.remove(); });
    root.walk(n => { if (n.type === 'atrule' && /^(?:media|supports|layer|container)$/i.test(n.name) && n.nodes && !n.nodes.length) n.remove(); });
    css = root.toString();
  }
  const serializeBody = () => serialize(bodyNode);
  let status = 'unknown', steps = 0, note = '';
  if (serializeBody().length > 1_000_000 || css.length > 1_000_000) { charge('BOUND more than 1 MB of HTML or CSS after cutting', [...Array(total).keys()], 'bound'); return {status: 'unknown', steps, charges, decided: total - blocked.size, note: 'over the size bound'}; }
  const began = performance.now();
  for (; steps < maxSteps && performance.now() - began < budget; steps++) {
    const r = analyze(serializeBody(), css, wrap, viewport, snapshot.images);
    const unknown = r.diagnostics.filter(d => d.severity === 'unknown');
    if (!unknown.length) { status = r.status; break; }
    let progressed = false;
    // Located on a box: remove the box (each Unknown once; nested boxes covered by their ancestor).
    const located = [];
    for (const d of unknown) {
      if (!/^P(?:\/\d+)+$/.test(String(d.path ?? ''))) continue;
      let node = htmlRoot;
      for (const i of d.path.split('/').slice(1).map(Number)) node = node && elementsOf(node)[i];
      if (!node || node === bodyNode || node === htmlRoot) continue;
      located.push({d, node});
    }
    const removed = new Set();
    for (const {d, node} of located) {
      let inside = false; for (let p = node; p; p = p.parentNode) if (removed.has(p)) inside = true;
      if (inside || !node.parentNode) continue;
      const ks = []; (function mark(x) { ks.push(x.__k); for (const c of elementsOf(x)) mark(c); })(node);
      charge(reasonOf(d), ks, 'box'); removed.add(node);
      node.parentNode.childNodes.splice(node.parentNode.childNodes.indexOf(node), 1); progressed = true;
    }
    if (progressed) continue;
    // Located on a CSS rule: remove the rule (or the at-rule), charged with the elements its selectors match.
    const lines = new Map(unknown.filter(d => d.css?.line && (d.css.file ?? '<css>') === '<css>').map(d => [d.css.line, d]));
    if (lines.size) {
      const {root} = cssRules(css);
      if (root) {
        const hits = [];
        root.walk(n => { if ((n.type === 'rule' || n.type === 'atrule' || n.type === 'decl') && lines.has(n.source?.start?.line)) hits.push(n); });
        // The outermost node on that line (a rule rather than its first declaration).
        const targets = []; for (const n of hits) { let x = n.type === 'decl' ? n.parent : n; if (!targets.includes(x)) targets.push(x); }
        for (const t of targets) {
          const d = lines.get(t.source?.start?.line) ?? lines.get([...lines.keys()][0]);
          const sels = []; if (t.type === 'rule') sels.push(t.selector); else t.walk?.(n => { if (n.type === 'rule') sels.push(n.selector); });
          const matched = sels.length ? await matchSelectors(page, sels.map(matchable)) : [];
          // A CSS-level Unknown stops the whole page on its own: recorded (with the elements its rule touches), not
          // charged, so the page's elements go to the box Unknowns and to the page-level one that remains.
          charges.push({reason: reasonOf(d), elements: 0, matched: new Set(matched.flat().filter(i => i !== null && i !== undefined)).size, how: t.type === 'rule' ? 'rule' : 'at-rule'});
          t.remove(); progressed = true;
        }
        if (progressed) { css = root.toString(); continue; }
      }
    }
    // Neither: the rest of the page.
    const rest = [...Array(total).keys()].filter(i => !blocked.has(i));
    const d0 = unknown[0]; charge(reasonOf(d0), rest, 'page', {box: d0.box, path: d0.path, line: d0.css?.line}); note = 'page-level Unknown'; break;
  }
  if (status === 'unknown' && !note && (steps >= maxSteps || performance.now() - began >= budget)) { charge(`STEPS more than ${maxSteps} peel steps or ${budget / 1000}s`, [...Array(total).keys()], 'page'); note = 'step limit'; }
  return {status, steps, charges, decided: total - blocked.size, ...(note ? {note} : {})};
}

// ---------------------------------------------------------------------------------------------------------------
const manifest = JSON.parse(readFileSync(join(corpus, 'manifest.json'), 'utf8'));
const pages = manifest.pages.filter(p => !p.skipped && existsSync(join(corpus, 'snapshots', `${p.id}.json`)) && (!only.length || only.includes(p.id)));
// --jobs N: the pages split over N child processes (each analysis is single-threaded), merged in manifest order.
const jobs = Number(opt('--jobs', '1'));
if (jobs > 1) {
  const {spawn} = await import('node:child_process');
  const parts = Array.from({length: jobs}, (_, j) => pages.filter((_, i) => i % jobs === j).map(p => p.id)).filter(p => p.length);
  const outs = await Promise.all(parts.map((ids, j) => new Promise((done, fail) => {
    const file = `${outFile}.part${j}`;
    const rest = args.filter((a, i) => !['--only', '--jobs', '--out'].includes(a) && !['--only', '--jobs', '--out'].includes(args[i - 1]));
    const child = spawn(process.execPath, [new URL(import.meta.url).pathname, ...rest, '--only', ids.join(','), '--out', file], {stdio: ['ignore', 'inherit', 'inherit']});
    // A job that dies loses its pages, not the run: they are listed as failed in the result.
    child.on('exit', code => { if (code !== 0) console.error(`job ${j} exited ${code}: its pages without a result are listed in failed`); done(existsSync(file) ? file : null); });
  })));
  const merged = outs.filter(Boolean).flatMap(f => JSON.parse(readFileSync(f, 'utf8')).pages);
  const failed = pages.map(p => p.id).filter(id => !merged.some(m => m.id === id));
  const order = new Map(pages.map((p, i) => [p.id, i]));
  merged.sort((a, b) => order.get(a.id) - order.get(b.id));
  mkdirSync(dirname(outFile), {recursive: true});
  writeFileSync(outFile, JSON.stringify({generated: new Date().toISOString().slice(0, 10), widths, maxSteps, budget, failed, pages: merged}, null, 1) + '\n');
  for (const f of outs.filter(Boolean)) (await import('node:fs')).rmSync(f);
  console.error(`wrote ${outFile}`);
  process.exit(0);
}
const browser = await chromium.launch({headless: true});
const results = [], failed = [];
for (const entry of pages) try {
  const started = performance.now();
  const snapshot = JSON.parse(readFileSync(join(corpus, 'snapshots', `${entry.id}.json`), 'utf8'));
  const context = await browser.newContext({javaScriptEnabled: false});
  await context.route('**/*', route => route.abort());
  const page = await context.newPage();
  await page.setContent(snapshot.html, {waitUntil: 'domcontentloaded'}).catch(() => {});
  // Element indices: parse5 and the browser must agree.
  const tree = parse(snapshot.html), htmlRoot = elementsOf(tree).find(n => n.tagName === 'html');
  let k = 0; (function number(n, svg) { n.__k = k++; n.__svg = svg; for (const c of elementsOf(n)) number(c, svg || n.tagName === 'svg'); })(htmlRoot, false);
  const total = k;
  const browserTotal = await page.evaluate(`${PREORDER_JS}.length`);
  // Static inventory.
  const {rules, atRules, error} = cssRules(snapshot.css);
  const matches = await matchSelectors(page, rules.map(r => matchable(r.selector)));
  const inv = new Map();
  const bump = (c, live, elements) => {
    const key = `${c.section}\u0000${c.id}`, e = inv.get(key) ?? {id: c.id, section: c.section, verdict: c.verdict, count: 0, live: 0, elements: new Set()};
    e.count++; if (live) e.live++; for (const i of elements ?? []) e.elements.add(i); inv.set(key, e);
  };
  let declarations = 0, liveDeclarations = 0;
  // Each live declaration on a layout or text property by its worst verdict (off > unlisted > cond > in; no check: in),
  // and the elements touched by at least one declaration (or selector) of each verdict.
  const RANK = {in: 0, cond: 1, unlisted: 2, off: 3};
  const declVerdicts = {in: 0, cond: 0, unlisted: 0, off: 0}, verdictElements = {cond: new Set(), unlisted: new Set(), off: new Set()}, selectorVerdicts = {in: 0, cond: 0, unlisted: 0, off: 0};
  const worst = checks => checks.filter(c => c.verdict in RANK && c.section !== 'property').reduce((w, c) => RANK[c.verdict] > RANK[w] ? c.verdict : w, 'in');
  const liveRuleCount = matches.filter(m => m === null || m.length).length;
  rules.forEach((rule, i) => {
    const m = matches[i], live = m === null || m.length > 0, elements = m ?? [];
    const {checks: selChecks, states} = classifySelector(rule.selector);
    for (const c of selChecks) bump(c, live, elements);
    if (live) { const w = worst(selChecks); selectorVerdicts[w]++; if (w !== 'in') for (const i of elements) verdictElements[w].add(i); }
    const layoutInState = states.length && rule.decls.some(d => !d.prop.startsWith('--') && !PAINT_PROPS.test(d.prop.toLowerCase()));
    if (layoutInState) bump(states.every(s => RELAYOUT_STATES.has(s)) ? {id: 'hover/focus/active rule that changes layout', section: '5', verdict: 'cond'} : {id: 'other state rule that changes layout', section: '5', verdict: 'off'}, live, elements);
    for (const d of rule.decls) {
      declarations++; if (live) liveDeclarations++;
      bump({id: `property ${d.prop.toLowerCase()}`, section: 'property', verdict: 'feature'}, live, elements);
      const checks = classifyDeclaration(d.prop, d.value);
      for (const c of checks) bump(c, live, elements);
      if (live && !d.prop.startsWith('--') && (LAYOUT_PROPS.test(d.prop.toLowerCase()) || checks.some(c => c.verdict in RANK))) {
        const w = worst(checks); declVerdicts[w]++; if (w !== 'in') for (const i of elements) verdictElements[w].add(i);
      }
    }
  });
  for (const a of atRules) for (const c of classifyAtRule(a.name, a.params)) bump(c, true, []);
  for (const c of HTML_CHECKS(htmlRoot)) { const e = {id: c.id, section: c.section, verdict: c.verdict, count: c.elements.length, live: c.elements.length, elements: new Set(c.elements)}; inv.set(`${c.section}\u0000html ${c.id}`, e); }
  const inventory = [...inv.values()].map(e => ({id: e.id, section: e.section, verdict: e.verdict, count: e.count, live: e.live, elements: e.elements.size}));
  // Dynamic.
  const dynamic = [];
  for (const viewport of widths) {
    const t = performance.now();
    const r = await peel(snapshot, viewport, page, total);
    dynamic.push({viewport, ...r, ms: Math.round(performance.now() - t)});
  }
  await context.close();
  results.push({id: entry.id, kind: entry.kind, system: entry.system, public: entry.public, elements: total, browserElements: browserTotal, cssBytes: snapshot.css.length, htmlBytes: snapshot.html.length,
    rules: rules.length, liveRules: liveRuleCount, declarations, liveDeclarations, declVerdicts, selectorVerdicts, verdictElements: Object.fromEntries(Object.entries(verdictElements).map(([k, v]) => [k, v.size])), ...(error ? {cssError: error} : {}), inventory, dynamic});
  console.error(`${entry.id}: ${total} el (browser ${browserTotal}), ${rules.length} rules (${liveRuleCount} live); ` + dynamic.map(d => `${d.viewport.width}: ${d.status} decided ${d.decided}/${total} in ${d.steps} steps ${d.ms}ms${d.note ? ` (${d.note})` : ''}`).join('; ') + ` [${Math.round(performance.now() - started)}ms]`);
} catch (error) { failed.push(entry.id); console.error(`${entry.id}: failed: ${String(error.message ?? error).split('\n')[0]}`); }
await browser.close();
mkdirSync(dirname(outFile), {recursive: true});
writeFileSync(outFile, JSON.stringify({generated: new Date().toISOString().slice(0, 10), widths, maxSteps, budget, failed, pages: results}, null, 1) + '\n');
console.error(`wrote ${outFile}`);
