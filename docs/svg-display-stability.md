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
| 入力・事前判定 | ローカルcmap未収録だけで終了し、SVG・OSフォントを試さない | 未割当・制御・不可視を先に分け、字形は表示経路で確認 |
| URL生成 | `document.baseURI`依存で、末尾slashなし・別階層ではproject prefixが欠落し得る | 実行中の `js/svg-mode.js` URLから `../svg-data/` を解決 |
| fetch・本文・ハッシュ | 完了しないPromiseに期限がなく、後続文字も待ち続ける | 各リクエスト既定8秒。AbortControllerとPromise競争で本文・検証も終端し、取得枠を解放 |
| JSON読取 | 壊れたactive/manifest JSONを通信失敗と誤分類 | JSON形式エラーと通信エラーを分離 |
| ブラウザ機能 | SHA-256 API不足も一律データ不整合 | 検証機能未対応として分類。未検証SVGは描画せずフォントへ進む |
| キャッシュ・公開切替 | 古いビルドの404や壊れたキャッシュからの回復が限定的 | 404・サイズ／SHA不一致に限りポインター更新＋HTTPキャッシュを避けた再取得を1回 |
| 表示 | SVG失敗後に字形が表示できるWebフォントも試さない | 既存の通常表示を再利用し、Webフォント・OSフォント・理由表示の順に進む |
| 非同期処理 | 1文字のCanvas等の例外がバッチを停止し得る | 文字単位で隔離。入力変更・クリア・モード切替後は古い結果を追加しない |

過去に利用者が見た「SVG読込失敗」の通信記録・端末ログは入手していない。
ここで確認した欠陥の再現と、過去の個別障害の原因特定は区別する。
通常のGitHub Pagesは末尾slashへリダイレクトするため、slashなしの再現だけでは
現在の本番パスが誤っていることを示さない。

## 修正後のフォールバックと診断

SVGモードでは事前生成SVGを優先する。失敗時は通常表示経路へ進み、カラー絵文字、
実cmapで選択したWebフォント、OSフォントを利用する。Safari向けの検証済み8専用字形を維持する。
SVG失敗後のネイティブ絵文字も欠落を検査し、対応していない端末なら次のフォント候補へ進む。

SVG失敗は `code / stage / url / phase` を持つ。`stage` は
`input / loader / active / manifest / shard / render`、`phase` は
`fetch / body / hash / decode / validation / geometry` 等。
`missing / network / timeout / integrity / manifest / format / version / processing / unsupported`
を区別し、HTTP失敗時はエラーにstatusを保持する。

表示要素には `data-display-mode`、SVG失敗時は `data-svg-error / data-svg-stage /
data-svg-url / data-svg-phase` を保持する。成功時に大きなエラー表示は出さない。
最終的な理由表示は `data-reason` で未割当・制御・空白・不可視・私用領域・
Garay／Jurchen未対応・フォント待機期限・データ取得不能・その他描画障害を識別できる。
対応情報が取得できなければ未割当と断定しない。

Garay／Jurchenは文字ごとの実cmapを基準にする。例えば現indexの `U+18E00` は
Plangothic P2に収録されるため、取得失敗を「フォント未提供」と誤分類しない。
`U+18E01` 等の未収録字形はJurchen未対応として説明する。

Unicode対応情報・絵文字情報・フォント選択も待機を制限する。
SVGの外側には18秒の待機上限を設ける。リリース全体の失敗は同じバッチで再利用し、
各文字で同じ待機を繰り返さない。単一文字の正常なSVG未対応は、後続文字を抑止しない。

## 検証

- `node scripts/test-svg-precomputed-loader.js`：URL、JSON破損、SHA検証、キャッシュ更新、
  fetch／本文／digestの停止、AbortControllerなし、並列枠解放、エラー分類。
- `node scripts/test-svg-converter-fallback.js`：40ケース。通常表示・Webフォント・OS・
  絵文字・専用字形、原因分類、文字単位の障害隔離、待機期限、古い結果の混入防止。
- 既存SVG・公開ゲート・Unicode・モバイル字形・daily等の回帰テスト。
- 既存builderとpublisherによる承認済み162フォントの実データ生成・検証：
  170,775字形、1,595シャード、build `fea197e1d9db671f`。
- Chromium 154で実配信データを使った12シナリオが成功。SVG描画、未収録絵文字、
  404・通信遮断・SHA不一致・検証APIなし・取得停止からの復旧、OSフォント、
  最終理由、モード切替中の競合、project prefix・末尾slashなし・別階層を確認した。
  ローカルHTTPをブラウザ側で応答し、Google Fontsへの通信は遮断した。

## 未確認事項

iPhone/iPad実機のSafari、およびLINE内ブラウザでの検証は別途必要。
自動WebKit検証や端末サイズのエミュレーションは実機確認と同一ではない。
GitHub Pagesの本番CDN・通信キャッシュでの確認は、変更公開後に必要。
Canvasによる欠落検出には端末差があり、フォント未提供やライセンス上SVG化できない字形の
収録範囲を今回拡張するものではない。
