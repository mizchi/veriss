// Checklist F: CSS that the browser accepts but that does nothing — mistakes a static check can point at.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';
import {analyzeLayout} from '../src/index.mjs';

const run = (css, html = '<div class="a"></div>') => analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
const codes = (r, code) => (r.layoutWarnings ?? []).filter(w => w.code === code);

test('F1: an animation whose name has no @keyframes does nothing', () => {
  const [w] = codes(run('.a{animation:spin 1s infinite}'), 'W_CSS_KEYFRAMES_MISSING');
  assert.ok(w); assert.equal(w.keyframes, 'spin'); assert.match(w.message, /@keyframes spin/);
  assert.equal(codes(run('.a{animation:spin 1s infinite}@keyframes spin{to{opacity:.5}}'), 'W_CSS_KEYFRAMES_MISSING').length, 0);
  // A typo in a list: only the missing one.
  assert.deepEqual(codes(run('.a{animation:fade 1s,spn 2s}@keyframes fade{to{opacity:.5}}'), 'W_CSS_KEYFRAMES_MISSING').map(w => w.keyframes), ['spn']);
  assert.equal(codes(run('.a{animation:none}'), 'W_CSS_KEYFRAMES_MISSING').length, 0);
  // Keyframes names are case-sensitive (generated names such as a CSS-in-JS library's mix the cases): an animation
  // naming @keyframes cqkDSr runs it, and one naming Spin does not run @keyframes spin.
  for (const css of ['.a{animation:2s linear 0s infinite normal none running cqkDSr}', '.a{animation-name:cqkDSr;animation-duration:2s}', '.a{animation:cqkDSr 2s, fade 1s}@keyframes fade{to{opacity:.5}}'])
    assert.equal(codes(run(`${css}@keyframes cqkDSr{to{opacity:.5}}`), 'W_CSS_KEYFRAMES_MISSING').length, 0, css);
  assert.deepEqual(codes(run('.a{animation:Spin 1s}@keyframes spin{to{opacity:.5}}'), 'W_CSS_KEYFRAMES_MISSING').map(w => w.keyframes), ['Spin']);
  // The CSS-wide keywords and none are not names, in any case.
  assert.equal(codes(run('.a{animation:NONE}'), 'W_CSS_KEYFRAMES_MISSING').length, 0);
  assert.equal(codes(run('.a{animation-name:None}'), 'W_CSS_KEYFRAMES_MISSING').length, 0);
});

test('F2: an animation with no duration runs for 0s', () => {
  assert.equal(codes(run('.a{animation:spin infinite}@keyframes spin{to{opacity:.5}}'), 'W_CSS_ANIMATION_NO_DURATION').length, 1);
  assert.equal(codes(run('.a{animation:spin 1s infinite}@keyframes spin{to{opacity:.5}}'), 'W_CSS_ANIMATION_NO_DURATION').length, 0);
  // 0s with fill-mode forwards or both applies the end state on purpose.
  assert.equal(codes(run('.a{animation:spin 0s forwards}@keyframes spin{to{opacity:.5}}'), 'W_CSS_ANIMATION_NO_DURATION').length, 0);
  // A scroll-driven animation has no time duration.
  assert.equal(codes(run('.a{animation:spin linear;animation-timeline:scroll()}@keyframes spin{to{opacity:.5}}'), 'W_CSS_ANIMATION_NO_DURATION').length, 0);
});

test('F3: a var() with no value and no fallback makes the declaration unset', () => {
  const [w] = codes(run('.a{color:var(--brand)}'), 'W_CSS_VAR_INVALID');
  assert.ok(w); assert.equal(w.property, 'color'); assert.match(w.message, /--brand/);
  assert.equal(codes(run('.a{color:var(--brand, red)}'), 'W_CSS_VAR_INVALID').length, 0);
  assert.equal(codes(run(':root{--brand:red}.a{color:var(--brand)}'), 'W_CSS_VAR_INVALID').length, 0);
});

test('F4: a max size below the min size fixes the box at the min', () => {
  const [w] = codes(run('.a{min-width:50px;max-width:10px}'), 'W_LAYOUT_MIN_ABOVE_MAX');
  assert.ok(w); assert.match(w.message, /always 50px wide/);
  assert.equal(codes(run('.a{min-width:10px;max-width:50px}'), 'W_LAYOUT_MIN_ABOVE_MAX').length, 0);
  assert.equal(codes(run('.a{min-height:50px;max-height:30px;height:auto}'), 'W_LAYOUT_MIN_ABOVE_MAX').length, 1);
});

test('F5: a media query that no viewport matches', () => {
  const [w] = codes(run('@media (min-width:900px) and (max-width:600px){.a{color:red}}'), 'W_CSS_MEDIA_NEVER');
  assert.ok(w); assert.match(w.message, /900/);
  assert.equal(codes(run('@media (min-width:600px) and (max-width:900px){.a{color:red}}'), 'W_CSS_MEDIA_NEVER').length, 0);
  assert.equal(codes(run('@media (width > 600px) and (width < 600px){.a{color:red}}'), 'W_CSS_MEDIA_NEVER').length, 1);
  // A list matches when any query does.
  assert.equal(codes(run('@media (min-width:900px) and (max-width:600px), print{.a{color:red}}'), 'W_CSS_MEDIA_NEVER').length, 0);
});

test('F6: a property declared twice in one rule: the earlier one never applies', () => {
  const [w] = codes(run('.a{color:red;color:blue}'), 'W_CSS_DUPLICATE_DECLARATION');
  assert.ok(w); assert.equal(w.property, 'color'); assert.match(w.message, /color: red never applies/);
  // !important keeps the earlier: the later never applies.
  assert.match(codes(run('.a{color:red !important;color:blue}'), 'W_CSS_DUPLICATE_DECLARATION')[0].message, /color: blue never applies/);
  // The fallback pattern: a later value in a newer function or unit is left alone.
  for (const css of ['.a{height:100vh;height:100dvh}', '.a{width:100%;width:calc(100% - 10px)}', '.a{display:block;display:-webkit-box}', '.a{color:red}.a{color:blue}']) assert.equal(codes(run(css), 'W_CSS_DUPLICATE_DECLARATION').length, 0, css);
});

test('F7: z-index on a box that is neither positioned nor a flex or grid item', () => {
  const html = '<div class="p"><div class="a"></div></div>';
  const inert = css => codes(run(css, html), 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes('z-index'));
  assert.equal(inert('.p{display:block}.a{z-index:5}'), true);
  assert.equal(inert('.p{display:block}.a{z-index:5;position:relative}'), false);
  assert.equal(inert('.p{display:flex}.a{z-index:5;flex:none;width:10px}'), false);
  assert.equal(inert('.p{display:grid;grid-template-columns:minmax(0,1fr)}.a{z-index:5}'), false);
});

test('F8: a transition between auto (or none) and a length jumps', () => {
  const jump = css => codes(run(`.a{width:100px}${css}`), 'W_CSS_TRANSITION_AUTO');
  const [w] = jump('.a{height:auto;transition:height .3s}.a:hover{height:100px}');
  assert.ok(w); assert.equal(w.property, 'block-size'); assert.match(w.message, /auto/);
  assert.equal(jump('.a{max-height:none;transition:max-height .3s}.a:hover{max-height:10px}').length, 1);
  assert.equal(jump('.a{height:20px;transition:height .3s}.a:hover{height:100px}').length, 0);
  // all covers it; no transition, no warning.
  assert.equal(jump('.a{height:auto;transition:all .3s}.a:hover{height:100px}').length, 1);
  assert.equal(jump('.a{height:auto}.a:hover{height:100px}').length, 0);
});

test('F9: a ::before or ::after with no content is never generated', () => {
  const [w] = codes(run('.a::before{display:block;width:10px;height:10px;background:red}'), 'W_CSS_PSEUDO_NO_CONTENT');
  assert.ok(w); assert.match(w.message, /content/);
  assert.equal(codes(run('.a::before{content:"";display:block;height:10px}'), 'W_CSS_PSEUDO_NO_CONTENT').length, 0);
  // Content from another rule counts.
  assert.equal(codes(run('.a::after{content:""}.a::after{display:block;height:4px}'), 'W_CSS_PSEUDO_NO_CONTENT').length, 0);
  // A reset for every element (*, *::before, *::after { box-sizing: border-box }) styles no pseudo-element in
  // particular: not a missing content, on any box.
  for (const css of ['*,*::before,*::after{box-sizing:border-box;margin:0}', '::before,::after{box-sizing:inherit}', '*:before,*:after{margin:0}'])
    assert.deepEqual(codes(run(css, '<div class="a"><div class="b"></div></div>'), 'W_CSS_PSEUDO_NO_CONTENT').map(w => w.box), [], css);
  // A rule for that element's pseudo-element still counts beside the reset.
  assert.deepEqual(codes(run('*,*::before,*::after{box-sizing:border-box}.a::before{width:10px}'), 'W_CSS_PSEUDO_NO_CONTENT').map(w => w.box), ['.a::before']);
});

test('F10: content on an element (not a pseudo-element) does nothing, unless it is an image', () => {
  assert.ok(codes(run('.a{content:"hi"}'), 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes('content')));
  assert.equal(codes(run('.a{content:normal}'), 'W_LAYOUT_DECLARATION_INERT').filter(w => w.properties.includes('content')).length, 0);
});

test('the mistakes are reported where the layout is Unknown too', () => {
  // A :focus rule that changes the layout keeps the layout Unknown before it runs; a style walk still reports them.
  const r = run('.a{color:var(--x);min-width:50px;max-width:10px;z-index:2}.a:focus{height:30px}', '<div class="p"><div class="a"></div></div>');
  assert.equal(r.status, 'unknown');
  assert.deepEqual(['W_CSS_VAR_INVALID', 'W_LAYOUT_MIN_ABOVE_MAX'].map(code => codes(r, code).length), [1, 1]);
  assert.equal(codes(run('.a::after{display:block;height:4px}.a:focus{height:30px}'), 'W_CSS_PSEUDO_NO_CONTENT').length, 1);
});

test('F12: a transition with no duration is instant', () => {
  assert.equal(codes(run('.a{transition:opacity}'), 'W_CSS_TRANSITION_NO_DURATION').length, 1);
  assert.equal(codes(run('.a{transition-property:opacity}'), 'W_CSS_TRANSITION_NO_DURATION').length, 1);
  assert.deepEqual(codes(run('.a{transition:opacity .2s, transform}'), 'W_CSS_TRANSITION_NO_DURATION').map(w => w.property), ['transform']);
  for (const css of ['.a{transition:opacity .2s}', '.a{transition:none}', '.a{transition-property:opacity;transition-duration:.3s}', '.a{transition:opacity 0s}']) assert.equal(codes(run(css), 'W_CSS_TRANSITION_NO_DURATION').length, 0, css);
});

test('F13: an over-constrained absolutely positioned box ignores its end inset', () => {
  const html = '<div class="p"><div class="a"></div></div>';
  const inert = (css, side) => codes(run(`.p{position:relative;height:100px}${css}`, html), 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes(side));
  assert.equal(inert('.a{position:absolute;top:0;left:10px;right:10px;width:50px;height:10px}', 'right'), true);
  assert.equal(inert('.a{position:absolute;top:0;bottom:0;left:0;width:10px;height:30px}', 'bottom'), true);
  assert.equal(inert('.a{position:absolute;top:0;left:10px;right:10px;height:10px}', 'right'), false);
  // Auto margins take up the slack instead (centring).
  assert.equal(inert('.a{position:absolute;top:0;left:0;right:0;width:50px;margin:0 auto;height:10px}', 'right'), false);
});

test('F14: a border width with no border style draws no border', () => {
  const [w] = codes(run('.a{border-width:2px}'), 'W_CSS_BORDER_NO_STYLE');
  assert.ok(w); assert.deepEqual(w.sides, ['top', 'right', 'bottom', 'left']);
  assert.deepEqual(codes(run('.a{border-left-width:4px}'), 'W_CSS_BORDER_NO_STYLE')[0]?.sides, ['left']);
  assert.deepEqual(codes(run('.a{border-width:0 2px}'), 'W_CSS_BORDER_NO_STYLE')[0]?.sides, ['right', 'left']);
  assert.equal(codes(run('.a{border-width:0 2px;border-style:solid}'), 'W_CSS_BORDER_NO_STYLE').length, 0);
  for (const css of ['.a{border-width:2px;border-style:solid}', '.a{border:2px solid red}', '.a{border-width:0}', '.a{border-style:solid;border-width:2px}']) assert.equal(codes(run(css), 'W_CSS_BORDER_NO_STYLE').length, 0, css);
  // A side's own shorthand gives it a style: no warning for it, and the shorthand is read (not Unknown).
  const unknown = r => r.diagnostics.filter(d => d.severity === 'unknown' && /border/.test(d.message));
  for (const css of ['.a{border:none}.a{border-top:1px dashed rgb(179, 186, 193)}', '.a{border-right:1px solid rgb(226, 232, 234)}', '.a{border-bottom:2px dotted}', '.a{border:2px dashed #333}', '.a{border-left:solid 3px blue}']) {
    const r = run(css);
    assert.equal(codes(r, 'W_CSS_BORDER_NO_STYLE').length, 0, css);
    assert.deepEqual(unknown(r), [], css);
  }
  assert.deepEqual(codes(run('.a{border-width:2px}.a{border-top:1px solid red}'), 'W_CSS_BORDER_NO_STYLE')[0]?.sides, ['right', 'bottom', 'left']);
  // A width alone in a side's shorthand leaves its style none, as in border.
  assert.deepEqual(codes(run('.a{border-top:2px}'), 'W_CSS_BORDER_NO_STYLE')[0]?.sides, ['top']);
  // The style declared none (or hidden) beside the width says there is no border on purpose: the longhands a browser
  // serializes border: none into (border-width: medium; border-style: none) are not a forgotten style.
  for (const css of ['.a{border-width:medium;border-style:none;border-color:currentcolor}', '.a{border-right-width:medium;border-right-style:none}', '.a{border-width:2px;border-style:hidden}'])
    assert.equal(codes(run(css), 'W_CSS_BORDER_NO_STYLE').length, 0, css);
});

test('F15, F16: background-size with no image, text-decoration-color with no line', () => {
  const inert = (css, prop) => codes(run(css), 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes(prop));
  assert.equal(inert('.a{background-size:cover}', 'background-size'), true);
  assert.equal(inert('.a{background:url(a.png);background-size:cover}', 'background-size'), false);
  assert.equal(inert('.a{background-position:center;background-color:red}', 'background-position'), true);
  assert.equal(inert('.a{text-decoration-color:red}', 'text-decoration-color'), true);
  assert.equal(inert('.a{text-decoration:underline;text-decoration-color:red}', 'text-decoration-color'), false);
  // An image only on :hover (or in a media condition): the size acts there.
  assert.equal(inert('.a{background-size:cover}.a:hover{background-image:url(a.png)}', 'background-size'), false);
  assert.equal(inert('.a{background-size:cover}@media (min-width:800px){.a{background-image:url(a.png)}}', 'background-size'), false);
  // Another rule for another element is not this one's.
  assert.equal(inert('.b{background-size:cover}', 'background-size'), false);
});

test('F17, F18: a :focus rule on an element that cannot take focus, a :hover on one the pointer never hits', () => {
  const st = (html, css) => codes(run(css, html), 'W_CSS_STATE_UNREACHABLE');
  assert.equal(st('<div class="a"></div>', '.a:focus{color:red}').length, 1);
  assert.equal(st('<div class="a" tabindex="0"></div>', '.a:focus{color:red}').length, 0);
  assert.equal(st('<button class="a" type="button">Go</button>', '.a:focus-visible{color:red}').length, 0);
  assert.equal(st('<a class="a" href="#x">Go</a>', '.a:focus{color:red}').length, 0);
  assert.equal(st('<details><summary class="a">More</summary></details>', '.a:focus{color:red}').length, 0);
  assert.equal(st('<a class="a">No href</a>', '.a:focus{color:red}').length, 1);
  assert.equal(st('<div class="a"></div>', '.a{pointer-events:none}.a:hover{color:red}').length, 1);
  assert.equal(st('<div class="a"></div>', '.a:hover{color:red}').length, 0);
});

test('F19: :checked on an element that is never checked, ::placeholder on one that shows none', () => {
  const st = (html, css) => codes(run(css, html), 'W_CSS_STATE_UNREACHABLE');
  assert.equal(st('<div class="a"></div>', '.a:checked{color:red}').length, 1);
  assert.equal(st('<input class="a" type="checkbox" aria-label="x">', '.a:checked{color:red}').length, 0);
  assert.equal(st('<input class="a" type="text" aria-label="x">', '.a::placeholder{color:red}').length, 1);
  assert.equal(st('<input class="a" type="text" placeholder="Name" aria-label="x">', '.a::placeholder{color:red}').length, 0);
  assert.equal(st('<div class="a"></div>', '.a::placeholder{color:red}').length, 1);
});

test('F20: :visited applies only colors', () => {
  const html = '<a class="a" href="#x">Docs</a>';
  const run2 = (css, h) => analyzeHTML(`<html lang="en"><body>${h}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}, boxes: {'.a': {minInlineSize: 0, intrinsicBlockSize: 20}}});
  const r = run2('.a{display:block;height:20px}.a:visited{color:purple;font-weight:bold;background-image:url(v.png)}', html);
  assert.deepEqual(codes(r, 'W_CSS_VISITED_IGNORED').map(w => w.property).sort(), ['background-image', 'font-weight']);
  // Dropped as the browser does: not a layout change in a state rule (no Unknown).
  assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.equal(codes(run('.a{display:block;height:20px}.a:visited{color:purple;border-color:red}', html), 'W_CSS_VISITED_IGNORED').length, 0);
});

test(':disabled and :enabled match form controls by their disabled attribute and a disabled fieldset', () => {
  const color = (html, css) => { const r = analyzeHTML(`<html lang="en"><body><main class="m">${html}</main></body></html>`, {name: 'P', css: `*{margin:0}html,body,.m{display:grid;grid-template-columns:minmax(0,1fr)}.m{background:#fff;color:#000}button{height:20px;font:16px/20px sans-serif;padding:0;border:0}${css}`, viewport: {min: 320, max: 800, height: {min: 300, max: 900}}, boxes: {'button': {minInlineSize: 0, intrinsicBlockSize: 20}}}); return r.status === 'unknown' ? 'unknown:' + r.diagnostics.map(d => d.message).join('|').slice(0, 120) : 'ok'; };
  assert.equal(color('<button type="button" disabled>A</button>', 'button:disabled{display:none}'), 'ok');
  // Parsed (not Unknown any more).
  assert.equal(color('<button type="button">A</button>', 'button:enabled{height:20px}'), 'ok');
});

test(':disabled matching: own attribute, a disabled fieldset, and its first legend excepted', async () => {
  const {htmlBoxTree} = await import('../src/html.mjs');
  const {compileSelector, matches} = await import('../src/layout/selectors.mjs');
  const {normalizeTree} = await import('../src/tree.mjs');
  const {root: tree} = normalizeTree(htmlBoxTree('<html lang="en"><body><form><input class="own" disabled aria-label="a"><fieldset disabled><legend><input class="legend" aria-label="b"></legend><input class="inside" aria-label="c"></fieldset><input class="free" aria-label="d"></form></body></html>').tree, 'P');
  const all = []; (function walk(b) { all.push(b); for (const c of [...(b.children ?? []), ...(b.inline ?? [])]) walk(c); })(tree);
  const by = cls => all.find(b => b.classes?.includes(cls));
  const dis = compileSelector('input:disabled'), en = compileSelector('input:enabled');
  assert.deepEqual(['own', 'legend', 'inside', 'free'].map(c => [matches(dis, by(c)), matches(en, by(c))]), [[true, false], [false, true], [true, false], [false, true]]);
});

test('a :disabled rule on an option in a disabled select (browsers differ) keeps the analysis Unknown', () => {
  const r = analyzeHTML('<html lang="en"><body><fieldset disabled><select aria-label="s"><option>a</option></select></fieldset></body></html>', {name: 'P', css: 'option:disabled{color:gray}', viewport: {min: 320, max: 800, height: {min: 300, max: 900}}});
  assert.ok(r.diagnostics.some(d => d.code === 'U_LAYOUT_ATTRIBUTE' && /browsers decide differently/.test(d.message)), JSON.stringify(r.diagnostics.map(d => d.message)));
});

test('F22: ::marker takes only some properties; on a non-list-item it never applies', () => {
  const html = '<ul class="l"><li class="i"></li></ul><div class="d"></div>';
  const css = '.l{display:block;padding-left:40px}.i{height:20px}.d{height:20px}';
  const r = run(css + '.i::marker{color:red;margin-left:40px;background:blue}', html);
  assert.deepEqual(codes(r, 'W_CSS_MARKER_IGNORED').map(w => w.property).sort(), ['background', 'margin-left']);
  assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.map(d => d.message)));
  // Sizing the marker: Unknown (the marker box is not modeled).
  assert.equal(run(css + '.i::marker{font-size:40px}', html).status, 'unknown');
  // On an element that is not a list item.
  assert.equal(codes(run(css + '.d::marker{color:red}', html), 'W_CSS_STATE_UNREACHABLE').length, 1);
  assert.equal(codes(run(css + '.i::marker{color:red}', html), 'W_CSS_STATE_UNREACHABLE').length, 0);
});

test('F8 in plain HTML: the class toggle the stylesheet names (.panel.open)', () => {
  const html = '<div class="panel"></div>';
  const jump = css => codes(run(`.panel{width:100px}${css}`, html), 'W_CSS_TRANSITION_AUTO');
  const [w] = jump('.panel{transition:height .3s}.panel.open{height:120px}');
  assert.ok(w); assert.match(w.message, /\.open/);
  assert.equal(jump('.panel{height:0;transition:height .3s}.panel.open{height:120px}').length, 0);
  // A rule for another element (another class it lacks on the subject's ancestor chain) is not a toggle of this one.
  assert.equal(jump('.panel{transition:height .3s}.card .panel{height:120px}').length, 0);
});

test('F23, G1: user-select: none on a text field; a summary that lost its disclosure triangle', () => {
  assert.ok(codes(run('.i{user-select:none}', '<input class="i" aria-label="x">'), 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes('user-select')));
  assert.equal(codes(run('.a{user-select:none}'), 'W_LAYOUT_DECLARATION_INERT').filter(w => w.properties.includes('user-select')).length, 0);
  const sum = css => codes(run(css, '<details><summary class="s">More</summary><p>x</p></details>'), 'W_A11Y_SUMMARY_INDICATOR');
  assert.equal(sum('.s{display:block}').length, 1);
  assert.equal(sum('.s{list-style:none}').length, 1);
  assert.equal(sum('.s{display:block}.s::before{content:"+"}').length, 0);
  assert.equal(sum('').length, 0);
});

test('F24, F25: table-layout: fixed with no width, border-spacing with collapsed borders', () => {
  const html = '<table class="t"><tbody><tr><td>a</td><td>b</td></tr></tbody></table>';
  const inert = (css, prop) => codes(run(css, html), 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes(prop));
  assert.equal(inert('.t{table-layout:fixed}', 'table-layout'), true);
  assert.equal(inert('.t{table-layout:fixed;width:300px}', 'table-layout'), false);
  assert.equal(inert('.t{border-collapse:collapse;border-spacing:8px}', 'border-spacing'), true);
  assert.equal(inert('.t{border-spacing:8px}', 'border-spacing'), false);
});

test('F26: table > tr never matches: the parser inserts a tbody', () => {
  const html = '<table class="t"><tr class="r"><td>x</td></tr></table>';
  const w = css => codes(run(css, html), 'W_CSS_SELECTOR_IMPLIED_PARENT');
  assert.equal(w('.t > .r{color:red}').length, 1);
  assert.equal(w('table > tr{color:red}').length, 1);
  assert.equal(w('.t .r{color:red}').length, 0);
  assert.equal(w('.t > tbody > .r{color:red}').length, 0);
  // A tbody written in the source is not implied.
  assert.equal(codes(run('.t > .r{color:red}', '<table class="t"><tbody><tr class="r"><td>x</td></tr></tbody></table>'), 'W_CSS_SELECTOR_IMPLIED_PARENT').length, 0);
  // The skipped tbody in the middle of the selector: the subject is a cell (or something inside it), not the row.
  const deep = '<table class="t"><tr class="r"><td class="c"><span class="s">x</span></td></tr></table>';
  for (const sel of ['.t > .r > td', '.t > tr > .c', 'table > tr td', '.t > .r > .c > .s', '.t > .r .s']) {
    const found = codes(run(`${sel}{color:red}`, deep), 'W_CSS_SELECTOR_IMPLIED_PARENT');
    assert.equal(found.length, 1, sel);
    assert.match(found[0].message, /tbody/, sel);
  }
  // Controls: these match as written (no child combinator across the implied tbody), or never match either way.
  for (const sel of ['.t .r > td', '.t td', '.t > tbody > .r > td', '.r > .c > .s', '.t > .c', '.t > .r > th'])
    assert.equal(codes(run(`${sel}{color:red}`, deep), 'W_CSS_SELECTOR_IMPLIED_PARENT').length, 0, sel);
  // A written tbody is not implied, however deep the subject.
  assert.equal(codes(run('.t > .r > td{color:red}', '<table class="t"><tbody><tr class="r"><td>x</td></tr></tbody></table>'), 'W_CSS_SELECTOR_IMPLIED_PARENT').length, 0);
});

test('F27: the HTML parser changed the structure written in the source', () => {
  const re = html => codes(run('', html), 'W_HTML_RESTRUCTURED').map(w => w.tag);
  assert.deepEqual(re('<p class="p">text<div class="d">x</div></p>'), ['p']);
  assert.deepEqual(re('<a href="#x">a<a href="#y">b</a></a>'), ['a']);
  assert.deepEqual(re('<table><div class="f">x</div><tr><td>a</td></tr></table>'), ['div']);
  assert.deepEqual(re('<form action="/a"><form action="/b"><input aria-label="x"></form></form>'), ['form']);
  for (const html of ['<table><tr><td><div>ok</div></td></tr></table>', '<form action="/a"></form><form action="/b"></form>', '<p>a</p><p>b</p>', '<ul><li>a<li>b</ul>', '<svg width="10" height="10"><path d="M0 0"/></svg>', '<table><tr><td>x</td></tr></table>', '<img src="a.png" alt="">']) assert.deepEqual(re(html), [], html);
});

test('F28: presentational attributes on elements they do not map to', () => {
  const r = run('.a{height:20px}', '<div class="a" width="100" height="50" bgcolor="red" border="2"></div>');
  assert.deepEqual(codes(r, 'W_HTML_ATTRIBUTE_INERT')[0]?.attributes, ['width', 'height', 'bgcolor', 'border']);
  assert.notEqual(r.status, 'unknown');
  // Where they map (a table's width, a div's align) they still need an adapter: Unknown, no warning.
  assert.equal(codes(run('', '<div class="a" align="center"></div>'), 'W_HTML_ATTRIBUTE_INERT').length, 0);
  assert.equal(codes(run('', '<table width="300"><tr><td>x</td></tr></table>'), 'W_HTML_ATTRIBUTE_INERT').length, 0);
  // size, color and align on an element that does not take them (a component library's props leaked to the DOM).
  const leaked = run('.a{height:20px}', '<span class="a" size="18" color="red" align="center">x</span>');
  assert.deepEqual(codes(leaked, 'W_HTML_ATTRIBUTE_INERT')[0]?.attributes, ['size', 'color', 'align']);
  assert.deepEqual(leaked.diagnostics.filter(d => d.code === 'U_LAYOUT_HTML'), []);
  // Where size maps (a text field's width in characters) it still needs an adapter.
  assert.ok(run('', '<input class="a" size="5" aria-label="n">').diagnostics.some(d => d.code === 'U_LAYOUT_HTML' && /size/.test(d.message)));
});

test('a name that is not an HTML attribute (a framework prop leaked to the DOM) renders nothing; CSS still selects by it', () => {
  const r = run('.a{height:20px}', '<div class="a" placement="top" position="relative" _size="small" hastoasts="true" variant="primary"></div>');
  assert.deepEqual(r.diagnostics.filter(d => d.code === 'U_LAYOUT_HTML'), []);
  assert.deepEqual(codes(r, 'W_HTML_ATTRIBUTE_INERT'), []);
  const height = r2 => r2.sizes.find(x => x.box === '.a' && x.rect)?.rect;
  const selected = run('.a{height:20px}.a[placement="top"]{height:30px}', '<div class="a" placement="top"></div>');
  assert.equal(selected.diagnostics.filter(d => d.code === 'U_LAYOUT_HTML').length, 0);
  assert.equal(JSON.stringify(height(selected)).includes('30'), true, JSON.stringify(height(selected)));
  // An attribute that renders on some element is still an adapter's (contenteditable makes a box focusable and editable).
  assert.ok(run('', '<div class="a" contenteditable="true"></div>').diagnostics.some(d => d.code === 'U_LAYOUT_HTML'));
});

test('F29: :empty does not match an element holding whitespace', () => {
  const w = html => codes(run('.x:empty{display:none}', html), 'W_CSS_EMPTY_WHITESPACE');
  assert.equal(w('<div class="x"> </div>').length, 1);
  assert.equal(w('<div class="x">\n  </div>').length, 1);
  assert.equal(w('<div class="x"></div>').length, 0);
  assert.equal(w('<div class="x"><!-- c --></div>').length, 0);
});

test('F30: display: contents on a replaced element or form control removes it', () => {
  const w = (html, css = '.x{display:contents}') => codes(run(css, html), 'W_LAYOUT_CONTENTS_REMOVED');
  const [hit] = w('<input class="x" aria-label="q">');
  assert.ok(hit && /display: none/.test(hit.message));
  assert.equal(w('<img class="x" alt="" src="a.png" width="20" height="20">').length, 1);
  assert.equal(w('<textarea class="x" aria-label="q"></textarea>').length, 1);
  assert.equal(w('<button class="x" type="button"><span class="a"></span></button>').length, 0);
  assert.equal(w('<ul class="x"><li class="a"></li></ul>').length, 0);
  assert.equal(w('<input class="x" aria-label="q">', '.x{display:block;inline-size:100px;block-size:20px}').length, 0);
});

test('F31: overflow: auto or scroll on a table does nothing (the table grows; wrap it to scroll)', () => {
  const table = '<table class="t"><tbody><tr><td class="a"></td></tr></tbody></table>';
  const w = css => codes(run(css, table), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.some(p => p.startsWith('overflow')));
  const [hit] = w('.t{overflow-x:auto}');
  assert.ok(hit && /wrap/i.test(hit.message));
  assert.equal(w('.t{overflow:scroll}').length, 1);
  assert.equal(w('.t{overflow:hidden}').length, 0);
  assert.equal(w('.t{display:block;overflow-x:auto}').length, 0);
  assert.equal(codes(run('.w{overflow-x:auto}', `<div class="w">${table}</div>`), 'W_LAYOUT_DECLARATION_INERT').length, 0);
});

test('F32: ::before / ::after on an element that does not render them (img, text input, select, textarea, iframe, video, br, canvas)', () => {
  const pc = '::before{content:"";display:block;height:30px}';
  const field = 'style="display:block;inline-size:100px;block-size:20px"';
  const w = (html, css) => codes(run(css, html), 'W_CSS_PSEUDO_NOT_RENDERED');
  const r = run(`.x${pc}`, `<input class="x" aria-label="q" ${field}>`);
  const [hit] = codes(r, 'W_CSS_PSEUDO_NOT_RENDERED');
  assert.ok(hit && /::before/.test(hit.message));
  assert.equal(codes(r, 'W_CSS_PSEUDO_NO_CONTENT').length, 0);
  assert.equal(w(`<img class="x" alt="" src="a.png" ${field}>`, `.x${pc}`).length, 1);
  assert.equal(w(`<textarea class="x" aria-label="q" ${field}></textarea>`, '.x::after{content:"*"}').length, 1);
  assert.equal(w('<div class="x"></div>', `.x${pc}`).length, 0);
  assert.equal(w('<input class="x" type="checkbox" aria-label="q">', `.x${pc}`).length, 0);
  assert.equal(w(`<button class="x" type="button" ${field}>b</button>`, `.x${pc}`).length, 0);
});

test('F33: :last-child / :first-child / :nth-child miss because of a sibling that never renders (template, script)', () => {
  const list = tail => `<div class="w"><div class="a"></div><div class="a"></div>${tail}</div>`;
  const w = (css, html) => codes(run(css, html), 'W_CSS_CHILD_INDEX_HIDDEN_SIBLING');
  const r = run('.a:last-child{height:50px}', list('<template><b></b></template>'));
  assert.equal(r.status, 'verified');
  const [hit] = codes(r, 'W_CSS_CHILD_INDEX_HIDDEN_SIBLING');
  assert.ok(hit && /<template>/.test(hit.message) && hit.selector === '.a:last-child');
  assert.equal(w('.a:last-child{height:50px}', list('<script>1</script>')).length, 1);
  assert.equal(w('.a:first-child{height:50px}', '<div class="w"><template></template><div class="a"></div></div>').length, 1);
  assert.equal(w('.a:nth-child(2){height:50px}', '<div class="w"><template></template><div class="a"></div><div class="a"></div></div>').length, 1);
  assert.equal(w('.a:last-of-type{height:50px}', list('<template></template>')).length, 0);
  assert.equal(w('.a:last-child{height:50px}', list('')).length, 0);
  assert.equal(run('', list('<template></template>')).status, 'verified');
  assert.equal(run('', list('<template shadowrootmode="open"><b></b></template>')).status, 'unknown');
  assert.equal(run('template{display:block}', list('<template></template>')).status, 'unknown');
});

test('F34: columns on a flex or grid container do nothing', () => {
  const items = '<div class="x"><div class="a"></div><div class="a"></div></div>';
  const w = css => codes(run(css, items), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.some(p => p.startsWith('column-')));
  const r = run('.x{display:flex;columns:2}', items);
  assert.equal(r.status, 'verified');
  const [hit] = codes(r, 'W_LAYOUT_DECLARATION_INERT');
  assert.ok(hit && /multi-column/.test(hit.message) && hit.properties.includes('column-count'));
  assert.equal(w('.x{display:grid;column-count:3}').length, 1);
  assert.equal(w('.x{display:flex;column-width:100px}').length, 1);
  assert.equal(w('.x{display:flex}').length, 0);
  assert.equal(run('.x{columns:2}', items).status, 'unknown');
});

test('F35: :focus-within on an element with nothing focusable inside', () => {
  const w = (css, html) => codes(run(css, html), 'W_CSS_STATE_UNREACHABLE').filter(x => x.state === 'focus-within');
  const [hit] = w('.x:focus-within{outline:2px solid}', '<div class="x"><p class="a">t</p></div>');
  assert.ok(hit && /focusable/.test(hit.message));
  assert.equal(w('.x:focus-within{outline:2px solid}', '<div class="x"><button class="a" type="button">b</button></div>').length, 0);
  assert.equal(w('.x:focus-within{outline:2px solid}', '<div class="x"><p class="a">t <a href="/y">y</a></p></div>').length, 0);
  assert.equal(w('.x:focus-within{outline:2px solid}', '<div class="x" tabindex="-1"><p class="a">t</p></div>').length, 0);
  assert.equal(w('.x:focus-within{outline:2px solid}', '<div class="x"><div class="a" tabindex="0"></div></div>').length, 0);
});

test('F17: :focus on a tabindex="-1" element is reachable (a click or focus() focuses it)', () => {
  const w = html => codes(run('.x:focus{outline:2px solid}', html), 'W_CSS_STATE_UNREACHABLE');
  assert.equal(w('<div class="x a" tabindex="-1"></div>').length, 0);
  assert.equal(w('<div class="x a"></div>').length, 1);
});

test('F36: a :hover / :focus transform on an inline box does nothing', () => {
  const w = (css, html) => codes(run(css, html), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.state);
  const [hit] = w('.x:hover{transform:translateY(-2px)}', '<p class="a">t <a class="x" href="/y">y</a></p>');
  assert.ok(hit && hit.state === 'hover' && /inline/.test(hit.message));
  assert.equal(w('.x:focus-visible{scale:1.1}', '<p class="a">t <a class="x" href="/y">y</a></p>').length, 1);
  assert.equal(w('.x:hover{transform:translateY(-2px)}', '<div class="x a"></div>').length, 0);
  assert.equal(w('.x{display:inline-block}.x:hover{transform:translateY(-2px)}', '<p class="a">t <a class="x" href="/y">y</a></p>').length, 0);
  assert.equal(w('.x:hover{transform:translateY(-2px)}', '<p class="a">t <img class="x" alt="" src="a.png" width="10" height="10"></p>').length, 0);
});

test('F37: ::first-letter / ::first-line on a box that is not a block container (inline, flex, grid) never applies', () => {
  const w = (css, html) => codes(run(css, html), 'W_CSS_STATE_UNREACHABLE').filter(x => /^::first-/.test(x.state));
  const r = run('.x{display:flex}.x::first-letter{font-size:2em}', '<div class="x"><div class="a"></div></div>');
  assert.equal(r.status, 'verified');
  const [hit] = codes(r, 'W_CSS_STATE_UNREACHABLE');
  assert.ok(hit && hit.state === '::first-letter' && /block container/.test(hit.message));
  assert.equal(w('.x{display:grid}.x::first-line{color:red}', '<div class="x"><div class="a"></div></div>').length, 1);
  assert.equal(w('.x::first-letter{color:red}', '<p class="a">t <span class="x">s</span></p>').length, 1);
  assert.equal(run('.x::first-letter{font-size:2em}', '<p class="x a">text</p>').status, 'unknown');
  assert.equal(w('.x::first-letter{font-size:2em}', '<p class="x a">text</p>').length, 0);
  assert.equal(run('.y::first-letter{font-size:2em}', '<div class="x a"></div>').status, 'verified');
});

test('F38: margin: auto does not centre an absolutely positioned box with an auto inset or size', () => {
  const w = c => codes(run(`.w{position:relative;height:300px}.m{position:absolute;width:200px;height:50px;${c}}`, '<div class="w"><div class="m"></div></div>'), 'W_LAYOUT_AUTO_MARGIN_ABSOLUTE');
  const [hit] = w('margin:auto');
  assert.ok(hit && /inset: 0/.test(hit.message));
  assert.deepEqual(hit.axes, ['horizontal', 'vertical']);
  assert.deepEqual(w('left:0;margin:0 auto')[0]?.axes, ['horizontal']);
  assert.deepEqual(w('inset:0 auto 0 0;margin:auto')[0]?.axes, ['horizontal']);
  assert.equal(w('inset:0;margin:auto').length, 0);
  assert.equal(w('left:0;right:0;margin:0 auto').length, 0);
  assert.equal(w('left:0;top:0').length, 0);
});

test('F39: object-position does nothing under object-fit: fill', () => {
  const img = '<img class="x" alt="" src="a.png" width="40" height="40">';
  const w = css => codes(run(`.x{display:block;width:100px;height:50px;${css}}`, img), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.includes('object-position'));
  const [hit] = w('object-position:left top');
  assert.ok(hit && /object-fit/.test(hit.message));
  assert.equal(w('object-fit:fill;object-position:0 0').length, 1);
  assert.equal(w('object-fit:cover;object-position:left top').length, 0);
  assert.equal(w('object-fit:contain;object-position:right').length, 0);
  assert.equal(w('object-fit:none;object-position:right').length, 0);
});

test('F40: place-items / place-content / place-self read as their align and justify longhands', () => {
  const items = '<div class="x"><div class="a"></div><div class="a"></div></div>';
  const same = (short, long) => {
    const a = run(`.x{display:grid;grid-template-columns:100px 100px;height:100px;${short}}`, items), b = run(`.x{display:grid;grid-template-columns:100px 100px;height:100px;${long}}`, items);
    assert.equal(a.status, b.status, short);
    assert.deepEqual((a.layoutWarnings ?? []).map(w => w.code), (b.layoutWarnings ?? []).map(w => w.code), short);
  };
  same('place-items:center', 'align-items:center;justify-items:center');
  same('place-items:start stretch', 'align-items:start;justify-items:stretch');
  same('place-content:center', 'align-content:center;justify-content:center');
  same('place-content:start space-between', 'align-content:start;justify-content:space-between');
  assert.notEqual(run('.x{display:grid;place-items:center}', items).layoutWarnings?.[0]?.message?.includes('Unsupported'), true);
  const block = codes(run('.x{place-items:center}', '<div class="x a"></div>'), 'W_LAYOUT_DECLARATION_INERT');
  assert.ok(block.some(w => w.properties.includes('align-items')));
});

test('F41: fill / stroke on an svg whose shapes all set their own fill / stroke attribute does nothing', () => {
  const svg = inner => `<svg class="i" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">${inner}</svg>`;
  const w = (css, inner) => codes(run(`.i{display:block}${css}`, svg(inner)), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.some(p => p === 'fill' || p === 'stroke'));
  const [hit] = w('.i{fill:red}', '<path fill="#000" d="M0 0h20v20H0z"/>');
  assert.ok(hit && /attribute/.test(hit.message) && hit.properties.includes('fill'));
  assert.equal(w('.i{fill:red}', '<g fill="#000"><path d="M0 0h20v20H0z"/><path d="M0 0h2v2H0z"/></g>').length, 1);
  assert.equal(w('.i{stroke:red}', '<path fill="none" stroke="#000" d="M2 2h16v16H2z"/>').length, 1);
  assert.equal(w('.i{fill:red}', '<path d="M0 0h20v20H0z"/>').length, 0);
  assert.equal(w('.i{fill:red}', '<path fill="#000" d="M0 0h20v20H0z"/><path d="M0 0h2v2H0z"/>').length, 0);
  assert.equal(w('.i{fill:red}', '<path fill="inherit" d="M0 0h20v20H0z"/>').length, 0);
  assert.equal(w('.i{fill:red}.i path{fill:blue}', '<path fill="#000" d="M0 0h20v20H0z"/>').length, 0);
});

test('F42: background, color, border and padding on a checkbox or radio of appearance auto do nothing', () => {
  const html = '<label class="a"><input class="x" type="checkbox"> Accept</label>';
  const w = css => codes(run(css, '<input class="x" type="checkbox" aria-label="q">'), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.some(p => /^(?:background-color|color|border|padding|border-.*-radius)/.test(p)));
  const [hit] = w('.x{background-color:red;border:2px solid red}');
  assert.ok(hit && /appearance: none/.test(hit.message) && /accent-color/.test(hit.message));
  assert.ok(hit.properties.includes('background-color'));
  assert.equal(w('.x{color:red}').length, 1);
  assert.equal(w('.x{padding:4px}').length, 1);
  assert.equal(w('.x{appearance:none;background-color:red;width:20px;height:20px}').length, 0);
  assert.equal(w('.x{accent-color:red}').length, 0);
  assert.equal(codes(run('.x{background-color:red}', '<input class="x" type="text" aria-label="q">'), 'W_LAYOUT_DECLARATION_INERT').length, 0);
});

test('F43: min-height / max-height on a table cell do nothing; min-width / max-width neither in a fixed table', () => {
  const t = '<table class="t"><tbody><tr><td class="c"></td><td class="d"></td></tr></tbody></table>';
  const base = '.t{border-spacing:0}td{padding:0;height:20px}';
  const w = css => codes(run(base + css, t), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.some(p => /^(?:min|max)-(?:block|inline)-size$/.test(p)));
  const r = run(base + '.c{min-height:80px}', t);
  const [hit] = w('.c{min-height:80px}');
  assert.ok(hit && /table cell/.test(hit.message) && hit.properties.includes('min-block-size'));
  assert.ok(!JSON.stringify(r).includes('min-block-size on a table cell has no defined effect'));
  assert.equal(w('.c{max-height:10px}').length, 1);
  assert.equal(w('.t{table-layout:fixed;width:300px}.c{max-width:60px}').length, 1);
  assert.equal(w('.c{max-width:60px}').length, 0);
});

test('F44: cursor on an element with pointer-events: none never shows', () => {
  const w = (css, html = '<div class="x a"></div>') => codes(run(css, html), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.includes('cursor'));
  const [hit] = w('.x{pointer-events:none;cursor:pointer}');
  assert.ok(hit && /pointer-events: none/.test(hit.message));
  assert.equal(w('.p{pointer-events:none}.x{cursor:not-allowed}', '<div class="p"><div class="x a"></div></div>').length, 1);
  assert.equal(w('.x{cursor:pointer}').length, 0);
  assert.equal(w('.x{pointer-events:none;cursor:pointer}', '<div class="x"><div class="a"></div></div>').length, 0);
  assert.equal(w('.x{pointer-events:none;cursor:auto}').length, 0);
});

test('F45: text-align / text-indent / text-align-last on an inline element do nothing', () => {
  const w = (css, html = '<p class="a">before <span class="x">s</span> after</p>') => codes(run(css, html), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.some(p => /^text-(?:align|indent|align-last)$/.test(p)));
  const [hit] = w('.x{text-align:center}');
  assert.ok(hit && /display: inline/.test(hit.message) && hit.properties.includes('text-align'));
  assert.equal(w('.x{text-indent:2em}', '<p class="a">t <a class="x" href="/y">y</a></p>').length, 1);
  assert.equal(w('.x{display:block;text-align:center}').length, 0);
  assert.equal(w('.x{text-align:center}', '<p class="x a">t</p>').length, 0);
  assert.equal(w('.x{text-align:center}', '<p class="a">t <span class="x">a <b>b</b></span></p>').length, 0);
});

test('F46: ::selection is read (it styles only the selected text, not the layout); its box properties are ignored', () => {
  const r = run('::selection{background:#ff0;color:#000}', '<div class="a"></div>');
  assert.equal(r.status, 'verified');
  const w = css => codes(run(css), 'W_CSS_SELECTION_IGNORED');
  const [hit] = w('.a::selection{padding:4px;font-size:20px;color:red}');
  assert.ok(hit && /::selection/.test(hit.message));
  assert.deepEqual(w('.a::selection{padding:4px;font-size:20px;color:red}').map(x => x.property).sort(), ['font-size', 'padding']);
  assert.equal(w('.a::selection{color:red;background-color:#ff0}').length, 0);
  assert.equal(run('.a::selection{margin:10px}').status, 'verified');
});

test('F47: margin, height, display and position in ::placeholder are ignored', () => {
  const field = '<input class="x" placeholder="Search" aria-label="q">';
  const base = '.x{display:block;inline-size:200px;block-size:30px;box-sizing:border-box;appearance:none;padding:0;border:0;min-inline-size:0;min-block-size:0}';
  const w = css => codes(run(base + css, field), 'W_CSS_PLACEHOLDER_IGNORED');
  assert.deepEqual(w('.x::placeholder{margin:10px;height:40px;color:#555}').map(x => x.property).sort(), ['height', 'margin']);
  assert.ok(/::placeholder/.test(w('.x::placeholder{display:block}')[0]?.message));
  assert.equal(w('.x::placeholder{position:absolute}').length, 1);
  assert.equal(w('.x::placeholder{color:#555;font-size:14px}').length, 0);
});

test('F48: :link / :any-link match a link with href; on anything else they never apply', () => {
  const link = '<a class="x a" href="/y" style="display:block"></a>';
  assert.equal(run('.x:any-link{color:red}', link).status, 'verified');
  assert.equal(run('a:link{color:red}', link).status, 'verified');
  const w = (css, html) => codes(run(css, html), 'W_CSS_STATE_UNREACHABLE').filter(x => /link/.test(x.state ?? ''));
  const [hit] = w('.x:any-link{color:red}', '<a class="x a" style="display:block"></a>');
  assert.ok(hit && /href/.test(hit.message));
  assert.equal(w('.x:link{color:red}', '<button class="x a" type="button"></button>').length, 1);
  assert.equal(w('.x:link{color:red}', link).length, 0);
  // :link stops matching once the link is visited: a layout change there depends on the history.
  assert.equal(run('.x:link{padding:4px}', link).status, 'unknown');
});

test('F49: :placeholder-shown needs a placeholder attribute (and an empty value); without one it never applies', () => {
  const base = '.x{display:block;inline-size:200px;block-size:30px;box-sizing:border-box;appearance:none;padding:0;border:0;min-inline-size:0;min-block-size:0}';
  const field = attrs => `<input class="x" aria-label="q" ${attrs}>`;
  assert.equal(run(base + '.x:placeholder-shown{border-color:red}', field('placeholder="Search"')).status, 'verified');
  const w = (css, html) => codes(run(base + css, html), 'W_CSS_STATE_UNREACHABLE').filter(x => x.state === ':placeholder-shown');
  const [hit] = w('.x:placeholder-shown{color:red}', field(''));
  assert.ok(hit && /placeholder attribute/.test(hit.message));
  assert.equal(w('.x:placeholder-shown{color:red}', field('placeholder=""')).length, 0);
  assert.equal(w('.x:placeholder-shown{color:red}', field('placeholder="x" value="v"')).length, 0);
  assert.equal(w('.x:placeholder-shown{color:red}', '<textarea class="x" aria-label="q"></textarea>').length, 1);
  // Typing hides the placeholder: a layout change in :placeholder-shown depends on what the user types.
  assert.equal(run(base + '.x:placeholder-shown{padding:4px}', field('placeholder="Search"')).status, 'unknown');
});

test('F50: :required / :optional match form fields; on anything else they never apply', () => {
  const base = '.x{display:block;inline-size:200px;block-size:30px;box-sizing:border-box;appearance:none;padding:0;border:0;min-inline-size:0;min-block-size:0}';
  assert.equal(run(base + '.x:required{border-color:red}', '<input class="x" aria-label="q" required>').status, 'verified');
  assert.equal(run(base + '.x:optional{border-color:red}', '<input class="x" aria-label="q">').status, 'verified');
  const w = (css, html) => codes(run(base + css, html), 'W_CSS_STATE_UNREACHABLE').filter(x => /^:(?:required|optional)$/.test(x.state ?? ''));
  const [hit] = w('.x:required::after{content:"*"}', '<label class="x">Name</label>');
  assert.ok(hit && /form field/.test(hit.message));
  assert.equal(w('.x:required{color:red}', '<input class="x" type="range" aria-label="q" required>').length, 1);
  assert.equal(w('.x:required{color:red}', '<input class="x" aria-label="q" required>').length, 0);
  assert.equal(w('.x:required{color:red}', '<input class="x" aria-label="q">').length, 0);
  // Firefox does not match :optional on a range input or a button (Chromium and WebKit do): Unknown there.
  assert.equal(run(base + '.x:optional{border-color:red}', '<input class="x" type="range" aria-label="q">').status, 'unknown');
});

test('F50: label:required (a tag selector) is reported too', () => {
  const r = run('label:required::after{content:"*"}', '<label class="a">Name</label>');
  assert.equal(codes(r, 'W_CSS_STATE_UNREACHABLE').filter(x => x.state === ':required').length, 1);
});

test('F51: html and body both with overflow make body a scroll container, so a sticky header stops sticking', () => {
  const page = css => analyzeHTML('<html lang="en"><body><header class="h"></header><main class="m"></main></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.h{position:sticky;top:0;height:40px}.m{height:2000px}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}, accessibility: true});
  const w = css => (page(css).layoutWarnings ?? []).filter(x => x.code === 'W_LAYOUT_STICKY_SCROLLER');
  const [hit] = w('html,body{overflow-x:hidden}');
  assert.ok(hit && /body/.test(hit.scroller), JSON.stringify(hit));
  assert.ok(/html/.test(hit.message));
  assert.equal(w('html{overflow:auto}body{overflow:hidden}').length, 1);
  assert.equal(w('body{overflow-x:hidden}').length, 0);
  assert.equal(w('html{overflow-x:hidden}').length, 0);
  assert.equal(w('html,body{overflow-x:clip}').length, 0);
});

test('F52: an invalid grid-template-areas (rows of different lengths, an area that is not a rectangle) is dropped', () => {
  const items = '<div class="x"><div class="a"></div><div class="b"></div></div>';
  const base = '.x{display:grid;grid-template-columns:100px 100px}.a,.b{height:20px}';
  const w = css => codes(run(base + css, items), 'W_CSS_GRID_AREAS_INVALID');
  const [hit] = w('.x{grid-template-areas:"a b" "b b"}');
  assert.ok(hit && /rectangle/.test(hit.message));
  assert.equal(w('.x{grid-template-areas:"a b" "a"}').length, 1);
  assert.equal(w('.x{grid-template-areas:"a a" "b b"}').length, 0);
  assert.equal(w('.x{grid-template-areas:"a ." ". b"}').length, 0);
  // Dropped as the browser drops it: laid out as without it (no Unknown for the invalid value).
  const r = run(base + '.x{grid-template-areas:"a b" "b b"}', items);
  assert.ok(!JSON.stringify(r.diagnostics).includes('is not a rectangle'));
  assert.equal(r.status, run(base, items).status);
});

test('F53: margin-top / margin-bottom: auto in block flow are 0 (no vertical centring)', () => {
  const html = '<div class="p"><div class="c"></div></div>';
  const r = run('.p{display:block;height:200px}.c{margin:auto 0;height:20px}', html);
  assert.equal(r.status, 'verified');
  const [hit] = codes(r, 'W_LAYOUT_DECLARATION_INERT').filter(w => w.properties.some(p => /^margin-(?:top|bottom)$/.test(p)));
  assert.ok(hit && /block/.test(hit.message) && /flex|grid/.test(hit.message));
  assert.equal(codes(run('.p{display:flex;flex-direction:column;height:200px}.c{margin-top:auto;height:20px}', html), 'W_LAYOUT_DECLARATION_INERT').length, 0);
  assert.equal(codes(run('.p{display:block;height:200px}.c{margin:0 auto;width:20px;height:20px}', html), 'W_LAYOUT_DECLARATION_INERT').filter(w => w.properties.some(p => /^margin/.test(p))).length, 0);
});

test('F54: clear on a flex or grid item does nothing', () => {
  const html = '<div class="p"><div class="x"></div></div>';
  const r = run('.p{display:flex}.x{clear:both;height:20px;width:20px}', html);
  assert.equal(r.status, 'verified');
  const [hit] = codes(r, 'W_LAYOUT_DECLARATION_INERT').filter(w => w.properties.includes('clear'));
  assert.ok(hit && /flex/.test(hit.message));
  assert.equal(codes(run('.p{display:grid}.x{clear:left;height:20px}', html), 'W_LAYOUT_DECLARATION_INERT').filter(w => w.properties.includes('clear')).length, 1);
  assert.equal(run('.p{display:block}.x{clear:both;height:20px}', html).status, 'unknown');
  assert.equal(run('.p{display:flex}.x{clear:none;height:20px;width:20px}', html).status, 'verified');
});

test('F55: a percentage top / bottom on a relative box in an auto-height block does nothing', () => {
  // .g is display: block, so .p is in block flow and its auto height is indefinite (a grid item's would be definite).
  const html = '<div class="g"><div class="p"><div class="s"></div><div class="c"></div></div></div>';
  const r = run('.g,.p{display:block}.s{height:30px}.c{position:relative;top:50%;height:20px}', html);
  assert.equal(r.status, 'verified');
  const [hit] = codes(r, 'W_LAYOUT_DECLARATION_INERT').filter(w => w.properties.includes('top'));
  assert.ok(hit && /height/.test(hit.message));
  assert.equal(Number(r.sizes.find(s => s.box === '.c').rect.blockStart.constant), 30);
  assert.equal(run('.g,.p{display:block}.p{height:200px}.s{height:30px}.c{position:relative;top:50%;height:20px}', html).status, 'unknown');
  assert.equal(codes(run('.g,.p{display:block}.s{height:30px}.c{position:relative;top:5px;height:20px}', html), 'W_LAYOUT_DECLARATION_INERT').length, 0);
  // .p a stretched grid item (its parent is a grid): its height is definite, so the percentage resolves — not judged.
  assert.equal(codes(run('.p{display:block}.s{height:30px}.c{position:relative;top:50%;height:20px}', '<div class="p"><div class="s"></div><div class="c"></div></div>'), 'W_LAYOUT_DECLARATION_INERT').length, 0);
});

test('F56: a percentage height in an auto-height block (itself in block flow) is auto', () => {
  const html = '<div class="g"><div class="p"><div class="s"></div><div class="c"><div class="i"></div></div></div></div>';
  const base = '.g,.p{display:block}.s{height:30px}.i{height:20px}';
  const r = run(base + '.c{height:100%}', html);
  assert.equal(r.status, 'verified');
  const [hit] = codes(r, 'W_LAYOUT_DECLARATION_INERT').filter(w => w.properties.includes('block-size'));
  assert.ok(hit && /height/.test(hit.message));
  assert.equal(Number(r.sizes.find(s => s.box === '.c').rect.blockSize.constant), 20);
  assert.equal(codes(run(base + '.c{min-height:50%}', html), 'W_LAYOUT_DECLARATION_INERT').filter(w => w.properties.includes('min-block-size')).length, 1);
  assert.equal(codes(run(base + '.p{height:200px}.c{height:50%}', html), 'W_LAYOUT_DECLARATION_INERT').length, 0);
});

test('F57: overflow, text-overflow and resize on an inline element do nothing', () => {
  const w = (css, html = '<p class="a">before <span class="x">s</span> after</p>') => codes(run(css, html), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.some(p => /^(?:overflow-[xy]|text-overflow|resize)$/.test(p)));
  const [hit] = w('.x{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}');
  assert.ok(hit && /inline/.test(hit.message) && hit.properties.includes('text-overflow'));
  assert.equal(w('.x{overflow:auto}').length, 1);
  assert.equal(w('.x{display:inline-block;overflow:hidden}').length, 0);
  assert.equal(w('.x{overflow:hidden}', '<p class="a">t <img class="x" alt="" src="a.png" width="10" height="10"></p>').length, 0);
});

test('F57: not on a blockified inline element (absolutely positioned, or a flex item)', () => {
  const w = (css, html) => codes(run(css, html), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.some(p => /^(?:overflow-[xy]|text-overflow)$/.test(p)));
  assert.equal(w('.x{position:absolute;width:1px;height:1px;overflow:hidden}', '<p class="a">t <span class="x">s</span></p>').length, 0);
  assert.equal(w('.f{display:flex}.x{overflow:hidden;width:20px;height:20px}', '<div class="f"><span class="x"></span></div>').length, 0);
});

test('F58: text-decoration: none cannot remove a line an ancestor draws', () => {
  const w = (css, html) => codes(run(css, html), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.includes('text-decoration-line'));
  const [hit] = w('.l{text-decoration:underline}.c{text-decoration:none}', '<p class="a l">link <span class="c">child</span></p>');
  assert.ok(hit && /ancestor|\.l/.test(hit.message));
  assert.equal(w('.c{text-decoration:none}', '<p class="a">t <a class="c" href="/y">link</a></p>').length, 0);
  assert.equal(w('.c{text-decoration:none}', '<p class="a">t <span class="c">s</span></p>').length, 0);
  assert.equal(w('.l{text-decoration:underline}.c{text-decoration:underline}.l .c{text-decoration:none}', '<p class="a l">t <span class="c">s</span></p>').length, 0);
});

test('F59: border-radius does not round the border of a border-collapse: collapse table', () => {
  const t = '<table class="t"><tbody><tr><td class="c"></td></tr></tbody></table>';
  const w = css => codes(run('td{padding:0;height:20px}' + css, t), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.includes('border-radius'));
  const [hit] = w('.t{border-collapse:collapse;border:2px solid red;border-radius:8px}');
  assert.ok(hit && /collapse/.test(hit.message));
  assert.equal(w('.t{border-collapse:separate;border:2px solid red;border-radius:8px}').length, 0);
  assert.equal(w('.t{border-collapse:collapse;border-radius:8px}').length, 0);
  assert.equal(w('.t{border-collapse:collapse;border:2px solid red;border-radius:0}').length, 0);
});

test('F9: a content the analysis cannot read (attr()) is still content: no W_CSS_PSEUDO_NO_CONTENT', () => {
  const r = run('.a{position:relative}.x::after{content:attr(data-tip);position:absolute;top:0;left:0;width:10px;height:10px}', '<div class="x a" data-tip="Hi"></div>');
  assert.equal(codes(r, 'W_CSS_PSEUDO_NO_CONTENT').length, 0);
  assert.equal(codes(run('.x::after{position:absolute;top:0}', '<div class="x a"></div>'), 'W_CSS_PSEUDO_NO_CONTENT').length, 1);
});

test('F60: gap on a table, and padding on a collapsed table, do nothing', () => {
  const t = '<table class="t"><tbody><tr><td class="c"></td><td class="c"></td></tr></tbody></table>';
  const base = '.t{table-layout:fixed;inline-size:200px;border-spacing:0}.c{inline-size:100px;block-size:20px;padding:0}';
  const w = css => codes(run(base + css, t), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.some(p => /^(?:row-gap|column-gap|padding-)/.test(p)));
  assert.ok(/border-spacing/.test(w('.t{gap:10px}')[0]?.message));
  const r = run(base + '.t{border-collapse:collapse;padding:10px}', t);
  assert.equal(r.status, 'verified');
  assert.ok(codes(r, 'W_LAYOUT_DECLARATION_INERT').some(x => x.properties.includes('padding-top') && /collapse/.test(x.message)));
  assert.equal(w('.t{padding:10px}').length, 0);
});

test('F61: :read-write / :read-only follow readonly, disabled and the field type', () => {
  const base = '.x{display:block;inline-size:200px;block-size:30px;box-sizing:border-box;appearance:none;padding:0;border:0;min-inline-size:0;min-block-size:0}';
  assert.equal(run(base + '.x:read-write{border-color:red}', '<input class="x" aria-label="q">').status, 'verified');
  assert.equal(run(base + '.x:read-only{border-color:red}', '<input class="x" aria-label="q" readonly>').status, 'verified');
  const w = (css, html) => codes(run(base + css, html), 'W_CSS_STATE_UNREACHABLE').filter(x => x.state === ':read-write');
  const [hit] = w('.x:read-write{color:red}', '<div class="x"></div>');
  assert.ok(hit && /editable/.test(hit.message));
  assert.equal(w('.x:read-write{color:red}', '<input class="x" type="checkbox" aria-label="q">').length, 1);
  assert.equal(w('.x:read-write{color:red}', '<input class="x" aria-label="q" readonly>').length, 0);
  assert.equal(w('.x:read-write{color:red}', '<input class="x" aria-label="q">').length, 0);
  assert.equal(run(base + '.x:read-write{color:red}', '<div class="x" contenteditable="true"></div>').status, 'unknown');
});

test('F61: a tag selector for another element is not reported', () => {
  const r = run('span:read-write{color:red}', '<div class="a"></div>');
  assert.equal(codes(r, 'W_CSS_STATE_UNREACHABLE').filter(x => x.state === ':read-write').length, 0);
  assert.equal(codes(run('div:read-write{color:red}', '<div class="a"></div>'), 'W_CSS_STATE_UNREACHABLE').filter(x => x.state === ':read-write').length, 1);
});

test('F62: :lang() matches by the inherited lang; a country code instead of a language code is reported', () => {
  const page = (css, html, lang = 'ja-JP') => analyzeHTML(`<html lang="${lang}"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
  assert.equal(page('.a:lang(ja){color:red}', '<div class="a"></div>').status, 'verified');
  const [hit] = (page('.a:lang(jp){color:red}', '<div class="a"></div>').layoutWarnings ?? []).filter(w => w.code === 'W_CSS_LANG_CODE');
  assert.ok(hit && /ja/.test(hit.message));
  assert.equal((page('.a:lang(ja){color:red}', '<div class="a"></div>').layoutWarnings ?? []).filter(w => w.code === 'W_CSS_LANG_CODE').length, 0);
  // Extended matching (zh-TW against zh-Hant-TW) differs between browsers: Unknown.
  assert.equal(page('.a:lang(zh-TW){color:red}', '<div class="a"></div>', 'zh-Hant-TW').status, 'unknown');
});

test('F63: :dir() follows the dir attribute, not the CSS direction', () => {
  assert.equal(run('.x:dir(rtl){color:red}', '<div class="x a" dir="rtl"></div>').status, 'verified');
  const w = (css, html) => codes(run(css, html), 'W_CSS_STATE_UNREACHABLE').filter(x => x.state === ':dir');
  const [hit] = w('.x{direction:rtl}.x:dir(rtl){color:red}', '<div class="x a"></div>');
  assert.ok(hit && /dir="rtl"/.test(hit.message));
  assert.equal(w('.x:dir(rtl){color:red}', '<div class="x a" dir="rtl"></div>').length, 0);
  assert.equal(w('.x:dir(rtl){color:red}', '<div class="x a"></div>').length, 0);
});

test('F64: attributes that are only DOM properties (indeterminate, value on textarea and select, defaultValue) do nothing in HTML', () => {
  const base = '.x{display:block;inline-size:200px;block-size:30px;box-sizing:border-box;appearance:none;padding:0;border:0;min-inline-size:0;min-block-size:0}';
  const w = html => codes(run(base, html), 'W_HTML_ATTRIBUTE_NOT_HTML');
  const r = run(base, '<input class="x" type="checkbox" aria-label="q" indeterminate>');
  assert.ok(!JSON.stringify(r.diagnostics).includes('needs an adapter: indeterminate'));
  const [hit] = w('<input class="x" type="checkbox" aria-label="q" indeterminate>');
  assert.ok(hit && /property/.test(hit.message));
  assert.equal(w('<textarea class="x" aria-label="q" value="hi"></textarea>').length, 1);
  assert.equal(w('<select class="x" aria-label="q" value="b"><option>a</option></select>').length, 1);
  assert.equal(w('<input class="x" aria-label="q" defaultValue="x">').length, 1);
  assert.equal(w('<input class="x" aria-label="q" value="x">').length, 0);
});

test('F65: disabled, checked and selected on elements that do not take them do nothing', () => {
  const w = html => codes(run('', html), 'W_HTML_ATTRIBUTE_NOT_HTML');
  const [hit] = w('<div class="a" disabled></div>');
  assert.ok(hit && /focusable|clickable/.test(hit.message));
  assert.equal(w('<input class="a" aria-label="q" checked>').length, 1);
  assert.equal(w('<div class="a" selected></div>').length, 1);
  assert.equal(w('<button class="a" type="button" disabled>b</button>').length, 0);
  assert.equal(w('<input class="a" type="checkbox" aria-label="q" checked>').length, 0);
});

test('F66: readonly on a checkbox, radio or select does nothing (they still change)', () => {
  const w = html => codes(run('', html), 'W_HTML_ATTRIBUTE_NOT_HTML');
  const [hit] = w('<input class="a" type="checkbox" aria-label="q" readonly>');
  assert.ok(hit && /disabled/.test(hit.message));
  assert.equal(w('<select class="a" aria-label="q" readonly><option>a</option></select>').length, 1);
  assert.equal(w('<input class="a" aria-label="q" readonly>').length, 0);
  assert.equal(w('<textarea class="a" aria-label="q" readonly></textarea>').length, 0);
});

test('F67: placeholder on a select, checkbox, date or range, and maxlength on a number input, do nothing', () => {
  const w = html => codes(run('', html), 'W_HTML_ATTRIBUTE_NOT_HTML');
  assert.ok(/placeholder/.test(w('<select class="a" aria-label="q" placeholder="Pick"><option>a</option></select>')[0]?.message));
  assert.equal(w('<input class="a" type="date" aria-label="q" placeholder="d">').length, 1);
  assert.ok(/max/.test(w('<input class="a" type="number" aria-label="q" maxlength="2">')[0]?.message));
  assert.equal(w('<input class="a" aria-label="q" placeholder="x" maxlength="2">').length, 0);
  assert.equal(w('<input class="a" type="number" aria-label="q" placeholder="0">').length, 0);
  assert.ok(!JSON.stringify(run('', '<input class="a" aria-label="q" maxlength="2">').diagnostics).includes('maxlength'));
});

test('F68: input type=hidden is never rendered (display: none the author cannot override)', () => {
  const html = '<div class="a"></div><input class="x" type="hidden" name="t" value="1">';
  assert.equal(run('', html).status, 'verified');
  const r = run('.x{display:block;inline-size:50px;block-size:20px}', html);
  assert.equal(r.status, 'verified');
  const [hit] = codes(r, 'W_LAYOUT_DECLARATION_INERT').filter(w => w.properties.includes('display'));
  assert.ok(hit && /hidden/.test(hit.message));
});

test('F69: a datalist is display: none (its options show only in a field popup)', () => {
  const html = '<div class="a"></div><input class="f" list="d" aria-label="q"><datalist id="d"><option value="a"></option></datalist>';
  const base = '.f{display:block;inline-size:200px;block-size:30px;box-sizing:border-box;appearance:none;padding:0;border:0;min-inline-size:0;min-block-size:0}';
  assert.equal(run(base, html).status, 'verified');
  assert.equal(run(base + 'datalist{display:block}', html).status, 'unknown');
});

test('F70: :nth-child(An+B of S) counts only the siblings that match S', () => {
  const html = '<div class="w"><div class="i v"></div><div class="i"></div><div class="i v"></div><div class="i v"></div></div>';
  const r = run('.i{height:10px}.i:nth-child(2 of .v){height:30px}', html);
  assert.equal(r.status, 'verified');
  const heights = r.sizes.filter(s => s.box.startsWith('.i')).map(s => Number(s.rect.blockSize.constant));
  assert.deepEqual(heights, [10, 10, 30, 10]);
  const last = run('.i{height:10px}.i:nth-last-child(1 of .v){height:30px}', html);
  assert.deepEqual(last.sizes.filter(s => s.box.startsWith('.i')).map(s => Number(s.rect.blockSize.constant)), [10, 10, 10, 30]);
});

test('visibility: collapse on a table row removes it (and differs on flex items): Unknown, not laid out as hidden', () => {
  const t = '<table class="t"><tbody><tr><td class="c"></td></tr><tr class="x"><td class="c"></td></tr><tr><td class="c"></td></tr></tbody></table>';
  const base = '*{margin:0;padding:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.t{table-layout:fixed;inline-size:200px;border-spacing:0}.c{inline-size:200px;block-size:20px}';
  const page = (css, html) => analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: base + css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
  assert.equal(page('.x{visibility:collapse}', t).status, 'unknown');
  assert.equal(page('.x{visibility:hidden}', t).status, 'verified');
  assert.equal(page('.f{display:flex;flex-direction:column}.f>div{height:20px}.x{visibility:collapse}', '<div class="f"><div></div><div class="x"></div></div>').status, 'unknown');
  assert.equal(page('.x{visibility:collapse;height:20px}', '<div class="x"></div>').status, 'verified');
});

test('F71: a canvas sized by CSS is laid out; a CSS shape other than its bitmap stretches the drawing', () => {
  const w = (attrs, css) => { const r = run(`.x{display:block;${css}}`, `<canvas class="x" ${attrs}></canvas>`); return [r.status, codes(r, 'W_LAYOUT_IMAGE_DISTORTED').length]; };
  assert.deepEqual(w('', 'width:300px;height:150px'), ['verified', 0]);
  assert.deepEqual(w('', 'width:300px;height:300px'), ['verified', 1]);
  assert.deepEqual(w('width="400" height="200"', 'width:300px;height:300px'), ['verified', 1]);
  assert.deepEqual(w('width="200" height="200"', 'width:300px;height:300px'), ['verified', 0]);
  assert.deepEqual(w('width="400" height="200"', 'width:300px;height:300px;object-fit:contain'), ['verified', 0]);
  assert.equal(run('.x{display:block}', '<canvas class="x"></canvas>').status, 'unknown');
});

test('F72: z-index below 0 with no stacking context above puts the box behind its ancestors', () => {
  const html = '<div class="w"><div class="p"><div class="c"></div></div></div>';
  const w = css => codes(run('.c{position:relative;z-index:-1;height:20px}' + css, html), 'W_LAYOUT_NEGATIVE_Z_BEHIND');
  const [hit] = w('.p{background:#fff}');
  assert.ok(hit && /stacking context/.test(hit.message));
  assert.equal(w('.p{background:#fff;isolation:isolate}').length, 0);
  assert.equal(w('.p{background:#fff;position:relative;z-index:0}').length, 0);
  // A stacking context on the grandparent still leaves .p between: behind .p (measured).
  assert.equal(w('.w{opacity:.9}').length, 1);
  assert.equal(w('.p{opacity:.9}').length, 0);
  assert.equal(w('.p{filter:blur(1px)}').length, 0);
  assert.equal(codes(run('.c{position:relative;z-index:1;height:20px}', html), 'W_LAYOUT_NEGATIVE_Z_BEHIND').length, 0);
});

test('F73: a first child\'s margin-top that collapses through a parent with a background shows outside it', () => {
  const html = '<div class="w"><div class="card"><div class="t"></div></div></div>';
  const base = '.w{display:block}.t{height:20px;margin-top:20px}';
  const w = css => codes(run(base + css, html), 'W_LAYOUT_MARGIN_COLLAPSE_THROUGH');
  const [hit] = w('.card{background:#eee}');
  assert.ok(hit && /padding-top/.test(hit.message));
  assert.equal(w('.card{background:#eee;padding-top:1px}').length, 0);
  assert.equal(w('.card{background:#eee;display:flow-root}').length, 0);
  assert.equal(w('').length, 0);
});

test('F74: a relative box with both left and right (or top and bottom) ignores one of them', () => {
  const w = (css, html = '<div class="x a"></div>') => codes(run(`.x{position:relative;${css}}`, html), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.some(p => ['left', 'right', 'top', 'bottom'].includes(p)));
  const [hit] = w('left:10px;right:30px');
  assert.deepEqual(hit?.properties, ['right']);
  assert.deepEqual(w('top:10px;bottom:30px')[0]?.properties, ['bottom']);
  assert.deepEqual(w('left:10px;right:30px', '<div class="x a" dir="rtl"></div>')[0]?.properties, ['left']);
  assert.equal(w('right:30px').length, 0);
  assert.equal(codes(run('.x{position:sticky;top:0;bottom:0}'), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.includes('bottom')).length, 0);
});

test('F75: line-height on a select drawn by the browser does nothing', () => {
  const w = css => codes(run(`.x{${css}}`, '<select class="x" aria-label="q"><option>a</option></select>'), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.includes('line-height'));
  const [hit] = w('line-height:50px');
  assert.ok(hit && /appearance: none/.test(hit.message));
  assert.equal(w('appearance:none;line-height:50px').length, 0);
  assert.equal(codes(run('.x{line-height:50px}', '<input class="x" aria-label="q">'), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.includes('line-height')).length, 0);
});

test('F76: flex / grid container properties on an inline element do nothing', () => {
  const w = (css, html = '<p class="a">t <span class="x">s <b>b</b></span> u</p>') => codes(run(css, html), 'W_LAYOUT_DECLARATION_INERT').filter(x => /display: inline/.test(x.message) && x.properties.some(p => /gap|grid-|flex-|justify|align/.test(p)));
  const [hit] = w('.x{gap:10px;justify-content:center}');
  assert.ok(hit && /display: flex/.test(hit.message));
  assert.ok(hit.properties.includes('justify-content'));
  assert.equal(w('.x{display:inline-flex;gap:10px}').length, 0);
  assert.equal(w('.x{grid-template-columns:1fr 1fr}').length, 1);
});

test('F77: float on an absolutely positioned box computes to none (not a float error)', () => {
  const html = '<div class="w"><div class="x"></div></div>';
  const r = run('.w{position:relative;height:100px}.x{position:absolute;top:0;left:0;float:left;width:20px;height:20px}', html);
  assert.notEqual(r.status, 'violated');
  assert.ok(!JSON.stringify(r.diagnostics).includes('float is forbidden'));
  const [hit] = codes(r, 'W_LAYOUT_DECLARATION_INERT').filter(w => w.properties.includes('float'));
  assert.ok(hit && /absolutely positioned/.test(hit.message));
});

test('F78: var() in a media query is invalid: the rule never applies', () => {
  const r = run(':root{--bp:600px}.a{height:20px}@media (min-width: var(--bp)){.a{height:40px}}');
  assert.equal(r.status, 'verified');
  const [hit] = codes(r, 'W_CSS_MEDIA_VAR');
  assert.ok(hit && /never/.test(hit.message));
  assert.equal(Number(r.sizes.find(s => s.box === '.a').rect.blockSize.constant), 20);
  // A query list keeps its other queries: not judged.
  assert.equal(codes(run('.a{height:20px}@media print, (min-width: var(--bp)){.a{height:40px}}'), 'W_CSS_MEDIA_VAR').length, 0);
});

test('F79: a media query with a unitless length (600) or a space before the unit never matches', () => {
  for (const q of ['(min-width: 600)', '(width >= 600)', '(min-width: 600 px)', '(min-width: 300px) and (max-width: 2000)']) {
    const r = run(`.a{height:20px}@media ${q}{.a{height:40px}}`);
    assert.equal(r.status, 'verified', q);
    assert.ok(codes(r, 'W_CSS_MEDIA_INVALID_LENGTH').length === 1, q);
    assert.equal(Number(r.sizes.find(s => s.box === '.a').rect.blockSize.constant), 20, q);
  }
  assert.equal(codes(run('.a{height:20px}@media (min-width: 600px){.a{height:40px}}'), 'W_CSS_MEDIA_INVALID_LENGTH').length, 0);
});

test('F80: overflow-wrap does nothing on text that white-space: nowrap or pre keeps on one line', () => {
  const runT = (css, html, sel) => analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}, boxes: {[sel]: {overflow: 'clip', overflowBlock: 'clip'}}});
  const html = '<div class="t">averyveryveryverylongwordthatdoesnotfit</div>';
  const inert = (css, h = html, sel = '.t') => {
    const r = runT(`.t,.c{width:100px;height:20px;overflow:hidden}${css}`, h, sel);
    assert.equal(r.status, 'verified', css);
    return codes(r, 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes('overflow-wrap'));
  };
  assert.ok(inert('.t{white-space:nowrap;overflow-wrap:anywhere}'));
  assert.ok(inert('.t{white-space:pre;overflow-wrap:break-word}'));
  assert.ok(!inert('.t{overflow-wrap:anywhere}'));
  assert.ok(!inert('.t{white-space:pre-wrap;overflow-wrap:anywhere}'));
  // a child that wraps again inherits the overflow-wrap, so it is not inert on the parent
  assert.ok(!inert('.p{white-space:nowrap;overflow-wrap:anywhere}.c{white-space:normal}', '<div class="p"><div class="c">averyveryveryverylongword</div></div>', '.c'));
});

test('F81: column-span outside a multi-column container does nothing (and no longer makes the analysis Unknown)', () => {
  const r = run('.a{column-span:all}');
  assert.equal(r.status, 'verified');
  assert.ok(codes(r, 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes('column-span')));
  const none = run('.a{column-span:none}');
  assert.equal(none.status, 'verified');
  assert.ok(!codes(none, 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes('column-span')));
  for (const v of ['initial', 'unset']) assert.ok(!codes(run(`.a{column-span:${v}}`), 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes('column-span')), v);
  assert.equal(run('.a{column-span:inherit}').status, 'unknown');
  // inside a multi-column container the analysis stays Unknown (multi-column layout is not modeled)
  assert.equal(run('.p{columns:2}.a{column-span:all}', '<div class="p"><div class="a"></div></div>').status, 'unknown');
});

test('F82: empty-cells: hide does nothing with border-collapse: collapse', () => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const hit = css => {
    const r = analyzeHTML('<html lang="en"><body><main class="p"><table class="t"><tbody><tr><td class="c"><div class="x"></div></td><td class="c"></td></tr></tbody></table></main></body></html>',
      {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{display:block}.c{padding:8px}.x{display:block;height:24px;width:24px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
    assert.equal(r.status, 'verified', css);
    return codes(r, 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes('empty-cells'));
  };
  assert.equal(hit('.t{border-collapse:collapse;empty-cells:hide}'), true);
  assert.equal(hit('.t{empty-cells:hide}'), false);
  assert.equal(hit('.t{border-collapse:collapse;empty-cells:show}'), false);
});

test('F83: transform-origin with no transform in any state does nothing', () => {
  const inert = (css, html) => codes(run(css, html), 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes('transform-origin'));
  assert.equal(run('.a{transform-origin:0 0}').status, 'verified');
  assert.ok(inert('.a{transform-origin:0 0}'));
  // a selector that cannot be read without its states (:not(:hover)) counts as one that may transform the box
  assert.ok(!inert('.a{transform-origin:0 0}.a:not(:hover){transform:scale(1.1)}'));
  assert.ok(!inert('.a{transform-origin:0 0;transform:rotate(0deg)}'));
  assert.ok(!inert('.a{transform-origin:0 0;scale:1}'));
  // a state or an animation that transforms the box uses the origin
  assert.ok(!inert('.a{transform-origin:0 0}.a:hover{transform:scale(1.1)}'));
  assert.ok(!inert('.a{transform-origin:0 0}.p:hover .a{rotate:5deg}', '<div class="p"><div class="a"></div></div>'));
  assert.ok(!inert('.a{transform-origin:0 0;animation:spin 1s}@keyframes spin{to{transform:rotate(1turn)}}'));
});

test('F88: list-style-position on an element that is not a list item and has nothing inside does nothing', () => {
  const inert = (css, html) => codes(run(css, html), 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes('list-style-position'));
  assert.ok(inert('.a{list-style-position:inside}'));
  assert.ok(!inert('.a{list-style-position:outside}'));
  assert.ok(!inert('.a{display:list-item;list-style-position:inside}'));
  // the items inside inherit it
  assert.ok(!inert('.a{list-style-position:inside;height:auto}li{height:20px}', '<ul class="a"><li></li></ul>'));
});

test('F86: a misspelled !important drops the whole declaration', () => {
  for (const typo of ['!imporant', '!importent', '! improtant']) {
    const r = run(`.a{height:40px ${typo}}`);
    assert.equal(r.status, 'verified', typo);
    assert.equal(Number(r.sizes.find(s => s.box === '.a').rect.blockSize.constant), 20, typo);
    assert.equal(codes(r, 'W_CSS_IMPORTANT_TYPO').length, 1, typo);
  }
  for (const ok of ['!important', '!IMPORTANT', '! important']) {
    const r = run(`.a{height:40px ${ok}}`);
    assert.equal(Number(r.sizes.find(s => s.box === '.a').rect.blockSize.constant), 40, ok);
    assert.equal(codes(r, 'W_CSS_IMPORTANT_TYPO').length, 0, ok);
  }
});

test('F87: "and(" in a media query is a function token: the query is invalid and never matches', () => {
  const r = run('@media screen and(min-width:0px){.a{height:40px}}');
  assert.equal(r.status, 'verified');
  assert.equal(Number(r.sizes.find(s => s.box === '.a').rect.blockSize.constant), 20);
  assert.equal(codes(r, 'W_CSS_MEDIA_AND_SPACE').length, 1);
  assert.equal(codes(run('@media screen and (min-width:0px){.a{height:40px}}'), 'W_CSS_MEDIA_AND_SPACE').length, 0);
});

test('F89: calc(100%-10px) is invalid: the declaration is dropped (it was computed as 100% - 10px)', () => {
  const r = run('.a{width:calc(100%-10px)}');
  assert.equal(r.status, 'verified');
  assert.equal(r.sizes.find(s => s.box === '.a').rect.inlineSize.constant, '0');
  const [hit] = codes(r, 'W_CSS_CALC_OPERATOR_SPACE');
  assert.ok(hit && /100% - 10px/.test(hit.message));
  const ok = run('.a{width:calc(100% - 10px)}');
  assert.equal(ok.sizes.find(s => s.box === '.a').rect.inlineSize.constant, '-10');
  assert.equal(codes(ok, 'W_CSS_CALC_OPERATOR_SPACE').length, 0);
});

test('F92: gap on a block container (not flex, grid or multi-column) does nothing', () => {
  const html = '<div class="a"><div class="c"></div><div class="c"></div></div>';
  const r = css => run(`.a{height:auto}.c{height:10px}${css}`, html);
  const inert = css => codes(r(css), 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.some(p => /gap$/.test(p)));
  const block = r('.a{gap:20px}');
  assert.equal(block.status, 'verified');
  assert.equal(Number(block.sizes.find(s => s.box === '.a').rect.blockSize.constant), 20);
  assert.ok(inert('.a{gap:20px}'));
  assert.ok(codes(run('.a{gap:20px}'), 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes('row-gap')), 'a block with nothing inside');
  assert.ok(codes(run('.a{display:inline-block;row-gap:20px}'), 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes('row-gap')), 'inline-block');
  assert.ok(!inert('.a{display:flex;gap:20px}'));
  assert.ok(!inert('.a{display:grid;gap:20px}'));
  assert.ok(!inert('.a{gap:normal}'));
});

test('F93: a unitless length other than 0 is invalid in standards mode: the declaration is dropped', () => {
  for (const decl of ['width:100', 'height:40', 'margin-top:10', 'padding:5', 'margin:0 10']) {
    const r = run(`.a{${decl}}`);
    assert.equal(r.status, 'verified', decl);
    assert.equal(Number(r.sizes.find(s => s.box === '.a').rect.blockSize.constant), 20, decl);
    assert.equal(codes(r, 'W_CSS_UNITLESS_LENGTH').length, 1, decl);
  }
  for (const decl of ['width:0', 'margin:0 auto', 'line-height:1.5', 'opacity:.5', 'flex:1', 'z-index:2', 'width:calc(100px * 2)'])
    assert.equal(codes(run(`.a{${decl}}`), 'W_CSS_UNITLESS_LENGTH').length, 0, decl);
});

test('F94: border-radius on a table row or row group does nothing', () => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const hit = (css, collapse = false) => {
    const r = analyzeHTML('<html lang="en"><body><main class="p"><table class="t"><tbody class="g"><tr class="r"><td class="c"><div class="x"></div></td></tr></tbody></table></main></body></html>',
      {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{display:block}${collapse ? '.t{border-collapse:collapse}' : ''}.c{padding:8px}.x{display:block;height:24px;width:24px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
    assert.equal(r.status, 'verified', css);
    return codes(r, 'W_LAYOUT_DECLARATION_INERT').filter(w => w.properties.includes('border-radius')).map(w => w.box);
  };
  assert.deepEqual(hit('.r{border-radius:8px}'), ['.r']);
  assert.deepEqual(hit('.g{border-radius:8px}'), ['.g']);
  assert.deepEqual(hit('.r{border-radius:8px}', true), ['.r']);
  assert.deepEqual(hit('.r{border-radius:0}'), []);
  assert.deepEqual(hit('.c{border-radius:8px}'), []);
});

test('F84: tab-size does nothing where white-space collapses tabs (and no longer makes the analysis Unknown there)', () => {
  const inert = css => { const r = run(css); return [r.status, codes(r, 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes('tab-size'))]; };
  assert.deepEqual(inert('.a{tab-size:2}'), ['verified', true]);
  assert.deepEqual(inert('.a{white-space:nowrap;tab-size:20px}'), ['verified', true]);
  assert.deepEqual(inert('.a{white-space:pre-line;tab-size:4}'), ['verified', true]);
  assert.deepEqual(inert('.a{tab-size:8}'), ['verified', false]);
  // where tabs are kept it changes the line, which is not modeled
  assert.equal(run('.a{white-space:pre;tab-size:2}').status, 'unknown');
  assert.equal(run('.a{white-space:pre-wrap;tab-size:2}').status, 'unknown');
  // on a box with an element inside it is inherited there: still Unknown
  assert.equal(run('.p{tab-size:2}', '<div class="p"><div class="a"></div></div>').status, 'unknown');
});

test('F96: in a fixed table a width on a cell after the first row does nothing', () => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const row = cls => `<tr><td class="c ${cls}"><div class="x"></div></td><td class="c"><div class="x"></div></td></tr>`;
  const hit = (css, body = `<tbody>${row('a')}${row('b')}</tbody>`) => {
    const r = analyzeHTML(`<html lang="en"><body><main class="p"><table class="t">${body}</table></main></body></html>`,
      {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{display:block}.t{table-layout:fixed;width:300px}.c{padding:8px}.x{display:block;height:24px;width:24px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
    assert.equal(r.status, 'verified', css);
    return codes(r, 'W_LAYOUT_DECLARATION_INERT').filter(w => w.properties.includes('inline-size')).map(w => w.box);
  };
  assert.deepEqual(hit('.b{width:200px}'), ['.c.b']);
  assert.deepEqual(hit('.a{width:200px}'), []);
  // a second tbody: its first row is not the table's first row
  assert.deepEqual(hit('.b{width:200px}', `<tbody>${row('a')}</tbody><tbody>${row('b')}</tbody>`), ['.c.b']);
  // with a thead or tfoot the rendered order can differ from the source: not judged
  assert.deepEqual(hit('.b{width:200px}', `<thead>${row('a')}</thead><tbody>${row('b')}</tbody>`), []);
});


test('F98: aspect-ratio on a table cell or row, or on a non-replaced inline element, does nothing', () => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const table = css => analyzeHTML('<html lang="en"><body><main class="p"><table class="t"><tbody><tr class="r"><td class="c a"><div class="x"></div></td><td class="c"><div class="x"></div></td></tr></tbody></table></main></body></html>',
    {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{display:block}.c{padding:8px}.x{display:block;height:24px;width:24px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  const inert = r => codes(r, 'W_LAYOUT_DECLARATION_INERT').filter(w => w.properties.includes('aspect-ratio')).map(w => w.box);
  const base = table(''), cell = table('.a{aspect-ratio:1}');
  assert.equal(cell.status, 'verified');
  assert.deepEqual(inert(cell), ['.c.a']);
  assert.deepEqual(cell.sizes.map(s => s.rect), base.sizes.map(s => s.rect));
  assert.deepEqual(inert(table('.r{aspect-ratio:2}')), ['.r']);
  assert.deepEqual(inert(run('.s{aspect-ratio:1}', '<div class="a"><span class="s"></span></div>')), ['.s']);
  // a block, and a replaced element even when inline, do take it
  assert.deepEqual(inert(run('.a{aspect-ratio:1;height:auto;width:100px}')), []);
  assert.deepEqual(inert(run('img{aspect-ratio:1;width:50px}', '<div class="a"><img src="x.png" alt="x"></div>')), []);
});

test('F99, F100: an invalid font-family or font shorthand drops the declaration (F99 was applied)', () => {
  const size = css => { const r = run(`.a{font-size:30px;width:1em}${css}`); return [r.status, r.sizes?.find(s => s.box === '.a')?.rect.inlineSize.constant, codes(r, 'W_CSS_FONT_INVALID').length]; };
  assert.deepEqual(size('.a{font:16px Font Awesome 5 Free}'), ['verified', '30', 1]);
  assert.deepEqual(size('.a{font:16px}'), ['verified', '30', 1]);
  assert.deepEqual(size('.a{font:bold Arial}'), ['verified', '30', 1]);
  assert.deepEqual(size('.a{font-family:Foo, 3D Bar, serif}'), ['verified', '30', 1]);
  assert.deepEqual(size('.a{font:16px "Font Awesome 5 Free"}'), ['verified', '16', 0]);
  assert.deepEqual(size('.a{font-family:Segoe UI, Roboto}'), ['verified', '30', 0]);
});

test('F104: list-style-image on an element that is not a list item and has nothing inside does nothing', () => {
  const inert = (css, html) => codes(run(css, html), 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes('list-style-image'));
  assert.ok(inert('.a{list-style-image:linear-gradient(red,red)}'));
  assert.ok(!inert('.a{list-style-image:none}'));
  assert.ok(!inert('.a{display:list-item;list-style-image:linear-gradient(red,red)}'));
  assert.ok(!inert('.a{list-style-image:linear-gradient(red,red);height:auto}li{height:20px}', '<ul class="a"><li></li></ul>'));
});

test('F101: an invalid grid track list drops the declaration (it was Unknown)', () => {
  const html = '<div class="g"><div class="i"></div><div class="i"></div></div>';
  const cols = v => { const r = run(`.g{display:grid;width:300px;height:auto;grid-template-columns:100px 200px}.i{height:20px}.g{grid-template-columns:${v}}`, html); return [r.status, r.sizes?.filter(s => s.box === '.i').map(s => s.rect.inlineSize.constant).join(','), codes(r, 'W_CSS_GRID_TRACKS_INVALID').length]; };
  // the earlier 100px 200px stays, as in the browser
  assert.deepEqual(cols('repeat(auto-fill,1fr)'), ['verified', '100,200', 1]);
  assert.deepEqual(cols('minmax(1fr,1fr)'), ['verified', '100,200', 1]);
  assert.deepEqual(cols('repeat(0,1fr)'), ['verified', '100,200', 1]);
  assert.deepEqual(cols('repeat(auto-fill,100px)'), ['verified', '100,100', 0]);
});

test('F102: a CSS counter that no counter() / counters() reads changes nothing', () => {
  const html = '<ol class="l"><li class="i"></li><li class="i"></li></ol>';
  const unused = css => codes(run(`.l{height:auto}.i{height:20px}${css}`, html), 'W_CSS_COUNTER_UNUSED').map(w => w.counter);
  assert.deepEqual(unused('.i{counter-increment:step}'), ['step']);
  assert.deepEqual(unused('.l{counter-reset:step}.i{counter-increment:step 2}'), ['step']);
  assert.deepEqual(unused('.l{counter-reset:a b 3}.i{counter-increment:a}.i::before{content:counter(a) ". "}'), ['b']);
  assert.deepEqual(unused('.i{counter-increment:step}.i::before{content:counters(step, ".")}'), []);
  assert.deepEqual(unused('.i{counter-increment:step}.i::marker{content:counter(step)}'), []);
  // list-item is the counter list markers read; none resets nothing
  assert.deepEqual(unused('.i{counter-increment:list-item 2}.l{counter-reset:none}'), []);
});

test('F103: margin auto on an inline-level box in a block container does not centre it', () => {
  const hit = (css, html = '<div class="a"><span class="s"></span></div>') => codes(run(`.a{height:auto}${css}`, html), 'W_LAYOUT_DECLARATION_INERT').filter(w => w.properties.some(p => /^margin-(?:left|right)$/.test(p))).map(w => w.box);
  assert.deepEqual(hit('.s{display:inline-block;width:100px;margin:0 auto}'), ['.s']);
  assert.deepEqual(hit('.s{display:inline-flex;width:100px;margin-left:auto}'), ['.s']);
  assert.deepEqual(hit('.s{margin:0 auto}'), ['.s']);
  // a flex or grid parent makes it a block-level item, where auto margins do work
  assert.deepEqual(hit('.a{display:flex}.s{display:inline-block;width:100px;margin:0 auto}'), []);
  assert.deepEqual(hit('.s{display:inline-block;width:100px;margin:0 10px}'), []);
  // inline in a line of text
  assert.deepEqual(hit('.s{display:inline-block;width:10px;margin:0 auto}', '<p class="a" data-text-one-line>ab <span class="s"></span> cd</p>'), ['.s']);
});

test('F105: justify-self / justify-items in block layout: Chromium and WebKit align, Firefox does not', () => {
  const hit = (css, html = '<main class="p"><div class="a"></div></main>') => { const r = run(`.p{display:block}.a{width:100px}${css}`, html); return [r.status, codes(r, 'W_LAYOUT_ALIGN_BROWSER_DEPENDENT').map(w => `${w.box} ${w.property}`)]; };
  assert.deepEqual(hit('.a{justify-self:center}'), ['unknown', ['.a justify-self']]);
  assert.deepEqual(hit('.p{justify-items:end}'), ['unknown', ['.p justify-items']]);
  assert.deepEqual(hit('.a{justify-self:stretch}'), ['verified', []]);
  // in a grid it aligns in every browser: not reported
  assert.deepEqual(hit('.p{display:grid;grid-template-columns:300px}.a{justify-self:center}')[1], []);
});

test('F106: line-breaking properties do nothing where white-space keeps the text on one line', () => {
  const inert = (css, prop, html) => { const r = run(css, html); return [r.status, codes(r, 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes(prop))]; };
  for (const [decl, prop] of [['word-break:break-all', 'word-break'], ['word-break:keep-all', 'word-break'], ['line-break:anywhere', 'line-break'], ['hyphens:auto', 'hyphens'], ['text-wrap-style:pretty', 'text-wrap-style']]) {
    assert.deepEqual(inert(`.a{white-space:nowrap;${decl}}`, prop), ['verified', true], decl);
    assert.deepEqual(inert(`.a{white-space:pre;${decl}}`, prop), ['verified', true], `pre ${decl}`);
  }
  // where lines wrap they change the breaks: word-break and line-break stay Unknown, hyphens is not reported
  assert.equal(run('.a{word-break:break-all}').status, 'unknown');
  assert.equal(run('.a{line-break:anywhere}').status, 'unknown');
  assert.deepEqual(inert('.a{hyphens:auto}', 'hyphens'), ['verified', false]);
  // a text-wrap shorthand after white-space turns wrapping back on: not inert
  assert.equal(inert('.a{white-space:nowrap;text-wrap:balance}', 'text-wrap-style')[1], false);
  // inherited by an element inside, which may wrap again: still Unknown / not reported
  assert.equal(run('.p{white-space:nowrap;word-break:break-all}', '<div class="p"><div class="a"></div></div>').status, 'unknown');
  assert.deepEqual(inert('.p{white-space:nowrap;hyphens:auto}', 'hyphens', '<div class="p"><div class="a"></div></div>')[1], false);
});

test('F107: an invalid color drops the declaration, so the earlier color stays (as in the browser)', () => {
  const page = css => analyzeHTML('<html lang="en"><body><p class="t">some text</p></body></html>', {name: 'P', accessibility: true, boxes: {'.t': {overflow: 'clip', overflowBlock: 'clip'}},
    css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}body{background:#fff}.t{height:20px;overflow:hidden;font:16px sans-serif;color:#999}${css}`, viewport: {min: 320, max: 800, height: {min: 300, max: 600}}});
  for (const bad of ['hsl(0, 0, 0)', 'rgb(0 0 0, .5)', '#00000', 'rgb(0 0 0 1)']) {
    const r = page(`.t{color:${bad}}`);
    assert.equal(codes(r, 'W_CSS_COLOR_INVALID').length, 1, bad);
    // #999 on white stays: below 4.5:1
    assert.ok(r.diagnostics.some(d => d.code === 'E_A11Y_CONTRAST'), `${bad}: ${JSON.stringify(r.diagnostics.map(d => d.code))}`);
  }
  const ok = page('.t{color:hsl(0 0 0)}');
  assert.equal(codes(ok, 'W_CSS_COLOR_INVALID').length, 0);
  assert.ok(!ok.diagnostics.some(d => d.code === 'E_A11Y_CONTRAST'));
  // shorthands and other color properties; url() and strings are not read
  assert.equal(codes(run('.a{border:1px solid #12345}'), 'W_CSS_COLOR_INVALID').length, 1);
  assert.equal(codes(run('.a{box-shadow:0 0 2px rgb(10%, 0, 0)}'), 'W_CSS_COLOR_INVALID').length, 1);
  assert.equal(codes(run('.a{background:url(#12345) no-repeat}'), 'W_CSS_COLOR_INVALID').length, 0);
});

test('F108: on a table column (col / colgroup) only width, background, border (collapsed) and visibility do anything', () => {
  const html = '<table class="t"><colgroup class="g"><col class="c"><col></colgroup><tbody><tr><td>a</td><td>b</td></tr></tbody></table>';
  const inert = css => codes(run(css, html), 'W_LAYOUT_DECLARATION_INERT').filter(w => w.box === '.c' || w.box === '.g').flatMap(w => w.properties);
  assert.deepEqual(inert('.c{padding:20px}'), ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']);
  assert.deepEqual(inert('.c{color:red;font-size:30px;text-align:right}'), ['color', 'font-size', 'text-align']);
  assert.deepEqual(inert('.g{height:100px;vertical-align:bottom}'), ['block-size', 'vertical-align']);
  assert.deepEqual(inert('.c{border:3px solid blue}'), ['border-top', 'border-right', 'border-bottom', 'border-left']);
  // these do act on a column
  assert.deepEqual(inert('.c{width:200px;background:blue}'), []);
  assert.deepEqual(inert('.t{border-collapse:collapse}.c{border:3px solid blue}'), []);
  // min-width differs by browser (WebKit ignores it): not reported
  assert.deepEqual(inert('.c{min-width:200px}'), []);
});

test('F109: a keyword the property does not take drops the declaration; the earlier value stays (it was Unknown)', () => {
  const w = r => codes(r, 'W_CSS_KEYWORD_INVALID');
  const flex = run('.p{display:flex;width:300px;height:auto;flex-direction:row}.p{flex-direction:col}.c{width:50px;height:20px}', '<div class="p"><div class="c"></div><div class="c"></div></div>');
  assert.equal(flex.status, 'verified');
  assert.deepEqual(flex.sizes.filter(s => s.box === '.c').map(s => s.rect.inlineStart?.constant ?? s.rect.inlineStart), ['0', '50']);
  const [hit] = w(flex);
  assert.match(hit.message, /flex-direction: column\?/);
  for (const css of ['.a{position:center}', '.a{display:flexbox}', '.a{box-sizing:border}', '.a{overflow:none}', '.a{white-space:no-wrap}', '.a{visibility:none}']) {
    const r = run(css);
    assert.equal(r.status, 'verified', css);
    assert.equal(w(r).length, 1, css);
  }
  assert.equal(w(run('.a{position:-webkit-sticky;top:0}')).length, 0);
  assert.equal(w(run('.a{vertical-align:center}')).length, 0);
});

test('F110: "and(", "or(" or "not(" in @supports is a function token: the condition is invalid and never applies (it was applied)', () => {
  const h = css => { const r = run(`@supports ${css}{.a{height:40px}}`); return [r.status, r.sizes.find(s => s.box === '.a').rect.blockSize.constant, codes(r, 'W_CSS_SUPPORTS_INVALID').length]; };
  for (const c of ['(display: grid) and(gap:1px)', '(display: grid) or(display: banana)', 'not(display: banana)']) assert.deepEqual(h(c), ['verified', '20', 1], c);
  for (const c of ['(display: grid) and (gap:1px)', '(display: grid)and (gap:1px)', '(display: grid) AND (gap: 1px)']) assert.deepEqual(h(c), ['verified', '40', 0], c);
  for (const c of ['not (display: grid)', 'NOT (display: grid)']) assert.deepEqual(h(c), ['verified', '20', 0], c);
  // not( inside a selector() argument is the :not() pseudo-class, not the keyword
  assert.equal(codes(run('@supports selector(:not(a)){.a{height:40px}}'), 'W_CSS_SUPPORTS_INVALID').length, 0);
});

test('F87 (or, not): "or(" and "not(" in a media query are function tokens too: the query never matches (it was Unknown)', () => {
  for (const q of ['(min-width: 0px) or(max-width: 1px)', 'not(max-width: 1px)']) {
    const r = run(`@media ${q}{.a{height:40px}}`);
    assert.equal(r.status, 'verified', q);
    assert.equal(r.sizes.find(s => s.box === '.a').rect.blockSize.constant, '20', q);
    const [hit] = codes(r, 'W_CSS_MEDIA_AND_SPACE');
    assert.ok(hit && /(or|not) \(/.test(hit.message), q);
  }
});

test('F111: an invalid @property is ignored, so the custom property stays unregistered (an unquoted syntax was registered)', () => {
  const child = rule => { const r = run(`@property --x { ${rule}; }.p{--x:30px;height:auto}.c{height:var(--x, 5px)}`, '<div class="p"><div class="c"></div></div>'); return [r.status, r.sizes?.find(s => s.box === '.c')?.rect.blockSize.constant, codes(r, 'W_CSS_PROPERTY_INVALID').length]; };
  // measured: ignored by Chromium, Firefox and WebKit, so --x inherits as an unregistered property (30px)
  for (const rule of ["syntax: <length>; inherits: false; initial-value: 0px", "syntax: '<length>'; inherits: false", "syntax: '<length>'; initial-value: 0px", "syntax: '<length>'; inherits: false; initial-value: 10",
    "syntax: '<length>'; inherits: false; initial-value: 1em", "syntax: '<lenght>'; inherits: false; initial-value: 0px", "syntax: '<length>'; inherits: no; initial-value: 0px"])
    assert.deepEqual(child(rule), ['verified', '30', 1], rule);
  // valid: registered, does not inherit, so the child gets the initial value
  assert.deepEqual(child("syntax: '<length>'; inherits: false; initial-value: 0px"), ['verified', '0', 0]);
});

test('F112: a declaration with the higher specificity that loses only because of its cascade layer is reported', () => {
  const html = '<div class="a" id="x"></div>';
  const hits = css => codes(run(css, html), 'W_CSS_LAYER_OVERRIDDEN').map(w => `${w.selector} < ${w.winner}`);
  // an unlayered rule beats every layered one, whatever the specificity
  assert.deepEqual(hits('@layer base{#x.a{width:40px}}.a{width:20px}'), ['#x.a < .a']);
  // a later layer beats an earlier one
  assert.deepEqual(hits('@layer a, b; @layer b{.a{width:40px}} @layer a{#x.a{width:60px}}'), ['#x.a < .a']);
  // not reported: the winner also has the higher specificity, the values are equal, or the same layer
  assert.deepEqual(hits('@layer base{.a{width:40px}}#x.a{width:20px}'), []);
  assert.deepEqual(hits('@layer base{#x.a{width:20px}}.a{width:20px}'), []);
  assert.deepEqual(hits('@layer base{#x.a{width:40px} .a{width:20px}}'), []);
  // the analysis itself is the browser's: the unlayered 20px wins
  assert.equal(run('@layer base{#x.a{width:40px}}.a{width:20px}', html).sizes.find(s => s.box === '#x').rect.inlineSize.constant, '20');
});

test('F113: an @font-face the browser ignores is not used; an invalid font-display is auto', async () => {
  const {parseLayoutCSS} = await import('../src/layout/css.mjs');
  const faces = rule => { const r = parseLayoutCSS([{css: `@font-face { ${rule}; }`, file: 'a.css'}], () => {}); return [r.fontFaces.map(f => `${f.family}/${f.display}`), r.notes.filter(n => n.code === 'W_CSS_FONT_FACE_INVALID').map(n => n.problem)]; };
  // measured in Chromium, Firefox and WebKit: not in document.fonts
  for (const rule of ['src: local(Arial)', 'font-family: F', 'font-family: 3D Font; src: local(Arial)', "font-family: 'F'; src: Arial"]) {
    const [list, problems] = faces(rule);
    assert.deepEqual(list, [], rule);
    assert.equal(problems.length, 1, rule);
  }
  assert.deepEqual(faces('font-family: F; src: local(Arial); font-display: fast'), [['F/auto'], ['font-display fast is not auto, block, swap, fallback or optional']]);
  assert.deepEqual(faces("font-family: 'F'; src: url(f.woff2) format('woff2'), local(F); font-display: swap"), [['F/swap'], []]);
});

test('F114: an invalid transition / animation value drops the declaration (and is not mistaken for a missing duration)', () => {
  // the whole shorthand is dropped: no transition, so no "no duration" either
  for (const css of ['.a{transition:opacity 300}', '.a{transition:opacity .3s easeInOut}', '@keyframes spin{to{opacity:0}}.a{animation:spin 1s 1s 1s}']) {
    const r = run(css);
    assert.equal(codes(r, 'W_CSS_TIMING_INVALID').length, 1, css);
    assert.equal(codes(r, 'W_CSS_TRANSITION_NO_DURATION').length, 0, css);
  }
  // a dropped transition-duration leaves the transition at 0s: both are true
  const longhand = run('.a{transition-duration:300;transition-property:opacity}');
  assert.equal(codes(longhand, 'W_CSS_TIMING_INVALID').length, 1);
  assert.equal(codes(longhand, 'W_CSS_TRANSITION_NO_DURATION').length, 1);
  assert.equal(codes(run('.a{transition:opacity .3s ease-in-out}'), 'W_CSS_TIMING_INVALID').length, 0);
});

test('F115: an invalid background shorthand is dropped, so the backdrop of the text is the one the browser shows', () => {
  const page = bg => analyzeHTML('<html lang="en"><body><p class="t">text</p></body></html>', {name: 'P', accessibility: true, boxes: {'.t': {overflow: 'clip', overflowBlock: 'clip'}},
    css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}body{background:#000}.t{height:20px;overflow:hidden;font:16px sans-serif;color:#fff}.t{background:${bg}}`, viewport: {min: 320, max: 800, height: {min: 300, max: 600}}});
  for (const bg of ['red url(x.png), white', 'url(a b.png) white', 'url(x.png) / cover white', 'url(x.png) cover white']) {
    const r = page(bg);
    assert.equal(codes(r, 'W_CSS_BACKGROUND_INVALID').length, 1, bg);
    // dropped: white text on the black body, which passes (it was Unknown, and the white would have failed)
    assert.ok(!r.diagnostics.some(d => /A11Y_CONTRAST/.test(d.code)), `${bg}: ${JSON.stringify(r.diagnostics.map(d => d.code))}`);
  }
  assert.ok(page('white').diagnostics.some(d => d.code === 'E_A11Y_CONTRAST'));
});

test('F116: an invalid will-change is dropped, so it does not trap a fixed child (it did)', () => {
  const html = '<div class="p"><div class="f"></div></div>', css = wc => `.p{height:100px;will-change:${wc}}.f{position:fixed;top:0;left:0;width:10px;height:10px}`;
  assert.equal(codes(run(css('transform'), html), 'W_LAYOUT_FIXED_TRAPPED').length, 1);
  for (const wc of ['auto, transform', 'transform opacity', 'none']) {
    const r = run(css(wc), html);
    assert.equal(codes(r, 'W_LAYOUT_FIXED_TRAPPED').length, 0, wc);
    assert.equal(codes(r, 'W_CSS_KEYWORD_INVALID').length, 1, wc);
  }
  assert.match(codes(run(css('transform opacity'), html), 'W_CSS_KEYWORD_INVALID')[0].message, /needs commas.*transform, opacity\?/);
});

test('F117: transform-style: preserve-3d contains fixed children (it was Unknown), and a grouping property or an inline box makes it do nothing', () => {
  const html = '<div class="p"><div class="f"></div></div>', css = e => `.p{height:100px;${e}}.f{position:fixed;top:0;left:0;width:10px;height:10px}`;
  const inert = r => codes(r, 'W_LAYOUT_DECLARATION_INERT').filter(w => w.properties.includes('transform-style'));
  assert.equal(codes(run(css('transform-style:flat'), html), 'W_LAYOUT_FIXED_TRAPPED').length, 0);
  for (const e of ['transform-style:preserve-3d', 'transform-style:preserve-3d;overflow:hidden']) assert.match(codes(run(css(e), html), 'W_LAYOUT_FIXED_TRAPPED')[0].message, /transform-style: preserve-3d/, e);
  assert.equal(inert(run(css('transform-style:preserve-3d'), html)).length, 0);
  for (const [e, by] of [['overflow:hidden', 'overflow: hidden'], ['overflow:clip', 'overflow: clip'], ['opacity:.5', 'opacity: .5'], ['isolation:isolate', 'isolation: isolate']])
    assert.match(inert(run(css(`transform-style:preserve-3d;${e}`), html))[0]?.message ?? '', new RegExp(`flattened by ${by.replace('.', '\\.')}`), e);
  // display: inline in block flow is not transformable; as a grid item it is blockified, and preserve-3d applies.
  const inline = run('.a{height:auto}.p{transform-style:preserve-3d}', '<div class="a"><span class="p"></span></div>');
  assert.match(inert(inline)[0]?.message ?? '', /display: inline/);
  assert.equal(inert(run('.a{height:auto}.p{display:inline-block;transform-style:preserve-3d}', '<div class="a"><span class="p"></span></div>')).length, 0);
  assert.equal(run('.a{backface-visibility:hidden;transform-style:flat}').status, 'verified');
});

test('F118: flex factors and order on an absolute or fixed box do nothing, whatever its parent (align-self is not reported)', () => {
  const html = '<div class="p"><div class="s"></div><div class="x"></div></div>';
  const inert = (parent, e) => codes(run(`.p{${parent};position:relative;width:300px;height:200px}.s{width:50px;height:50px}.x{position:absolute;top:0;left:0;width:20px;height:20px;${e}}`, html), 'W_LAYOUT_DECLARATION_INERT').filter(w => w.box === '.x').flatMap(w => w.properties);
  for (const parent of ['display:flex', 'display:grid;grid-template-columns:100px 100px', 'display:block']) {
    assert.deepEqual(inert(parent, 'flex-grow:1'), ['flex-grow'], parent);
    assert.deepEqual(inert(parent, 'flex:1'), ['flex-grow', 'flex-basis'], parent);
    assert.deepEqual(inert(parent, 'order:-1'), ['order'], parent);
    assert.deepEqual(inert(parent, 'align-self:center'), [], parent);
    assert.deepEqual(inert(parent, 'flex-grow:0;order:0'), [], parent);
  }
  assert.match(codes(run('.x{position:fixed;top:0;left:0;width:20px;height:20px;flex-basis:100px}', '<div class="x"></div>'), 'W_LAYOUT_DECLARATION_INERT')[0]?.message ?? '', /position: fixed, so it is not a flex item/);
});

test('F119: text-wrap: balance / pretty / stable after white-space: nowrap on the same element turns wrapping back on (pretty: not in Firefox)', () => {
  const html = '<div class="p"><div class="x">aaa bbb</div></div>', hit = css => codes(run(`.x{width:100px}${css}`, html), 'W_CSS_WRAP_RESTORED');
  for (const css of ['.x{white-space:nowrap;text-wrap:balance}', '.x{white-space:pre}.x{text-wrap:stable}', '.x{white-space:nowrap}.x{text-wrap:pretty}']) assert.equal(hit(css).length, 1, css);
  assert.deepEqual(hit('.x{white-space:nowrap;text-wrap:pretty}')[0].browsers, { wraps: ['chromium', 'webkit'], oneLine: ['firefox'] });
  assert.equal(hit('.x{white-space:nowrap;text-wrap:balance}')[0].browsers, undefined);
  // the white-space wins, the style longhand, the mode said outright, or white-space from the parent: not reported
  for (const css of ['.x{text-wrap:balance;white-space:nowrap}', '.x{white-space:nowrap;text-wrap-style:balance}', '.x{white-space:nowrap;text-wrap:wrap}', '.x{white-space:nowrap;text-wrap-mode:wrap}', '.p{white-space:nowrap}.x{text-wrap:balance}'])
    assert.equal(hit(css).length, 0, css);
});

test('F120: styles on a <br> work in one browser or none (display: none is not reported)', () => {
  const hit = css => codes(run(css, '<div class="a"><span>a</span><br><span>b</span></div>'), 'W_CSS_BR_STYLED');
  assert.deepEqual(hit('br{margin-top:50px}')[0].browsers, { firefox: ['margin-top'] });
  assert.deepEqual(hit('br{line-height:80px}')[0].browsers, { webkit: ['line-height'] });
  assert.match(hit('br{line-height:80px}')[0].message, /line spacing in Safari only/);
  assert.match(hit('br{padding:10px;width:5px;display:block}')[0].message, /do nothing in any browser/);
  assert.equal(hit('br{padding:10px}')[0].browsers, undefined);
  for (const css of ['br{display:none}', 'br{margin:0}', '.a{line-height:30px}', '']) assert.equal(hit(css).length, 0, css);
});

test('F121: sizes and spacing on the options of a drop-down do not change the select (a list box and base-select are skipped)', () => {
  const hit = (css, attrs = '') => codes(run(`.s{width:100px;height:30px}${css}`, `<label>L <select class="s" ${attrs}><option>xxxxx</option><option>y</option></select></label>`), 'W_LAYOUT_DECLARATION_INERT').filter(w => w.select);
  assert.deepEqual(hit('option{font-size:40px}')[0].properties, ['font-size']);
  assert.equal(hit('option{padding:30px}').length, 2);
  assert.match(hit('option{height:80px}')[0].message, /height: 80px does not change the size of \.s: it is a drop-down/);
  for (const [css, attrs] of [['option{padding:30px}', 'multiple'], ['option{padding:30px}', 'size="4"'], ['select{font-size:20px}', ''], ['option{color:red}', ''], ['option{padding:0}', '']]) assert.equal(hit(css, attrs).length, 0, `${css} ${attrs}`);
});

test('F122: a size keyword some browsers drop, without a fallback they take, is reported with what each browser uses', () => {
  const hit = css => codes(run(css), 'W_CSS_SIZE_BROWSER_DEPENDENT');
  const [w] = hit('.a{width:50px;width:stretch}');
  assert.deepEqual(w.browsers, { chromium: 'stretch', firefox: '50px', webkit: 'stretch' });
  assert.match(w.message, /width: -webkit-fill-available; width: stretch/);
  assert.match(hit('.a{max-width:-webkit-fit-content}')[0].message, /Write fit-content/);
  for (const css of ['.a{width:-webkit-fill-available;width:stretch}', '.a{width:fit-content}', '.a{width:-moz-fit-content;width:fit-content}']) assert.equal(hit(css).length, 0, css);
});

test('F123: isolation: isolate beside mix-blend-mode on the same element does not stop it blending', () => {
  const hit = css => codes(run(css), 'W_CSS_ISOLATION_SELF');
  assert.match(hit('.a{mix-blend-mode:difference;isolation:isolate}')[0]?.message ?? '', /Put isolation: isolate on the parent/);
  for (const css of ['.a{mix-blend-mode:normal;isolation:isolate}', '.a{isolation:isolate}', '.a{mix-blend-mode:multiply}', '.a{mix-blend-mode:var(--m);isolation:isolate}', '.a{mix-blend-mode:multiply;isolation:auto}']) assert.equal(hit(css).length, 0, css);
});

test('F124: text-indent on a select is indented twice by Firefox; it no longer makes the select Unknown', () => {
  const hit = css => codes(run(css, '<select class="s" aria-label="x"><option>x</option></select>'), 'W_LAYOUT_SELECT_INDENT');
  const [w] = hit('.s{text-indent:10px}');
  assert.deepEqual(w.browsers, { once: ['chromium', 'webkit'], twice: ['firefox'] });
  assert.match(w.message, /padding-inline-start/);
  for (const css of ['.s{text-indent:0}', '.s{color:red}', '']) assert.equal(hit(css).length, 0, css);
});

test('F125: em / rem in a media query ignore the root font-size the page sets', () => {
  const hit = css => codes(run(css), 'W_CSS_MEDIA_EM_ROOT');
  assert.match(hit('html{font-size:62.5%}@media (min-width:50rem){.a{width:10px}}')[0]?.message ?? '', /50rem is 800px/);
  assert.equal(hit('@media (max-width:40em){.a{width:10px}}:root{font-size:10px}').length, 1);
  for (const css of ['@media (min-width:50rem){.a{width:10px}}', 'html{font-size:100%}@media (min-width:50rem){.a{width:10px}}', 'html{font-size:10px}@media (min-width:500px){.a{width:10px}}', '.x{font-size:10px}@media (min-width:50em){.a{width:10px}}'])
    assert.equal(hit(css).length, 0, css);
});

test('F126: an axis written visible (or clip) beside a scrolling one computes to auto (hidden)', () => {
  const hit = css => codes(run(css), 'W_CSS_OVERFLOW_PROMOTED');
  assert.match(hit('.a{overflow-x:hidden;overflow-y:visible}')[0]?.message ?? '', /overflow-y: visible computes to auto.*write overflow-x: clip/);
  assert.equal(hit('.a{overflow:hidden visible}').length, 1);
  for (const css of ['.a{overflow-x:hidden}', '.a{overflow-x:clip;overflow-y:visible}', '.a{overflow:hidden}', '.a{overflow:auto}']) assert.equal(hit(css).length, 0, css);
  // clip beside hidden / auto / scroll: Firefox (157) and WebKit (27.2) compute it to hidden, Chromium (156) keeps clip
  // (measured with getComputedStyle, every pair). Whether the box scrolls on that axis differs by browser: the warning
  // says which browser does what, and the layout is Unknown (not hidden, as it once was taken to be everywhere).
  for (const css of ['.a{overflow-x:auto;overflow-y:clip}', '.a{overflow:clip hidden}', '.a{overflow-x:scroll;overflow-y:clip}']) {
    const r = run(css), [w] = codes(r, 'W_CSS_OVERFLOW_PROMOTED');
    assert.ok(w, css);
    assert.deepEqual(w.browsers, { hidden: ['firefox', 'webkit'], clip: ['chromium'] }, css);
    assert.match(w.message, /Firefox and Safari.*Chrome/, css);
    assert.ok(r.diagnostics.some(d => d.code === 'U_LAYOUT_BROWSER' && /clip/.test(d.message)), css);
  }
  // visible beside a scrolling axis computes to auto in all three: still verified, and no browsers note.
  const visible = run('.a{overflow-x:hidden;overflow-y:visible}');
  assert.equal(codes(visible, 'W_CSS_OVERFLOW_PROMOTED')[0].browsers, undefined);
  assert.ok(!visible.diagnostics.some(d => d.code === 'U_LAYOUT_BROWSER'));
});

test('F127: box-sizing on html or body alone is not inherited by the elements that size with padding', () => {
  const hit = css => codes(run(css), 'W_CSS_BOX_SIZING_NOT_INHERITED');
  assert.match(hit('html{box-sizing:border-box}.b{width:100px;padding:10px}')[0]?.message ?? '', /not inherited.*box-sizing: inherit/);
  assert.equal(hit('body{box-sizing:border-box}.b{height:10px;border:1px solid}').length, 1);
  for (const css of ['html{box-sizing:border-box}*,*::before,*::after{box-sizing:inherit}.b{width:100px;padding:10px}', 'html{box-sizing:border-box}', 'html{box-sizing:border-box}.b{box-sizing:border-box;width:100px;padding:10px}', '.b{width:100px;padding:10px}'])
    assert.equal(hit(css).length, 0, css);
});

test('F128: a vertical margin in % is a share of the width', () => {
  const hit = css => codes(run(css), 'W_CSS_MARGIN_PERCENT_WIDTH');
  for (const css of ['.a{margin-top:10%}', '.a{margin:5% 0}', '.a{margin-bottom:2.5%}']) assert.equal(hit(css).length, 1, css);
  for (const css of ['.a{margin:0 5%}', '.a{padding-top:56.25%}', '.a{margin-left:10%}', '.a{margin-top:0%}', '.a{margin-top:10px}']) assert.equal(hit(css).length, 0, css);
});

test('F129: a margin reset that reaches a dialog takes away its centring (open and closed dialogs; a rule for the dialog is not reported)', () => {
  const hit = css => (analyzeHTML('<html lang="en"><body><dialog open><p>d</p></dialog><dialog id="m" class="modal"><p>m</p></dialog></body></html>', {name: 'P', css: `html,body{display:grid;grid-template-columns:minmax(0,1fr)}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).filter(w => w.code === 'W_CSS_DIALOG_NOT_CENTRED');
  assert.deepEqual(hit('*{margin:0}').map(w => w.box), ['dialog@P/0/0', '#m']);
  assert.match(hit('body *{margin:0}')[0].message, /Add dialog \{ margin: auto \}/);
  for (const css of ['*{margin:0}dialog{margin:auto}', 'dialog{margin:10px auto}', '.modal{margin:0}', '#m{margin:0}', '']) assert.equal(hit(css).filter(w => w.box === '#m').length, 0, css);
});

test('F130: ::-webkit-scrollbar is ignored by Chrome beside scrollbar-width / -color, and not taken by Firefox', () => {
  const hit = (css, code) => codes(run(`.a{overflow:auto}${css}`), code);
  assert.match(hit('.a{scrollbar-width:thin}.a::-webkit-scrollbar{width:4px}', 'W_CSS_SCROLLBAR_WEBKIT_IGNORED')[0]?.message ?? '', /Chrome and Safari ignore .*those rules do nothing/);
  assert.equal(hit('.a{scrollbar-color:red blue}.a::-webkit-scrollbar-thumb{background:red}', 'W_CSS_SCROLLBAR_WEBKIT_IGNORED').length, 1);
  assert.match(hit('.a::-webkit-scrollbar{display:none}', 'W_CSS_SCROLLBAR_FIREFOX_SHOWN')[0]?.message ?? '', /\.a \{ scrollbar-width: none \}/);
  assert.equal(hit('.a::-webkit-scrollbar{width:0}', 'W_CSS_SCROLLBAR_FIREFOX_SHOWN').length, 1);
  for (const css of ['.a{scrollbar-width:none}.a::-webkit-scrollbar{display:none}', '.a::-webkit-scrollbar{width:6px}', '.a{scrollbar-width:thin}', '.b{scrollbar-width:thin}.a::-webkit-scrollbar{width:4px}'])
    assert.equal([...hit(css, 'W_CSS_SCROLLBAR_WEBKIT_IGNORED'), ...hit(css, 'W_CSS_SCROLLBAR_FIREFOX_SHOWN')].length, 0, css);
});

test('F131: a :hover / :focus rule beaten by a later or more specific rule without the state never shows', () => {
  const hit = css => codes(run(css, '<a href="/x" class="b c">link text</a>'), 'W_CSS_STATE_SHADOWED');
  assert.match(hit('a:hover{color:red}a:link{color:blue}')[0]?.message ?? '', /a:hover \{ color: red \} never shows: a:link/);
  assert.equal(hit('.b:hover{background:red}.b.c{background:blue}').length, 1);
  assert.equal(hit('a:focus{color:red}a:link{color:blue}')[0]?.state, ':focus');
  for (const css of ['a:link{color:blue}a:hover{color:red}', '.b:hover{color:red}.b{color:blue}', 'a:hover{color:red}a:link{color:red}', 'a:hover{color:red}'])
    assert.equal(hit(css).length, 0, css);
});

test('F132: a -moz- or -ms- selector in a list drops the whole rule where it is invalid', () => {
  const hit = css => codes(run(css), 'W_CSS_SELECTOR_LIST_VENDOR');
  assert.deepEqual(hit('.a::-moz-selection,.a{color:red}')[0]?.browsers, { drops: ['chromium', 'webkit'] });
  assert.match(hit('.a::-ms-clear,.a{color:red}')[0]?.message ?? '', /this rule never applies/);
  assert.equal(hit('.a:hover:-moz-any(b),.a{color:red}').length, 1);
  for (const css of ['.a:is(:-moz-focusring,.x),.a{color:red}', '.a:where(:-moz-focusring),.a{color:red}', '.a::-webkit-input-placeholder,.a{color:red}', '.a::-moz-selection{color:red}', '.a,.b{color:red}'])
    assert.equal(hit(css).length, 0, css);
});

test('F133: a container query unit with no query container for its axis is a small-viewport unit', () => {
  const nest = '<div class="g"><div class="p"><div class="a"></div></div></div>';
  const hit = (css, html = nest) => codes(run(css, html), 'W_CSS_CONTAINER_UNIT_VIEWPORT');
  // No container: cqw is svw, cqh is svh (measured in Chromium, Firefox and WebKit: the same boxes).
  const [w] = hit('.a{width:50cqw}');
  assert.ok(w); assert.deepEqual(w.units, ['cqw']); assert.match(w.message, /svw/);
  assert.match(hit('.a{height:30cqh}')[0]?.message ?? '', /svh/);
  for (const css of ['.a{font-size:5cqi}', '.a{width:calc(100% - 10cqw)}', '.a{padding-block:2cqb}'])
    assert.equal(hit(css).length, 1, css);
  // An inline-size container gives the inline axis only: cqh / cqb still fall back to the viewport; cqw does not.
  assert.equal(hit('.p{container-type:inline-size}.a{height:30cqh}').length, 1);
  assert.match(hit('.p{container-type:inline-size}.a{height:30cqh}')[0].message, /container-type: size/);
  assert.equal(hit('.p{container-type:inline-size}.a{width:50cqw}').length, 0);
  assert.equal(hit('.g{container-type:inline-size}.a{width:50cqw}').length, 0);
  assert.equal(hit('.p{container-type:size;height:100px}.a{height:30cqh}').length, 0);
  assert.equal(hit('.p{container:card / inline-size}.a{width:50cqw}').length, 0);
  // A container name alone is not a container; the element's own container-type does not count (it queries ancestors).
  assert.equal(hit('.p{container-name:card}.a{width:50cqw}').length, 1);
  assert.equal(hit('.a{container-type:inline-size;width:50cqw}').length, 1);
  // A container that a state or a media query sets may be there: not reported.
  assert.equal(hit('@media (min-width:600px){.p{container-type:inline-size}}.a{width:50cqw}').length, 0);
  assert.equal(hit('.g:hover .p{container-type:inline-size}.a{width:50cqw}').length, 0);
  // Not a unit: a name or a string with the letters in it.
  assert.equal(hit('.a{animation-name:cqw}@keyframes cqw{to{opacity:.5}}').length, 0);
  assert.equal(hit('.a{width:50svw}').length, 0);
});

test('F9: a pseudo-element without content on a container is reported whether the layout is verified or Unknown (one style walk, ADR-0016 M6)', () => {
  const tree = {tag: 'main', classes: ['row'], children: [{tag: 'div', classes: ['cell']}]};
  const css = '* { box-sizing: border-box; }\n.row { display: grid; grid-template-columns: minmax(0, 1fr); }\n.row::before { width: 10px; }\n';
  const verified = analyzeLayout(tree, {name: 'Row', css, viewport: {min: 160, max: 640}, ancestors: [{tag: 'html'}]});
  assert.equal(verified.status, 'verified', JSON.stringify(verified.diagnostics));
  assert.deepEqual(codes(verified, 'W_CSS_PSEUDO_NO_CONTENT').map(w => w.box), ['.row::before']);
  // Unknown (no ancestors: nothing closes the environment): the same warning.
  const unknown = analyzeLayout(tree, {name: 'Row', css: css + '.cell { min-width: var(--x); }\n', viewport: {min: 160, max: 640}});
  assert.equal(unknown.status, 'unknown');
  assert.deepEqual(codes(unknown, 'W_CSS_PSEUDO_NO_CONTENT').map(w => w.box), ['.row::before']);
});
