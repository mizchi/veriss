import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';
import {resolveUAProfile, suggestReset} from '../src/index.mjs';

const css = '*{margin:0}html,body{margin:0;display:grid;grid-template-columns:minmax(0,1fr)}.g{display:grid;grid-template-columns:minmax(0,1fr);justify-items:start;align-content:start}.f{display:block;box-sizing:content-box;inline-size:120px;block-size:24px}';
const width = ua => { const r = analyzeHTML('<html lang="en"><body><main class="g"><button class="f" type="button" aria-label="Go"></button></main></body></html>', {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, ...(ua ? {ua} : {})}); return Number(r.sizes.find(x => x.box === '.f').rect.inlineSize.constant); };

test('ua profiles: the button box follows the browser (Chromium 1px 6px, Firefox 1px 4px), and overrides replace values', () => {
  assert.equal(width(), 136); // the historical Chromium default
  assert.equal(width('chromium'), 136);
  assert.equal(width('firefox'), 132);
  assert.equal(width({base: 'webkit', button: {padding: ['0px', '10px', '0px', '10px']}}), 144);
  assert.deepEqual(resolveUAProfile({base: 'firefox', checkbox: {size: 16}}).checkbox, {margin: ['3px', '3px', '3px', '4px'], size: 16});
  assert.throws(() => resolveUAProfile('ie'), /ua must be one of chromium, firefox, webkit/);
});

test('suggestReset: one rule per value the browsers disagree on, none for the values they share', () => {
  const all = suggestReset();
  assert.match(all.css, /font: inherit/);
  assert.match(all.css, /input\[type="checkbox"\], input\[type="radio"\]\) \{\n  margin: 0;/); // WebKit's margins
  assert.doesNotMatch(all.css, /range/); // the range margin is 2px everywhere
  // Chromium and Firefox share the checkbox margins and the text field padding: no rule for them.
  const two = suggestReset({browsers: ['chromium', 'firefox']}).css;
  assert.doesNotMatch(two, /margin: 0/);
  assert.doesNotMatch(two, /input:not\(\[type\]\)/);
  // One platform's profile: nothing differs, nothing to reset.
  assert.equal(suggestReset({browsers: ['webkit-macos']}).rules.length, 0);
  assert.ok(all.notes.some(n => /button colors differ/.test(n)));
});

// Tables and text layout are modeled as Chromium lays them out (measured); Firefox and WebKit differ there (rowspan
// rows, automatic column widths, line breaking, CJK punctuation trimming, spacing, right-to-left shaping). With
// another browser's profile those analyses are Unknown, not Chromium's verdict.
const tableHTML = '<html lang="en"><body><table class="t"><tbody><tr><td class="c"></td><td class="c"></td></tr></tbody></table></body></html>';
const tableCSS = '*{margin:0;padding:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.t{table-layout:fixed;inline-size:200px;border-spacing:0}.c{inline-size:100px;block-size:20px}';
const tableReport = ua => analyzeHTML(tableHTML, {name: 'P', css: tableCSS, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, ...(ua ? {ua} : {})});

test('ua profiles: a table is laid out as Chromium does, so it is Unknown with the Firefox or WebKit profile', () => {
  assert.notEqual(tableReport().status, 'unknown');
  assert.notEqual(tableReport('chromium').status, 'unknown');
  assert.notEqual(tableReport({base: 'chromium', button: {padding: ['0px', '0px', '0px', '0px']}}).status, 'unknown');
  for (const ua of ['firefox', 'webkit', {base: 'webkit'}]) {
    const report = tableReport(ua);
    assert.equal(report.status, 'unknown');
    assert.ok(report.diagnostics.some(d => d.code === 'U_LAYOUT_BROWSER' && /table/.test(d.message)), JSON.stringify(report.diagnostics));
  }
});

test('ua profiles: wrapping lines, CJK punctuation, spacing and right-to-left text are Unknown outside Chromium; plain one-line text is not', async () => {
  const {loadTextMetrics} = await import('../src/text-node.mjs');
  const fixture = name => new URL(`../text-metrics/fixtures/${name}`, import.meta.url).pathname;
  const metrics = await loadTextMetrics({fonts: {Roboto: {file: fixture('roboto-variable.ttf')}, 'Noto Sans JP': {file: fixture('japanese-variable.ttf')}, 'Noto Sans Hebrew': {file: fixture('hebrew-variable.ttf')}}});
  const run = (content, ua, {wrap = 'nowrap', extra = '', lang = 'en', fontExtra = {}, family = 'Roboto'} = {}) => { const font = {family, size: 16, lineHeight: 24, weight: 400}; return analyzeHTML(`<html lang="${lang}"><body><main class="g"><p class="t">${content}</p></main></body></html>`,
    metrics.resolveOptions({name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.g{display:grid;grid-template-columns:300px}.t{font-family:${family};font-size:16px;line-height:24px;${wrap === 'nowrap' ? 'white-space:nowrap;' : ''}${extra}}`,
      viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, ...(ua ? {ua} : {}), boxes: {'.t': {text: {font: {...font, ...fontExtra}, content, lang}, wrap}}})); };
  const browserUnknown = (report, pattern) => report.status === 'unknown' && report.diagnostics.some(d => d.code === 'U_LAYOUT_BROWSER' && pattern.test(d.message));
  // Plain one-line Latin text: the shaped advance is the same in every browser.
  for (const ua of [undefined, 'chromium', 'firefox', 'webkit']) assert.notEqual(run('Publish now', ua).status, 'unknown', String(ua));
  // Wrapping text: line breaking.
  const words = 'Static checks lay out this paragraph as Chromium breaks its lines into several rows';
  assert.notEqual(run(words, 'chromium', {wrap: 'normal'}).status, 'unknown');
  assert.ok(browserUnknown(run(words, 'firefox', {wrap: 'normal'}), /line breaking/));
  // A closing CJK punctuation mark: Chromium trims it at a line end (text-spacing-trim), Firefox and WebKit do not.
  assert.ok(browserUnknown(run('検査。', 'webkit', {lang: 'ja', family: 'Noto Sans JP'}), /punctuation/));
  // Spacing.
  assert.notEqual(run('Publish now', 'chromium', {extra: 'letter-spacing:2px', fontExtra: {letterSpacing: 2}}).status, 'unknown');
  assert.ok(browserUnknown(run('Publish now', 'firefox', {extra: 'letter-spacing:2px', fontExtra: {letterSpacing: 2}}), /spacing/));
  assert.notEqual(run('検査。', 'chromium', {lang: 'ja', family: 'Noto Sans JP'}).status, 'unknown');
  // Right-to-left text.
  assert.ok(browserUnknown(run('שלום', 'firefox', {lang: 'he', family: 'Noto Sans Hebrew', extra: 'direction:rtl'}), /right-to-left/));
});

// Platforms: WebKit's form controls differ between Linux (WebKitGTK) and macOS (measured with Playwright 1.64.1, WebKit
// 27.2: text fields padding 1px on Linux, 2px 5px on macOS; textarea 2px, 2px 5px; button 2px 6px 3px, 0 6px 1px).
// webkit-linux and webkit-macos carry each platform's values; plain webkit keeps a value only where both agree, so it
// never verifies a geometry one platform contradicts.
const leaves = (value, path = []) => Array.isArray(value) ? value.flatMap((v, i) => leaves(v, [...path, i])) : value && typeof value === 'object' ? Object.entries(value).flatMap(([k, v]) => leaves(v, [...path, k])) : [[path, value]];
const at = (value, path) => path.reduce((v, k) => v?.[k], value);

test('ua profiles: webkit-linux and webkit-macos carry each platform; plain webkit keeps only the values both share', () => {
  const linux = resolveUAProfile('webkit-linux'), macos = resolveUAProfile('webkit-macos'), any = resolveUAProfile('webkit');
  assert.deepEqual(linux.textField.padding, ['1px', '1px', '1px', '1px']);
  assert.deepEqual(macos.textField.padding, ['2px', '5px', '2px', '5px']);
  assert.deepEqual(macos.textarea.padding, ['2px', '5px', '2px', '5px']);
  assert.deepEqual(macos.button.padding, ['0px', '6px', '1px', '6px']);
  assert.equal(macos.controlFont.size, '11px');
  for (const p of [linux, macos, any]) assert.equal(p.engine, 'webkit');
  assert.deepEqual(any.textField.padding, ['ua', 'ua', 'ua', 'ua']);
  assert.deepEqual(any.textarea.padding, ['2px', 'ua', '2px', 'ua']);
  assert.deepEqual(any.button.padding, ['ua', '6px', 'ua', '6px']);
  assert.deepEqual(any.textField.border, ['2px', '2px', '2px', '2px']);
  assert.deepEqual(any.checkbox, linux.checkbox);
  // Firefox: only the control font differs by platform (-apple-system on macOS; textarea 13px there, 12px on Linux).
  assert.equal(resolveUAProfile('firefox-macos').controlFont.textareaSize, '13px');
  assert.equal(resolveUAProfile('firefox').controlFont.textareaSize, 'ua');
  assert.deepEqual(resolveUAProfile('firefox').textarea, resolveUAProfile('firefox-linux').textarea);
  // Every value of a platform-agnostic profile is the value of each of its platforms, or not known.
  for (const [base, platforms] of [['webkit', ['webkit-linux', 'webkit-macos']], ['firefox', ['firefox-linux', 'firefox-macos']]])
    for (const [path, v] of leaves(resolveUAProfile(base))) if (!['name', 'engine'].includes(path[0]))
      assert.ok(v === 'ua' || platforms.every(p => at(resolveUAProfile(p), path) === v), `${base}.${path.join('.')} = ${v}`);
  assert.equal(resolveUAProfile({base: 'webkit-macos'}).engine, 'webkit');
  assert.throws(() => resolveUAProfile('webkit-windows'), /ua must be one of chromium, firefox, webkit, firefox-linux, firefox-macos, webkit-linux, webkit-macos/);
});

// The case vlmkit's check reset found on macOS: a 100px textarea in a 107px column fits Linux WebKit (2px padding, 1px
// border: 106px) and sticks out of it on macOS WebKit (5px padding: 112px).
const areaReport = ua => analyzeHTML('<html lang="en"><body><main class="c"><div class="col"><textarea class="s" aria-label="Note"></textarea></div></main></body></html>',
  {name: 'P', css: 'body{margin:0}.c{width:300px}.col{width:107px}.s{display:block;inline-size:100px;block-size:40px;resize:none}', viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, ua});

test('ua profiles: a textarea that fits Linux WebKit only is verified with webkit-linux, violated with webkit-macos and Unknown with webkit', () => {
  assert.equal(areaReport('webkit-linux').status, 'verified');
  const macos = areaReport('webkit-macos');
  assert.equal(macos.status, 'violated');
  assert.ok(macos.diagnostics.some(d => d.code === 'E_LAYOUT_ITEM_SIZE'), JSON.stringify(macos.diagnostics));
  const any = areaReport('webkit');
  assert.equal(any.status, 'unknown');
  assert.ok(any.diagnostics.some(d => d.code === 'U_LAYOUT_BROWSER' && /Linux 2px 2px 2px 2px, macOS 2px 5px 2px 5px.*webkit-linux' or 'webkit-macos'/.test(d.message)), JSON.stringify(any.diagnostics));
  // With the padding set, the platforms agree and plain webkit decides it.
  assert.equal(analyzeHTML('<html lang="en"><body><main class="c"><div class="col"><textarea class="s" aria-label="Note"></textarea></div></main></body></html>',
    {name: 'P', css: 'body{margin:0}.c{width:300px}.col{width:107px}.s{display:block;inline-size:100px;block-size:40px;resize:none;padding:2px}', viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, ua: 'webkit'}).status, 'verified');
});

test('suggestReset: a value that differs by platform is reset, and a target must know the values it keeps', () => {
  assert.equal(suggestReset({browsers: ['webkit-linux']}).rules.length, 0);
  // Plain webkit: Linux and macOS disagree on the field, textarea and button padding and the control font.
  const one = suggestReset({browsers: ['webkit']});
  assert.match(one.css, /input:not\(\[type\]\)[^{]*\{\n  padding-block: 1px;\n  padding-inline: 2px;/);
  assert.match(one.css, /:where\(textarea\) \{\n  padding-block: 2px;/);
  assert.match(one.css, /font: inherit/);
  assert.match(one.css, /webkit differs by platform/);
  assert.deepEqual(suggestReset({browsers: ['webkit-linux', 'webkit-macos'], target: 'webkit-macos'}).rules.find(r => r.selector === ':where(textarea)').declarations, ['padding-block: 2px', 'padding-inline: 5px']);
  assert.throws(() => suggestReset({browsers: ['chromium', 'webkit'], target: 'webkit'}), /the target webkit does not know the button padding/);
});

// macOS WebKit's native controls: the field and textarea padding scales with the control's font-size (2px 5px at the
// 11px UA control font, 4px 8px at 16px, 7px 15px at 30px; measured) and drops to 1px / 2px with appearance: none, and
// the button's follows appearance: none (0 6px 1px; 2px 6px 3px with none). So with an author font-size or appearance the
// sides the author does not set are Unknown; a number field has a 2px inline-end padding beside its spin buttons.
const fieldCase = (extra, tag = '<input class="f" type="text">') => analyzeHTML(`<html lang="en"><body><main class="g">${tag}<div class="after"></div></main></body></html>`,
  {name: 'P', css: `*{margin:0}html,body{margin:0;display:grid;grid-template-columns:minmax(0,1fr)}.g{display:grid;grid-template-columns:minmax(0,1fr);justify-items:start;align-content:start}.after{inline-size:40px;block-size:10px}.f{display:block;inline-size:100px;block-size:20px;${extra}}`, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, ua: 'webkit-macos'});
const fieldWidth = r => Number(r.sizes.find(x => x.box.startsWith('.f') && x.rect).rect.inlineSize.constant);

test('ua profiles: macOS WebKit\'s field padding is known only at the UA control font with the default appearance', () => {
  assert.equal(fieldWidth(fieldCase('')), 114); // 100 + 2 × 5px + 2 × 2px
  assert.equal(fieldWidth(fieldCase('', '<input class="f" type="number" aria-label="n">')), 111); // 100 + 5 + 2 + 2 × 2
  // Every appearance but none keeps the native padding (measured: button, textfield, textarea, menulist-button).
  assert.equal(fieldWidth(fieldCase('-webkit-appearance:textfield')), 114);
  for (const extra of ['font-size:16px', 'font:inherit', 'appearance:none']) {
    const r = fieldCase(extra);
    assert.equal(r.status, 'unknown', extra);
    assert.ok(r.diagnostics.some(d => d.code === 'U_LAYOUT_BROWSER' && /follows its font-size and appearance/.test(d.message)), `${extra}: ${JSON.stringify(r.diagnostics)}`);
  }
  // The author's padding decides it again (the border is the same whatever the font).
  assert.equal(fieldWidth(fieldCase('font-size:16px;padding:0 3px')), 110);
  // Linux WebKit's padding is the same whatever the font (as Chromium's and Firefox's on macOS, measured).
  assert.notEqual(analyzeHTML('<html lang="en"><body><input class="f" type="text" aria-label="t"></body></html>', {name: 'P', css: 'body{margin:0}.f{display:block;inline-size:100px;block-size:20px;font-size:16px}', viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, ua: 'webkit-linux'}).status, 'unknown');
  // A button: its appearance only.
  const button = extra => analyzeHTML('<html lang="en"><body><main class="g"><button class="b" type="button" aria-label="Go"></button></main></body></html>', {name: 'P', css: `body{margin:0}.g{display:grid;grid-template-columns:minmax(0,1fr);justify-items:start}.b{display:block;box-sizing:content-box;inline-size:120px;block-size:24px;${extra}}`, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, ua: 'webkit-macos'});
  assert.notEqual(button('font-size:20px').status, 'unknown');
  assert.notEqual(button('-webkit-appearance:button').status, 'unknown');
  assert.equal(button('appearance:none').status, 'unknown');
});
