/**
 * Typewriter sounds synthesised with the Web Audio API: no recordings, so no licences to track.
 * Browsers only allow audio after a click or key press (scrolling does not count),
 * so the context is created from the sound toggle, and every visit starts muted.
 */
// A fast scroll or a jump crosses many cues in one frame; only the latest few are audible.
const MAX_PER_FRAME = 3;

export function createSound() {
  let ctx, out, noise;
  let enabled = false;

  function setup() {
    if (ctx) return;
    ctx = new AudioContext();
    out = ctx.createGain();
    out.gain.value = .5;
    out.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  /** A filtered noise burst with an exponential decay. */
  function burst(when, { freq, q = 1, type = 'bandpass', gain, decay, length = decay * 4 }) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, when);
    amp.gain.setTargetAtTime(0, when, decay);
    src.connect(filter).connect(amp).connect(out);
    src.start(when, Math.random() * .5, length);
  }

  /** A sine with a pitch drop: the body resonance under each strike. */
  function thump(when, { from, to, gain, decay }) {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(from, when);
    osc.frequency.exponentialRampToValueAtTime(to, when + decay * 2);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, when);
    amp.gain.setTargetAtTime(0, when, decay);
    osc.connect(amp).connect(out);
    osc.start(when);
    osc.stop(when + decay * 6);
  }

  function ratchet(when, clicks, spacing, gain) {
    for (let i = 0; i < clicks; i++) {
      burst(when + i * spacing * (.9 + Math.random() * .2), { freq: 3200, q: 4, gain, decay: .006 });
    }
  }

  const voices = {
    strike(when) {
      const v = .85 + Math.random() * .3;
      burst(when, { freq: 2600 * v, q: 1.2, gain: .9, decay: .012 });
      burst(when + .004, { freq: 900 * v, q: 2, gain: .5, decay: .02 });
      thump(when, { from: 180 * v, to: 70, gain: .45, decay: .03 });
      burst(when + .045, { freq: 4200, q: 6, gain: .12, decay: .006 }); // escapement tick
    },
    space(when) {
      burst(when, { freq: 700, q: 1.5, gain: .5, decay: .025 });
      thump(when, { from: 120, to: 60, gain: .3, decay: .035 });
      burst(when + .06, { freq: 4200, q: 6, gain: .12, decay: .006 });
    },
    tab(when) {
      voices.space(when);
      burst(when + .02, { freq: 1800, type: 'lowpass', gain: .18, decay: .08, length: .25 });
      thump(when + .24, { from: 140, to: 70, gain: .4, decay: .03 });
    },
    carriage(when) {
      burst(when, { freq: 2400, q: 5, gain: .35, decay: .008 }); // lever catch
      burst(when + .02, { freq: 1400, type: 'lowpass', gain: .22, decay: .12, length: .35 });
      thump(when + .34, { from: 160, to: 60, gain: .55, decay: .04 }); // carriage stop
    },
    feed(when) { ratchet(when, 3, .035, .3); },
    bell(when) {
      [[2093, .28, .9], [5230, .08, .35], [3140, .05, .5]].forEach(([freq, gain, decay]) => {
        const osc = ctx.createOscillator();
        osc.frequency.value = freq;
        const amp = ctx.createGain();
        amp.gain.setValueAtTime(gain, when);
        amp.gain.setTargetAtTime(0, when, decay / 3);
        osc.connect(amp).connect(out);
        osc.start(when);
        osc.stop(when + decay * 2);
      });
    },
  };

  return {
    get enabled() { return enabled; },
    toggle() {
      enabled = !enabled;
      if (enabled) { setup(); ctx.resume(); } else ctx?.suspend();
      return enabled;
    },
    play(cues) {
      if (!enabled || !ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      cues.slice(-MAX_PER_FRAME).forEach((cue, i) => voices[cue.type](now + i * .03));
    },
    dispose() { ctx?.close(); ctx = undefined; },
  };
}
