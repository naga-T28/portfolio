/** Pure geometry and choreography, in the original SVG's 1600 × 1400 coordinate system. */
export const ART = Object.freeze({ width: 1600, height: 1400, platenY: 703 });
/** Sheet edges: `left`/`right` at the top, `footLeft`/`footRight` where it meets the platen. */
export const PAPER = Object.freeze({ left: 410, right: 1190, footLeft: 395, footRight: 1205 });
/** Where the type slug meets the platen (body coordinates). The typebar head lands at y≈680–698. */
export const PRINT = Object.freeze({ x: 800, y: 686 });
/** Fixed parts the choreography drives: pivots come from the SVG's data-pivot attributes. */
export const PARTS = Object.freeze({
  lever: { x: 340, y: 694, degrees: 16 },
  typebar: { x: 800, y: 867, rest: 0.12 },
  knobs: [[293, 702], [1307, 702]],
  spools: [[411, 802], [1189, 802]],
  keyDepth: 7,
  spaceDepth: 6,
});
/** Relative duration of each stroke; the scroll distance is proportional to their sum. */
export const DURATION = Object.freeze({ key: 1, space: 0.75, return: 3.2, tab: 1.6, repeat: 0.4 });

export const clamp01 = (n) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
const span = (f, a, b) => clamp01((f - a) / (b - a));
const smooth = (u) => u * u * (3 - 2 * u);
const easeOut = (u) => 1 - (1 - u) * (1 - u);

export function sceneGeometry({ width, svgWidth }) {
  if (!(width > 0 && svgWidth > 0)) throw new RangeError('Scene dimensions must be positive.');
  const scale = svgWidth / ART.width;
  const small = width < 600 || scale < 0.43;
  const bodySize = small ? 36 : 22;
  // Monospaced pitch (Courier advance = 0.6 em) and 1½ line spacing.
  const advance = bodySize * 0.6;
  return {
    scale, small, bodySize, advance,
    lineHeight: advance * 2.5,
    maxChars: small ? 22 : 36,
    titleSize: small ? 45 : 38,
    titleLeading: small ? 58 : 49,
  };
}

// Kinsoku: characters that may not begin a line, and ones that may not end it.
const NO_START = new Set('、。，．・：；？！ー）」』】〕〉》ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ々,.;:!?)]}');
const NO_END = new Set('（「『【〔〈《([{');
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;

/**
 * Width in Latin cells (0.6 em each). Full-width characters advance a solid 1 em,
 * the tight pitch of a Japanese (wabun) typewriter, so they take 5/3 of a cell.
 */
export const WIDE_CELLS = 1 / 0.6;
export const isWide = (char) => char.codePointAt(0) > 0xffff || WIDE.test(char);
export const cellsOf = (char) => (isWide(char) ? WIDE_CELLS : 1);
export const widthOf = (text) => [...text].reduce((n, char) => n + cellsOf(char), 0);

/**
 * Wrap to `maxCells` columns. Latin words stay whole; Japanese may break between
 * any two characters except where kinsoku forbids it. Explicit line breaks are kept.
 */
export function wrapText(text, maxCells) {
  return text.split('\n').flatMap((paragraph) => {
    const units = [];
    let word = '';
    const flush = () => { if (word) { units.push(word); word = ''; } };
    for (const char of paragraph) {
      if (char === ' ') { flush(); units.push(' '); }
      else if (isWide(char)) { flush(); units.push(char); }
      else word += char;
    }
    flush();

    const joined = [];
    for (const unit of units) {
      const prev = joined[joined.length - 1];
      if (prev !== undefined && prev !== ' ' && unit !== ' '
        && (NO_START.has([...unit][0]) || NO_END.has([...prev].at(-1)))) joined[joined.length - 1] = prev + unit;
      else joined.push(unit);
    }

    const lines = [];
    let line = '';
    for (const unit of joined) {
      if (unit === ' ' && !line) continue;
      const next = line + unit;
      if (widthOf(next.trimEnd()) > maxCells + 1e-9 && line.trim()) {
        lines.push(line.trimEnd());
        line = unit === ' ' ? '' : unit;
      } else line = next;
    }
    lines.push(line.trimEnd());
    return lines;
  });
}

/** Preserve explicit line breaks. Use a compact two-line welcome on phones. */
export function welcomeLines(text, small) {
  if (!small || text.includes('\n')) return text.split('\n');
  return wrapText(text, 12);
}

/**
 * The body's light markup, one block per source line:
 * `# 見出し` centred heading, `## 見出し` left heading, `---` rule, empty line = blank line,
 * a line starting with `・` or `- ` is a list item.
 */
export function parseBlocks(text) {
  return text.replace(/\r\n?/g, '\n').replace(/^\s*\n|\s+$/g, '').split('\n').map((raw) => {
    const line = raw.trim();
    if (!line) return { type: 'blank' };
    if (/^(-{3,}|ー{3,}|─{3,})$/.test(line)) return { type: 'rule' };
    const heading = line.match(/^(#{1,2})\s+(.+)$/);
    if (heading) return { type: 'heading', level: heading[1].length, text: heading[2] };
    // Keep a leading full-width space: it is the paragraph indent.
    return { type: 'paragraph', text: raw.replace(/^[ \t]+|\s+$/g, '') };
  });
}

/** Typed rows: `indent` is in cells (set with the tab key), `bold` rows are double-struck. */
export function layoutRows(blocks, maxCells) {
  return blocks.flatMap((block) => {
    if (block.type === 'blank') return [{ text: '', indent: 0, bold: false }];
    if (block.type === 'rule') return [{ text: '-'.repeat(maxCells), indent: 0, bold: false, rule: true }];
    if (block.type === 'paragraph') {
      // List items (・ or "- ") hang: wrapped lines are tabbed in under the item text.
      const marker = block.text.match(/^(・|[-*] )/)?.[0];
      if (!marker) return wrapText(block.text, maxCells).map(text => ({ text, indent: 0, bold: false }));
      const hang = widthOf(marker);
      const lines = wrapText(block.text.slice(marker.length), maxCells - hang);
      return lines.map((text, i) => (i === 0
        ? { text: marker + text, indent: 0, bold: false }
        : { text, indent: hang, bold: false }));
    }
    const lines = wrapText(block.text, maxCells);
    return lines.map(text => ({
      text,
      bold: true,
      indent: block.level === 1 ? Math.max(0, (maxCells - widthOf(text)) / 2) : 0,
    }));
  });
}

const LEFT_HAND = new Set('qwertasdfgzxcvb12345');
const LETTERS = 'qwertyuiopasdfghjklzxcvbnm';
const SYMBOL_KEYS = { ',': 'key-comma', '.': 'key-period', '-': 'key-minus', '=': 'key-equals', ';': 'key-semicolon', '/': 'key-slash' };

/**
 * The SVG key(s) pressed for one character. Capitals hold the opposite-hand shift.
 * Japanese and other characters without their own key use a stable stand-in letter key.
 */
export function keysFor(char) {
  if (/^\s$/.test(char)) return ['spacebar'];
  const lower = char.toLowerCase();
  const base = /^[a-z0-9]$/.test(lower) ? `key-${lower}` : SYMBOL_KEYS[char];
  if (!base) return [`key-${LETTERS[(char.codePointAt(0) * 7919) % LETTERS.length]}`];
  if (char === lower) return [base];
  return [LEFT_HAND.has(lower) ? 'key-shift-right' : 'key-shift-left', base];
}

/**
 * Lay out the sheet and turn the body text into a timeline of strokes.
 * Each event stores the machine state at its start so any frame is O(log n).
 */
export function buildScript({ welcome, body }, geometry) {
  const { lineHeight: L, advance, maxChars, bodySize } = geometry;
  const titles = welcomeLines(welcome, geometry.small);
  // The welcome was typed just before: it sits two lines above the print line.
  const lastTitleY = PRINT.y - 2 * L;
  const titleY = lastTitleY - (titles.length - 1) * geometry.titleLeading;
  const paperTop = titleY - geometry.titleSize - 92;
  const rows = layoutRows(parseBlocks(body), maxChars);
  // Left margin: the carriage starts each line this far right of centre.
  const marginX = maxChars * advance / 2;

  const events = [];
  const chars = [];
  const state = { t: 0, x: 0, feed: 0, typed: 0, steps: 0 };
  const push = (event, duration) => {
    events.push({ ...event, start: state.t, duration, x0: state.x, feed0: state.feed, typed0: state.typed, steps0: state.steps });
    state.t += duration;
  };
  const carriageReturn = (feed) => {
    push({ type: 'return', feed, toX: marginX }, DURATION.return);
    state.x = marginX;
    state.feed += feed;
  };

  carriageReturn(1);
  rows.forEach((row, index) => {
    if (row.indent > 0) {
      const toX = marginX - row.indent * advance;
      push({ type: 'tab', keys: ['key-tab'], toX }, DURATION.tab);
      state.x = toX;
    }
    for (const char of row.text) {
      const cells = cellsOf(char);
      const blank = /\s/.test(char);
      if (!blank) {
        // Courier fills its 0.6 em cell; a Japanese glyph fills its 1 em pitch exactly.
        const cellX = PRINT.x - state.x;
        const glyphWidth = isWide(char) ? bodySize : advance;
        chars.push({
          char, cellX, x: cellX + (cells * advance - glyphWidth) / 2, y: PRINT.y + state.feed * L,
          width: glyphWidth, bold: row.bold, rule: Boolean(row.rule),
        });
      }
      const duration = blank ? DURATION.space : row.rule ? DURATION.repeat : DURATION.key;
      push({ type: blank ? 'space' : 'key', keys: keysFor(char), cells }, duration);
      if (!blank) state.typed += 1;
      state.x -= cells * advance;
      state.steps += 1;
    }
    carriageReturn(index === rows.length - 1 ? 2 : 1);
  });

  return {
    events, chars, rows, titles, titleY, paperTop,
    lines: rows.map(row => row.text),
    total: state.t,
    totalFeed: state.feed * L,
    paperBottom: ART.platenY + state.feed * L + 280,
    lineHeight: L, advance, marginX,
  };
}

function findEvent(events, t) {
  let lo = 0;
  let hi = events.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (events[mid].start <= t) lo = mid; else hi = mid - 1;
  }
  return events[lo];
}

/** The pose of every moving part at scroll progress 0–1. */
export function frameAt(progress, script, radius = 31) {
  if (!(radius > 0)) throw new RangeError('Platen radius must be positive.');
  const t = clamp01(progress) * script.total;
  const event = findEvent(script.events, t);
  const f = progress >= 1 ? 1 : clamp01((t - event.start) / event.duration);
  const { advance, lineHeight } = script;
  const keys = {};
  let x = event.x0;
  let feed = event.feed0;
  let typed = event.typed0;
  let steps = event.steps0;
  let lever = 0;
  let typebar = PARTS.typebar.rest;

  if (event.type === 'return') {
    // Push the lever: the ratchet turns the platen one line, then the carriage slides home.
    lever = PARTS.lever.degrees * (smooth(span(f, 0, 0.18)) - smooth(span(f, 0.82, 1)));
    feed += event.feed * smooth(span(f, 0.04, 0.3));
    x += (event.toX - event.x0) * smooth(span(f, 0.22, 0.8));
  } else if (event.type === 'tab') {
    // The tab key releases the carriage, which runs to the next stop.
    keys['key-tab'] = PARTS.keyDepth * (smooth(span(f, 0, 0.2)) - smooth(span(f, 0.7, 0.95)));
    x += (event.toX - event.x0) * smooth(span(f, 0.15, 0.7));
  } else {
    const isSpace = event.type === 'space';
    const press = smooth(span(f, 0, 0.22)) - smooth(span(f, 0.5, 0.85));
    const [first, second] = event.keys;
    if (second) {
      // Shift goes down first and is released last.
      keys[first] = PARTS.keyDepth * (smooth(span(f, 0, 0.12)) - smooth(span(f, 0.78, 0.96)));
      keys[second] = PARTS.keyDepth * press;
    } else {
      keys[first] = (isSpace ? PARTS.spaceDepth : PARTS.keyDepth) * press;
    }
    if (!isSpace) {
      // The arm accelerates into the platen, strikes at f = .36, then falls back to the basket.
      const strike = 0.36;
      const swing = f < strike ? span(f, 0.08, strike) ** 2 : 1 - easeOut(span(f, strike, 0.8));
      typebar += (1 - PARTS.typebar.rest) * swing;
      if (f >= strike) typed += 1;
    }
    // Escapement: the carriage jumps one pitch (1 em for full-width) to the left as the key rises.
    const step = smooth(isSpace ? span(f, 0.3, 0.55) : span(f, 0.42, 0.6));
    x -= step * advance * event.cells;
    steps += step;
  }

  const fed = feed * lineHeight;
  return {
    paperY: -fed,
    knobDegrees: -fed / radius * 180 / Math.PI,
    carriageX: x,
    leverDegrees: lever,
    typebarScale: typebar,
    spoolDegrees: steps * 4,
    keys,
    typed,
  };
}

export function paperPath(top, bottom) {
  const controlY = top + (ART.platenY - top) * 0.34;
  const { left, right, footLeft, footRight } = PAPER;
  return `M ${left} ${top} Q 800 ${top - 12} ${right} ${top}
    C ${right + 4} ${controlY} ${right + 6} 500 ${footRight} 703 L ${footRight} ${bottom}
    L ${footLeft} ${bottom} L ${footLeft} 703 C ${left - 6} 500 ${left - 4} ${controlY} ${left} ${top} Z`;
}

/** A rotor viewed at an angle: preserve the oval silhouette while turning. */
export function rotorTransform(cx, cy, degrees, ratio = 0.75) {
  return `translate(${cx} ${cy}) scale(1 ${ratio}) rotate(${degrees}) scale(1 ${1 / ratio}) translate(${-cx} ${-cy})`;
}

/** Small deterministic irregularities in ink density and alignment, like worn type. */
export function inkJitter(index) {
  const r = (n) => {
    const v = Math.sin((index + 1) * 12.9898 + n * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  return { opacity: 0.78 + r(1) * 0.2, dx: (r(2) - 0.5) * 0.7, dy: (r(3) - 0.5) * 0.9 };
}
