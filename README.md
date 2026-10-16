# naga-t.jp — Typewriter section

Astro / CSS / SVG / GSAP / ScrollTrigger / JavaScript で作った、スクロールに合わせて紙に文章を印字するセクションです。

紙は横移動せず、改行ごとに1行分上へ送られます。印字ヘッドが右へ進み、行末で左端へ戻ります。紙・文字・ローラー・ノブ・タイプバー・各キーは同じ進行度に同期し、上スクロールで逆再生します。

## ローカル実行

Node.js **24 LTS** 推奨（`package.json` の下限は 22.22.0）。

```sh
npm install
npm run dev
```

表示されたローカルURL（通常 `http://localhost:4321`）を開いてください。Astro 7では開発サーバーがバックグラウンド起動します。停止は `npx astro dev stop`、ログは `npx astro dev logs` です。

```sh
npm run check        # 構文チェックと16件の状態・素材テスト
npm run build        # dist/ に静的サイトを生成
npm run preview      # ビルド結果を表示
npm run assets       # 14個の透過SVGパーツを再生成
npm run package      # 配布用プロジェクトを release/ に生成
```

`npm run build:about` は既存の `/about/` 配置用ビルドです。公開操作は行いません。

## 内容を変える

[src/config/typewriter.js](src/config/typewriter.js) の `welcome` と `body` を編集します。

- `# 見出し`：中央寄せ。`## 見出し`：左寄せ。
- `---`：印字する罫線。空行：1行送り。
- `・項目` / `- 項目`：ぶら下げインデント付きの箇条書き。
- 英数字は等幅、日本語は全角ピッチ。禁則処理と長いURLの折返しに対応。
- `scrollPerStroke`：1打鍵に割り当てるスクロールpx。
- `scrub`：追従時間（秒）。`0` ならスクロールと直結。
- `platenRadius`：ローラーの半径（設計座標）。紙送りと回転角の換算に使用。

最初は「Welcome to naga-t.jp」が印字済みです。本文は既存の自己紹介文を引き継いでいます。

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `src/components/TypewriterIntro.astro` | SVGレイヤー、独立したHTML用紙、全文テキスト |
| `src/assets/typewriter/` | 今回の14個の分割SVGとパーツ一覧JSON |
| `src/scripts/motion.js` | 組版・イベント列・任意の進行度からの状態計算 |
| `src/scripts/typewriter.js` | GSAP / ScrollTrigger、DOMへの描画、リサイズ、後処理 |
| `src/styles/typewriter.css` | 紙・文字・重なり・レスポンシブ・静止表示 |
| `scripts/generate-typewriter.mjs` | SVG素材の再生成 |
| `scripts/typewriter-detail-source.svg` | 既存の外装・キーなどを継承する紙なしのベクター原稿 |
| `tests/motion.test.js` | 印字位置・紙送り・逆再生・素材構造のテスト |
| `scripts/verify-browser.mjs` | Chrome/Chromiumでの実DOM・スクロール検証 |

[素材・座標・レイヤーの説明](docs/implementation.md) / [検証記録](docs/verification.md) / [画面キャプチャ](docs/screenshots/)

既存の `src/assets/typewriter.svg` と `typewriter.original.svg` は過去の参照用です。今回のコンポーネントでは読み込まず、`release/` にも含めません。

## 動きを減らす・全文を読む

`prefers-reduced-motion: reduce` では画面の固定や長いスクロール区間を作らず、全文を通常の文書として表示します。設定の途中切替にも対応します。「演出 ON/OFF」ボタンで静止表示（文章のみ）と行き来できます。JavaScript無効時も全文を読めます。スクリーンリーダーには打鍵ごとの通知を流さず、文書構造を提供します。

## ブラウザ検証を再実行

開発サーバーを起動した状態で実行してください（ソースモジュールを使うため `preview` ではなく `dev`）。

```sh
npx playwright install chromium
npm run test:browser
```

インストール済みChromeを使う場合は、環境変数 `BROWSER_EXECUTABLE` に実行ファイルのパスを指定できます。`PREVIEW_URL` でサーバーURLを変更できます。検証結果は `docs/browser-results.json` と `docs/screenshots/` に保存されます。
