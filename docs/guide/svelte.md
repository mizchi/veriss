# Svelte のコンポーネントを `veriss-svelte` で検査する

Svelte 5 のコンポーネント(`.svelte`)を検査する手順です。出力の読み方とオプションの全体は [README.md](README.md)、
例の一式は [`examples/svelte/`](../../examples/svelte/) にあります。

## 入れて、動かす

```sh
npm install -D veriss veriss-adapter-core veriss-svelte
npx veriss-svelte --viewport 320-1280 $(git ls-files '*.svelte')
```

この repository の例では:

```sh
pnpm install
cd examples/svelte
pnpm run check:broken   # 壊れた 6 つ。7 error(s), 2 warning(s)、終了コード 1。出力は expected.txt と同じ
pnpm run check          # 直した 6 つ。0 error(s), 0 warning(s)、終了コード 0
```

どちらの script も `--images images.json`(`/avatar.png` の大きさ)と `--font Roboto=…`(テキストを測るフォント)を渡しています。

## Svelte の何が状態になるか

`{#if}`(`{:else if}` を含む)、`class:name={x}`、`class={x ? 'a' : 'b'}`、リテラルの値の三項演算子の属性、`{#each}`(既定で 0 個と 2 個)、
`{#await}` が状態になります。同じ式は同じ選択(`{#if open}` と `class:active={open}`)で、`!x` はその否定です。
`let { status }: Props = $props()` の型が文字列リテラルの union なら値ごとに、既定値のある props はその既定値でも状態を作ります。
一覧は [veriss-svelte の README](../../packages/svelte-adapter/README.md)。

子のコンポーネント、`{@html}`、`{@render}`、`<slot>`、`<svelte:element>`、リテラルの条件でない `class={…}`、`style:` と動的な
`style`、属性の spread は Unknown(not checked)です。子のコンポーネントは、そのファイルを checker に渡して検査します。

## 例: 壊れたものと直したもの

各組の出力は `pnpm run check:broken` の実物から引いています(長い行は省略)。

### はみ出しと、場所を取らない画像(`ProfileCard.svelte`)

```svelte
<article class="card">
  <img class="avatar" src="/avatar.png" alt="">
  …
.card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; width: 480px; padding: 16px; }
.avatar { width: 64px; }
```

```
src/broken/ProfileCard.svelte:6  error    E_LAYOUT_ITEM_SIZE  .card requires 480px but receives 400px on inline axis at viewport 400px × 690px (also: 1 box inside it reaches past the viewport)
src/broken/ProfileCard.svelte:6  error    E_LAYOUT_PAGE_OVERFLOW  .card reaches past the viewport, so the page scrolls horizontally
src/broken/ProfileCard.svelte:7  error    E_LAYOUT_IMAGE_UNRESERVED  .avatar has no reserved height: it shifts the layout when /avatar.png loads; add width="128" height="128" (the file's size) or an aspect-ratio
```

- 480px の `width` は、480px より狭い viewport ではみ出します(反例として 400px の幅が出る)。`max-width: 480px` にすると、
  狭い画面では縮みます。
- `width` だけの img は、ファイルが読み込まれるまで高さが 0 で、読み込むと下を押し下げます。`width="128" height="128"`
  (ファイルの大きさ)を付け、CSS で `height: auto` にします。`height: auto` を忘れると、属性の 128px の高さのまま 64px の幅に
  描かれ、`W_LAYOUT_IMAGE_DISTORTED`(縦に引き伸ばされる)が出ます。
- `--images` を渡さないと、この img は `U_LAYOUT_IMAGE`(not checked)になり、`E_LAYOUT_IMAGE_UNRESERVED` は出ません。
  画像の大きさがわからないので、確保すべき高さが決まらないからです。

### 1 行のはずのラベル(`PublishButton.svelte`)

```svelte
<button class="save" type="button" data-text-one-line>Publish now</button>
.save { display: block; width: 80px; … }
```

```
src/broken/PublishButton.svelte:3  error    E_LAYOUT_CONTENT  .save requires 86.72px but receives 62px on inline axis at viewport 800px × 690px
src/broken/PublishButton.svelte:3  warning  W_LAYOUT_LONG_WORD  .save wraps only between words (overflow-wrap: normal), and its longest word is wider than the box: it sticks out. …
```

`data-text-one-line` が「このラベルは 1 行」という期待で、`--font Roboto=…` のフォントファイルで「Publish now」を測った幅(86.72px)が、
padding を引いた 62px に入りません。直した版は `width` を `min-width` にし、`justify-self: start` で grid の幅いっぱいに伸びるのを止めます。
`--font` を渡さないと、テキストは測られず、この error は出ません。

### 状態の間のレイアウトシフト(`SaveStatus.svelte`)

```svelte
{#if saved}
  <p class="toast" role="status">Saved</p>
{/if}
<div class="canvas" data-noshift="canvas" data-noshift-on="saved"></div>
```

```
src/broken/SaveStatus.svelte:9  error    E_LAYOUT_NOSHIFT  [data-noshift="canvas"] moves between {saved: true} and {saved: false}: at 800px wide its top is 40px, then 0px (a layout shift its data-noshift contract rules out)
```

`saved` になると「Saved」が流れの中に入り、canvas を 40px 押し下げます。直した版は、メッセージを `position: absolute` で
canvas の上に重ね、canvas の箱を動かしません。

### label のない入力欄(`SignupForm.svelte`)

```svelte
<label class="label">Email</label>
<input class="field" type="email" name="email">
```

```
src/broken/SignupForm.svelte:4  error    E_A11Y_LABEL  .field has no label here: add a visible <label>, aria-label, aria-labelledby or title
```

隣に置いただけの `<label>` は入力欄の名前になりません。直した版は `for` と `id` で結びます。`<label>Email <input …></label>` と
中に入れても `E_A11Y_LABEL` は消えますが、文字と入力欄が inline に並ぶので、`.label` を grid か flex にしない限り、その行の配置は
`U_LAYOUT_INLINE`(not checked)になります。

### `ul` の外の `li` と、名前のないアイコンのボタン(`TagList.svelte`)

```svelte
<div class="tags">
  {#each tags as tag}
    <li class="tag">
      <span class="text">{tag}</span>
      <button class="remove" type="button"><svg …>…</svg></button>
```

```
src/broken/TagList.svelte:10  error    E_A11Y_NAME  .remove has no accessible name here: no rendered text and no aria-label, aria-labelledby or title  [tags ×2]
src/broken/TagList.svelte:8  warning  E_A11Y_LIST  spec: .tag is a list item outside ul/ol (a markup conformance error; the rendering does not show it)  [tags ×2]
```

`[tags ×2]` は、タグが 2 個の状態で出るという意味です(0 個の状態にはボタンがない)。直した版は `<ul role="list">` で `<li>` を包み
(`list-style: none` の `ul` は Safari の VoiceOver でリストでなくなるので `role="list"`)、ボタンに `aria-label="Remove tag"`、
svg に `aria-hidden="true"` を付けます。

`E_A11Y_LIST` が出るのは、その部分の配置が解けたときだけです。`.text` の幅(`width: 96px`)を消すと、文字の幅が決まらないので
`.tag` が `U_LAYOUT_FLEX`(not checked)になり、`E_A11Y_LIST` も出なくなります。

### `:global` で外のクラスに頼るテーマ(`ThemedPanel.svelte`)

```svelte
:global(.theme-dark) .panel { background: #1e1e1e; color: #eee; }
```

```
src/broken/ThemedPanel.svelte:9  error    E_SCOPE_ESCAPE  :global(.theme-dark) .panel uses :global, which reaches outside the component's own elements …
src/broken/ThemedPanel.svelte:9  warning  W_CSS_SELECTOR_RELATION  .theme-dark .panel: 1 element(s) match .panel, but none is inside an element matching .theme-dark; …
```

パネルの見た目が、ページのどこかの `.theme-dark` に左右されます。直した版はテーマを prop にします。

```svelte
<script>
  let { dark = false } = $props();
</script>
<section class="panel" class:dark={dark}>…</section>
<style>
  .panel.dark { background: #1e1e1e; color: #eee; }
</style>
```

`dark` はこのコンポーネントの状態になるので、checker は暗い状態も検査します。たとえば暗い状態の文字を `#555` にすると、
`E_A11Y_CONTRAST  .title has contrast 2.24:1, below 4.5:1  [dark=true]` が出ます(`:global` のままでは、この状態は検査されません)。

## Svelte に固有のこと

- Svelte のコンパイラが拒否するマークアップ(`<p>` の中の `<div>` など)は、checker の指摘ではなく、Svelte のエラー
  (`element_invalid_closing_tag_autoclosed`)のスタックトレースで止まります(終了コード 1)。
- Svelte はセレクタのすべての部分をスコープするので、`:global` のない `.theme-dark .panel` は当たらず、
  `W_CSS_SELECTOR_RELATION`(warning)になります。
- 未使用のセレクタ(`W_CSS_SELECTOR_UNMATCHED`)は、Svelte のコンパイラの `css_unused_selector` と一致することを確かめています。
