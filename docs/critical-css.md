# クリティカル CSS の抽出(`veriss/critical`)

ページのファーストビュー(読み込んだ直後、スクロールしていない画面)の表示に要る CSS の規則だけを抜き出す。対象の画面は、
一般的なスマートフォンと PC の範囲のすべての大きさ(`firstViewProfiles`)。

| profile | 幅 | 高さ | スクロールバー |
|---|---|---|---|
| smartphone | 320〜430px | 568〜932px | overlay(幅 0) |
| pc | 1263〜1920px | 720〜1080px | overlay。通常のスクロールバー(15px・17px)は、幅の範囲を 17px 下げて含める。CSS が `vw` などの viewport の単位を使うときは、通常のスクロールバーそのものを解析に入れる(`vw` はスクロールバーを含む) |

```js
import {extractCriticalCSS} from 'veriss/critical';
const {css, rest, elements, profiles} = extractCriticalCSS(html, {css: stylesheet});
// css: ファーストビューの規則(元の順番、元の @media などの中)。rest: それ以外(後から読み込む)
```

## 文字

フォントのファイルを渡すと(`textMetrics`: `loadTextMetrics` の結果、`fonts`: family 名とファイル)、中身が文字だけの要素(text leaf)を、
計算されたフォントで測って、その文字が要る大きさで配置する(1 回目の解析で各文のフォントを報告させ、2 回目に測った契約で配置する)。

```js
import {loadTextMetrics} from 'veriss/text/node';
const fonts = {Roboto: {file: 'fonts/Roboto.ttf'}};
const r = extractCriticalCSS(html, {css, textMetrics: await loadTextMetrics({fonts}), fonts});
```

- **自由な文字列**(`data-text-free`、長さの上限だけを書いた `data-text-max-length`、adapter が式の値を表す `…`)は、どんな長さにもなりうる。
  いくらでも伸びうるとし、配置は空(0 × 0)、つまり最も小さい場合で行う。ふつうの block の流れでは、文が長くなると後ろの要素は
  下に押されるだけなので、「ファーストビューに入りうるか」は最も小さい場合で決まる
- 中身を中央や下に寄せる block コンテナ(`align-content` が start 系以外)では、文が長くなると前の要素が上に動くので、ふつうの block の
  流れとして扱わない(中身は残す)
- 測れない文(フォントのファイルがない family、`font-style: italic`・`letter-spacing` など測り方が扱わない書き方)は契約を付けず、
  その profile は Unknown のまま(すべて残す)
- 文字と子の要素が混ざった要素(`<p>text <a>link</a></p>`)はまだ測らない(Unknown)

## 何を残すか

ファーストビューを元の CSS と同じに描けることを優先し、**外してよいと示せなかったものはすべて残す**。

- 要素 E を残すのは、次のどれかのとき
  - ある profile のある画面の大きさで、E の border box の上端が画面の高さ以下になりうる(engine の配置の式の、領域の頂点で判定。
    上端は幅と高さのアフィン式なので、凸な領域での最小は頂点にある)
  - その profile の解析が Unknown(配置が決まらない。例: 測っていない文字、扱わない CSS)。その profile ではすべて残す
  - E に配置された箱がない(`display: none`・inline の要素・解析しなかった箱)。隠す規則そのものがファーストビューに要る
  - E か祖先が、ふつうの block の流れ(`display: block`・`flow-root`・`list-item`、`position: static`・`relative`、float なし)にない。
    flex や grid の項目は、兄弟の大きさで上の項目の大きさや位置が変わる。絶対配置や float の箱は、中身で幅が変わる
  - 祖先が、要素の高さで大きさの変わる背景(画像・グラデーション・mask・border-image)を描く。下の要素で高さが変わると、
    ファーストビューの色が変わる
- 残した要素の祖先も残す
- 規則は丸ごと残すか外すか。どれかのセレクタが残した要素に当たりうるなら残す(`:hover` などの状態や擬似要素は、当たるものとして
  数える)。解析が読めないセレクタと、入れ子の CSS は残す
- `@media`・`@supports`・`@container`・`@layer {…}` は中身ごとに分け、残る規則がなければ外す。`@font-face`・`@keyframes`・`@property`
  などのほかの at-rule は残す

## 確かめたこと

- `packages/veriss/test/critical.test.mjs`: 外れる規則と残る規則、Unknown・flex・グラデーション・隠れたメニュー・読めないセレクタ・
  `vw` で残すこと
- `e2e/layout-critical-css.spec.mjs`: 文字のない 3 つのページと、フォントで測る文のページ・自由な文のページ(空・短い・長い文に差し替えて描く)を、スマートフォンと PC の 8 つの大きさで、すべての CSS と抜き出した CSS だけで描き、
  Chromium・Firefox・WebKit で、ファーストビューに入る要素の箱と、画面の画素が同じ。どのページでも規則が外れる(空振りでない)。
  抜き出した CSS からファーストビューの規則を 1 つ消すと、画素が変わる

## 限界

- engine の配置が Unknown になるページ(フォントのファイルのない文、文字と要素が混ざった段落、`%` の padding など)では何も外れない(健全だが役に立たない)
- 規則の単位で残すので、ファーストビューの要素と画面の外の要素が同じ規則を使えば、その規則は残る
- `prefers-color-scheme` などの好み・印刷は、元の @media のまま残す(画面の大きさだけで判定する)
