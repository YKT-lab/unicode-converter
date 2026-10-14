# GitHub Pages 一本化の切り替え手順

**現在：作業ブランチでのみ準備中。本番の設定はまだ変更していません。**

## 理由

これまではGitHub標準のブランチ公開、`font-coverage.yml`、`daily-character.yml` の3つの公開経路がありました。標準公開では `js/opentype.min.js` および `fonts-svg/` が生成されないため、SVG表示が時々「SVG読込失敗」になる主な原因候補です。

## 導入する構成

| ワークフロー | 担当 |
|---|---|
| `Unicode 18 Font Coverage Build` | フォント監査、Unicode索引の更新（公開はしない） |
| `Daily Unicode Character` | 日本時間00:05の抽選と `daily.json` 更新（公開はしない） |
| `Unicode Converter Site Deployment` | **サイト公開の唯一の担当**。常に最新mainを取得し、フォント索引とSVG互換用資産を組み立てて公開 |
| `SVG Phase 2 Integration Checks` | 事前生成SVGローダー等のテスト（公開なし） |

`site-deploy.yml` はmainのpush、フォント監査/日次処理の成功、手動起動で動きます。フォント追加時は最新版の索引を毎回再生成し、SVG用の解析ライブラリと6種類の変換フォントを同じデプロイ成果物へ含めます。

ライセンス未確認の事前生成SVG輪郭（`svg-data/`）は配信しない構成を維持します。

## 切り替え順序

1. GitHubリポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に変更する。これで標準のブランチ公開と衝突しなくなります。**この設定だけはリポジトリ管理者が操作してください**。
2. このPRをmainにマージする。既存のフォント監査・日次抽選から直接公開する部分がなくなり、新しい`site-deploy.yml`だけが公開を担当します。
3. GitHub Actionsで `Unicode Converter Site Deployment` の完了が **success** になるまで確認する。
4. サイトを開き、通常の文字変換、SVG切り替え、戻る、ランダム生成、Scope、NEWSリンク、日次表示を確認する。
5. SVG表示で以前「読込失敗」だったコードポイントを再試行する。ネットワークなど別原因の可能性もあるため、これだけで100%解消するとは断定しません。

## 安全上の注意

- **Sourceの変更前にこのPRをマージしないこと**。旧標準公開と新Actions公開の競合が残り得ます。
- `Daily Unicode Character`のcronは変更していません。コード更新時の余計な日次再抽選は廃止。
- 日次更新のGITHUB_TOKENコミットが通常のpushイベントを発火しない場合も、`workflow_run`でデプロイします。
- 事前生成SVGのライセンス確認・公開と、このPages一本化は独立した作業です。
- 問題が起きたらこのPRの変更をrevertし、`GitHub Actions`の公開経路で従来のフォント監査ワークフローを手動実行できます。詳細な復旧が必要なら変更前の動作を確認して行います。

## テスト

作業ブランチの `Validate Unified Pages Deployment` が実データのフォント監査とサイト組み立てを公開なしで検証します。`node scripts/test-pages-unification.js` では、実際にデプロイする独自ワークフローがちょうど1つであることをテストします。
