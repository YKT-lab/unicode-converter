# 結合文字メーカー

`combining/` は既存の絵文字（ZWJ）メーカーとは独立したページです。基本文字列の後ろへ選択した結合文字を、指定した順序のまま追加します。基本文字列に複数の文字がある場合、結合文字を各文字へ自動的に複製しません。入力結果と正規化結果は別々に保持します。

## 公式データと正規化

収録版はUnicode 18.0.0の正式データです。合計2,580文字（Mn: 2,090、Mc: 477、Me: 13）を収録しています。

`scripts/build-combining-data.js` は、バージョンを固定した公式UCDの `UnicodeData.txt` から一般カテゴリMn・Mc・Meをすべて取り込みます。CCCが0の文字、補助平面の結合文字、Variation Selectorも除外しません。ScriptとScript_Extensionsは同じバージョンの公式ファイルに基づき、取得URLとSHA-256を生成JSONへ保存します。Unicode License V3の全文は `docs/licenses/Unicode-LICENSE.txt` に同梱します。

同じUCDの分解マッピング、CCC、Full_Composition_Exclusionから正規化用のコンパクトな表も生成します。`js/combining-normalization.js` はHangulのアルゴリズム分解・合成、正準順序、合成阻止も処理します。端末の `String.prototype.normalize()` が古いUnicodeデータを使う問題を避け、収録データと正規化のUnicodeバージョンを一致させます。入力の順序を自動的に変更せず、4種類の正規化結果を別に表示します。

再生成と検証:

```sh
node scripts/build-combining-data.js --cache-dir=/tmp/combining-ucd
node scripts/build-combining-data.js --check --cache-dir=/tmp/combining-ucd
node scripts/test-combining-core.js
node scripts/test-combining-normalization.js --ucd-dir=/tmp/combining-ucd
node scripts/test-combining-fonts.js
node scripts/test-combining-browser.js
```

`--offline` を付けるとキャッシュ済みの原本だけで再生成できます。CIは公式 `NormalizationTest.txt` 全行のUAX #15適合条件、生成物の一致、Hangul全音節、結合クラスの順序、互換分解、補助平面を検証します。ブラウザテストはデスクトップ・スマートフォン幅で検索、追加・順序変更・削除、コピー、データ取得失敗と復旧を確認します。ページは結果を一つのテキストノードとして保持し、入力をHTMLへ挿入しません。

## 表示と既存コンポーネント

既存のロゴ、共通ヘッダー、`pages.css`、`UnicodeFontPolicy.getCandidateFontIds()`、実フォントのcmapから生成済みの `unicode18_font_coverage_index.json` を再利用します。既存の変換処理・単一文字SVG処理は変更しません。

`js/combining-fonts.js` は結合結果を分割せず、一つのテキストとしてブラウザへ渡すためのフォント準備アダプターです。まず、対象文字すべてを収録する同一フォントを共有ポリシーの順序で探します。共通フォントを利用できない場合は、必要な文字体系のフォントを上限12個の範囲で遅延読み込みし、通常のフォントスタックを返します。フォントはウェイト400です。cmap収録は正しい結合配置を保証するものではありません。

URLは実行中のスクリプトURLから解決するため、GitHub Pagesのproject prefixと階層ページの両方を保持します。既存の `font-coverage.js` はトップページ相対URLを使うため、そのまま新ページへ読み込みません。インデックスとフォント読み込みにはそれぞれタイムアウトがあり、失敗時は端末フォントを含む通常表示を継続します。インデックス・フォントのPromiseを共有し、同じファイルを重複読み込みしません。

## SVGの調査結果

既存の `tools/build-svg-precompute.js` の `shape(font, cp)` は、名前に反して単一コードポイントの `glyphForCodePoint()` からアウトラインを取り出します。`js/svg-mode.js` の公開経路も `getGlyph(codePoint)` であり、複数文字のグリフ置換、結合記号の配置、並べ替え、フォントrun情報を持ちません。

リポジトリ内のフォントを既存依存関係 `@cantoo/fontkit` の `layout()` で調べると、次の差が確認できます。

| 入力 | フォント | 単体グリフID | 文字列シェーピング後 |
| --- | --- | --- | --- |
| `a` + U+0301 + U+0323 | NotoSans-Regular.ttf | 68, 2665, 2696 | 759, 2665。置換と結合記号のxOffset=-8 |
| U+0915 + U+093F（कि） | NotoSerifDevanagari-Regular.ttf | 57, 32 | 558, 57。前置母音の順序・字形が変化 |
| U+05E9 + U+05B8（שָ） | NotoSansHebrew-Regular.ttf | 96, 79 | 79, 96。結合記号のxOffset=227 |

従って、個々の既存SVGを横に並べる方式をこのページでは使用しません。文字列全体を通常のフォント表示でシェーピングし、SVG成功を示す属性も付けません。内部情報には `whole-string-shaping-unavailable` を保持できます。これは新ページ固有の通常表示経路です。既存コンバーターの「SVGモードではSVGまたは短い理由表示」という仕様は変更しません。

将来のアウトラインSVG化には、HarfBuzz等の検証済みシェーパー、方向・文字体系・フォントごとのrun分割、GSUB/GPOS、グリフIDとadvance/offsetの反映、双方向テキスト、改行、フォントフォールバックの処理が必要です。fontkitの単一フォント `layout()` だけで任意の混在文字列の対応を保証できません。SVG内の `<text>` も閲覧端末のフォントに依存するため、端末差を解消したアウトラインSVGとして扱いません。

## 既知の制約

- 異なる文字体系、結合記号の過剰な積み重ね、特定のフォントが想定しない組み合わせでは、配置の崩れ、点線円、豆腐、重なりが発生します。組み合わせを禁止したりコードポイントを削除したりしません。
- Variation Selector、ZWJ、その他の書式制御は入力のまま保持します。見えるグリフのフォント候補を選ぶ際に、それらの単独cmap収録を必須にしません。
- 点線円U+25CCは補助プレビューにだけ使います。結果やコピー対象には自動挿入しません。
- フォントが複数に分かれると、ブラウザのfallback境界で結合位置が異なる場合があります。端末フォントの実ファイル・グリフIDは取得できません。
- iPhone/iPad Safari実機、LINE内ブラウザでの表示は別途実機確認が必要です。
