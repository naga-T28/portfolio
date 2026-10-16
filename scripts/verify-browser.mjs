/** Browser integration checks; run against `npm run dev`. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [], results = [];
page.on('pageerror', e => errors.push(e.message));
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4321';
const output = new URL('../docs/screenshots/', import.meta.url);
await mkdir(output, { recursive: true });
const close = (a,b,epsilon=.08) => assert.ok(Math.abs(a-b)<epsilon, `${a} != ${b}`);
async function load() {
  await page.goto(base);
  await page.waitForSelector('[data-motion="animated"][data-progress]');
  await page.waitForTimeout(200);
}
async function scriptInfo() {
  return page.evaluate(async () => {
    const { buildScript, sceneGeometry } = await import('/src/scripts/motion.js');
    const story = document.querySelector('[data-typewriter-story]');
    const stage = story.querySelector('[data-typewriter-stage]');
    const machine = story.querySelector('[data-typewriter-machine]');
    const config = JSON.parse(story.dataset.settings);
    const script = buildScript(config, sceneGeometry({ width:stage.clientWidth, svgWidth:machine.clientWidth }));
    return { script, distance:Math.round(script.total * config.scrollPerStroke) };
  });
}
async function seek(p, distance) {
  await page.evaluate(y => window.scrollTo(0, y), Math.round(p * distance));
  await page.waitForTimeout(350);
}
async function pose() {
  return page.evaluate(() => {
    const root = document.querySelector('[data-typewriter-story]');
    const space = root.querySelector('[data-machine-space]').getBoundingClientRect();
    const sheet = root.querySelector('[data-paper-feed]');
    const transform = id => root.querySelector(`#${id}`).getAttribute('transform');
    const glyphs = [...root.querySelectorAll('.printed-glyph')].filter(el=>el.style.visibility==='visible');
    const rect = el => { const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
    const head = root.querySelector('#print-head').transform.baseVal.consolidate().matrix.e;
    return { typed:Number(root.dataset.typed), line:Number(root.dataset.line), progress:Number(root.dataset.progress),
      paper:rect(sheet), paperTransform:sheet.style.transform, head,
      headScreen:space.x + head * space.width / 1600, baseline:space.y + 686 * space.width / 1600,
      first:glyphs[0] ? rect(glyphs[0]):null, last:glyphs.length ? rect(glyphs.at(-1)):null,
      knob:transform('platen-knob-left-rotor'), bar:transform('typebar-action'),
      overflow:document.documentElement.scrollWidth > innerWidth,
      fontSize:parseFloat(getComputedStyle(root.querySelector('[data-paper-print]')).fontSize), visible:glyphs.length, pageHeight:document.documentElement.scrollHeight,
      keys:[...root.querySelectorAll('[id^="key-"],#spacebar')].map(el=>el.getAttribute('transform')) };
  });
}
async function scrolling() {
  // While animated the stage must actually stay at the top of the screen in the middle of the scroll.
  return page.evaluate(async () => {
    const stage = document.querySelector('[data-typewriter-stage]'), spacer = document.querySelector('.scroll-spacer');
    if (!(spacer?.offsetHeight > 0)) return false;
    const y = scrollY;
    window.scrollTo(0, stage.parentElement.offsetTop + spacer.offsetHeight / 2);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const top = stage.getBoundingClientRect().top;
    window.scrollTo(0, y);
    return Math.abs(top) < 1;
  });
}
try {
  await load();
  let {script,distance}=await scriptInfo();
  const initial=await pose();
  assert.equal(initial.typed,0);
  await page.screenshot({path:new URL('desktop-initial.png',output).pathname});
  const keys=script.events.filter(e=>e.type==='key' && e.duration===1);
  // Probe mixed English/Japanese and later lines at the contact phase.
  for (const index of [0,6,12,20,45,80,120]) {
    const e=keys[index];
    if (!e) continue;
    await seek((e.start+e.duration*.4)/script.total,distance);
    const p=await pose();
    assert.equal(p.typed,e.typed0+1);
    close(p.headScreen,p.last.x+p.last.width/2);
    close(p.baseline,p.last.y+p.last.height);
    close(p.paper.x,initial.paper.x);
  }
  results.push('7 contact samples: moving head / glyph centre and baseline agree within 0.08 CSS px');
  const ret=script.events.find(e=>e.type==='return');
  await seek((ret.start+.01)/script.total,distance);
  const before=await pose();
  await seek((ret.start+ret.duration-.01)/script.total,distance);
  const after=await pose();
  close(after.first.y-before.first.y,after.paper.y-before.paper.y);
  assert.notEqual(after.knob,before.knob);
  results.push('Paper and existing text share exactly the same feed; knob rotates');
  const samples=[.13,.24,.51,.78,1];
  const poses=[];
  for (const p of samples) { await seek(p,distance); poses.push(await pose()); }
  for (let i=samples.length-1;i>=0;i--) {
    await seek(samples[i],distance);
    assert.deepEqual(await pose(),poses[i]);
  }
  await seek((ret.start+ret.duration*.7)/script.total,distance);
  const mid=await pose();
  await seek(.8,distance);
  await seek((ret.start+ret.duration*.7)/script.total,distance);
  assert.deepEqual(await pose(),mid);
  results.push('Forward/reverse seeks and half-return stops reproduce text, keys, head, paper and rotation');
  await seek(.24,distance);
  await page.screenshot({path:new URL('desktop-typing.png',output).pathname});
  await seek(0,distance);
  assert.equal((await pose()).typed,0);
  results.push('Scrolling back to the top returns to the initial state');
  for (const [width,height] of [[320,740],[375,812],[390,844],[414,896],[768,1024],[844,390],[1280,720]]) {
    await page.setViewportSize({width,height});
    await page.waitForTimeout(350);
    ({script,distance}=await scriptInfo());
    await seek(0,distance);
    const a=await pose();
    assert.equal(a.overflow,false);
    assert.equal(a.fontSize, script.bodySize, 'Refresh must use the new viewport, not the pinned element’s old width');
    close(a.fontSize * a.paper.width / 780, 14, .1); // 14px body on screen
    const e=script.events.find(e=>e.type==='key');
    await seek((e.start+.4)/script.total,distance);
    const b=await pose();
    close(b.paper.x,a.paper.x);
    close(b.headScreen,b.last.x+b.last.width/2);
    close(b.baseline,b.last.y+b.last.height);
    await seek(.44,distance);
    assert.equal((await pose()).overflow,false);
    if ([320,390,768,844].includes(width)) await page.screenshot({path:new URL(`viewport-${width}.png`,output).pathname});
    results.push(`${width} × ${height}: no horizontal overflow; registration valid after responsive reflow`);
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForTimeout(250);
  assert.equal(await page.locator('[data-typewriter-story]').getAttribute('data-motion'),'static');
  assert.equal(await scrolling(),false);
  assert.ok(await page.locator('[data-letter-transcript]:not([hidden])').isVisible());
  assert.equal(await page.locator('.letter-transcript:not([hidden])').evaluate(el=>getComputedStyle(el).clipPath),'none');
  await page.screenshot({path:new URL('reduced-motion.png',output).pathname,fullPage:true});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.waitForTimeout(400);
  assert.equal(await scrolling(),true);
  const effects=page.locator('[data-motion-toggle]');
  await effects.click();
  assert.equal(await scrolling(),false);
  assert.equal(await page.locator('[data-typewriter-story]').getAttribute('data-motion'),'static');
  assert.equal(await effects.getAttribute('aria-pressed'),'false');
  assert.ok(await page.locator('[data-letter-transcript]:not([hidden])').isVisible());
  await effects.click();
  await page.waitForTimeout(400);
  assert.equal(await scrolling(),true);
  assert.equal(await page.locator('[data-typewriter-story]').getAttribute('data-motion'),'animated');
  assert.equal(await effects.getAttribute('aria-pressed'),'true');
  await seek(.3,distance);
  assert.ok((await pose()).typed>0,'Typing works again after effects are switched back on');
  results.push('Live reduced-motion switch releases the sticky stage and its scroll distance; switching back restores them; effects OFF shows the plain letter and ON restores the typewriter');
  const noJS=await browser.newPage({javaScriptEnabled:false});
  await noJS.goto(base);
  assert.ok(await noJS.locator('.letter-transcript:not([hidden])').isVisible());
  assert.equal(await noJS.locator('.typewriter-machine').isVisible(),false);
  await noJS.close();
  results.push('JavaScript disabled: complete readable article without a scroll trap');
  assert.deepEqual(errors,[]);
  results.push('No browser runtime errors');
  console.log(results.join('\n'));
  await writeFile(new URL('../docs/browser-results.json',import.meta.url),JSON.stringify({browser:await browser.version(),results},null,2)+'\n');
} finally { await browser.close(); }
