# SVG表示の経路と安定化（2026-10-22）

調査対象は本番 `YKT-lab/unicode-converter`、修正前コミット
`d8a57b6842f198742cde93960f9fd6579d970874`。

## 修正前の表示経路

1. `js/main.js`：16進入力・一括入力・Enter・ランダム・履歴復元から変換を呼ぶ。
2. `js/converter.js`：トークン解析、Unicode 18割当と実フォントcmap、不可視判定。
3. SVGモードなら `js/svg-mode.js/createSvgGlyph` が事前生成クライアントを呼ぶ。
4. `js/svg-precomputed-loader.js` が `svg-data/active.json`、
   `<build-id>/manifest.json`、担当 `page-....json` の順に取得する。
5. シャードのバイト数・SHA-256、JSON構造・字形座標を検証し、SVG pathをDOMへ追加する。
6. 修正前はSVG未対応・取得失敗・例外で理由表示に置換し、通常フォント経路へは進まなかった。

SVGはGitHub Actionsで事前生成・検証して公開する。
`svg-mode.js`に残る旧OpenType.js解析関数は、この経路から呼ばれない。
承認済みフォント、ライセンス確認、生成・公開ゲートは今回変更していない。

## 調査で確認した問題と対処

| 段階 | 確認した実装上の問題 | 対処 |
| --- | --- | --- |
| 入力・事前判定 | ローカルcmap未収録だけで終了し、SVG有無も確認しない | 未割当・制御・不可視を先に分け、SVGモードではSVGデータを確認 |
| URL生成 | `document.baseURI`依存で、末尾slashなし・別階層ではproject prefixが欠落し得る | 実行中の `js/svg-mode.js` URLから `../svg-data/` を解決 |
| fetch・本文・ハッシュ | 完了しないPromiseに期限がなく、後続文字も待ち続ける | 各リクエスト既定8秒。AbortControllerとPromise競争で本文・検証も終端し、取得枠を解放 |
| JSON読取 | 壊れたactive/manifest JSONを通信失敗と誤分類 | JSON形式エラーと通信エラーを分離 |
| ブラウザ機能 | SHA-256 API不足も一律データ不整合 | 内部では機能不足を区別し、SVGモードでは「検証失敗」。未検証SVGは描画しない |
| キャッシュ・公開切替 | 古いビルドの404や壊れたキャッシュからの回復が限定的 | 404・サイズ／SHA不一致に限りポインター更新＋HTTPキャッシュを避けた再取得を1回 |
| 表示 | 取得・検証・描画の失敗理由が不明確 | SVGモードはSVG成功または短い理由。通常モードはWebフォント・OSフォント・理由表示 |
| 非同期処理 | 1文字のCanvas等の例外がバッチを停止し得る | 文字単位で隔離。入力変更・クリア・モード切替後は古い結果を追加しない |

過去に利用者が見た「SVG読込失敗」の通信記録・端末ログは入手していない。
ここで確認した欠陥の再現と、過去の個別障害の原因特定は区別する。
通常のGitHub Pagesは末尾slashへリダイレクトするため、slashなしの再現だけでは
現在の本番パスが誤っていることを示さない。

## 表示モードの分離と診断

SVGモードは、事前生成SVGを正常取得・検証・描画できた場合だけ字形を表示する。
失敗した文字は短い理由に置き換え、Webフォント・OSフォント・ネイティブ絵文字を試さない。
SVGモードの成功・失敗はどちらもそこで処理を終え、通常表示経路へ進まない。

通常モードは実cmapで選択したWebフォント・OSフォント・理由表示の経路を維持する。
カラー絵文字の優先処理と、Safari向けの検証済み8専用字形の扱いも通常モードで維持する。

SVG失敗は `code / stage / url / phase` を持つ。`stage` は
`input / loader / active / manifest / shard / render`、`phase` は
`fetch / body / hash / decode / validation / geometry` 等。
`missing / network / timeout / integrity / manifest / format / version / processing / unsupported`
を区別し、HTTP失敗時はエラーにstatusを保持する。

SVG成功時は `data-display-mode="svg"`、失敗時は `"svg-error"` とする。
失敗時の `data-svg-error / data-svg-stage / data-svg-url / data-svg-phase` は
ローダーの診断情報を保持し、`data-reason` は下表の表示分類を示す。
コードポイントは `data-code-point` に保持し、短い表示文言には付け足さない。

| 状態 | SVGモードでの表示 | data-reason |
| --- | --- | --- |
| Unicode未割当 | 未割当 | unassigned |
| 制御文字 | 制御文字 | control |
| 不可視文字・スペース | 不可視文字 | invisible |
| SVGエントリーなし・私用領域 | SVG未対応 | svg-unsupported |
| 404・通信失敗・ローダーなし | 読込失敗 | svg-load-error |
| SHA・サイズ・JSON・manifest不正、検証API不足 | 検証失敗 | svg-integrity-error |
| SVG DOM・geometry・描画例外 | 描画失敗 | svg-render-error |
| 待機期限 | 時間切れ | timeout |

geometry・DOM生成失敗は、低レベルコードが `format` でも「描画失敗」とする。
Garay／JurchenもSVG未収録なら「SVG未対応」と表示する。通常モードでは文字ごとの
実cmapを基準にフォント未提供と取得失敗を区別する。対応情報が取得できなければ
未割当と断定しない。

Unicode対応情報・絵文字情報・フォント選択も待機を制限する。
SVGの外側には18秒の待機上限を設ける。文字単位でSVG取得を試し、前の文字の
active／manifestの一時的な失敗を後続文字の取得省略に使わない。
通常のmanifest／シャードキャッシュ、取得枠制限、失敗時のキャッシュ解放は維持する。

## 検証

- `node scripts/test-svg-precomputed-loader.js`：URL、JSON破損、SHA検証、キャッシュ更新、
  fetch／本文／digestの停止、AbortControllerなし、並列枠解放、エラー分類。
- `node scripts/test-svg-converter-fallback.js`：69ケース。SVG専用経路の短文分類、フォント呼出し禁止、
  後続文字の継続、待機期限、古い結果の混入防止。通常モードのWeb／OSフォント・
  カラー絵文字・Safari向け専用字形も回帰確認する。
- 既存SVG・公開ゲート・Unicode・モバイル字形・daily等の回帰テスト。
- 既存builderとpublisherによる承認済み162フォントの実データ生成・検証：
  170,775字形、1,595シャード、build `fea197e1d9db671f`。
- Chromium 154で実配信データとローカルHTTP応答を使う15シナリオが成功。
  Google Fonts通信を遮断し、SVG成功・失敗時短文・フォント表示へ進まないこと・
  通常モード・モード切替・project prefixを確認した。
- `scripts/test-*.js` 全15本成功。新しいconverterテストはデプロイ時に加え、
  `SVG Phase 2 Integration Checks` によるPR検証でも実行する。

## 未確認事項

iPhone/iPad実機のSafari、およびLINE内ブラウザでの検証は別途必要。
自動WebKit検証や端末サイズのエミュレーションは実機確認と同一ではない。
GitHub Pagesの本番CDN・通信キャッシュでの確認は、変更公開後に必要。
Canvasによる欠落検出には端末差があり、フォント未提供やライセンス上SVG化できない字形の
収録範囲を今回拡張するものではない。
