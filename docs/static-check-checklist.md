# CSS × DOM 静的検査の実装チェックリスト

`docs/layout-checking.md` に書いた検査の、次に足すものの一覧。上から順に進め、1 項目ごとに TDD(ユニットテストを先に書く)、
3 つのブラウザー(Chromium・Firefox・WebKit)での照合、Chromium の layout e2e と component-lint 評価の確認をしてから push する。
どの項目も、決められないところは Unknown に残す(成功にしない)。

印: `[ ]` 未着手、`[~]` 一部済み、`[x]` 済み。

## A. アニメーションと CLS

- [x] **A1. `@starting-style` の配置の開始値と、現れるときのトランジション**: いまは Unknown。開始値から落ち着いた値への
  トランジションを、キーフレーム 2 つのアニメーションとして既存のシフト検査(easing の極値を含む)に通す。
  照合: 毎フレームの位置と報告の一致(3 ブラウザー)。
- [x] **A2. `animation-delay` と `animation-fill-mode`**: いまは読み捨てている。`forwards`/`both` は終わりの戻り(endJump)を
  消し、`backwards`/`both` と遅延は始まりの飛びの時刻を変える。スコア上限を正確にする(いまは大きめ)。
- [x] **A3. `animation-timeline: scroll()` / `view()`(スクロール連動)**: いまは Unknown。スクロールは CLS の「直前の入力」に
  入らないので、配置を変えるならシフトになる。進み具合 0〜1 の全体を通るアニメーションとして調べる(時間の上限は使わない)。
- [x] **A4. 区間や easing の違う複数プロパティの行き過ぎ**: いまは Unknown。各プロパティの極値の時刻 t を求め(x(s) を
  解く)、その時刻のほかのプロパティの値を外側に丸めて組み合わせる。
- [x] **A5. 単位の混ざる行き過ぎ(px ↔ %)**: `calc()` で補間できる配置に限って扱う。px と %・vw・vh の間は、単位ごとの量を別々に
  補間した `calc()`(負になれないプロパティで量が負なら `max(0px, …)`)を極値のフレームに置く。D2 で block flow の `%` の高さが
  解けるようになったので、高さの行き過ぎで下の箱が動くのを報告できる。3 つのブラウザーで、1ms ごとの高さが極値の範囲に入り、
  0.25px 以内で届くことを確かめた。flex の項目の幅の `max(0px, calc(…))` も D2 で解けるようになった。

## B. transform

- [x] **B1. 奥行きのない 3D の書き方**: `translateZ(0)`・`translate3d(x, y, 0)`・`scale3d(x, y, 1)`・`rotateZ()`・
  `rotate: z 90deg` は、`perspective` がなければ 2D と同じ。GPU 合成のための `translateZ(0)` はよく使われるのに Unknown になる。
- [x] **B2. 90° 単位でない回転とほかの transform の組み合わせ**: 合成した写像の外接矩形で、accessibility の検査だけで扱う
  (単独の任意角と同じ扱い)。
- [x] **B3. `transform-origin`(中心以外)**: いまは Unknown。原点を移した合成として扱う。

## C. カスケードと at-rule

- [x] **C1. `@supports` の判定表を広げる**: よく使う機能(`aspect-ratio`、`inset`、`color-mix()`、`:has()` 以外のセレクター、
  `text-wrap: pretty`、`field-sizing` など)を、3 ブラウザーの `CSS.supports()` で確かめて足す。
- [x] **C2. `@scope` の中の `:scope` と `&`**: `:scope` は根そのもの、`&` は `:where(:scope)`(詳細度 0。最初は根のセレクターの詳細度と読み違えていた。3 つのブラウザーで測って直した)。
- [x] **C3. 入れ子の `&` で、結合子を含む親が先頭以外にある場合**: セレクターの `:is()` に結合子を許す(いまは不可)。
- [x] **C4. `revert-layer`**: ひとつ前のレイヤーまでの値に戻す(層に入っていない規則では明示した層に戻る)。

## D. 配置のモデル

- [x] **D1. 0 以外のオフセットを持つ `position: relative`**(px。`%` と rtl の横のオフセットは残り): いまは Unknown(「Relative positioning spaces require zero
  offsets」)。箱だけが動くので、配置はそのままで、描画の位置をずらす。
- [x] **D2. flex の項目の `%` 幅と、`vw`・`em` の長さ**: `em` の長さと、縮まない(か min-width のある)flex の項目の `%` の幅は済み。
  block flow の中の `%` の高さ(親が高さを宣言しているとき。px でも vh でもよく、min/max で詰めたあとの内容の高さに対して)と、
  その高さでの px と % を混ぜた `calc()` も済み(3 つのブラウザーで、2 つの viewport の高さで位置と高さが一致)。
  flex の項目の `vw` の幅と `calc()`(px・%・vw・vh の和)の幅や basis も済み: `%` の basis と同じく、容器の内容の幅に対する
  viewport の式として解く(縮まないか、伸びるだけの場合。縮む項目どうしの重みが 1 つの幅の割合にならない場合は Unknown)。
  3 つのブラウザーで、2 つの viewport の幅で一致。grid の `%` の列・行と `%` の gap も、その軸の容器の大きさが 1 つの定数のとき
  (px の幅、宣言した px の高さ)は px に書き換えて解く。flex の column の項目の `%` の高さ・basis・min-height も、column の
  宣言した高さが定数なら同じく解く。viewport で変わる容器の `%` のトラック、
  高さが決まる flex・grid の項目(高さを宣言した 1 行の row で伸ばされる、高さを宣言した column で伸び縮みする、grid の領域に
  伸ばされる)の中の `%` の高さも、その高さに対して解く(3 つのブラウザーで一致。標準モードで測る。quirks モードの WebKit は auto に
  した)。flex の項目の `min()`・`max()`・`clamp()` の幅と basis も、区間ごとに分けて解く(A5 の `max(0px, calc(…))` の行き過ぎも
  これで解ける)。伸ばされない(align-self: start などの)grid・row の flex の項目の中の `%` の高さは auto になる(3 つのブラウザーで
  測った)ので、block の中の block と同じく `W_LAYOUT_DECLARATION_INERT` を出して auto として解く。
- [x] **D3. inline の中の行の配置**: 文字の行と inline の箱の位置。大きい。
  最初の一歩として、測った文字の中の inline の箱(`inlineBounds`)を `text-align: center`・`right`・`end` でも出す(以前は start と
  left だけ)。行の幅の区間で外接・内接をずらし、改行が揺れる幅は除く(ADR-0013)。3 つのブラウザーで一致。
  **誤りの修正**: inline の箱の上下の padding は行を動かさないが箱(描画と hit test)を上下に広げる(19px のリンクが 27px になる)のに、
  矩形に入れていなかった(覆いや focus の隠れの判定が甘くなる)。上下の padding だけ矩形を広げる。`vertical-align` が baseline・top・
  bottom 以外(super、sub、middle、text-top、長さ、%)の inline の箱は、行を高くする(24px → 29px など、ブラウザーで量が違う)のに、
  測った文字の高さのまま Verified にしていた。Unknown にする。`text-align: justify` は最後の行(1 行の文字列ではその行)が start に
  揃うので、そこに載る inline の箱の矩形を出す(前の行は単語の間が伸びるので出さない。Chromium で確認。折り返しの位置は
  ADR-0010 のとおり Chromium に合わせてあり、Firefox はこの文で別の幅で改行した)。inline の箱の左右の padding・border・margin は、
  一行の文字列で text 契約に `inline: {'.u': {text, edges: [margin-left, border+padding-left, border+padding-right, margin-right]}}`
  と測らせれば、行の幅に足し、後ろの箱をずらす(engine は CSS の値が契約と一致するときだけ受け入れる。Chromium・WebKit で一致、
  Firefox は 1/60px の丸めで 3/1000px ずれる)。同じ family・大きさで太さだけ違う inline の箱(`<strong>` など)は、一行の文字列で
  `inline: {'.u': {text, weight}}` と測らせれば、行を太さごとの run の和として測る(Chromium で日本語・Latin、Firefox・WebKit で
  Latin が一致)。大きさや family の違う inline は Unknown のまま(行が高くなりうる)。**誤りの修正**: 文字の中の画像・svg・
  フォーム部品などの置換要素(atomic inline)は、自分の幅だけ行を広げ、文字の ascent より高ければ行を高くする(24px の行に 40px の
  画像で Chromium 47px、Firefox・WebKit 46.5px)のに、文字の大きさのまま Verified にしていた。U_LAYOUT_INLINE にする(横に並べるなら flex・grid の項目にする)。
  一行の文字列で `inline: {'.i': {atomic: [幅, 高さ], at: 前の文字数}}` と測らせた画像・アイコンは、行の幅に足し、後ろの文字と箱を
  ずらし、baseline に置いた矩形を出す。行を高くしない高さ(baseline までの高さ以下。Chromium は 17px、Firefox・WebKit は 17.5px:
  ブラウザーで丸めが違うので小さい方)に限る(それより高いと行の高さがブラウザーごとに違う: 40px で Chromium 47px、ほか 46.5px)。
  engine は CSS の大きさが契約と同じで、端がなく、baseline に置かれるときだけ受け入れる。3 つのブラウザーで一致。
  rtl: ヘブライ文字と空白だけの文字列(見た目の順が論理順の逆になるだけで、bidi の並べ替えがない)は、`direction: rtl` で行の右端から
  鏡に映した矩形を出す(start = 右、center、end = 左。一行と折り返し。Chromium で確認。右から左の単語ごとの丸めを inline の端の
  誤差にも足した)。ラテン文字・数字・句読点を混ぜた rtl の文字列は矩形を出さない(bidi の並べ替えは測らない)。
  折り返す文字列の inline の箱の左右の端も、端を箱の最初と最後の文字に足して改行を求める(行数の profile、min-content、改行の位置、
  行の幅のすべてに入る)。Chromium・WebKit で 120〜900px の行数と矩形が一致。
  折り返す文字列の太さの違う inline の箱も、太さの run を shaping の run として分けて改行を求め、行ごとに run の和で位置を出す
  (行が太さの run を切る行には矩形を出さない)。Chromium・WebKit で行数と矩形が一致。
  折り返す文字列の画像・アイコンも、U+FFFC の置き場所として改行を求める(3 つのブラウザーとも、空白がなくても画像の前後で改行できた:
  前後を改行の機会にし、幅は追加の advance、shaping からは除く)。Chromium・WebKit で行数と矩形が一致。
  意図して Unknown のまま残すもの: 行を高くする画像(行の高さがブラウザーごとに違う)、bidi の混ざった rtl の文字列(並べ替えを
  測らない)、大きさや family の違う inline。

## E. 新しい警告のパターン

- [x] **E1. スクロールバーの出現によるシフト**(`W_LAYOUT_SCROLLBAR_SHIFT`): 内容の高さが viewport を超えうるのに
  `scrollbar-gutter: stable` も `overflow-y: scroll` もないページは、通常のスクロールバーの環境で、超えた瞬間に幅が変わる。
  解析の報告に `pageScroll`(viewport に収まる場合があるか、超える場合があるか、html が溝を保つか)を出し、
  adapter-core が状態の間で比べる。ある状態では収まり別の状態では超えるとき警告する(viewport の大きさを変えたときの変化は、
  利用者の操作なので報告しない)。`overflow: hidden` はスクロールバーを出さないので対象外。Chromium の通常のスクロールバーで、
  body の幅が変わるところと警告が一致することを確かめた(`html` の `clientWidth` は stable でもスクロールバーが出るまで溝を含むので、
  箱の幅で比べる)。
- [x] **E2. 同じ規則の中で、一括指定が先に書いた個別指定を上書きする**(`padding-top: 10px; padding: 0`)ので、個別指定が効かない。**既存の `E_CSS_SHORTHAND_CONFLICT` が、同じ規則の中の一括指定と個別指定を順番によらず報告していた**(新しく作る必要はなかった)。
- [x] **E3. `text-wrap: balance` の行数の上限**: Chromium と Firefox は 6 行を超える段落では揃えない(WebKit は長くても揃える)。長さの上限のない動的な文に付けた場合を `W_LAYOUT_BALANCE_LINES` で警告する。
- [x] **E4. `transition` が `prefers-reduced-motion: reduce` で止まらない長い動き**: アニメーションと同じく 5 秒を超える場合。
  `W_A11Y_TRANSITION_MOTION`。箱を動かすプロパティ(位置・大きさ・余白・transform、`all`)の transition だけを数え、色と opacity の
  変化は動きではないので除く。reduce の下で `transition: none` か 5 秒以下になれば報告しない。
- [x] **E5. レイアウトが Unknown でも文字のコントラストを見る**(`W_A11Y_CONTRAST_UNPLACED`、ADR-0016 M7): 今までは配置が Unknown だと
  a11y の規則が一つも走らなかった。style の段の行(箱と state ごとの、祖先の塗りの鎖)で `rules/contrast.mjs` を走らせ、基準を下回る
  文字を警告にする(幾何がないので、祖先でない箱が後ろにないことは示せない。error にはしない)。決められないもの(画像やフィルター、
  不透明な背景の上の positioned)は報告しない。閉じた details の中身と content-visibility: hidden の中は描かれないので除く。
  3 ブラウザーで、文字の横(padding)の背景の画素と計算値の色から比を出し、警告の箱と一致することを確かめた
  (`e2e/layout-accessibility.spec.mjs` の M7 の検査)。


## F. ブラウザーが受け入れるのに何もしない CSS

ブラウザーは文法として受け入れるが、効果のない書き方。打ち間違いや値の入れ違いで起きやすい。3 つのブラウザーで、警告が出るところで
宣言の効果がないことを確かめた(`e2e/layout-css-mistakes.spec.mjs`)。

- [x] **F1. `@keyframes` のないアニメーション名**(`W_CSS_KEYFRAMES_MISSING`): 名前は大文字小文字を区別する。並びの中の 1 つだけでも報告する。
- [x] **F2. 長さのないアニメーション**(`W_CSS_ANIMATION_NO_DURATION`): `animation: spin infinite` は 0s で、何も見えない。
  `fill-mode: forwards`・`both` の 0s(終わりの状態を当てる書き方)とスクロール連動は除く。
- [x] **F3. 値も代わりもない `var()`**(`W_CSS_VAR_INVALID`): 計算値の時点で無効になり、その宣言は unset(継承か初期値)になる。
  解析は以前から unset として扱っていた(`invalidSubstitutions`)が、警告にしていなかった。
- [x] **F4. min より小さい max**(`W_LAYOUT_MIN_ABOVE_MAX`): 大きさは max で詰めてから min に広げるので、いつも min になる(width や
  内容が効かない)。「max が効かない」のではない(width: 80px は max で詰められてから min の 50px になる。max がなければ 80px):
  最初にそう書いて測り、誤りに気付いた。
- [x] **F5. どの viewport にも当たらない `@media`**(`W_CSS_MEDIA_NEVER`): 下限が上限より上(`min-width: 900px` と
  `max-width: 600px`、`width > 600px` と `width < 600px`)。並びのどれかが当たりうるなら報告しない(`print` を含む)。
- [x] **F6. 同じ規則で 2 回書いたプロパティ**(`W_CSS_DUPLICATE_DECLARATION`): 前の宣言は効かない(後が勝つ。`!important` なら前が
  勝ち、後が効かない)。後の値が新しい関数・単位・キーワードやベンダー接頭辞(`100vh` のあとの `100dvh` など)なら、古い
  ブラウザーのための代わりの書き方なので報告しない。
- [x] **F7. 重ならない `z-index`**(`W_LAYOUT_DECLARATION_INERT`): position: static で flex・grid の項目でもない箱の `z-index` は
  重なりの順を変えない。3 つのブラウザーで、hit test の一番上の箱が警告と一致した(relative にするか、flex・grid の項目なら効く)。
- [x] **F8. auto(や none)と長さの間の transition**(`W_CSS_TRANSITION_AUTO`): `height: auto` から `:hover` の `100px` などは
  補間されず、箱は跳ぶ(3 つのブラウザーで測った。`interpolate-size: allow-keywords` で動くのは Chromium だけ)。`:hover`・`:focus`
  の値と比べ、コンポーネントの状態の間(クラスの切り替え)は adapter-core が状態ごとの値(`transitionSizes`)を比べる。
  状態のない素の HTML でも、スタイルシートが名指すクラスの切り替え(`.panel` の要素に `.panel.open` の規則)は、そのクラスを
  足した計算値と比べる(その要素がすでに持つクラスを含む規則に限る)。
- [x] **F9. content のない `::before`・`::after`**(`W_CSS_PSEUDO_NO_CONTENT`): ほかのプロパティを書いても、content がなければ
  作られない。grid や flex の container(body を含む)の擬似要素も同じ(M6 まで、配置が検証できたときは葉と inline の擬似要素だけを見ていた。3 ブラウザーで、content のない body::before は作られず、.a の位置が変わらないことを測った: `e2e/layout-css-mistakes.spec.mjs`)。
- [x] **F11. 配置が Unknown でも報告する**: 配置の前に Unknown になる入力(配置を変える `:focus` の規則など)では、box ごとの警告(F2〜F4・
  F7・F8)が出なかった。style の検査は配置とは別の 1 本の walk(全 box・全 state)で行うので、配置が Unknown でも検証できても同じ警告が出る(ADR-0016 M6)。
- [x] **F12. 長さのない transition**(`W_CSS_TRANSITION_NO_DURATION`): `transition: opacity` は 0s で、変化は一度に起きる。
  一括指定の各項目に時間がない場合と、`transition-property` だけで長さがない場合。明示した `0s` は意図とみなして報告しない。
- [x] **F13. 決まりすぎた絶対配置**(`W_LAYOUT_DECLARATION_INERT`): 両側の inset と大きさを全部書いた absolute・fixed の箱は、
  終わりの側(ltr では right、rtl では left、縦は bottom)が無視される(auto の margin があれば中央寄せに使われるので除く)。
  3 つのブラウザーで、無視される側を外しても位置が変わらないことを確かめた。
- [x] **F14. 線の種類のない border の幅**(`W_CSS_BORDER_NO_STYLE`): `border-style` は初期値 none なので、`border-width: 2px`
  - 健全性の修正(vlmkit から実ページに当てて発見): `var()` を含む `border` の一括指定(`border: 5px solid var(--c)`)の後の `border-width` で、style を none と読んで幅を 0 にしていた(verified で 20px、3 ブラウザーは 25px)。`var()` の一括指定は書く個別プロパティを `initial` で展開して決めるが、`initial` / `unset` の `border` が幅と style の内部の値を書いていなかった
  - 誤検出の修正: 素の `:focus-visible { outline }`(主語が何でもよい状態のセレクタ)を、フォーカスできない要素ごとに `W_CSS_STATE_UNREACHABLE` と報告していた(kanban のデモで 350 件)
  だけでは線は描かれず幅も 0(解析もそう配置する)。幅を書いた辺のうち、使われる幅が 0 の辺を報告する。
- [x] **F15. 画像のない背景の大きさ・位置**(`W_LAYOUT_DECLARATION_INERT`): `background-size`・`-position`・`-repeat`・
  `-attachment`・`-origin` は `background-image` がなければ何もしない。`:hover` などの状態や media 条件で画像を当てる規則が
  その要素にあれば報告しない。
- [x] **F16. 線のない装飾の色・種類・太さ**(`W_LAYOUT_DECLARATION_INERT`): `text-decoration-color`・`-style`・`-thickness`
  は継承せず、その要素自身の装飾の線にだけ効くので、`text-decoration-line` が none なら何もしない。3 つのブラウザーで、
  これらの宣言を外しても描画が同じことを確かめた。
- [x] **F17. フォーカスできない要素の `:focus`**(`W_CSS_STATE_UNREACHABLE`): tabindex がなく、リンク・ボタン・フォーム部品・
  - 誤検出の修正: `overflow: auto` / `scroll` の箱の `:focus`。スクロールしてフォーカスできる子がなければ Chromium と Firefox は Tab でフォーカスを移す(実測。WebKit は既定で Tab がボタンにも移らず判定できない)。スクロールするかは配置で決まるので報告しない。`:focus-within` も同じで、要素自身か中にスクロールする箱があれば報告しない(`overflow-y: hidden` だけでは `overflow-x` が auto に計算され、スクロールしうる箱になる。e2e で 3 ブラウザー)
  summary でもない要素の `:focus`・`:focus-visible` は当たらない(href のない `a` も)。動的な tabindex、iframe・動画などの
  フォーカスを記録していない要素は除く。3 つのブラウザーで、クリック・Tab・focus() のどれでもフォーカスされなかった。
- [x] **F18. `pointer-events: none` の要素の `:hover`**(`W_CSS_STATE_UNREACHABLE`): 子のない要素ではポインターが当たらず、
  `:hover` は当たらない(子があれば、子の hover が親に伝わりうるので除く)。
- [x] **F19. 当たらない `:checked`・`::placeholder`**(`W_CSS_STATE_UNREACHABLE`): `:checked` はチェックボックス・ラジオ・
  option にしか当たらない(role="checkbox" の div でも)。`::placeholder` は placeholder 属性のある文字欄・textarea にしかない。
  `:active` も `:hover` と同じく `pointer-events: none` の子のない要素には当たらない。
- [x] **F20. `:visited` の色でない宣言**(`W_CSS_VISITED_IGNORED`): 訪れたリンクを読み取られないよう、ブラウザーは `:visited`
  の規則のうち色(color、background-color、border・outline の色など)しか当てない。ほかの宣言を報告し、ブラウザーと同じく
  捨てる(以前は `:visited` を読めず Unknown)。3 つのブラウザーで、実際に訪れたリンクの色は変わり、幅(太さ・字間)は
  変わらないことを確かめた。
- [x] **F21. `:disabled`・`:enabled` を読む**(以前は Unknown): フォーム部品の disabled 属性と、disabled な fieldset の中
  (最初の legend の中は除く)、disabled な optgroup の中の option。disabled な select の中の option・optgroup は Chromium・WebKit
  が `:disabled` にし Firefox はしない(測った)ので、そこに頼る規則は Unknown。アダプターの式の disabled も Unknown。
  3 つのブラウザーの `matches()` と 11 の要素で一致。
- [x] **F22. `::marker` を読む・効かない宣言**(`W_CSS_MARKER_IGNORED`、以前は Unknown): `::marker` は色・content・font・
  white-space・アニメーションなどしか取らない。margin・padding・背景・大きさ・display は描画を変えない(3 つのブラウザーで
  測った)ので報告して捨てる。font-size や line-height など marker を大きくする宣言は、行の高さを変え(量はブラウザーで違う)、
  marker の箱は配置しないので Unknown。リスト項目でない要素の `::marker` は当たらない(`W_CSS_STATE_UNREACHABLE`)。
- [x] **`:target` を読む**(以前は Unknown): URL に fragment がないとして扱う状態(`:hover` と同じく、色だけの規則は描画の
  状態として受け、配置を変える規則は Unknown)。
- [x] **F23. 文字欄の `user-select: none`**(`W_LAYOUT_DECLARATION_INERT`): 文字欄・textarea の文字は選択も編集もできる
  ままで、何もしない(3 つのブラウザーで、3 回のクリックで 11 文字が選ばれた)。
- [x] **F24. 幅のない表の `table-layout: fixed`**(`W_LAYOUT_DECLARATION_INERT`): 固定の配置は表の幅が要る(CSS 2.2 §17.5.2)。
  width: auto の表では列は中身で決まる(3 つのブラウザーで、fixed を外したときと同じ列幅)。
- [x] **F25. 線を重ねた表の `border-spacing`**(`W_LAYOUT_DECLARATION_INERT`): `border-collapse: collapse` ではセルが線を
  共有し、間隔は何もしない(3 つのブラウザーで同じ位置)。
- [x] **F26. HTML の解析が補う tbody を飛ばす子の結合子**(`W_CSS_SELECTOR_IMPLIED_PARENT`): 行を table の直下に書いた
  HTML でも、解析は tbody を挟むので `table > tr`(や `.t > .r`)は当たらない。ソースに開始タグのない tbody・tr・colgroup を
  補われた要素として記録し、それを飛ばせば当たる選択子を報告する(3 つのブラウザーの `querySelector` と一致)。DOM の API で
  組み立てる UI ライブラリ(React など)は tbody を挟まないので、アダプターの木には印を付けない(HTML の解析を通るときだけ)。
  **見逃しの修正**: 以前は tbody の直下の子(行)を主語にするセレクタしか調べず、`.t > .r > td` や `table > tr .x` のように
  飛ばす結合子がセレクタの途中にあるものを報告しなかった。補われた要素を祖先に持つすべての箱を、補われた要素を抜いた
  ソースどおりの祖先の鎖で照合する。Chromium の `querySelector` と、主語がセルとその中の要素の 9 通り(対照 4 つ)で一致
- [x] **F27. HTML の解析が書いた構造を変える**(`W_HTML_RESTRUCTURED`): `<p>` の中の `<div>` は段落を閉じ、`</p>` は空の
  `<p>` になる。入れ子の `<a>` は外の `a` が早く閉じる。ソース上の位置のない要素と、終了タグの要る要素で解析が早く閉じたものを
  報告する(終了タグを省ける要素・空要素・SVG は除く)。表の中でセルの外に書いた要素は表の前へ移され(foster parenting)、
  form の中の `<form>` 開始タグは捨てられる(内側の action などが失われる):ソースの位置から見つける。解析も、ブラウザーと
  同じく解析後の木を配置する。3 つのブラウザーの DOM と一致。
- [x] **F28. 当てはまらない要素の見た目の属性**(`W_HTML_ATTRIBUTE_INERT`、以前は Unknown): `width`・`height` は画像・表・
  セル・埋め込みなどにしか、`bgcolor` は body と表の要素にしか、`border` は画像・表などにしか効かない(HTML rendering §15)。
  div などのそれは何もしないので、Unknown にせず報告する(当てはまる要素では今までどおり Unknown)。3 つのブラウザーで描画が
  属性のないときと同じ。
- [x] **F29. 空白だけの要素に `:empty`**(`W_CSS_EMPTY_WHITESPACE`): `:empty` は空白(スペースや改行)を中身として数えるので、
  `<div class="x"> </div>` には当たらない。コメントだけなら当たる。3 つのブラウザーで同じ結果を測った。
- [x] **F30. 置き換え要素・フォーム部品の `display: contents`**(`W_LAYOUT_CONTENTS_REMOVED`): img・input・textarea・select・
  video・iframe・canvas・progress・meter・br・audio・object・embed などは、子を代わりに出せないので `display: none` になる
  (CSS Display 付録 B)。解析もそのとおり none として配置する。3 つのブラウザーで 0×0 を測った(button・fieldset・ul・li・
  details・table は子が出るので報告しない)。
- [x] **F31. 表の `overflow: auto`・`scroll`**(`W_LAYOUT_DECLARATION_INERT`): 表は中身に合わせて広がる(幅は最小値)ので、
  スクロールしない。3 つのブラウザーで visible と同じ(はみ出しも切られない。hidden・clip は切る)。解析も visible として扱う。
  スクロールさせるには、表を `overflow-x: auto` の div で包む。片方の軸が hidden・clip の組み合わせは測っていないので今までどおり。
- [x] **F32. 擬似要素を描かない要素の `::before`・`::after`**(`W_CSS_PSEUDO_NOT_RENDERED`、以前は Unknown): 読み込んだ img、
  文字欄の input(text・email・password・search・tel・url・number)、select・textarea・iframe・video・br・canvas は、content が
  あっても `::before`・`::after` を描かない(3 つのブラウザーで、規則のあるときとないときの描画が同じ)。解析も生成しない。
  読み込めなかった img(Chromium・Firefox は描く)と、appearance: auto の checkbox・radio(Chromium・WebKit は描く)は
  ブラウザーで違うので今までどおり。
- [x] **F33. 描かれない兄弟で外れる `:last-child`・`:nth-child`**(`W_CSS_CHILD_INDEX_HIDDEN_SIBLING`): template・script・style・
  link・meta は描かれない(display: none)が、`:first-child`・`:last-child`・`:only-child`・`:nth-child` の数には入る。それらが
  なければ当たる規則を報告する(`-of-type` は別の要素名なので影響しない)。また `template`(shadowrootmode のないもの)を
  UA の display: none として扱い、Unknown にしない(author の display は今までどおり Unknown)。3 つのブラウザーで測った。
- [x] **F34. flex・grid の容器の `columns`**(`W_LAYOUT_DECLARATION_INERT`、以前は Unknown): 段組みはブロック容器にしか
  効かない。flex・grid の容器の `columns`・`column-count`・`column-width` は、3 つのブラウザーで項目の位置がないときと同じ。
  解析はそれを捨てて配置する(ブロック容器の段組みは今までどおり Unknown)。
- [x] **F35. フォーカスできるもののない要素の `:focus-within`**(`W_CSS_STATE_UNREACHABLE`): その要素にも中にも、href のある
  リンク・フォーム部品・tabindex がなければ、何もフォーカスを持たないので当たらない(外から渡される slot・children が
  あれば報告しない)。あわせて F17 を直した: `tabindex="-1"` の要素はクリックや focus() でフォーカスを持つ(3 つのブラウザーで
  測った)ので、その `:focus` は報告しない。
- [x] **F36. inline の要素の `:hover`・`:focus` の transform**(`W_LAYOUT_DECLARATION_INERT`、state 付き): 文の中のリンクや
  span(display: inline)には transform・translate・rotate・scale が効かないので、`a:hover { transform: translateY(-2px) }` の
  持ち上げは見えない(3 つのブラウザーで、hover しても位置が同じ)。同じ規則で display を変えるもの、inline-block・置き換え
  要素は報告しない。配置が Unknown でも、文の中の要素まで見て報告する。
- [x] **F37. ブロック容器でない要素の `::first-letter`・`::first-line`**(`W_CSS_STATE_UNREACHABLE`、以前は Unknown): この 2 つは
  ブロック容器(block・inline-block・list-item・表のセルなど)にしかない。display: inline・flex・grid の要素では何も変わらない
  (3 つのブラウザーで、規則のあるときとないときの描画が同じ)。その要素だけなら報告して配置を続ける。ブロック容器に当たる
  ときは、変わる最初の文字・行を解析しないので今までどおり Unknown。
- [x] **F38. 中央に寄らない絶対配置の `margin: auto`**(`W_LAYOUT_AUTO_MARGIN_ABSOLUTE`): 絶対配置・固定配置の箱の auto の
  margin は、その軸の両方の inset(left と right、top と bottom)と大きさが決まっているときにだけ中央に寄せる。どれかが auto なら
  margin は 0 で、箱は流れの中にいたはずの位置に残る(CSS 2.2 §10.3.7・§10.6.4、3 つのブラウザーで測った)。寄らない軸を報告する。
- [x] **F39. `object-fit: fill` の `object-position`**(`W_LAYOUT_DECLARATION_INERT`): fill(初期値)は画像を箱いっぱいに
  引き伸ばすので、置く場所がない。contain・cover・none・scale-down では効く(3 つのブラウザーで、fill のときだけ描画が同じ)。
- [x] **F40. `place-items`・`place-content`・`place-self` を読む**(以前は Unknown): `<align> [<justify>]` の一括指定を
  align-*・justify-* に分けて読む(CSS Box Alignment 3 §5.3。place-content の baseline 1 つは justify が start)。
  分けたあとは今までの検査がそのまま効く(ブロック容器の place-items は align-items が効かないと報告する)。3 つのブラウザーで、
  一括指定と個別指定の配置が同じことを確かめた。
- [x] **F41. 図形が自分の属性を持つ svg の `fill`・`stroke`**(`W_LAYOUT_DECLARATION_INERT`): svg に書いた fill・stroke は継承で
  図形に届くだけなので、すべての図形(か、それを囲む g)が fill・stroke 属性を持つと何も変わらない(3 つのブラウザーで測った。
  属性が inherit のとき、属性のない図形があるとき、図形を直接選ぶ規則があるときは報告しない)。
- [x] **F42. ブラウザーが描く checkbox・radio の背景・色・線・内側の余白**(`W_LAYOUT_DECLARATION_INERT`): appearance: auto の
  checkbox・radio は、background-color・color・border・padding で描画も大きさも変わらない(3 つのブラウザーで、画素も
  大きさも後ろの要素の位置も同じ)。accent-color か appearance: none を勧める。あわせて、ブラウザーの checkbox の配置
  (accessibility の検査)が padding・border のある書き方でも働くようにした。(box-shadow は WebKit だけ描かないので除いた。)
- [x] **F43. 表のセルの最小・最大の大きさ**(`W_LAYOUT_DECLARATION_INERT`、高さは以前 Unknown): セルの min-height・max-height は
  何もしない(行の高さで決まる)。table-layout: fixed(幅のある表)では min-width・max-width も何もしない。3 つのブラウザーで、
  auto・fixed の両方の表で測った(auto の表の min-width・max-width は効くので報告しない)。高さの上下限は捨てて配置する。
- [x] **F44. `pointer-events: none` の要素の `cursor`**(`W_LAYOUT_DECLARATION_INERT`): 出るカーソルはポインターの下の要素の
  もので、pointer-events: none(継承も)の要素はポインターに当たらないので、その cursor は出ない(子の要素がなく、
  pointer-events を取り戻せないとき)。3 つのブラウザーで、その要素の中心の当たり判定が下の要素になることを測った。
- [x] **F45. inline の要素の `text-align`・`text-indent`・`text-align-last`**(`W_LAYOUT_DECLARATION_INERT`、後ろの 2 つは以前
  Unknown): これらはブロック容器の行を揃え・字下げするので、子の要素のない display: inline の要素(span・a)では何も
  変わらない(3 つのブラウザーで描画が同じ)。text-indent・text-align-last はそのときだけ捨てて配置し、ブロックでは今までどおり
  Unknown。
- [x] **F46. `::selection` を読む・効かない宣言**(`W_CSS_SELECTION_IGNORED`、以前は Unknown): ::selection は選んだ文字に色を
  塗るだけで、配置を変えない(利用者の操作で、解析する状態ではない)ので、カスケードから外して読む。その中の font-size・
  font-weight・letter-spacing・opacity・padding・border・margin・outline は 3 つのブラウザーで何も変えないので報告する
  (測るとき、WebKit は ::selection の規則があるだけで選択の塗りが変わるので、性質のない ::selection の規則と比べた)。
- [x] **F47. `::placeholder` の効かない宣言**(`W_CSS_PLACEHOLDER_IGNORED`): 入力欄の中に描く placeholder には margin・height・
  display・position が効かない(3 つのブラウザーで、性質のない ::placeholder の規則と比べて画素も欄の大きさも同じ)。
  padding・border・width はブラウザーで違う(Chromium・WebKit は padding を描く)ので報告しない。
- [x] **F48. `:link`・`:any-link` を読む・リンクでない要素**(`W_CSS_STATE_UNREACHABLE`、以前は Unknown): この 2 つは href の
  ある a・area にだけ当たる(空の href も。3 つのブラウザーで測った)。href のない a や button に書くと当たらないので報告する。
  解析はリンクを未訪問とみなすので :link は :any-link と同じに読むが、配置を変える :link の規則は訪問の履歴で変わるので Unknown。
- [x] **F49. `:placeholder-shown` を読む・placeholder 属性のない欄**(`W_CSS_STATE_UNREACHABLE`、以前は Unknown): 文字の欄
  (text・search・url・tel・email・password・number)と textarea で、placeholder 属性があり(空でも)、値が空のときに当たる
  (3 つのブラウザーで測った)。属性のない欄では当たらない(浮く label の作り方で placeholder=" " を忘れる)ので報告する。
  入力すると外れるので、配置を変える規則は Unknown。値が分からないとき(動的な value、空白だけの textarea)も Unknown。
- [x] **F50. `:required`・`:optional` を読む・フォームの欄でない要素**(`W_CSS_STATE_UNREACHABLE`、以前は Unknown): :required は
  required 属性のある select・textarea・input(required を取る型。readonly・disabled でも)に、:optional はそれ以外の
  input・select・textarea に当たる(3 つのブラウザーで測った)。label や div、required を無視する型(range・color・hidden・
  ボタン)に書くと当たらないので報告する(`label:required::after { content: "*" }` の書き間違い)。required を取らない型の
  input と button の :optional は Firefox だけ当たらないので Unknown。
- [x] **F51. html と body の両方の overflow で止まる sticky**(`W_LAYOUT_STICKY_SCROLLER`): body の overflow は html の overflow が
  visible のときだけ viewport に移る。`html, body { overflow-x: hidden }` のように両方に書くと、body が内容と同じ高さの
  スクロール容器になり、sticky の見出しは body に貼り付いてページと一緒に流れる(3 つのブラウザーで、500px 送ると見出しが
  上に消える。clip はスクロール容器を作らないので貼り付く)。配置が Unknown でも報告する。
- [x] **F52. 無効な `grid-template-areas`**(`W_CSS_GRID_AREAS_INVALID`、以前は Unknown): 行ごとに区画の数が違う、または同じ名前が
  1 つの長方形にならない値は、宣言ごと捨てられる(3 つのブラウザーで CSS.supports が false、配置が宣言のないときと同じ)。
  解析も読むときに捨て、そこで名付けた grid-area は分からなくなる(自動で並ぶ)と報告する。
- [x] **F53. ブロックの流れの中の縦の `margin: auto`**(`W_LAYOUT_DECLARATION_INERT`、以前は Unknown): 流れの中のブロックの
  margin-top・margin-bottom の auto は 0 で、縦に中央へ寄せない(CSS 2.2 §10.6.3。3 つのブラウザーで、flow-root・
  overflow: hidden の親でも同じ。flex・grid では寄る)。解析も 0 として配置し、位置がブラウザーと同じことを確かめた。
- [x] **F54. flex・grid の項目の `clear`**(`W_LAYOUT_DECLARATION_INERT`、以前は Unknown): 項目には float が効かないので、
  clear で避けるものがない(3 つのブラウザーで、横に float があってもなくても配置が同じ)。捨てて配置する。ブロックの流れの
  clear は float を解析しないので今までどおり Unknown。
- [x] **F55. 高さのない親の中の relative の `top`・`bottom` の %**(`W_LAYOUT_DECLARATION_INERT`、以前は Unknown): % は包含ブロックの
  高さに対する値で、ブロックの流れの中の高さ auto の親では決まらないので auto になり、箱は動かない(3 つのブラウザーで同じ)。
  解析も auto として配置し、位置がブラウザーと同じことを確かめた。親が伸びる grid・flex の項目なら高さが決まり、Chromium・
  Firefox は % を解く(WebKit は解かない)ので、親自身がブロックの流れの中にあるときだけ扱う。
- [x] **F56. 高さのない親の中の `height` の %**(`W_LAYOUT_DECLARATION_INERT`、以前は Unknown): height・min-height・max-height の %
  は親の高さに対する値で、ブロックの流れの中の高さ auto の親(min-height があっても)では決まらないので、height は auto、
  min-height は 0、max-height は none になる(CSS 2.2 §10.5。3 つのブラウザーで、大きさと後ろの要素の位置が解析と同じ)。
  F55 と同じく、親自身がブロックの流れの中にあるときだけ扱う(grid の中では親の高さが決まって % が効く)。
- [x] **F57. inline の要素の `overflow`・`text-overflow`・`resize`**(`W_LAYOUT_DECLARATION_INERT`): これらはブロック容器(と置き換え
  要素)にしか効かないので、display: inline の span・a では切り取りも省略記号もスクロールも起きない(3 つのブラウザーで描画が
  同じ。inline-block では効く)。解析も初期値として扱う。絶対配置・float・flex や grid の項目は block になるので除く。
- [x] **F58. 先祖の線を消せない `text-decoration: none`**(`W_LAYOUT_DECLARATION_INERT`): text-decoration: none は自分の線だけを
  消すので、自分に線がなく(リンクの UA の下線や、ほかの規則を上書きしていない)、先祖が線を引いているとき(`a span {
  text-decoration: none }` など)は何も変わらない(3 つのブラウザーで、inline・inline-block・block の子のどれでも描画が同じ)。
- [x] **F59. 線を重ねた表の `border-radius`**(`W_LAYOUT_DECLARATION_INERT`): border-collapse: collapse の表では、border-radius で
  表の線は丸くならない(3 つのブラウザーで、背景のない表の描画が同じ。背景だけは丸く切られる)。separate と border-spacing: 0
  にするか、丸い div で包むことを勧める。同じ表に radius 0 の規則があれば報告しない。
- F9 を直した: 解析が読めない content(`attr(data-tip)` など)を書いた ::before・::after を「content がない」と報告していた。
  content を書いた規則に当たる擬似要素は報告しない(その配置は今までどおり Unknown)。
- [x] **F60. 表の `gap`、線を重ねた表の `padding`**(`W_LAYOUT_DECLARATION_INERT`、padding は以前 Unknown): 表のセルの間は gap では
  空かず(border-spacing を使う)、border-collapse: collapse の表には padding がない(3 つのブラウザーで配置が同じ。separate の表の
  padding は効く)。collapse の表の padding は 0 として配置する。(表の aspect-ratio は WebKit だけ効くので除いた。)
- [x] **F61. `:read-write`・`:read-only` を読む・書けない要素の `:read-write`**(`W_CSS_STATE_UNREACHABLE`、以前は Unknown):
  :read-write は readonly でも disabled(fieldset から受けるものも)でもない textarea と文字の input(text・search・url・tel・
  email・password・number・date)に当たり、ほかはすべて :read-only(3 つのブラウザーで測った)。div・button・checkbox・range に
  :read-write を書くと当たらないので報告する。contenteditable、動的な disabled、測っていない型(time など)は Unknown。
- [x] **F62. `:lang()` を読む・国の符号を書いた `:lang`**(`W_CSS_LANG_CODE`、以前は Unknown): :lang(ja) は、いちばん近い lang
  属性が ja か ja- で始まる要素に当たる(大文字小文字を区別しない。3 つのブラウザーで測った)。:lang(zh-TW) と lang="zh-Hant-TW"
  のような拡張の一致は Chromium だけ違うので Unknown、動的な lang やコンポーネントで lang が木にないときも Unknown。
  :lang(jp)・cn・cz・gr・dk・ua は国の符号で言語の符号でない(日本語は ja)ので報告する。
- [x] **F63. `:dir()` を読む・CSS の direction だけの rtl**(`W_CSS_STATE_UNREACHABLE`、以前は Unknown): :dir() は dir 属性
  (継承、大文字小文字を区別しない)で決まり、CSS の direction では変わらない(3 つのブラウザーで測った)。direction: rtl だけで
  dir="rtl" のない要素の :dir(rtl) は当たらないので報告する。dir=auto(文字で決まる)やコンポーネントで dir が木にないときは Unknown。
- [x] **F64. HTML の属性にした DOM の性質**(`W_HTML_ATTRIBUTE_NOT_HTML`、indeterminate は以前 Unknown): checkbox の indeterminate、
  textarea・select の value、React の defaultValue・defaultChecked は、HTML に書いても何もしない(3 つのブラウザーで、
  indeterminate は false、textarea は空、select は最初の option)。script で性質を設定するか、HTML の書き方(textarea の中身、
  option の selected、value、checked)を勧める。
- [x] **F65. 取らない要素の `disabled`・`checked`・`selected`**(`W_HTML_ATTRIBUTE_NOT_HTML`、selected は以前 Unknown): disabled は
  button・input・select・textarea・option・optgroup・fieldset にしか効かず、a や div に書いてもフォーカスでき押せる(:disabled にも
  ならない)。checked は checkbox・radio に、selected は option にしか効かない(3 つのブラウザーで測った)。
- [x] **F66. 文字を入れない部品の `readonly`**(`W_HTML_ATTRIBUTE_NOT_HTML`): readonly は文字の編集を止めるだけで、checkbox・
  radio・select はクリックや選択で変わる(3 つのブラウザーで測った。文字の input・textarea では止まる)。disabled を勧める。
- [x] **F67. 出ない `placeholder`、数の欄の `maxlength`**(`W_HTML_ATTRIBUTE_NOT_HTML`、maxlength は以前 Unknown): placeholder は
  文字の欄・number・textarea にしか出ず、select・checkbox・date・range では何も出ない。maxlength は文字の欄にしか効かず、
  number の欄には何桁でも入る(3 つのブラウザーで測った)。label・最初の option、number には max を勧める。
- [x] **F68. `input type=hidden` を読む・その display**(`W_LAYOUT_DECLARATION_INERT`、以前はページごと Unknown): hidden の input
  は UA の display: none !important で、author の display(!important でも)では出ない(3 つのブラウザーで測った)。解析も常に
  display: none として扱い(フォームの CSRF トークンなどでページが Unknown にならない)、display を書いたら報告する。
- [x] **F69. `datalist` を読む**(以前はページごと Unknown): datalist は UA の display: none で、option は欄の候補にだけ出る
  (3 つのブラウザーで、後ろの要素の位置が datalist のないときと同じ)。解析も描かない箱として扱い、`list` 属性も受け付ける。
  author が display を書いたときは今までどおり Unknown。
- [x] **F70. `:nth-child(An+B of S)` を読む**(以前は Unknown): of S のある :nth-child・:nth-last-child は、S に当たる兄弟だけを
  数える(3 つのブラウザーで測った)。詳細度は S のいちばん強いものを足す。S が状態や結合子を含むときは今までどおり Unknown。
  解析した高さがブラウザーと同じことを確かめた。
- 健全さを直した: 表の行・行のまとまり・列の `visibility: collapse` を hidden(場所を取る)として配置していたが、3 つのブラウザーで
  行はなくなる(次の行が上がる)。flex の項目の collapse は Firefox だけ詰める。どちらも Unknown にした(ほかの箱では hidden)。
- [x] **F71. `canvas` を読む・引き伸ばされる canvas**(`W_LAYOUT_IMAGE_DISTORTED`、以前は Unknown): CSS で幅と高さを決めた
  canvas を配置する。canvas は width・height 属性(ない・不正なら 300×150)の bitmap を object-fit(初期値 fill)で箱に描くので、
  箱の形が bitmap と違うと絵が伸びる(3 つのブラウザーで、contain と描画が違うのは形が違うときだけ)。測るとき、setContent は
  ページの大域を残すので、script の const はブロックに入れた。
- [x] **F72. 先祖の後ろに回る負の `z-index`**(`W_LAYOUT_NEGATIVE_Z_BEHIND`): 位置指定の箱の z-index: -1 は、親が重なりの文脈
  (stacking context)を作らないと、いちばん近い文脈までの先祖の下に描かれ(背景に隠れる)、クリックもその先祖に当たる(3 つの
  ブラウザーで、中心の当たり判定が先祖になる。親が isolation: isolate・position と z-index・opacity を持つと当たる。祖父母の
  opacity では親の下に回る)。filter など文脈を作り
  うる宣言を解析が捨てたときは報告しない。
- [x] **F73. 背景のある親を突き抜ける子の margin**(`W_LAYOUT_MARGIN_COLLAPSE_THROUGH`): padding・border のない親の、最初
  (最後)の子の margin-top(bottom)は親の外へ相殺されて出るので、親に背景があると、余白が背景の内側でなく外側に出る(CSS 2.2
  §8.3.1。3 つのブラウザーで、親の上端と子の上端が同じ)。padding か display: flow-root を勧める。
- [x] **F74. 両側の inset を書いた relative**(`W_LAYOUT_DECLARATION_INERT`): position: relative の箱は、left と right の両方が
  あると left(rtl では right)だけ、top と bottom の両方があると top だけで動く(CSS 2.2 §9.4.3。3 つのブラウザーで、使われない側を
  変えても位置が同じ)。使われない側を報告する。sticky は両側が意味を持つので除く。
- [x] **F75. ブラウザーが描く select の `line-height`**(`W_LAYOUT_DECLARATION_INERT`): appearance: auto の select は自分の高さで
  描かれ、line-height で大きさも画素も変わらない(3 つのブラウザーで測った。文字の input・button では高さが変わり、select も
  appearance: none なら変わる)。height・padding か appearance: none を勧める。
- [x] **F76. inline の要素の flex・grid の容器の性質**(`W_LAYOUT_DECLARATION_INERT`): gap・grid-template-*・grid-auto-*・
  flex-direction・flex-wrap・justify-content・align-items・align-content・justify-items は flex・grid の容器の子を並べる性質で、
  display: inline の span では子の要素があっても何も変わらない(3 つのブラウザーで描画が同じ)。display: flex などを勧める。
- [x] **F77. 絶対配置の箱の `float`**(`W_LAYOUT_DECLARATION_INERT`、以前は誤って「float は使えない」というエラー): absolute・fixed
  の箱の float は none に計算される(CSS 2.2 §9.7。3 つのブラウザーで計算値が none、位置も同じ)。解析も none として扱い、
  書いた float が何もしないと報告する。
- [x] **F78. media query の `var()`**(`W_CSS_MEDIA_VAR`、以前は Unknown): custom property は media query の中では置き換わらない
- [x] **F79. media query の単位なし長さ・単位前の空白**(`W_CSS_MEDIA_INVALID_LENGTH`、以前は Unknown): `(min-width: 600)` や `(min-width: 600 px)` は不正な query で決して一致しない。`0` だけは単位なしで有効
- [x] **F80. `white-space: nowrap` / `pre` の下の `overflow-wrap`**(`W_LAYOUT_DECLARATION_INERT`): 折り返さない行には折る場所がないので効かない。中に折り返しを戻す要素があるときは継承先で効くので警告しない
- [x] **F81. multi-column の外の `column-span`**(`W_LAYOUT_DECLARATION_INERT`、以前は Unknown): 段組の祖先がなければ跨ぐ段がない。`initial` / `unset` は `none` として扱い、`inherit` は Unknown のまま
- [x] **F82. `border-collapse: collapse` の表の `empty-cells: hide`**(`W_LAYOUT_DECLARATION_INERT`): 空のセルを隠すのは分離境界モデルだけで、collapse では背景も枠も描かれる(3 ブラウザでスクリーンショット比較)
- [x] **F83. transform のない `transform-origin`**(`W_LAYOUT_DECLARATION_INERT`): どの状態でも transform / translate / rotate / scale が付かず、animation もなければ原点は使われない。状態の疑似クラスを外したセレクタで照合し、読めないセレクタ(`:not(:hover)` など)は「付くかもしれない」とみなす。SVG 要素は transform 属性があるので見ない
- [x] **F86. `!important` の綴り間違い**(`W_CSS_IMPORTANT_TYPO`、以前は Unknown): `!imporant` など `!important` 以外の `!語` は宣言ごと捨てられる。`!IMPORTANT` と `! important` は有効(3 ブラウザで実測)
- [x] **F87. media query の `and(`**(`W_CSS_MEDIA_AND_SPACE`、以前は Unknown): 関数トークンになり query は不正で決して一致しない。`)and (` は有効。`or(`・`not(` も同じ(3 ブラウザで実測、F110 の調査で追加)
- [x] **F88. list-item でない要素の `list-style-position`**(`W_LAYOUT_DECLARATION_INERT`): マーカーがなく、中に継承先もなければ効かない
- [x] **F89. calc の `+` / `-` の両側の空白**(`W_CSS_CALC_OPERATOR_SPACE`、健全性の修正: 以前は `calc(100%-10px)` を 100% − 10px として verified にしていた): 空白がないと符号付きの数として読まれて値が不正になり、宣言ごと捨てられる。`min()` / `max()` / `clamp()` と入れ子も同じ。`*` と `/` は空白なしで有効(3 ブラウザで 16 通り実測)
- [x] **F92. block コンテナの `gap`**(`W_LAYOUT_DECLARATION_INERT`): 子のある block は以前から検出していた。子のない block と inline-block にも広げた
- [x] **F93. 単位のない長さ**(`W_CSS_UNITLESS_LENGTH`、以前は Unknown): `width: 100` など長さしか取らないプロパティの 0 以外の素の数は不正で、宣言ごと捨てられる。解析は標準モード(`<!doctype html>`)を前提にする(quirks モードの WebKit は px として受け付ける)。`line-height` や `flex` のように数を取るプロパティは対象外
- [x] **F84. 空白を詰める `white-space` の下の `tab-size`**(`W_LAYOUT_DECLARATION_INERT`、以前は Unknown): normal / nowrap / pre-line ではタブが空白になって潰れるので効かない。継承されるので、中に要素のない箱だけを判定し、pre / pre-wrap や子のある箱は Unknown のまま
- [x] **F94. 表の行・行グループの `border-radius`**(`W_LAYOUT_DECLARATION_INERT`): 分離・collapse どちらの境界モデルでも、行の背景も枠も丸まらない(3 ブラウザでスクリーンショット比較)。角のセルを丸める
- [x] **F96. 固定レイアウトの表で 1 行目以外のセルの `width`**(`W_LAYOUT_DECLARATION_INERT`): 列幅は 1 行目のセル(か col)だけで決まる。2 つ目の tbody の行も 1 行目ではない。thead / tfoot のある表は描かれる順がソース順と違いうるので判定しない
- [x] **F98. 表のセル・行・列と inline 要素の `aspect-ratio`**(`W_LAYOUT_DECLARATION_INERT`、以前は Unknown): inline ボックスと表の内部ボックスには適用されない(3 ブラウザで、中身がテキスト・箱・空、自動・固定レイアウトの 18 通りを実測)。img など置換要素は inline でも効くので除く
- [x] **F99. 引用符のない `font-family` の不正な名前**(`W_CSS_FONT_INVALID`、**健全性の修正**: 以前は適用していて、`font: 16px Font Awesome 5 Free` の font-size を 16px として計算していた): 数字(や `-` と数字)で始まる語や `.` を含む名前は識別子にならず、宣言ごと捨てられる。リストの 1 項目だけでも同じ。`font-family` と `font` の両方(3 ブラウザで 14 通り実測)
- [x] **F100. size か family のない `font` ショートハンド**(`W_CSS_FONT_INVALID`、以前は Unknown): `font: 16px`、`font: bold Arial`、`font: italic 16px` は宣言ごと捨てられる。`caption` などのシステムフォントと `var()` は判定しない
- [x] **F104. list-item でない要素の `list-style-image`**(`W_LAYOUT_DECLARATION_INERT`): F88 と同じく、マーカーがなく中に継承先もなければ効かない
- [x] **F101. grid の不正なトラック**(`W_CSS_GRID_TRACKS_INVALID`、以前は Unknown): `repeat(auto-fill / auto-fit)` に固定でない大きさ(`1fr`、`auto`、`min-content`、`fit-content()`)がある、その外に固定でないトラックがある、auto の repeat が 2 つ、`minmax()` の最小が fr、repeat の回数が正の整数でない、負の値、`fit-content()` に長さ以外。どれも宣言ごと捨てられる(3 ブラウザで 23 通り実測)。`var()` と `subgrid` は判定しない
- [x] **F102. どこからも読まれない CSS カウンター**(`W_CSS_COUNTER_UNUSED`): `counter-reset` / `-increment` / `-set` の名前を、解析した CSS のどの `content` の `counter()` / `counters()` も読まなければ見た目は変わらない。`list-item`(リストのマーカーが読む)は除く。別のスタイルシートで読む場合は誤検知になるので、メッセージに「解析した CSS の中で」と書く
- [x] **F103. inline 系の箱の左右の `margin: auto`**(`W_LAYOUT_DECLARATION_INERT`): 親が block のとき、inline / inline-block / inline-flex / inline-grid / inline-table の左右の auto は 0 で、中央に寄らない(3 ブラウザで実測)。親が flex / grid なら block 化されて効くので警告しない
- [x] **F105. block レイアウトの `justify-self` / `justify-items`**(`W_LAYOUT_ALIGN_BROWSER_DEPENDENT`、解析は Unknown のまま): Chromium と WebKit は寄せる(幅が auto なら中身まで縮める)が、Firefox は無視する(実測、normal / stretch / auto 以外のすべての値)。ブラウザで見た目が違うことを知らせる
- [x] **F106. 1 行のままの `white-space` の下の `word-break` / `line-break` / `hyphens` / `text-wrap-style`**(`W_LAYOUT_DECLARATION_INERT`、`word-break` と `line-break` は以前は Unknown): nowrap / pre の文字には折り返す場所がないので効かない(3 ブラウザで、英語・日本語・ハイフン区切りの文で実測)。継承されるので、中に要素のない箱だけを判定する。`text-wrap: balance`(ショートハンド)は `text-wrap-mode` を wrap に戻して折り返しを復活させるので対象外
- [x] **F107. 不正な色**(`W_CSS_COLOR_INVALID`、**健全性の修正**: 色の解析が `hsl(120, 100, 50)`・`rgb(10%, 20, 30)`・`rgb(255 0 0 0.5)` を色として読み、正しい `hsl(120 100 50)` は値を取り違えていた): 16 進は 3・4・6・8 桁、カンマの形は 3 つ(透明度つきで 4 つ)で `/` と `none` を使わず、rgb は数か % にそろえ、hsl の彩度と明度は %。空白の形は 3 つの成分の後に `/` と透明度。外れると宣言ごと捨てられ、前の色が残る(3 ブラウザで 22 通り実測)。色を取るプロパティ(ショートハンドの中も)で読み、`url()` と文字列の中は見ない
- [x] **F108. 表の列(`col` / `colgroup`)に効かないプロパティ**(`W_LAYOUT_DECLARATION_INERT`): 列はセルの祖先でなく(何も継承されない)、詰めたり大きさを決めたりする箱もない。効くのは width・background・visibility と、collapse の border だけ。padding・margin・height・color・font-size・text-align・vertical-align・overflow・max-width と、分離境界モデルの border は何もしない(3 ブラウザで実測)。min-width は Chromium と Firefox が効かせ WebKit が無視するので報告しない
- [x] **F109. プロパティが受け付けないキーワード**(`W_CSS_KEYWORD_INVALID`、以前は多くが Unknown): `position: center`、`display: flexbox`、`text-align: middle`、`white-space: no-wrap`、`overflow: none`、`box-sizing: border`、`cursor: hand`、`letter-spacing: auto` などは宣言ごと捨てられ、前の値が残る(3 ブラウザで 25 通り実測)。キーワードの集合が閉じていて値が単純なとき(キーワード 1 つ、overflow は 2 つ、枠の線種は 4 つまで)だけ判定し、よくある書き間違いには直し方を添える。`-webkit-` の値、`var()`、数や長さは判定しない。`vertical-align: center` は Firefox が受けるので外す
- [x] **F110. `@supports` の `and(` / `or(` / `not(`**(`W_CSS_SUPPORTS_INVALID`、**健全性の修正**: `supports.mjs` はキーワードの直後の `(` も受け付けていて、`(display: grid) and(gap:1px)` の規則を当てていた): 空白のないキーワードは関数トークンになり、条件全体が不正で、規則は決して当たらない(3 ブラウザで 25 通り実測)。大文字小文字は問わない(`NOT`、`AND` は有効)。`selector()` などの引数の中(`:not(`)は読まない
- [x] **F111. 不正な `@property`**(`W_CSS_PROPERTY_INVALID`、**健全性の修正**: 引用符のない `syntax: <length>` を登録していて、`inherits: false` として子へ値が届かない計算をしていた): syntax が文字列でない、知らない構文名、inherits がないか true / false でない、`*` 以外で initial-value がない、`<length>` の initial-value が絶対長さでない(単位のない数、em、%)ときは規則ごと無視され、カスタムプロパティは登録されないまま継承する(3 ブラウザで実測)。ブラウザーと同じく無視する(以前は多くが Unknown)
- [x] **F112. 層の順番だけで負ける宣言**(`W_CSS_LAYER_OVERRIDDEN`): 詳細度では勝つ宣言(`@layer base { #x.a {…} }`)が、後の層か層の外の宣言(`.a {…}`)に負ける。カスケードは層の順を詳細度より先に見る(CSS Cascade 5 §6.4、3 ブラウザで実測)。値が同じ組、同じ層の中、勝つ側の詳細度も高い組、!important と style 属性は報告しない。宣言の組ごとに一度
- [x] **F113. 不正な `@font-face`**(`W_CSS_FONT_FACE_INVALID`): font-family がない、名前が不正(`3D Font`)、src がない、src の項目が url() でも local() でもない(`src: Arial`)ときは規則ごと無視され、フォントは読み込まれない(3 ブラウザで `document.fonts` を実測)。以前はこれを字形の入れ替え(CLS)の判定に使っていた(font-family がないものは Unknown)。不正な font-display は記述だけが捨てられ auto になる
- [x] **F114. 不正な `transition` / `animation`**(`W_CSS_TIMING_INVALID`): 単位のない時間(`transition: opacity 300`、`transition-duration: 300`、`animation-duration: 2`)、1 項目に 3 つの時間、知らないイージング名(`easeInOut` は 2 つ目のプロパティ名として読まれる)、4 つの数でない `cubic-bezier()`、ほかと並べた `none`、空の項目は宣言ごと捨てられる(3 ブラウザで 16 通り実測)。以前は `transition: opacity 300` を「時間のないトランジション」(F12)と誤って説明していた。捨てられた `transition-duration` の後に残る 0s のトランジションは F12 のまま報告する
- [x] **F115. 不正な `background` ショートハンド**(`W_CSS_BACKGROUND_INVALID`、以前はコントラストが Unknown): 最後の層以外の色(`red url(x.png), blue`)、引用符のない空白入りの url()、位置のない `/`(`url(x.png) / cover center`)、`/` のない cover / contain は宣言ごと捨てられ、画像も色も付かない(3 ブラウザで 11 通り実測)。捨てることで、文字の下の背景がブラウザーと同じになる
- [x] **F116. 不正な `will-change`**(`W_CSS_KEYWORD_INVALID`、以前は宣言を適用して fixed の子を閉じ込めたと判定): `auto`・`none`・`all`・`will-change`・CSS 全体のキーワードをリストに入れる、名前をカンマなしで並べる(`transform opacity`)、空の項目。ブラウザーは宣言ごと捨て、前の値が残る(Chromium・Firefox・WebKit で実測)。知らない名前(`transfrom`)は有効な値で、効かないだけなので判定しない
- [x] **F117. `transform-style: preserve-3d` が効かない書き方と、fixed の子の閉じ込め**(`W_LAYOUT_DECLARATION_INERT`、`W_LAYOUT_FIXED_TRAPPED`、以前は宣言ごと Unknown): 同じ要素の grouping property(`overflow` が visible 以外、`clip` も含む、`opacity` < 1、`filter`、`isolation: isolate`、`mix-blend-mode`、`clip-path`、`mask`)で平らになる。ブロックの流れの中の inline の箱では効かない。preserve-3d は、平らにされても fixed の子の包含ブロックになり、重なりの文脈を作る(Chromium・Firefox・WebKit で実測)。`contain: paint` で平らになるのは Firefox だけなので判定しない。`backface-visibility` も受け付ける
- [x] **F118. absolute / fixed の箱の `flex-grow`・`flex-shrink`・`flex-basis`(`flex`)・`order`**(`W_LAYOUT_DECLARATION_INERT`、以前は報告なし。flex の親では解析が Unknown のまま): flex 項目ではないので、親が flex・grid・block のどれでも大きさも位置も変わらない(Chromium・Firefox・WebKit で実測)。`align-self` は flex と grid で動かし、grid の配置(`grid-column`)は grid で効くので報告しない
- [x] **F119. `white-space: nowrap` の後の `text-wrap: balance`**(`W_CSS_WRAP_RESTORED`): 一括指定の `text-wrap` は `text-wrap-mode: wrap` も書くので、同じ要素の `white-space: nowrap` / `pre` を打ち消して折り返しが戻る(Chromium・Firefox・WebKit で実測)。`balance`・`pretty`・`stable` のときだけ報告する(`text-wrap: wrap` と `text-wrap-mode: wrap` は意図して書くもの)。`text-wrap: pretty` は Firefox(157 で実測)が受け付けずに捨てるので、そこでは 1 行のまま(`browsers` 付き)
- [x] **F120. `<br>` に書いたスタイル**(`W_CSS_BR_STYLED`、解析は `<br>` で Unknown のまま): `<br>` は箱ではなく改行。`margin-top` / `margin-bottom` は Firefox だけ、`line-height` は WebKit だけで行の間隔を変え、`padding`・`width`・`height`・左右の `margin`・`display: block` はどのブラウザーでも何もしない(Chromium・Firefox・WebKit で実測)。`display: none` は改行を消すので報告しない
- [x] **F121. ドロップダウンの `<option>` の大きさ・余白**(`W_LAYOUT_DECLARATION_INERT`、`select` 付き): `multiple` も `size` > 1 もない `select` では、`option` の `font-size`・`padding`・`margin`・`width`・`height`・`line-height` は select の大きさを変えない(Chromium・Firefox・WebKit で実測)。開いたメニューはブラウザーが描く(どれを使うかはブラウザーごとに違い、測っていない)。リストボックスと `appearance: base-select` は対象外。色は判定しない
- [x] **F122. 一部のブラウザーしか受け付けない大きさのキーワード**(`W_CSS_SIZE_BROWSER_DEPENDENT`、解析はこれらのキーワードで Unknown のまま): `stretch` は Chromium と WebKit だけ、`-moz-available` と `-moz-fit-content` は Firefox だけ、`-webkit-fit-content` は Chromium と WebKit だけ、`intrinsic` は WebKit だけ(Firefox 157 ほかで実測)。同じ規則の中で、各ブラウザーが最後に受け付ける値の種類が違うと報告する(`-webkit-fill-available; stretch` のように前置きを並べたものは報告しない)
- [x] **F123. `mix-blend-mode` と同じ要素の `isolation: isolate`**(`W_CSS_ISOLATION_SELF`、解析は normal 以外の `mix-blend-mode` で Unknown のまま): `isolation` は子孫の混合を閉じ込めるもので、その要素自身は後ろのページと混ざり続ける。親に付ければ親の中だけで混ざる(親の `opacity`・`transform`・`z-index` で重なりの文脈を作っても同じ。Chromium・Firefox・WebKit で画素を読んで実測)。同じ規則の中の組み合わせだけを判定する
- [x] **F124. `select` の `text-indent`**(`W_LAYOUT_SELECT_INDENT`、以前は select ごと Unknown): Firefox だけが表示中の選択肢を 2 倍字下げする(10px で 22、Chromium 16、WebKit 17。`appearance: none` でも同じ)。select の大きさは変わらないので、解析は select では `text-indent` を外して進める。`input` は 3 ブラウザーで揃う。`text-align` と `padding` は select でも揃った(実測)
- [x] **F125. メディアクエリの `em` / `rem` とページのルートの `font-size`**(`W_CSS_MEDIA_EM_ROOT`、解析はこのクエリで Unknown のまま): メディアクエリの em と rem はブラウザーの既定の文字サイズ(利用者が変えなければ 16px)で、`html { font-size: 62.5% }` などを見ない(Chromium・Firefox・WebKit で実測: 50rem は 800px のまま)。ルートに 16px 以外の `font-size`(または `font`)があるときだけ報告する
- [x] **F126. 片方の軸だけの `overflow: hidden`**(`W_CSS_OVERFLOW_PROMOTED`): もう片方の軸に書いた `visible` は `auto` に、`clip` は `hidden` になり、両方の軸でスクロール(切り取り)する(Chromium・Firefox・WebKit で実測)。片方だけ切るなら `clip`。著者が書いた軸だけ報告する(`overflow-x: hidden` だけのときは報告しない)。**健全性の修正(2026-11-20)**: `clip` が `hidden` になるのは Firefox 157 と WebKit 27.2 だけで、Chromium 156 は `clip` のまま残す(`getComputedStyle` で 25 通りの組を実測。`visible` が `auto` になるのは 3 つとも同じ)。以前は 3 つとも `hidden` として解析していた(古い Chromium で測った)。`clip` の組は `browsers` を付けて報告し、解析は `U_LAYOUT_BROWSER` で Unknown にする
- [x] **F127. html や body だけの `box-sizing: border-box`**(`W_CSS_BOX_SIZING_NOT_INHERITED`): `box-sizing` は継承されないので、ほかの要素は content-box のまま(Chromium・Firefox・WebKit で実測: 幅 100px と padding 10px で 120px)。ほかの要素に `box-sizing` を書く規則がなく、大きさと padding か border を書いた規則があるときだけ報告する
- [x] **F128. 縦の `margin` の %**(`W_CSS_MARGIN_PERCENT_WIDTH`、解析は % の margin で Unknown のまま): 包含ブロックの幅に対する割合で、高さではない(Chromium・Firefox・WebKit で実測: 400×100 で 10% は 40px)。縦の `padding` の % は縦横比の定番の書き方なので報告しない
- [x] **F129. リセット CSS で中央に来なくなる `<dialog>`**(`W_CSS_DIALOG_NOT_CENTRED`): dialog は UA の `margin: auto`(モーダルでは inset 0 も)で中央に置かれる。`* { margin: 0 }` のようなリセットが届くと左上に出る(Chromium・Firefox・WebKit で実測、`open` でも `showModal()` でも)。dialog の要素名・class・id を書いた規則は意図した配置なので報告しない。閉じた dialog も、スクリプトで開くので対象
- [x] **F130. `::-webkit-scrollbar` と標準の `scrollbar-width` / `scrollbar-color`**(`W_CSS_SCROLLBAR_WEBKIT_IGNORED`、`W_CSS_SCROLLBAR_FIREFOX_SHOWN`、解析は `::-webkit-scrollbar` で Unknown のまま): 標準のプロパティを書いた要素では Chromium と WebKit が `::-webkit-scrollbar` を無視し(Chromium は `--hide-scrollbars` を外した従来型のスクロールバーで、WebKit はそのまま実測)、Firefox は `::-webkit-scrollbar` を受け付けない(`CSS.supports` で実測)。前者は効かない規則として、`::-webkit-scrollbar` だけで隠したものは Firefox で出たままとして報告する。`scrollbar-width: none` と並べて隠す定番の組み合わせは報告しない
- [x] **F131. 後の規則に負けて見えない `:hover` / `:focus` / `:active`**(`W_CSS_STATE_SHADOWED`): `a:hover { color }` を `a:link { color }` の前に書くと、ホバーしても色が変わらない(Chromium・Firefox・WebKit でホバーして実測。LVHA の順)。状態を有効にして計算した値の勝者が、状態のいらない規則で、値が違うときに報告する(後に書いたものも、詳細度が高いものも)。`var()` を含む shorthand(`background: var(--s)`)は書いたとおりの名前と値で 1 件にまとめ、比べるのも書いた値(以前は longhand ごとに `initial` と出て、両側が同じ `var()` でも報告していた。vlmkit の dashboard で見つかった)
- [x] **F132. セレクタリストの中の `-moz-` / `-ms-` の擬似**(`W_CSS_SELECTOR_LIST_VENDOR`、解析はこの規則で Unknown のまま): 1 つでも無効なセレクタがあるとリスト全体が捨てられる。`-moz-` は Chromium と WebKit で、`-ms-` と `-o-` はどこでも無効(実測)。`-webkit-` は 3 ブラウザーとも受け付け、`:is()` / `:where()` の中は許される(実測)ので報告しない
- [x] **F133. container のない軸の container query の単位**(`W_CSS_CONTAINER_UNIT_VIEWPORT`、解析は `cq*` の長さで Unknown のまま): `cqw`・`cqi` は祖先に `container-type: inline-size` か `size` がなければ、`cqh`・`cqb` は `size` がなければ small viewport の単位(`svw`・`svi`・`svh`・`svb`)になる(Chromium・Firefox・WebKit で、10 通りの組で `sv` の単位と同じ箱になることを実測: container のない要素、`inline-size` の container の中の `cqh`、`container-name` だけの祖先、自分自身の `container-type`、`calc()` の中、`font-size`。対照として `inline-size` の container・一括指定 `container: card / inline-size`・祖父母の container では箱が変わる)。ほかの状態や media query で祖先を container にする規則があれば報告しない。解析が読めないセレクタ(`.g:hover .p`)で container を作る規則があるときも報告しない。縦書きは対象外
- [x] **F134. `<image>` でない `background-image` と、値の中の `:`**(`W_CSS_IMAGE_INVALID`、`W_CSS_STRAY_COLON`、以前はシート全体が `U_LAYOUT_CSS: Missed semicolon`): `url()` のない URL(`background-image: https://example.com/close.png`)や引用符の文字列(`"close.png"`)は `<image>` でないので宣言ごと捨てられ、前の `background-image` が残る(Chromium・Firefox・WebKit で `getComputedStyle` を実測)。一括指定 `background` の画像の位置にある同じものも、一括指定ごと捨てられる(色も付かない)。PostCSS は値の中の `:` で「Missed semicolon」を投げてシート全体を読まないが、ブラウザーはその宣言だけを次の `;` まで捨てて続きを読む(セミコロンの書き忘れも同じ)。解析は `:` を同じ長さの印に置き換えて読み、その宣言を捨てて報告する。`url()`・`image-set()`・グラデーション・`none`・`var()` はそのまま。一括指定の大きさ(`/` の後)や位置に書いた `min()`・`max()`・`clamp()` は画像ではない(3 ブラウザーで `CSS.supports` が true)。捨てられる宣言は前の宣言を上書きしないので、`W_CSS_DUPLICATE_DECLARATION` にもしない。e2e は `layout-css-mistakes.spec.mjs` の F134(捨てられる宣言を外したときと computed style が同じこと、効く値の対照つき)
- [x] **F135. 同じ名前の `@keyframes` を 2 回書く**(`W_CSS_KEYFRAMES_DUPLICATE`、vlmkit `check animation` の `duplicate-keyframes` の静的な版): 後の規則が前の規則を丸ごと置き換え、キーフレームは合わさらない(Chromium・Firefox・WebKit で実測: `opacity` の `@keyframes k` の後に `transform` の `@keyframes k` を書くと、途中で止めた時点の `opacity` は 1 のまま。対照として名前を変えると 0.5)。前の規則だけが動かすプロパティを `lost` に出す。条件(`@media` など)の中の規則・`-webkit-keyframes`・層の違う規則は報告しない。1 つの `@layer` の中の 2 つも同じ(3 ブラウザーで実測、後の規則が置き換える)
- [x] **F136. `@property` のないカスタムプロパティの transition**(`W_CSS_TRANSITION_UNREGISTERED`、vlmkit の `unregistered-property-transition`): 型のないカスタムプロパティは一度に変わり、transition が始まらない(3 ブラウザーで `getAnimations()` が 0。対照として `@property --x { syntax: "<number>"; inherits: false; initial-value: 0 }` では 1)。解析が型を扱わない構文の `@property`(`<color>` など)も登録とみなす。スクリプトの `CSS.registerProperty` は見えないので、文言で断る。`allow-discrete`(項目の中か、規則の `transition-behavior`)のあるものは離散的に遷移する(3 ブラウザーで `getAnimations()` が 1)ので報告しない
- [x] **F137. transition の綴り違いのプロパティ**(`W_CSS_TRANSITION_PROPERTY_UNKNOWN`、vlmkit の `unknown-transition-property`): `transition: widht 1s` は受け入れられ(計算値の `transition-property` は `widht`)、何も遷移しない(3 ブラウザーで実測。対照の `width` では 1)。css-tree の定義にあるプロパティから編集距離 2 以内(隣どうしの入れ替えは 1)のものがあるときだけ報告し、`suggestion` に出す。遠い名前は新しいプロパティかもしれないので報告しない。`-webkit-` などの接頭辞と `var()` は見ない
- [x] **F138. 単位のない数の変数を時間に使う**(`W_CSS_DURATION_UNITLESS`、vlmkit の `unitless-duration-var`): `--d: 300` を `transition: opacity var(--d)` に使うと、計算値の時点で宣言が無効になり transition も animation も始まらない(3 ブラウザーで実測。対照として `calc(var(--d) * 1ms)` と `--d: 300ms` は始まる)。`calc()` の中は掛ける数なので報告しない。変数の定義のどれかに単位があれば、要素によって違うので報告しない。delay の一括指定でない宣言(`animation-delay: var(--d)`)は初期値の 0s になり、動きは遅れずに始まる(3 ブラウザーで実測)ので、文言はそう言う。`animation` の一括指定の単位のない数は繰り返しの回数になりうる(`animation: k 1s var(--n)` は `--n: 2` で 2 回、実測)ので、その項目にほかの回数(数か `infinite`)がないときは報告しない。`var(--a, var(--b))` の代わりの値は `--a` に値がある間は使われない(実測)ので見ない。代わりの値のある `var(--d, .2s)` は、定義が届かない要素では代わりの値になる(`.other { --d: 300 }` のとき 3 ブラウザーで 0.2s)ので、`:root`・`html`・`*` に at-rule の外で単位のない定義があるときだけ報告する
- [x] **F139. 綴り違いの media feature**(`W_CSS_MEDIA_FEATURE_UNKNOWN`、vlmkit の `unknown-media-feature`。以前は `U_LAYOUT_QUERY`): ブラウザーの知らない feature の query は当たらず、`not (…)` でも当たらない(3 ブラウザーで `(min-widht: 1px)`・`(widht > 1px)`・`screen and (hovr: hover)`・`not (prefers-reduced-motoin: reduce)` を実測。対照の `(min-width: 1px)`・`(scripting: enabled)`・`(update: fast)`・`(-webkit-min-device-pixel-ratio: 1)` は当たる)。仕様の feature から編集距離 2 以内のときだけ報告し、規則は当たらないものとして解析する(Unknown にしない)。仕様にあるがどのブラウザーも実装しない `prefers-reduced-data` は綴り違いではないので今までどおり。query を並べたものは、ほかの query が当たりうるので対象外。知らない feature は「偽」ではなく「不明」なので、`(min-widht: 1px) or (min-width: 1px)` と `not ((min-widht: 1px) and (max-width: 0px))` は当たる(3 ブラウザーで実測。対照の `(min-widht: 1px) and (min-width: 1px)`・`not screen and (min-widht: 1px)` は当たらない)。`or` か、組を囲む `not` のある query は報告せず、今までどおり Unknown にする
  ので、`@media (min-width: var(--bp))` は無効な query になり、その規則は決して当たらない(3 つのブラウザーで 800px でも当たらない)。
  解析も当たらない規則として扱う。query を並べたもの(`print, (…var…)`)は、ほかの query が当たりうるので今までどおり。
- 試して当てはまらなかったもの: `progress`・`input[type=range]` の `appearance: none` は、3 つのブラウザーとも何かを描く
  (消えない)ので報告しない。

## G. HTML の要素が持つ働きを CSS が消す書き方

- [x] **G1. 開閉の三角形を失った summary**(`W_A11Y_SUMMARY_INDICATOR`): `summary` の display を list-item 以外にするか
  `list-style: none` にすると、開閉の三角形が消える(3 つのブラウザーで、display: block の描画が list-style: none と同じ)。
  `::before`・`::after` の content や子の要素(アイコン)がなければ、開いているかどうかを示すものがない。
- [x] **F10. 要素(擬似要素でない)の `content`**: 文字列は何もしない(既存の `W_LAYOUT_DECLARATION_INERT` が出していた)。
  `url()` は要素を画像で置き換えるので効く(3 つのブラウザーで測った)。
## H. ダイアログの閉じるボタンを覆うもの

- [x] **H1. 閉じるボタンを覆う層と、その理由**(`E_A11Y_OCCLUDED` の文言): 覆う箱が opacity 0(自身か祖先)なら「見えないがクリックを受ける」と書き、
  `pointer-events: none` か `display: none` を勧める。ボタン(か、比べる文脈より内側の文脈)の z-index が、外側の stacking context
  (z-index・`position: fixed`・`transform` など)の中でしか効かないときは、その z-index と文脈の箱と理由を書く。
  e2e(`what covers a dialog close button`)で、Chromium・Firefox・WebKit の `elementFromPoint` と 11 通りを照合した:
  背景の暗幕がダイアログより上、ボタンの z-index 2147483647 がダイアログの文脈(`fixed` + z-index 5)に閉じ込められる、
  上の層・opacity 0 の層(覆う)、`pointer-events: none` か `visibility: hidden` の層(覆わない)、最大の z-index が同じなら DOM の後ろが勝つ、
  `transform` の文脈の中の z-index 99。対照として、ダイアログが暗幕より上・z-index が 1 つ小さい層では覆われない
- [x] **H2. 開いた `aria-modal` のダイアログの外**: ダイアログが描かれる範囲(viewport の幅と高さの領域)では、その外の要素が覆われる・隠れることを
  `E_A11Y_OCCLUDED`・`E_A11Y_FOCUS_OBSCURED`・`E_A11Y_FOCUS_SCROLLED_UNDER`・`E_A11Y_FIXED_HIDES(_PART)` として報告しない
  (背面に届かないのが意図。3 つのブラウザーとも背面のボタンは暗幕に覆われることを e2e で確かめた)。フォーカスが外へ出るのは
  従来どおり `W_A11Y_MODAL_BACKGROUND`。`aria-modal` のない箱は従来どおり報告する
- [x] **H3. opacity 0 の層は見た目を隠さない**: 自身か祖先が opacity 0 の箱は、`E_A11Y_FOCUS_OBSCURED`・固定・sticky のバーの規則・文字の被りの覆いにしない
  (何も描かない)。ヒットテストは受けるので `E_A11Y_OCCLUDED` には残す
- [x] **H4. 幅だけの `border`**: `border: 5px`・`medium`・`0px` は style が初期値の none に戻り、使われる幅は 0(`border: 0` と同じ。
  Chromium・Firefox・WebKit で button と inline-block の箱が `border: 0` と同じ形・同じ描画になることを実測。対照の `5px solid` は箱が変わる)。
  解析は今まで `0` と `none` だけを受けて、ほかを Unknown にしていた。`%` と負の長さは幅ではない(宣言ごと捨てられる)ので Unknown のまま
- [x] **H5. 覆いを全部並べる**: 同じ viewport の範囲で同じ要素に重なる、ほかの覆いを `alsoCoveredBy` と文言に並べる(1 つ目の覆いだけ直しても押せないことが分かる)。
  報告の件数は今までどおり範囲ごとに 1 つ
- [x] **H6. 横の inset のない絶対配置(静的位置)**: 包含ブロックが親そのものの block コンテナなら、内容の端(ltr は `padding-left`、rtl は `padding-right`)。
  grid コンテナが包含ブロックなら padding の端(既存)。Chromium・Firefox・WebKit で 2 つの幅と 6 通りを照合(e2e `absolute boxes with auto inline insets`)。
  もとの display が inline 系の箱(`text-align` で動く。inline-block で 206px)、% の padding、flex の親、`margin-left` のある箱は Unknown のまま
- [x] **H7. 高さが auto の絶対配置**: 包含ブロックに伸ばさず、中身の高さ(CSS 2 §10.6.4)。`top` で置く箱は、高さが決まる前でも中身に位置が出る
  (`bottom` で置く箱の中身は、高さが決まるまで位置なし)。`min-height` / `max-height` との組は Unknown。3 ブラウザーで 10 通り、子と孫を含めて 22 の矩形を照合
- [x] **H8. スクロールロックの body**(`body { position: fixed; left: 0; right: 0 }`、`top` は auto): html の内容の端(html の `padding-top`)に置く。
  包含ブロックが grid 自身でないときの静的位置は grid の内容の端(grid の html に padding があると body は padding の分下がる。3 ブラウザーで実測)。
  html に margin か border がある、rtl、px でない padding は Unknown
- [x] **H9. 決して効かない `vw` / `vh` の上限**: 幅が中身で決まり伸びない flex アイテムの `max-width: Nvw` は、中身の max-content 幅が最小の viewport 幅 × N% 以下なら効かない
  (中身 300px・`100vw`・幅 320〜:3 ブラウザーで 300px。360px か `50vw` なら効くので Unknown)。高さが auto の箱の `max-height: Nvh` は、決まった高さが
  viewport の高さ × N% を超えうる範囲があれば Unknown、なければ効かない
- [x] **H10. 中身の高さで寄せる flex アイテムの子の位置**: `align-items: center` などで寄せる箱の高さが中身で決まるとき、子は上端から並べ、高さが決まったら子孫を
  寄せの量だけずらす(高さが決まらなければ子孫の位置を出さない)。中央寄せのダイアログの中の閉じるボタンが覆われるかを判定できる。3 ブラウザーで 3 つの大きさで照合。
  `:focus` で動く子孫のフォーカス時の位置も同じだけずらす(高さが決まらなければ Unknown)。以前は寄せる前の位置のままで、200px の viewport の中央の
  100px の箱で `top: -30px` に出るスキップリンク(実際は 20px)を `E_A11Y_FOCUS_OFFSCREEN` と誤っていた。3 ブラウザーで 6 通り × 2 つの高さを照合
- [x] **H11. 小数の桁**: px の値は小数点以下 20 桁まで正確な有理数として読む(スクリプトが書く `26.666666666666668px`)。今までは 6 桁を超えると Unknown。
  解析器が計算して px として書き戻す値(rem・em の px への換算、表の列幅、相殺した margin など)は、正確な小数(20 桁まで)のときだけ書く。
  `String(number(v))` は double に丸めた別の値になる(`26.666666666666668px` の `1.1em` は 29.3333333333333348px で、double の
  29.333333333333336 ではない)。有限の小数にならない値は rem・em のまま残すか Unknown
- [x] **H12. `filter`**: `none` 以外は、スタッキングコンテキスト(中の z-index 99 の子が外の z-index 2 の兄弟の下になる)と、fixed の子孫の包含ブロック
  (`brightness(1)` でも)を作る。ヒットテストの範囲と配置は変えない(`drop-shadow` の影はクリックを受けない)。Chromium・Firefox・WebKit で実測し、
  e2e `filter traps a z-index` で 5 通りをヒットテストと照合。色は変わるので、filter の下のコントラストは Unknown。`url()` の filter は Unknown のまま
- [x] **H13. 幅が auto の絶対配置・fixed の箱(shrink-to-fit)**: 横の inset が片方だけのとき、中身の max-content 幅を `max-width` / `min-width` で挟んだ値
  (CSS 2 §10.3.7)。max-content 幅が inset の残す幅を超えうる範囲があれば Unknown。3 ブラウザーで 2 つの幅と 6 通りを照合
  (中身が絶対配置の子だけで `min-width: 180px` → 180、`content-box` の padding を含めて 60 など)。決めた幅は border-box の値だが、`box-sizing` は
  宣言のまま残す(`content-box` なら padding と border を引いた幅にする)。縦の `height` / `min-height` / `max-height` は宣言どおりの box-sizing で読む
  (`height: 20px; padding: 10px; box-sizing: content-box` は 40px。以前は border-box に変えて 20px と誤っていた)。高さも含めて 4 通りを足して照合
- [x] **H14. 高さが auto の絶対配置の箱の `min-height` / `max-height`**: 中身の高さで一度解き、範囲を分けて、下回るところは最小、上回るところは最大の高さで
  解き直す(最小が勝つ。`min-height: 100px; max-height: 50px` は 100px で、最大で詰め直さない。以前は 50px と誤っていた)。H7 で Unknown にしていた組。
  e2e `absolute boxes with an auto height` に最小が最大より大きい組と、最大の内側の組を足して 3 ブラウザーで照合
- [x] **H15. `inert` とヒットテスト**(`W_A11Y_INERT_SHOWN`): `inert` の部分木はヒットテストで透明(クリックと `elementFromPoint` は下の要素に届く)で、中の
  操作部品はクリックを受けない(Chromium・Firefox・WebKit で、`inert` のある層とない層を対照に実測)。`inert` の箱は覆いにならない(`E_A11Y_OCCLUDED`)。
  `inert` の操作部品の上に何も描かれていない(見えている)範囲は、押せるように見えて押せないので警告する。モーダルのライブラリが広告や通知を含む兄弟要素を
  `inert` にしたまま、それが最前面に見えているときに起きる。暗幕の後ろの `inert` な背面(意図した使い方)は覆われているので報告しない。
  e2e `inert layers and controls match hit testing` で 4 通り
- [x] **H16. 端末の safe area に入る操作部品**(`W_A11Y_SAFE_AREA_TARGET`、オプション `safeArea`): `viewport-fit=cover` のページで、fixed / sticky の箱の中の
  操作部品が safe area の帯(上: ノッチ・Dynamic Island・ステータスバー、下: ホームインジケーター、横向きの左右: 切り欠き)に入る範囲。流れの中の
  要素はスクロールで帯から出るので報告しない。`viewport-fit=cover` のないページはブラウザーが safe area の内側に収めるので出ない。端末の形はどの
  ブラウザーにもないので、Chromium の `Emulation.setSafeAreaInsetsOverride` で `env()` と位置を照合した(e2e `layout-devices`、7 通り。
  角の部品は上と左の両方の帯で 1 件ずつ)。Firefox・WebKit は照合できない。直し方の `calc(env(safe-area-inset-top) + 4px)` の inset も読む
  (今までは Unknown)。fixed / sticky かは幅の範囲ごとに見る(ブレークポイントの片側だけ fixed なら、その側だけで報告する。H19 も同じ)
- [x] **H17. 2 画面の端末のヒンジの下の操作部品**(`W_A11Y_HINGE_TARGET`、オプション `hinge`): ヒンジの帯は表示されずタップも届かない。Chromium の
  `Emulation.setDeviceMetricsOverride` の `displayFeature`(viewport segments)で 5 通り照合した。Firefox・WebKit は照合できない
- [x] **H18. 端末のプロファイル**([devices.md](devices.md)): StatCounter の普及率(日本・世界)、Playwright の端末定義、safe area とヒンジ(手で書いた値、
  iOS Simulator の実測スクリプト付き)から、端末 × 向きの検査を作る `deviceChecks` / `analyzeDevices`
- [x] **H19. viewport の外に出る固定された操作部品**(`E_A11Y_TARGET_OFFSCREEN` / `W_A11Y_TARGET_PARTLY_OFFSCREEN`): fixed の箱の中の操作部品は
  スクロールで画面に入らないので、viewport の外の部分は二度と見えない。全部が外ならエラー、一部ならどの辺かを付けて警告(高さの範囲で分かれる)。
  流れの中の要素はスクロールで届くので出ない。`:focus` の規則で位置が動く部品(フォーカスで出てくるスキップリンク)は、意図した隠し方なので出さない
  (フォーカスしても見えないときは `focus-offscreen`)。Chromium・Firefox・WebKit で 9 通り × 2 つの高さを、部品の矩形と viewport で照合
  (e2e `layout-devices`)。部品か祖先がブレークポイントの片側だけ fixed のときは、fixed の幅だけで報告する(4 通り × 2 つの幅を、
  スクロールの先頭と末尾の両方で外にあるかで 3 ブラウザーと照合)
- [x] **H20. フォーカス時の位置を、箱を動かす処理と一緒に動かす**: `:focus` で inset を変える絶対配置の箱(スキップリンク)のフォーカス時の位置は、
  rtl のコンテナの鏡映(包含ブロックが一緒に動くとき)と、祖先の拡大縮小でも同じだけ動かす。任意の角度の回転では、箱の位置と同じく不明にする。
  今までは動かしておらず、rtl で右端に置いた箱の中のスキップリンク(3 ブラウザーで x = 290、画面内)や、`scale(0.5)` の中のもの(x = −5〜15)を、
  フォーカスしても画面外(`E_A11Y_FOCUS_OFFSCREEN`)と誤って報告していた。e2e `focused positions follow rtl mirroring and scales` で 5 通り
- [x] **H21. クリックの乗っ取りと出口を塞ぐ透明な覆い**(`E_A11Y_INVISIBLE_BLOCKER`・`E_A11Y_CLICK_TRAP`): viewport 全体に fixed で張った透明な
  `<a>`(広告のリンク)は、部品であっても見えない覆い。部品の一部が覆う組を `E_A11Y_OCCLUDED` に残すのは、覆いを張る箱の包含ブロック(html・body 以外)が
  対象を含むとき(stretched link の `::after` が自分のカードのボタンを覆う)だけ。閉じるボタンの上に同じ層の透明な全面リンクがあると、ボタンは
  見えてフォーカスも受けるがクリックはリンクに届く: 出口にならず、理由に「何も描かない覆いに覆われている」と書く。ページの部品が `inert` で、
  `inert` でない層(`role="dialog"` の広告)に出口がないときも trap(`inert` の部品はクリックもフォーカスも受けない)。出口の候補の子孫が描くのが
  一部の幅だけなら、その幅だけ出口にする。Chromium・Firefox・WebKit で `elementFromPoint` と `focus()` を照合(e2e `click traps and invisible blockers`
  に 4 通り、stretched link は `OCCLUDED` のままで `INVISIBLE_BLOCKER` にならないことを確かめる)
- [x] **H22. スクロールと fixed の覆い**(`E_A11Y_INVISIBLE_BLOCKER` の `scrolled`、`E_A11Y_CLICK_TRAP`): 何も描かない fixed の箱(opacity 0 のまま
  残った広告)は、ページをスクロールすると流れの中のリンクがその下を通り、そのあいだクリックは見えない箱に届く(375×667 で 3 ブラウザーとも、
  スクロール位置 0 では当たらず 300 で当たる。`pointer-events: none` の対照では当たらない)。位置 0 で箱より下にあり、スクロールの範囲
  (0〜ページの高さ − viewport の高さ)の中で箱に重なる部品を報告し、重なり始めと終わりのスクロール位置を `scrolled` に書く。描く fixed の箱は
  見えているので、スクロールを続ければ抜けられる(報告しない)。ページがスクロールしないとき: html と body の overflow の 16 通りを、ホイールと
  PageDown で 3 ブラウザーで測った。html が hidden / clip ならスクロールしない(body が visible・hidden・clip のとき。body が auto だと body が
  スクロールする箱になる)。html が visible で body が hidden / clip でもしない(body の値が viewport に移る)。html が auto ならいつもする。
  html の overflow が両方の軸で hidden / clip のとき、fixed の層の下の流れの中の部品はスクロールで抜けられないので trap に数え、
  `E_A11Y_OCCLUDED` の文言に「スクロールでは抜けられない」と書く。あわせて、html の hidden / clip は viewport に移るので fixed の箱を
  閉じ込めない(以前は Unknown)。body の hidden / clip(html が visible のとき、または html も hidden のとき)は解析が Unknown のまま。
  e2e `fixed covers and scrolling` で 3 ブラウザー
- 未対応(Unknown のまま): `<dialog open>`・`showModal()`・`popover` の top layer と `::backdrop`、
  `onclick` などのイベント属性(クリックできることは DOM に出ないので、利用者が `role="button"` などで示す)。flex アイテムの中の、文字の幅で決まる flex アイテム

## I. 実際のページで見つかった誤報と Unknown

CSS-in-JS(styled-components)とコンポーネントライブラリを使う管理画面の 40 ページを、描画した DOM と CSSOM で解析し、
各警告を Chromium で確かめた(宣言や属性を外して箱と画素を比べる、計算値、描かれた背景の画素)。

- [x] **I1. keyframes の名前の大文字・小文字**: animation と animation-name の名前を小文字にしていたので、生成された名前
  (cqkDSr)の @keyframes を「ない」と報告していた(`W_CSS_KEYFRAMES_MISSING`)。名前は書いたまま比べる。3 ブラウザーで、
  大文字を含む名前の animation が動き、Spin は @keyframes spin を動かさないことを測った(e2e F1)。
- [x] **I2. 辺ごとの border の一括指定**: border-top などを読まず(Unknown)、その辺の style を見落として「border が描かれない」
  と報告していた。border / border-inline / border-block / border-top 〜 left を、width・style・color の順不同・省略可で読む。
  style を none か hidden と書いた辺は報告しない(border: none をブラウザーが border-width: medium; border-style: none と書き出す)。
  3 ブラウザーで測った(e2e F14 の 2 つ目)。
- [x] **I3. 全称のリセットの擬似要素**: `*, *::before, *::after { box-sizing: border-box }` で、すべての ::before・::after を
  「content がない」と報告していた(ページの警告のほとんど)。擬似要素だけのセレクター(* の有無は問わない)の宣言は数えない。
- [x] **I4. 見えない欄の caret**: select の部品が持つ、opacity 0 でキー入力だけを受ける input に `W_A11Y_CARET_HIDDEN` を出していた。
  opacity 0(祖先を含む)か視覚的に隠した欄は見ない。
- [x] **I5. HTML の属性でない名前**: モデルにない属性はすべて Unknown にしていたので、DOM に漏れたコンポーネントの props
  (placement、variant)でページ全体が止まっていた。どこかの要素で描画に効く属性だけを Unknown にし、それ以外は何もしない
  (属性セレクターからは見える)。size・color・align は、効かない要素では F28 の警告にする。3 ブラウザーで測った(e2e F28)。
- [x] **I6. どの要素にも当たらないルールの、モデルにない宣言**: 読んだ時点で全体を Unknown にしていた(サイト全体の
  スタイルシートには、そのページにない要素のルールがある)。宣言をルールに残し、当たった箱の配置だけを Unknown にする。
  スタイルの検査はその箱でも走る。
- [x] **I7. 複合セレクターの途中の状態**: `.btn:hover:not([disabled])` を読めなかった。状態は複合の中のどこにあってもよい
  (一つだけ)。3 ブラウザーで、hover で下の箱が動く・動かないことが解析と一致した(e2e の hover の CLS)。
- [x] **I8. 読めないセレクターは当たりうる箱だけ**: 結合子の前の状態、:not() の中の状態、`::-webkit-scrollbar`、解析しない状態(:active、:checked)
  でレイアウトを変える状態ルールは、ページ全体を Unknown にしていた。擬似クラスと擬似要素を外したセレクター(どの状態で当たる箱も
  含む上位集合)の当たる箱だけを Unknown にする。描画だけのルールは、配置を止めず、その箱のコントラストだけを判定しない。
- [x] **I9. 入力の段の Unknown を箱に**: 大きさを持たない要素(hr、br、col)、その要素で効く属性、テキストと子要素の混在は、入力全体の
  diagnostic で、入力に diagnostic があると配置がまったく走らなかった。箱に付けて、配置がその箱に来たところで Unknown にする。
  select の option は箱として配置しないが select の大きさを決めるので、option の Unknown は select のものにする。
- [x] **I10. flex の container の absolute / fixed の子**: container ごと Unknown にしていた。flex の item ではないので、container の大きさが
  決まった後に containing block に対して配置する(grid と同じ `solveOutOfFlow`)。inset が両方 auto の軸は、始点に揃える container なら内容の
  始点に置く(Flexbox §4.1、stretch は flex-start 扱い)。3 ブラウザーで、in-flow の item と absolute / fixed の子の位置が解析と一致した
  (`e2e/layout-flex.spec.mjs`)。
- [x] **I11. % の幅の flex item(既定の shrink と min-width)**: 中身で決まる自動の最小幅を理由に Unknown にしていた。最小幅は
  min(min-content, 指定の幅) で基準の大きさ以下なので、縮まない行では判定する(縮む行は Unknown)。縮む側でも空きがちょうど 0 の行は何も
  縮まない。3 ブラウザーで 400px と 700px の位置と幅が解析と一致した(`e2e/layout-flex.spec.mjs`)。
- [x] **I12. % の幅と px の max-width の flex item(中央寄せの最大幅の容器)**: % の basis は max-width が none のときだけ受けていた。
  share は viewport に対して一次なので、share と max-width の大小で行を分け、超える側では仮の大きさを max-width にする(§9.7。縮む行では
  share から縮み、伸びる行では max-width で止まる)。スクロールコンテナや空の箱のように自動の最小幅を持たない item も、% の basis で受ける。
  3 ブラウザーで、340px・450px・700px の位置と幅が解析と一致した(中央寄せ、伸びる item、縮む行、`flex: 1 1 30%`、auto の margin。
  `e2e/layout-flex.spec.mjs`)。
- [x] **I13. clip する祖先の中の containing block**: absolute の箱は、祖先のどこかが clip かスクロールをすると Unknown にしていた
  (アイコンの `overflow: hidden` の span の中の svg が、横スクロールのナビの中にあるだけで止まる)。containing block より上の clip する
  祖先は、containing block のほかの中身と同じように箱を clip するだけなので(CSS Overflow 3 §3)、containing block とその内側の clip だけを
  判定する。3 ブラウザーで、スクロールする祖先と `overflow: hidden` の祖先の中で、containing block の外に出た箱の
  `E_LAYOUT_ABSOLUTE_CLIPPED` が実際の clip と一致した(`e2e/layout-accessibility.spec.mjs`)。
- [x] **I14. 折り返すテキストの `word-break: break-all`**: Unknown にしていた(CSS-in-JS の管理画面で、本文のスタイルに付いていた)。
  改行の位置を Chromium で組ごとに測り(`tools/measure-break-all.mjs`、145 文字の全組、lang en と ja で同じ)、組の表として持つ
  (`src/text-break-all.mjs`)。break-all の改行は一つのクラスの規則にならない(`+` と `\\`、`!` と `)` が違う)。測っていない文字は、
  どの文字と組んでも同じ結果になるグループの代表で引く(Latin-1、漢字・かな、小書きかな、踊り字)。3 文字の組で、組の表から外れる
  文脈は 2 つだけだった(`$ % + \\` と漢字・かなの隣、`-` と Latin-1)。どちらも Unknown にする。ランダムな 1 万件超の文字列で一致した。
  break-all は継承し、break-all で測ったテキストだけを配置する(仮定の寸法のテキストは Unknown)。e2e(`e2e/layout-word-break.spec.mjs`)で、
  英語と日本語の行数が Chromium 以上で、9 割以上の幅で一致した。Firefox は Chromium が切る 1,034 組で切らず、
  WebKit は約物の前後を中心に 3,068 組で余分に切り、83 組で切らない(21,025 組中。Firefox は baseline に載せた。docs/css-baseline.md)。
- [x] **I15. 配置を変える `:active` のルール**: 押したときに中身を下げるボタン(`:active:not([disabled]) { padding-top: 2px }`)で、
  当たる箱を Unknown にしていた。`:hover` と同じく、当たる箱ごとに押した状態で配置し直す。マウスで押す状態(`:active` と `:hover`)と
  キーで押す状態(`:active` だけ)を、箱と祖先に付ける。押した配置の違反のうち元の配置にないものを、押している間のものとして報告し
  (`pressed`)、決まらなければ Unknown にする。ずれは、押す入力に続くので報告しない。3 ブラウザーでボタンをマウスと Space キーで押し、
  中身のはみ出しが報告と一致した(Firefox は Space キーでボタンに `:active` を付けないので、キーの側は安全側。`e2e/layout-active.spec.mjs`)。
- [x] **I16. `:has()` の引数の中の結合子**: 引数は先頭に結合子を 1 つ付けた複合セレクター 1 つに限っていた(アイコンだけのボタン
  `.btn:has(> span:only-child > svg)` で止まる)。`>` と子孫の結合子で下へたどる引数を受け、1 段ずつ前の段の子か子孫で照合する。
  詳細度は引数全体のもの。引数の中の状態と、2 つ目以降の `+` / `~` は Unknown のまま。3 ブラウザーで、どのルールが当たるかが一致した
  (`e2e/layout-flex.spec.mjs`)。
- [x] **I17. `border-image: none`**: 初期値のリセット(hr に当てるもの)も Unknown にしていた。`none` と CSS 全体のキーワードは何も変えない
  宣言として捨てる。捨てるので前の宣言を上書きせず、前に画像があればそれが cascade の結果のまま Unknown になる(安全側)。
- [x] **I18. `width: fit-content` / `min-content` / `max-content`**: ボタンを中身の幅にそろえる書き方で、どの幅も Unknown にしていた。
  block の流れの中の block は、min-content と max-content がその幅、fit-content が min(max-content, max(min-content, 使える幅))
  (CSS Sizing 3 §3.2)。中身で大きさの決まる親(flex の item)へは、auto の幅と同じく min-content と max-content を渡す。
  3 ブラウザーで 500 / 150 / 50px を実測して一致(content-box も同じ)。自分の min-width か max-width がある場合
  (clamp の入れ子の順が変わる)は Unknown のまま(auto margins で寄せる場合は I19)。
- [x] **I19. `width: fit-content` を auto margins で寄せる**: `.f { width: fit-content; margin: 0 auto }` で中央に寄せる書き方を、
  auto margins は px か % の幅に限っていたので Unknown にしていた。I18 の block の流れの中の block では、auto margins が使った幅の
  残り(fit-content と max-content は max-content の幅、min-content は min-content の幅を引いたもの)を取り、両方 auto なら半分ずつ、
  片方なら全部。残りが負(箱が親より広い)ならどちらの margin も 0 で、箱は終わりの側へはみ出す。3 ブラウザーで、fit-content /
  min-content / max-content を `margin: 0 auto`・`margin-left: auto`・`margin-right: auto` で、800 / 500 / 300 / 209 / 208 / 207 /
  190 / 150 / 79 / 78 / 77 / 60 / 50 / 30px を実測して一致(content-box も同じ。中身の min 60 / max 190px、padding 0 8px、border 1px
  で、fit-content の中央寄せは 500px で幅 208・left 146、150px で 150・0、50px で 78・0。min-content は 500px で left 211、
  max-content は 150px でも幅 208・left 0)。反対側の margin が 0 でも auto でもない場合(`margin-left: auto; margin-right: 10px` は
  79px で WebKit が left -9、Chromium と Firefox が 0 と分かれる)と rtl は Unknown のまま。I18 と I19 とも、`container-type:
  inline-size` / `size` の箱は中身を幅に数えない(CSS Containment 3 §3.1)ので Unknown のまま。
- [x] **I20. 中身で大きさの決まる flex の item の中の img・svg・フォーム部品**(#40): px の幅のない置換要素・フォーム部品があると、
  item の幅を Unknown にしていた。実ページで当たっていたのは、高さを決めて幅を auto にしたロゴの img(幅は画像ファイルの比で決まる)と、
  幅 auto の text input だった。3 ブラウザーで、行の幅 2000px(max-content)と 0px(min-content)の item の幅を測った
  (`packages/veriss/test/replaced-content-size.test.mjs` に同じ形)。
  - 一致したので判定する: 幅 auto の img は、高さ × 比(画像ファイルの大きさ、なければ width / height 属性の `aspect-ratio: auto w / h`)を
    content box の幅にする。120×30 の画像で高さ 24px → 96px(min も max も)。border-box で padding 0 4px・border 1px → 98px、
    content-box で padding 2px → 100px、max-width 50px → 50px(高さは 24px のまま。max-width 48px で 48×24 になり、object-fit: fill で絵がつぶれるので
    `W_LAYOUT_IMAGE_DISTORTED` を出す)、min-width 150px → 150px、高さ 24px の親の `height: 100%` → 96px、
    高さも auto でファイルの大きさが分かれば 120px。幅 300px の block の親の中でも 96px(block の置換要素は伸びない)
  - Unknown のまま: 比が分からない img(属性もファイルの大きさもない。読み込んだファイルが幅を決める)。属性とファイルで比が違う img
    (属性 120×30 で正方形のファイル: 読み込み前 96px、読み込み後 24px)。min-height / max-height のある img(max-height 12px → 48px で
    3 ブラウザー一致したが、モデルにしていない)。明示の `aspect-ratio`。px の高さのない親に対する % の高さ。min-height / max-height で高さが変わる親に対する % の高さ(24px で min-height 48px の親 →
    192px、max-height 12px → 48px。3 ブラウザー一致したが、使われた高さは求めていない)。srcset のある img の自然な幅(1 つだけの
    2x の候補で 120×30 のファイルは 60px。候補が複数なら読み込むものが決まらない。px の高さからの幅は 2x でも 96px で、判定する)。block の流れの外
    (縦の flex の container と `justify-items: stretch` の grid では、伸びて 300px になる)
  - フォーム部品はブラウザーで違うので Unknown のまま: text input は Chromium 153px / Firefox 189px / WebKit 155.875px
    (`appearance: none`・padding 0・border 0 でも 145 / 181 / 141.875px、`size="10"` で 83 / 105 / 85.938px、14px・padding 0 10px・
    border 1px の実ページの形で 168 / 190 / 172px)、select は 53 / 65.2 / 63px、textarea は 182 / 164.667 / 152px、
    checkbox は 13 / 14 / 12px。幅 100% の input の min-content も 8 / 8 / 14px で違う
  - 健全性の修正: 幅も viewBox の比もない svg(既定の 300px 幅)は、Chromium・WebKit の min-content が 300px、Firefox は 0。
    これまで 300px として判定していた。min-content を使うところ(中身で大きさの決まる item、grid の fr の列の最小)では Unknown にする
    (max-content は 3 ブラウザーとも 300px。幅 100px の `1fr 1fr` の grid で、Chromium・WebKit は列が 300 / 0px、Firefox は 50 / 50px)。
    width 属性だけの svg(100px)は一致するので判定する
  - 実ページの重み: 16.7% と見えていたのは `tools/blocker-weights.mjs` の数え方の誤り(アダプターのクラス `__ph0` で箱を見つけられず、
    ページの残りを数えていた)。直すと 0.7%(ロゴの img 41 か所と text input 14 か所)。どちらも上の理由で Unknown のまま
- [x] **I21. 中身で高さの決まる block の容器の px の `max-height`**: 開閉するナビゲーションの区画(`max-height: 168.75px` のように
  開いたときの高さを書いたもの)で、子のある auto の高さの block の `max-height` を Unknown にしていた(引き伸ばされる箱と葉だけを扱っていた)。
  block の流れの中の block(と、引き伸ばさずに揃える grid の item)は、高さが min(中身の高さ, max-height)、min-height はその後に掛かる
  (CSS 2 §10.7)。中身は上に詰めたまま、はみ出しは overflow のとおり(visible なら報告、auto ならスクロール)。行の高さと後ろの兄弟は
  clamp した高さで決まる。3 ブラウザーで、掛からない場合(200px)と掛かる場合(100px)を、content-box と border-box、overflow
  visible / hidden / auto、下端に置いた absolute の子、max-height より大きい min-height、2 列の grid の行で測って一致
  (`e2e/layout-max-clamp.spec.mjs`)。最後の子の下の margin が箱を突き抜ける形は、掛かると WebKit だけが margin を外へ出す
  (Chromium と Firefox は出さない)ので Unknown のまま。% と `calc()` の max-height、flex の item の max-height も Unknown のまま。
- [x] **I22. block の中にただ 1 つの inline-level の箱(div の中のボタン)**: `inline-flex` / `inline-block` / `inline-grid` の箱が
  block の唯一の中身のとき、`Unsupported display` などで Unknown にしていた。箱は 1 行に単独で載る: 中身は block-level の display
  (inline-flex は flex、inline-block は block、inline-grid は grid)で組み、幅は shrink-to-fit(I18 の fit-content と同じ)、
  位置は内容の始点(text-align が start / left、ltr)。中身で大きさの決まる親へも block-level の display と同じ幅を渡す。
  行の高さは、親の strut(親のフォントの ascent と descent を親の line-height で上下に配ったもの)が箱の baseline(中のテキストの
  baseline。inline-block は自分のテキストの最後の行、inline-flex は 1 つのテキストの item の最初の行)の上下に収まれば箱の高さに
  なる。親の strut は、テキストの契約が持つフォントの値(丸めた ascent / descent に加えて、フォントの単位の ascender / descender と
  その値が成り立つ weight の範囲)から求める。親が同じ family で、その weight で値が成り立つときに限る。可変フォントは wght の
  範囲すべてで成り立つが、typo の値(USE_TYPO_METRICS)を使い MVAR の hasc / hdsc で instance ごとに変わるフォントは、既定の
  instance の weight だけにする(テキスト自身の weight も同じ。fixture の Roboto と日本語フォントは hhea の値を使い MVAR もないので
  400 以外の weight でも決まる)。
  3 ブラウザーで、親の font-size(0〜24px)と line-height(1、1.5、16〜40px)、テキストの font-size・line-height・weight、
  padding を組み合わせた 840 通りを、inline-block / inline-flex(item、中央寄せ、直接のテキスト、アイコンの後)/ inline-grid と
  ボタンの各形で、Roboto と ascent の高い日本語フォントで測った。strut が 0.5px 以上の余りで収まる組はすべて 3 ブラウザーで
  親が箱の高さ(34px の箱で 34px)、余りが 0.2px 以下では Firefox だけ 0.5px 高い。解析は 1px の余り(親とテキストの大きさが違い
  丸めが別になるときは 2px)を求める。収まらない対照(親の line-height 40px)は、箱の位置が 3 / 4 / 3.6875px と 3 ブラウザーで違う。
  Unknown のまま: 中にテキストのない箱と `overflow` が visible でない inline-block(baseline が下端で、strut の descent が下に
  はみ出し、親が 41 / 40.5 / 40.53px と違う)、親のフォントが分からないとき(`line-height: normal`、フォントのファイルのない
  family、別の大きさで単位のない契約)、`vertical-align` が baseline 以外(middle は余りがあってもブラウザーで違う)、
  text-align が start / left 以外、箱の上下の margin、auto の左右 margin、箱自身の min-width / max-width、
  `container-type: inline-size | size` の箱(size containment で shrink-to-fit の幅が中身を見ない)、inline-grid の
  block 方向、直接テキストを持つ inline-flex(匿名の flex item)、2 つ以上の inline-level の箱が並ぶ行。
- [x] **I23. overflow の箱の中の操作部品とテキストを覆うもの**(見逃し): `html, body { overflow: hidden }`(スクロールの止め方)の body の中のボタンに、
  body を抜け出る fixed のシートが重なっても `E_A11Y_OCCLUDED` が出ず、何も報告しなかった。body が html に overflow を渡さずスクロールコンテナになり、
  中の箱の位置が決まらない(スクロール位置による)ので、覆いの判定が位置のない箱を飛ばしていた。fixed が抜け出る変更の前からある穴で、
  overflow: hidden の箱の外の absolute の兄弟でも同じだった。今は、overflow: clip の中は位置が決まるのでそのまま判定し、スクロールコンテナの中は
  `U_A11Y_SCROLLED_COVER` を出したうえでスクロール位置 0 の配置で `E_A11Y_OCCLUDED` を出す。どちらも祖先が切り取る部分は覆われたと数えない。
  テキストの `U_A11Y_SCROLLED_COVER` も auto / scroll だけを見ていたので、hidden と clip に広げた。375×667 で 3 ブラウザーの elementFromPoint が、
  html と body が hidden、html hidden と body clip、html auto と body hidden、350px の hidden / clip の箱(その下端より下のボタンは
  切り取られて当たらない)、対照(html hidden だけ、overflow なし)で一致し、hidden ではホイールも PageDown もスクロールしなかった。
  残り: 同じスクロールコンテナの中の覆い同士、`E_A11Y_FOCUS_OBSCURED`・`E_A11Y_FIXED_HIDES` などほかの覆いの規則は、位置のない箱をまだ見ない。
- [x] **I24. 絶対配置・fixed の箱の px の margin(負の値も)**: 0 でない margin は Unknown にしていた(広告の中央寄せ
  `top: 50%; left: 50%; margin: -125px 0 0 -150px` で、ページ全体の a11y の判定が消えた。文言も block の margin を消せという見当違いのもの)。
  margin の箱を inset に置く(CSS 2 §10.3.7 / §10.6.4): border の箱は始点の inset + 始点の margin から、終点の inset だけのときは
  終点の inset − 終点の margin で終わる。両側の inset で auto の大きさは、両側の margin も引く。決まりすぎ(大きさも両側の inset もある)の
  ときは終点の inset と margin を捨てる(終点は箱自身ではなく包含ブロックの direction で決まり、rtl では left 側。viewport の direction が html と body で食い違うなど分からないときは、幅か max-width・min-width があれば Unknown)。両側の inset で auto の大きさの置換要素(img など)は自分の大きさのままになるので Unknown。Chromium・Firefox・WebKit で、left/top と負の margin、right/bottom と margin、
  % の inset と px の margin、% の大きさの箱、正の margin、`inset: 0` と auto の大きさ、rtl の決まりすぎ、content-box の padding、border と
  padding のある包含ブロック、fixed の箱(中央寄せ、右下、`inset: 0`)の 16 通りを 320px と 400px で照合し、矩形が一致した
  (e2e `px margins offset absolute and fixed boxes`。対照として margin を 0 にすると全組で矩形が変わる)。包含ブロックの外に出る負の margin は
  inset と同じく `E_LAYOUT_ABSOLUTE_START`。`auto` と % の margin、静的位置の軸(両側の inset が auto)の margin、shrink-to-fit の幅の箱の
  横の margin は Unknown のまま(文言は箱の名前と margin を出す)
- 残り(Unknown のまま): % の max-width の flex の item、中身で大きさの決まる flex の item
  (`flex-basis: auto` で幅も auto)。そのほかは、
  [安全なサブセット](safe-subset.md) の「代わりの書き方」に回す。

## 済み(このチェックリストを作る前に済んだもの)

- [x] easing の行き過ぎ(cubic-bezier、`linear()`)の極値でのシフト検査と CLS の上限、終わりの戻り、relative のオフセット、
  複数のアニメーションの並び、同じ区間で一緒に動くプロパティ、`rem` の補間
- [x] `@property`、`@scope`(`to` を含む)、入れ子の CSS、`@supports`(表)、`@starting-style`(描画だけ)、`@namespace`
  (接頭辞付きと、SVG のないページの XHTML)、`@counter-style`、`@font-palette-values`、`@charset`、`@page`、`@view-transition`
- [x] `translate`・`rotate`・`scale` のプロパティ、回転角の `turn`・`grad`・`rad`
- [x] `W_CSS_IMPORT_IGNORED`、`W_CSS_KEYFRAME_IMPORTANT`、`W_CSS_FONT_NO_GENERIC`、inline の箱の `transform`
