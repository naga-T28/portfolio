# NAGA-T — Typewriter Intro

Astro + CSS / SVG + GSAP / ScrollTrigger + JavaScript で作った、ポートフォリオ冒頭のタイプライター演出です。

## 今回の動作

- 最初は、用紙上部に **welcome to naga-t.jp** だけが印字されています。
- スクロールすると本体は画面下に留まり、紙と印字済みの文字が一緒に上へ送られます。
- 紙送り量に合わせて左右のプラテンノブが回転します。キーやキャリッジを理由なく動かさず、用紙を送り出す動作を実装しています。
- 上へスクロールすると紙が戻ります。「はじめに戻る」でも先頭へ戻せます。
- スマートフォンでは見出しを2行に折り返し、紙の長さを画面に合わせます。
- OSの「視差効果を減らす」等の設定が有効な場合は静止表示になります。

作品紹介・プロフィール・追加入力の文章は含みません。今回の指定文は初めから印字済みなので、文字を一文字ずつ打つ処理やキャリッジの改行動作は実行しません。

## まず動かす

Node.js **24系**を使ってください。使用しているAstro 7.4.0のNode要件は22.22.0以上です。Node 24.19.0でビルドを確認しています。

```bash
cd naga-t-typewriter
npm ci
npm run dev
```

ターミナルに表示されるURLをブラウザで開きます。通常は `http://localhost:4321/` です。

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run build` | `/` に配置する静的ファイルを `dist/` に出力 |
| `npm run build:about` | `/about/` に配置する静的ファイルを `dist-about/` に出力 |
| `npm run preview` | `dist/` のローカル確認 |
| `npm run check` | JavaScript構文と紙送り計算の検証 |
| `npm run package` | 両方をビルドして配布用 `release/` を作成 |

`dist/index.html` のダブルクリックではなく、開発サーバー・プレビューサーバー・HTTP配信で確認してください。ES Modulesと絶対URLのアセットを使用しています。

## Xserverでの配置

### `https://naga-t.jp/` に置く

`dist/` **の中身**を、このドメインの公開フォルダーに配置します。`index.html`・`_astro/`・`favicon.svg` を同じ階層に置いてください。

### `https://naga-t.jp/about/` に置く

`dist-about/` **の中身**を、このドメインの公開フォルダー内の `about/` に配置します。

`dist/` と `dist-about/` はアセットの参照先が異なるため、配置先に合う方を使ってください。公開フォルダー名やドメインの割り当ては、ご自身のサーバー設定で確認してください。既存サイトのファイルを変更する前にバックアップしてください。

サーバー上でNode.jsを動かす必要はありません。ビルド済みのHTML・CSS・JavaScript・SVGを配信します。

## よく変更する場所

`src/config/typewriter.js` にまとめています。

```js
welcome: 'welcome to naga-t.jp', // 最初から紙に表示する文言
scrollScreens: 1.65,             // 必要なスクロール距離
paperTravelScreens: 0.46,        // 紙を送る距離
scrub: 0.32,                     // スクロールへの追従を滑らかにする秒数
platenRadius: 31,                // 紙送りとノブ回転の関係
```

- 文言に `\n` を入れると改行できます。
- 全体の色や本体サイズは `src/styles/global.css`。
- ページタイトル・description・canonicalは `src/layouts/BaseLayout.astro` と `astro.config.mjs`。
- `src/assets/typewriter.original.svg` は前回制作した元の素材です。
- `src/assets/typewriter.svg` は、その素材に可変長の紙・見出し差し込み位置・ノブ回転グループを加えた実装用です。

## 構成

| ファイル | 役割 |
|---|---|
| `src/pages/index.astro` | 今回の1ページ |
| `src/components/TypewriterIntro.astro` | インラインSVG・最小限の操作UI |
| `src/scripts/typewriter.js` | GSAP、ScrollTrigger、SVGレイヤー操作 |
| `src/scripts/motion.js` | 用紙サイズ・送り量・ノブ回転の計算 |
| `src/config/typewriter.js` | 文言と速度の設定 |
| `src/styles/global.css` | 画面・レスポンシブデザイン |
| `docs/implementation.md` | 動きの仕組みと今後の拡張位置 |
| `docs/verification.md` | 今回確認したことと確認範囲 |
| `dist/`, `dist-about/` | すぐ配置できるビルド済みファイル |

依存バージョンは `package-lock.json` で固定しています。`node_modules/` はZIPに含めていません。

## 参照した公式資料

- [Astroの導入](https://docs.astro.build/ja/install-and-setup/)
- [Astroのbase設定](https://docs.astro.build/en/reference/configuration-reference/#base)
- [GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)
- [GSAP matchMedia](https://gsap.com/docs/v3/GSAP/gsap.matchMedia/)

GSAPなどの外部ライブラリの利用条件は、各パッケージに含まれるライセンスを参照してください。
