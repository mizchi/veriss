// The component linter's command line, shared by tools/css-lint.mjs and the checker packages' bins
// (veriss-svelte, veriss-linaria). Each caller passes the adapters it ships, by file extension.
//   <name> [options] <files>...
// Options:
//   --viewport 320-1280      viewport widths (and --height 480-900 heights) the component is checked over
//   --page-css <file>        CSS of the page around the component (html, body, resets)
//   --css <file>             a stylesheet for plain className (React without StyleX/Linaria)
//   --profile recommended|strict|all   the rule set (recommended: rules checked against Chromium; strict adds the content-model warnings)
//   --no-assume-text         keep text without size contracts Unknown instead of one assumed line
//   --format text|json
//   --default-colors light|none   assume the UA's black-on-white canvas (light preference, no dark color-scheme); none: Unknown
//   --each-counts 0,2        item counts checked for {#each} / v-for / .map (default 0 and 2)
//   --images <file.json>     the natural sizes of image files by src ({"/a.png": {"width": 120, "height": 30}})
//   --trust-image-attributes take an img's width/height attributes as its file's size where --images does not give it
//                            (stated as an assumption); without it an img whose size depends on their ratio is not checked
//   --ua chromium|firefox|webkit   the browser whose form-control UA styles the controls start from; several
//                            (--ua chromium,firefox,webkit) checks each and says which browsers a finding holds in (default: the
//                            historical Chromium defaults, with fields' UA padding and border unknown)
//   --suggest-reset chromium,firefox,webkit   print the smallest CSS reset that makes those browsers' form controls agree
//                            (values kept from --ua, or chromium) and exit
//   --resets none,modern-normalize,...|all   check the component under every UA × reset branch (veriss/reset-matrix):
//                            each vendored reset stylesheet put before the page CSS, with each --ua (default: all three);
//                            findings are grouped into those in every branch and those only in the smallest UA × reset
//                            product, and the branches the analysis does not decide are named. --page-css defaults to none.
//   --sample N --seed S      with --resets: N branches drawn with the seed (reproducible), instead of every branch
// A component that does not compile is an error finding (E_ADAPTER_COMPILE) at the compiler's line and column; the other
// files are still linted. An unknown option is a usage error naming the nearest known one.
// Exit status 1 when any error is reported, 2 on a usage error.
import {readFileSync} from 'node:fs';
import {extname} from 'node:path';
import {lint, formatText} from './lint.mjs';

/**
 * Runs the linter on argv and returns the exit status (0, 1 on any error finding, 2 on a usage error).
 * @param {{argv: string[], adapters: Record<string, () => Promise<Function>>, name?: string}} options
 *   adapters: file extension ('.svelte') → a loader of the analyze function for that file type
 */
// The options runLint knows: those that take a value, and the flags. Anything else starting with -- is a usage error,
// never an option that takes the next argument (--image images.json would otherwise eat the file list's first entry).
const valueOptions = ['viewport', 'height', 'page-css', 'css', 'profile', 'format', 'default-font-size', 'default-colors', 'each-counts', 'images', 'ua', 'suggest-reset', 'font', 'text-resize', 'resets', 'sample', 'seed'];
const flagOptions = ['no-assume-text', 'trust-image-attributes'];
const distance = (a, b) => {
  const row = Array.from({length: b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { let diagonal = row[0]; row[0] = i; for (let j = 1; j <= b.length; j++) { const above = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)); diagonal = above; } }
  return row[b.length];
};
const nearest = option => [...valueOptions, ...flagOptions].map(known => ({known, d: distance(option, known)})).sort((x, y) => x.d - y.d)[0];

export async function runLint({argv, adapters, name = 'css-lint'}) {
  const args = argv, files = [], opt = {viewport: '320-1280', height: '480-900', profile: 'recommended', format: 'text', assumeText: true, defaultFontSize: '16', defaultColors: 'light'};
  const usage = message => { console.error(`${name}: ${message}`); return 2; };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) { files.push(a); continue; }
    const option = a.slice(2);
    if (option === 'no-assume-text') opt.assumeText = false;
    else if (option === 'trust-image-attributes') opt.trustImageAttributes = true;
    else if (!valueOptions.includes(option)) {
      const close = nearest(option.split('=')[0]);
      return usage(`unknown option ${a}${close.d <= Math.max(2, Math.floor(close.known.length / 3)) ? `; did you mean --${close.known}?` : ''} (run with no files for the usage)`);
    }
    else if (i + 1 >= args.length || args[i + 1].startsWith('--')) return usage(`${a} needs a value`);
    else if (option === 'font') { const [family, ...file] = String(args[++i]).split('='); (opt.fonts ??= {})[family] = {file: file.join('=')}; }
    else opt[option.replace(/-(\w)/g, (m, c) => c.toUpperCase())] = args[++i];
  }
  if (!files.length && !opt.suggestReset) { console.error(`usage: ${name} [--viewport 320-1280] [--font Family=file.ttf] [--page-css file] [--css file] [--profile recommended|strict|all] [--ua chromium,firefox,webkit] [--resets none,modern-normalize,...|all [--sample N --seed S]] [--format text|json] <files>`); return 2; }
  if (opt.suggestReset) {
    const {suggestReset} = await import('veriss/src/layout/ua-reset.mjs');
    const r = suggestReset({browsers: String(opt.suggestReset).split(','), target: opt.ua ?? 'chromium'});
    console.log(r.css + (r.notes.length ? `\n/* Not in the reset (decide them in your design):\n${r.notes.map(n => ` * - ${n}`).join('\n')}\n */\n` : ''));
    return 0;
  }
  // --resets: the UA × reset branches (veriss/reset-matrix), validated before anything is analysed.
  let matrix = null;
  if (opt.resets || opt.sample || opt.seed) {
    if (!opt.resets) return usage('--sample and --seed need --resets');
    const m = await import('veriss/reset-matrix');
    const ids = opt.resets === 'all' ? m.resets.map(r => r.id) : String(opt.resets).split(',').map(x => x.trim()).filter(Boolean);
    const badReset = ids.find(id => !m.resets.some(r => r.id === id));
    if (badReset) return usage(`unknown reset ${badReset} (one of ${m.resets.map(r => r.id).join(', ')}, or all)`);
    const uas = opt.ua ? String(opt.ua).split(',').map(x => x.trim()) : [...m.uas];
    const badUA = uas.find(ua => !m.uas.includes(ua));
    if (badUA) return usage(`unknown ua ${badUA} (one of ${m.uas.join(', ')})`);
    const sample = opt.sample === undefined ? undefined : Number(opt.sample), seed = opt.seed === undefined ? 1 : Number(opt.seed);
    if (sample !== undefined && !(Number.isInteger(sample) && sample > 0)) return usage('--sample needs a positive integer');
    if (!Number.isInteger(seed)) return usage('--seed needs an integer');
    const space = {uas, resets: ids}, all = m.enumerateBranches(space);
    matrix = {m, space, total: all.length, branches: sample === undefined ? all : m.sampleBranches(all, {sample, seed}), ...(sample !== undefined ? {sampled: {sample, seed}} : {})};
    delete opt.ua;
  }
  const range = text => { const [min, max] = String(text).split('-').map(Number); return {min, max: max ?? min}; };
  // The default page around a component: block flow (html and body are display: block), border-box, no UA margins.
  // With --resets the reset is the page's initial condition, so there is no default page CSS after it.
  const pageCSS = opt.pageCss ? readFileSync(opt.pageCss, 'utf8') : matrix ? '' : '*{box-sizing:border-box;margin:0}';
  const options = {...(opt.defaultFontSize !== 'none' ? {defaultFontSize: Number(opt.defaultFontSize)} : {}), ...(opt.defaultColors !== 'none' ? {defaultColors: true} : {}), scrollIntent: 'css', ...(opt.ua ? (String(opt.ua).includes(',') ? {uas: String(opt.ua).split(',')} : {ua: opt.ua}) : {}), sourceLines: true, eachCounts: (opt.eachCounts ?? '0,2').split(',').map(Number), pageCSS, viewport: {...range(opt.viewport), height: range(opt.height)}, accessibility: true, integrity: true, selectors: true, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}], ...(opt.assumeText ? {assumeText: true} : {}), ...(opt.images ? {images: JSON.parse(readFileSync(opt.images, 'utf8'))} : {}), ...(opt.trustImageAttributes ? {trustImageAttributes: true} : {})};

  // --font Family=file.ttf: the component's texts in that family are measured from the font file (widths, line breaks).
  if (opt.fonts) { const {loadTextMetrics} = await import('veriss/text/node'); options.textMetrics = await loadTextMetrics({fonts: opt.fonts}); options.fonts = opt.fonts; if (opt.textResize !== 'off') options.textResize = true; }

  if (matrix) return lintMatrix({files, adapters, options, opt, matrix});
  const all = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8'), load = adapters[extname(file)];
    if (!load) { all.push({file, severity: 'info', code: 'UNSUPPORTED_FILE', message: 'not checked: no adapter for this file type'}); continue; }
    const analyze = await load();
    const started = Date.now();
    // A component that does not compile comes back as a result with compileErrors (E_ADAPTER_COMPILE). Any other
    // exception is the checker's failure on this file: a warning, and the other files are still linted.
    let result;
    try { result = analyze(source, {...options, ...(opt.css ? {css: readFileSync(opt.css, 'utf8')} : {})}); }
    catch (error) {
      all.push({file, severity: 'warning', code: 'W_LINT_ANALYSIS_FAILED', message: `the checker failed on this file, so nothing in it was checked: ${error?.message ?? error}`, fix: 'report it with the component (a bug in the checker, not in the component)'});
      continue;
    }
    if (opt.format !== 'json') console.error(`${file}: ${result.states.length} states in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    all.push(...lint(result, {file, source, profile: opt.profile}));
  }
  console.log(opt.format === 'json' ? JSON.stringify(all, null, 2) : formatText(all) || 'no findings');
  const count = s => all.filter(m => m.severity === s).length;
  if (opt.format !== 'json') console.log(`\n${count('error')} error(s), ${count('warning')} warning(s), ${count('info')} not checked or assumed`);
  return count('error') ? 1 : 0;
}

// A finding located only in the branch's reset stylesheet is about the reset's text, not the component: left out.
const resetFile = file => String(file ?? '').startsWith('reset:');
const inReset = f => { const css = Array.isArray(f.css) ? f.css : f.css ? [f.css] : []; return css.length > 0 && css.every(c => resetFile(c.file)); };
const withoutReset = result => ({...result, findings: (result.findings ?? []).filter(f => !inReset(f)),
  ...(result.selectors ? {selectors: {...result.selectors, rows: (result.selectors.rows ?? []).filter(r => !resetFile(r.file)), warnings: (result.selectors.warnings ?? []).filter(w => !resetFile(w.file) && !inReset(w))}} : {})});
// One message across branches: its code and place, and its text with the numbers that differ by branch taken out.
const messageKey = m => JSON.stringify([m.code, m.line ?? null, m.column ?? null, String(m.message).replace(/-?\d+(?:\.\d+)?/g, '#')]);

async function lintMatrix({files, adapters, options, opt, matrix}) {
  const {m, space, branches: chosen} = matrix, out = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8'), load = adapters[extname(file)];
    if (!load) { out.push({file, unsupported: true, message: 'not checked: no adapter for this file type'}); continue; }
    const analyze = await load(), started = Date.now();
    const branches = chosen.map(({id, ua, reset}) => {
      const sheet = m.resetById(reset);
      let result;
      try { result = analyze(source, {...options, ua, reset: sheet.css ? [{css: sheet.css, file: `reset:${reset}`}] : [], ...(opt.css ? {css: readFileSync(opt.css, 'utf8')} : {})}); }
      catch (error) { return {id, ua, reset, status: 'unknown', reason: `the checker failed on this branch: ${error?.message ?? error}`, messages: []}; }
      const messages = lint(withoutReset(result), {file, source, profile: opt.profile});
      return {id, ua, reset, status: result.status, ...(result.status === 'unknown' ? {reason: result.unknowns?.[0]?.message ?? messages.find(x => x.severity === 'info' && x.code.startsWith('U_'))?.message ?? 'not decided'} : {}), messages};
    });
    if (opt.format !== 'json') console.error(`${file}: ${branches.length} branches in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    // Errors and warnings are compared; what is not checked or assumed (info) stays with its branch.
    const compared = branches.map(b => ({...b, findings: b.messages.filter(x => x.severity !== 'info')}));
    const {holdsEverywhere, onlyIn} = m.compareBranches(compared, {space, keyOf: messageKey, fields: ({states, ...x}) => ({...x, ...(states ? {states} : {})})});
    out.push({file, space: {...space, total: matrix.total, analyzed: chosen.length, ...(matrix.sampled ? {sampled: matrix.sampled} : {})}, holdsEverywhere, onlyIn,
      unknownBranches: branches.filter(b => b.status === 'unknown').map(b => ({id: b.id, reason: b.reason})), branches});
  }
  const errors = out.reduce((n, f) => n + (f.branches ?? []).filter(b => b.messages.some(x => x.severity === 'error')).length, 0);
  if (opt.format === 'json') console.log(JSON.stringify({files: out}, null, 2));
  else {
    const lines = [];
    for (const f of out) {
      if (f.unsupported) { lines.push(`${f.file}  info  UNSUPPORTED_FILE  ${f.message}`); continue; }
      lines.push(`${f.file}: ${f.space.analyzed} branches (${f.space.uas.join(', ')} × ${f.space.resets.join(', ')})${f.space.sampled ? `, sampled from ${f.space.total} with seed ${f.space.sampled.seed}` : ''}`);
      if (f.holdsEverywhere.length) lines.push('  in every branch:', ...formatText(f.holdsEverywhere).split('\n').map(l => `    ${l}`));
      const groups = new Map();
      for (const x of f.onlyIn) { if (!groups.has(x.summary)) groups.set(x.summary, []); groups.get(x.summary).push(x); }
      for (const [summary, list] of groups) {
        const undecided = [...new Set(list.flatMap(x => x.undecided))];
        lines.push(`  only in ${summary}${undecided.length ? ` (not decided in ${undecided.join(', ')})` : ''}:`, ...formatText(list).split('\n').map(l => `    ${l}`));
      }
      if (!f.holdsEverywhere.length && !f.onlyIn.length) lines.push('  no findings in any branch');
      const reasons = new Map();
      for (const b of f.unknownBranches) { if (!reasons.has(b.reason)) reasons.set(b.reason, []); reasons.get(b.reason).push(b.id); }
      for (const [reason, ids] of reasons) lines.push(`  not decided in ${ids.join(', ')}: ${reason}`);
    }
    console.log(lines.join('\n'));
    const count = s => out.reduce((n, f) => n + [...(f.holdsEverywhere ?? []), ...(f.onlyIn ?? [])].filter(x => x.severity === s).length, 0);
    console.log(`\n${count('error')} error(s), ${count('warning')} warning(s) across the branches; ${errors} branch(es) with an error; ${out.reduce((n, f) => n + (f.unknownBranches?.length ?? 0), 0)} branch(es) not decided`);
  }
  return errors ? 1 : 0;
}
