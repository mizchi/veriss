# レイアウト契約の IR(ContractIR / LayoutIR / ObligationIR)

> isle の [`docs/layout-contract-language.md`](https://github.com/mizchi/isle/blob/HEAD/docs/layout-contract-language.md) のうち、書き方(isle の `layout SafeGrid { ... }` などの構文)によらない部分を移した。構文・Vite・CLI・親子の差し替えは isle の文書にある。

## 三つの境界

1. **ContractIR** は profile・必要な割当領域・保証を宣言します。CSS から逆算して契約を変更しません。
2. **LayoutIR** は component・CSS の解析結果です。ContractIR を受け取らず、配置・条件領域・到達候補・信頼する仮定を保存します。
3. **ObligationIR** は両者の照合結果です。必要条件の範囲で、入力の被覆と保証違反を別の query にします。

ソース宣言の参照と位置は LayoutIR の binding metadata に引き継ぎますが、その内容を寸法・到達領域を求める前提には使いません。

すべて JSON にできる immutable な build-only データです。検査器・IR・Z3 を生成アプリへ追加しません。数値の正本は rational string で、数値表示は近似値です。

## 実装の意味と保証

環境を e、到達可能状態を s、配置を b とします。契約の必要条件を R、外部の信頼仮定を A、保証を G、実装の抽象意味を M と置きます。

```text
Conforms(I, C):
  Admissible(I, C.profile)
  AND every permitted input/state has a defined model
  AND forall e, s, b:
    R(e) AND A(e, s) AND M(I, e, s, b) => G(e, s, b)
```

`R` は検査範囲を選びます。`G` は実装モデルへの仮定に追加せず、`R AND A AND M AND NOT G` で反例を探します。信頼仮定をラベルから数式として解釈したり、内容が収まるという宣言を自己証明に使ったりしません。

初版の外部仮定は既存解析の `LayoutIR.assumptions` から証明結果へ引き継ぎます。ContractIR から `assume` 文や任意の述語を入力する機能は未実装です。

LayoutIR は以下の寸法を区別します。

| 寸法 | 意味 |
| --- | --- |
| allocated | in-flowではGridからの割当。明示サイズのabsoluteではCSSが決めたused border rectangle。子の要求と照合する入力 |
| border | 実装 CSS が作る border box |
| padding | border を除いた padding box。absolute の局所座標系の基準 |
| content | padding・border・適用される scrollbar gutter を除いた content box |

既存 report の `inlineSize` / `blockSize` は border 寸法のままです。`allocatedInlineSize` / `allocatedBlockSize` と、常時記録する `contentInlineSize` / `contentBlockSize` を追加しました。auto row 等で割当高さが definite でなければ allocated.block はありません。その地点へ両軸の子契約を接続すると Unknown です。

## 被覆を先に検査する

適合性の数値 query の前に、別の query で次を検査します。

- requires の入力が空でないこと。
- 契約が要求する領域を、CSS を抽出した領域が覆うこと。
- 到達候補・scrollbar profile の各 case で、root の配置が定義されること。
- 各 box の存在条件で、その box の border/content の両軸と割当幅が定義されること。

被覆違反・未対応 CSS・解析不完全・solver 不明は Unknown です。部分的な領域の UNSAT を全体の成功にはしません。clip / scroll / visible など、既存 API で fit を弱めた解析結果も、この最初の profile では Unknown にします。既存 API 自体の各 overflow 方針を削除したわけではありません。

hostInset が20pxなら、割当幅160–640pxを調べるための viewport は180–660pxです。640pxまでしか抽出していなければ、被覆不足になります。

## API

```js
import { analyzeLayout } from 'veriss';
import {
  createContractIR, createLayoutIR, createObligationIR,
} from 'veriss/src/layout-contract.mjs';
import { verifyContractObligation } from 'veriss/src/layout-contract-node.mjs';

const contract = createContractIR({
  component: 'Four',
  requires: {
    inlineSize: { min: 160, max: 640 },
    blockSize: { min: 40, max: 640 },
  },
});
const report = analyzeLayout(tree, { // tree: the box tree (an adapter, or analyzeHTML's input)
  css: '',
  viewport: { min: 80, max: 640, height: { min: 40, max: 640 } },
});
const implementation = createLayoutIR(report);
const obligations = createObligationIR(contract, implementation);
const result = await verifyContractObligation(obligations);
// result.coverage と result.proof を独立して確認できる。
```

Worker では `verifyObligationIR(obligations, z3API)` を使います。Node adapter は公式 bindings の初期化と thread の破棄を所有します。

## 根拠と今後の証明

[独立 SMT 仕様](https://github.com/mizchi/isle/blob/HEAD/models/layout_contract/contract.smt2) と CSS 由来の違反式を XOR で照合します。4箱・gap 8px・responsive の境界・子48pxの要求について UNSAT、40pxを41pxへ壊した実装では SAT になります。gap と159pxの故障した境界は Chromium で反例を再現し、184pxの割当・160pxの分岐へ修正した場合も実測します。

これらは定義した例の照合です。抽出器全体について必要な健全性、すなわち「許可した実ブラウザーの観測が M にすべて含まれる」の一般的証明は未実装です。到達状態・CSS parser・box model 抽出器を信頼し、text/font の bound・native scrollbar・host・ブラウザー丸め等の仮定も証明結果へ残します。

次は一般の profile/述語 AST、子 summary のインポート、部分集合の抽出の健全性と合成定理です。契約文法を増やす際も ContractIR と LayoutIR の独立性を維持します。

```sh
just layout-contract-check
```

