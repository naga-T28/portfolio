import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  PAPER, PARTS, buildScript, frameAt, inkJitter, paperPath, rotorTransform, sceneGeometry,
} from './motion.js';

gsap.registerPlugin(ScrollTrigger);
const SVG_NS = 'http://www.w3.org/2000/svg';
const mounted = new Map();

function createController(story) {
  const config = JSON.parse(story.dataset.settings);
  const stage = story.querySelector('[data-typewriter-stage]');
  const svg = story.querySelector('svg#typewriter');
  const part = (id) => svg.querySelector(`#${id}`);
  const paper = part('paper-feed');
  const carriage = part('carriage');
  const lever = part('carriage-return');
  const typebar = part('typebar-action');
  const printed = part('print-content');
  const title = part('welcome-print');
  const knobs = ['platen-knob-left-rotor', 'platen-knob-right-rotor'].map(part);
  const spools = ['ribbon-spool-left-rotor', 'ribbon-spool-right-rotor'].map(part);
  const keyParts = new Map([...svg.querySelectorAll('[id^="key-"], #spacebar')].map(el => [el.id, el]));
  const rewind = story.querySelector('[data-rewind]');
  const state = { progress: 0 };
  let script;
  let glyphs = [];
  let shown = 0;
  let pressed = new Set();
  let trigger;
  let lastStarted = false;

  const set = (el, attr, value) => el.setAttribute(attr, String(value));

  function render() {
    if (!script) return;
    const frame = frameAt(state.progress, script, config.platenRadius);
    // The carriage carries the platen, the sheet and everything printed on it.
    set(carriage, 'transform', `translate(${frame.carriageX.toFixed(3)} 0)`);
    set(paper, 'transform', `translate(0 ${frame.paperY.toFixed(3)})`);
    knobs.forEach((knob, i) => set(knob, 'transform', rotorTransform(...PARTS.knobs[i], frame.knobDegrees)));
    spools.forEach((spool, i) => set(spool, 'transform', rotorTransform(...PARTS.spools[i], frame.spoolDegrees, 0.35)));
    set(lever, 'transform', `rotate(${frame.leverDegrees.toFixed(3)} ${PARTS.lever.x} ${PARTS.lever.y})`);
    const { x, y } = PARTS.typebar;
    set(typebar, 'transform', `translate(${x} ${y}) scale(1 ${frame.typebarScale.toFixed(4)}) translate(${-x} ${-y})`);

    const down = new Set(Object.keys(frame.keys));
    pressed.forEach(id => { if (!down.has(id)) set(keyParts.get(id), 'transform', 'translate(0 0)'); });
    down.forEach(id => set(keyParts.get(id), 'transform', `translate(0 ${frame.keys[id].toFixed(3)})`));
    pressed = down;

    // A glyph appears at the instant its typebar strikes, and vanishes again when scrolling back.
    for (let i = Math.min(shown, frame.typed); i < Math.max(shown, frame.typed); i++) {
      set(glyphs[i], 'visibility', i < frame.typed ? 'visible' : 'hidden');
    }
    shown = frame.typed;

    const started = state.progress > 0.004;
    if (started !== lastStarted) {
      story.dataset.feedStarted = String(started);
      rewind.disabled = !started;
      lastStarted = started;
    }
  }

  function measure() {
    const geometry = sceneGeometry({ width: stage.clientWidth, svgWidth: svg.getBoundingClientRect().width });
    script = buildScript(config, geometry);
    const shape = paperPath(script.paperTop, script.paperBottom);
    ['paper-surface', 'paper-shadow', 'paper-side-shade'].forEach(id => set(part(id), 'd', shape));
    const edgeL = PAPER.left + 2;
    const edgeR = PAPER.right - 2;
    set(part('paper-edge-light'), 'd', `M ${edgeL} ${script.paperTop + 1} Q 800 ${script.paperTop - 10} ${edgeR} ${script.paperTop + 1}`);
    set(part('paper-edge-fine'), 'd', `M ${edgeL} ${script.paperTop + 2} Q 800 ${script.paperTop - 8} ${edgeR} ${script.paperTop + 2}`);

    title.replaceChildren();
    set(title, 'font-size', geometry.titleSize);
    set(title, 'y', script.titleY);
    script.titles.forEach((line, index) => {
      const span = document.createElementNS(SVG_NS, 'tspan');
      set(span, 'x', 800);
      set(span, 'y', script.titleY + index * geometry.titleLeading);
      span.textContent = line;
      title.append(span);
    });

    // One element per strike, so each glyph keeps exactly the position where it was hit.
    const fragment = document.createDocumentFragment();
    glyphs = script.chars.map(({ char, x, y, bold, rule }, index) => {
      // A ruled line is typed against the margin guide, so it stays straight.
      const ink = rule ? { ...inkJitter(index), dx: 0, dy: 0 } : inkJitter(index);
      const glyph = document.createElementNS(SVG_NS, 'text');
      set(glyph, 'x', (x + ink.dx).toFixed(2));
      set(glyph, 'y', (y + ink.dy).toFixed(2));
      set(glyph, 'opacity', ink.opacity.toFixed(3));
      // Headings are double-struck: the second impression thickens every stroke.
      if (bold) set(glyph, 'class', 'bold');
      set(glyph, 'visibility', 'hidden');
      glyph.textContent = char;
      fragment.append(glyph);
      return glyph;
    });
    set(printed, 'font-size', geometry.bodySize);
    printed.replaceChildren(fragment);
    shown = 0;
    story.dataset.ready = 'true';
    render();
  }

  measure();
  const media = gsap.matchMedia();
  media.add({
    animate: '(prefers-reduced-motion: no-preference)',
    reduce: '(prefers-reduced-motion: reduce)',
  }, (context) => {
    state.progress = 0;
    rewind.disabled = true;
    lastStarted = false;
    story.dataset.feedStarted = 'false';

    if (context.conditions.reduce) {
      // No pin or artificial scroll distance: show the finished page.
      state.progress = 1;
      measure();
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    measure();
    ScrollTrigger.addEventListener('refreshInit', measure);
    const animation = gsap.fromTo(state, { progress: 0 }, {
      progress: 1,
      ease: 'none',
      onUpdate: render,
      scrollTrigger: {
        trigger: story,
        pin: stage,
        pinSpacing: true,
        start: 'top top',
        end: () => `+=${Math.round(script.total * config.scrollPerStroke)}`,
        scrub: config.scrub,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });
    trigger = animation.scrollTrigger;
    return () => {
      ScrollTrigger.removeEventListener('refreshInit', measure);
      trigger = undefined;
    };
  });

  const onRewind = () => window.scrollTo({ top: trigger?.start ?? 0, behavior: 'smooth' });
  rewind.addEventListener('click', onRewind);
  return () => {
    rewind.removeEventListener('click', onRewind);
    media.revert();
  };
}

export function mountTypewriters() {
  document.querySelectorAll('[data-typewriter-story]').forEach(story => {
    if (!mounted.has(story)) mounted.set(story, createController(story));
  });
}

document.addEventListener('astro:before-swap', () => {
  mounted.forEach(dispose => dispose());
  mounted.clear();
});
