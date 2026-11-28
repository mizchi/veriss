// The component linter's command line, shared by tools/css-lint.mjs and the checker packages' bins
// (veriss-svelte, veriss-linaria). Each caller passes the adapters it ships, by file extension.
//   <name> [options] <files>...
// Options:
//   --viewport 320-1280      viewport widths (and --height 480-900 heights) the component is checked over
//   --page-css <file>        CSS of the page around the component (html, body, resets)
//   --css <file>             a stylesheet for plain className (React without StyleX/Linaria)
//   --profile recommended|all   the rule set (recommended: rules checked against Chromium)
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
// Exit status 1 when any error is reported, 2 on a usage error.
import {readFileSync} from 'node:fs';
import {extname} from 'node:path';
import {lint, formatText} from './lint.mjs';

/**
 * Runs the linter on argv and returns the exit status (0, 1 on any error finding, 2 on a usage error).
 * @param {{argv: string[], adapters: Record<string, () => Promise<Function>>, name?: string}} options
 *   adapters: file extension ('.svelte') → a loader of the analyze function for that file type
 */
export async function runLint({argv, adapters, name = 'css-lint'}) {
  const args = argv, files = [], opt = {viewport: '320-1280', height: '480-900', profile: 'recommended', format: 'text', assumeText: true, defaultFontSize: '16', defaultColors: 'light'};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--no-assume-text') opt.assumeText = false;
    else if (a === '--trust-image-attributes') opt.trustImageAttributes = true;
    else if (a === '--font') { const [family, ...file] = String(args[++i]).split('='); (opt.fonts ??= {})[family] = {file: file.join('=')}; }
    else if (a.startsWith('--')) opt[a.slice(2).replace(/-(\w)/g, (m, c) => c.toUpperCase())] = args[++i];
    else files.push(a);
  }
  if (!files.length && !opt.suggestReset) { console.error(`usage: ${name} [--viewport 320-1280] [--font Family=file.ttf] [--page-css file] [--css file] [--profile recommended|all] [--format text|json] <files>`); return 2; }
  if (opt.suggestReset) {
    const {suggestReset} = await import('veriss/src/layout/ua-reset.mjs');
    const r = suggestReset({browsers: String(opt.suggestReset).split(','), target: opt.ua ?? 'chromium'});
    console.log(r.css + (r.notes.length ? `\n/* Not in the reset (decide them in your design):\n${r.notes.map(n => ` * - ${n}`).join('\n')}\n */\n` : ''));
    return 0;
  }
  const range = text => { const [min, max] = String(text).split('-').map(Number); return {min, max: max ?? min}; };
  // The default page around a component: block flow (html and body are display: block), border-box, no UA margins.
  const pageCSS = opt.pageCss ? readFileSync(opt.pageCss, 'utf8') : '*{box-sizing:border-box;margin:0}';
  const options = {...(opt.defaultFontSize !== 'none' ? {defaultFontSize: Number(opt.defaultFontSize)} : {}), ...(opt.defaultColors !== 'none' ? {defaultColors: true} : {}), scrollIntent: 'css', ...(opt.ua ? (String(opt.ua).includes(',') ? {uas: String(opt.ua).split(',')} : {ua: opt.ua}) : {}), sourceLines: true, eachCounts: (opt.eachCounts ?? '0,2').split(',').map(Number), pageCSS, viewport: {...range(opt.viewport), height: range(opt.height)}, accessibility: true, integrity: true, selectors: true, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}], ...(opt.assumeText ? {assumeText: true} : {}), ...(opt.images ? {images: JSON.parse(readFileSync(opt.images, 'utf8'))} : {}), ...(opt.trustImageAttributes ? {trustImageAttributes: true} : {})};

  // --font Family=file.ttf: the component's texts in that family are measured from the font file (widths, line breaks).
  if (opt.fonts) { const {loadTextMetrics} = await import('veriss/text/node'); options.textMetrics = await loadTextMetrics({fonts: opt.fonts}); options.fonts = opt.fonts; if (opt.textResize !== 'off') options.textResize = true; }

  const all = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8'), load = adapters[extname(file)];
    if (!load) { all.push({file, severity: 'info', code: 'UNSUPPORTED_FILE', message: 'not checked: no adapter for this file type'}); continue; }
    const analyze = await load();
    const started = Date.now();
    const result = analyze(source, {...options, ...(opt.css ? {css: readFileSync(opt.css, 'utf8')} : {})});
    if (opt.format !== 'json') console.error(`${file}: ${result.states.length} states in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    all.push(...lint(result, {file, source, profile: opt.profile}));
  }
  console.log(opt.format === 'json' ? JSON.stringify(all, null, 2) : formatText(all) || 'no findings');
  const count = s => all.filter(m => m.severity === s).length;
  if (opt.format !== 'json') console.log(`\n${count('error')} error(s), ${count('warning')} warning(s), ${count('info')} not checked or assumed`);
  return count('error') ? 1 : 0;
}
