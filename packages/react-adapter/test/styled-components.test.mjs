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
  assert.match(bodyBase, /^sc-Body-\w+$/);
  assert.notEqual(bodyOpen, bodyClosed);
  assert.match(css, new RegExp(`\\.${bodyOpen}\\{height:120px\\}`));
  assert.match(css, new RegExp(`\\.${bodyClosed}\\{height:40px\\}`));
  const [, card] = classOf(open.html, 'section');
  assert.match(css, new RegExp(`\\.${card}\\{display:grid;grid-template-columns:minmax\\(0, 1fr\\);row-gap:8px;padding:16px;color:#222\\}`));
  // ${Title} is the component's stable class
  assert.match(css, new RegExp(`\\.${card} > \\.sc-Title-\\w+\\{line-height:1.4\\}`));
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

test('styled-components: a prop value that is not a literal is a dynamic value (a placeholder), not an Unknown', () => {
  const source = `import styled from 'styled-components';
const Box = styled.div\`
  height: \${({ height }) => height};
  width: 10px;
\`;
export default function B({ h }) { return <Box height={h} />; }`;
  const {css, unknowns, dynamics} = expandReact(source);
  assert.deepEqual(unknowns, []);
  assert.match(css, /\{height:-veriss-dynamic\(0\);width:10px\}/);
  assert.equal(dynamics[0].key, 'Box.height');
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
  const {parent, combinator, child} = w.nesting.relation;
  assert.deepEqual([parent, combinator], [w.nesting.path[0], '>']);
  assert.match(child, /^\.sc-Label-\w+$/);
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
  assert.match(iconBase, /^sc-Icon-\w+$/);
  assert.match(css, new RegExp(`\\.${iconLarge}\\{display:block;width:24px;height:24px\\}`));
  assert.match(css, /\{line-height:1\.5;display:block;height:20px\}/);
  assert.match(css, /row-gap:8px/);
  assert.match(css, /> \.sc-Icon-\w+\{justify-self:start\}/);
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
  assert.match(states[0].html, /^<div class="sc-Box-\w+ sc-Card-\w+ sc-Box-\w+ sc-Card-\w+">x<\/div>$/);
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
  assert.match(off.html, /^<section><p class="sc-Wrap-\w+ sc-Wrap-\w+ sc-Danger-\w+ sc-Danger-\w+" aria-disabled="true">!<\/p><button class="sc-Primary-\w+ sc-Primary-\w+" type="button">Go<\/button><\/section>$/);
  assert.match(on.html, /<p class="sc-Wrap-\w+ sc-Wrap-\w+ sc-Danger-\w+ sc-Danger-\w+">!<\/p>/);
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

test('styled-components: a function body of if / return, switch (with fall-through) and const is evaluated per state', () => {
  const source = `import styled, { css } from 'styled-components';
const Box = styled.div\`
  color: \${({ $tone }) => {
    if ($tone === 'danger') return 'red';
    if ($tone === 'warn') { return 'orange'; } else if ($tone === 'never') return 'pink';
    return 'black';
  }};
  \${({ $tone }) => {
    switch ($tone) {
      case 'danger':
        return css\`border: 1px solid red;\`;
      case 'warn':
      case 'info': {
        const width = 2;
        return css\`border: \${width}px solid blue;\`;
      }
      default:
        break;
    }
  }}
\`;
type P = { tone: 'danger' | 'warn' | 'info' | 'none' };
export default function C({ tone }: P) { return <Box $tone={tone} />; }`;
  const {states, css, unknowns} = expandReact(source);
  assert.deepEqual(unknowns, []);
  const rule = tone => { const [, cls] = classOf(states.find(s => s.choices.tone === tone).html, 'div'); return new RegExp(`\\.${cls}\\{([^}]*)\\}`).exec(css)?.[1]; };
  assert.equal(rule('danger'), 'color:red;border:1px solid red');
  assert.equal(rule('warn'), 'color:orange;border:2px solid blue');
  assert.equal(rule('info'), 'color:black;border:2px solid blue');
  assert.equal(rule('none'), 'color:black');
});

test('styled-components: a statement the evaluator does not model makes that interpolation Unknown, naming the statement', () => {
  const source = `import styled from 'styled-components';
const Box = styled.div\`
  display: block;
  color: \${({ $on }) => { for (const x of []) {} return $on ? 'red' : 'blue'; }};
\`;
export default function C({ on }) { return <Box $on={on} />; }`;
  const {unknowns, css} = expandReact(source);
  assert.ok(unknowns.some(u => u.code === 'U_STYLED_INTERPOLATION' && /the statement for \(const x of \[\]\) \{\} is not modeled/.test(u.message)), JSON.stringify(unknowns));
  assert.match(css, /display:block/);
});

test('styled-components: a module function interpolated as ${helper} is called with the props (not taken for a component)', () => {
  const source = `import styled from 'styled-components';
const spacing = (p) => { return \`margin: \${p.$gap ? 8 : 0}px;\`; };
function border({ $gap }) { return $gap ? 'border: 1px solid;' : ''; }
const Box = styled.div\`
  \${spacing}
  \${border}
  display: block;
\`;
export default function C({ gap }) { return <Box $gap={gap} />; }`;
  const {states, css, unknowns} = expandReact(source);
  assert.deepEqual(unknowns, []);
  const rule = on => { const [, cls] = classOf(states.find(s => s.choices.gap === on).html, 'div'); return new RegExp(`\\.${cls}\\{([^}]*)\\}`).exec(css)?.[1]; };
  assert.equal(rule(true), 'margin:8px;border:1px solid;display:block');
  assert.equal(rule(false), 'margin:0px;display:block');
});

test('styled-components: module functions called with arguments (positional, destructured, defaulted, nested calls)', () => {
  const source = `import styled from 'styled-components';
const px = (n) => \`\${n * 4}px\`;
const step = ({ $size }) => ($size === 'small' ? 1 : 2);
function edge(width, style = 'solid') { const w = px(width); return \`\${w} \${style}\`; }
const Box = styled.div\`
  padding: \${(props) => px(step(props))};
  border: \${({ $size }) => edge($size === 'small' ? 1 : 3)};
\`;
type P = { size: 'small' | 'large' };
export default function C({ size }: P) { return <Box $size={size} />; }`;
  const {states, css, unknowns} = expandReact(source);
  assert.deepEqual(unknowns, []);
  const rule = size => { const [, cls] = classOf(states.find(s => s.choices.size === size).html, 'div'); return new RegExp(`\\.${cls}\\{([^}]*)\\}`).exec(css)?.[1]; };
  assert.equal(rule('small'), 'padding:4px;border:4px solid');
  assert.equal(rule('large'), 'padding:8px;border:12px solid');
});

test('styled-components: a call the evaluator cannot follow is Unknown with the call named', () => {
  const source = `import styled from 'styled-components';
const Box = styled.div\`
  color: \${() => pick('x')};
  display: block;
\`;
export default function C() { return <Box />; }`;
  const {unknowns, css} = expandReact(source);
  assert.equal(unknowns.length, 1);
  assert.match(unknowns[0].message, /pick/);
  assert.doesNotMatch(unknowns[0].message, /undefined$/);
  assert.match(css, /display:block/);
});

test('styled-components across modules: an imported helper runs in its own module (its constants and functions)', () => {
  const files = {
    'spacer.ts': `const UNIT = 4;
const side = (n) => n * UNIT;
export const spacer = (payload) => { const m = payload.m || 0; return \`margin: \${side(m)}px;\`; };`,
  };
  const resolveModule = spec => spec === './spacer' ? {file: 'spacer.ts', source: files['spacer.ts']} : null;
  const source = `import styled from 'styled-components';
import { spacer } from './spacer';
const Box = styled.div\`
  \${spacer}
  display: block;
\`;
export default function C() { return <Box m={2} />; }`;
  const {states, css, unknowns} = expandReact(source, {file: 'C.tsx', resolveModule});
  assert.deepEqual(unknowns, []);
  const [, cls] = classOf(states[0].html, 'div');
  assert.match(css, new RegExp(`\\.${cls}\\{margin:8px;display:block\\}`));
});

test('styled-components: objects built in interpolations hold any value; only a field that is read and Unknown is Unknown', () => {
  const source = `import styled, { css } from 'styled-components';
const scroll = ({ height = 'auto', maxHeight = 'none' }) => css\`height: \${height}; max-height: \${maxHeight};\`;
const config = (theme) => ({ light: { fg: theme.colors.text, glow: unknownHelper(1) }, dark: { fg: '#fff' } });
const Box = styled.div\`
  \${({ $max }) => scroll({ maxHeight: $max ? '40px' : undefined })}
  color: \${({ $variant, theme }) => config(theme)[$variant].fg};
\`;
type P = { variant: 'light' | 'dark'; max: boolean };
export default function C({ variant, max }: P) { return <Box $variant={variant} $max={max} />; }`;
  const {states, css, unknowns} = expandReact(source, {theme});
  assert.deepEqual(unknowns, []);
  const rule = (variant, max) => { const [, cls] = classOf(states.find(s => s.choices.variant === variant && s.choices.max === max).html, 'div'); return new RegExp(`\\.${cls}\\{([^}]*)\\}`).exec(css)?.[1]; };
  assert.equal(rule('light', true), 'height:auto;max-height:40px;color:#222');
  assert.equal(rule('dark', false), 'height:auto;max-height:none;color:#fff');
});

test('styled-components: Array / String includes on known values', () => {
  const source = `import styled from 'styled-components';
const Box = styled.div\`
  top: \${({ $pos }) => (['top-right', 'top-left'].includes($pos) ? '0' : 'auto')};
  left: \${({ $pos }) => ($pos.includes('left') ? '0' : 'auto')};
\`;
type P = { pos: 'top-right' | 'top-left' | 'bottom-left' };
export default function C({ pos }: P) { return <Box $pos={pos} />; }`;
  const {states, css, unknowns} = expandReact(source);
  assert.deepEqual(unknowns, []);
  const rule = pos => { const [, cls] = classOf(states.find(s => s.choices.pos === pos).html, 'div'); return new RegExp(`\\.${cls}\\{([^}]*)\\}`).exec(css)?.[1]; };
  assert.equal(rule('top-right'), 'top:0;left:auto');
  assert.equal(rule('top-left'), 'top:0;left:0');
  assert.equal(rule('bottom-left'), 'top:auto;left:0');
});

test('props types: a union of object types merges its members (never adds no value; a member some branch lacks is optional)', () => {
  const source = `import styled from 'styled-components';
type Base = { label: string };
type Overlay = Base & { layout?: 'overlay'; position?: 'top' | 'bottom' };
type Inline = Base & { layout: 'inline'; position?: never };
type Props = Overlay | Inline;
const Box = styled.div\`
  top: \${({ $position }) => ($position === 'top' ? '0' : 'auto')};
\`;
export default function C({ position = 'top', layout = 'overlay', label }: Props) { return <Box $position={position}>{label}</Box>; }`;
  const {states, unknowns} = expandReact(source);
  assert.deepEqual(unknowns, []);
  assert.deepEqual([...new Set(states.map(s => s.choices.position))].sort(), ['bottom', 'top']);
});

// Differential check against styled-components itself: every state's own declarations (the rule on the element's
// classes) are the ones styled-components writes for the same props.
test('styled-components evaluation agrees with styled-components itself, state by state', async () => {
  const {renderStyled} = await import('./ssr.mjs');
  const postcss = (await import('postcss')).default;
  const own = (css, html) => {
    const classes = (/class="([^"]*)"/.exec(html)?.[1] ?? '').split(' ');
    const decls = [];
    postcss.parse(css).walkRules(r => { if (r.parent.type === 'root' && r.selectors.some(sel => classes.some(c => sel.trim() === `.${c}`))) r.walkDecls(d => { if (d.parent === r) decls.push(`${d.prop}:${d.value.replace(/\s+/g, ' ').trim()}`); }); });
    return decls;
  };
  const corpus = [
    // statements: if / else, switch with fall-through, block-scoped const
    `import styled, { css } from 'styled-components';
const Box = styled.div\`
  color: \${({ $tone }) => { if ($tone === 'danger') return 'red'; else if ($tone === 'warn') { return 'orange'; } return 'black'; }};
  \${({ $tone }) => { switch ($tone) { case 'danger': return css\`border: 1px solid red;\`; case 'warn': case 'info': { const w = 2; return css\`border: \${w}px solid blue;\`; } default: break; } }}
\`;
type P = { tone: 'danger' | 'warn' | 'info' | 'none' };
export default function C({ tone }: P) { return <Box $tone={tone} />; }`,
    // module functions: interpolated, called with positional / destructured / defaulted arguments
    `import styled from 'styled-components';
const px = (n) => \`\${n * 4}px\`;
const step = ({ $size }) => ($size === 'small' ? 1 : 2);
function edge(width, style = 'solid') { const w = px(width); return \`\${w} \${style}\`; }
const spacing = (p) => \`margin: \${p.$size === 'small' ? 0 : 8}px;\`;
const Box = styled.div\`
  \${spacing}
  padding: \${(props) => px(step(props))};
  border: \${({ $size }) => edge($size === 'small' ? 1 : 3)};
\`;
type P = { size: 'small' | 'large' };
export default function C({ size }: P) { return <Box $size={size} />; }`,
    // objects with props and theme values, includes
    `import styled, { css } from 'styled-components';
const scroll = ({ height = 'auto', maxHeight = 'none' }) => css\`height: \${height}; max-height: \${maxHeight};\`;
const config = (theme) => ({ light: { fg: theme.colors.text }, dark: { fg: '#fff' } });
const Box = styled.div\`
  \${({ $variant }) => scroll({ maxHeight: $variant === 'dark' ? '40px' : undefined })}
  color: \${({ $variant, theme }) => config(theme)[$variant].fg};
  top: \${({ $variant }) => (['dark', 'dim'].includes($variant) ? '0' : 'auto')};
\`;
type P = { variant: 'light' | 'dark' };
export default function C({ variant }: P) { return <Box $variant={variant} />; }`,
    // built-ins and reassignment in a helper; JSX expressions evaluated in the component
    `import styled, { useTheme } from 'styled-components';
function hexToRgba(hex, alpha = 1) {
  let c = [0, 0, 0];
  let r = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (r) { c = r.slice(1, 4).map((x) => parseInt(x, 16)); }
  r = hex.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (r) { c = r.slice(1, 4).map((x) => 0x11 * parseInt(x, 16)); }
  return \`rgba(\${c[0]}, \${c[1]}, \${c[2]}, \${alpha})\`;
}
const DOT = { small: 4, large: 8 };
const Box = styled.div\`
  color: \${({ theme }) => hexToRgba(theme.colors.text, 0.5)};
  width: \${({ $w }) => (isNaN(+$w) ? $w : \`\${Math.max(+$w, 10)}px\`)};
  height: \${({ $h }) => $h}px;
\`;
type P = { w: '4' | 'auto'; size: 'small' | 'large' };
export default function C({ w, size }: P) { const dims = { h: DOT[size] * 2 }; return <Box $w={w} $h={dims.h} />; }`,
  ];
  for (const source of corpus) {
    const {states, css, unknowns} = expandReact(source, {theme});
    assert.deepEqual(unknowns, []);
    for (const s of states) {
      const real = await renderStyled(source, s.choices, theme);
      assert.ok(own(css, s.html).length > 0, `no declarations for ${JSON.stringify(s.choices)}`);
      assert.deepEqual(own(css, s.html), own(real.css, real.html), `${JSON.stringify(s.choices)}\n${source.split('\n')[2]}`);
    }
  }
});

test('styled props: JSX expressions are evaluated in the component (module tables, local consts, destructuring, module functions, useTheme)', () => {
  const source = `import styled from 'styled-components';
import { useTheme } from 'styled-components';
const DOT = { small: 4, large: 8 };
const tone = (name, theme) => (name === 'muted' ? theme.colors.text : '#c00');
const Box = styled.div\`
  width: \${({ $w }) => $w}px;
  height: \${({ $h }) => $h}px;
  color: \${({ $c }) => $c};
\`;
type P = { size: 'small' | 'large'; kind: 'muted' | 'alert'; };
export default function C({ size, kind }: P) {
  const theme = useTheme();
  const dims = { width: DOT[size], height: DOT[size] * 2 };
  const { width, height } = dims;
  return <Box $w={width} $h={height} $c={tone(kind, theme)} />;
}`;
  const {states, css, unknowns} = expandReact(source, {theme});
  assert.deepEqual(unknowns.map(u => u.message), []);
  const rule = (size, kind) => { const s = states.find(x => x.choices.size === size && x.choices.kind === kind); const [, cls] = classOf(s.html, 'div'); return new RegExp(`\\.${cls}\\{([^}]*)\\}`).exec(css)?.[1]; };
  assert.match(rule('small', 'muted'), /^width:4px;height:8px;color:#222$/);
  assert.match(rule('large', 'alert'), /^width:8px;height:16px;color:#c00$/);
});

test('styled-components: pure built-ins and reassignment in helpers (regex match, slice, map, parseInt, Math, isNaN, unary +)', () => {
  const source = `import styled from 'styled-components';
function hexToRgba(hex, alpha = 1) {
  let c = [0, 0, 0];
  let r = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (r) { c = r.slice(1, 4).map((x) => parseInt(x, 16)); }
  r = hex.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (r) { c = r.slice(1, 4).map((x) => 0x11 * parseInt(x, 16)); }
  return \`rgba(\${c[0]}, \${c[1]}, \${c[2]}, \${alpha})\`;
}
const Box = styled.div\`
  color: \${({ theme }) => hexToRgba(theme.colors.text, 0.5)};
  background: \${() => hexToRgba('#336699')};
  width: \${({ $w }) => (isNaN(+$w) ? $w : \`\${Math.max(+$w, 10)}px\`)};
\`;
type P = { w: '4' | 'auto' };
export default function C({ w }: P) { return <Box $w={w} />; }`;
  const {states, css, unknowns} = expandReact(source, {theme});
  assert.deepEqual(unknowns, []);
  const rule = w => { const [, cls] = classOf(states.find(s => s.choices.w === w).html, 'div'); return new RegExp(`\\.${cls}\\{([^}]*)\\}`).exec(css)?.[1]; };
  assert.equal(rule('4'), 'color:rgba(34, 34, 34, 0.5);background:rgba(51, 102, 153, 1);width:10px');
  assert.equal(rule('auto'), 'color:rgba(34, 34, 34, 0.5);background:rgba(51, 102, 153, 1);width:auto');
});

test('styled-components: a reassignment under a condition that splits states is Unknown (paths would share it)', () => {
  const source = `import styled from 'styled-components';
const Box = styled.div\`
  color: \${({ $on }) => { let c = 'blue'; if ($on) { c = 'red'; } return c; }};
  display: block;
\`;
export default function C({ on }) { return <Box $on={on} />; }`;
  const {unknowns} = expandReact(source);
  assert.ok(unknowns.some(u => /the statement c = 'red'/.test(u.message)), JSON.stringify(unknowns));
});

test('styled props: the component\'s rest spread carries every prop not destructured by name; {...props} carries all', () => {
  const source = `import styled from 'styled-components';
const Box = styled.div\`
  padding: \${({ size }) => (size === 'small' ? '4px' : '8px')};
  color: \${({ tone }) => tone ?? 'black'};
  border: \${({ $outlined }) => ($outlined ? '1px solid' : 'none')};
\`;
type P = { size: 'small' | 'large'; tone: string; outlined?: boolean };
export default function C({ tone, outlined, ...rest }: P) { return <Box {...rest} $outlined={outlined} />; }`;
  const {states, css, unknowns} = expandReact(source);
  // tone was destructured, so it is not in rest: undefined, the 'black' fallback. The DOM attributes rest carries
  // are still unknown (U_REACT_SPREAD); what the styles read is not.
  assert.deepEqual(unknowns.map(u => u.code), ['U_REACT_SPREAD']);
  const rule = (size, outlined) => { const [, cls] = classOf(states.find(s => s.choices.size === size && s.choices.outlined === outlined).html, 'div'); return new RegExp(`\\.${cls}\\{([^}]*)\\}`).exec(css)?.[1]; };
  assert.equal(rule('small', true), 'padding:4px;color:black;border:1px solid');
  assert.equal(rule('large', false), 'padding:8px;color:black;border:none');

  const all = `import styled from 'styled-components';
const Box = styled.div\`
  padding: \${({ size }) => (size === 'small' ? '4px' : '8px')};
\`;
type P = { size: 'small' | 'large' };
export default function C(props: P) { return <Box {...props} />; }`;
  const r = expandReact(all);
  assert.deepEqual(r.unknowns.map(u => u.code), ['U_REACT_SPREAD']);
  assert.equal(r.states.length, 2);
});

test('styled props: a spread of anything else is still Unknown', () => {
  const source = `import styled from 'styled-components';
const Box = styled.div\`padding: \${({ size }) => (size === 'small' ? '4px' : '8px')};\`;
export default function C({ extra }) { return <Box {...extra} />; }`;
  assert.ok(expandReact(source).unknowns.some(u => u.code === 'U_STYLED_PROPS'));
});

test('styled props: when the props a spread carries make more variants than maxStates, they are read as absent and reported', () => {
  const keys = Array.from({length: 8}, (_, i) => `k${i}`);
  const source = `import styled from 'styled-components';
const Box = styled.div\`
  ${keys.map(k => `\${({ ${k} }) => (${k} ? 'outline: 1px solid;' : '')}`).join('\n  ')}
  display: block;
\`;
export default function C({ label, ...rest }) { return <Box {...rest}>{label}</Box>; }`;
  const {states, unknowns} = expandReact(source, {maxStates: 16});
  assert.equal(states.length, 1);
  assert.ok(unknowns.some(u => u.code === 'U_STYLED_PROPS' && /more than 16/.test(u.message)), JSON.stringify(unknowns));
});

test('styled-components: keyframes`` is its generated name (a module const or inline); the declaration using it is kept', () => {
  const source = `import styled, { keyframes } from 'styled-components';
const spin = keyframes\`
  100% { transform: rotate(360deg); }
\`;
const Box = styled.div\`
  animation: \${spin} 1s linear infinite;
  display: block;
\`;
export default function C() { return <Box />; }`;
  const {states, css, unknowns} = expandReact(source);
  assert.deepEqual(unknowns, []);
  const [, cls] = classOf(states[0].html, 'div');
  assert.match(css, new RegExp(`\\.${cls}\\{animation:sc-keyframes-\\w+ 1s linear infinite;display:block\\}`));
  // the @keyframes rule is emitted under that name (otherwise the animation names nothing: W_CSS_KEYFRAMES_MISSING)
  const name = /animation:(sc-keyframes-\w+)/.exec(css)[1];
  assert.match(css, new RegExp(`@keyframes ${name}\\s*\\{\\s*100%\\s*\\{\\s*transform: rotate\\(360deg\\);?\\s*\\}\\s*\\}`));
  const report = analyzeReact(source, {pageCSS, viewport});
  assert.ok(!report.findings.some(f => f.code === 'W_CSS_KEYFRAMES_MISSING'), JSON.stringify(report.findings.map(f => f.code)));
});

const dynamicSource = `import styled from 'styled-components';
const Box = styled.div\`
  display: block;
  width: \${({ $w }) => $w};
\`;
export default function C({ w }: { w: string }) { return <Box $w={w} />; }`;

test('dynamic values: an undeclared one is kept as a placeholder the cascade ranks, not dropped as Unknown', () => {
  const {css, unknowns, dynamics} = expandReact(dynamicSource);
  assert.deepEqual(unknowns, []);
  assert.match(css, /\{display:block;width:-veriss-dynamic\(0\)\}/);
  assert.equal(dynamics.length, 1);
  assert.equal(dynamics[0].key, 'Box.width');
  assert.match(dynamics[0].message, /the value of \$w/);
});

test('dynamic values: declared ones (options.dynamicValues) are each a state', () => {
  const {states, css, unknowns} = expandReact(dynamicSource, {dynamicValues: {'Box.width': ['100px', 'auto']}});
  assert.deepEqual(unknowns, []);
  assert.deepEqual(states.map(s => s.choices['dynamic:Box.width']).sort(), ['100px', 'auto']);
  assert.match(css, /\{display:block;width:100px\}/);
  assert.match(css, /\{display:block;width:auto\}/);
});

test('dynamic values: one that wins the cascade is an error asking for its declaration; one beaten by a higher rule is not', () => {
  const wins = analyzeReact(dynamicSource, {pageCSS, viewport});
  const f = wins.findings.find(x => x.code === 'E_LAYOUT_DYNAMIC_VALUE');
  assert.ok(f, JSON.stringify(wins.findings));
  assert.equal(wins.status, 'violated');
  assert.match(f.message, /dynamicValues\['Box\.width'\]/);
  assert.equal(f.css?.line, 4);
  const beaten = analyzeReact(dynamicSource, {pageCSS: `${pageCSS}div{width:100px!important}`, viewport});
  assert.ok(!beaten.findings.some(x => x.code === 'E_LAYOUT_DYNAMIC_VALUE'), JSON.stringify(beaten.findings));
  assert.notEqual(beaten.status, 'violated');
  const declared = analyzeReact(dynamicSource, {pageCSS, viewport, dynamicValues: {'Box.width': ['100px', 'auto']}});
  assert.ok(!declared.findings.some(x => x.code === 'E_LAYOUT_DYNAMIC_VALUE'));
});

test('dynamic values: only those in the CSS the states render are listed (not those of an evaluation that was dropped)', () => {
  const keys = Array.from({length: 8}, (_, i) => `k${i}`);
  const source = `import styled from 'styled-components';
const Box = styled.div\`
  ${keys.map(k => `\${({ ${k} }) => (${k} ? 'outline: 1px solid;' : '')}`).join('\n  ')}
  width: \${({ w }) => w};
\`;
export default function C({ label, ...rest }) { return <Box {...rest}>{label}</Box>; }`;
  const {css, dynamics} = expandReact(source, {maxStates: 16});
  assert.equal(dynamics.length, (css.match(/-veriss-dynamic\(/g) ?? []).length);
  for (const d of dynamics) assert.ok(css.includes(`-veriss-dynamic(${d.id})`));
});

test('dynamic values: keys may be patterns (*), and a value of "ignore" leaves the declaration out as an assumption', () => {
  const pattern = expandReact(dynamicSource, {dynamicValues: {'B*.width': ['10px']}});
  assert.deepEqual(pattern.states.map(s => s.choices['dynamic:Box.width']), ['10px']);
  const ignored = analyzeReact(dynamicSource, {pageCSS, viewport, dynamicValues: {'*.width': 'ignore'}});
  assert.ok(!ignored.findings.some(x => x.code === 'E_LAYOUT_DYNAMIC_VALUE'));
  assert.ok(ignored.coverage.assumptions.some(a => /ignored.*Box\.width/.test(a)), JSON.stringify(ignored.coverage.assumptions));
  // an exact key wins over a pattern
  const both = expandReact(dynamicSource, {dynamicValues: {'*.width': 'ignore', 'Box.width': ['5px']}});
  assert.match(both.css, /width:5px/);
});

test('findings in the styled CSS (a shorthand conflict) are reported at the template lines of both declarations', () => {
  const source = `import styled from 'styled-components';
const Box = styled.div\`
  border: 1px solid;
  border-top: 2px solid;
\`;
export default function C() { return <Box />; }`;
  // through an adapter it is a warning (CSS not written to that rule) at both declarations, and the layout is analysed
  const report = analyzeReact(source, {pageCSS, viewport, file: 'Box.tsx'});
  const w = report.findings.find(x => x.code === 'W_CSS_SHORTHAND_CONFLICT');
  assert.ok(w, JSON.stringify(report.findings));
  assert.equal(w.severity, 'warning');
  assert.deepEqual(w.css.map(c => [c.property, c.file, c.line]), [['border-top', 'Box.tsx', 4], ['border', 'Box.tsx', 3]]);
  assert.equal(w.component, 'Box');
  assert.notEqual(report.status, 'violated');
  // shorthandConflicts: 'error' keeps the rule's own policy
  const strict = analyzeReact(source, {pageCSS, viewport, file: 'Box.tsx', shorthandConflicts: 'error'});
  const f = strict.findings.find(x => x.code === 'E_CSS_SHORTHAND_CONFLICT');
  assert.ok(f, JSON.stringify(strict.findings));
  assert.equal(f.css.line, 4);
  assert.equal(f.related?.[0]?.css?.line, 3);
  assert.equal(strict.status, 'violated');
});

test('selectors: a template rule is unmatched only when no variant of it matches (a variant rendered only when enabled does not make &:disabled dead)', () => {
  const source = `import styled from 'styled-components';
const Box = styled.button\`
  color: \${({ $c }) => $c};
  &:disabled {
    cursor: not-allowed;
  }
\`;
export default function C({ disabled }) { return <Box $c={disabled ? 'gray' : 'black'} disabled={disabled} />; }`;
  const report = analyzeReact(source, {pageCSS, viewport, selectors: true, file: 'C.tsx'});
  assert.ok(!report.selectors.warnings.some(w => w.code === 'W_CSS_SELECTOR_UNMATCHED'), JSON.stringify(report.selectors.warnings.map(w => w.message)));
  // when no variant matches it, the line is reported once
  const never = source.replace('disabled={disabled} />', '/>');
  const w = analyzeReact(never, {pageCSS, viewport, selectors: true, file: 'C.tsx'}).selectors.warnings.filter(x => x.code === 'W_CSS_SELECTOR_UNMATCHED');
  assert.equal(w.length, 1);
  assert.equal(w[0].line, 4);
});

test('styled-components: two modules that each declare Icon get different stable classes, so ${Icon} matches only its own', () => {
  const files = {
    a: `import styled from 'styled-components';
export const Icon = styled.span\`
  width: 10px;
\`;`,
    b: `import styled from 'styled-components';
export const Icon = styled.i\`
  width: 20px;
\`;
export const Row = styled.div\`
  & > \${Icon} { display: none; }
\`;`,
  };
  const source = `import { Icon as A } from './a';
import { Icon as B, Row } from './b';
export default function C() { return <Row><A /><B /></Row>; }`;
  const {states, css, unknowns} = expandReact(source, {file: 'C.jsx', resolveModule: memoryResolver(files)});
  assert.deepEqual(unknowns, []);
  const [stableA] = classOf(states[0].html, 'span'), [stableB] = classOf(states[0].html, 'i');
  assert.notEqual(stableA, stableB);
  assert.match(css, new RegExp(`> \\.${stableB}\\{display:none\\}`));
  assert.ok(!css.includes(`.${stableA}{display:none}`), css);
});

test('styled-components: a literal-union prop tested for truthiness keeps its values (no size=true / size=false states)', () => {
  const source = `import styled from 'styled-components';
const Box = styled.div\`
  width: \${p => (p.$size ? p.$size : 'auto')};
\`;
export default function C({ size }: { size: 'sm' | 'lg' }) { return <Box $size={size} />; }`;
  const {states, css, unknowns} = expandReact(source);
  assert.deepEqual(unknowns, []);
  assert.deepEqual(states.map(s => s.choices.size).sort(), ['lg', 'sm']);
  for (const s of states) assert.match(css, new RegExp(`\\.${classOf(s.html, 'div')[1]}\\{width:${s.choices.size}\\}`));
});

test('styled-components: a member of a namespace import (tokens.gap) is read from that module', () => {
  const files = {tokens: `export const gap = '8px';`};
  const source = `import styled from 'styled-components';
import * as tokens from './tokens';
const Box = styled.div\`
  gap: \${tokens.gap};
  margin: \${tokens.missing};
\`;
export default function C() { return <Box />; }`;
  const {css, unknowns} = expandReact(source, {file: 'C.jsx', resolveModule: memoryResolver(files)});
  assert.match(css, /\{gap:8px\}/);
  assert.ok(unknowns.some(u => u.code === 'U_STYLED_INTERPOLATION' && /tokens\.missing/.test(u.message)), JSON.stringify(unknowns));
});

test('styled-components: `a && b` with a falsy a is a (0 is written, as styled-components writes it)', async () => {
  const {renderStyled} = await import('./ssr.mjs');
  const source = `import styled from 'styled-components';
const Box = styled.div\`
  width: \${p => p.$n && '10px'};
  height: \${p => p.$size && p.$size};
\`;
export default function C({ size }: { size: '' | '4px' }) { return <Box $n={0} $size={size} />; }`;
  const {states, css, unknowns} = expandReact(source);
  assert.deepEqual(unknowns, []);
  assert.equal(states.length, 2);
  for (const s of states) {
    const ours = new RegExp(`\\.${classOf(s.html, 'div')[1]}\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    const real = (await renderStyled(source, s.choices)).css.match(/\{([^}]*)\}/)?.[1].replace(/;$/, '') ?? '';
    assert.equal(ours, real, JSON.stringify(s.choices));
  }
});
