// Aggregate tools/subset-coverage.mjs's per-page results: coverage by section of safe-subset.md (static), the decided
// share per width (dynamic), and the Unknown reasons grouped into gap families, ranked.
//
// Usage: node tools/subset-coverage-summary.mjs [coverage.json] [--out summary.json] [--md tables.md]
import {readFileSync, writeFileSync} from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const input = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? 'evals/results/safe-subset-coverage/coverage.json';
const {pages, widths} = JSON.parse(readFileSync(input, 'utf8'));
// Box labels are utility class lists on many pages (.x:hidden.x(--z-mobile-bar)…): the same reason on other boxes is one
// reason, so every token that starts with . or # (or a tag@path) is one placeholder.
const norm = r => r.replace(/(^|[\s(,])(?:[.#][^\s,]+|[a-z][\w-]*@P[\d/]*)/g, '$1.x').replace(/(?:\.x\s*)+/g, '.x ').replace(/\s+/g, ' ').trim();
for (const p of pages) for (const d of p.dynamic) for (const c of d.charges) c.reason = norm(c.reason);

// Gap families: the first that matches the reason (code + normalized message) names it.
export const FAMILIES = [
  ['input-bound', /^BOUND /, '入力の上限(2048 要素・64 段・1 MB)'],
  ['step-limit', /^STEPS /, '剥がし手順の上限'],
  ['analysis-limit', /U_LAYOUT_LIMIT |U_ADAPTER_ANALYSIS /, '解析の上限(custom property の束縛数・作業量)'],
  ['supports', /@supports/, '@supports(対象ブラウザーで決まらない条件)'],
  ['media-em-unit', /U_LAYOUT_QUERY Unsupported media condition: .*\d?N(?:em|rem)\b/, '@media の em / rem'],
  ['media-only', /U_LAYOUT_QUERY Unsupported media condition: (?:not )?only /, '@media の only'],
  ['media-hover-pointer', /U_LAYOUT_QUERY .*\((?:any-)?(?:hover|pointer)/, '@media (hover) / (pointer)'],
  ['preference-query', /U_LAYOUT_QUERY .*(?:Preference media|prefers-|forced-colors)/, '@media の利用者設定(prefers-*)'],
  ['resolution-query', /U_LAYOUT_QUERY .*resolution/, '@media の解像度'],
  ['container-query', /U_LAYOUT_QUERY .*container condition|U_LAYOUT_QUERY .*@container/i, '@container'],
  ['media-query-other', /U_LAYOUT_QUERY /, 'その他の @media / @supports'],
  ['state-selector', /U_LAYOUT_SELECTOR .*(?:State selector|:hover|:focus|:checked|placeholder|holds only)/i, '状態のセレクター'],
  ['selector-other', /U_LAYOUT_SELECTOR /, 'その他のセレクター'],
  ['inline-formatting', /U_LAYOUT_INLINE |inline-level|line layout|inline box/i, 'inline 整形(行の中の箱)'],
  ['text-mixed', /mixes text with child elements|anonymous/i, 'テキストと子要素の混在'],
  ['intrinsic-content', /content width is not known|max-content|min-content|automatic minimum size|shrink-to-fit|content size|U_LAYOUT_INTRINSIC|U_LAYOUT_GRID_FR|fit-content/i, '中身で決まる大きさ(intrinsic)'],
  ['margin', /margin/i, 'margin(auto・%・相殺・UA 既定)'],
  ['math-function', /min\(|max\(|clamp\(|Unsupported CSS pixel length/i, 'min() / max() / clamp() と長さ'],
  ['float-columns', /\bfloat\b|\bclear\b|layout property: columns|column-count|column-width|multi-column/i, 'float・段組'],
  ['table', /U_LAYOUT_TABLE|\btable\b/i, '表'],
  ['positioned', /U_LAYOUT_POSITIONED|U_LAYOUT_FIXED|absolute|sticky|fixed|inset|static position/i, '絶対配置・sticky・fixed'],
  ['element', /U_LAYOUT_ELEMENT|U_LAYOUT_HTML|Native or foreign element|rendering attribute|U_LAYOUT_ATTRIBUTE|contenteditable|U_LAYOUT_LEGEND|U_LAYOUT_DIALOG|U_LAYOUT_POPOVER/, 'HTML の要素・属性'],
  ['image', /U_LAYOUT_IMAGE|\bimg\b|image/i, '画像・置換要素'],
  ['form-control', /form element|input|select|textarea|button/i, 'フォーム部品'],
  ['grid', /Grid|grid/, 'grid(トラック・配置)'],
  ['flex', /U_LAYOUT_FLEX|flex/i, 'flex'],
  ['text-property', /line-break|word-break|text-rendering|text-box|letter-spacing|white-space|writing-mode|text-|font|line-height|hyphens|U_LAYOUT_TEXT/i, 'テキストの性質(改行・字形)'],
  ['variable', /U_LAYOUT_VARIABLE|var\(/, 'CSS 変数'],
  ['pseudo', /U_LAYOUT_PSEUDO|::/, '擬似要素'],
  ['animation', /animation|transition|keyframe/i, 'アニメーション'],
  ['unsupported-property', /Unsupported (?:layout )?property|Unsupported [a-z-]+:/i, '未対応のプロパティ(その他)'],
  ['other', /./, 'その他'],
];
const familyOf = reason => FAMILIES.find(([, re]) => re.test(reason));

const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);
const pct = x => `${(100 * x).toFixed(1)}%`;
const groups = [['all', () => true], ['vlmkit', p => !p.public], ['public', p => p.public]];

// ---- dynamic
const dynamic = widths.map((viewport, wi) => {
  const out = {viewport, groups: {}};
  for (const [g, keep] of groups) {
    const ps = pages.filter(keep);
    const elements = sum(ps, p => p.elements), decided = sum(ps, p => p.dynamic[wi].decided);
    out.groups[g] = {pages: ps.length, elements, decided, decidedShare: decided / elements, meanPageShare: sum(ps, p => p.dynamic[wi].decided / p.elements) / ps.length,
      firstPassDecided: ps.filter(p => p.dynamic[wi].status !== 'unknown' && !p.dynamic[wi].charges.length).length,
      endedDecided: ps.filter(p => p.dynamic[wi].status !== 'unknown').length,
      pageStoppedAtEnd: ps.filter(p => p.dynamic[wi].charges.some(c => c.how === 'page')).length};
  }
  // Reasons and families. elements: charged (box subtrees, page-level rests, bounds); score: Σ over pages of the share
  // of the page charged; stops: pages where the reason stopped the whole page (a CSS-level or a page-level Unknown).
  const reasons = new Map(), families = new Map();
  for (const p of pages) {
    const seenR = new Set(), seenF = new Set();
    for (const c of p.dynamic[wi].charges) {
      const [fam, , label] = familyOf(c.reason);
      for (const [map, key, seen, extra] of [[reasons, c.reason, seenR, {family: fam}], [families, fam, seenF, {label}]]) {
        const e = map.get(key) ?? {key, ...extra, elements: 0, score: 0, pages: new Set(), stops: new Set(), stopElements: 0, occurrences: 0, publicPages: new Set()};
        e.elements += c.elements; e.score += c.elements / p.elements; e.occurrences++;
        if (c.elements > 0 || c.how !== 'box') e.pages.add(p.id);
        if (p.public) e.publicPages.add(p.id);
        if (c.how !== 'box' && c.how !== 'bound' && !seen.has(key)) { e.stops.add(p.id); e.stopElements += p.elements; }
        seen.add(key); map.set(key, e);
      }
    }
  }
  const fin = e => ({...e, pages: e.pages.size, publicPages: e.publicPages.size, stops: e.stops.size, share: e.elements / out.groups.all.elements});
  out.families = [...families.values()].map(fin).sort((a, b) => b.score - a.score);
  out.reasons = [...reasons.values()].map(fin).sort((a, b) => b.score - a.score || b.stops - a.stops);
  return out;
});

// ---- static
const SECTIONS = ['1', '2', '3', '4', '5', '6', '7', '8', 'at-rule', 'other', 'css-variables'];
const checks = new Map();
for (const p of pages) for (const c of p.inventory) {
  if (c.section === 'property') continue;
  const key = `${c.section}\u0000${c.id}`, e = checks.get(key) ?? {id: c.id, section: c.section, verdict: c.verdict, pages: 0, live: 0, count: 0, elementShare: 0, publicPages: 0};
  if (c.live > 0) { e.pages++; if (p.public) e.publicPages++; }
  e.live += c.live; e.count += c.count; e.elementShare += c.elements / p.elements; checks.set(key, e);
}
const staticChecks = [...checks.values()].map(e => ({...e, meanElementShare: e.elementShare / pages.length})).sort((a, b) => b.elementShare - a.elementShare);
const declTotals = {};
for (const [g, keep] of groups) {
  const ps = pages.filter(keep), t = {in: 0, cond: 0, unlisted: 0, off: 0}, s = {in: 0, cond: 0, unlisted: 0, off: 0}, el = {cond: 0, unlisted: 0, off: 0};
  for (const p of ps) { for (const k in t) { t[k] += p.declVerdicts[k]; s[k] += p.selectorVerdicts[k]; } for (const k in el) el[k] += p.verdictElements[k] / p.elements; }
  declTotals[g] = {declarations: t, selectors: s, meanElementShareTouched: Object.fromEntries(Object.entries(el).map(([k, v]) => [k, v / ps.length])),
    rules: sum(ps, p => p.rules), liveRules: sum(ps, p => p.liveRules), liveDeclarations: sum(ps, p => p.liveDeclarations), declarationsAll: sum(ps, p => p.declarations)};
}
// Property usage: the most used properties on live rules, with pages.
const props = new Map();
for (const p of pages) for (const c of p.inventory) if (c.section === 'property' && c.live) { const e = props.get(c.id) ?? {id: c.id, pages: 0, live: 0}; e.pages++; e.live += c.live; props.set(c.id, e); }
const properties = [...props.values()].sort((a, b) => b.live - a.live);

const summary = {input, widths, pages: pages.map(p => ({id: p.id, kind: p.kind, system: p.system, public: p.public, elements: p.elements, cssBytes: p.cssBytes, rules: p.rules, liveRules: p.liveRules,
  declVerdicts: p.declVerdicts, dynamic: p.dynamic.map(d => ({width: d.viewport.width, status: d.status, decided: d.decided, share: d.decided / p.elements, steps: d.steps, note: d.note,
    topFamilies: Object.entries(d.charges.reduce((m, c) => { const f = familyOf(c.reason)[0]; m[f] = (m[f] ?? 0) + c.elements; return m; }, {})).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).slice(0, 3)}))})),
  dynamic, static: {totals: declTotals, checks: staticChecks, properties: properties.slice(0, 60)}};
writeFileSync(opt('--out', input.replace(/coverage\.json$/, 'summary.json')), JSON.stringify(summary, null, 1) + '\n');

// ---- markdown tables for the report
const md = [];
md.push('### 動的: 判定された要素の割合', '', '| 幅 | 群 | ページ | 要素 | 判定された要素 | ページ平均 | 1 回目で判定 | 剥がして判定 | 全体を止める Unknown が残る |', '|---|---|---:|---:|---:|---:|---:|---:|---:|');
for (const d of dynamic) for (const [g] of groups) { const x = d.groups[g]; if (!x.pages) continue; md.push(`| ${d.viewport.width}px | ${g} | ${x.pages} | ${x.elements} | ${x.decided} (${pct(x.decidedShare)}) | ${pct(x.meanPageShare)} | ${x.firstPassDecided} | ${x.endedDecided} | ${x.pageStoppedAtEnd} |`); }
for (const d of dynamic) {
  md.push('', `### 隙間の系統(${d.viewport.width}px、score = 各ページで止めた要素の割合の和)`, '', '| # | 系統 | score | 止めた要素 | ページ | 公開ページ | ページ全体を止めた | 出現 |', '|---:|---|---:|---:|---:|---:|---:|---:|');
  d.families.forEach((f, i) => md.push(`| ${i + 1} | ${f.label} (\`${f.key}\`) | ${f.score.toFixed(2)} | ${f.elements} (${pct(f.share)}) | ${f.pages} | ${f.publicPages} | ${f.stops} | ${f.occurrences} |`));
  md.push('', `#### 理由の上位 25(${d.viewport.width}px)`, '', '| score | 要素 | ページ | 止めた | 理由 |', '|---:|---:|---:|---:|---|');
  for (const r of d.reasons.slice(0, 25)) md.push(`| ${r.score.toFixed(2)} | ${r.elements} | ${r.pages} | ${r.stops} | \`${r.key.replace(/\|/g, '\\|').slice(0, 140)}\` |`);
}
md.push('', '### 静的: 生きている宣言の判定(最悪の判定で数える)', '', '| 群 | 生きているルール / 全ルール | 生きている宣言 | in | cond | unlisted | off | セレクター in / cond / unlisted / off |', '|---|---:|---:|---:|---:|---:|---:|---|');
for (const [g] of groups) { const t = declTotals[g], n = t.declarations; if (!t.rules) continue; const all = n.in + n.cond + n.unlisted + n.off; md.push(`| ${g} | ${t.liveRules} / ${t.rules} | ${t.liveDeclarations} | ${pct(n.in / all)} | ${pct(n.cond / all)} | ${pct(n.unlisted / all)} | ${pct(n.off / all)} | ${t.selectors.in} / ${t.selectors.cond} / ${t.selectors.unlisted} / ${t.selectors.off} |`); }
for (const sec of SECTIONS) {
  const rows = staticChecks.filter(c => c.section === sec && c.verdict !== 'feature' && c.verdict !== 'n/a');
  if (!rows.length) continue;
  md.push('', `#### 節 ${sec}`, '', '| 書き方 | 判定 | 使うページ(公開) | 生きている出現 | 触れる要素(ページ平均) |', '|---|---|---:|---:|---:|');
  for (const c of rows.slice(0, 18)) md.push(`| \`${c.id.replace(/\|/g, '\\|')}\` | ${c.verdict} | ${c.pages} (${c.publicPages}) | ${c.live} | ${pct(c.meanElementShare)} |`);
}
const features = staticChecks.filter(c => c.verdict === 'feature' && (c.section === 'selector' || c.section === '5' || c.section === '6')).slice(0, 30);
md.push('', '#### セレクターの機能(生きているルール)', '', '| 機能 | 使うページ(公開) | 生きている出現 | 触れる要素(ページ平均) |', '|---|---:|---:|---:|');
for (const c of features) md.push(`| \`${c.id}\` | ${c.pages} (${c.publicPages}) | ${c.live} | ${pct(c.meanElementShare)} |`);
const atr = staticChecks.filter(c => c.section === 'at-rule').sort((a, b) => b.pages - a.pages).slice(0, 25);
md.push('', '#### at-rule', '', '| at-rule | 判定 | 使うページ(公開) | 出現 |', '|---|---|---:|---:|');
for (const c of atr) md.push(`| \`${c.id}\` | ${c.verdict} | ${c.pages} (${c.publicPages}) | ${c.count} |`);
md.push('', '#### ページごと', '', '| ページ | 種類 | 系 | 要素 | ' + widths.map(w => `${w.width}px 判定 / 主な系統`).join(' | ') + ' |', '|---|---|---|---:|' + widths.map(() => '---|').join(''));
for (const p of summary.pages) md.push(`| ${p.id} | ${p.kind} | ${p.system} | ${p.elements} | ` + p.dynamic.map(d => `${pct(d.share)} ${d.status}${d.note ? ` (${d.note})` : ''}; ${d.topFamilies.map(([f, n]) => `${f} ${n}`).join(', ')}`).join(' | ') + ' |');
if (opt('--md')) writeFileSync(opt('--md'), md.join('\n') + '\n');
else console.log(md.join('\n'));
