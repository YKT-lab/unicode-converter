# SVG事前生成 Phase 2 — 接続準備

## 2026-10-14 実装済み

- `js/svg-precomputed-loader.js`: ビルドID付き分割データの取得、最大4並列、LRUキャッシュ、SHA-256整合性検査、通信リトライ、SVGパス描画。
- `js/svg-mode.js`: 事前生成ローダーへの接続を追加。ただし `SVG_PRECOMPUTED_RELEASE_ENABLED=false` のため、現状の従来SVG処理が実行される。通常表示はそのまま。
- `index.html`: 事前生成ローダーを読み込む（実行・データ取得は利用開始まで発生しない）。
- `scripts/publish-svg-bundle.js`: 全輪郭データの公開をライセンス許可記録とハッシュ検証で制限。入力に不整合があれば配信しない。
- `docs/svg-font-license-approvals.json`: 最初は承認ゼロ。誤って公開されない初期状態。
- `.github/workflows/svg-phase2-check.yml`: CIで既存表示のテスト、ローダーテスト、ライセンスゲート、3文字の実フォント生成検証を実施。

## 配信をまだ有効にしない理由

フォント由来の **167,875文字分の大量な輪郭データは未配信**。101種類のローカルフォントそれぞれの実際の寄与状況と、再配布・ライセンス表示・派生輪郭の利用条件の確認が必要。

`svg-data/active.json` が公開されるまでは `SVG_PRECOMPUTED_RELEASE_ENABLED` を絶対に `true` にしないこと。

## 次の作業

1. フォントごとのライセンスと表示義務を確認し、審査記録を SHA-256 付きで整理。
2. GitHub Pagesの公開経路を一本化する。独自の font-coverage と daily-character ワークフローから直接公開する部分を取り除き、統合デプロイのみから公開する。
3. サイト公開方式を GitHub Actions に揃える（GitHub Settings → Pages の設定）。
4. 安全なフォント由来の事前生成SVGのみ配信し、実機テスト後にフラグを有効化。

注意：追加コードだけで現行の「SVG読込失敗」が直るわけではない。複数の公開経路が競合している問題は別途対処する。
