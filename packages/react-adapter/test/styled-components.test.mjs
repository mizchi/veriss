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
  // structure without class values and without the adapter's boundary annotations (comments, not DOM)
  const shape = html => html.replace(/ class="[^"]*"/g, '').replace(/<!--isle-boundary:[^>]*-->/g, '').replace(/>\s+</g, '><').trim();
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

test('styled-components: a multi-line interpolation followed by a unit keeps the value whole (8px, not 8 px)', () => {
  const source = `import styled from 'styled-components';
const A = styled.div\`
  margin-bottom: \${({ theme }) =>
    theme.space}px;
  color: red;
\`;
export default function C() { return <A />; }`;
  const {css} = expandReact(source, {theme: {space: 8}});
  assert.match(css, /\{margin-bottom:8px;color:red\}/);
});

test('styled-components: a declaration left empty by its interpolation is dropped, as stylis does', () => {
  const source = `import styled from 'styled-components';
const A = styled.div\`
  height: \${({ $h }) => $h};
  color: red;
\`;
export default function C() { return <A />; }`;
  const {css, unknowns} = expandReact(source);
  assert.deepEqual(unknowns, []);
  assert.match(css, /\{color:red\}/);
  assert.doesNotMatch(css, /height/);
});

test('styled-components: a JS template string renders undefined as "undefined", as JavaScript does', () => {
  const source = `import styled from 'styled-components';
const A = styled.div\`
  width: \${({ size }) => \`\${size}px\`};
\`;
export default function C() { return <A />; }`;
  const {css} = expandReact(source);
  assert.match(css, /width:undefinedpx/);
});

// in-memory modules: './name' -> name.js
const memoryResolver = files => specifier => {
  const name = specifier.replace(/^\.\.?\//, '').replace(/\/index$/, '');
  return files[name] === undefined ? null : {file: `${name}.js`, source: files[name]};
};

test('styled-components across modules: default exports, re-exports and export * are followed', () => {
  const files = {
    Box: `import styled from 'styled-components';
const Box = styled.div\`
  display: flex;
\`;
export default Box;`,
    box: `export { default } from './Box';`,
    tokens: `export const pad = '4px';`,
    theme: `export * from './tokens';
export { pad as padding } from './tokens';`,
    styled: `import styled from 'styled-components';
import Box from './box';
import { padding } from './theme';
export const Card = styled(Box)\`
  padding: \${padding};
\`;`,
  };
  const source = `import { Card } from './styled';
export default function C() { return <Card>x</Card>; }`;
  const {states, css, unknowns} = expandReact(source, {file: 'C.jsx', resolveModule: memoryResolver(files)});
  assert.deepEqual(unknowns, []);
  assert.match(states[0].html, /^<div class="sc-Box sc-Card sc-Box-\w+ sc-Card-\w+">x<\/div>$/);
  assert.match(css, /\{display:flex\}/);
  assert.match(css, /\{padding:4px\}/);
});

const baseDir = new URL('../fixtures/styled-base/', import.meta.url);
const baseResolver = specifier => {
  if (!specifier.startsWith('./')) return null;
  for (const ext of ['.js', '.jsx']) { try { const file = `${specifier.slice(2)}${ext}`; return {file, source: readFileSync(new URL(file, baseDir), 'utf8')}; } catch {} }
  return null;
};

test('styled(Component): the component is expanded with the generated classes and the props passed to it', () => {
  const {states, css, unknowns} = expandReact(readFileSync(new URL('Panel.jsx', baseDir), 'utf8'), {file: 'Panel.jsx', resolveModule: baseResolver});
  assert.deepEqual(unknowns, []);
  assert.equal(states.length, 2); // off: the outer condition decides the inner branch
  const off = states.find(s => s.choices.off === true), on = states.find(s => s.choices.off === false);
  assert.match(off.html, /^<section><p class="sc-Wrap sc-Wrap-\w+ sc-Danger sc-Danger-\w+" aria-disabled="true">!<\/p><button class="sc-Primary sc-Primary-\w+" type="button">Go<\/button><\/section>$/);
  assert.match(on.html, /<p class="sc-Wrap sc-Wrap-\w+ sc-Danger sc-Danger-\w+">!<\/p>/);
  assert.match(css, /\{color:red\}/);
  assert.match(css, /\{margin:0;height:20px\}/);
  assert.match(css, /\{display:block;height:32px\}/);
});

test('styled(Component): every state has the structure styled-components renders', async () => {
  const {renderStyledFile} = await import('./ssr.mjs');
  const shape = html => html.replace(/ class="[^"]*"/g, '').replace(/>\s+</g, '><').trim();
  const {states} = expandReact(readFileSync(new URL('Panel.jsx', baseDir), 'utf8'), {file: 'Panel.jsx', resolveModule: baseResolver});
  for (const s of states) {
    const {html} = await renderStyledFile(new URL('Panel.jsx', baseDir).pathname, s.choices);
    assert.equal(shape(html), shape(s.html), JSON.stringify(s.choices));
  }
});

test('styled-components: CSS is emitted only for the variants some state renders', () => {
  // $tone has two values, but the element's other condition fixes which one survives in each state
  const source = `import styled from 'styled-components';
const A = styled.span\`
  color: \${({ $on }) => ($on ? 'red' : 'blue')};
\`;
export default function C({ on }) { return on ? <A $on={on} /> : <i />; }`;
  const {states, css} = expandReact(source);
  const used = new Set(states.flatMap(s => [...s.html.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(' '))));
  for (const [, cls] of css.matchAll(/\.(sc-[\w-]+)\{/g)) assert.ok(used.has(cls), `${cls} is in the CSS but in no state`);
  assert.doesNotMatch(css, /color:blue/);
});

test('styled-components: `as` is not written to the DOM', () => {
  const source = `import styled from 'styled-components';
const A = styled.button\`
  color: red;
\`;
export default function C({ tag }) { return <A as={tag}>x</A>; }`;
  const {states, unknowns} = expandReact(source);
  assert.ok(unknowns.some(u => u.code === 'U_STYLED_AS'));
  assert.doesNotMatch(states[0].html, / as=/);
});

const typedDir = new URL('../fixtures/typed-props/', import.meta.url);
const typedSource = name => readFileSync(new URL(name, typedDir), 'utf8');
const typedResolver = (specifier) => {
  if (!specifier.startsWith('./')) return null;
  const file = `${specifier.slice(2)}.ts`;
  try { return {file, source: typedSource(file)}; } catch { return null; }
};

test('props types across modules: forwardRef<Ref, Props>, an imported interface with extends, an imported union alias and a defaulted optional prop', () => {
  const {states, css, unknowns, assumptions} = expandReact(typedSource('Banner.tsx'), {file: 'Banner.tsx', resolveModule: typedResolver});
  assert.deepEqual(unknowns, []);
  // tone: 'info' | 'danger' (via extends and export type { } from), size: 'small' | 'medium' (optional, default 'medium')
  assert.deepEqual(states.map(s => `${s.choices.tone}/${s.choices.size}`).sort(), ['danger/medium', 'danger/small', 'info/medium', 'info/small']);
  assert.match(css, /\{display:grid;padding:8px;color:#c00\}/);
  assert.match(css, /\{display:grid;padding:16px;color:#036\}/);
  assert.ok(assumptions.some(a => /literal unions \((?=.*tone)(?=.*size)/.test(a)), JSON.stringify(assumptions));
});

test('props types across modules: React.FC<Props> on the declaration and an intersection type', () => {
  const {states, unknowns} = expandReact(typedSource('Pill.tsx'), {file: 'Pill.tsx', resolveModule: typedResolver});
  assert.deepEqual(unknowns, []);
  assert.equal(states.length, 4);
});

test('props types: an optional literal-union prop without a default stays optional (not a choice of its values)', () => {
  const source = `type Size = 'a' | 'b';\nexport default function C({ size }: { size?: Size }) { return <p>{size}</p>; }`;
  assert.deepEqual(expandReact(source).states.map(s => s.html), ['<p>…</p>']);
});
