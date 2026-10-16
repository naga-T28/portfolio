/** Shared design coordinates: HTML paper and all SVG layers are scaled as one scene. */
export const ART = Object.freeze({ width: 1600, height: 1400, platenY: 705, baseY: 1295 });
export const PAPER = Object.freeze({ left: 410, right: 1190, exitY: 706 });
export const PRINT = Object.freeze({ y: 686 });
export const PARTS = Object.freeze({
  lever: { x: 340, y: 694, degrees: -14 },
  typebar: { x: 0, y: 797, rest: 0.12 },
  knobs: [[293, 702], [1307, 702]],
  spools: [[411, 802], [1189, 802]],
  keyDepth: 7, spaceDepth: 6,
});
export const DURATION = Object.freeze({ key: 1, space: 0.75, return: 3.2, tab: 1.6, repeat: 0.4 });
export const STRIKE = 0.36;
export const clamp01 = n => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
const span = (f, a, b) => clamp01((f - a) / (b - a));
const smooth = u => u * u * (3 - 2 * u);
const easeOut = u => 1 - (1 - u) * (1 - u);

/** On-screen size of the typed body [CSS px]; the sheet's SVG size is derived from the scene scale. */
export const BODY_PX = 14;
// Width of the typed column in SVG units (the sheet is 780 wide), shared by every text size.
const COLUMN = 636;

export function sceneGeometry({ width, svgWidth }) {
  if (!(width > 0 && svgWidth > 0)) throw new RangeError('Scene dimensions must be positive.');
  const scale = svgWidth / ART.width;
  const small = width < 600;
  // Rounded so tiny resizes keep the same layout.
  const bodySize = Math.round(BODY_PX / scale * 4) / 4;
  const advance = bodySize * 0.6;
  return {
    scale, small, bodySize, advance,
    lineHeight: bodySize * 1.55,
    maxChars: Math.max(12, Math.floor(COLUMN / advance)),
    titleSize: small ? 50 : 40,
    titleLeading: small ? 64 : 52,
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

    const fitted = joined.flatMap(unit => {
      if (widthOf(unit) <= maxCells || [...unit].length < 3) return [unit];
      const chunks = [];
      let chunk = '';
      for (const char of unit) {
        if (widthOf(chunk + char) > maxCells && chunk) { chunks.push(chunk); chunk = ''; }
        chunk += char;
      }
      if (chunk) chunks.push(chunk);
      return chunks;
    });
    const lines = [];
    let line = '';
    for (const unit of fitted) {
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

/** `[text](url)` inline links: the plain text plus link ranges (UTF-16 offsets) into it. */
export function parseLinks(source) {
  const links = [];
  let text = '', last = 0;
  for (const match of source.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    if (/^(javascript|data|vbscript):/i.test(match[2])) continue; // left as written, never a live link
    text += source.slice(last, match.index);
    links.push({ start: text.length, end: text.length + match[1].length, href: match[2] });
    text += match[1];
    last = match.index + match[0].length;
  }
  return { text: text + source.slice(last), links };
}

/** Split text into plain and linked runs, for rendering the readable transcript. */
export function linkSegments({ text, links = [] }) {
  const segments = [];
  let at = 0;
  for (const { start, end, href } of links) {
    if (start > at) segments.push({ text: text.slice(at, start) });
    segments.push({ text: text.slice(start, end), href });
    at = end;
  }
  if (at < text.length) segments.push({ text: text.slice(at) });
  return segments;
}

/**
 * The body's light markup, one block per source line:
 * `# 見出し` centred heading, `## 見出し` left heading, `---` rule, empty line = blank line,
 * a line starting with `・` or `- ` is a list item, `[文字](URL)` is a link,
 * `ラベル | URL` (or `ラベル | [文字](URL)`) is a link row: bold label left, link right-aligned.
 */
export function parseBlocks(text) {
  return text.replace(/\r\n?/g, '\n').replace(/^\s*\n|\s+$/g, '').split('\n').map((raw) => {
    const line = raw.trim();
    if (!line) return { type: 'blank' };
    if (/^(-{3,}|ー{3,}|─{3,})$/.test(line)) return { type: 'rule' };
    const heading = line.match(/^(#{1,2})\s+(.+)$/);
    if (heading) return { type: 'heading', level: heading[1].length, ...parseLinks(heading[2]) };
    const row = line.match(/^(.+?)\s+\|\s+(.+)$/);
    if (row) {
      const bare = row[2].match(/^(https?:\/\/)(\S+)$/);
      // A bare URL shows only its last path segment (the handle); a bare domain shows the domain.
      const shown = bare?.[2].replace(/\/+$/, '').split('/').at(-1);
      const value = bare ? { text: shown, links: [{ start: 0, end: shown.length, href: row[2] }] } : parseLinks(row[2]);
      return { type: 'linkrow', label: row[1], ...value };
    }
    // Keep a leading full-width space: it is the paragraph indent.
    return { type: 'paragraph', ...parseLinks(raw.replace(/^[ \t]+|\s+$/g, '')) };
  });
}

/**
 * Wrapped rows are in-order substrings of their block, so each row's offset into the block
 * text can be found by searching forward; link ranges are then re-based onto the row.
 */
function withLinks(rows, block) {
  if (!block.links?.length) return rows;
  let cursor = 0;
  return rows.map((row) => {
    const offset = block.text.indexOf(row.text, cursor);
    cursor = offset + row.text.length;
    const links = block.links
      .map(({ start, end, href }) => ({ start: Math.max(start, offset) - offset, end: Math.min(end, cursor) - offset, href }))
      .filter(link => link.end > link.start);
    return links.length ? { ...row, links } : row;
  });
}

/** Typed rows: `indent` is in cells (set with the tab key), `bold` rows are double-struck. */
export function layoutRows(blocks, maxCells) {
  // A rule touching a link row separates table rows rather than sections.
  const near = (i, step) => { while (blocks[i]?.type === 'blank') i += step; return blocks[i]?.type === 'linkrow'; };
  blocks = blocks.map((block, i) => block.type === 'rule' && (near(i - 1, -1) || near(i + 1, 1)) ? { ...block, table: true } : block);
  return blocks.flatMap(block => block.type === 'linkrow' ? rowsOf(block, maxCells) : withLinks(rowsOf(block, maxCells), block));
}

/** Label, then a tab stop that right-aligns the value; on a narrow sheet the value drops to its own rows. */
function linkRows(block, maxCells) {
  const valueWidth = widthOf(block.text);
  if (widthOf(block.label) + 2 + valueWidth <= maxCells) {
    const tab = { at: block.label.length, to: maxCells - valueWidth };
    return [{ text: block.label + block.text, indent: 0, bold: false, boldTo: block.label.length, tab,
      links: block.links.map(link => ({ ...link, start: link.start + tab.at, end: link.end + tab.at })) }];
  }
  const label = wrapText(block.label, maxCells).map(text => ({ text, indent: 0, bold: true }));
  const value = withLinks(wrapText(block.text, maxCells).map(text => ({ text, indent: maxCells - widthOf(text), bold: false })), block);
  return [...label, ...value];
}

function rowsOf(block, maxCells) {
  if (block.type === 'linkrow') return linkRows(block, maxCells);
  if (block.type === 'blank') return [{ text: '', indent: 0, bold: false }];
  // Section rules are underscores, which join into one straight line; table rules stay faint dashes.
  if (block.type === 'rule') return [{ text: (block.table ? '-' : '_').repeat(maxCells), indent: 0, bold: false, rule: block.table ? 'table' : 'section' }];
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
}

const LEFT_HAND = new Set('qwertasdfgzxcvb12345');
const LETTERS = 'qwertyuiopasdfghjklzxcvbnm';
const SYMBOL_KEYS = { '_': 'key-minus', ',': 'key-comma', '.': 'key-period', '-': 'key-minus', '=': 'key-equals', ';': 'key-semicolon', '/': 'key-slash' };

/**
 * The SVG key(s) pressed for one character. Capitals hold the opposite-hand shift.
 * Japanese and other characters without their own key use a stable stand-in letter key.
 */
export function keysFor(char) {
  if (/^\s$/.test(char)) return ['spacebar'];
  const lower = char.toLowerCase();
  const base = /^[a-z0-9]$/.test(lower) ? `key-${lower}` : SYMBOL_KEYS[char];
  if (!base) return [`key-${LETTERS[(char.codePointAt(0) * 7919) % LETTERS.length]}`];
  if (char === lower && char !== '_') return [base];
  return [LEFT_HAND.has(lower) ? 'key-shift-right' : 'key-shift-left', base];
}

/** Compile strokes once; every render is a pure sample, independent of direction. */
export function buildScript({ welcome, body }, geometry) {
  const { lineHeight: L, advance, maxChars, bodySize } = geometry;
  const titles = welcomeLines(welcome, geometry.small);
  // Like a real sheet: the welcome sits two lines above the print line, with only a short top margin above it.
  const titleY = PRINT.y - 2 * L - (titles.length - 1) * geometry.titleLeading;
  const paperTop = titleY - geometry.titleSize - 50;
  const rows = layoutRows(parseBlocks(body), maxChars);
  const marginX = (ART.width - maxChars * advance) / 2;
  const events = [], chars = [];
  const state = { t: 0, x: marginX, feed: 0, typed: 0, steps: 0, line: 0 };
  const push = (event, duration) => {
    events.push({ ...event, start: state.t, duration, x0: state.x, feed0: state.feed,
      typed0: state.typed, steps0: state.steps, line0: state.line });
    state.t += duration;
  };
  rows.forEach((row, index) => {
    if (row.indent > 0) {
      const toX = marginX + row.indent * advance;
      push({ type: 'tab', keys: ['key-tab'], toX }, DURATION.tab);
      state.x = toX;
    }
    let at = 0;
    for (const char of row.text) {
      if (row.tab && at === row.tab.at) {
        const toX = marginX + row.tab.to * advance;
        push({ type: 'tab', keys: ['key-tab'], toX }, DURATION.tab);
        state.x = toX;
      }
      const cells = cellsOf(char), blank = /\s/.test(char);
      const href = row.links?.find(link => at >= link.start && at < link.end)?.href;
      const bold = row.bold || at < (row.boldTo ?? 0);
      at += char.length;
      if (!blank) chars.push({ char, x: state.x, y: PRINT.y + state.feed * L,
        width: cells * advance, bold, rule: row.rule ?? false, ...(href && { href }) });
      const duration = blank ? DURATION.space : row.rule ? DURATION.repeat : DURATION.key;
      push({ type: blank ? 'space' : 'key', keys: keysFor(char), cells }, duration);
      if (!blank) state.typed += 1;
      state.x += cells * advance;
      state.steps += 1;
    }
    // Every return advances exactly ONE line, including the final presentation feed.
    push({ type: 'return', toX: marginX, feed: 1 }, DURATION.return);
    state.x = marginX;
    state.feed += 1;
    state.line = index + 1;
  });
  return { events, chars, rows, titles, titleY, paperTop, bodySize,
    lines: rows.map(row => row.text), total: state.t,
    totalFeed: state.feed * L, paperBottom: PAPER.exitY + state.feed * L + 200,
    lineHeight: L, advance, marginX };
}

function findEvent(events, t) {
  let lo = 0, hi = events.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (events[mid].start <= t) lo = mid; else hi = mid - 1;
  }
  return events[lo];
}

export function frameAt(progress, script, radius = 31) {
  if (!(radius > 0)) throw new RangeError('Platen radius must be positive.');
  const p = clamp01(progress), t = p * script.total;
  const event = findEvent(script.events, t);
  const f = p === 1 ? 1 : clamp01((t - event.start) / event.duration);
  const { advance, lineHeight } = script;
  let x = event.x0, feed = event.feed0, typed = event.typed0, steps = event.steps0;
  let typebar = PARTS.typebar.rest, lever = 0;
  const keys = {};
  if (event.type === 'return') {
    lever = PARTS.lever.degrees * (smooth(span(f, 0, .18)) - smooth(span(f, .8, 1)));
    x += (event.toX - event.x0) * smooth(span(f, .05, .6));
    feed += smooth(span(f, .52, .94));
  } else if (event.type === 'tab') {
    keys['key-tab'] = PARTS.keyDepth * (smooth(span(f, 0, .2)) - smooth(span(f, .7, .95)));
    x += (event.toX - event.x0) * smooth(span(f, .15, .7));
  } else {
    const isSpace = event.type === 'space';
    const press = smooth(span(f, 0, .22)) - smooth(span(f, .5, .85));
    event.keys.forEach((key, i) => {
      keys[key] = key === 'spacebar' ? PARTS.spaceDepth * press :
        event.keys.length > 1 && i === 0 ? PARTS.keyDepth * (smooth(span(f, 0, .12)) - smooth(span(f, .78, .96))) : PARTS.keyDepth * press;
    });
    if (!isSpace) {
      const swing = f < STRIKE ? span(f, .08, STRIKE) ** 2 : 1 - easeOut(span(f, STRIKE, .8));
      typebar += (1 - PARTS.typebar.rest) * swing;
      if (f >= STRIKE - 1e-10) typed++;
    }
    const step = smooth(isSpace ? span(f, .3, .55) : span(f, .48, .8));
    x += step * advance * event.cells;
    steps += step;
  }
  // Expose the cell left edge and its centre separately; the guide and slug use the centre.
  const headX = x;
  const strikeOffset = event.type === 'key' ? event.cells * advance / 2 : advance / 2;
  const paperY = -feed * lineHeight;
  return { paperX: 0, paperY, headX, strikeX: headX + strikeOffset,
    knobDegrees: paperY / radius * 180 / Math.PI,
    rollerRadians: paperY / radius, leverDegrees: lever,
    typebarScale: typebar, spoolDegrees: steps * 4, keys, typed,
    line: Math.min(script.rows.length, Math.floor(feed + 1e-9)),
    eventType: event.type, eventProgress: f };
}

/** Project a turning wheel without rotating its elliptical outline. */
export function rotorTransform(cx, cy, degrees, ratio = .75) {
  return `translate(${cx} ${cy}) scale(1 ${ratio}) rotate(${degrees}) scale(1 ${1 / ratio}) translate(${-cx} ${-cy})`;
}
/** Density variation only: registration stays exact. */
export function inkJitter(index) {
  const v = Math.sin((index + 1) * 12.9898) * 43758.5453;
  return { opacity: .83 + (v - Math.floor(v)) * .15 };
}

/**
 * Sound cues on the same stroke timeline as `frameAt`, so scrubbing and sound stay in step.
 * The margin bell rings once per line, six cells before the right margin, like a real machine.
 */
export function soundCues(script, maxChars) {
  const bellX = script.marginX + (maxChars - 6) * script.advance;
  const cues = [];
  for (const e of script.events) {
    const at = share => e.start + e.duration * share;
    if (e.type === 'key') {
      cues.push({ type: 'strike', at: at(STRIKE) });
      if (e.x0 < bellX && e.x0 + e.cells * script.advance >= bellX) cues.push({ type: 'bell', at: at(.5) });
    } else if (e.type === 'space') cues.push({ type: 'space', at: at(.25) });
    else if (e.type === 'tab') cues.push({ type: 'tab', at: at(.15) });
    else {
      cues.push({ type: 'carriage', at: at(.05) });
      cues.push({ type: 'feed', at: at(.6) });
    }
  }
  return cues;
}

/** Cues crossed while playing forward from p0 to p1; rewinding is silent. */
export function cuesBetween(cues, total, p0, p1) {
  if (!(p1 > p0)) return [];
  const t0 = clamp01(p0) * total, t1 = clamp01(p1) * total;
  return cues.filter(cue => cue.at > t0 && cue.at <= t1);
}
