/** Rebuild editable transparent SVG parts. No raster images or external resources. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root = new URL('../src/assets/', import.meta.url);
const source = await readFile(new URL('./typewriter-detail-source.svg', import.meta.url), 'utf8');
const out = new URL('typewriter/', root);
await mkdir(out, { recursive: true });
function group(id) {
  const start = source.lastIndexOf('<g', source.indexOf(`id="${id}"`));
  if (start < 0) throw new Error(`Missing source group ${id}`);
  const tags = /<g\b[^>]*>|<\/g>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let match; (match = tags.exec(source));) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (!depth) return source.slice(start, tags.lastIndex);
  }
  throw new Error(`Unclosed group ${id}`);
}
const originalDefs = source.match(/<defs>([\s\S]*?)<\/defs>/)[1];
const extraDefs = `
<linearGradient id="tw-brass" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#514329"/><stop offset=".16" stop-color="#c9b47e"/><stop offset=".29" stop-color="#eee2b9"/><stop offset=".46" stop-color="#8b7444"/><stop offset=".7" stop-color="#3b3020"/><stop offset=".9" stop-color="#ae965c"/><stop offset="1" stop-color="#55452a"/></linearGradient>
<linearGradient id="tw-iron" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#727574"/><stop offset=".12" stop-color="#2f3434"/><stop offset=".5" stop-color="#111819"/><stop offset=".88" stop-color="#080d0d"/><stop offset="1" stop-color="#515654"/></linearGradient>
<linearGradient id="tw-contact-shade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#161910" stop-opacity="0"/><stop offset=".7" stop-color="#161910" stop-opacity=".08"/><stop offset="1" stop-color="#161910" stop-opacity=".46"/></linearGradient>
<clipPath id="tw-cylinder-clip"><rect x="343" y="674" width="914" height="62" rx="25"/></clipPath>`;
const defs = new Map([...`${originalDefs}${extraDefs}`.matchAll(/<(linearGradient|radialGradient|filter|clipPath|pattern)\b[^>]*\bid="([^"]+)"[\s\S]*?<\/\1>/g)].map(m => [m[2], m[0]]));
const screw = (x,y) => `<g transform="translate(${x} ${y})"><circle r="6" fill="url(#tw-brass)" stroke="#24251d"/><path d="M-3.5 2 3.5-2" stroke="#24251d" stroke-width="1.4"/></g>`;
const parts = [
['01-body-frame','固定本体・黒い鋳鉄フレーム', group('body-rear') + group('body-shell')],
['02-paper-support','固定の紙背面支持板', `<g id="paper-support">${group('carriage-rear')}<path d="M402 650V490q0-18 18-18h760q18 0 18 18v160" fill="url(#tw-iron)" stroke="#555b56" stroke-width="2"/><path d="M419 481h759" stroke="#a0a294" opacity=".4"/></g>`],
['03-feed-roller','固定軸の紙送りローラー・回転する表面', `<g id="feed-roller" data-radius="31" data-axis="800 705"><rect x="340" y="673" width="920" height="64" rx="27" fill="url(#tw-rubber)" stroke="#080a09" stroke-width="3"/><g id="roller-surface" clip-path="url(#tw-cylinder-clip)">${Array.from({length:12}, (_,i)=>`<path data-roller-rib="${i}" d="M344 ${675+i*5}H1256" stroke="#92978b" stroke-width="1.2" opacity=".22"/>`).join('')}</g><path d="M366 684H1235" stroke="#d9decc" opacity=".17"/><rect x="336" y="682" width="18" height="45" rx="4" fill="url(#tw-brass)"/><rect x="1246" y="682" width="18" height="45" rx="4" fill="url(#tw-brass)"/></g>`],
['04-roller-knobs','左右の固定軸と回転ノブ', `<g id="roller-knobs">${group('platen-knob-left')}${group('platen-knob-right')}${group('carriage-return')}</g>`],
['05-print-head','左右に動く印字ヘッド・基準点は文字セル中央', `<g id="print-head" data-motion="translateX" data-print-baseline="686" transform="translate(476 0)"><path d="M-42 748-31 706h13v10h-7l-6 26h62l-6-26h-7v-10h13l11 42Z" fill="url(#tw-chrome)" stroke="#323a34" stroke-width="2"/><path d="M-21 731v-44h8v41h26v-41h8v44Z" fill="url(#tw-brass)" stroke="#615438"/><path d="M-12 700v-15m24 15v-15" stroke="#d1c8a9" stroke-width="2"/><path d="m-5 701 5-8 5 8" fill="#a0844a"/>${screw(-32,746)}${screw(32,746)}</g>`],
['06-carriage-rail','固定レールと横移動する印字台車', `<g id="carriage-rail"><rect x="326" y="746" width="948" height="32" rx="8" fill="url(#tw-iron)" stroke="#050909" stroke-width="2"/><rect x="333" y="739" width="934" height="12" rx="5" fill="url(#tw-chrome)"/><path d="M349 769H1251" stroke="#ad955d" stroke-width="2"/>${Array.from({length:91},(_,i)=>`<path d="M${350+i*10} 756v${i%5===0?9:4}" stroke="#bbb7a0" stroke-width="1" opacity=".7"/>`).join('')}${screw(336,764)}${screw(1264,764)}</g><g id="head-carriage" data-motion="translateX" transform="translate(476 0)"><rect x="-49" y="743" width="98" height="39" rx="7" fill="url(#tw-iron)" stroke="#090c0c" stroke-width="2"/><rect x="-45" y="747" width="90" height="8" rx="3" fill="url(#tw-brass)"/><path d="M-40 778H40" stroke="#8d958e"/><circle cx="-31" cy="765" r="5" fill="url(#tw-chrome)"/><circle cx="31" cy="765" r="5" fill="url(#tw-chrome)"/></g>`],
['07-typebar-mechanism','タイプバーと打鍵機構', `<g id="typebar-mechanism">${group('typebar-basket')}<g id="typebar-carriage" transform="translate(476 0)" data-motion="translateX"><g id="typebar-action" data-pivot="0 797" transform="translate(0 797) scale(1 .12) translate(0 -797)"><path d="M-5 800-4 686h8l1 114Z" fill="url(#tw-chrome-x)" stroke="#222a25"/><rect x="-10" y="666" width="20" height="21" rx="2" fill="url(#tw-chrome)" stroke="#32342c"/><path d="M-7 671H7" stroke="#24291e" stroke-width="3"/><path d="M-1 788V690" stroke="#dbd7b9"/></g></g></g>`],
['08-keyboard-bed','キーボード台と連結軸', `<g id="keyboard-bed">${group('keyboard-linkage')}</g>`],
['09-keycaps','独立して押下できるキー群とスペースバー', group('keys') + group('spacebar')],
['10-front-decoration','前面装飾・真鍮のトリム', `<g id="front-decoration">${group('body-front-cowl')}${group('body-front-trim')}<path d="M243 1238Q800 1291 1357 1238" fill="none" stroke="url(#tw-brass)" stroke-width="3"/><path d="M675 926Q800 911 925 926" fill="none" stroke="url(#tw-brass)" stroke-width="1.4" opacity=".65"/></g>`],
['11-shadows','背景透過の接地影', group('ground-shadow')],
['12-foreground-mask','紙の出口の前景遮蔽と紙上の接触影', `<g id="foreground-mask"><path d="M402 661H1198V706H402Z" fill="url(#tw-contact-shade)"/><path d="M354 706H1246l4 23H350Z" fill="url(#tw-iron)" stroke="#161b18"/><path d="M358 707H1242" stroke="#a8aba0" stroke-width="1.8"/></g>`],
['13-paper-front-frame','紙より手前の押さえフレーム', `<g id="paper-front-frame"><path d="M367 712V659q0-13 14-13h26m786 0h26q14 0 14 13v53" fill="none" stroke="url(#tw-chrome)" stroke-width="9"/><path d="M384 711H1216" stroke="url(#tw-chrome)" stroke-width="7"/>${[430,1170].map(x=>`<g><path d="M${x-7} 623v86h14v-86Z" fill="url(#tw-brass)" stroke="#463f2c"/><rect x="${x-12}" y="646" width="24" height="29" rx="9" fill="url(#tw-rubber)"/><path d="M${x-8} 651h16" stroke="#b4b9aa" opacity=".3"/>${screw(x,694)}</g>`).join('')}</g>`],
['14-ribbon-spools','リボンスプールと印字ヘッドに追従するリボン', `<!-- The ribbon is drawn first so it runs behind both spools. --><g id="ribbon"><path id="ribbon-span" d="M503 814 454 721H498L1097 814" fill="none" stroke="#121b18" stroke-width="12"/><path id="ribbon-edge" d="M503 809 454 716H498L1097 809" fill="none" stroke="#817560" stroke-width=".8" opacity=".5"/></g>${group('ribbon-spools')}`],
];
for (let [name,title,body] of parts) {
  // Remove editor-only metadata and make every standalone SVG's paint server IDs unique.
  body = body.replace(/\s+inkscape:[\w-]+="[^"]*"/g, '');
  const needed = new Set();
  function scan(text) {
    for (const m of text.matchAll(/url\(#([^)]+)\)/g)) {
      if (needed.has(m[1])) continue;
      needed.add(m[1]);
      if (!defs.has(m[1])) throw new Error(`Missing paint ${m[1]}`);
      scan(defs.get(m[1]));
    }
  }
  scan(body);
  let xml = [...needed].map(id=>defs.get(id)).join('\n') + '</defs>\n' + body;
  for (const id of needed) xml = xml.replaceAll(`id="${id}"`, `id="${name}-${id}"`).replaceAll(`url(#${id})`,`url(#${name}-${id})`);
  await writeFile(new URL(`${name}.svg`, out), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1400" width="1600" height="1400" aria-hidden="true" focusable="false" data-part="${name}">\n<title>${title}</title>\n<defs>${xml}\n</svg>\n`);
}
await writeFile(new URL('manifest.json', out), JSON.stringify(parts.map(([file,role])=>({file:`${file}.svg`,role})),null,2)+'\n');
console.log(`Generated ${parts.length} transparent vector parts.`);
