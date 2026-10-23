# ライセンス確認済み事前生成SVG — 最初の本番公開

これは初期公開時の履歴資料です。2026-10-22時点の表示経路と失敗時の挙動は
[SVG表示の安定化](svg-display-stability.md)を参照してください。現行コードは事前生成SVGを使い、
SVGモードで失敗した場合は短い理由を表示します。フォント表示は通常モードで利用します。

2026-10-14 検証。Unicode 18.0 の **167,875文字**すべての一括配信ではなく、出典・ライセンス・ファイルハッシュを突き合わせた **WenJin Mincho P3** から開始する。

## 実測（GitHub Actions）

- 元フォント：`fonts/han/WenJinMinchoP3-Regular.otf`
- GitHub blob SHA-1：`0ee6844067def5cddf3a142e7c9baa237bef9ca9`（上流コミット固定）
- SHA-256：`139b85d33765f2a2938ebdd646766071f869a2351fbdd2cd763b540a55ac811e`
- ライセンス：**SIL OFL 1.1**、原著作権表示と全文を `fonts/han/LICENSE-WenJinMincho.md` に収録
- 上流：`takushun-wu/WenJinMincho`、`181c3a00be4c9827eeb18bda98804e8409d886d3`
- 事前生成文字数：**13,556**
- JSON分割：**132ファイル**
- gzip換算：**6,618,633 bytes**
- 非圧縮合計：**16,268,488 bytes**
- 最大シャード圧縮時：**83,909 bytes**
- ビルドID：`2ed1470e4fcf3fe0`

## 表示方式

**通常表示は変更なし。** SVG表示をユーザーが選択した場合のみ `js/svg-mode.js` は `js/svg-precomputed-loader.js` を使用する。

1. 公開物の `svg-data/active.json` とバージョン付きマニフェストから、Unicode番号の担当JSONシャードを特定する。
2. SHA-256でシャードを検証してSVGパスを表示。クライアントキャッシュは最大6シャード、同時4件、通信再試行あり。
3. 事前生成がない文字、通信でエラーになった文字は、**従来のオンデマンドOpenType.js方式に戻る**。
4. Unicode Scopeは`svg.unicode-svg-outline`と`data-code-point`を引き続き認識する。SVGモード上限は100文字。端末での実測は別途必要。

## 公開時のライセンスゲート

`docs/svg-font-license-approvals.json` で**元ファイルとライセンスのGit blob、SHA-256、上流の固定リビジョン、明示的な配信許可**を管理。

`tools/build-svg-precompute.js --approved-font=...` は単一の承認済みフォントだけを読んで一時ディレクトリにデータを生成する。GitHub Actionsの `scripts/publish-svg-bundle.js` が元フォントとライセンスを照合し、**改変のないデータ・全ファイルの件数／SHAを確認した後だけ** `_site/svg-data/active.json` を作成する。

生成物のビルドフォルダには `LICENSE-1.md`（原ライセンス全文）と `SOURCES.json`（帰属、ライセンスURL、ハッシュ）を同梱する。ライセンス照合失敗時には**全体の公開を中断**し、無断で別フォント由来の輪郭を取り込まない。

## 残る作業

本番でのiPad・Safari・LINEブラウザ確認。ほかのフォントも、その配信条件・著作権表示・ファイル同一性を一つずつ確認してから段階的に追加する。残る **154,319輪郭** は現時点で「事前生成方式での配信対象外」であり、現行SVG互換方式による表示を維持する。

この数値は**対応範囲の優劣ではない**。事前生成経路の処理負担と読み込みの安定性が実機で改善するか別途評価が必要。


## 2026-10-15: OFLファミリーによる収録拡大

最初の13,556文字だけの試験から、著作権表示・SHA-256・原ライセンスを検証した**97フォント**を対象とする自動生成へ移行。データ公開時のチェックは `docs/svg-approved-fonts.json` と `scripts/publish-svg-approved-set.js` に集約。

- 実生成: **167,723文字**（解析可能と確認した167,875文字の約99.9%）
- 配布用分割ファイル: **1,588個**
- gzip換算: **87,848,735 bytes**（約87.8MB）
- 元フォント: Noto 92、WenJin Mincho 1、Plangothic 2、UniHieroglyphica 1、Kaiyuan Small Seal 1
- 未確認: BabelStone Han（別APL）、BabelStone Pseudographica（OFL確認済みだが未統合）、Egyptology Extended（フォントと上流のライセンス表記差）、Mallige（不明）。これら由来のSVGは許諾条件が整うまで**事前生成データとして配信しない**。
- 事前生成データがない文字と通信失敗時は、以前のOpenType.js方式を引き続き使用。

出典・ライセンス本文は `docs/licenses/` に保持し、配信成果物に `SOURCES.json` と `FONT-COPYRIGHTS.txt`、各プロジェクトのOFLライセンス・第三者表示を同梱する。
