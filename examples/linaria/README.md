# veriss-linaria example

React components styled with [Linaria](https://linaria.dev/) with realistic mistakes (`src/broken/`) and their fixes
(`src/fixed/`), checked with [`veriss-linaria`](../../packages/linaria/README.md). The walkthrough, in Japanese, is
[docs/guide/linaria.md](../../docs/guide/linaria.md).

## Quick start

In your own project:

```sh
npm install -D veriss veriss-adapter-core veriss-react veriss-linaria
npx veriss-linaria --viewport 320-1280 src/**/*.tsx
```

In this repository (the example uses the workspace packages through `workspace:*`):

```sh
pnpm install
cd examples/linaria
pnpm run check:broken   # exits 1: prints expected.txt
pnpm run check          # exits 0: no error, no warning
```

The checker reads the source: it needs neither `@linaria/core` nor a build, so this example does not install them. A
component is checked on its own file; a child component imported from another file is not read by the CLI (an `info`
line, `U_REACT_COMPONENT`), so lint the child's file too. `info` lines are never a pass.

## The pairs

| Component | The mistake | Codes on the broken version |
|---|---|---|
| `Menu.tsx` | `& a` on the list styles the `<a>` that the child `<MenuLink>` renders | `E_SCOPE_REACHES`, `W_CSS_SELECTOR_UNMATCHED` |
| `MenuLink.tsx` | none of its own: in the fixed version it takes the padding `Menu` set from outside | — |
| `Notice.tsx` | `.theme-dark &`: the look depends on an ancestor outside the component | `E_SCOPE_OUTSIDE`, `W_CSS_SELECTOR_RELATION` |
| `PricingGrid.tsx` | `grid-template-columns: repeat(3, 200px)` | `E_LAYOUT_TRACKS`, `W_LAYOUT_FIXED_TRACKS` |
| `SearchForm.tsx` | a `<label>` not tied to its field, and `:global(body)` inside a component | `E_A11Y_LABEL`, `E_SCOPE_ESCAPE`, `W_CSS_SELECTOR_RELATION` |

`tests/examples.test.mjs` (in `pnpm test`) runs both scripts and holds `expected.txt` and this table to the real output.
