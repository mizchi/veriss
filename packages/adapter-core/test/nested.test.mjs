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
