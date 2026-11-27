# @mizchi/veriss-react

A React (JSX/TSX) adapter for `veriss`, with the style systems that leave a static stylesheet.

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
for the props each element passes. An element gets a stable class per component (`sc-Name-<hash of its module>`, what `${Other}` selectors
refer to) and one class per evaluated CSS. A literal prop is its value; any other prop expression is first evaluated in
the component (its props, the `const` bindings of its body, module tables and functions, `useTheme()`), and otherwise
is a condition when the template tests it (`$open ? … : …`, `$x && css```) and one of its values when the
component's props type is a literal union. Props types are read across modules (aliases, interfaces with `extends`,
intersections, unions of object types, `forwardRef<Ref, Props>` / `memo<Props>` / `React.FC<Props>`); an optional
member counts when it has a literal default. `{...rest}` on a styled element carries the props the component did not
destructure, `{...props}` all of them (read as absent, and reported, past `maxStates` variants). `theme` comes from
`options.theme`. Interpolation functions may use `if` / `switch` / `const`, call module functions (in their own
module), build objects, and use pure built-ins (`includes`, `slice`, `map`, `match`, `parseInt`, `Math.*`, …);
`keyframes``` is its generated name. Module constants, `css``` fragments and `${Other}` references are inlined;
nested rules are lowered with their template lines, so `selectors: true` reports `W_CSS_SELECTOR_RELATION` at the
line of the nested selector with the edge it assumes (`nesting: {path, relation}`).

*Dynamic values.* A declaration whose value depends on a prop that is not a literal (`width: ${({ $w }) => $w}`) is
a dynamic value. Declared in `options.dynamicValues` by `'Component.property'` (`{'Container.width': ['100px',
'auto']}`), each value is a state (choice `dynamic:Container.width`). Undeclared, it is kept as the placeholder
`-veriss-dynamic(id)`, which the core ranks in the cascade like any declaration: where a higher-ranked declaration
(importance, layer, specificity, order) beats it, it does not matter; where it wins, `E_LAYOUT_DYNAMIC_VALUE` names
the template line and the key to declare. A key may be a pattern (`*` matches any characters: `'*.width'`); an
exact key wins over patterns, and patterns are tried in order. The value `'ignore'` leaves that declaration out
unchecked, by choice: it is listed in the assumptions, not reported. Other Unknown values (a missing theme key, a call or statement the
evaluator does not follow) leave the declaration out and are reported (`U_STYLED_THEME`, `U_STYLED_VALUE`,
`U_STYLED_INTERPOLATION`).

`styled(Component)` of a function component (in this module or a resolved
one, forwardRef/memo included) renders that component with the generated classes as its `className` (taken through
`className`, `props.className` or a rest spread), the wrapper's children, and the props it was given: a condition on a
prop given as a literal is decided by it, one given as an expression is the wrapper's condition, and the component's
other conditions are named `Component:key`. `styled(Component)` of a package component, a dynamic `as`, other spreads
on a styled element and `.attrs` are Unknown.

Styled components, `css``` fragments and constants imported from other modules (`import * as Styled from './styled'`,
`<Styled.Container>`, `${trimVertical}` from a typography module) are read through `resolveModule(specifier,
importerFile) -> {file, source} | null`; each template is evaluated in the module that holds it, and its warnings carry
that module's file and line. `nodeModuleResolver()` (`@mizchi/veriss-react/resolve-node`) reads relative specifiers from the file
system with the usual extensions and index files; packages are not read. Without a resolver, an imported component is
Unknown and says so.

```js
import {nodeModuleResolver} from '@mizchi/veriss-react/resolve-node';
analyzeReact(source, {pageCSS, viewport, theme, file: '/abs/Card.tsx', resolveModule: nodeModuleResolver(), selectors: true});
```

Unknown: other components, `dangerouslySetInnerHTML`, dynamic `className`/`style` of other shapes, spreads other
than `stylex.props`, StyleX values that are not static literals, Linaria interpolations, early returns, more states
than `maxStates`.

Checks: `test/adapter.test.mjs` compares the expanded states with react-dom/server's markup (for StyleX, rendered
from StyleX's own compiler output); `e2e/layout-react.spec.mjs` lays the rendered states out in Chromium with
StyleX's compiled CSS and Linaria's nested templates and compares every box's position and size with the analysis.
