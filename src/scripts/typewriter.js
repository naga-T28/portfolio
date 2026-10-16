import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ART, PAPER, PARTS, buildScript, cuesBetween, frameAt, inkJitter, rotorTransform, sceneGeometry, soundCues } from './motion.js';
import { createSound } from './sound.js';

gsap.registerPlugin(ScrollTrigger);
const mounted = new Map();
const LANG_KEY = 'naga-t-lang';
const LABELS = {
  ja: { hint: 'スクロールしてタイプ', home: 'naga-t.jp の先頭へ', auto: '自動', sound: '音', effects: '演出', story: 'タイプライターのイントロダクション',
    switchTo: 'EN', switchLabel: 'Switch to English', switchLang: 'en' },
  en: { hint: 'Scroll to type', home: 'naga-t.jp home', auto: 'Auto', sound: 'Sound', effects: 'Effects', story: 'Typewriter introduction',
    switchTo: 'JA', switchLabel: '日本語に切り替え', switchLang: 'ja' },
};

/** ?lang= wins (shareable), then the visitor's last choice, then the browser language. */
function initialLang() {
  const query = new URLSearchParams(location.search).get('lang');
  if (query === 'ja' || query === 'en') return query;
  try { const saved = localStorage.getItem(LANG_KEY); if (saved === 'ja' || saved === 'en') return saved; } catch {}
  return (navigator.languages ?? [navigator.language]).some(l => /^ja\b/i.test(l)) ? 'ja' : 'en';
}

function createController(story) {
  const config = JSON.parse(story.dataset.settings);
  const stage = story.querySelector('[data-typewriter-stage]');
  const machine = story.querySelector('[data-typewriter-machine]');
  const space = story.querySelector('[data-machine-space]');
  const part = id => space.querySelector(`#${id}`);
  const paper = story.querySelector('[data-paper-feed]');
  const title = story.querySelector('[data-paper-welcome]');
  const printed = story.querySelector('[data-paper-print]');
  const motionToggle = story.querySelector('[data-motion-toggle]');
  const motionState = story.querySelector('[data-motion-state]');
  const transcripts = [...story.querySelectorAll('[data-letter-transcript]')];
  const langToggle = story.querySelector('[data-lang-toggle]');
  let lang = 'ja';
  const copy = () => (lang === 'en' ? config.en : config);
  const distance = () => Math.round(script.total * config.scrollPerStroke);
  const soundToggle = story.querySelector('[data-sound-toggle]');
  const soundState = story.querySelector('[data-sound-state]');
  const autoButton = story.querySelector('[data-auto-scroll]');
  const sound = createSound();
  // Height of the screen with iOS toolbars collapsed, so the sheet still reaches the top when they hide.
  const tallProbe = Object.assign(document.createElement('div'), { className: 'machine-viewport-probe' });
  tallProbe.setAttribute('aria-hidden', 'true');
  story.append(tallProbe);
  // The scroll distance, as an in-flow block after the stage: sticky only travels within its parent's content box.
  const spacer = Object.assign(document.createElement('div'), { className: 'scroll-spacer' });
  spacer.setAttribute('aria-hidden', 'true');
  stage.after(spacer);
  const head = part('print-head'), carriage = part('head-carriage');
  const hammerCarriage = part('typebar-carriage'), typebar = part('typebar-action');
  const lever = part('carriage-return');
  const ribbonSpan = part('ribbon-span'), ribbonEdge = part('ribbon-edge');
  const knobs = ['platen-knob-left-rotor', 'platen-knob-right-rotor'].map(part);
  const spools = ['ribbon-spool-left-rotor', 'ribbon-spool-right-rotor'].map(part);
  const ribs = [...space.querySelectorAll('[data-roller-rib]')];
  const keyParts = new Map([...space.querySelectorAll('[id^="key-"], #spacebar')].map(el => [el.id, el]));
  const state = { progress: 0 };
  let autoFrame = 0, script, geometry, cues = [], heard = 0, glyphs = [], shown = 0, pressed = new Set(), trigger, disposed = false;
  const attr = (el, name, value) => el.setAttribute(name, String(value));
  const movePaper = gsap.quickSetter(paper, 'y', 'px');
  const headX = gsap.quickSetter(head, 'attr');
  const carriageX = gsap.quickSetter(carriage, 'attr');
  const hammerX = gsap.quickSetter(hammerCarriage, 'attr');

  function render() {
    if (!script) return;
    const f = frameAt(state.progress, script, config.platenRadius);
    sound.play(cuesBetween(cues, script.total, heard, state.progress));
    heard = state.progress;
    movePaper(f.paperY); // There is deliberately no paper X transform.
    headX({ transform: `translate(${f.strikeX} 0)` });
    carriageX({ transform: `translate(${f.strikeX} 0)` });
    hammerX({ transform: `translate(${f.strikeX} 0)` });
    knobs.forEach((el, i) => attr(el, 'transform', rotorTransform(...PARTS.knobs[i], f.knobDegrees)));
    spools.forEach((el, i) => attr(el, 'transform', rotorTransform(...PARTS.spools[i], f.spoolDegrees, .35)));
    attr(lever, 'transform', `rotate(${f.leverDegrees} ${PARTS.lever.x} ${PARTS.lever.y})`);
    attr(typebar, 'transform', `translate(0 ${PARTS.typebar.y}) scale(1 ${f.typebarScale}) translate(0 ${-PARTS.typebar.y})`);
    ribs.forEach((el, i) => {
      const a = f.rollerRadians + i * Math.PI * 2 / ribs.length;
      const y = ART.platenY + Math.sin(a) * config.platenRadius;
      attr(el, 'd', `M344 ${y}H1256`);
      attr(el, 'opacity', Math.max(0, Math.cos(a)) * .28);
    });
    // Each end meets the wound ribbon on its spool (left x≈503, right x≈1097), below the spool's top face.
    attr(ribbonSpan, 'd', `M503 814 ${f.strikeX - 22} 721H${f.strikeX + 22}L1097 814`);
    attr(ribbonEdge, 'd', `M503 809 ${f.strikeX - 22} 716H${f.strikeX + 22}L1097 809`);
    const down = new Set(Object.keys(f.keys));
    pressed.forEach(id => { if (!down.has(id)) attr(keyParts.get(id), 'transform', 'translate(0 0)'); });
    down.forEach(id => attr(keyParts.get(id), 'transform', `translate(0 ${f.keys[id]})`));
    pressed = down;
    for (let i = Math.min(shown, f.typed); i < Math.max(shown, f.typed); i++) {
      glyphs[i].style.visibility = i < f.typed ? 'visible' : 'hidden';
    }
    shown = f.typed;
    story.dataset.feedStarted = String(state.progress > .002);
    // Read-only diagnostics: useful when embedding or checking registration in DevTools.
    story.dataset.typed = String(f.typed);
    story.dataset.line = String(f.line);
    story.dataset.progress = state.progress.toFixed(6);
  }

  function measure() {
    if (disposed || story.dataset.motion !== 'animated') return;
    const next = sceneGeometry({ width: story.clientWidth, svgWidth: machine.clientWidth });
    space.style.setProperty('--machine-scale', String(next.scale));
    const taller = Math.max(0, tallProbe.offsetHeight - stage.clientHeight);
    space.style.setProperty('--paper-reach', `${Math.ceil((Math.max(0, machine.offsetTop) + taller) / next.scale) + 40}px`);
    // The text keeps its on-screen size, so the layout is rebuilt only when that changes its SVG size.
    if (geometry && next.small === geometry.small && next.bodySize === geometry.bodySize) return placeHint();
    geometry = next;
    script = buildScript(copy(), geometry);
    spacer.style.height = `${distance()}px`;
    cues = soundCues(script, geometry.maxChars);
    heard = state.progress;
    paper.style.top = `${script.paperTop}px`;
    paper.style.height = `${script.paperBottom - script.paperTop}px`;
    title.style.top = `${script.titleY - script.paperTop - geometry.titleSize}px`;
    title.style.fontSize = `${geometry.titleSize}px`;
    title.style.lineHeight = `${geometry.titleLeading}px`;
    title.replaceChildren(...script.titles.map(line => {
      const row = document.createElement('span'); row.textContent = line; return row;
    }));
    printed.style.fontSize = `${geometry.bodySize}px`;
    const fragment = document.createDocumentFragment();
    glyphs = script.chars.map(({ char, x, y, width, bold, href, rule }, index) => {
      const glyph = document.createElement(href ? 'a' : 'span');
      glyph.className = `printed-glyph${bold ? ' is-bold' : ''}${href ? ' is-link' : ''}${rule === 'table' ? ' is-table-rule' : ''}`;
      if (href) {
        glyph.href = href;
        // The paper is decorative (aria-hidden); keyboard and screen-reader users get the transcript's links.
        glyph.tabIndex = -1;
        if (glyph.host && glyph.host !== location.host) Object.assign(glyph, { target: '_blank', rel: 'noopener' });
      }
      glyph.style.left = `${x - PAPER.left}px`;
      // Each cell's bottom is the shared PRINT.y registration line.
      glyph.style.top = `${y - script.paperTop - geometry.bodySize}px`;
      glyph.style.width = `${width}px`;
      glyph.style.height = `${geometry.bodySize}px`;
      glyph.style.opacity = inkJitter(index).opacity;
      glyph.style.visibility = 'hidden';
      glyph.textContent = char;
      fragment.append(glyph);
      return glyph;
    });
    printed.replaceChildren(fragment);
    shown = 0;
    placeHint();
    render();
  }

  // The scroll hint sits just above the sheet, or above the dark paper support (top at y≈470) when that is higher.
  function placeHint() {
    stage.style.setProperty('--paper-top', `${machine.offsetTop + Math.min(script.paperTop, 470) * geometry.scale}px`);
  }

  let media;
  // Effects can be switched off for a plain reading view, and back on again.
  function setMotionButton(on) {
    motionToggle.setAttribute('aria-pressed', String(on));
    motionState.textContent = on ? 'ON' : 'OFF';
  }
  function enableMotion() {
    media = gsap.matchMedia();
    media.add({ animate: '(prefers-reduced-motion: no-preference)', reduce: '(prefers-reduced-motion: reduce)' }, context => {
      if (context.conditions.reduce) {
        story.dataset.motion = 'static';
        stopAuto();
        // The system asks for reduced motion, so there is nothing to switch on.
        motionToggle.hidden = true;
        soundToggle.hidden = true;
        autoButton.hidden = true;
        return;
      }
      story.dataset.motion = 'animated';
      setMotionButton(true);
      motionToggle.hidden = false;
      soundToggle.hidden = false;
      autoButton.hidden = false;
      geometry = undefined;
      measure();
      ScrollTrigger.addEventListener('refreshInit', measure);
      const animation = gsap.fromTo(state, { progress: 0 }, {
        progress: 1, ease: 'none', onUpdate: render,
        // The stage is CSS-sticky inside the story; the spacer after it is exactly this distance.
        scrollTrigger: { trigger: story, start: 'top top', end: () => `+=${distance()}`,
          // `true` is required for direct scrubbing: numeric zero would disable scrubbing.
          scrub: config.scrub > 0 ? config.scrub : true,
          invalidateOnRefresh: true,
        },
      });
      trigger = animation.scrollTrigger;
      return () => {
        stopAuto();
        ScrollTrigger.removeEventListener('refreshInit', measure);
        spacer.style.height = '';
        trigger = undefined;
      };
    });
  }
  applyLang(initialLang());
  langToggle.hidden = false;
  enableMotion();
  // Auto play scrolls the page itself, so scrubbing, sound and the scroll position all stay one timeline.
  function stopAuto() {
    cancelAnimationFrame(autoFrame);
    autoFrame = 0;
    autoButton.setAttribute('aria-pressed', 'false');
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(type => window.removeEventListener(type, onUserScroll));
  }
  function startAuto() {
    if (!trigger) return;
    const pxPerSecond = config.autoStrokesPerSecond * config.scrollPerStroke;
    // From the end (or above the story), start again from the first stroke.
    let y = trigger.progress >= 1 || window.scrollY < trigger.start ? trigger.start : window.scrollY;
    window.scrollTo(0, y);
    let last = performance.now();
    const step = (now) => {
      y = Math.min(trigger.end, y + pxPerSecond * Math.min(now - last, 100) / 1000);
      last = now;
      window.scrollTo(0, Math.round(y));
      if (y >= trigger.end) stopAuto(); else autoFrame = requestAnimationFrame(step);
    };
    autoFrame = requestAnimationFrame(step);
    autoButton.setAttribute('aria-pressed', 'true');
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(type => window.addEventListener(type, onUserScroll, { passive: true }));
  }
  // Any manual scroll intent hands control back to the reader; toggling sound does not.
  const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
  const onUserScroll = (event) => {
    if (event.type === 'keydown' && !SCROLL_KEYS.has(event.key)) return;
    if (!event.target.closest?.('[data-auto-scroll], [data-sound-toggle]')) stopAuto();
  };
  const onAuto = () => (autoFrame ? stopAuto() : startAuto());
  const onSound = () => {
    const on = sound.toggle();
    soundToggle.setAttribute('aria-pressed', String(on));
    soundState.textContent = on ? 'ON' : 'OFF';
  };
  const onMotion = () => {
    stopAuto();
    if (story.dataset.motion === 'animated') {
      // Plain reading view: no pin, no scroll trap, the full letter as a document.
      media.revert();
      story.dataset.motion = 'static';
      setMotionButton(false);
      // Keep the header (and this toggle) in view; the letter starts right below it.
      window.scrollTo(0, story.offsetTop);
      transcripts.find(el => !el.hidden).focus({ preventScroll: true });
    } else {
      enableMotion();
      ScrollTrigger.refresh();
      window.scrollTo(0, trigger?.start ?? story.offsetTop);
    }
  };
  function applyLang(next) {
    lang = next;
    const text = LABELS[lang];
    document.documentElement.lang = lang;
    story.setAttribute('aria-label', text.story);
    story.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = text[el.dataset.i18n]; });
    story.querySelectorAll('[data-i18n-label]').forEach(el => el.setAttribute('aria-label', text[el.dataset.i18nLabel]));
    Object.assign(langToggle, { textContent: text.switchTo, lang: text.switchLang });
    langToggle.setAttribute('aria-label', text.switchLabel);
    transcripts.forEach(el => { el.hidden = el.dataset.letterTranscript !== lang; });
  }
  const onLang = () => {
    stopAuto();
    applyLang(lang === 'ja' ? 'en' : 'ja');
    try { localStorage.setItem(LANG_KEY, lang); } catch {}
    const url = new URL(location.href);
    if (lang === 'en') url.searchParams.set('lang', 'en'); else url.searchParams.delete('lang');
    history.replaceState(history.state, '', url);
    if (story.dataset.motion !== 'animated') return;
    // Retype the new letter from the first stroke; the scroll length follows the new text.
    geometry = undefined;
    measure();
    ScrollTrigger.refresh();
    window.scrollTo(0, trigger?.start ?? story.offsetTop);
  };
  motionToggle.addEventListener('click', onMotion);
  langToggle.addEventListener('click', onLang);
  soundToggle.addEventListener('click', onSound);
  autoButton.addEventListener('click', onAuto);
  return () => {
    disposed = true;
    tallProbe.remove();
    spacer.remove();
    stopAuto();
    autoButton.removeEventListener('click', onAuto);
    soundToggle.removeEventListener('click', onSound);
    sound.dispose();
    motionToggle.removeEventListener('click', onMotion);
    langToggle.removeEventListener('click', onLang);
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
