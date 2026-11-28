# Linaria のコンポーネントを `veriss-linaria` で検査する

Linaria(`css`` ` のクラスと `styled.tag`` ` のコンポーネント)でスタイルを付けた React のコンポーネント(`.js`、`.jsx`、`.ts`、
`.tsx`)を検査する手順です。出力の読み方とオプションの全体は [README.md](README.md)、例の一式は
[`examples/linaria/`](../../examples/linaria/) にあります。

## 入れて、動かす

```sh
npm install -D veriss veriss-adapter-core veriss-react veriss-linaria
npx veriss-linaria --viewport 320-1280 $(git ls-files 'src/*.tsx')
```

checker はソースを読むだけで、Linaria のビルド(wyw-in-js)も `@linaria/core` も要りません。例の package も入れていません。

この repository の例では:

```sh
pnpm install
cd examples/linaria
pnpm run check:broken   # 壊れた 5 ファイル。5 error(s), 4 warning(s)、終了コード 1。出力は expected.txt と同じ
pnpm run check          # 直した 5 ファイル。0 error(s), 0 warning(s)、終了コード 0
```

## Linaria の何が読めるか

- テンプレートの補間は、Linaria のビルドと同じく、モジュールの中で静的に決まるものを評価します。モジュールの `const` の文字列と数値、
  `const` のオブジェクトのメンバー(`${theme.colors.accent}`)、ほかの `css`` ` のクラス(セレクタでは `.${row}`)、styled のコンポーネント。
  props の関数(`${p => p.color}`)と import した値は Unknown(not checked)です。
- JSX の `&&`、三項演算子、`cx(a, cond && b)`、空白で区切った className のテンプレートリテラルが状態になります。props の型が文字列
  リテラルの union なら値ごとに状態を作ります。`` `btn-${size}` `` のようにクラス名を組み立てる補間は Unknown です。
- 子のコンポーネント(`<MenuLink>`)の中身は、親のファイルでは見ません(`U_REACT_COMPONENT`)。子のファイルも checker に渡します。
  API で `resolveModule: nodeModuleResolver()` を渡しても、子のマークアップは子のファイルで検査する、という扱いは同じです。

詳しくは [veriss-react の README](../../packages/react-adapter/README.md) と [component-lint.md の Linaria](../component-lint.md#linaria)。

## 例: 壊れたものと直したもの

各組の出力は `pnpm run check:broken` の実物から引いています(長い行は省略)。

### 固定のトラック(`PricingGrid.tsx`)

```tsx
const grid = css`
  display: grid;
  grid-template-columns: repeat(3, 200px);
  gap: 16px;
`;
```

```
src/broken/PricingGrid.tsx:17  error    E_LAYOUT_TRACKS  .lx-grid requires 632px but receives 476px on inline axis at viewport 476px × 690px (also: 1 box inside it reaches past the viewport)
src/broken/PricingGrid.tsx:17  warning  W_LAYOUT_FIXED_TRACKS  .lx-grid has grid-template-columns: repeat(3, 200px), only fixed px tracks, so it cannot shrink below their sum …
```

3 列 × 200px と 2 つの gap で 632px が要り、それより狭い viewport ではみ出します。クラス名は Linaria の変数名から `.lx-grid` と
表示されます。直した版は `repeat(auto-fill, minmax(200px, 1fr))` で、列の数が幅に合わせて変わり、416px(200px の 2 列と gap)より狭いと 1 列になります。

### 外の祖先に頼るテーマ(`Notice.tsx`)

```tsx
const notice = css`
  …
  .theme-dark & {
    background: #3a2f00;
    color: #fff;
  }
`;
```

```
src/broken/Notice.tsx:10  error    E_SCOPE_OUTSIDE  .theme-dark .lx-notice relies on .theme-dark, which no element of this component matches: the rule depends on where the component is placed …
src/broken/Notice.tsx:10  warning  W_CSS_SELECTOR_RELATION  .theme-dark .lx-notice: 1 element(s) match .lx-notice, but none is inside an element matching .theme-dark; …
```

`.x &` は、コンポーネントの外の祖先のクラスに見た目を預けます。直した版はテーマを prop にします。

```tsx
const darkNotice = css`background: #3a2f00; color: #fff;`;
export default function Notice({ dark }: Props) {
  return <aside className={cx(notice, dark && darkNotice)}>…</aside>;
}
```

`dark && darkNotice` が状態になり、checker は暗い状態(コントラストなど)も検査します。

### 子のコンポーネントの中を塗るセレクタ(`Menu.tsx` と `MenuLink.tsx`)

```tsx
const List = styled.ul`
  …
  & a {
    display: block;
    padding: 8px 12px;
  }
`;
…
{items.map(label => <li key={label}><MenuLink href={`#${label}`} label={label} /></li>)}
```

```
src/broken/Menu.tsx  error    E_SCOPE_REACHES  .lx-List a can style elements of <MenuLink>, which another component renders: …  [items ×2]
src/broken/Menu.tsx  warning  W_CSS_SELECTOR_UNMATCHED  .lx-List a matches no element of the template
src/broken/Menu.tsx  info     U_REACT_COMPONENT  not checked: child component <MenuLink>: MenuLink is imported from './MenuLink', which was not read (pass options.resolveModule)
```

`<a>` を描くのは `MenuLink` なので、その padding は `MenuLink` に書きます。直した版は `Menu` から `& a` を消し、`MenuLink` が
自分のクラス(`display: block; padding: 8px 12px; color: #0b57d0`)を持ちます。`MenuLink.tsx` は `src/broken/` と `src/fixed/` の
両方にあり、壊れた版はスタイルを持たない(親に塗られる前提の)リンクです。

`<li>` は親の `Menu` に書いています。ルートが `<li>` の子のコンポーネントにすると、子のファイルを単独で検査したときに `E_A11Y_LIST`
(`ul` の外の `li`)が出ます。

### label のない入力欄と、`:global` の reset(`SearchForm.tsx`)

```tsx
const form = css`
  …
  :global(body) {
    margin: 0;
  }
`;
…
<label>Search</label>
<input className={field} type="search" name="q" />
```

```
src/broken/SearchForm.tsx:25  error    E_A11Y_LABEL  .lx-field has no label here: add a visible <label>, aria-label, aria-labelledby or title
src/broken/SearchForm.tsx  error    E_SCOPE_ESCAPE  .lx-form :global(body) uses :global, which reaches outside the component's own elements …
src/broken/SearchForm.tsx  warning  W_CSS_SELECTOR_RELATION  .lx-form body: 1 element(s) match body, but none is inside an element matching .lx-form; …
```

直した版は `htmlFor` と `id` で label を結び、`body` の margin はページの CSS(checker には `--page-css`)に移します。

## Linaria に固有のこと

- `E_SCOPE_ESCAPE` と `E_SCOPE_REACHES` は行番号なしで出ます。セレクタの文字列で検索してください。
- `<p>` の中の `<div>` は何も出ません(React は DOM API で木を作るので、`W_HTML_RESTRUCTURED` の対象外)。
- JSX / TSX の構文エラーは `E_ADAPTER_COMPILE`(error)として、Babel の行と列に出ます(`ファイル:行:列`)。import した module の中の
  構文エラーは、その module のファイルで出ます。そのファイルのほかの検査はしません。
- `css` のテンプレートの CSS が読めないとき(閉じていないブロックなど)は、`U_LINARIA_CSS`(not checked)になり、そのクラスの規則なしで
  検査を続けます。
- `info` の `W_A11Y_ORDER`(「li@Component/0/0/0/1 comes after … but is placed before it」)が `Menu.tsx` に出ますが、子の中身を
  見ていない(中身が空の)`<li>` どうしを比べた結果と推定しています(inferred)。recommended のルールではなく、直した版にも出ます。
