# SVGと通常表示の字形・配置（2026-10-23）

## 差が生じていた原因

`tools/build-svg-precompute.js` は各文字の輪郭の境界に余白を加えてSVGの
viewBoxを作り、CSSはそのSVGを一律 `height: 1.12em` で表示していた。
そのため、句点、小書き仮名、細い横線など、本来の輪郭が小さい文字も
大きく引き伸ばされていた。輪郭の線幅も同じ倍率で拡大されるため、太く見えた。
SVG pathに線を加えたり、フォントのウェイトを変更したりする処理が原因ではない。

また、SVG生成はcmap収録数の多いフォントから字形を採用していたのに対し、
通常表示はScriptごとの候補順を利用していた。通常表示のASCIIは端末フォント、
日本語はGoogle Fonts優先であり、同じ文字でも元のフォントが異なり得た。
変換結果の各文字には最小幅、中央揃え、個別の余白も設定されていた。

## 新しい生成・表示経路

`js/font-policy.js` の `getCandidateFontIds` を通常表示とビルドで共有する。
実cmapに収録されたScript優先候補を先に、その後に残るcmap候補を重複なく試す。
SVG生成では従来どおり、ライセンス承認済みのフォントだけを候補に残す。
字形を生成できない候補があれば次を試し、従来利用できた候補を失わない。
通常表示のASCIIと日本語も、まず同じローカル候補を利用する。
通常表示のネイティブカラー絵文字、専用フォント、legacy／Google Fonts／OSへの
フォールバックは維持する。

生成SVGは輪郭の大きさで拡大・移動せず、元のpath座標を保持する。
fontkitの上向きY軸をSVGの下向きY軸へ変換する `scale(1,-1)` のみを適用する。
フォントのem、ascender、descenderからviewBoxを決め、送り幅をそのまま使う。
通常表示・SVG表示の変換結果はregular 400とし、合成太字を加えない。

各SVGの表示幅は `advanceWidth / unitsPerEm` em、表示高は
`(ascent - descent) / unitsPerEm` em、ベースラインに対する位置は
`descent / unitsPerEm` emで決まる。各文字の輪郭の大きさには依存しない。
ゼロ送り幅の結合文字は、pathの描画領域を保ちつつレイアウト上の送り幅を0にする。
左側の負のbearingやemの外に出る輪郭も切り取らない。
変換欄では通常文字と同じ `line-height: 1` の行内ボックスを使い、
SVGの大きなviewportはその外側へ描く。ascenderとdescenderから基準線を合わせ、
SVGのviewportだけが行の高さや文字列の縦位置を変えないようにする。
変換結果では文字ごとの強制的な最小幅・中央揃えと個別拡大を外し、
元の送り幅とベースラインを使う。表示領域からはみ出すときだけ、文字列全体へ
同じ縮小率を適用する。小さい字形だけを拡大して揃えることはしない。

このサイトはUnicodeコードポイントを個別に調べる表示であり、
通常表示・SVG表示ともコードポイント単位の分離を維持する。
文章全体のshaping、kerning、合字、ZWJ Sequenceの組版を新設する変更ではない。

## データ形式と公開ゲート

シャードの `v: 1` と `g[hex] = [viewBox, path]` は維持する。
新しいビルドはmanifestと生成レポートに `layout: "font-metrics-v1"` を付け、
各シャードへ次の追加テーブルを持たせる。

```js
m[hex] = {
  unitsPerEm, ascent, descent, lineGap, advanceWidth,
  fontFile, fontSha256, fontWeight: 400
}
```

メトリクスも含めたシャード全体をバイト数とSHA-256で検証する。
公開ゲートは値の型・範囲、em基準viewBoxとの整合、元フォントのSHA、承認済みの
フォント・ライセンスを検査する。新layoutでメトリクスの欠落があれば拒否する。
旧形式のlayout指定なし・メトリクスなしのデータは互換性のため引き続き読める。
承認フォント一覧、フォントファイル、ライセンス文書は変更しない。

SVGモードでは成功時だけ `data-display-mode="svg"` としてSVGを表示する。
取得・検証・描画が失敗した場合は従来の短い理由表示へ進み、フォント表示へは進まない。
project prefixを保持するURL解決、タイムアウト、AbortController、SHA検証、
古いbuildの404からの回復、破損キャッシュの再取得、文字単位の障害隔離、
古い非同期結果の破棄も維持する。

## 検証

- `node scripts/test-font-policy.js`：通常表示とSVGビルドの候補順、cmap候補の欠落、
  通常モードのフォールバックを確認する。
- `node scripts/test-svg-font-metrics.js`：実フォント16文字を使い、path不変、
  元フォントのem・ascent・descent・送り幅、大小仮名、句点、細い横線、
  ゼロ送り幅と負のbearingを確認する。
- `node scripts/test-svg-precomputed-loader.js`：メトリクスによる寸法と基準線、
  不正メトリクス拒否、旧シャード互換性に加え、既存の通信・検証・回復処理を確認する。
- `node scripts/test-svg-metrics-publish.js`：両公開ゲートで、メトリクスの整合、
  元フォントSHA、非承認フォント拒否、regular 400、旧形式互換性を確認する。
- `node scripts/test-glyph-layout.js`：文字列全体の縮小と、再変換・サイズ変更時の
  レイアウトを確認する。
- `scripts/test-svg-converter-fallback.js` と既存の入力、ランダム、モード切替、
  カラー絵文字、Safari向け専用字形、Unicode、dailyの回帰テストを維持する。

全承認フォントの生成結果は、`test-svg-font-metrics.js --bundle=... --baseline=...` で
旧公開データの全コードポイントが残ることも比較できる。
mainのデプロイと承認フォント集合のPR検証では、実際に生成・公開ゲートを通した
bundleに対してフォントメトリクスの検証を実行する。

今回の全件検証では旧ビルド `fea197e1d9db671f` と新ビルド
`03ecc1e88723235a` を比較し、旧170,775文字のすべてが新ビルドにも存在した。
新ビルドは1,594シャードで、従来の162承認フォントの公開ゲートを通過した。
新しいフォント追加・削除やライセンス条件の変更はない。

Chromiumの幅1,100pxと390pxで、仮名・英字・句読点・結合文字・専用文字の
通常/SVG表示を比較した。同一フォントの送り幅、基準線、輪郭比率を確認し、
50文字の折り返し、文字列全体の等倍率縮小とランダム生成も確認した。
通常文字のヒンティングとSVGの小数座標描画には数ピクセルの差が残る。

## 残るフォント由来の差異

通常表示でBabelStone Han等のSVG未承認フォントを使う場合、SVGでは承認済みの
別フォントを利用する。ここでは字形を変形して一致させず、各フォント本来の比率を尊重する。
通常モードで通信失敗・端末制約等により別のWebフォントやOSフォントへ進んだ場合も、
その結果とSVGが同一フォントになるとは限らない。日本語のローカルCJKフォントを
先に使うため、Google Fontsの小さなサブセットより初回ダウンロードが増える場合がある。

通常モードのカラー絵文字と、SVGの単色アウトラインには元データの違いがある。
同じファイルと400ウェイトを使っても、ブラウザの文字レンダラーとSVGレンダラーでは
hinting、アンチエイリアス、ピクセル丸めが異なるため、小さな差は残る。
コードポイント単位の表示には、結合文字の文脈依存配置や複雑な文字列のshapingに限界がある。

iPhone/iPad実機のSafariおよびLINE内ブラウザの確認は別途必要。
デスクトップブラウザの画面幅変更は、実機の文字レンダラーの検証を代替しない。

## 比較画像を受けての追加調査

2026-10-23の確認時点でPR #13は未マージだった。公開サイトのHTMLは
`svg-precomputed-loader.js?v=20261022-svg-fallback1` と
`converter.js?v=20261022-svg-only2` を参照していた。
公開中のSVGビルドは `462e88cc7cd99565`、manifestにlayout指定はなく、
U+1394のシャードにもメトリクスがなかった。PR #13の新しいem表示は
この公開経路ではまだ利用されていなかった。

U+1394は **ETHIOPIC TONAL MARK DIFAT**。通常表示で利用できるローカル候補は
`fonts/scripts/NotoSansEthiopic-Regular.ttf`（400）のみである。
このファイルのcmapと単独文字のshapingは、どちらもグリフID **96**
（`difat.eth`）を選ぶ。旧・新SVGのpathもこのグリフのpathと完全一致する。
異なるUnicodeへの変換や別グリフの抽出は起きていない。

| 項目 | 旧SVG | em基準の新SVG |
| --- | --- | --- |
| viewBox | `43.72 -240.28 395.56 267.56` | `0 -1069 483 1362` |
| CSS高さ | `1.12em` | `1.362em` |
| 原字形の輪郭高 | 213フォント単位 | 同じ213フォント単位 |
| font-size 42pxでの輪郭高 | 約37.45px | 約8.95px |
| 送り幅の扱い | 切り抜いたviewBoxに依存 | 元の483/1000em |

新SVGのCSS幅は `advanceWidth / unitsPerEm` em、高さは
`(ascent - descent) / unitsPerEm` em。これらをviewBoxの幅・高さで割ると、
どちらも `font-size / unitsPerEm` となり、通常文字と同倍率になる。
U+1394の本来の輪郭高は **0.213em**、送り幅は **0.483em** であり、
小さく低い位置にある字形が元フォントの設計である。
旧方式の約4.186倍の拡大が、比較画像の大きなアーチと整合する。

追加調査では別の境界条件も修正した。通常文字のはみ出し判定を表示サイズの
Canvasメトリクスで行うと、ヒンティングや丸めで輪郭幅が整数寄りになり、
小数のSVG輪郭なら収まる幅で通常モードだけ文字列全体が縮小され得た。
通常文字は1000pxで計測してCSSピクセルへ換算するようにし、SVGと同じ精度へ近づけた。
旧実装で失敗し、新実装で成功する境界幅の回帰テストを追加した。
一律の縮小係数や文字ごとの拡大は追加していない。

成功した文字にも `data-code-point`、通常フォントの
`data-font-family` / `data-font-source` / `data-font-file` / `data-font-sha256`、
SVGの `data-svg-build` / `data-svg-layout` を記録する。
旧データのlayoutは `legacy-bounds`、新データは `font-metrics-v1` として識別する。
OSフォントへ進んだ場合はローカルファイル名・SHAの属性を消し、
利用を確認できなかったフォントを使用中と誤記録しない。
表示文言や通常/SVGの描画経路は変えない。

`scripts/test-svg-font-metrics.js` はEthiopicの声調記号10文字を加えた26文字で、
正式なフォントファイル、cmap・shapingのグリフID、path、送り幅と大小比を検査する。
`scripts/test-svg-visual-parity.js` はPlaywrightを別途利用するブラウザ比較用テストで、
次のように実行する。PNGとJSONはリポジトリの外へ出力する。

```sh
node scripts/test-svg-visual-parity.js \
  --bundle=/path/to/new-svg-bundle \
  --baseline-root=/path/to/old-site-source \
  --baseline-bundle=/path/to/old-svg-bundle \
  --chromium=/path/to/chromium \
  --out=/path/to/comparison-output
```

固定の同一入力を実際の切替ボタンで通常/SVGへ変換し、字順・個数・入力の保持、
font-size・em・viewBox・CSS寸法・行間・文字間隔・全体縮小率を記録する。
通常文字はChromiumのCDPでも実際の使用フォントを確認し、ローカルファイルの
cmap・shapingのグリフIDとSVG pathを照合する。小さい画面幅も同じ文字列で比較する。
Canvas計測には大きな要求サイズでもブラウザ側のヒンティングや丸めが残るため、
その値は記録しつつ、正確な輪郭の判定は元フォントの境界とSVGの物理寸法を直接比較する。
通常表示側も実フォント、font-size、文字の送り幅を独立に照合する。

追加実測では、固定19文字について幅1100px・390pxの旧公開方式と新方式を
比較し、両モードの字順・個数が一致した。新方式では全19文字の実フォントが
一致し、出力全体のfont-sizeはそれぞれ48px・42px、全体縮小率は両モードとも1だった。
U+1394も両方の実フォントがNoto Sans Ethiopic、cmap・shapingのグリフIDが96だった。

| U+1394のSVG実測 | PC幅1100px | モバイル幅390px |
| --- | --- | --- |
| 旧公開方式の輪郭高 | 42.78px | 37.43px |
| 新方式の輪郭高 | 10.22px | 8.94px |
| 新方式の通常表示の送り幅 | 23.1875px | 20.296875px |
| 新方式のSVGの送り幅 | 23.171875px | 20.28125px |

約0.016pxの送り幅差はブラウザのレイアウト丸めの範囲である。
Canvasの輪郭計測にもキャッシュ・ヒンティング由来の差が残るため、
その値だけを根拠にSVGを一律に縮小しない。

添付画像だけでは元の入力全文や端末の実フォントを確定できないため、
既定の再現列はU+1394を含む固定19文字とした。`--text=` または `--codepoints=` で
別の可視文字列も同じ条件で比較できる。
CSSのfont-familyだけから端末フォントやそのグリフIDを推定することはしない。
iPhoneにのみ存在する端末フォントはSVG生成環境では利用できない。
同じフォントファイルがライセンス承認済みの生成環境にない場合は、
対応する承認済みフォントの字形を保ち、端末フォントと無理に一致させない。
iPhone Safari・LINE内ブラウザの実機確認は今回も未検証である。
