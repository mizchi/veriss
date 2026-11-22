# L1 の Lean による定義と証明(oracle)

[ADR-0018](../../docs/adr/0018-coordinate-subset.md) の座標計算サブセット L1 の、Lean 4 による三つ目の定義(Mathlib なし、
Lean 4.36 の標準だけ)。Z3 の仕様(`models/layout/spec.mjs`)とも engine とも独立に書いた。

- `L1/Grid.lean`: トラック(`px`・`minmax(0, fr)`)、fr の配り方(CSS Grid §12.7.1)、領域と self の揃え
- `L1/Flex.lean`: row・nowrap の Flex。伸び縮みは CSS Flexbox §9.7 の**凍結の手順そのもの**(Z3 の仕様は「共通の水位」という結果の
  性質で書いたので、二つは別々の定義)。係数の和が 1 未満のときの規則(§9.7 4.b)も手順どおり
- `L1/Theorems.lean`: 証明した性質(`sorry` なし。`#print axioms` は `propext`・`Classical.choice`・`Quot.sound` だけ)
  - `freeSpace_nonneg`・`frUnit_nonneg`: fr の空きと 1 単位は負にならない
  - `sum_sizes`・`columns_fill`: 固定のトラックが収まり fr の和が 1 以上なら、トラックと gap の和はコンテナの幅にちょうど等しい
  - `resolveLoop_items`: 凍結の手順は項目を入れ替えない(対象と凍結の印だけを変える)
  - `resolve_ge_min`: どの項目も min-width を下回らない
- `Main.lean`: oracle の実行ファイル。`[{"config": …, "W": …}]` を標準入力から読み、箱を厳密な有理数(`"n/d"`)で返す

```sh
cd models/lean && lake build          # 定義・証明・oracle(elan で Lean を入れる)
node --test tests/lean-oracle.test.mjs # Lean = Z3 の仕様(厳密)、Lean = engine(ランダムな設定 × 12 の幅)
```

`tests/lean-oracle.test.mjs` は Lean がなければ理由を書いて飛ばす。`L1_ORACLE=<実行ファイル>` で別の oracle(わざと誤りを入れた版)を
渡せる。誤りを入れた版(§9.7 4.b を外す、縮めるときに shrink を basis に掛けない)は、どちらの比較でも落ちることを確かめた。
