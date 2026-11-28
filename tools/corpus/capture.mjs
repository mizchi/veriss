// Build the safe-subset coverage corpus: each page rendered in Chromium, saved as the {html, css} snapshot veriss reads.
//
// The snapshot is what vlmkit's veriss bridge hands veriss (vlmkit packages/vlmkit-markup/src/inspect/veriss-bridge.ts):
// the DOM after the page's scripts ran, with the head cut to its meta and title and every <style>/<link>/<script>/
// <noscript>/<template> in the body replaced by an empty <template> (so :nth-child counts what the browser counted),
// plus the text of every author stylesheet in document order, a sheet with a media attribute wrapped in @media.
// Sheets without an owner element (@import targets, constructed sheets) are put first (imports) or last (constructed)
// and counted in `unordered`; the bridge refuses such pages, this corpus keeps them and says so.
//
// Usage:
//   node tools/corpus/capture.mjs [--only id,id] [--set local|public|all] [--vlmkit <checkout> | VLMKIT_DIR=<checkout>]
//          [--delay ms] [--out evals/corpus]
// Sources are listed in tools/corpus/sources.mjs. Public pages: robots.txt is read first (the `*` group, longest match
// wins) and a disallowed page is skipped; one request per page (plus its subresources), one page at a time.
import {mkdirSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {localSources, publicSources} from './sources.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const set = opt('--set', 'all'), only = opt('--only', '')?.split(',').filter(Boolean) ?? [];
// The vlmkit checkout the local pages come from: --vlmkit, else VLMKIT_DIR, else the ghq path.
const vlmkit = resolve(opt('--vlmkit', process.env.VLMKIT_DIR ?? `${process.env.HOME}/ghq/github.com/mizchi/vlmkit`));
// Milliseconds between two public pages (one page at a time, never in parallel).
const delay = Number(opt('--delay', '3000'));
const outDir = resolve(opt('--out', 'evals/corpus'));
// A current desktop Chrome's user agent, without anything that identifies the person running the capture.
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const VIEWPORT = {width: 1280, height: 900};

const RENDERED_HTML_JS = `(() => {
  const root = document.documentElement.cloneNode(true);
  const head = root.querySelector("head");
  if (head) for (const el of [...head.children]) if (el.localName !== "meta" && el.localName !== "title") el.remove();
  for (const el of root.querySelectorAll("body style, body link, body script, body noscript, body template"))
    el.replaceWith(document.createElement("template"));
  return "<!doctype html>" + root.outerHTML;
})()`;
const LOADED_IMAGES_JS = `(() => {
  const out = Object.create(null); let count = 0;
  const put = (key, img) => { if (!key || Object.prototype.hasOwnProperty.call(out, key) || count >= 1024) return; out[key] = {width: img.naturalWidth, height: img.naturalHeight}; count++; };
  const href = url => { try { return new URL(url, document.baseURI).href; } catch { return null; } };
  for (const img of document.images) {
    if (!img.complete || !(img.naturalWidth > 0) || !(img.naturalHeight > 0)) continue;
    const src = img.getAttribute("src"), picture = img.parentElement && img.parentElement.localName === "picture";
    if (src !== null && !img.getAttribute("srcset") && !picture) { put(src, img); continue; }
    const lists = [img.getAttribute("srcset"), ...(picture ? [...img.parentElement.querySelectorAll("source")].map(s => s.getAttribute("srcset")) : [])];
    for (const list of lists) for (const c of String(list || "").split(",")) { const url = c.trim().split(/\\s+/)[0]; if (url && href(url) === img.currentSrc) put(url, img); }
    if (src !== null && href(src) === img.currentSrc) put(src, img);
  }
  return {...out};
})()`;

// robots.txt, the `*` group only: the longest matching Allow/Disallow prefix wins (RFC 9309), `*` and `$` honoured.
const robotsCache = new Map();
async function allowedByRobots(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    let text = '';
    try { const r = await fetch(`${u.origin}/robots.txt`, {headers: {'user-agent': USER_AGENT}, signal: AbortSignal.timeout(15000)}); if (r.ok) text = await r.text(); } catch {}
    const rules = []; let inStar = false, sawRule = false;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
      const [k, ...rest] = line.split(':'); const key = k.trim().toLowerCase(), value = rest.join(':').trim();
      if (key === 'user-agent') { if (sawRule) { inStar = false; sawRule = false; } if (value === '*') inStar = true; }
      else if (key === 'allow' || key === 'disallow') { sawRule = true; if (inStar && value) rules.push({allow: key === 'allow', value}); }
    }
    robotsCache.set(u.origin, rules);
  }
  const path = u.pathname + u.search; let best = null;
  for (const r of robotsCache.get(u.origin)) {
    const re = new RegExp('^' + r.value.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(path) && (!best || r.value.length > best.value.length || (r.value.length === best.value.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

async function capture(browser, source) {
  const context = await browser.newContext({viewport: VIEWPORT, userAgent: USER_AGENT, locale: 'en-US', colorScheme: 'light', reducedMotion: 'reduce'});
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  const sheets = new Map();
  session.on('CSS.styleSheetAdded', ({header}) => sheets.set(header.styleSheetId, header));
  await session.send('DOM.enable'); await session.send('CSS.enable');
  const response = await page.goto(source.url, {waitUntil: 'load', timeout: 60000});
  await page.waitForLoadState('networkidle', {timeout: 10000}).catch(() => {});
  await page.waitForTimeout(source.public ? 2000 : 300);
  const {root} = await session.send('DOM.getDocument', {depth: -1});
  const order = new Map(), ownerMedia = new Map();
  (function walk(n) {
    order.set(n.backendNodeId, order.size);
    const a = n.attributes ?? [];
    for (let i = 0; i + 1 < a.length; i += 2) if (a[i].toLowerCase() === 'media' && a[i + 1].trim()) ownerMedia.set(n.backendNodeId, a[i + 1].trim());
    for (const c of [...(n.children ?? []), ...(n.contentDocument ? [n.contentDocument] : [])]) walk(c);
  })(root);
  // Only sheets of the top document (an iframe's sheets style another document).
  const frameId = (await session.send('Page.getFrameTree')).frameTree.frame.id;
  const regular = [...sheets.values()].filter(h => h.origin === 'regular' && !h.disabled && h.frameId === frameId);
  const placed = h => h.ownerNode !== undefined && order.has(h.ownerNode);
  const rank = h => placed(h) ? order.get(h.ownerNode) : h.isConstructed ? Infinity : -1;
  regular.sort((a, b) => rank(a) - rank(b));
  const texts = [];
  for (const h of regular) {
    const got = await session.send('CSS.getStyleSheetText', {styleSheetId: h.styleSheetId}).catch(() => null);
    if (!got) continue;
    const media = placed(h) ? ownerMedia.get(h.ownerNode) : undefined;
    texts.push({url: h.sourceURL || (h.isInline ? 'inline' : 'constructed'), placed: placed(h), constructed: !!h.isConstructed, bytes: got.text.length,
      text: media && media.toLowerCase() !== 'all' ? `@media ${media} {\n${got.text}\n}` : got.text});
  }
  const html = await page.evaluate(RENDERED_HTML_JS);
  const images = await page.evaluate(LOADED_IMAGES_JS).catch(() => ({}));
  const elements = await page.evaluate('document.body ? document.body.querySelectorAll("*").length + 1 : 0');
  await context.close();
  const css = texts.map(t => t.text).join('\n');
  return {
    snapshot: {html, css, images},
    meta: {status: response?.status() ?? null, finalUrl: page.url(), sheets: texts.map(({text, ...t}) => t), unordered: texts.filter(t => !t.placed).length,
      htmlBytes: html.length, cssBytes: css.length, elements, images: Object.keys(images).length},
  };
}

const sources = [...(set === 'public' ? [] : localSources(vlmkit)), ...(set === 'local' ? [] : publicSources)]
  .filter(s => !only.length || only.includes(s.id));
mkdirSync(join(outDir, 'snapshots'), {recursive: true});
const manifestFile = join(outDir, 'manifest.json');
const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {pages: []};
if (sources.some(s => !s.public) && !existsSync(join(vlmkit, 'examples/sites'))) console.error(`warning: no vlmkit checkout at ${vlmkit} (give --vlmkit or VLMKIT_DIR): its pages are skipped`);
const browser = await chromium.launch({headless: true});
let lastPublic = 0;
for (const source of sources) {
  if (!source.public && !existsSync(source.path ? join(vlmkit, source.path) : '')) { console.error(`${source.id}: skipped (not in the vlmkit checkout)`); continue; }
  if (source.public) { const wait = lastPublic + delay - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait)); lastPublic = Date.now(); }
  const entry = {id: source.id, kind: source.kind, system: source.system, source: source.public ? source.url : source.path, public: !!source.public,
    terms: source.terms, date: new Date().toISOString().slice(0, 10), viewport: VIEWPORT, browser: `chromium ${browser.version()}`};
  try {
    if (source.public && !(await allowedByRobots(source.url))) { entry.skipped = 'robots.txt disallows'; console.error(`${source.id}: skipped (robots.txt)`); }
    else {
      const {snapshot, meta} = await capture(browser, source);
      // An error page or a bot check is not the page: skipped, never measured as if it were.
      if (meta.status >= 400 || /<title>\s*(?:Just a moment|Attention Required|Access denied)/i.test(snapshot.html)) throw new Error(`HTTP ${meta.status} or a bot check instead of the page`);
      const body = JSON.stringify(snapshot);
      writeFileSync(join(outDir, 'snapshots', `${source.id}.json`), body);
      // A local page's URLs are paths on the machine that captured it: kept relative to the vlmkit checkout.
      if (!source.public) { const base = pathToFileURL(vlmkit).href + '/'; meta.finalUrl = meta.finalUrl.replace(base, 'vlmkit:'); for (const s of meta.sheets) s.url = s.url.replace(base, 'vlmkit:'); }
      Object.assign(entry, meta, {sha256: createHash('sha256').update(body).digest('hex')});
      console.error(`${source.id}: ${meta.elements} elements, ${meta.sheets.length} sheets, css ${meta.cssBytes} B, html ${meta.htmlBytes} B${meta.unordered ? `, ${meta.unordered} unordered` : ''}`);
    }
  } catch (error) { entry.skipped = `capture failed: ${String(error.message ?? error).split('\n')[0]}`; console.error(`${source.id}: ${entry.skipped}`); }
  manifest.pages = [...manifest.pages.filter(p => p.id !== source.id), entry];
}
await browser.close();
manifest.pages.sort((a, b) => a.id.localeCompare(b.id));
manifest.note = 'Snapshots of public pages are third-party content and are not committed (evals/corpus/.gitignore); rebuild them with tools/corpus/capture.mjs. Pages change: the sha256 is of the snapshot measured.';
writeFileSync(manifestFile, JSON.stringify(manifest, null, 1) + '\n');
