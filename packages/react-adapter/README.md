# @mizchi/veriss-react

A React (JSX/TSX) adapter for `@mizchi/veriss`, with the style systems that leave a static stylesheet.

```js
import {analyzeReact} from '@mizchi/veriss-react';
analyzeReact(source, {pageCSS, viewport, accessibility: true});            // StyleX or Linaria in the module
analyzeReact(source, {pageCSS, viewport, css: readFileSync('app.css', 'utf8')}); // plain classNames
```

| JSX | Choices |
|---|---|
| `{cond && <X/>}`, `{cond ? <A/> : <B/>}` | `cond` true / false |
| `{xs.map(x => <Li/>)}` | item counts `eachCounts` (default 0, 1, 2) |
| `className={cond ? 'a' : 'b'}`, `cx(a, cond && b, {c: d})` | each condition true / false |
| `{...stylex.props(s.a, cond && s.b, c ? s.d : s.e)}` | each condition true / false |
| `attr={cond ? 'a' : 'b'}` | `cond` true / false |

**StyleX**: `stylex.create` objects are read statically; `stylex.props(...)` merges per property with the later
argument winning (StyleX's rule, independent of definition order), including condition objects (`default`,
`':hover'`, `'@media …'`). Each element state gets one class with its merged declarations.
**Linaria**: `css```, `styled.tag``` become a class per template in definition order; `&` nesting and `@media`
blocks are flattened.

**styled-components** (imported from `styled-components`): a `styled.tag` / `styled(Styled)` template is evaluated
for the props each element passes. An element gets a stable class per component (`sc-Name`, what `${Other}` selectors
refer to) and one class per evaluated CSS. A literal prop is its value; any other prop expression is a condition when the
template tests it (`$open ? … : …`, `$x && css```), one of its values when the component's props type is a literal
union, and Unknown when its value is written into a declaration. `theme` comes from `options.theme`. Module constants,
`css``` fragments and `${Other}` references are inlined; nested rules are lowered with their template lines, so
`selectors: true` reports `W_CSS_SELECTOR_RELATION` at the line of the nested selector with the edge it assumes
(`nesting: {path, relation}`). A declaration with an Unknown value is left out and reported (`U_STYLED_THEME`,
`U_STYLED_VALUE`, `U_STYLED_INTERPOLATION`); `styled(Component)` of a non-styled component, `as`, spreads and `.attrs`
are Unknown.

Styled components, `css``` fragments and constants imported from other modules (`import * as Styled from './styled'`,
`<Styled.Container>`, `${trimVertical}` from a typography module) are read through `resolveModule(specifier,
importerFile) -> {file, source} | null`; each template is evaluated in the module that holds it, and its warnings carry
that module's file and line. `nodeModuleResolver()` (`src/resolve-node.mjs`) reads relative specifiers from the file
system with the usual extensions and index files; packages are not read. Without a resolver, an imported component is
Unknown and says so.

```js
import {nodeModuleResolver} from '@mizchi/veriss-react/src/resolve-node.mjs';
analyzeReact(source, {pageCSS, viewport, theme, file: '/abs/Card.tsx', resolveModule: nodeModuleResolver(), selectors: true});
```

Unknown: other components, `dangerouslySetInnerHTML`, dynamic `className`/`style` of other shapes, spreads other
than `stylex.props`, StyleX values that are not static literals, Linaria interpolations, early returns, more states
than `maxStates`.

Checks: `test/adapter.test.mjs` compares the expanded states with react-dom/server's markup (for StyleX, rendered
from StyleX's own compiler output); `e2e/layout-react.spec.mjs` lays the rendered states out in Chromium with
StyleX's compiled CSS and Linaria's nested templates and compares every box's position and size with the analysis.
