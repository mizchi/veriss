# 端末のプロファイル

よく使われるスマートフォン・タブレット・PC の画面と、その上で起きる「押せない」(ノッチ、Dynamic Island、ホームインジケーター、
2 画面の端末のヒンジ)を、端末ごとの viewport・safe area・ヒンジで静的に検査するためのデータと API。

## データ

`packages/veriss/src/devices/devices.json` は `tools/devices/update.mjs` が作る(手で書き換えない)。出典は 3 つ。

| 出典 | 中身 | 更新 |
|---|---|---|
| [StatCounter](https://gs.statcounter.com/screen-resolution-stats) | 画面の解像度(CSS px)の普及率。月ごと、日本と世界、モバイル・タブレット・PC | `node tools/devices/update.mjs`(既定は先月)。取得した CSV は `tools/devices/statcounter/` に置き、`--offline` で作り直せる |
| Playwright の端末定義 | 機種ごとの viewport(ブラウザーのバーを出した状態)、screen、DPR、タッチ、横向き | Playwright を上げて作り直す |
| `tools/devices/curated.json` | iPhone の safe area(縦: 上・下、横: 左右・下)と切り欠きの種類、Surface Duo のヒンジ | 手で書く。`measured` はモードごと(`{browser, fullscreen}`)で、`false` は公開値。`tools/devices/measure-safe-area.mjs --write` が iOS Simulator の Mobile Safari で測った値で `browser` を実測に置き換える(Xcode が要る)。測った機種はグループから分けて 1 機種のグループにし、同じグループの他の機種は公開値のまま残す。Safari では縦向きの上端がバーに隠れて測れないので、`fullscreen` は全画面の web view で測るまで `false` のまま |

- 同じ画面・viewport・safe area・ヒンジの機種は 1 つのプロファイルにまとめる(`devices` に機種名)。`screenShare` はその画面の大きさの普及率で、
  同じ大きさのプロファイルどうしで共有する(足し合わせない)。幅×高さが同じ行を使い、ない時だけ縦横を入れ替えた行を使う(800×1280 と
  1280×800 は別の普及率)
- 取得した CSV は行を読めることを確かめてから `tools/devices/statcounter/` を置き換える(読めなければ前の CSV を残して止まる)
- 端末に結び付かない解像度で普及率 1% 以上のもの(Android に多い 412×915 など)は、汎用のプロファイル(`phone-412x915` など)にする
- 高さは範囲: 機種は「ブラウザーのバーを出した viewport」から「画面全体」まで、汎用のモバイル・タブレットは画面から 200px 引いた高さまで、
  PC は画面から 80〜120px 引いた高さ(ブラウザーの枠)
- PC は Playwright の Desktop の定義(1920 の画面に 1280 の窓)を使わず、解像度から作る(画面幅いっぱいの窓)
- 2026-10 の時点で、プロファイルが受け持つ普及率は、日本でモバイル 74%・タブレット 62%・PC 70%、世界で 65%・62%・78%

## safe area の 2 つのモード

- `browser`: Safari。縦向きではブラウザーのバーがページの上にあるので、上端の safe area はページに届かない(ホームインジケーターの下端だけ)。
  横向きでは左右(切り欠きはどちらの側にも来うる)と下端
- `fullscreen`: 全画面の web view(アプリ内ブラウザー、ホーム画面の web アプリ)。`viewport-fit=cover` のページにすべての safe area が届く。
  iPhone ではページが画面全体を使うので、viewport の幅は画面の幅(横向きでは画面の高さ。iPhone 14 Pro なら 734px でなく 852px)。
  高さはブラウザーの最も低い高さから画面の高さまで(自前のツールバーを持つ web view も含める)。iPhone 以外のプロファイルは `browser` と同じ
- チェックの `safeAreaMeasured` は、そのモードの値が実測かどうか(`measured.browser` か `measured.fullscreen`)

`viewport-fit=cover` のないページは、ブラウザーが中身を safe area の内側に収めるので、safe area の規則は出ない。safe area の分からない機種
(iPhone Air)のチェックには `safeArea` がない。そこでは safe-area-target の規則は走らず、`viewport-fit=cover` のページが
`env(safe-area-inset-*)` を読むときだけ Unknown になる(読まないページは safe area について何も言わない)。

## API

```js
import {deviceChecks, analyzeDevices} from '@mizchi/veriss/devices';
const checks = deviceChecks({region: 'jp', minShare: 1, mode: 'fullscreen'}); // プロファイル × 向き(2 画面は single と spanned)
const {results, findings} = analyzeDevices(html, {name: 'Page', css, accessibility: true}, checks);
// findings: コードと箱ごとに、出たチェック(`iphone-16-pro/landscape` など)の一覧
```

- viewport・safe area・ヒンジはチェックから取る。`options.safeArea` と `options.hinge` は使わない(型でも受け付けない)。チェック自身の
  safe area がそのまま使われ、持たないチェック(safe area の分からない iPhone、Android、2 画面の spanned)には渡さない。
  別の値で調べたいときは、その値を持つチェックを作って渡す
- チェックはデータとオブジェクトを共有しない(`devices`・`safeArea`・`hinge` はチェックごとの複製)

## ブラウザーとの照合

safe area とヒンジは端末の物理的な形で、Chromium・Firefox・WebKit のどれも再現しない。Chromium だけは DevTools Protocol で上書きできる
(`Emulation.setSafeAreaInsetsOverride` で `env(safe-area-inset-*)`、`Emulation.setDeviceMetricsOverride` の `displayFeature` で
viewport segments とヒンジ)。e2e はこの 2 つで、`env()` の値・箱の位置・ヒンジの位置が静的な解析と一致することを確かめる。
Firefox と WebKit では照合できない。
