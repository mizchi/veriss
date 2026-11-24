import test from 'node:test';
import assert from 'node:assert/strict';
import {lowerNested, relocateSelectorWarnings, analyzeStates} from '../src/index.mjs';

const card = {
  selector: '.sc-Card',
  // template body as written; its first line is line 10 of Card.styled.ts
  text: '\n  display: grid;\n  & > .title { color: red; }\n  .icon { width: 16px; }\n  @media (min-width: 600px) {\n    gap: 8px;\n  }\n  margin: 0;\n',
  origin: {file: 'Card.styled.ts', line: 10, name: 'Card'},
};

test('lowerNested: one flat rule per line, each mapped to its template line and nesting path', () => {
  const {css, map} = lowerNested([card]);
  const lines = css.split('\n');
  assert.deepEqual(lines, [
    '.sc-Card{display:grid}',
    '.sc-Card > .title{color:red}',
    '.sc-Card .icon{width:16px}',
    '@media (min-width: 600px){.sc-Card{gap:8px}}',
    '.sc-Card{margin:0}',
  ]);
  assert.deepEqual(map.map(m => [m.cssLine, m.origin.line, m.path]), [
    [1, 11, ['.sc-Card']],
    [2, 12, ['.sc-Card', '& > .title']],
    [3, 13, ['.sc-Card', '.icon']],
    [4, 15, ['.sc-Card']],
    [5, 17, ['.sc-Card']],
  ]);
  assert.deepEqual(map[1].relation, {parent: '.sc-Card', combinator: '>', child: '.title'});
  assert.deepEqual(map[2].relation, {parent: '.sc-Card', combinator: ' ', child: '.icon'});
  assert.equal(map[0].relation, null);
});

test('lowerNested: a parent reference after the nested compound (`.dark &`) keeps & as the subject', () => {
  const {css, map} = lowerNested([{selector: '.sc-Item', text: '.sc-List:hover > & { opacity: 1 }', origin: {file: 'f.ts', line: 1, name: 'Item'}}]);
  assert.equal(css, '.sc-List:hover > .sc-Item{opacity:1}');
  assert.deepEqual(map[0].relation, {parent: '.sc-List:hover', combinator: '>', child: '.sc-Item'});
});

test('relocateSelectorWarnings: a broken relation is reported at the template line with its nesting edge', () => {
  const {css, map} = lowerNested([card]);
  const pageCSS = '*{box-sizing:border-box;margin:0}';
  const viewport = {min: 320, max: 800, height: {min: 480, max: 900}};
  // .title is a grandchild, not a child: `& > .title` never holds
  const html = '<div class="sc-Card"><div><span class="title">t</span></div><i class="icon"></i></div>';
  const report = analyzeStates({states: [{html, choices: {}}], css}, {pageCSS, viewport, selectors: true});
  const relocated = relocateSelectorWarnings(report.selectors.warnings, map);
  const broken = relocated.find(w => w.code === 'W_CSS_SELECTOR_RELATION');
  assert.ok(broken, JSON.stringify(report.selectors.warnings));
  assert.equal(broken.file, 'Card.styled.ts');
  assert.equal(broken.line, 12);
  assert.equal(broken.component, 'Card');
  assert.deepEqual(broken.nesting, {path: ['.sc-Card', '& > .title'], relation: {parent: '.sc-Card', combinator: '>', child: '.title'}});
  // the descendant rule holds and is not reported
  assert.ok(!relocated.some(w => w.line === 13));
});

test('lowerNested: a nested rule written over several lines maps to its selector line', () => {
  const {map} = lowerNested([{selector: '.sc-Row', text: '\n  display: flex;\n  & > .label {\n    font-weight: bold;\n  }\n  gap: 0;\n', origin: {file: 'f.ts', line: 5, name: 'Row'}}]);
  assert.deepEqual(map.map(m => [m.selector, m.origin.line]), [['.sc-Row', 6], ['.sc-Row > .label', 7], ['.sc-Row', 10]]);
});

test('lowerNested: comments do not split a run of declarations', () => {
  const {css} = lowerNested([{selector: '.a', text: 'color: red; /* note */ margin: 0;', origin: {file: 'f', line: 1, name: 'A'}}]);
  assert.equal(css, '.a{color:red;margin:0}');
});

test('lowerNested: origin.lines maps each text line to its template line (interpolations that spanned lines)', () => {
  // text line 1-4 came from template lines 10, 11, 13, 14 (line 12 was inside an interpolation)
  const {map} = lowerNested([{selector: '.a', text: '\n  padding: 8px;\n  & > .b {\n    color: red; }', origin: {file: 'f', line: 10, lines: [10, 11, 13, 14], name: 'A'}}]);
  assert.deepEqual(map.map(m => [m.selector, m.origin.line]), [['.a', 11], ['.a > .b', 13]]);
});

test('relocateSelectorWarnings: warnings of several variants of one template line are reported once', () => {
  const map = [
    {cssLine: 1, selector: '.sc-A-1:disabled', origin: {file: 'a.ts', line: 7, name: 'A'}, path: ['.sc-A-1', '&:disabled'], relation: null},
    {cssLine: 2, selector: '.sc-A-2:disabled', origin: {file: 'a.ts', line: 7, name: 'A'}, path: ['.sc-A-2', '&:disabled'], relation: null},
  ];
  const warnings = [
    {code: 'W_CSS_SELECTOR_UNMATCHED', selector: '.sc-A-2:disabled', line: 2, message: '.sc-A-2:disabled matches no element of the template (no element has class .sc-A-2)'},
    {code: 'W_CSS_SELECTOR_UNMATCHED', selector: '.sc-A-1:disabled', line: 1, message: '.sc-A-1:disabled matches no element of the template'},
  ];
  const out = relocateSelectorWarnings(warnings, map);
  assert.equal(out.length, 1);
  assert.equal(out[0].line, 7);
  assert.equal(out[0].variants, 2);
  assert.doesNotMatch(out[0].message, /no element has class/);
});

test('relocateFindings: a finding at a column of the lowered CSS is moved to the template line of that declaration', async () => {
  const {relocateFindings} = await import('../src/nested.mjs');
  const text = `
  border: 1px solid;
  border-top: 2px solid;
  & > .x {
    color: red;
    padding: 1px;
  }
`;
  const {css, map} = lowerNested([{selector: '.sc-A', text, origin: {file: 'styled.ts', line: 10, name: 'A'}}]);
  const lines = css.split('\n');
  // the lowered line and column of a declaration, as the core reports it (1-based)
  const at = (line, needle) => ({file: '<css>', line: line + 2, column: lines[line - 1].indexOf(needle) + 1});
  const findings = [
    {code: 'E_CSS_SHORTHAND_CONFLICT', css: at(1, 'border-top'), related: [{css: at(1, 'border:'), message: 'Earlier border'}]},
    {code: 'X', css: at(2, 'padding')},
    {code: 'Y', box: '.a'},
  ];
  const moved = relocateFindings(findings, map, {offset: 2});
  // template lines: the text's line k is origin.line + k - 1 (line 1 is the empty first line)
  assert.deepEqual(moved[0].css, {file: 'styled.ts', line: 12, column: 3});
  assert.equal(moved[0].component, 'A');
  assert.deepEqual(moved[0].related[0].css, {file: 'styled.ts', line: 11, column: 3});
  assert.equal(moved[1].css.line, 15);
  assert.deepEqual(moved[2], findings[2]);
});

test('lowerNested: an & inside a quoted attribute value is not the parent reference', () => {
  const {css, map} = lowerNested([{selector: '.sc-Card', text: '[data-label="A&B"] { color: red; }', origin: {file: 'f.ts', line: 1, name: 'Card'}}]);
  assert.equal(css, '.sc-Card [data-label="A&B"]{color:red}');
  assert.deepEqual(map[0].relation, {parent: '.sc-Card', combinator: ' ', child: '[data-label="A&B"]'});
});

test('lowerNested: @supports and @container wrap the rule like @media', () => {
  for (const [at, params] of [['supports', '(display: grid)'], ['container', 'card (min-width: 400px)']]) {
    const {css, map} = lowerNested([{selector: '.sc-A', text: `@${at} ${params} { display: grid; }`, origin: {file: 'f.ts', line: 1, name: 'A'}}]);
    assert.equal(css, `@${at} ${params}{.sc-A{display:grid}}`);
    assert.equal(map.length, 1);
    assert.equal(map[0].declarations[0].column, `@${at} ${params}{.sc-A{`.length + 1);
  }
  // nested wrappers: each its own block, @media conditions joined
  const {css} = lowerNested([{selector: '.sc-A', text: '@media (min-width: 1px) { @supports (gap: 0) { @media print { gap: 0; } } }', origin: {file: 'f.ts', line: 1, name: 'A'}}]);
  assert.equal(css, '@media (min-width: 1px){@supports (gap: 0){@media print{.sc-A{gap:0}}}}');
});

test('relocateSelectorWarnings: a warning on a page rule with the same selector as one lowered rule is left as it is', () => {
  const {map} = lowerNested([{selector: '.sc-A', text: '& > .x { color: red; }', origin: {file: 'a.ts', line: 3, name: 'A'}}]);
  // the lowered rule is at line 6 (5 page lines before it); the warning is on the page's own `.sc-A > .x` at line 1
  const w = {code: 'W_CSS_SELECTOR_RELATION', selector: '.sc-A > .x', line: 1, message: 'm'};
  assert.deepEqual(relocateSelectorWarnings([w], map, {offset: 5}), [w]);
  assert.equal(relocateSelectorWarnings([{...w, line: 6}], map, {offset: 5})[0].line, 3);
});

test('lowerNested: a declaration on the text\'s first line in a nested rule has its column in the template', () => {
  const {map} = lowerNested([{selector: '.sc-A', text: '& > .x { color:red; }', origin: {file: 'f.ts', line: 1, name: 'A'}}]);
  assert.equal(map[0].declarations[0].templateColumn, 10);
});
