import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {analyzeVue} from '../../vue-adapter/src/index.mjs';
import {analyzeReact} from '../../react-adapter/src/index.mjs';
import {lint, formatText, recommended} from '../src/index.mjs';

const pageCSS = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}';
const viewport = {min: 320, max: 800, height: {min: 600, max: 900}};
const vue = `<template>
  <main class="page">
    <div v-if="compact" class="bar"></div>
    <div v-else class="bar wide"></div>
    <p class="note">Saved</p>
  </main>
</template>
<style scoped>.page{display:grid;grid-template-columns:minmax(0,1fr)}.bar{height:40px}.wide{width:480px}.note{display:block}.gone{color:red}</style>`;

test('lint: recommended findings carry the element source line and the states they hold in', () => {
  const messages = lint(analyzeVue(vue, {pageCSS, viewport, selectors: true, assumeText: true, sourceLines: true}), {file: 'Wide.vue', source: vue});
  const overflow = messages.find(m => m.code === 'E_LAYOUT_ITEM_SIZE');
  assert.equal(overflow.line, 4);
  assert.equal(overflow.states, 'compact=false');
  assert.equal(overflow.severity, 'error');
  assert.ok(overflow.fix);
  assert.ok(messages.some(m => m.code === 'W_CSS_SELECTOR_UNMATCHED' && m.line === 8));
  // The text assumption is stated, never silent.
  assert.ok(messages.some(m => m.code === 'ASSUMPTION' && /text box/.test(m.message)));
  assert.match(formatText(messages), /Wide\.vue:4\s+error\s+E_LAYOUT_ITEM_SIZE/);
});

test('lint: Unknowns are listed as not checked; profile all keeps the other rules', () => {
  const r = analyzeReact('export default function C({kind}) { return <main className={kind}></main>; }', {pageCSS, viewport});
  assert.ok(lint(r, {file: 'C.jsx'}).some(m => m.severity === 'info' && m.code === 'U_REACT_DYNAMIC_CLASS'));
  assert.ok(Object.keys(recommended).length > 30);
});

test('css-lint CLI: exit status 1 on errors, file:line output', () => {
  const cli = fileURLToPath(new URL('../../../tools/css-lint.mjs', import.meta.url));
  const fixture = fileURLToPath(new URL('../../vue-adapter/fixtures/Wide.vue', import.meta.url));
  let status = 0, out = '';
  try { out = execFileSync('node', [cli, '--viewport', '320-800', '--height', '600-900', fixture], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}); } catch (error) { status = error.status; out = error.stdout; }
  assert.equal(status, 1);
  assert.match(out, /Wide\.vue:4\s+error\s+E_LAYOUT_ITEM_SIZE/);
  const json = JSON.parse((() => { try { return execFileSync('node', [cli, '--format', 'json', '--viewport', '320-800', '--height', '600-900', fixture], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}); } catch (error) { return error.stdout; } })());
  assert.ok(json.some(m => m.code === 'E_LAYOUT_PAGE_OVERFLOW' && m.line === 4));
});

test('lint on a realistic Svelte component: icon button, grid areas, auto-fill cards, srcset', async () => {
  const {analyzeSvelte} = await import('../../svelte-adapter/src/index.mjs');
  const {readFileSync} = await import('node:fs');
  const file = fileURLToPath(new URL('../../svelte-adapter/fixtures/Catalog.svelte', import.meta.url));
  const source = readFileSync(file, 'utf8');
  const result = analyzeSvelte(source, {pageCSS: `${pageCSS}body{margin:0}`, viewport: {min: 320, max: 1280, height: {min: 480, max: 900}}, assumeText: true, sourceLines: true, accessibility: true, selectors: true, eachCounts: [0, 2], scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}],
    // The thumbnails' height: auto follows their width/height attributes' ratio, and a srcset with width descriptors
    // leaves the loaded file open: the attributes are taken as its size only under trustImageAttributes (#55).
    trustImageAttributes: true});
  const found = lint(result, {file: 'Catalog.svelte', source}).filter(m => m.severity !== 'info').map(m => [m.code, m.line]);
  for (const expected of [['E_A11Y_NAME', 7], ['E_LAYOUT_TRACKS', 13], ['W_LAYOUT_GRID_AREA_UNKNOWN', 11], ['W_LAYOUT_SIZES_MISSING', 16]])
    assert.ok(found.some(([code, line]) => code === expected[0] && line === expected[1]), `${expected}: ${JSON.stringify(found)}`);
  // By default the thumbnail's height is Unknown, with the reason (not a silent pass).
  const untrusted = analyzeSvelte(source, {pageCSS: `${pageCSS}body{margin:0}`, viewport: {min: 320, max: 1280, height: {min: 480, max: 900}}, assumeText: true, sourceLines: true, eachCounts: [0, 2], scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
  assert.ok(lint(untrusted, {file: 'Catalog.svelte', source}).some(m => m.severity === 'info' && /trustImageAttributes/.test(m.message)));
  // The home link is named by its svg's <title>.
  assert.ok(!found.some(([code, line]) => code === 'E_A11Y_NAME' && line === 8));
});

test('lint: a block-flow component is checked; what it cannot model is listed as not checked, never a silent pass', async () => {
  const {analyzeSvelte} = await import('../../svelte-adapter/src/index.mjs');
  const source = '<section class="box"><div class="a"></div><div class="b"></div></section>\n<style>.box{display:block}.a,.b{height:20px}.b{width:2000px}</style>';
  const messages = lint(analyzeSvelte(source, {pageCSS, viewport, accessibility: true, sourceLines: true}), {file: 'Block.svelte', source});
  assert.ok(messages.some(m => m.code === 'E_LAYOUT_ITEM_SIZE' && m.severity === 'error'), JSON.stringify(messages));
  // Page-level rules are not about a component.
  assert.ok(!messages.some(m => m.code === 'W_A11Y_PAGE_H1'));
  // Inline content in a block container: listed as not checked.
  const inline = '<section class="box"><span class="a"></span></section>\n<style>.box{display:block}</style>';
  assert.ok(lint(analyzeSvelte(inline, {pageCSS, viewport, sourceLines: true}), {file: 'Inline.svelte', source: inline}).some(m => m.severity === 'info' && /not checked/.test(m.message)));
  // A refusal code (E_LAYOUT_CONTAINER) outside the rule set is still listed as not checked.
  const refused = lint({states: [{choices: {}, report: {diagnostics: []}}], unknowns: [], coverage: {}, findings: [{code: 'E_LAYOUT_CONTAINER', severity: 'error', box: '.x', message: 'Layout containers must use grid or the flex subset', states: [{}]}]}, {file: 'X.svelte'});
  assert.ok(refused.some(m => m.code === 'E_LAYOUT_CONTAINER' && /not checked/.test(m.message)));
});

test('lint on a block-flow Vue article: centered wrapper, margins, sr-only names, width: 100% + margin', async () => {
  const {readFileSync} = await import('node:fs');
  const file = fileURLToPath(new URL('../../vue-adapter/fixtures/Article.vue', import.meta.url));
  const source = readFileSync(file, 'utf8');
  const result = analyzeVue(source, {pageCSS: '*{box-sizing:border-box;margin:0}', viewport: {min: 320, max: 1280, height: {min: 480, max: 900}}, assumeText: true, sourceLines: true, accessibility: true, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
  const found = lint(result, {file: 'Article.vue', source}).map(m => [m.severity, m.code, m.line]);
  for (const expected of [['error', 'E_LAYOUT_ITEM_SIZE', 7], ['warning', 'W_LAYOUT_FULL_WIDTH_MARGIN', 7], ['error', 'E_A11Y_NAME', 8]])
    assert.ok(found.some(f => f.join() === expected.join()), `${expected}: ${JSON.stringify(found)}`);
  // The back link is named by its sr-only text; the hidden text is not judged for fit or contrast.
  assert.ok(!found.some(([, code, line]) => line === 4 && ['E_A11Y_NAME', 'E_LAYOUT_CONTENT', 'W_LAYOUT_CLIPPED', 'U_A11Y_CONTRAST'].includes(code)), JSON.stringify(found));
});

test('assumed text follows the box tree: phrasing inside text is that text, not a box of its own (no crash)', async () => {
  const {analyzeSvelte} = await import('../../svelte-adapter/src/index.mjs');
  const source = '<article class="t"><p class="meta">Posted <strong>today</strong> by <a href="/me">me</a></p></article>\n<style>.t{display:block;padding:8px;background:#fff;color:#222}a{color:#246}</style>';
  const result = analyzeSvelte(source, {pageCSS: '*{box-sizing:border-box;margin:0}', viewport, assumeText: true, accessibility: true, sourceLines: true});
  assert.equal(result.coverage.assumptions.some(a => /1 text box/.test(a)), true, JSON.stringify(result.coverage));
  assert.ok(lint(result, {file: 'T.svelte', source}).every(m => m.code !== 'E_LAYOUT_CONTENT'));
});

test('a state whose analysis throws is Unknown, not a crash', async () => {
  const {analyzeStates} = await import('../src/index.mjs');
  const result = analyzeStates({states: [{html: '<div class="a"></div>', choices: {}}], css: ''}, {pageCSS, viewport, boxes: {'.missing': {minInlineSize: 0}}});
  assert.equal(result.status, 'unknown');
  assert.ok(lint(result, {file: 'X.svelte'}).some(m => m.code === 'W_LINT_ANALYSIS_FAILED' && m.severity === 'warning'));
});

test('lint messages: decimal px, no internal markers, and one finding per root cause', () => {
  const f = (code, path, box, message) => ({code, path, box, severity: 'error', message, states: [{}], html: ''});
  const result = {states: [{choices: {}, report: {diagnostics: []}}], unknowns: [], coverage: {assumptions: []}, findings: [
    f('E_LAYOUT_CONTENT', 'C/0/1', '.title.__text0', '.title.__text0 requires 22065/64px but receives 33329/128px on inline axis at viewport 51761/128px × 690px'),
    f('E_LAYOUT_TRACKS', 'C/1', '.grid', '.grid requires 752px but receives 520px on inline axis at viewport 552px × 690px'),
    f('E_LAYOUT_PAGE_OVERFLOW', 'C/1/0', '.plan', '.plan reaches past the viewport, so the page scrolls horizontally'),
    f('E_LAYOUT_PAGE_OVERFLOW', 'C/1/0/0', '.name.__text1', '.name.__text1 reaches past the viewport, so the page scrolls horizontally'),
    f('E_A11Y_FIXED_HIDES_PART', 'C/2', '.lead', '.lead runs under the fixed .side'),
    f('E_A11Y_TEXT_START_OBSCURED', 'C/2', '.lead', 'the start of .lead\'s text is hidden behind .side'),
    f('W_A11Y_PLACEHOLDER_CLIPPED', 'C/3', '.input.__ph0', '.input.__ph0\'s placeholder needs 246.5px'),
  ]};
  result.findings.at(-1).severity = 'warning';
  const messages = lint(result, {file: 'X.svelte'});
  const content = messages.find(m => m.code === 'E_LAYOUT_CONTENT');
  assert.equal(content.message, '.title requires 344.77px but receives 260.38px on inline axis at viewport 404.38px × 690px');
  assert.ok(!messages.some(m => /__ph|__text/.test(m.message)), JSON.stringify(messages));
  // The tracks overflow explains its descendants reaching past the viewport: they are folded into it.
  assert.deepEqual(messages.filter(m => /PAGE_OVERFLOW|TRACKS/.test(m.code)).map(m => m.code), ['E_LAYOUT_TRACKS']);
  assert.match(messages.find(m => m.code === 'E_LAYOUT_TRACKS').message, /\(also: 2 boxes inside it reach past the viewport\)/);
  // The fixed bar hiding part of the text includes its start: one finding.
  assert.deepEqual(messages.filter(m => m.code.startsWith('E_A11Y')).map(m => m.code), ['E_A11Y_FIXED_HIDES_PART']);
});

test('lint fix: a table whose columns overflow is told to wrap its cells or scroll, not to use grid tracks', () => {
  const result = {states: [{choices: {}, report: {diagnostics: []}}], unknowns: [], coverage: {assumptions: []}, findings: [
    {code: 'E_LAYOUT_TRACKS', path: 'Component/0/0', box: '.plans', severity: 'error', message: '.plans requires 400px but receives 360px on inline axis at viewport 360px × 690px', states: [{}], html: '<table class="plans"><tbody><tr><td>a</td></tr></tbody></table>'},
    {code: 'E_LAYOUT_TRACKS', path: 'Component/0/1', box: '.g', severity: 'error', message: '.g requires 400px but receives 360px on inline axis at viewport 360px × 690px', states: [{}], html: '<table class="plans"></table><div class="g"></div>'},
  ]};
  const [table, grid] = lint(result, {file: 'T.svelte'}).filter(m => m.code === 'E_LAYOUT_TRACKS');
  assert.match(table.fix, /overflow-x: auto/);
  assert.match(grid.fix, /minmax\(0, 1fr\)/);
  const flex = lint({...result, findings: [{...result.findings[1], layout: 'flex'}]}, {file: 'T.svelte'}).find(m => m.code === 'E_LAYOUT_TRACKS');
  assert.match(flex.fix, /flex-wrap: wrap/);
});

test('css-lint assumes the UA default colors (stated), and --default-colors none keeps them Unknown', () => {
  const file = fileURLToPath(new URL('../../svelte-adapter/fixtures/Card.svelte', import.meta.url));
  const cli = fileURLToPath(new URL('../../../tools/css-lint.mjs', import.meta.url));
  const out = args => { try { return JSON.parse(execFileSync('node', [cli, '--format', 'json', ...args, file], {encoding: 'utf8'})); } catch (e) { return JSON.parse(e.stdout); } };
  const on = out([]), off = out(['--default-colors', 'none']);
  assert.ok(on.some(m => m.code === 'ASSUMPTION' && /user-agent default colors/.test(m.message)));
  assert.ok(!off.some(m => m.code === 'ASSUMPTION' && /user-agent default colors/.test(m.message)));
});

test('css-lint: an img sized by its attributes\' ratio is not checked by default; --trust-image-attributes takes them (stated)', () => {
  const file = fileURLToPath(new URL('../../svelte-adapter/fixtures/Catalog.svelte', import.meta.url));
  const cli = fileURLToPath(new URL('../../../tools/css-lint.mjs', import.meta.url));
  const out = args => { try { return JSON.parse(execFileSync('node', [cli, '--format', 'json', '--each-counts', '2', ...args, file], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']})); } catch (e) { return JSON.parse(e.stdout); } };
  const off = out([]), on = out(['--trust-image-attributes']);
  assert.ok(off.some(m => m.severity === 'info' && /trustImageAttributes/.test(m.message)), JSON.stringify(off.map(m => m.message)));
  assert.ok(!on.some(m => m.severity === 'info' && m.code !== 'ASSUMPTION' && /trustImageAttributes/.test(m.message)));
  assert.ok(on.some(m => m.code === 'ASSUMPTION' && /width\/height attributes/.test(m.message)));
  assert.ok(on.some(m => m.code === 'W_LAYOUT_SIZES_MISSING'));
});

test('lint: an analysis that failed with an internal error is a warning that names it as the checker\'s failure, not a quiet "not checked"', () => {
  const result = {states: [{choices: {}, report: {status: 'unknown', diagnostics: [{code: 'U_ADAPTER_ANALYSIS', severity: 'unknown', message: 'the analysis of this state failed: Layout numbers require at most twelve integer and six decimal digits'}]}}], unknowns: [], coverage: {assumptions: []}, findings: []};
  const [m] = lint(result, {file: 'X.jsx'}).filter(m => /ANALYSIS/.test(m.code));
  assert.equal(m.severity, 'warning');
  assert.equal(m.code, 'W_LINT_ANALYSIS_FAILED');
  assert.match(m.message, /the checker failed/);
  assert.match(m.fix, /report/);
});

test('lint: WAI-ARIA conformance errors no rendering can confirm are a separate "spec" tier of warnings', () => {
  const f = (code, message) => ({code, path: 'C/0/0', box: '.sw', severity: 'error', message, states: [{}], html: '<div class="sw"></div>'});
  const result = {states: [{choices: {}, report: {diagnostics: []}}], unknowns: [], coverage: {assumptions: []}, findings: [f('E_A11Y_ROLE_ATTR', '.sw has role switch without aria-checked'), f('E_A11Y_ARIA_VALUE', '.sw has aria-checked="yes", not a valid value')]};
  const out = lint(result, {file: 'S.jsx'});
  for (const code of ['E_A11Y_ROLE_ATTR', 'E_A11Y_ARIA_VALUE']) {
    const m = out.find(m => m.code === code);
    assert.equal(m.severity, 'warning', code);
    assert.equal(m.tier, 'spec');
    assert.match(m.message, /^spec:/);
    assert.ok(m.fix);
  }
});

// Component scope: selectors and the parent-child relations they rely on are closed in the component.
import {analyzeSvelte} from '../../svelte-adapter/src/index.mjs';
const scopeOptions = {viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, pageCSS: '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}', assumeText: true};
const scopeCodes = result => result.findings.filter(f => /^E_SCOPE_/.test(f.code)).map(f => [f.code, f.box]).sort();

test('scope (Svelte): :global reaches past the component; an ancestor outside it is scoped too (unused, not a leak)', () => {
  const g = 'display: grid; grid-template-columns: minmax(0, 1fr);';
  const svelte = css => analyzeSvelte(`<script>let { open = false } = $props();</script>\n<div class="card" class:open><ul class="list"><Item /></ul></div>\n<style>.card, .list { ${g} } ${css}</style>`, scopeOptions);
  assert.deepEqual(scopeCodes(svelte('.list :global(li) { padding: 4px; }')), [['E_SCOPE_ESCAPE', '.list :global(li)']]);
  assert.deepEqual(scopeCodes(svelte('.theme-dark .card { padding: 4px; }')), []);
  assert.deepEqual(scopeCodes(svelte(':global(.theme-dark) .card { padding: 4px; }')), [['E_SCOPE_ESCAPE', ':global(.theme-dark) .card']]);
  // A class one state sets on the component's own element closes the relation.
  assert.deepEqual(scopeCodes(svelte('.open .list { padding: 4px; }')), []);
});

test('scope (Vue): :deep/:slotted escape; a plain <style> is global, so its selectors match the whole page', () => {
  const g = 'display: grid; grid-template-columns: minmax(0, 1fr);';
  const vue = (css, attrs = 'scoped') => analyzeVue(`<template><ul class="list"><Item /></ul></template>\n<style ${attrs}>.list { ${g} } ${css}</style>`, scopeOptions);
  assert.deepEqual(scopeCodes(vue(':deep(li) { padding: 4px; }')), [['E_SCOPE_ESCAPE', ':deep(li)']]);
  assert.deepEqual(scopeCodes(vue('.list > li { padding: 4px; }')), []);
  // Vue scopes only the styled element: an ancestor the component does not render comes from the page.
  assert.deepEqual(scopeCodes(vue('.theme-dark .list { padding: 4px; }')), [['E_SCOPE_OUTSIDE', '.theme-dark .list']]);
  // A plain <style> applies to the whole page: with no class the component owns, its selectors match anywhere.
  assert.deepEqual(scopeCodes(vue('.list > li { padding: 4px; }', '')), [['E_SCOPE_GLOBAL', '.list'], ['E_SCOPE_GLOBAL', '.list > li']]);
});

test('scope (Linaria): a nested selector may not style the li another component renders; its own li is fine', () => {
  const linaria = body => analyzeReact(`import { css } from '@linaria/core';\nconst list = css\`display: grid; grid-template-columns: minmax(0, 1fr); padding: 0; & > li { padding: 4px; }\`;\nexport default function L() { return ${body}; }`, scopeOptions);
  assert.deepEqual(scopeCodes(linaria('<ul className={list}><Item /></ul>')).map(([c]) => c), ['E_SCOPE_REACHES']);
  assert.deepEqual(scopeCodes(linaria('<ul className={list}><li>a</li></ul>')), []);
  assert.deepEqual(scopeCodes(linaria('<ul className={list}>{children}</ul>')).map(([c]) => c), ['E_SCOPE_REACHES']);
  const out = lint(linaria('<ul className={list}><Item /></ul>'), {file: 'L.jsx'});
  assert.equal(out.find(m => m.code === 'E_SCOPE_REACHES')?.severity, 'error');
});

test('noshift (component-declared): data-noshift on its own element is compared between its states', () => {
  const g = 'display: grid; grid-template-columns: minmax(0, 1fr);';
  const svelte = (banner, extra = '', attrs = 'data-noshift="content"') => analyzeSvelte(`<script>let { open = false, wide = false } = $props();</script>\n<div class="page">{#if open}<div class="banner"></div>{/if}<main class="content" class:wide ${attrs}></main></div>\n<style>.page { ${g} } .banner { ${banner} } .content { height: 100px; } .wide { margin-left: 20px; } ${extra}</style>`, scopeOptions);
  const shifted = svelte('height: 48px;');
  const f = shifted.findings.find(f => f.code === 'E_LAYOUT_NOSHIFT');
  assert.ok(f, JSON.stringify(shifted.findings.map(f => f.code)));
  assert.match(f.message, /\[data-noshift="content"\] moves between .* its (top|left) is/);
  assert.equal(shifted.status, 'violated');
  // The banner overlays (absolute) instead of pushing the content, and .wide is outside the contract's conditions.
  const kept = svelte('position: absolute; top: 0; left: 0; width: 100px; height: 48px;', '.page { position: relative; }', 'data-noshift="content" data-noshift-on="open"');
  assert.deepEqual(kept.findings.filter(f => f.code === 'E_LAYOUT_NOSHIFT'), []);
  // Without data-noshift-on, the .wide state is compared too: its margin moves the content.
  assert.ok(svelte('position: absolute; top: 0; left: 0; width: 100px; height: 48px;', '.page { position: relative; }').findings.some(f => f.code === 'E_LAYOUT_NOSHIFT'));
  // The contract belongs to the component that owns the element: on a child component's tag it is an error.
  const foreign = analyzeSvelte(`<div class="page"><Panel data-noshift="p" /></div>\n<style>.page { ${g} }</style>`, scopeOptions);
  assert.deepEqual(foreign.findings.filter(f => f.code === 'E_SCOPE_CONTRACT').map(f => f.box), ['<Panel>']);
});

test('noshift (Vue, React): the same contract, and the same error on a child component tag', () => {
  const g = 'display: grid; grid-template-columns: minmax(0, 1fr);';
  const vue = analyzeVue(`<template><div class="page"><div v-if="open" class="banner"></div><main class="content" data-noshift="content"></main><Panel data-noshift="p" /></div></template>\n<script setup>defineProps({ open: Boolean });</script>\n<style scoped>.page { ${g} } .banner { height: 48px; } .content { height: 100px; }</style>`, scopeOptions);
  assert.deepEqual(vue.findings.filter(f => ['E_LAYOUT_NOSHIFT', 'E_SCOPE_CONTRACT'].includes(f.code)).map(f => f.code).sort(), ['E_LAYOUT_NOSHIFT', 'E_SCOPE_CONTRACT']);
  const react = analyzeReact(`import { css } from '@linaria/core';\nconst page = css\`${g}\`;\nconst banner = css\`height: 48px;\`;\nconst content = css\`height: 100px;\`;\nexport default function P({ open }) { return <div className={page}>{open && <div className={banner}></div>}<main className={content} data-noshift="content"></main></div>; }`, scopeOptions);
  assert.deepEqual(react.findings.filter(f => f.code === 'E_LAYOUT_NOSHIFT').length, 1);
});

test('lint: a shorthand conflict in a component is a warning and the layout is analysed; with shorthandConflicts: error it stops the layout and the states are listed as not checked', () => {
  const g = 'display: grid; grid-template-columns: minmax(0, 1fr);';
  const src = `<div class="bar"><button class="save" type="button">Save</button></div>\n<style>.bar { ${g} } .save { display: block; height: 36px; font: inherit; font-size: 14px; }</style>`;
  const loose = lint(analyzeSvelte(src, scopeOptions), {file: 'S.svelte'});
  assert.equal(loose.find(m => m.code === 'W_CSS_SHORTHAND_CONFLICT')?.severity, 'warning');
  assert.ok(!loose.some(m => m.code === 'E_CSS_SHORTHAND_CONFLICT' || m.code === 'U_LAYOUT_NOT_ANALYZED'));
  const strict = lint(analyzeSvelte(src, {...scopeOptions, shorthandConflicts: 'error'}), {file: 'S.svelte'});
  assert.equal(strict.find(m => m.code === 'E_CSS_SHORTHAND_CONFLICT')?.severity, 'error');
  assert.match(strict.find(m => m.code === 'U_LAYOUT_NOT_ANALYZED')?.message ?? '', /not checked: the layout of every state was not analyzed/);
});

test('text beside a button in a flex row is an anonymous item (an unstyled span); a selector that could match that span keeps it Unknown', () => {
  const src = css => `<div class="tag">design<button class="x" type="button" aria-label="Remove"></button></div>\n<style>.tag { display: flex; column-gap: 4px; } .x { display: block; width: 16px; height: 16px; padding: 0; border: 0; } ${css}</style>`;
  const structure = r => r.states.some(s => s.report.diagnostics.some(d => d.code === 'U_LAYOUT_STRUCTURE'));
  assert.equal(structure(analyzeSvelte(src(''), scopeOptions)), false);
  for (const css of ['.tag > span { padding: 4px; }', '.tag > * { margin: 0; }', '.x + .x { margin: 0; }', '.tag :first-child { margin: 0; }'])
    assert.equal(structure(analyzeSvelte(src(css), scopeOptions)), true, css);
});

test('a text the font file cannot measure (a character it lacks) is Unknown with the reason, not an assumed pass', async () => {
  const {loadTextMetrics} = await import('../../veriss/src/text-node.mjs');
  const file = fileURLToPath(new URL('../../veriss/text-metrics/fixtures/roboto-variable.ttf', import.meta.url));
  const textMetrics = await loadTextMetrics({fonts: {Roboto: {file}}});
  const src = name => `<div class="row"><span class="n">${name}</span></div>\n<style>.row { display: grid; grid-template-columns: minmax(0, 1fr); } .n { display: block; white-space: nowrap; font-family: Roboto; font-size: 14px; line-height: 20px; }</style>`;
  const r = analyzeSvelte(src('Chloé is editing'), {...scopeOptions, textMetrics, fonts: {Roboto: {}}});
  assert.equal(r.status, 'unknown');
  assert.match(r.unknowns.find(u => u.code === 'U_TEXT_NOT_MEASURED')?.message ?? '', /\.n: Font Roboto lacks U\+00E9/);
  assert.equal(analyzeSvelte(src('Chloe is editing'), {...scopeOptions, textMetrics, fonts: {Roboto: {}}}).status, 'verified');
});

test('uas: a finding that holds in some browsers only says which (a button label that fits Firefox\'s 4px padding only)', async () => {
  const {loadTextMetrics} = await import('../../veriss/src/text-node.mjs');
  const file = fileURLToPath(new URL('../../veriss/text-metrics/fixtures/roboto-variable.ttf', import.meta.url));
  const textMetrics = await loadTextMetrics({fonts: {Roboto: {file}}});
  const source = `<div class="bar"><button class="b" type="button">Publish now</button></div>\n<style>.bar { display: grid; grid-template-columns: 100px; } .b { display: block; white-space: nowrap; font-family: Roboto; font-size: 16px; line-height: 24px; }</style>`;
  const result = analyzeSvelte(source, {...scopeOptions, textMetrics, fonts: {Roboto: {}}, uas: ['chromium', 'firefox', 'webkit']});
  const f = result.findings.find(f => f.code === 'E_LAYOUT_CONTENT');
  assert.deepEqual(f?.browsers, ['chromium', 'webkit'], JSON.stringify(result.findings.map(f => [f.code, f.browsers])));
  const m = lint(result, {file: 'B.svelte'}).find(m => m.code === 'E_LAYOUT_CONTENT');
  assert.match(m.message, /\(in chromium, webkit; not in firefox\)$/);
});

test('lint: a click-catcher is an invisible blocker, and an overlay with no way out a click trap, each with a fix', () => {
  const component = cover => `<template>
  <main class="page">
    <button class="go" aria-label="Go"></button>
    <div class="ov"></div>
  </main>
</template>
<style scoped>.page{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:40px;background:#fff}.go{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;width:40px;height:40px;background:#246}.ov{position:fixed;top:0;left:0;right:0;bottom:0;z-index:10;${cover}}</style>`;
  const run = cover => { const source = component(cover); return lint(analyzeVue(source, {pageCSS: `${pageCSS}body{margin:0}`, viewport, accessibility: true, sourceLines: true}), {file: 'Overlay.vue', source}); };
  const blocker = run('').find(m => m.code === 'E_A11Y_INVISIBLE_BLOCKER');
  assert.ok(blocker && blocker.severity === 'error' && blocker.fix, JSON.stringify(run('')));
  assert.equal(blocker.line, 3);
  const trap = run('background:#000').find(m => m.code === 'E_A11Y_CLICK_TRAP');
  assert.ok(trap && trap.severity === 'error' && trap.fix, JSON.stringify(run('background:#000')));
  assert.equal(trap.line, 4);
});

// A component's CSS stays inside it: CSS that applies to the whole page (a plain Vue <style>, styled-components'
// createGlobalStyle) may not select elements through anything but a class the component owns.
test('scope (Vue): a plain <style> selector with no owned class matches the whole page (E_SCOPE_GLOBAL); scoped sheets are judged as scoped', () => {
  const g = 'display: grid; grid-template-columns: minmax(0, 1fr);';
  const tpl = '<template><ul class="list"><li class="i">a</li></ul></template>';
  const global = r => scopeCodes(r).filter(([c]) => c === 'E_SCOPE_GLOBAL').map(([, b]) => b);
  assert.deepEqual(global(analyzeVue(`${tpl}\n<style>.list { ${g} } li { padding: 4px; }</style>`, scopeOptions)), ['.list', 'li']);
  assert.deepEqual(global(analyzeVue(`${tpl}\n<style scoped>.list { ${g} } li { padding: 4px; }</style>`, scopeOptions)), []);
  // A scoped and a plain sheet: only the plain sheet's selectors.
  assert.deepEqual(global(analyzeVue(`${tpl}\n<style scoped>.list { ${g} } li { padding: 4px; }</style>\n<style>.i { margin: 0; }</style>`, scopeOptions)), ['.i']);
});

test('scope (styled-components): generated classes are owned; a nested selector may not reach {children}; createGlobalStyle escapes', () => {
  const g = 'display: grid; grid-template-columns: minmax(0, 1fr);';
  const sc = (body, extra = '') => analyzeReact(`import styled, { createGlobalStyle } from 'styled-components';\n${extra}const List = styled.ul\`${g} padding: 0; li { padding: 4px; }\`;\nexport default function L({ children }) { return ${body}; }`, scopeOptions);
  // Its own li only: closed. With {children} under the list, li reaches what the caller renders.
  assert.deepEqual(scopeCodes(sc('<List><li>a</li></List>')), []);
  assert.deepEqual(scopeCodes(sc('<List><li>a</li>{children}</List>')).map(([c]) => c), ['E_SCOPE_REACHES']);
  // createGlobalStyle applies to the whole page: an escape, wherever it is rendered.
  const global = sc('<><G /><List><li>a</li></List></>', 'const G = createGlobalStyle`li { margin: 0; }`;\n');
  assert.deepEqual(scopeCodes(global), [['E_SCOPE_ESCAPE', '<G>']]);
  assert.match(global.findings.find(f => f.code === 'E_SCOPE_ESCAPE').message, /createGlobalStyle/);
});

// Checklist J: parent-child structure (docs/content-model.md).
test('lint: a component root whose required parent is the caller\'s is not claimed', () => {
  const root = `<template>\n  <li class="x">a</li>\n</template>\n<style scoped>.x{display:block}</style>`;
  const messages = lint(analyzeVue(root, {pageCSS, viewport, accessibility: true, assumeText: true, sourceLines: true}), {file: 'Item.vue', source: root});
  assert.ok(!messages.some(m => m.code === 'E_A11Y_LIST' && m.severity !== 'info'), JSON.stringify(messages));
  assert.ok(messages.some(m => m.code === 'E_A11Y_LIST' && m.severity === 'info' && /caller/.test(m.message)));
  // Inside the component the parent is known: still reported.
  const inner = `<template>\n  <div class="w"><li class="x">a</li></div>\n</template>\n<style scoped>.w{display:grid;grid-template-columns:minmax(0,1fr)}.x{display:block}</style>`;
  assert.ok(lint(analyzeVue(inner, {pageCSS, viewport, accessibility: true, assumeText: true, sourceLines: true}), {file: 'Bad.vue', source: inner}).some(m => m.code === 'E_A11Y_LIST' && m.severity === 'warning'));
  // With page: true the body is the page's own: reported.
  assert.ok(lint(analyzeVue(root, {pageCSS, viewport, accessibility: true, assumeText: true, sourceLines: true}), {file: 'Item.vue', source: root, page: true}).some(m => m.code === 'E_A11Y_LIST' && m.severity === 'warning'));
});

test('lint: the parser restructuring a component\'s template is reported at its line, with the structure to write', () => {
  const nested = `<template>\n  <ul class="u">\n    <li>a\n      <li class="n">b</li>\n    </li>\n  </ul>\n</template>\n<style scoped>.u{display:grid}</style>`;
  const [w] = lint(analyzeVue(nested, {pageCSS, viewport, assumeText: true, sourceLines: true}), {file: 'List.vue', source: nested}).filter(m => m.code === 'W_HTML_RESTRUCTURED');
  assert.ok(w, 'li in li is reported');
  assert.equal(w.severity, 'warning');
  assert.equal(w.line, 4);
  assert.match(w.fix, /<ul><li>/);
  const cell = `<template>\n  <div class="d">\n    <td>x</td>\n  </div>\n</template>\n<style scoped>.d{display:grid}</style>`;
  const [d] = lint(analyzeVue(cell, {pageCSS, viewport, assumeText: true, sourceLines: true}), {file: 'Cell.vue', source: cell}).filter(m => m.code === 'W_HTML_RESTRUCTURED');
  assert.equal(d?.line, 2);
  assert.match(d.fix, /<table>/);
  // p > div in JSX (React keeps it nested in the DOM it builds; the server-rendered HTML does not).
  const jsx = `export default () => (\n  <main className="m">\n    <p className="q">b<div className="d">x</div></p>\n  </main>\n);`;
  const para = lint(analyzeReact(jsx, {pageCSS, css: '.m{display:grid}', viewport, assumeText: true, sourceLines: true}), {file: 'P.jsx', source: jsx});
  const [p] = para.filter(m => m.code === 'E_HTML_PARAGRAPH_CONTENT');
  assert.equal(p?.severity, 'warning'); assert.equal(p.tier, 'spec'); assert.equal(p.line, 3);
  assert.equal(p.fix, 'use a <div> as the container, or <span> inside the paragraph');
  assert.ok(!para.some(m => m.code === 'W_HTML_RESTRUCTURED'), 'one cause, one finding');
  // A row component's root: the caller's table decides.
  const row = `<template>\n  <tr class="r"><td>x</td></tr>\n</template>\n<style scoped>.r{color:red}</style>`;
  assert.ok(!lint(analyzeVue(row, {pageCSS, viewport, assumeText: true, sourceLines: true}), {file: 'Row.vue', source: row}).some(m => m.code === 'W_HTML_RESTRUCTURED' && m.severity !== 'info'));
});

test('lint: profile strict adds the content-model rules as warnings and changes no error', () => {
  const jsx = `export default () => (\n  <main className="m">\n    <button className="b" type="button"><div className="d">Save</div></button>\n  </main>\n);`;
  const result = analyzeReact(jsx, {pageCSS, css: '.m{display:grid}', viewport, assumeText: true, sourceLines: true, accessibility: true});
  const recommendedRun = lint(result, {file: 'B.jsx', source: jsx});
  assert.ok(recommendedRun.some(m => m.code === 'W_HTML_CONTENT_MODEL' && m.severity === 'info'), 'recommended lists it as outside its rules');
  const strict = lint(result, {file: 'B.jsx', source: jsx, profile: 'strict'});
  const [w] = strict.filter(m => m.code === 'W_HTML_CONTENT_MODEL');
  assert.equal(w?.severity, 'warning');
  assert.equal(w.line, 3);
  assert.match(w.fix, /<span>/);
  // The same errors under both profiles.
  for (const r of [result, analyzeVue(vue, {pageCSS, viewport, selectors: true, assumeText: true, sourceLines: true})]) {
    const errors = profile => lint(r, {file: 'X', source: '', profile}).filter(m => m.severity === 'error').map(m => `${m.code} ${m.message}`);
    assert.deepEqual(errors('strict'), errors('recommended'));
  }
});

// Output fixes found writing docs/guide/ and examples/ (each a minimal fixture of what the guide listed as not caught).
const lintOptions = {pageCSS: '*{box-sizing:border-box;margin:0}', viewport, assumeText: true, sourceLines: true, accessibility: true, selectors: true};

test('lint (Linaria): E_SCOPE_ESCAPE and E_SCOPE_REACHES are reported at the template line of the :global(…) / nested selector', () => {
  const source = [
    "import { css } from '@linaria/core';",
    'const form = css`',
    '  display: grid;',
    '  grid-template-columns: minmax(0, 1fr);',
    '  :global(body) {',
    '    margin: 0;',
    '  }',
    '`;',
    'const list = css`',
    '  display: grid;',
    '  & a {',
    '    padding: 4px;',
    '  }',
    '`;',
    'export default function F() { return <form className={form}><ul className={list}><Item /></ul></form>; }',
  ].join('\n');
  const out = lint(analyzeReact(source, lintOptions), {file: 'F.tsx', source});
  assert.equal(out.find(m => m.code === 'E_SCOPE_ESCAPE')?.line, 5, JSON.stringify(out.filter(m => /SCOPE/.test(m.code))));
  assert.equal(out.find(m => m.code === 'E_SCOPE_REACHES' && /^.lx-list a /.test(m.message))?.line, 11, JSON.stringify(out.filter(m => /SCOPE/.test(m.code))));
});

test('lint: a finding on an element with no class names the element (tag@path), never an empty name', () => {
  const source = '<div class="wrap">\n  <li>one</li>\n</div>\n<style>.wrap { display: grid; grid-template-columns: minmax(0, 1fr); }</style>';
  const out = lint(analyzeSvelte(source, lintOptions), {file: 'L.svelte', source});
  const list = out.find(m => m.code === 'E_A11Y_LIST');
  assert.match(list?.message ?? '', /^spec: li@Component\/0\/0\/0 is a list item outside ul\/ol/, JSON.stringify(list));
  const marker = out.find(m => m.code === 'W_LAYOUT_MARKER_HIDDEN');
  assert.match(marker?.message ?? '', /^li@Component\/0\/0\/0's disc marker/, JSON.stringify(marker));
  for (const m of out) assert.doesNotMatch(m.message, /(?:^|: )(?:'s |is |: |\s)/, `an empty name in ${m.code}: ${m.message}`);
});

test('lint: the line fallback skips comments that mention the selector', () => {
  const source = '<!-- .nope was the old class; :global(.theme-dark) .b too -->\n<button class="b" type="button">Go</button>\n<style>\n  .b { display: block; }\n  .nope { color: red; }\n  :global(.theme-dark) .b { color: white; }\n</style>';
  const out = lint(analyzeSvelte(source, lintOptions), {file: 'C.svelte', source});
  assert.equal(out.find(m => m.code === 'W_CSS_SELECTOR_UNMATCHED')?.line, 5);
  assert.equal(out.find(m => m.code === 'E_SCOPE_ESCAPE')?.line, 6);
  // Linaria: a // comment above the template that names the class is not the rule.
  const tsx = "import { css } from '@linaria/core';\n// .theme-dark & makes the notice dark\nconst notice = css`\n  display: grid;\n  .theme-dark & {\n    color: white;\n  }\n`;\nexport default function N() { return <aside className={notice}>x</aside>; }";
  assert.equal(lint(analyzeReact(tsx, lintOptions), {file: 'N.tsx', source: tsx}).find(m => m.code === 'E_SCOPE_OUTSIDE')?.line, 5);
});

test('lint: page-CSS selectors that match nothing in the component are not its unmatched selectors; its own CSS still is', () => {
  const pageCSS = '*{box-sizing:border-box;margin:0}\nbutton, input, select, textarea { font: inherit; }\nnav a { color: inherit; }';
  const source = '<button class="b" type="button">Go</button>\n<style>.b { display: block; } .nope { color: red; } textarea { resize: none; }</style>';
  const unmatched = r => lint(r, {file: 'B.svelte', source}).filter(m => /^W_CSS_SELECTOR_/.test(m.code)).map(m => m.message.split(' ')[0]).sort();
  assert.deepEqual(unmatched(analyzeSvelte(source, {...lintOptions, pageCSS})), ['.nope', 'textarea']);
  // the same through the CLI's --page-css
  const tsx = "import { css } from '@linaria/core';\nconst b = css`display: block;`;\nexport default function B() { return <button className={b} type=\"button\">Go</button>; }";
  assert.deepEqual(lint(analyzeReact(tsx, {...lintOptions, pageCSS}), {file: 'B.tsx', source: tsx}).filter(m => /^W_CSS_SELECTOR_/.test(m.code)), []);
  // plain className (no component scope): the component's stylesheet follows the page CSS on its last line
  const plain = 'export default function P() { return <button className="b" type="button">Go</button>; }';
  const own = lint(analyzeReact(plain, {...lintOptions, pageCSS, css: '.b { display: block; } select { color: red; }'}), {file: 'P.jsx', source: plain});
  assert.deepEqual(own.filter(m => /^W_CSS_SELECTOR_/.test(m.code)).map(m => m.message.split(' ')[0]), ['select']);
});
