import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PAPER, PRINT, STRIKE, buildScript, cellsOf, cuesBetween, frameAt, linkSegments, keysFor, layoutRows, parseBlocks, sceneGeometry, soundCues, welcomeLines, widthOf, wrapText,
} from '../src/scripts/motion.js';
import { typewriterConfig as config } from '../src/config/typewriter.js';

const manifest = JSON.parse(readFileSync(new URL('../src/assets/typewriter/manifest.json', import.meta.url), 'utf8'));
const assets = manifest.map(({ file }) => readFileSync(new URL(`../src/assets/typewriter/${file}`, import.meta.url), 'utf8'));
const svg = assets.join('');
const screens = [
  [1440, 900], [1280, 720], [390, 844], [320, 960], [844, 390], [568, 320],
];
const sample = (script, n = 2000) => Array.from({ length: n + 1 }, (_, i) => frameAt(i / n, script, config.platenRadius));

for (const [width, height] of screens) {
  test(`Sheet layout stays on the paper and above the platen: ${width} × ${height}`, () => {
    const svgWidth = width < 600 ? width * 0.85 * 1600 / 780 : Math.min(1250, width * 1.2, height * 1.18);
    const geometry = sceneGeometry({ width, svgWidth });
    const script = buildScript(config, geometry);
    assert.ok(Math.abs(geometry.bodySize * geometry.scale - 14) < .1, 'Body text is 14px on screen');
    assert.ok(script.paperTop < script.titleY - geometry.titleSize, 'Welcome should be on the sheet');
    assert.ok(script.titleY + (script.titles.length - 1) * geometry.titleLeading < PRINT.y, 'Welcome should start above the paper bail');
    assert.ok(script.lines.every(line => widthOf(line) <= geometry.maxChars + 2), 'Only kinsoku punctuation may hang');
    for (const { x, width } of script.chars) {
      assert.ok(x >= PAPER.left + 20 && x + width <= PAPER.right - 20, 'Every glyph lands inside the printable area');
    }
    const end = frameAt(1, script, config.platenRadius);
    assert.ok(script.paperBottom + end.paperY > 703, 'Full feed must not expose a hole at the platen');
  });
}

test('Each glyph appears at the moving head; paper never moves sideways', () => {
  const script = buildScript(config, sceneGeometry({ width: 1440, svgWidth: 1040 }));
  const strikes = script.events.filter(e => e.type === 'key');
  assert.equal(strikes.length, script.chars.length, 'Every character is typed exactly once');
  strikes.forEach((event, i) => {
    const before = frameAt((event.start + event.duration * 0.3) / script.total, script);
    const after = frameAt((event.start + event.duration * (STRIKE + 0.04)) / script.total, script);
    assert.equal(before.typed, i);
    assert.equal(after.typed, i + 1);
    // Glyph centre equals the moving slug; paper feed brings the cell to the fixed print line.
    const glyph = script.chars[i];
    assert.ok(Math.abs(glyph.x + glyph.width / 2 - after.strikeX) < 1e-6);
    assert.ok(Math.abs(glyph.y + after.paperY - PRINT.y) < 1e-6);
    assert.equal(after.paperX, 0);
    assert.equal(after.headX, glyph.x);
  });
});

test('Typing, feeding and rewinding are monotonic and reversible', () => {
  const script = buildScript(config, sceneGeometry({ width: 1440, svgWidth: 1040 }));
  const frames = sample(script);
  for (let i = 1; i < frames.length; i++) {
    assert.ok(frames[i].typed >= frames[i - 1].typed);
    assert.ok(frames[i].paperY <= frames[i - 1].paperY + 1e-9);
  }
  const start = frameAt(0, script);
  assert.deepEqual([start.typed, start.paperY, start.headX, start.leverDegrees], [0, -0, script.marginX, 0]);
  assert.equal(start.typebarScale, 0.12);
  const end = frameAt(1, script);
  assert.equal(end.typed, script.chars.length);
  assert.ok(Math.abs(end.headX - script.marginX) < 1e-9, 'The last return brings the carriage home');
  assert.ok(Math.abs(end.knobDegrees * Math.PI / 180 * 31 - end.paperY) < 1e-8, 'No slip between paper and platen');
  assert.deepEqual(frameAt(-1, script), frameAt(0, script));
  assert.deepEqual(frameAt(2, script), frameAt(1, script));
  for (const frame of frames) {
    assert.ok(frame.headX >= script.marginX - 1e-9 && frame.headX <= PAPER.right - 20);
    assert.ok(frame.typebarScale >= 0.12 - 1e-9 && frame.typebarScale <= 1 + 1e-9);
  }
});

test('Every character presses keys that exist on this machine', () => {
  for (const char of config.body.replace(/\n/g, '') + '@!？　') {
    for (const id of keysFor(char)) assert.ok(svg.includes(`id="${id}"`), `${char} → ${id}`);
  }
  assert.deepEqual(keysFor('H'), ['key-shift-left', 'key-h']);
  assert.deepEqual(keysFor('T'), ['key-shift-right', 'key-t']);
  assert.deepEqual(keysFor('あ'), keysFor('あ'), 'Stand-in keys are stable');
  assert.deepEqual(keysFor('　'), ['spacebar']);
});

test('Japanese advances a solid 1 em per character and follows kinsoku', () => {
  const geometry = sceneGeometry({ width: 1440, svgWidth: 1040 });
  assert.ok(Math.abs(cellsOf('あ') * geometry.advance - geometry.bodySize) < 1e-9, 'Full-width pitch is exactly 1 em');
  assert.equal(cellsOf('、'), cellsOf('あ'));
  assert.equal(cellsOf('A'), 1);
  assert.ok(Math.abs(widthOf('NAGA-Tです') - (6 + 10 / 3)) < 1e-9);
  const lines = wrapText('あいうえおかきくけ、こさしすせそ。「たちつてと」', 10);
  assert.equal(lines.join(''), 'あいうえおかきくけ、こさしすせそ。「たちつてと」');
  for (const line of lines) {
    assert.ok(!/^[、。」）]/.test(line), `No line starts with closing punctuation: ${line}`);
    assert.ok(!/[「（]$/.test(line), `No line ends with opening bracket: ${line}`);
  }
  assert.deepEqual(wrapText('Webサイトを作る', 8), ['Webサイト', 'を作る']);
});

test('Headings, rules and blank lines are parsed and laid out like a typist would', () => {
  const blocks = parseBlocks('\n# 見出し\n\n本文です。\n---\n## 小見出し\n　字下げ\n');
  assert.deepEqual(blocks.map(b => b.type), ['heading', 'blank', 'paragraph', 'rule', 'heading', 'paragraph']);
  assert.equal(blocks[0].level, 1);
  assert.equal(blocks[4].level, 2);
  assert.equal(blocks[5].text, '　字下げ', 'A full-width space indent survives');
  const rows = layoutRows(blocks, 20);
  assert.equal(rows[0].indent, 7.5, 'Level-1 headings are centred with the tab');
  assert.ok(rows[0].bold && rows[4].bold && !rows[2].bold);
  assert.equal(rows[3].text, '_'.repeat(20));
  assert.equal(rows[4].indent, 0);

  const list = layoutRows(parseBlocks('・あいうえおかきくけこ'), 10);
  assert.deepEqual(list.map(r => r.text), ['・あいうえお', 'かきくけこ']);
  assert.equal(list[1].indent, cellsOf('・'), 'List items hang under their text');

  const script = buildScript({ welcome: 'w', body: '# 見出し\n---' }, sceneGeometry({ width: 1440, svgWidth: 1040 }));
  assert.ok(script.events.some(e => e.type === 'tab'), 'Centring uses the tab key');
  assert.equal(script.chars.filter(c => c.char === '_').length, sceneGeometry({ width: 1440, svgWidth: 1040 }).maxChars, 'A section rule is one straight line across the sheet');

  const table = buildScript({ welcome: 'w', body: 'a\n---\n## SNS\n---\nX | https://x.com/a\n\n---\nB | https://b.jp\n---\nend' }, sceneGeometry({ width: 1440, svgWidth: 1040 }));
  const rules = table.rows.filter(r => r.rule).map(r => r.rule);
  assert.deepEqual(rules, ['section', 'table', 'table', 'table'], 'Rules touching link rows (even across a blank line) become table rules');
  assert.ok(table.chars.filter(c => c.char === '-').every(c => c.rule === 'table'));
  assert.deepEqual(keysFor('_'), ['key-shift-left', 'key-minus'], 'Underscore is shift + minus');
});

test('Welcome wording is preserved; words wrap without being split', () => {
  assert.equal(config.welcome, 'Welcome to naga-t.jp');
  assert.deepEqual(welcomeLines(config.welcome, false), ['Welcome to naga-t.jp']);
  assert.deepEqual(welcomeLines(config.welcome, true), ['Welcome to', 'naga-t.jp']);
  assert.deepEqual(welcomeLines('first\nsecond', false), ['first', 'second']);
  const english = 'Every letter on this sheet is struck one key at a time.';
  assert.equal(wrapText(english, 22).join(' '), english);
  assert.deepEqual(wrapText('one\n\ntwo', 10), ['one', '', 'two']);
});

test('Transparent assets have independent parts, unique IDs and no baked-in paper', () => {
  assert.equal(assets.length, 14);
  assert.ok(!/<image|data:image|<foreignObject|<script/.test(svg));
  assert.ok(!/id="(?:paper-feed|paper-sheet|print-content|preprinted-content)"/.test(svg));
  const ids = [...svg.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  assert.equal(ids.length, new Set(ids).size, 'Paint servers and groups must not collide between parts');
  for (const id of ['print-head', 'head-carriage', 'carriage-rail', 'feed-roller', 'paper-support',
    'typebar-action', 'platen-knob-left-rotor', 'platen-knob-right-rotor', 'ribbon-spool-left-rotor', 'ribbon-spool-right-rotor', 'foreground-mask', 'paper-front-frame', 'keys', 'spacebar']) assert.ok(ids.includes(id), id);
  for (const asset of assets) {
    const localIds = new Set([...asset.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
    for (const [, id] of asset.matchAll(/url\(#([^)]+)\)/g)) assert.ok(localIds.has(id), `Standalone paint reference: ${id}`);
  }
});

test('Returns feed exactly one line, keys move only the head to the right', () => {
  const script = buildScript(config, sceneGeometry({ width: 1440, svgWidth: 1200 }));
  for (const event of script.events) {
    const a = frameAt(event.start / script.total, script);
    const b = frameAt((event.start + event.duration - 1e-8) / script.total, script);
    if (event.type === 'return') {
      assert.ok(Math.abs(b.paperY - a.paperY + script.lineHeight) < 1e-6);
      assert.ok(Math.abs(b.headX - script.marginX) < 1e-6);
    } else {
      assert.equal(a.paperY, b.paperY, 'No paper feed during a stroke or tab');
      assert.ok(b.headX >= a.headX - 1e-6);
    }
  }
});

test('Arbitrary seeks and direction changes reproduce every part, including a half return', () => {
  const script = buildScript(config, sceneGeometry({ width: 390, svgWidth: 499 }));
  const points = [0, .42, .04, .999, .51, 1, .23, .42, 0];
  const expected = points.map(p => frameAt(p, script));
  for (let i = points.length - 1; i >= 0; i--) assert.deepEqual(frameAt(points[i], script), expected[i]);
  for (const e of script.events.filter(e => e.type === 'return')) {
    const at = (e.start + e.duration * .7) / script.total;
    const a = frameAt(at, script);
    frameAt(1, script);
    assert.deepEqual(frameAt(at, script), a);
  }
});

test('Long words, blank input and invalid progress remain bounded and finite', () => {
  const g = sceneGeometry({ width: 390, svgWidth: 500 });
  const lines = wrapText('https://naga-t.jp/a-very-long-path-without-spaces', 20);
  assert.ok(lines.every(line => widthOf(line) <= 20));
  for (const body of ['', '\n', 'A', '# title\n\n日本語']) {
    const script = buildScript({ welcome: config.welcome, body }, g);
    for (const p of [NaN, -1, 0, .5, 1, 2]) {
      const f = frameAt(p, script);
      assert.ok(Number.isFinite(f.headX) && Number.isFinite(f.paperY));
    }
  }
  assert.throws(() => frameAt(0, buildScript(config, g), 0), RangeError);
});

test('Sound cues follow the stroke timeline and stay silent when rewinding', () => {
  const geometry = sceneGeometry({ width: 1440, svgWidth: 1040 });
  const script = buildScript(config, geometry);
  const cues = soundCues(script, geometry.maxChars);
  assert.equal(cues.filter(c => c.type === 'strike').length, script.chars.length, 'One strike per printed glyph');
  assert.equal(cues.filter(c => c.type === 'feed').length, script.rows.length, 'One ratchet per line feed');
  const strikes = cues.filter(c => c.type === 'strike').map(c => c.at / script.total);
  for (const p of strikes.slice(0, 20)) {
    assert.ok(frameAt(p, script).typed > frameAt(p - 1e-6, script).typed, 'Strike sound coincides with the glyph appearing');
  }
  // Typing (not a tab jump) carries the carriage across the bell point, once on each such line.
  const bellX = script.marginX + (geometry.maxChars - 6) * script.advance;
  const crossing = new Set(script.chars.filter(c => c.x < bellX && c.x + c.width >= bellX).map(c => c.y));
  assert.ok(crossing.size > 0);
  assert.equal(cues.filter(c => c.type === 'bell').length, crossing.size, 'The margin bell rings once on each line that reaches it');
  assert.deepEqual(cuesBetween(cues, script.total, .5, .4), []);
  assert.equal(cuesBetween(cues, script.total, 0, 1).length, cues.length);
});

test('Links are typed as plain text and every glyph keeps its URL, even across a wrap', () => {
  const body = '詳しくは[こちらのとても長いリンクの文章が折り返します](https://example.com/a)をご覧ください。\n- [GitHub](https://github.com/naga-T28) です\n[x](javascript:alert(1))';
  const script = buildScript({ welcome: 'w', body }, sceneGeometry({ width: 390, svgWidth: 500 }));
  const linked = script.chars.filter(c => c.href);
  assert.equal(linked.filter(c => c.href === 'https://example.com/a').map(c => c.char).join(''), 'こちらのとても長いリンクの文章が折り返します');
  assert.ok(new Set(linked.filter(c => c.href === 'https://example.com/a').map(c => c.y)).size > 1, 'The link wraps onto a second row');
  assert.equal(linked.filter(c => c.href.includes('github')).map(c => c.char).join(''), 'GitHub');
  assert.ok(!script.lines.join('').includes('](https'), 'Link markup is never typed');
  assert.ok(script.lines.join('').includes('[x](javascript:'), 'Script URLs stay inert text');
  assert.ok(!linked.some(c => c.href.startsWith('javascript:')));
  const [block] = parseBlocks('a[b](/c)d');
  assert.deepEqual(linkSegments(block), [{ text: 'a' }, { text: 'b', href: '/c' }, { text: 'd' }]);
});

test('Link rows: bold label left, link right-aligned by a tab; the value drops a row when narrow', () => {
  const body = 'GitHub | https://github.com/naga-T28/\nX | [@nagaT_28](https://x.com/nagaT_28)';
  for (const width of [1440, 390]) {
    const geometry = sceneGeometry({ width, svgWidth: width < 600 ? 800 : 1040 });
    const script = buildScript({ welcome: 'w', body }, geometry);
    const right = script.marginX + geometry.maxChars * geometry.advance;
    const value = script.chars.filter(c => c.href === 'https://github.com/naga-T28/');
    assert.equal(value.map(c => c.char).join(''), 'naga-T28', 'Only the last path segment is typed');
    assert.ok(Math.abs(value.at(-1).x + value.at(-1).width - right) < 1e-6, 'Value ends on the right margin');
    assert.ok(script.chars.filter(c => !c.href).every(c => c.bold), 'Labels are bold');
    assert.equal(script.chars.filter(c => c.href?.includes('x.com')).map(c => c.char).join(''), '@nagaT_28');
    assert.equal(value[0].y > script.chars[0].y, widthOf('GitHub naga-T28') > geometry.maxChars, 'Drops a row only when narrow');
  }
  const shown = url => linkSegments(parseBlocks(`L | ${url}`)[0]).map(s => s.text).join('');
  assert.equal(shown('https://x.com/a'), 'a');
  assert.equal(shown('https://instagram.com/nagat_28/'), 'nagat_28');
  assert.equal(shown('https://www.youtube.com/@nagat-28'), '@nagat-28');
  assert.equal(shown('https://naga-t.blog'), 'naga-t.blog', 'A bare domain is shown as is');
  assert.equal(linkSegments(parseBlocks('L | https://x.com/a')[0])[0].href, 'https://x.com/a', 'The link keeps the full URL');
});

test('The English letter lays out on the sheet with the same rules', () => {
  for (const [width, height] of screens) {
    const svgWidth = width < 600 ? width * 0.85 * 1600 / 780 : Math.min(1250, width * 1.2, height * 1.18);
    const geometry = sceneGeometry({ width, svgWidth });
    const script = buildScript(config.en, geometry);
    assert.ok(script.lines.every(line => widthOf(line) <= geometry.maxChars + 2));
    for (const { x, width: w } of script.chars) assert.ok(x >= PAPER.left + 20 && x + w <= PAPER.right - 20);
    assert.ok(script.chars.some(c => c.href === 'https://naga-t.blog'));
  }
  // Same links in both languages, so neither version drifts.
  const hrefs = body => parseBlocks(body).flatMap(b => b.links ?? []).map(l => l.href).sort();
  assert.deepEqual(hrefs(config.en.body), hrefs(config.body));
});
