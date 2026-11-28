// The daily fuzz's dashboard on GitHub Pages (/fuzz/), from the fuzz-data branch (.github/workflows/fuzz.yml writes
// it, tools/ci/fuzz-summary.mjs record lays it out). Static: the page is rendered here, with no script and nothing
// fetched.
//   node tools/fuzz-dashboard/build.mjs <fuzz-data dir> <out dir>    writes <out>/index.html and <out>/index.json
// A missing or empty data directory renders the page with "no runs recorded yet".
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = x => x === null || x === undefined ? '–' : `${(x * 100).toFixed(1)}%`;
const BROWSERS = ['chromium', 'firefox', 'webkit'];
const repo = 'https://github.com/mizchi/veriss';

export function loadData(dir) {
  const indexFile = join(dir, 'index.json');
  const index = dir && existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : {version: 1, days: []};
  const last = index.days.at(-1);
  const latest = last && existsSync(join(dir, last.file)) ? JSON.parse(readFileSync(join(dir, last.file), 'utf8')) : null;
  return {index, latest};
}

// The decided share per browser over the days (a line each, labelled at its end), and below it the mismatches of each
// day (a bar, red when there were any). Days whose chunks did not all finish get a hollow marker.
function trendChart(days) {
  const shown = days.slice(-90), W = 760, H = 220, L = 44, R = 128, T = 14, B = 26, bandH = 46, gap = 34;
  if (!shown.length) return '';
  const browsers = BROWSERS.filter(b => shown.some(d => d.totals?.[b])).concat(Object.keys(Object.assign({}, ...shown.map(d => d.totals ?? {}))).filter(b => !BROWSERS.includes(b)));
  const values = shown.flatMap(d => browsers.map(b => d.totals?.[b]?.decided).filter(v => v !== null && v !== undefined));
  const lo = Math.max(0, Math.floor(((values.length ? Math.min(...values) : 0.6) - 0.05) * 20) / 20), hi = 1;
  const x = i => shown.length === 1 ? L + (W - L - R) / 2 : L + i * (W - L - R) / (shown.length - 1);
  const y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const out = [`<svg viewBox="0 0 ${W} ${H + gap + bandH}" role="img" aria-label="Decided share per browser and mismatches per day" class="chart">`];
  const step = hi - lo > 0.3 ? 0.1 : 0.05;
  for (let k = 0, t = hi; t >= lo - 1e-9; k++, t = hi - k * step) out.push(`<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${L - 6}" y="${y(t) + 4}" class="tick" text-anchor="end">${Math.round(t * 100)}%</text>`);
  const dateTicks = [0, Math.floor((shown.length - 1) / 2), shown.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  for (const i of dateTicks) out.push(`<text x="${x(i)}" y="${H - 6}" class="tick" text-anchor="middle">${esc(shown[i].date)}</text>`);
  const labels = [];
  for (const [n, b] of browsers.entries()) {
    // A day the browser was planned for but no chunk finished has no share: an × on the axis, not a zero.
    for (const [i, d] of shown.entries()) {
      const t = d.totals?.[b];
      if (!t || (t.decided !== null && t.decided !== undefined)) continue;
      const cx = x(i), cy = H - B - 4;
      out.push(`<path class="unavailable s${n}x" d="M${cx - 4},${cy - 4}L${cx + 4},${cy + 4}M${cx - 4},${cy + 4}L${cx + 4},${cy - 4}" stroke-width="2"><title>${esc(`${b} ${d.date}: no chunk finished (${t.missingChunks} not finished), share unavailable`)}</title></path>`);
    }
    const pts = shown.map((d, i) => [i, d.totals?.[b]?.decided]).filter(([, v]) => v !== null && v !== undefined);
    if (!pts.length) continue;
    out.push(`<polyline class="s${n}" fill="none" stroke-width="2" points="${pts.map(([i, v]) => `${x(i)},${y(v)}`).join(' ')}"/>`);
    for (const [i, v] of pts) {
      const t = shown[i].totals[b], incomplete = t.missingChunks > 0 || t.failedChunks > 0;
      out.push(`<circle class="s${n}${incomplete ? ' hollow' : ''}" cx="${x(i)}" cy="${y(v)}" r="${shown.length > 40 ? 2.5 : 4}"><title>${esc(`${b} ${shown[i].date}: decided ${pct(v)} of ${t.cases} cases, ${t.mismatches} mismatches${t.missingChunks ? `, ${t.missingChunks} chunks not finished` : ''}${t.failedChunks ? `, ${t.failedChunks} chunks failed` : ''}`)}</title></circle>`);
    }
    const [li, lv] = pts.at(-1);
    labels.push({n, x: x(li) + 8, y: y(lv) + 4, text: `${b} ${pct(lv)}`});
  }
  // End labels kept 14px apart (equal shares would print on top of each other).
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 14);
  for (const l of labels) out.push(`<text x="${l.x}" y="${l.y}" class="label s${l.n}t">${esc(l.text)}</text>`);
  const by = H + gap, max = Math.max(1, ...shown.map(d => Object.values(d.totals ?? {}).reduce((a, t) => a + t.mismatches, 0)));
  out.push(`<text x="${L}" y="${by - 6}" class="tick">mismatches per day</text><line x1="${L}" x2="${W - R}" y1="${by + bandH}" y2="${by + bandH}" class="grid"/>`);
  const bw = Math.max(2, Math.min(14, (W - L - R) / shown.length * 0.6));
  for (const [i, d] of shown.entries()) {
    const per = Object.entries(d.totals ?? {}), m = per.reduce((a, [, t]) => a + t.mismatches, 0), h = m ? Math.max(3, m / max * bandH) : 1;
    out.push(`<rect x="${x(i) - bw / 2}" y="${by + bandH - h}" width="${bw}" height="${h}" class="${m ? 'bad' : 'zero'}"><title>${esc(`${d.date}: ${m} mismatches (${per.map(([b, t]) => `${b} ${t.mismatches}`).join(', ')})`)}</title></rect>`);
  }
  out.push(`<text x="${W - R + 8}" y="${by + 10}" class="tick">max ${max}</text></svg>`);
  return out.join('');
}

const ranges = list => list.map(c => `${c.first}..${c.first + c.cases - 1}`).join(', ') || '–';

function latestTable(day) {
  const rows = day.runs.map(r => `<tr><td>${esc(r.browser)}</td><td class="n">${esc(r.seed)}</td><td class="n">${r.cases} / ${r.planned}</td><td class="n">${r.verified}</td><td class="n">${r.violated}</td><td class="n">${r.unknown}</td><td class="n">${pct(r.decided)}</td><td class="n">${pct(r.boxesDecided)}</td><td class="n ${r.mismatches.length ? 'badt' : ''}">${r.mismatches.length}</td><td>${ranges(r.missingChunks)}</td><td>${ranges(r.failedChunks ?? [])}</td><td>${esc((r.problems ?? []).join('; ')) || '–'}</td></tr>`).join('');
  return `<div class="tw"><table><thead><tr><th>browser</th><th>seed</th><th>cases</th><th>verified</th><th>violated</th><th>unknown</th><th>decided cases</th><th>boxes with a rectangle</th><th>mismatches</th><th>not finished</th><th>failed</th><th>problems</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function mismatchList(day) {
  const items = day.runs.flatMap(r => r.mismatches.map(m => ({...m, browser: r.browser, seed: r.seed})));
  if (!items.length) return '<p class="okt">No open mismatches: every decided case of the latest run agreed with the browser.</p>';
  return items.map(m => `<article class="mm"><h3>${esc(m.browser)}, seed ${esc(m.seed)}, index ${esc(m.index)} <code>${esc(m.kind)}</code></h3>
<dl><dt>shrunk case</dt><dd><pre>${esc(JSON.stringify(m.shrunk))}</pre></dd>
<dt>css</dt><dd><pre>${esc(m.css)}</pre></dd><dt>body</dt><dd><pre>${esc(m.body)}</pre></dd>
${m.mismatches?.length ? `<dt>what differed</dt><dd><pre>${esc(JSON.stringify(m.mismatches, null, 1))}</pre></dd>` : ''}
<dt>repro (locally, one case)</dt><dd><pre>${esc(m.repro?.local)}</pre></dd><dt>repro (on GitHub Actions)</dt><dd><pre>${esc(m.repro?.ci)}</pre></dd></dl></article>`).join('\n');
}

export function renderDashboard({index, latest}) {
  const days = index.days ?? [];
  const runs = days.slice(-30).reverse().map(d => `<li><a href="${esc(d.runUrl)}">${esc(d.date)}</a> <span class="${d.ok ? 'okt' : 'badt'}">${d.ok ? 'ok' : 'failed'}</span> <a class="sha" href="${repo}/commit/${esc(d.commit)}">${esc(String(d.commit ?? '').slice(0, 7))}</a> ${Object.entries(d.totals ?? {}).map(([b, t]) => `${esc(b)} ${pct(t.decided)}${t.mismatches ? ` · <span class="badt">${t.mismatches} mismatch${t.mismatches > 1 ? 'es' : ''}</span>` : ''}`).join(' · ')}</li>`).join('');
  const body = !days.length || !latest
    ? `<section><h2>No runs recorded yet</h2><p>fuzz.yml records a run here once a day (and when it is dispatched with <code>record=true</code>). Start one with <code>gh workflow run fuzz.yml -f record=true</code>.</p></section>`
    : `<section><h2>Trend</h2><p class="muted">Share of seeded pages veriss decided (verified or violated, the rest Unknown) per browser, and the mismatches of each day: a case veriss decided that the browser drew differently. A hollow point is a day with a chunk that did not finish or failed; an × on the axis is a day with no finished chunk for that browser (no share).</p>${trendChart(days)}</section>
<section><h2>Latest run: ${esc(latest.date)} <span class="${latest.ok ? 'okt' : 'badt'}">${latest.ok ? 'ok' : 'failed'}</span></h2><p class="muted">Commit <a href="${repo}/commit/${esc(latest.commit)}"><code>${esc(String(latest.commit).slice(0, 7))}</code></a> · <a href="${esc(latest.runUrl)}">the run on GitHub Actions</a> (each chunk's log and artifact)</p>${latestTable(latest)}</section>
<section><h2>Open mismatches</h2><p class="muted">The mismatches of the latest run, shrunk to a minimal page. Fix the analysis, then paste the shrunk case into <code>regressions</code> in <code>e2e/layout-fuzz-safe-subset.spec.mjs</code> (they run on every pull request).</p>${mismatchList(latest)}</section>
<section><h2>Runs</h2><ul class="runs">${runs}</ul></section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>veriss fuzz dashboard</title>
<style>
:root{--bg:#f7f8fa;--surface:#fff;--fg:#17202b;--muted:#5a6675;--line:#dde2e9;--accent:#1f5fd6;--code-bg:#eef1f6;--bad:#c62f2f;--ok:#1a7f4b;--s0:#2a6fd6;--s1:#d0661d;--s2:#8a4fd0;
--sans:system-ui,-apple-system,"Segoe UI",sans-serif;--mono:ui-monospace,"SFMono-Regular",Menlo,monospace}
@media (prefers-color-scheme:dark){:root{--bg:#0f141b;--surface:#151c25;--fg:#e4e9f0;--muted:#9aa6b5;--line:#2a3441;--accent:#7aa7ff;--code-bg:#1d2632;--bad:#ff7a7a;--ok:#6fd39c;--s0:#7aa7ff;--s1:#f29a5c;--s2:#c39af5;color-scheme:dark}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 var(--sans);padding:0 16px}
main{max-width:1000px;margin:0 auto;padding:24px 0 64px}
header .eyebrow{font:600 12px var(--mono);letter-spacing:.08em;color:var(--accent);text-transform:uppercase}
h1{font-size:28px;margin:4px 0 8px}h2{font-size:20px;margin:32px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--line)}h3{font-size:15px;margin:0 0 8px}
a{color:var(--accent)}code,pre{font:13px var(--mono)}code{background:var(--code-bg);padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}
pre{background:var(--code-bg);padding:8px 10px;border-radius:6px;margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.muted{color:var(--muted)}.okt{color:var(--ok);font-weight:600}.badt{color:var(--bad);font-weight:600}
.chart{width:100%;height:auto;background:var(--surface);border:1px solid var(--line);border-radius:8px}
.chart .grid{stroke:var(--line);stroke-width:1}.chart .tick{fill:var(--muted);font:11px var(--mono)}.chart .label{font:600 12px var(--sans)}
.chart .s0,.chart .s0x{stroke:var(--s0)}.chart .s1,.chart .s1x{stroke:var(--s1)}.chart .s2,.chart .s2x{stroke:var(--s2)}
.chart polyline{fill:none}.chart circle.s0{fill:var(--s0)}.chart circle.s1{fill:var(--s1)}.chart circle.s2{fill:var(--s2)}.chart circle.hollow{fill:var(--surface);stroke-width:2}.chart .unavailable{fill:none}
.chart .s0t{fill:var(--s0)}.chart .s1t{fill:var(--s1)}.chart .s2t{fill:var(--s2)}
.chart .bad{fill:var(--bad)}.chart .zero{fill:var(--line)}
.tw{overflow-x:auto;border:1px solid var(--line);border-radius:8px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
th{font-size:12px;color:var(--muted);background:var(--code-bg)}td.n{text-align:right;font-variant-numeric:tabular-nums}
.mm{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--bad);border-radius:8px;padding:12px 14px;margin:12px 0}
dl{margin:0}dt{font-size:12px;color:var(--muted);margin-top:8px}dd{margin:2px 0 0}
.runs{padding-left:18px}.runs li{margin:2px 0}.sha{font:12px var(--mono)}
</style></head><body><main>
<header><div class="eyebrow">veriss · safe-subset differential fuzz</div><h1>Fuzz dashboard</h1>
<p class="muted">Every day <code>.github/workflows/fuzz.yml</code> checks seeded pages (<code>e2e/layout-fuzz-safe-subset.spec.mjs</code>) against Chromium, Firefox and WebKit. Raw data: <a href="index.json">index.json</a> and the <a href="${repo}/tree/fuzz-data"><code>fuzz-data</code> branch</a>. <a href="../">The rule catalog</a>.</p></header>
${body}
</main></body></html>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dataDir, outDir = '_site/fuzz'] = process.argv.slice(2);
  const data = loadData(dataDir ?? '');
  mkdirSync(outDir, {recursive: true});
  writeFileSync(join(outDir, 'index.html'), renderDashboard(data));
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(data.index, null, 1) + '\n');
  console.log(`${outDir}/index.html: ${data.index.days.length} days`);
}
