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
