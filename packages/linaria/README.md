# veriss-linaria

Checks React components styled with [Linaria](https://linaria.dev/) (`css`` ` classes, `styled.tag`` ` components)
with `veriss`: every JSX branch as a state, every state over a range of viewport widths. It is a name for the React
adapter's Linaria path (`veriss-react`), which also reads StyleX and plain classNames; there is one implementation.

```sh
npm install -D veriss-linaria
npx veriss-linaria --viewport 320-1280 src/**/*.tsx
```

```
Wide.tsx:12  error    E_LAYOUT_ITEM_SIZE  .lx-bar.lx-wide requires 480px but receives 400px on inline axis at viewport 400px × 690px  [compact=false]
    fix: give the box room (a flexible track, max-width: 100%, min-width: 0) or let it shrink
```

`.js`, `.jsx`, `.ts` and `.tsx` files are read. The options and output are `css-lint`'s
([docs/component-lint.md](../../docs/component-lint.md)); the exit status is 1 when any error is reported, 2 on a usage
error.

```js
import {analyzeLinaria} from 'veriss-linaria';
import {lint, formatText} from 'veriss-adapter-core';
const result = analyzeLinaria(source, {pageCSS, viewport: {min: 320, max: 1280, height: {min: 480, max: 900}}, sourceLines: true});
console.log(formatText(lint(result, {file: 'Card.tsx', source})));
```

`analyzeLinaria` is `analyzeReact` ([veriss-react](../react-adapter/README.md)): its options, states and Unknowns are
described there. `nodeModuleResolver` reads the modules a component imports its styles from.
