# ADR-0016: 責務ごとのモジュール分割(構文・スタイル・幾何・色・規則)

- 状態: Proposed(設計。この文書のパッケージ名・API はまだ実装していない)
- 日付: 2026-11-19
- 対応する提案: ユーザーの意見「色を計算してコントラストのアクセシビリティを計算する部分を、一つのエラーパターンにして欲しい。座標の計算とは別に、一つのパッケージ単位でいいかもしれない」「レイアウトの計算も一つのプラグインみたいな単位で独立できるかもしれない」「veriss 自体の今のパターンを見て、責務の単位で分割するモジュール分割パターンを考えてほしい。単一責任原則で考え、かつ密結合しないレベルで」
- 関係: [ADR-0007](0007-static-contrast-contracts.md)(コントラストの判定)、[ADR-0012](0012-static-integrity-rules.md)、[ADR-0013](0013-static-accessibility-rules.md)、[ADR-0015](0015-checkable-style-languages-and-portable-layout.md)(Web 以外のレイアウトエンジン)

## 背景: いまの形

`packages/veriss/src` は 12,800 行(1.3MB)で、大きさは 3 つのファイルに偏っている。

| ファイル | 大きさ | 入っている責務 |
|---|---|---|
| `layout/engine.mjs` | 573KB | 幾何の解(block / grid / flex / table / positioned)、スタイルの状態の展開、**CSS の誤りの検査**(`cssMistakes` 63KB、`solve` の中の「効かない宣言」の判定)、**レイアウト後の警告**(`finish` 72KB)、契約の検証(`validate`)、報告の組み立て |
| `layout/accessibility.mjs` | 221KB | 50 余りの a11y 規則。そのうち **色**(色の解析、重ね合わせ、輝度、比)と、色を使う 10 前後の規則(文字・アイコン・状態・枠・リンク・キャレット・色だけの状態)を含む |
| `layout/css.mjs` | 152KB | 構文の解析、**構文の検査**(F79〜F102 の多く)、cascade、computed style、**捨てた宣言の記録** |

`solve` だけで 170KB ある。幾何の計算の途中に、パターンを足すたびに検査の分岐が増えてきた。

### 結合している箇所(実測)

1. **検査がレイアウトのクロージャの中にある。** `cssMistakes`・`inline*`・`tableRowRadius` などは `analyzeBoxTree` の中の関数で、`layoutWarnings` に直接書き込む。レイアウトが Unknown で止まった箱には、後追いの `walkStyles` でもう一度呼ぶ(F103 では、この経路で display の元の値が失われていて、`$inlineDisplay` を足した)。
2. **構文の検査の結果が、名前ごとの配列で渡る。** `parseLayoutCSS` は `mediaVar`、`fontInvalid`、`counterUnused` など **28 種類** の配列を返し、engine の分割代入が同じ 28 の名前を受ける。パターンを 1 つ足すたびに、両方の 2 か所と警告の組み立ての 1 か所を変える。
3. **捨てた宣言の印が、名前ごとの `$…Inert` で渡る。** `computeStyle` は `$tabSizeInert`、`$breakInert`、`$aspectInert` など **11 種類** の印を付け、engine の別々の場所がそれぞれを読む。
4. **規則の情報が 2 か所にある。** メッセージは engine と accessibility、重大度と直し方は `adapter-core/src/lint.mjs` の表にある。
5. **色は座標をほとんど使わないのに、幾何の行(geometry row)からしか呼べない。** 使う座標は「位置指定された文字の後ろに別の箱が重なるか」(`overlap`)と、報告する viewport の範囲だけ。

## 決めること: 段(stage)と規則(rule)に分ける

処理を **事実(facts)を作る段** と **事実を読んで所見(findings)を出す規則** に分ける。
段は所見を出さない。規則は事実を作らない。両者は、下の表のデータの形だけでつながる。

```
 HTML / テンプレート ─▶ [dom]     ─▶ DomFacts      ─┐
 CSS ──────────────────▶ [syntax]  ─▶ SyntaxFacts   ─┼─▶ [style] ─▶ StyleFacts ─┬─▶ [layout] ─▶ GeometryFacts
                                                     │                          │
                         規則(rule plugin)が、必要な事実だけを読む ◀───────────┴──────────────────────┘
```

| 段 | 責務(1 つ) | 入力 → 出力 | 今のファイル |
|---|---|---|---|
| dom | 文書を箱の木にする | HTML、テンプレート → `DomFacts`(箱、属性、役割、native の状態) | `tree.mjs`、`html.mjs` |
| syntax | CSS を規則の列にし、文法を確かめる | CSS → `SyntaxFacts`(規則、`notes[]`) | `css.mjs` の前半、`nesting`、`variables`、`supports`、`conditions`、`selectors`、`*-syntax.mjs`、`css-writes` |
| style | 箱ごと・viewport の範囲ごとの computed style を出す | `DomFacts` + `SyntaxFacts` → `StyleFacts`(`styles(box, region, state)`、`dropped[]`) | `css.mjs` の後半(`computeStyle`)、`ua-profile`、`ua-reset` |
| layout | 箱の位置と大きさを、範囲の関数として解く | `StyleFacts` → `GeometryFacts`(行、Unknown の理由) | `engine.mjs` の `solve` と、`region`、`linear`、`grid`、`flex`、`subgrid`、`positioned`、`scrollbars`、`text-font` |
| color | 色を数として扱う(解析、重ね合わせ、輝度、WCAG の比) | 色の値 → 数 | `accessibility.mjs` の `parseColor`・`over`・`contrastRatio`・`backdrop` |

### データの形(段の間の約束)

- `SyntaxFacts.notes[]`: 構文の検査の結果を **1 つの形** にする。
  `{ code: 'W_CSS_FONT_INVALID', css: {file, line, selector, property}, data: {...} }`
  28 の配列はこれにまとめる。パターンを足しても、段と規則の間の形は変わらない。
- `StyleFacts.dropped[]`: computed style を作るときに捨てた宣言を **1 つの形** にする。
  `{ box, property, value, reason: 'cell' | 'inline' | 'one-line' | 'table-collapse' | … }`
  11 の `$…Inert` はこれにまとめる。捨てるかどうかは style の段が決め(解に影響するので)、何と言うかは規則が決める。
- `GeometryFacts.rows[]`: 今の geometry row のまま(箱、範囲、原点、大きさ、塗りの事実、祖先の塗りの鎖)。
- `Finding`: `{ code, severity, rule, box?, path?, css[], message, region?, browsers? }`。今の warning / diagnostic の形をそろえる。

### 規則(rule plugin)

```js
export default {
  name: 'text-contrast',
  needs: ['style'],            // 'syntax' | 'dom' | 'style' | 'geometry' のどれを読むか
  codes: { E_A11Y_CONTRAST: { severity: 'error', hint: '…' } },  // lint.mjs の表をここへ
  run(facts, options) { return findings; },
};
```

- 規則は `needs` に書いた事実だけを受け取る。geometry を読まない規則は、レイアウトが Unknown でも走る(今の P2 と、後追いの `walkStyles` が要らなくなる)。
- 重大度・直し方・メッセージは規則が持つ。`adapter-core/src/lint.mjs` の表は規則の `codes` から作る。
- 1 つの規則は 1 つの責務(1 つのパターンか、密接なパターンの小さな組)。チェックリストの F 番号と規則が対応する。

### 依存の向き(密結合を避ける決まり)

1. 段は前の段にだけ依存する(dom・syntax → style → layout)。段は規則に依存しない。
2. 規則は事実の形と `color` のような純粋な道具にだけ依存する。ほかの規則にも、段の内部にも依存しない。
3. 道具(`linear`、`region`、`color`)はどこにも依存しない。
4. これをテストで守る: import の向きを調べる小さなテスト(`test/module-boundaries.test.mjs`)を置き、逆向きの import があれば落とす。

## パッケージの単位

| パッケージ | 中身 | 依存 |
|---|---|---|
| `@mizchi/veriss-color` | 色の解析、重ね合わせ、輝度、WCAG の比、祖先の背景をたどる `backdrop(chain)` | なし |
| `@mizchi/veriss-css` | syntax と style の段(postcss、css-tree を使う) | なし(postcss、css-tree) |
| `@mizchi/veriss-layout` | layout の段(記号の解、`region`、`linear`) | `veriss-css` の `StyleFacts` の形だけ |
| `veriss`(core) | dom の段、段をつなぐ pipeline、規則の登録、報告の形、既存の公開 API | 上の 3 つ |
| 規則 | `rules/css-mistakes`、`rules/a11y-dom`、`rules/a11y-geometry`、`rules/contrast`、`rules/integrity`、`rules/cls` | 事実の形、`veriss-color` |

- **コントラスト** は `veriss-color` と `rules/contrast` の組。`rules/contrast` は `needs: ['style']` で、祖先の塗りの鎖(DOM の祖先と computed style だけで決まる)から判定する。後ろに別の箱が重なるかどうかだけは geometry が要る。そこは layout がある場合に限って `overlaps(row)` を渡し、ない場合は今と同じく Unknown にする。
- **レイアウト** はプラグインとして差し替えられる段になる。今の記号の解のほかに、ADR-0015 の Web 以外のエンジン(crater など)を同じ `StyleFacts → GeometryFacts` の形で差し込める。
- 最初はパッケージを分けず、`packages/veriss/src/` の中のディレクトリ(`color/`、`css/`、`layout/`、`rules/`)で境界を作り、境界テストが通ってから `packages/` に出す。

## 移行の手順(各段階でテストと e2e を通したまま)

| 段階 | すること | 危険の大きさ |
|---|---|---|
| M1 | `color/` を切り出す(純粋な関数の移動だけ)。`accessibility.mjs` はそこから import する | 小 |
| M2 | 境界テストを置く(今ある逆向きの依存は許可リストに載せ、減らしていく) | 小 |
| M3 | `notes[]` を導入する。28 の配列を 1 つずつ移し、engine の分割代入をなくす | 中 |
| M4 | `dropped[]` を導入する。11 の `$…Inert` を移す | 中 |
| M5 | `rules/css-mistakes` を作り、`cssMistakes` と `inline*` を engine から出す。依存は `createCssMistakes({ report, facts, tools })` の引数に明示する(済み)。`walkStyles` をなくすのは M6 に回す(style の段が単独で事実を出せるようになってから) | 大 |
| M6 | `solve` の中の「効かない宣言」の判定(`reasons`)を規則に移す。layout は「親の display」「flow の中か」などを事実として出す。`walkStyles` をなくす(済み: `rules/inert-declarations.mjs` の `createInertDeclarations`。style の検査は 1 本の walk が全 box・全 state で行い、layout は呼ばない。layout が style を書き換えて報告するもの(% の高さを auto に、block flow の auto の上下 margin を 0 に)と、inline の box の効かない寸法は layout に残る) | 大 |
| M7 | `rules/contrast` を作り、色の規則を移す。`needs: ['style']` にして、レイアウトなしでも判定する(済み: 文字・画像の代わりの背景・アイコンのコントラストと見えないキャレット。後ろに別の箱があるかは呼ぶ側が `behind` で答える。レイアウトが Unknown のときは style の段の行で判定し、低いコントラストは `W_A11Y_CONTRAST_UNPLACED` の警告にする(幾何がないので error にはしない)。状態・placeholder・欄の境界・文中リンク・フォーカスの輪郭の色は、フォーカスや状態の幾何を読むので layout に残る) | 中 |
| M8 | a11y の残りを `a11y-dom` と `a11y-geometry` に分ける。`integrity`、`cls` も規則にする | 中 |
| M9 | 境界テストの許可リストが空になったら、`packages/` に出す | 小 |

各段階の完了条件は、全パッケージの単体テスト、component-lint の eval が変わらないこと、css-mistakes の 3 ブラウザ e2e。所見の集合(code・box・path)は、段階の前後で同じでなければならない(差分を取るテストを M3 の前に置く)。差分は `tools/finding-set/record.sh` で全単体テストの解析ごとに記録し、`tools/finding-set/compare.mjs` で比べる(M6 から)。

## 考えた別の案

- **規則ごとに CSS と DOM を読み直す(段を作らない)。** 規則は独立するが、cascade を規則の数だけ繰り返すので遅く、Unknown の判断もばらばらになる。採らない。
- **engine をそのまま残し、検査だけ別ファイルに移す。** クロージャの変数(`layoutWarnings`、`rules`、`matches`)をそのまま使うので、ファイルが分かれても結合は残る。採らない。
- **最初から npm パッケージに分ける。** 境界が固まる前に分けると、パッケージをまたいだ変更が増える。ディレクトリで境界を作ってから出す(M9)。

## 影響

- パターンを 1 つ足すとき: 文法なら syntax に `notes` を 1 つ、規則を 1 つ。捨てる宣言なら style に `dropped` を 1 つ、規則を 1 つ。engine には触れない。
- コントラストと a11y の DOM 規則は、レイアウトが Unknown でも走る。
- 公開 API(`analyzeHTML`、`analyzeInput`、adapter の lint)は変えない。返す所見の形も変えない。
