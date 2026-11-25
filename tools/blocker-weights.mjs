// Which Unknown reasons block how much of real pages. The engine stops a layout at its first Unknown and reports no
// sizes, so counting decided boxes directly is not possible. Instead, per page: remove the box of the first Unknown
// (with its subtree) from the HTML and analyse again, until the page is decided or the Unknown cannot be located.
// Each removed subtree's element count is charged to that Unknown's reason; a page-level Unknown (or one whose box
// cannot be removed) is charged the rest of the page. Removing a box changes its parent's layout, so the weights are an
// estimate of what each reason holds back, not a proof.
//
// Input: snapshot files, each JSON {html, css} (the page's HTML with <body>, and its CSS as one string).
// Usage: node tools/blocker-weights.mjs [--font <family>=<file>]... [--strip-attrs a,b,c] [--steps N] [--out result.json] <snapshot.json>...
//   --font         measure the text in that family with the font file (wrapping text, break-all, …)
//   --strip-attrs  drop these attributes from non-form elements first (props a component library leaks to the DOM)
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
// parse5 is a dependency of packages/veriss (not of the root).
const {parse, serialize} = createRequire(new URL('../packages/veriss/package.json', import.meta.url))('parse5');
import {analyzeStates} from '../packages/adapter-core/src/index.mjs';
import {loadTextMetrics} from '../packages/veriss/src/text-node.mjs';

const args = process.argv.slice(2), files = [], fonts = {};
let strip = [], steps = 80, out = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--font') { const [family, file] = args[++i].split('='); fonts[family] = {file}; }
  else if (args[i] === '--strip-attrs') strip = args[++i].split(',').filter(Boolean);
  else if (args[i] === '--steps') steps = Number(args[++i]);
  else if (args[i] === '--out') out = args[++i];
  else files.push(args[i]);
}
if (!files.length) { console.error('usage: node tools/blocker-weights.mjs [--font family=file] [--strip-attrs a,b] [--steps N] [--out file] <snapshot.json>...'); process.exit(2); }
const textMetrics = Object.keys(fonts).length ? await loadTextMetrics({fonts}) : undefined;

// The engine's box paths (P/0/3/…) index element children, with html as P and head left out.
const elementsOf = node => (node.childNodes ?? []).filter(n => n.tagName && n.tagName !== 'head');
const count = node => 1 + elementsOf(node).reduce((a, n) => a + count(n), 0);
// A reason without its box names and numbers, so the same reason on different boxes adds up.
const reasonOf = d => `${d.code} ${String(d.message).replace(/-?\d+(\.\d+)?px/g, 'Npx').replace(/(?:[.#][\w-]+)+|[a-z]+@P[\d/]+/g, '.x').slice(0, 140)}`;
const formTags = new Set(['input', 'select', 'textarea', 'img', 'video', 'canvas', 'iframe', 'table', 'td', 'th', 'col', 'colgroup', 'embed', 'object', 'hr', 'font']);

const weights = new Map(), pages = [];
for (const file of files) {
  const snapshot = JSON.parse(readFileSync(file, 'utf8'));
  let html = snapshot.html;
  if (strip.length) {
    const pattern = new RegExp(`\\s(?:${strip.map(a => a.replace(/[^\w-]/g, '')).join('|')})="[^"]*"`, 'gi');
    html = html.replace(/<([a-z][\w-]*)([^>]*)>/g, (m, tag, attrs) => formTags.has(tag) ? m : `<${tag}${attrs.replace(pattern, '')}>`);
  }
  const bodyOpen = /<body([^>]*)>/.exec(html);
  if (!bodyOpen) { console.error(`${file}: no <body>`); continue; }
  const lang = /<html[^>]*\blang="([^"]+)"/.exec(html)?.[1] ?? 'en';
  let body = html.slice(bodyOpen.index + bodyOpen[0].length, html.lastIndexOf('</body>'));
  const wrap = h => `<html lang="${lang}"><body${bodyOpen[1]}>${h}</body></html>`;
  const total = count(elementsOf(parse(wrap(body))).find(n => n.tagName === 'html'));
  const chain = []; let status = 'unknown', note = '';
  const charged = () => chain.reduce((a, c) => a + c.boxes, 0);
  for (let step = 0; step < steps; step++) {
    const result = analyzeStates({states: [{html: body}], css: snapshot.css}, {name: 'P', page: wrap, viewport: {min: 320, max: 1440, height: {min: 600, max: 900}}, defaultFontSize: 16, defaultColors: true, scrollIntent: 'css', accessibility: true, integrity: true, selectors: true, assumeText: true, ...(textMetrics ? {textMetrics, fonts} : {}), scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
    const unknown = (result.states[0].report.diagnostics ?? []).filter(d => d.severity === 'unknown');
    if (!unknown.length) { status = result.status; break; }
    const d = unknown.find(d => /^P(?:\/\d+)+$/.test(String(d.path ?? '')));
    if (!d) { note = 'page-level Unknown'; chain.push({reason: reasonOf(unknown[0]), boxes: total - charged(), rest: true}); break; }
    const tree = parse(wrap(body));
    let node = elementsOf(tree).find(n => n.tagName === 'html');
    for (const i of d.path.split('/').slice(1).map(Number)) node = node && elementsOf(node)[i];
    // The located element must be the reported box (its tag, or every class of its label).
    const label = String(d.box ?? ''), classes = new Set((node?.attrs?.find(a => a.name === 'class')?.value ?? '').split(/\s+/).filter(Boolean));
    const same = node && (label.includes('@') ? node.tagName === label.split('@')[0] : label.split(/[.#]/).filter(Boolean).every(c => classes.has(c) || node.attrs?.some(a => a.name === 'id' && a.value === c)));
    if (!same || ['html', 'body'].includes(node.tagName)) { note = `cannot remove ${label} (${d.path})`; chain.push({reason: reasonOf(d), boxes: total - charged(), rest: true}); break; }
    chain.push({reason: reasonOf(d), boxes: count(node)});
    node.parentNode.childNodes.splice(node.parentNode.childNodes.indexOf(node), 1);
    body = serialize(elementsOf(elementsOf(tree).find(n => n.tagName === 'html')).find(n => n.tagName === 'body'));
  }
  pages.push({file, elements: total, status, removed: charged(), chain, ...(note ? {note} : {})});
  for (const c of chain) { const w = weights.get(c.reason) ?? {boxes: 0, pages: new Set()}; w.boxes += c.boxes; w.pages.add(file); weights.set(c.reason, w); }
  console.error(`${file}: ${total} elements, ${chain.length} Unknown removed, ${status}${note ? ` (${note})` : ''}`);
}
const all = pages.reduce((a, p) => a + p.elements, 0);
const ranked = [...weights].sort((a, b) => b[1].boxes - a[1].boxes).map(([reason, w]) => ({reason, boxes: w.boxes, share: w.boxes / all, pages: w.pages.size}));
if (out) writeFileSync(out, JSON.stringify({pages, weights: ranked}, null, 1));
console.log(`${pages.length} pages, ${all} elements; decided once their Unknown boxes are removed: ${pages.filter(p => p.status !== 'unknown').length}`);
for (const w of ranked.slice(0, 40)) console.log(`${String(w.boxes).padStart(6)} boxes ${(100 * w.share).toFixed(1).padStart(5)}%  ${String(w.pages).padStart(3)} pages  ${w.reason}`);
