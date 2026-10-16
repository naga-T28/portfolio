/** このファイルだけで表示文言と打鍵の速さを変更できます。welcome / body が日本語版、en が英語版です。 */
export const typewriterConfig = Object.freeze({
  welcome: 'Welcome to naga-t.jp',
  /*
   * welcome の下に1文字ずつ打たれる文章。日本語・英数字どちらも使えます。
   *   # 見出し   … 中央揃えの太字（Tabキーで中央へ送ってから打ちます）
   *   ## 見出し  … 左揃えの太字
   *   ---        … 区切り線（ハイフンを1行ぶん連打）
   *   空行        … 1行あける
   *   ・項目 / - 項目 … 箇条書き（折り返した行は項目の文頭にそろえます）
   *   [文字](URL) … リンク（紙の上では赤インクで打たれ、クリックできます。外部URLは新しいタブで開きます）
   *   ラベル | URL … リンク行（ラベルを左に太字、URLを右寄せ。URLは最後の / より後ろだけを表示します）
   *                  表示を変えたいときは ラベル | [表示する文字](URL)。--- で挟むと名刺のような一覧になります
   * それ以外の行は段落として、紙の幅で自動的に折り返します（禁則処理あり）。
   * 段落の頭に全角スペース「　」を入れると字下げになります。
   */
  body: `
# はじめまして!NAGA-Tです!
---

## このサイトについて

このサイトは、僕がつくったものや活動をまとめたポートフォリオです。
遊び心のあるデザインにしてみたくて、スクロールに合わせて文字が印字されるタイプライターを取り入れてみました。

---

## ABOUT ME

現在は大学院の修士1年生で、AIや自然言語処理について研究しながら、Webサイトやアプリの個人開発にも取り組んでいます。
新しい技術を試したり、アイデアを形にしたりすることが好きで、便利さと遊び心のあるものづくりを楽しんでいます！

---

## 趣味

海外旅行や遺跡巡りが好きで、毎年の長期休みにはアジアを中心にいろいろな国を訪れています。
特に、古代遺跡や歴史を感じられる場所、自然豊かな景色が好きです。
ほかにも、ダイビングやLEGOなど、いろいろなことに興味があります。
旅行先での出来事や訪れた場所については、[nagaTブログ](https://naga-t.blog) にもまとめているので、よかったら覗いてみてください！

---

## LINKS
---
旅行ブログ | https://naga-t.blog
---
X(旧Twitter) | https://x.com/nagaT_28
---
Instagram | https://instagram.com/nagat_28/
---
Youtube | https://www.youtube.com/@nagat-28
---
GitHub | https://github.com/naga-T28
---

最後までご覧いただき、ありがとうございます。
`,
  // English version: same markup as body. Shown via the header's EN button, ?lang=en, or a non-Japanese browser.
  en: {
    welcome: 'Welcome to naga-t.jp',
    body: `
# Hi! I'm NAGA-T!
---

## ABOUT THIS SITE

This site is a portfolio of the things I've made and the things I do.
I wanted a playful design, so I built a typewriter that prints the text as you scroll.

---

## ABOUT ME

I'm a first-year master's student researching AI and natural language processing, and I also build websites and apps as personal projects.
I love trying out new technologies and turning ideas into real things, and I enjoy making things that are both useful and playful!

---

## HOBBIES

I love traveling abroad and exploring ancient ruins, and every long vacation I visit different countries, mostly in Asia.
I especially love ancient sites, places where you can feel the history, and beautiful natural scenery.
I'm also into lots of other things, like scuba diving and LEGO.
I write about my trips and the places I've visited on [my travel blog](https://naga-t.blog), so feel free to take a look!

---

## LINKS
---
Travel blog | https://naga-t.blog
---
X (Twitter) | https://x.com/nagaT_28
---
Instagram | https://instagram.com/nagat_28/
---
YouTube | https://www.youtube.com/@nagat-28
---
GitHub | https://github.com/naga-T28
---

Thank you for reading all the way to the end!
`,
  },
  // 1打鍵あたりのスクロール距離 [px]。改行は約3.2打鍵分、スペースは0.75打鍵分です。
  scrollPerStroke: 16,
  // 「自動」ボタンで再生するときの速さ [打鍵/秒]。
  autoStrokesPerSecond: 9,
  // スクロールに追いつくまでの秒数。0 で完全に直結します。
  scrub: 0.18,
  // SVG座標でのプラテンの半径。紙送り / 半径 = 回転角 [rad]。
  platenRadius: 31,
});
