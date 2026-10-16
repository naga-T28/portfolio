# 素材と実装

## 透明なベクター素材

使用素材は `src/assets/typewriter/` の14個のSVGです。すべて共通の `viewBox="0 0 1600 1400"` を持ち、背景画像・埋め込みラスタ・外部参照を含みません。塗り、反射、金属の凹凸、影はSVGパス、グラデーション、フィルターで構成しています。独立ファイルとして開けるよう、必要なpaint serverだけを各SVG内に同梱し、IDにファイル名を付けて衝突を避けています。

細密なキー・黒い外装・スプールは既存のベクター原稿を継承。ローラーの回転面、印字ヘッド、台車、レール、可動ハンマー、紙の遮蔽、前面の押さえを新たに作成し、真鍮の部品とトリムを加えています。写真ではなく、可動構造を編集できるベクターによる質感表現です。

| SVGファイル | 主なID | 動作・役割 |
| --- | --- | --- |
| `01-body-frame.svg` | `body-rear`, `body-shell` | 固定の黒いフレーム・筐体・脚 |
| `02-paper-support.svg` | `paper-support` | 紙より後ろの固定支持板 |
| `03-feed-roller.svg` | `feed-roller`, `roller-surface` | 固定軸の円筒。12本の表面線を円周上から投影して回転 |
| `04-roller-knobs.svg` | `platen-knob-left-rotor`, `platen-knob-right-rotor`, `carriage-return` | 左右ノブの回転、改行レバー |
| `05-print-head.svg` | `print-head` | 真鍮の印字ガイド。左右移動 |
| `06-carriage-rail.svg` | `carriage-rail`, `head-carriage` | レールは固定、印字台車のみ左右移動 |
| `07-typebar-mechanism.svg` | `typebar-carriage`, `typebar-action`, `typebar-basket` | ハンマーはヘッドに追従して紙を打つ。奥のリンク機構は固定 |
| `08-keyboard-bed.svg` | `keyboard-bed`, `keyboard-linkage` | 固定のキー支持・連結軸 |
| `09-keycaps.svg` | `keys`, `key-a` など, `spacebar` | 各キーが個別のグループ。押下はy移動 |
| `10-front-decoration.svg` | `front-decoration` | 固定の前面カバー・銘板・真鍮トリム |
| `11-shadows.svg` | `ground-shadow` | 背景透過の接地影。不要なら省略可能 |
| `12-foreground-mask.svg` | `foreground-mask` | 紙の出口を隠す金属部品と紙上の接触影 |
| `13-paper-front-frame.svg` | `paper-front-frame` | 紙より手前の支え・押さえローラー |
| `14-ribbon-spools.svg` | `ribbon-spool-*-rotor`, `ribbon-span`, `ribbon-edge` | スプール回転、移動するヘッドに追従するリボン |

パーツは `<img>` ではなくインラインSVGとして読み込むため、各IDへCSSやGSAPを適用できます。元の立体形状を崩さないよう、ノブ・スプールは楕円投影を保つ回転行列を使っています。円筒ローラーは平面内で本体を回すのではなく、表面線のy位置と可視面のopacityを回転角から算出します。

## 重なり順

背面から手前へ：

1. 接地影 → 固定本体 → 紙背面支持 → ローラー → ノブ。
2. **HTMLの `.paper-window` → `.paper-feed` → `.paper-welcome` / `.paper-print`**。
3. 出口の前景マスク → 紙前面フレーム → タイプバー → リボンとスプール → レール・台車 → 印字ガイド。
4. キーボード台 → 前面装飾 → 独立キー群。

用紙も本文もSVGには含めません。`.paper-feed` の子として文字を置き、その親にだけ `translateY` を適用します。出口のクリップ位置はy=706。紙の下側が機械内部に隠れ、上へ送られた部分だけが現れます。紙は印字前から全行分の長さを持ち、最終行でも出口に隙間ができません。

## 共有座標

すべてのSVGとHTML用紙を、1600×1400の `.machine-coordinate-space` に置きます。この親だけを画面幅に合わせてスケールします。

- 紙の左端 x=410、右端 x=1190。横移動は常に0。
- 印字ライン y=686。ローラー中心 y=705、半径31。
- 英字の送り幅 `advance = fontSize × 0.6`。全角は `fontSize`。
- 行送り `lineHeight = fontSize × 1.55`。
- 文字の紙上y座標 = `686 + 行番号 × lineHeight`。
- 紙の移動 = `−送り済み行数 × lineHeight`。
- したがって打鍵時は `文字のy + 紙の移動 = 686`。
- ヘッド／活字中心 = `現在のセル左端 + セル幅 / 2`。
- 文字のHTML配置 = `(セル左端 − 紙左端, 文字y − 紙上端 − fontSize)`。

紙の縁は `outline` で描き、ボーダー幅が内部座標に加算されるずれを避けています。インクは不透明度だけに小さな変化を付け、位置には乱数を加えません。

## スクロールからの状態計算

`buildScript()` が本文を行と打鍵イベントに変換します。各イベントは開始時刻・継続時間・開始時のx・送り行数・表示文字数を持ちます。`frameAt(progress, script)` は二分探索で現在イベントを選び、以下を返します。

- `typed`：表示する印字文字数（空白を除く）。
- `line`：完了した行送りの数。0始まり。
- `headX`：現在セルの左端。`strikeX`：活字とガイドの中心。
- `paperX = 0`、`paperY`：紙送り位置。
- ノブ角、ローラー角、スプール角、タイプバー伸長、キー押下量。

1打鍵の36%で活字が紙に当たり、文字を表示。48〜80%でヘッドを次のセルへ進めます。改行では5〜60%で左端へ戻し、52〜94%でローラーを回して紙を1行送ります。空行も1行分の紙送りです。最後の改行も1行だけ送ります。

GSAPは単一の `{ progress: 0…1 }` を `ease: 'none'` で進め、ScrollTriggerがscrubを担当し、画面の固定はCSSの `position: sticky`（高さ `100dvh`）で行います。iOSのツールバーが縮んでも下に余白が出ません。スクロール距離はステージ直後のスペーサー要素の高さです。タイマー、累積加算、方向別の処理はありません。途中停止・高速ジャンプ・逆向きのシークも、同じ進行度からすべての部品を復元します。表示・非表示の切替は変化した文字だけに適用します。

参考：[ScrollTrigger公式](https://gsap.com/docs/v3/Plugins/ScrollTrigger/) / [gsap.matchMedia公式](https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/)

## リサイズとアクセシビリティ

599px以下では文字を大きくして再組版します。ScrollTriggerのrefresh前に、外側sectionの幅とタイプライターの実際の幅から計算します。全パーツと紙は同じスケールを共有します。リサイズで折り返しが変わった場合は現在のスクロール位置に対して新しい組版を同期します。

`gsap.matchMedia()` でreduced-motionの途中変更に対応し、静止時にはstickyとスペーサーを解除します。全文はAstroが生成するHTML文書として常に存在します。「演出 OFF」で同じ静止文書に切り替え（「演出 ON」で再びstickyとスペーサーを作成）、JavaScript無効時も読めます。`astro:before-swap` でリスナーとGSAPコンテキストを解放し、重複mountを防ぎます。

## 素材の再編集

新しい機構のパスは `scripts/generate-typewriter.mjs`、継承した外装の細部は `scripts/typewriter-detail-source.svg` を編集し、`npm run assets` で再生成します。生成済みSVGを直接編集することもできますが、再生成時には上書きされます。
