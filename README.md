# サブスク棚卸しチェッカー（subscription-checker）

加入中のサブスクを3項目入力するだけで、解約検討度を★1〜5でスコアリングするWebツール。
ブログ記事「サブスク棚卸し」（https://dacchooo-money.com/subscription-review/）の遷移先として、フォロワー向けに無料配布する静的サイト。

**🚀 本番URL：** https://dacchooo.github.io/subscription-checker/（GitHub Pages公開済み）

## 構成

- 純粋な HTML + Vanilla JavaScript + Tailwind CSS（CDN）
- ビルド不要、Node.js 不要
- 静的ホスティングならどこでもデプロイ可能（GitHub Pages 推奨）
- データは **localStorage** に永続保存（サーバー送信なし）

## ファイル構成

```
subscription-checker/
├── index.html              # トップページ
├── app.html                # サブスク登録・一覧
├── result.html             # 結果ページ（スコアリング・アフィリ）
├── about.html              # 運営者情報
├── privacy.html            # プライバシーポリシー
├── terms.html              # 利用規約
├── css/style.css           # 補助CSS
├── js/
│   ├── app.js              # 共通：localStorage管理・GA4・スコアリング
│   ├── manage.js           # 登録・編集・削除ロジック
│   └── result.js           # 結果ページの描画
├── data/
│   └── affiliates.json     # アフィリ案件（PR表記必須・体験済みのみ）
├── images/characters/      # だっちょキャラ画像
└── README.md
```

## 主要機能

### 入力（app.html）
- サブスク名（自由入力）
- 月額金額（円）
- 使用頻度（よく使う / たまに / 1ヶ月以上使ってない）

### スコアリング
| 項目 | スコア加算 |
|---|---|
| 1ヶ月以上未使用 | +50 |
| たまに使う | +20 |
| よく使ってる | 0 |
| 月額3,000円以上 | +30 |
| 月額1,000円以上 | +20 |
| 月額1,000円未満 | +10 |

スコア合計 → ★1〜5に変換：
- ★5（80+）：即解約検討
- ★4（60-79）：解約強く検討
- ★3（40-59）：見直し余地あり
- ★2（20-39）：様子見
- ★1（0-19）：継続OK

### 結果ページ
- 月額・年間合計
- 節約見込み額（★4以上の合計）
- 解約検討度ランキング
- アフィリ訴求（マネキャリ / ABCash / GFS / TORCHES）
- LINE / インスタDM動線

## ローカル開発

```bash
cd subscription-checker
/usr/bin/python3 -m http.server 8766
# → http://localhost:8766/ でアクセス
```

## デプロイ

GitHub Pages 自動デプロイ：
```bash
git add .
git commit -m "Update"
git push
# → 数十秒後に本番反映
```

## 法的セーフネット 10項目（全クリア）

- [x] PR表記（アフィリ訴求箇所）
- [x] 最終更新日表示
- [x] 免責バナー
- [x] 運営者情報ページ（about.html）
- [x] プライバシーポリシー（privacy.html・GA4使用明記）
- [x] 利用規約（terms.html）
- [x] 断定表現の排除（「絶対解約」「最強」NG）
- [x] スコアは「目安」と明記
- [x] 承認フロー（自動更新ナシ）
- [x] フッター1行注釈

## GA4 計測

測定ID：`G-LYNYEMRMWH`（節約診断と同じプロパティ）

主要イベント：
- `checker_start` - トップでスタートボタンクリック
- `checker_open` - app.html到達
- `subscription_add` - サブスク追加
- `subscription_delete` - 削除
- `result_view` - 結果ページ表示
- `affiliate_click` - アフィリリンククリック
- `line_signup_click` - LINEボタンクリック
- `feedback_dm_click` - インスタDM導線クリック
