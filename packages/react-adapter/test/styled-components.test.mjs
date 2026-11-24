import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {expandReact, analyzeReact} from '../src/index.mjs';

const fixture = name => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
const theme = {space: {card: '16px'}, colors: {text: '#222'}};
const pageCSS = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}';
const viewport = {min: 320, max: 800, height: {min: 600, max: 900}};
const classOf = (html, tag) => new RegExp(`<${tag} class="([^"]+)"`).exec(html)[1].split(' ');

test('styled-components: props driving interpolations are states; theme and constants are inlined', () => {
  const {states, css, unknowns} = expandReact(fixture('StyledCard.jsx'), {theme});
  assert.deepEqual(unknowns, []);
  // $emphasis and $open come from two props: 4 states
  assert.equal(states.length, 4);
  const open = states.find(s => s.choices.open === true && s.choices.emphasis === false);
  const closed = states.find(s => s.choices.open === false && s.choices.emphasis === false);
  // a stable class per component (for ${Title} selectors) and one per evaluated CSS
  const [bodyBase, bodyOpen] = classOf(open.html, 'div'), [, bodyClosed] = classOf(closed.html, 'div');
  assert.equal(bodyBase, 'sc-Body');
  assert.notEqual(bodyOpen, bodyClosed);
  assert.match(css, new RegExp(`\\.${bodyOpen}\\{height:120px\\}`));
  assert.match(css, new RegExp(`\\.${bodyClosed}\\{height:40px\\}`));
  const [, card] = classOf(open.html, 'section');
  assert.match(css, new RegExp(`\\.${card}\\{display:grid;grid-template-columns:minmax\\(0, 1fr\\);row-gap:8px;padding:16px;color:#222\\}`));
  // ${Title} is the component's stable class
  assert.match(css, new RegExp(`\\.${card} > \\.sc-Title\\{line-height:1.4\\}`));
  // $emphasis adds its declarations to the same rule (the css`` fragment is inlined where it is interpolated)
  const emphasised = states.find(s => s.choices.emphasis === true);
  assert.match(css, new RegExp(`\\.${classOf(emphasised.html, 'section')[1]}\\{[^}]*border:2px solid red\\}`));
  assert.doesNotMatch(css, new RegExp(`\\.${card}\\{[^}]*border`));
});

test('styled-components: a theme value that is not given is Unknown, and its declaration is left out', () => {
  const {css, unknowns} = expandReact(fixture('StyledCard.jsx'), {theme: {space: {card: '16px'}}});
  assert.ok(unknowns.some(u => u.code === 'U_STYLED_THEME' && /theme\.colors\.text/.test(u.message)), JSON.stringify(unknowns));
  assert.doesNotMatch(css, /color:/);
});

test('styled-components: a prop value that is not a literal is Unknown, and its declaration is left out', () => {
  const source = `import styled from 'styled-components';
const Box = styled.div\`
  height: \${({ height }) => height};
  width: 10px;
\`;
export default function B({ h }) { return <Box height={h} />; }`;
  const {css, unknowns} = expandReact(source);
  assert.ok(unknowns.some(u => u.code === 'U_STYLED_VALUE' && /height/.test(u.message)), JSON.stringify(unknowns));
  assert.match(css, /\{width:10px\}/);
  assert.doesNotMatch(css, /height/);
});

test('styled-components: a nested selector that disagrees with the markup is reported at its template line', () => {
  const source = `import styled from 'styled-components';
const Label = styled.span\`
  color: red;
\`;
const Row = styled.div\`
  display: flex;
  & > \${Label} {
    font-weight: bold;
  }
\`;
export default function R() { return <Row><div><Label>x</Label></div></Row>; }`;
  const report = analyzeReact(source, {pageCSS, viewport, selectors: true, file: 'Row.jsx'});
  const w = report.selectors.warnings.find(x => x.code === 'W_CSS_SELECTOR_RELATION');
  assert.ok(w, JSON.stringify(report.selectors.warnings));
  assert.equal(w.file, 'Row.jsx');
  assert.equal(w.line, 7);
  assert.equal(w.component, 'Row');
  assert.deepEqual(w.nesting.relation, {parent: w.nesting.path[0], combinator: '>', child: '.sc-Label'});
});

test('styled-components: every state has the structure styled-components itself renders (transient props not forwarded)', async () => {
  const {renderStyled} = await import('./ssr.mjs');
  const source = fixture('StyledCard.jsx');
  const shape = html => html.replace(/ class="[^"]*"/g, '').replace(/>\s+</g, '><').trim();
  const {states} = expandReact(source, {theme});
  for (const s of states) {
    const {html} = await renderStyled(source, {...s.choices, title: '…'}, theme);
    assert.equal(shape(html), shape(s.html), JSON.stringify(s.choices));
  }
});

const splitDir = new URL('../fixtures/styled-split/', import.meta.url);
const splitSource = name => readFileSync(new URL(name, splitDir), 'utf8');
// an in-memory resolver over the fixture directory (relative specifiers, .js added)
const splitResolver = (specifier) => {
  if (!specifier.startsWith('./')) return null;
  const file = `${specifier.slice(2)}.js`;
  try { return {file, source: splitSource(file)}; } catch { return null; }
};

test('styled-components across modules: namespace and named imports, imported fragments and constants', () => {
  const {states, css, unknowns} = expandReact(splitSource('Chip.jsx'), {file: 'Chip.jsx', resolveModule: splitResolver});
  assert.deepEqual(unknowns, []);
  assert.equal(states.length, 2);
  const large = states.find(s => s.choices.large === true);
  const [iconBase, iconLarge] = classOf(large.html, 'span');
  assert.equal(iconBase, 'sc-Icon');
  assert.match(css, new RegExp(`\\.${iconLarge}\\{display:block;width:24px;height:24px\\}`));
  assert.match(css, /\{line-height:1\.5;display:block;height:20px\}/);
  assert.match(css, /row-gap:8px/);
  assert.match(css, /> \.sc-Icon\{justify-self:start\}/);
});

test('styled-components across modules: a relation warning points into the module that holds the template', () => {
  const source = `import * as Styled from './styled';
export default function Bad() { return <Styled.Container><div><Styled.Icon $size="small" /></div></Styled.Container>; }`;
  const report = analyzeReact(source, {pageCSS, viewport, selectors: true, file: 'Bad.jsx', resolveModule: splitResolver});
  const w = report.selectors.warnings.find(x => x.code === 'W_CSS_SELECTOR_RELATION');
  assert.ok(w, JSON.stringify(report.selectors.warnings));
  assert.equal(w.file, 'styled.js');
  assert.equal(w.line, 22);
  assert.equal(w.component, 'Container');
});

test('styled-components across modules: without a resolver the imported component is Unknown and says what is missing', () => {
  const {unknowns} = expandReact(splitSource('Chip.jsx'));
  assert.ok(unknowns.some(u => /resolveModule/.test(u.message)), JSON.stringify(unknowns));
});

test('nodeModuleResolver: extensions and index files, relative to the importer', async () => {
  const {nodeModuleResolver} = await import('../src/resolve-node.mjs');
  const resolve = nodeModuleResolver();
  const importer = new URL('Chip.jsx', splitDir).pathname;
  const r = resolve('./typography', importer);
  assert.equal(r.file, new URL('typography.js', splitDir).pathname);
  assert.match(r.source, /trimVertical/);
  assert.equal(resolve('styled-components', importer), null);
  assert.equal(resolve('./missing', importer), null);
});

test('styled-components across modules: every state has the structure styled-components renders from the bundled modules', async () => {
  const {renderStyledFile} = await import('./ssr.mjs');
  const shape = html => html.replace(/ class="[^"]*"/g, '').replace(/>\s+</g, '><').trim();
  const {states} = expandReact(splitSource('Chip.jsx'), {file: 'Chip.jsx', resolveModule: splitResolver});
  for (const s of states) {
    const {html} = await renderStyledFile(new URL('Chip.jsx', splitDir).pathname, s.choices);
    assert.equal(shape(html), shape(s.html), JSON.stringify(s.choices));
  }
});

test('styled-components: an Unknown mixin in statement position is left out without breaking the declarations after it', () => {
  const source = `import styled from 'styled-components';
import { spacing } from './elsewhere';
const Rule = styled.hr\`
  \${spacing}
  width: \${({ vertical }) => (vertical ? '1px' : 'auto')};
  border: none;
\`;
export default function D({ v }) { return <Rule vertical={v} />; }`;
  const {states, css, unknowns} = expandReact(source);
  assert.equal(states.length, 2);
  assert.ok(unknowns.some(u => u.code === 'U_STYLED_INTERPOLATION' && /spacing/.test(u.message)), JSON.stringify(unknowns));
  assert.match(css, /\{width:1px;border:none\}/);
  assert.match(css, /\{width:auto;border:none\}/);
});

test('styled-components: a template CSS cannot read is Unknown, never an exception', () => {
  const source = `import styled from 'styled-components';
const Odd = styled.div\`
  color: red
  & { width: 10px
\`;
export default function O() { return <Odd />; }`;
  const {unknowns} = expandReact(source);
  assert.ok(unknowns.some(u => u.code === 'U_STYLED_CSS'), JSON.stringify(unknowns));
});

test('styled-components: // line comments are dropped as stylis does, but not inside url() or strings', () => {
  const source = `import styled from 'styled-components';
const A = styled.div\`
  transition: all 0.3s; // a note
  background: url(http://x.test/a.png);
  content: "a // b";
  color: red;
\`;
export default function C() { return <A />; }`;
  const {css, unknowns} = expandReact(source);
  assert.deepEqual(unknowns, []);
  assert.match(css, /\{transition:all 0\.3s;background:url\(http:\/\/x\.test\/a\.png\);content:"a \/\/ b";color:red\}/);
});

test('styled-components: an interpolation written over several lines keeps the template lines after it', () => {
  const source = `import styled from 'styled-components';
const Label = styled.span\`
  color: red;
\`;
const Row = styled.div\`
  padding: \${({ theme }) =>
    theme.space};
  & > \${Label} {
    font-weight: bold;
  }
\`;
export default function R() { return <Row><div><Label>x</Label></div></Row>; }`;
  const report = analyzeReact(source, {pageCSS, viewport, selectors: true, theme: {space: '8px'}, file: 'Row.jsx'});
  const w = report.selectors.warnings.find(x => x.code === 'W_CSS_SELECTOR_RELATION');
  assert.ok(w, JSON.stringify(report.selectors.warnings));
  assert.equal(w.line, 8);
});

test('styled-components: an Unknown mixin after a /* comment */ is still in statement position', () => {
  const source = `import styled from 'styled-components';
import { tone } from './elsewhere';
const A = styled.div\`
  position: relative;

  /* tone by type */
  \${tone}
  color: red;
\`;
export default function C() { return <A />; }`;
  const {css, unknowns} = expandReact(source);
  assert.ok(!unknowns.some(u => u.code === 'U_STYLED_CSS'), JSON.stringify(unknowns));
  assert.match(css, /position:relative;color:red/);
});
