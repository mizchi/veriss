// ADR-0016 M2: the import direction between modules. A module may import only what its row allows; an edge not listed
// fails the test. The list for the existing modules records today's edges and shrinks as the migration (M3-M8) goes on.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {join, dirname, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const files = dir => readdirSync(join(src, dir), {withFileTypes: true}).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.mjs') ? [join(dir, e.name)] : []);
const importsOf = file => [...readFileSync(join(src, file), 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s*['"](\.[^'"]+)['"]/g)].map(m => relative(src, resolve(dirname(join(src, file)), m[1])));

// Pure tools: they import nothing of veriss.
const pure = ['color/index.mjs', 'layout/dropped.mjs', 'layout/linear.mjs', 'layout/calc-syntax.mjs', 'layout/font-syntax.mjs', 'layout/grid-syntax.mjs', 'layout/keyword-syntax.mjs', 'layout/timing-syntax.mjs', 'layout/background-syntax.mjs', 'layout/size-keyword-syntax.mjs', 'layout/name-syntax.mjs', 'layout/smt.mjs', 'layout/easing.mjs', 'layout/simple-selector.mjs'];

test('pure tools import nothing of veriss', () => {
  for (const file of pure) assert.deepEqual(importsOf(file), [], file);
});

test('color/ is used by the rules that judge colors and by the syntax stage (to read a color as the browser does)', () => {
  const users = files('.').filter(file => !file.startsWith('color/') && importsOf(file).some(target => target.startsWith('color/')));
  assert.deepEqual(users.sort(), ['layout/accessibility.mjs', 'layout/css.mjs', 'rules/contrast.mjs']);
});

test('the syntax validators are imported only by the syntax stage (layout/css.mjs)', () => {
  for (const validator of ['layout/calc-syntax.mjs', 'layout/font-syntax.mjs', 'layout/grid-syntax.mjs', 'layout/keyword-syntax.mjs', 'layout/timing-syntax.mjs', 'layout/background-syntax.mjs', 'layout/size-keyword-syntax.mjs', 'layout/name-syntax.mjs'])
    assert.deepEqual(files('.').filter(file => importsOf(file).includes(validator)), ['layout/css.mjs'], validator);
});

test('rules/ reads facts only: it imports no stage (layout/) module', () => {
  for (const file of files('rules')) assert.deepEqual(importsOf(file).filter(target => target.startsWith('layout/')), [], file);
});

test('the syntax stage hands its findings over as one list of notes (M3): no warning-only array is destructured by the engine', () => {
  const engine = readFileSync(join(src, 'layout/engine.mjs'), 'utf8');
  for (const name of ['mediaVar', 'fontInvalid', 'counterUnused', 'calcSpacing', 'importIgnored', 'duplicateDeclarations']) assert.ok(!new RegExp(`\\b${name}\\b`).test(engine), name);
});

test('the style stage records dropped declarations in one list (M4): no per-case $...Inert mark is left', () => {
  for (const file of files('.')) assert.deepEqual(readFileSync(join(src, file), 'utf8').match(/\$[a-zA-Z]+Inert\b/g) ?? [], [], file);
});

test('the CSS-mistake checks live in rules/css-mistakes.mjs (M5): they import nothing, and the engine no longer defines them', () => {
  assert.deepEqual(importsOf('rules/css-mistakes.mjs'), []);
  const engine = readFileSync(join(src, 'layout/engine.mjs'), 'utf8');
  for (const name of ['cssMistakes', 'firstPseudoInert', 'inlineAutoMargin', 'pseudoWithoutContent', 'tableRowRadius', 'aspectInert', 'contentsInert']) assert.ok(!new RegExp(`function ${name}\\(`).test(engine), name);
});

test('the inert-declaration checks live in rules/inert-declarations.mjs (M6): they import nothing, and the layout only hands over facts', () => {
  assert.deepEqual(importsOf('rules/inert-declarations.mjs'), []);
  const engine = readFileSync(join(src, 'layout/engine.mjs'), 'utf8');
  assert.ok(!/\breasons\.push\(/.test(engine), 'reasons.push');
  // (W_LAYOUT_DECLARATION_INERT is still reported where the layout rewrites the style it reports: a percentage height to
  // auto, auto block margins to 0.)
  for (const code of ['W_LAYOUT_SCROLL_NEVER', 'W_LAYOUT_CONTENT_VISIBILITY_SIZE', 'W_LAYOUT_SVG_UNSIZED', 'W_LAYOUT_EMBED_NO_RATIO', 'W_LAYOUT_CONTAINER_COLLAPSE'])
    assert.ok(!new RegExp(`code: '${code}'`).test(engine), code);
});

test('the style checks run in one walk (M6): the layout does not call them, and no second walk runs where it is Unknown', () => {
  const engine = readFileSync(join(src, 'layout/engine.mjs'), 'utf8');
  assert.ok(!/\bwalkStyles\b/.test(engine));
  for (const name of ['cssMistakes', 'pseudoWithoutContent', 'inlineStateTransforms', 'inlineTextAlignment', 'inlineAutoMargin', 'inlineOverflow', 'decorationNone'])
    assert.equal(engine.match(new RegExp(`\\b${name}\\(`, 'g'))?.length, 1, name);
});

test('the contrast checks live in rules/contrast.mjs (M7): they import color/ only, and the accessibility judge no longer computes a text ratio', () => {
  assert.deepEqual(importsOf('rules/contrast.mjs'), ['color/index.mjs']);
  const judge = readFileSync(join(src, 'layout/accessibility.mjs'), 'utf8');
  for (const code of ['E_A11Y_CONTRAST', 'W_A11Y_IMAGE_FALLBACK_CONTRAST', 'E_A11Y_ICON_CONTRAST', 'W_A11Y_CARET_HIDDEN'])
    assert.ok(!judge.includes(`'${code}'`), code);
});
