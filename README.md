# veriss

Static verification of responsive CSS over the DOM: layout (every viewport width at once, symbolically), accessibility, and CSS mistakes that the browser silently ignores — without rendering a page or running application code. Each check that reports a warning is measured in Chromium, Firefox and WebKit (`e2e/`).

Unknown is never turned into success: what the model does not cover is reported as Unknown with its reason.

**What it checks**: [the rule catalog](https://mizchi.github.io/veriss/) (Japanese) groups every check by role, says what can and cannot be checked, and shows each role with a detected (NG) and a corrected (OK) example as veriss judges them.

## Packages

| Package | Directory | |
| --- | --- | --- |
| `@mizchi/veriss` | `packages/veriss` | the core: HTML/box tree + CSS → layout, accessibility and CSS-mistake findings; Z3 verification; text metrics from font files |
| `@mizchi/veriss-adapter-core` | `packages/adapter-core` | shared component adapter: state expansion, analysis per state, lint findings |
| `@mizchi/veriss-react` | `packages/react-adapter` | React (JSX) with StyleX and Linaria |
| `@mizchi/veriss-vue` | `packages/vue-adapter` | Vue 3 SFC |
| `@mizchi/veriss-svelte` | `packages/svelte-adapter` | Svelte 5 |

Users: [mizchi/isle](https://github.com/mizchi/isle) checks its components' layout contracts with `@mizchi/veriss`.

## Install

`@mizchi/veriss` (the core) is on npm; the adapters are not published yet.

```sh
npm install @mizchi/veriss
```

[vlmkit](https://github.com/mizchi/vlmkit) runs it on rendered pages: `vlmkit check css <page>` hands veriss the DOM after the page's scripts ran and every stylesheet the page loaded.

## Use from git

For an unreleased commit, or an adapter, depend on a package directory with pnpm:

```json
{ "dependencies": { "@mizchi/veriss": "github:mizchi/veriss#<commit>&path:packages/veriss" } }
```

## Develop

```sh
pnpm install
pnpm build:text-metrics   # MoonBit (moon), only after changing text-metrics/; the build output is committed
pnpm build:oracle         # MoonBit, the differential cascade oracle used by tests
pnpm test                 # node --test, every package
pnpm test:e2e -- --project chromium   # browser checks (also firefox, webkit)
```

## Docs

- [Rule catalog](https://mizchi.github.io/veriss/) (`docs/rule-catalog.md`) — the checks by role, with NG / OK examples
- `docs/critical-css.md` — critical CSS: the rules the first view needs on usual phones and PCs (`@mizchi/veriss/critical`)
- `docs/adr/0018-coordinate-subset.md` — the coordinate subset L1 of Grid and Flex as an independent Z3 reference (`models/layout/`)
- `docs/static-check-checklist.md` — every CSS×DOM pattern, how it was measured
- `docs/layout-checking.md` — the layout model and its subset
- `docs/adr/` — design decisions
