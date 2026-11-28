# veriss-svelte example

Svelte 5 components with realistic mistakes (`src/broken/`) and their fixes (`src/fixed/`), checked with
[`veriss-svelte`](../../packages/svelte-adapter/README.md). The walkthrough, in Japanese, is
[docs/guide/svelte.md](../../docs/guide/svelte.md).

## Quick start

In your own project:

```sh
npm install -D veriss veriss-adapter-core veriss-svelte
npx veriss-svelte --viewport 320-1280 src/**/*.svelte
```

In this repository (the example uses the workspace packages through `workspace:*`):

```sh
pnpm install
cd examples/svelte
pnpm run check:broken   # exits 1: prints expected.txt
pnpm run check          # exits 0: no error, no warning
```

Both scripts pass `--images images.json` (the natural size of `/avatar.png`) and `--font Roboto=…` (the font file the
`PublishButton` label is measured with). Every finding is a line: `file:line  severity  CODE  message  [states]` (`file:line:column` when the compiler gives a column),
followed by `fix:`. `info` lines are what was not checked or what was assumed; they are never a pass.

## The pairs

| Component | The mistake | Codes on the broken version |
|---|---|---|
| `ArticleMeta.svelte` | a `<div>` byline inside a `<p>`, which Svelte refuses to compile (the HTML parser would close the `<p>`) | `E_ADAPTER_COMPILE` |
| `ProfileCard.svelte` | `width: 480px` on the card, and an `<img>` with a CSS width only | `E_LAYOUT_ITEM_SIZE`, `E_LAYOUT_PAGE_OVERFLOW`, `E_LAYOUT_IMAGE_UNRESERVED` |
| `PublishButton.svelte` | a fixed `width: 80px` on a button whose label is declared one line (`data-text-one-line`) | `E_LAYOUT_CONTENT`, `W_LAYOUT_LONG_WORD` |
| `SaveStatus.svelte` | a status message that pushes the canvas down, against its `data-noshift` contract | `E_LAYOUT_NOSHIFT` |
| `SignupForm.svelte` | a `<label>` next to the field but not tied to it | `E_A11Y_LABEL` |
| `TagList.svelte` | `<li>` inside a `<div>`, and an icon-only remove button | `E_A11Y_NAME`, `E_A11Y_LIST` |
| `ThemedPanel.svelte` | `:global(.theme-dark) .panel`: the look depends on a class on the page | `E_SCOPE_ESCAPE`, `W_CSS_SELECTOR_RELATION` |

`tests/examples.test.mjs` (in `pnpm test`) runs both scripts and holds `expected.txt` and this table to the real output.
