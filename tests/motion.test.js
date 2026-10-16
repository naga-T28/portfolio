import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PRINT, buildScript, cellsOf, frameAt, keysFor, layoutRows, parseBlocks, sceneGeometry, welcomeLines, widthOf, wrapText,
} from '../src/scripts/motion.js';
import { typewriterConfig as config } from '../src/config/typewriter.js';

const svg = readFileSync(new URL('../src/assets/typewriter.svg', import.meta.url), 'utf8');
const screens = [
  [1440, 900], [1280, 720], [390, 844], [320, 960], [844, 390], [568, 320],
];
const sample = (script, n = 2000) => Array.from({ length: n + 1 }, (_, i) => frameAt(i / n, script, config.platenRadius));

for (const [width, height] of screens) {
  test(`Sheet layout stays on the paper and above the platen: ${width} × ${height}`, () => {
    const svgWidth = Math.min(1040, width * 1.18, (height - 170) * 2.32);
    const geometry = sceneGeometry({ width, svgWidth });
    const script = buildScript(config, geometry);
    assert.ok(script.paperTop < script.titleY - geometry.titleSize, 'Welcome should be on the sheet');
    assert.ok(script.titleY + (script.titles.length - 1) * geometry.titleLeading < 640, 'Welcome should start above the paper bail');
    assert.ok(script.lines.every(line => widthOf(line) <= geometry.maxChars + 2), 'Only kinsoku punctuation may hang');
    for (const { x, width } of script.chars) {
      assert.ok(x >= 430 && x + width <= 1170, 'Every glyph lands inside the printable area');
    }
    const end = frameAt(1, script, config.platenRadius);
    assert.ok(script.paperBottom + end.paperY > 703, 'Full feed must not expose a hole at the platen');
  });
}

test('Each glyph is struck at the fixed print point', () => {
  const script = buildScript(config, sceneGeometry({ width: 1440, svgWidth: 1040 }));
  const strikes = script.events.filter(e => e.type === 'key');
  assert.equal(strikes.length, script.chars.length, 'Every character is typed exactly once');
  strikes.forEach((event, i) => {
    const before = frameAt((event.start + event.duration * 0.3) / script.total, script);
    const after = frameAt((event.start + event.duration * 0.4) / script.total, script);
    assert.equal(before.typed, i);
    assert.equal(after.typed, i + 1);
    // Paper coordinates + carriage/paper offsets = the body's print point.
    const glyph = script.chars[i];
    assert.ok(Math.abs(glyph.cellX + after.carriageX - PRINT.x) < 1e-6);
    assert.ok(Math.abs(glyph.y + after.paperY - PRINT.y) < 1e-6);
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
  assert.deepEqual([start.typed, start.paperY, start.carriageX, start.leverDegrees], [0, -0, 0, 0]);
  assert.equal(start.typebarScale, 0.12);
  const end = frameAt(1, script);
  assert.equal(end.typed, script.chars.length);
  assert.ok(Math.abs(end.carriageX - script.marginX) < 1e-9, 'The last return brings the carriage home');
  assert.ok(Math.abs(end.knobDegrees * Math.PI / 180 * 31 - end.paperY) < 1e-8, 'No slip between paper and platen');
  assert.deepEqual(frameAt(-1, script), frameAt(0, script));
  assert.deepEqual(frameAt(2, script), frameAt(1, script));
  for (const frame of frames) {
    assert.ok(frame.carriageX <= script.marginX + 1e-9 && frame.carriageX >= -script.marginX - script.advance);
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
  assert.equal(rows[3].text, '-'.repeat(20));
  assert.equal(rows[4].indent, 0);

  const list = layoutRows(parseBlocks('・あいうえおかきくけこ'), 10);
  assert.deepEqual(list.map(r => r.text), ['・あいうえお', 'かきくけこ']);
  assert.equal(list[1].indent, cellsOf('・'), 'List items hang under their text');

  const script = buildScript({ welcome: 'w', body: '# 見出し\n---' }, sceneGeometry({ width: 1440, svgWidth: 1040 }));
  assert.ok(script.events.some(e => e.type === 'tab'), 'Centring uses the tab key');
  assert.equal(script.chars.filter(c => c.char === '-').length, 36, 'A rule spans the full line');
});

test('Welcome wording is preserved; words wrap without being split', () => {
  assert.equal(config.welcome, 'welcome to naga-t.jp');
  assert.deepEqual(welcomeLines(config.welcome, false), ['welcome to naga-t.jp']);
  assert.deepEqual(welcomeLines(config.welcome, true), ['welcome to', 'naga-t.jp']);
  assert.deepEqual(welcomeLines('first\nsecond', false), ['first', 'second']);
  const english = 'Every letter on this sheet is struck one key at a time.';
  assert.equal(wrapText(english, 22).join(' '), english);
  assert.deepEqual(wrapText('one\n\ntwo', 10), ['one', '', 'two']);
});

test('The same moving paper group owns the sheet and printed text', () => {
  const feed = svg.indexOf('id="paper-feed"');
  const sheet = svg.indexOf('id="paper-sheet"');
  const print = svg.indexOf('id="print-content"');
  const text = svg.indexOf('id="preprinted-content"');
  const stationaryShade = svg.indexOf('id="paper-wrap-shading"');
  assert.ok(feed < sheet && sheet < print && print < text && text < stationaryShade);
  for (const id of ['carriage', 'carriage-return', 'typebar-action', 'spacebar', 'platen-knob-left-rotor',
    'platen-knob-right-rotor', 'ribbon-spool-left-rotor', 'ribbon-spool-right-rotor', 'paper-surface']) {
    assert.ok(svg.includes(`id="${id}"`), id);
  }
  assert.ok(svg.indexOf('id="carriage"') < feed, 'The sheet rides on the carriage');
  assert.ok(svg.includes('<!--WELCOME_CONTENT-->'));
  assert.ok(!svg.includes('<image '));
});
