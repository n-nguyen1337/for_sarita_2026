/* Zone sound: each zone's music and the sounds around it (K-Town's toy street,
   the gym's room tone, the farm's birdsong and animals). Then the little
   one-shot sounds of playing: footsteps, jumps, portals and letters.
   The music comes from the files in assets/bgm (see BGM), and the rest is
   synthesized live with the Web Audio API. A zone names its soundscape with
   `sound` (a key of SOUNDSCAPES), and walking through a portal crossfades to the
   next zone's. Browsers keep a page silent until the first key press or click,
   so audio starts then. */

const VOLUME = 0.56;    // master volume (0..1)
const BGM_VOLUME = 0.8; // background music, relative to everything else
const CROSSFADE = 3;    // seconds to fade from one zone's sound to the next
const SONG_FADE = 6;    // seconds for a song to fade away for good (see fadeSongAway)
const LOOKAHEAD = 0.25; // schedule events this far ahead (s); the timer runs every 50 ms
const SFX_VOLUME = 2.8; // one-shot sounds, relative to the music

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const mtof = (note) => 440 * 2 ** ((note - 69) / 12); // MIDI note -> Hz

/* ------------------------------------------------------------------ */
/* BUILDING BLOCKS                                                     */
/* ------------------------------------------------------------------ */
const gain = (ac, value = 1) => new GainNode(ac, { gain: value });
const pan = (ac, value = 0) => new StereoPannerNode(ac, { pan: value });
const filter = (ac, type, frequency, Q = 1) => new BiquadFilterNode(ac, { type, frequency, Q });

// Connect nodes in a row and return the first one
function chain(...nodes) {
  for (let i = 1; i < nodes.length; i++) nodes[i - 1].connect(nodes[i]);
  return nodes[0];
}

// A gain that jumps to `peak` and dies away (to ~2%) over `decay` seconds
function hit(ac, t, peak, decay, attack = 0.005) {
  const g = gain(ac, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setTargetAtTime(0, t + attack, decay / 4);
  return g;
}

// 3 s of white, brown (deep, rumbly) or crackle (dry leaves: tiny random ticks)
// noise, made once per context and looped
const noiseBuffers = new WeakMap();
function noise(ac, kind) {
  if (!noiseBuffers.has(ac)) noiseBuffers.set(ac, {});
  const cache = noiseBuffers.get(ac);
  if (!cache[kind]) {
    const len = ac.sampleRate * 3;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      if (kind === 'brown') d[i] = (last = (last + 0.02 * white) / 1.02) * 3.5;
      else if (kind === 'crackle') d[i] = white * (last = Math.max(last * 0.995, Math.random() < 0.002 ? Math.random() : 0));
      else d[i] = white;
    }
    // Brown noise wanders; tilt it so the end meets the start and the loop doesn't click
    const drift = d[len - 1] - d[0];
    for (let i = 0; i < len; i++) d[i] -= drift * (i / len);
    cache[kind] = buf;
  }
  return cache[kind];
}
function noiseSource(ac, kind = 'white') {
  return new AudioBufferSourceNode(ac, { buffer: noise(ac, kind), loop: true });
}

// A plucked string (Karplus-Strong): the string's shape circulating in a delay
// line one period long, dulling as it goes round. Rendered once per note and kept
const stringBuffers = new WeakMap();
function pluckedString(ac, note) {
  if (!stringBuffers.has(ac)) stringBuffers.set(ac, new Map());
  const cache = stringBuffers.get(ac);
  const f = mtof(note), rate = ac.sampleRate;
  const period = Math.round(rate / f - 0.5); // averaging two samples adds half a sample to the loop
  if (!cache.has(note)) {
    const len = rate * 2;
    const buf = ac.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    // The pluck: pulled into a triangle a fifth of the way along, with a little noise
    // for the fingertip, and no DC or it would thump
    const pulled = period / 5;
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += d[i] = (i < pulled ? i / pulled : (period - i) / (period - pulled)) + 0.15 * (Math.random() * 2 - 1);
    }
    for (let i = 0; i < period; i++) d[i] -= sum / period;
    // Round and round it goes, ringing for about as long on any note
    const keep = Math.exp(-1 / (0.7 * f));
    for (let i = period; i < len; i++) d[i] = keep * 0.5 * (d[i - period] + (d[i - period - 1] ?? 0));
    // Same strength on every note, and fade out the last quarter so the end can't click
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    for (let i = 0; i < len; i++) d[i] *= Math.min(1, (len - i) / (len / 4)) / peak;
    cache.set(note, buf);
  }
  // The loop's period is rounded to whole samples, so play it back a hair off to land in tune
  return new AudioBufferSourceNode(ac, { buffer: cache.get(note), playbackRate: f * (period + 0.5) / rate });
}

// A room's echo: returns a send to feed (dry sound goes straight to `out` as well)
function reverb(ac, out, seconds, wet) {
  const len = Math.floor(ac.sampleRate * seconds);
  const ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 4;
  }
  return chain(gain(ac, wet), new ConvolverNode(ac, { buffer: ir }), out);
}

/* ------------------------------------------------------------------ */
/* SOUNDSCAPES                                                         */
/* Each one is (context, output, start time) => { sources, tracks }.  */
/* `sources` play continuously until the zone's sound fades out.       */
/* Each track plays an event at `at` and returns seconds to the next.  */
/* The one marked `tune` is the music, which a file in BGM replaces.   */
/* ------------------------------------------------------------------ */

/* City street: traffic rumbling up the block, cars driving past, the odd horn,
   a bus's air brakes, and now and then a siren a few streets over. This was
   K-Town's sound before its cutesy tune; no zone uses it right now. */
function city(ac, out, t0) {
  const verb = reverb(ac, out, 1.5, 0.3); // a little slap off the buildings

  // Traffic rumble, slowly thickening and thinning out
  const rumble = noiseSource(ac, 'brown');
  const swell = gain(ac, 0.5);
  chain(rumble, filter(ac, 'lowpass', 320), swell, out);
  const traffic = new OscillatorNode(ac, { frequency: 0.06 });
  chain(traffic, gain(ac, 0.2), swell.gain);
  // Faint hiss of the city beyond
  const wash = noiseSource(ac);
  chain(wash, filter(ac, 'bandpass', 900, 0.6), gain(ac, 0.025), out);
  rumble.start(t0, rand(0, 3));
  wash.start(t0, rand(0, 3));
  traffic.start(t0);

  // A car drives past: tyre noise and engine sweep across, and drop in pitch as it goes by
  function car(t) {
    const len = rand(2.5, 5), mid = t + len / 2, end = t + len, dir = pick([-1, 1]);
    const level = gain(ac, 0);
    level.gain.setValueAtTime(0.0001, t);
    level.gain.exponentialRampToValueAtTime(rand(0.15, 0.4), mid);
    level.gain.exponentialRampToValueAtTime(0.0001, end);
    const side = pan(ac);
    side.pan.setValueAtTime(-0.9 * dir, t);
    side.pan.linearRampToValueAtTime(0.9 * dir, end);
    chain(level, side, out);

    const tyres = noiseSource(ac);
    const road = filter(ac, 'bandpass', 300, 0.8);
    road.frequency.setValueAtTime(300, t);
    road.frequency.exponentialRampToValueAtTime(rand(700, 1100), mid);
    road.frequency.exponentialRampToValueAtTime(250, end);
    chain(tyres, road, level);

    const f = rand(50, 85);
    const engine = new OscillatorNode(ac, { type: 'sawtooth', frequency: f * 1.06 });
    engine.frequency.setValueAtTime(f * 1.06, mid - 0.3);
    engine.frequency.linearRampToValueAtTime(f * 0.94, mid + 0.3);
    chain(engine, filter(ac, 'lowpass', 250), gain(ac, 0.5), level);

    tyres.start(t, rand(0, 3));
    engine.start(t);
    tyres.stop(end);
    engine.stop(end);
    return rand(1.5, 5);
  }

  // A honk or two, down the block
  function horn(t) {
    const f = rand(330, 440), side = pan(ac, rand(-0.8, 0.8));
    const level = gain(ac, rand(0.025, 0.05));
    chain(level, filter(ac, 'lowpass', 1600), side, out);
    side.connect(verb);
    let at = t;
    for (let honks = Math.random() < 0.4 ? 2 : 1; honks > 0; honks--) {
      const len = rand(0.15, 0.5);
      const env = gain(ac, 0);
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(1, at + 0.02);
      env.gain.setValueAtTime(1, at + len);
      env.gain.linearRampToValueAtTime(0, at + len + 0.05);
      for (const ratio of [1, 1.26]) { // two horns a major third apart
        const o = new OscillatorNode(ac, { type: 'square', frequency: f * ratio });
        chain(o, env);
        o.start(at);
        o.stop(at + len + 0.1);
      }
      env.connect(level);
      at += len + rand(0.1, 0.2);
    }
    return rand(6, 18);
  }

  // A bus lets off its air brakes
  function brakes(t) {
    const air = noiseSource(ac), side = pan(ac, rand(-0.7, 0.7));
    chain(air, filter(ac, 'highpass', 3000), hit(ac, t, rand(0.03, 0.06), 0.9, 0.03), side, out);
    side.connect(verb);
    air.start(t, rand(0, 3));
    air.stop(t + 1.2);
    return rand(12, 30);
  }

  // A siren wails past a few streets over
  function siren(t) {
    const len = rand(8, 12);
    const tone = new OscillatorNode(ac, { type: 'triangle', frequency: 950 });
    const wail = new OscillatorNode(ac, { frequency: rand(0.15, 0.3) });
    chain(wail, gain(ac, 280), tone.frequency);
    const level = gain(ac, 0);
    level.gain.setValueAtTime(0, t);
    level.gain.linearRampToValueAtTime(0.02, t + len * 0.4);
    level.gain.linearRampToValueAtTime(0, t + len);
    const side = pan(ac, rand(-0.6, 0.6));
    chain(tone, filter(ac, 'lowpass', 1800), level, side, out);
    side.connect(verb);
    for (const o of [tone, wail]) { o.start(t); o.stop(t + len); }
    return rand(40, 80);
  }

  return {
    sources: [rumble, wash, traffic],
    tracks: [
      { at: t0 + 0.5, play: car },
      { at: t0 + rand(3, 8), play: horn },
      { at: t0 + rand(6, 15), play: brakes },
      { at: t0 + rand(15, 30), play: siren },
    ],
  };
}

/* Gym: air conditioning and humming lights, music thumping from the
   speakers, weights clanking, the odd dumbbell dropped, and someone on a
   treadmill. It's a big hard room, so everything echoes. */
function gym(ac, out, t0) {
  const verb = reverb(ac, out, 2.2, 0.5);

  const air = noiseSource(ac, 'brown');
  chain(air, filter(ac, 'lowpass', 200), gain(ac, 0.35), out);
  const lights = new OscillatorNode(ac, { type: 'sawtooth', frequency: 60 });
  chain(lights, filter(ac, 'lowpass', 400), gain(ac, 0.01), out);
  const belt = noiseSource(ac);
  const beltLevel = gain(ac, 0); // the treadmill's whir, while someone's running
  chain(belt, filter(ac, 'bandpass', 350, 3), beltLevel, pan(ac, -0.5), out);
  air.start(t0, rand(0, 3));
  belt.start(t0, rand(0, 3));
  lights.start(t0);

  // Music from the speakers: four-on-the-floor kick and an offbeat bass,
  // muffled, as if heard from across the room
  const speakers = filter(ac, 'lowpass', 450);
  const musicLevel = gain(ac, 0.3);
  chain(speakers, musicLevel, out);
  musicLevel.connect(verb);
  const BEAT = 60 / 124;
  const BASSLINE = [45, 45, 41, 43]; // A A F G, a bar each (MIDI)
  let beat = 0;
  function music(t) {
    const kick = new OscillatorNode(ac, { frequency: 150 });
    kick.frequency.setValueAtTime(150, t);
    kick.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    chain(kick, hit(ac, t, 0.9, 0.35, 0.002), speakers);
    kick.start(t);
    kick.stop(t + 0.5);
    const off = t + BEAT / 2;
    const bass = new OscillatorNode(ac, { type: 'sawtooth', frequency: mtof(BASSLINE[Math.floor(beat / 4) % 4]) });
    chain(bass, hit(ac, off, 0.35, 0.22), speakers);
    bass.start(off);
    bass.stop(off + 0.3);
    beat++;
    return BEAT;
  }

  // A weight plate clanks: a few out-of-tune partials, like struck metal
  function clank(t, level) {
    const f = rand(280, 750), side = pan(ac, rand(-0.8, 0.8));
    side.connect(out);
    side.connect(verb);
    for (const [ratio, amp, decay] of [[1, 1, 0.7], [2.76, 0.5, 0.4], [5.4, 0.25, 0.25], [8.93, 0.12, 0.15]]) {
      const o = new OscillatorNode(ac, { frequency: f * ratio });
      const d = decay * rand(0.7, 1.3);
      chain(o, hit(ac, t, level * amp, d, 0.001), side);
      o.start(t);
      o.stop(t + d * 1.3 + 0.1);
    }
  }
  function weights(t) {
    clank(t, rand(0.04, 0.1));
    if (Math.random() < 0.35) clank(t + rand(0.08, 0.25), rand(0.02, 0.05)); // the plates rattle
    return rand(1.5, 6);
  }

  // Someone sets a dumbbell down hard
  function drop(t) {
    const side = pan(ac, rand(-0.6, 0.6));
    side.connect(out);
    side.connect(verb);
    const thud = new OscillatorNode(ac, { frequency: 110 });
    thud.frequency.setValueAtTime(110, t);
    thud.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    chain(thud, hit(ac, t, 0.5, 0.4, 0.002), side);
    const smack = noiseSource(ac);
    chain(smack, filter(ac, 'lowpass', 600), hit(ac, t, 0.3, 0.15, 0.001), side);
    thud.start(t);
    thud.stop(t + 0.6);
    smack.start(t, rand(0, 3));
    smack.stop(t + 0.3);
    clank(t + 0.03, 0.04);
    return rand(12, 30);
  }

  // A runner on the treadmill: a run of footfalls, then a breather
  let steps = 0;
  function treadmill(t) {
    if (steps === 0) {
      steps = Math.floor(rand(60, 140));
      beltLevel.gain.setTargetAtTime(0.02, t, 0.8);
    }
    const side = pan(ac, -0.5);
    side.connect(out);
    const foot = new OscillatorNode(ac, { frequency: 80 });
    chain(foot, hit(ac, t, 0.12, 0.08, 0.002), side);
    foot.start(t);
    foot.stop(t + 0.15);
    if (--steps > 0) return 60 / 165; // 165 steps a minute
    beltLevel.gain.setTargetAtTime(0, t, 0.8);
    return rand(10, 25);
  }

  return {
    sources: [air, belt, lights],
    tracks: [
      { at: t0 + 0.2, play: music, tune: true },
      { at: t0 + rand(0.5, 2), play: weights },
      { at: t0 + rand(8, 15), play: drop },
      { at: t0 + rand(2, 6), play: treadmill },
    ],
  };
}

/* Hawaii: a slow, cozy lo-fi tune. Electric piano chords with a soft
   tremolo, a kalimba melody, round bass and brushed drums, swung.
   16 bars: the melody, then the same chords with a gentle arpeggio. */
const CHORDS = [ // [bass note, piano voicing], MIDI
  [41, [53, 57, 60, 64]], // Fmaj7
  [45, [55, 57, 60, 64]], // Am7
  [46, [58, 62, 65, 69]], // Bbmaj7
  [48, [52, 58, 62, 67]], // C9
  [38, [53, 57, 60, 64]], // Dm9
  [45, [55, 57, 60, 64]], // Am7
  [43, [53, 58, 62, 69]], // Gm9
  [48, [52, 58, 62, 67]], // C9
];
const MELODY = [ // per bar: [8th-note slot, MIDI note]
  [[0, 72], [2, 69], [4, 67], [5, 69], [6, 72]],
  [[0, 76], [4, 74], [6, 72]],
  [[0, 74], [3, 72], [4, 69]],
  [[0, 67], [2, 69], [3, 70], [4, 72]],
  [[0, 77], [3, 76], [4, 74], [6, 72]],
  [[0, 72], [3, 69], [4, 67], [6, 69]],
  [[0, 70], [2, 69], [4, 67], [6, 65]],
  [[0, 67], [4, 64]],
];
const BASS = [[0, 0, 3], [3, 0, 1], [6, 7, 2]]; // [slot, semitones above the root, length in slots]

function cozy(ac, out, t0) {
  out = chain(gain(ac, 0.7), out); // background music sits a little under the street and gym
  const verb = reverb(ac, out, 2, 0.25);
  const warm = filter(ac, 'lowpass', 5000); // round off the top
  warm.connect(out);
  warm.connect(verb);
  const keys = gain(ac, 0.8);
  const tremolo = new OscillatorNode(ac, { frequency: 4 });
  chain(tremolo, gain(ac, 0.15), keys.gain);
  keys.connect(warm);
  tremolo.start(t0);

  // Electric piano: FM, bright as it's struck and mellowing as it rings
  function piano(t, note, len, vel) {
    const f = mtof(note);
    const carrier = new OscillatorNode(ac, { frequency: f });
    const mod = new OscillatorNode(ac, { frequency: f });
    const depth = gain(ac, f * 1.5);
    depth.gain.setValueAtTime(f * 1.5, t);
    depth.gain.setTargetAtTime(f * 0.2, t, 0.25);
    chain(mod, depth, carrier.frequency);
    const amp = gain(ac, 0);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(vel, t + 0.006);
    amp.gain.setTargetAtTime(vel * 0.4, t + 0.006, 0.4);
    amp.gain.setTargetAtTime(0, t + len, 0.15);
    chain(carrier, amp, keys);
    for (const o of [carrier, mod]) { o.start(t); o.stop(t + len + 1); }
  }
  const chord = (t, notes, len, vel) => notes.forEach((n, i) => piano(t + i * 0.012, n, len, vel)); // a slight roll

  function kalimba(t, note, vel) {
    const f = mtof(note), side = pan(ac, rand(-0.3, 0.3));
    side.connect(warm);
    for (const [ratio, amp, decay] of [[1, 1, 1.4], [2, 0.12, 0.4], [5.9, 0.08, 0.06]]) {
      const o = new OscillatorNode(ac, { frequency: f * ratio });
      chain(o, hit(ac, t, vel * amp, decay, 0.003), side);
      o.start(t);
      o.stop(t + decay * 1.3 + 0.05);
    }
  }

  function bass(t, note, len) {
    const o = new OscillatorNode(ac, { type: 'triangle', frequency: mtof(note) });
    const amp = gain(ac, 0);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.35, t + 0.015);
    amp.gain.setTargetAtTime(0.2, t + 0.015, 0.3);
    amp.gain.setTargetAtTime(0, t + len, 0.05);
    chain(o, filter(ac, 'lowpass', 600), amp, warm);
    o.start(t);
    o.stop(t + len + 0.3);
  }

  function kick(t) {
    const o = new OscillatorNode(ac, { frequency: 100 });
    o.frequency.setValueAtTime(100, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    chain(o, hit(ac, t, 0.4, 0.3, 0.002), warm);
    o.start(t);
    o.stop(t + 0.4);
  }
  // Brushed snare and shaker: short bursts of filtered noise
  function brush(t, type, frequency, level, decay) {
    const src = noiseSource(ac);
    chain(src, filter(ac, type, frequency, 0.7), hit(ac, t, level, decay, 0.004), warm);
    src.start(t, rand(0, 3));
    src.stop(t + decay * 1.3);
  }

  const BEAT = 60 / 76, SWING = 0.6; // the first 8th of each beat gets 60% of it
  let step = 0;
  function music(t) {
    const slot = step % 8, bar = Math.floor(step / 8) % 16;
    const [root, voicing] = CHORDS[bar % 8];
    if (slot === 0) chord(t, voicing, BEAT * 2.5, 0.07);
    if (slot === 3) chord(t, voicing, BEAT * 1.4, 0.045);
    for (const [s, up, len] of BASS) if (s === slot) bass(t, root + up, len * BEAT / 2);
    if (slot === 0 || slot === 5) kick(t);
    if (slot === 2 || slot === 6) brush(t, 'bandpass', 2000, 0.06, 0.2);
    brush(t, 'highpass', 7000, slot % 2 ? 0.015 : 0.025, 0.05);
    if (bar < 8) {
      for (const [s, note] of MELODY[bar]) if (s === slot) kalimba(t, note, 0.18);
    } else if (slot % 2 === 0) {
      kalimba(t, voicing[slot / 2] + 12, 0.08);
    }
    step++;
    return BEAT * (slot % 2 ? 1 - SWING : SWING);
  }

  return {
    sources: [tremolo],
    tracks: [{ at: t0 + 0.3, play: music, tune: true }],
  };
}

/* K-Town: a bouncy, sing-song tune in C major, on a skipping swing. A toy
   piano melody over an oom-pah of round bass and pizzicato, with finger snaps.
   32 bars: the tune, an ocarina verse, the tune again with bells on top, then
   a music-box breather. Around it, the street has gone toy-sized: little cars
   going meep-meep, bike bells, a shop door's ding-dong, and birds. */
const CUTE_CHORDS = [ // [bass note, pizzicato voicing], MIDI: 8 bars for the tune, 8 for the verse
  [48, [60, 64, 67]], // C
  [43, [59, 62, 67]], // G
  [45, [60, 64, 69]], // Am
  [41, [60, 65, 69]], // F
  [48, [60, 64, 67]], // C
  [41, [60, 65, 69]], // F
  [43, [59, 62, 67]], // G
  [48, [60, 64, 67]], // C
  [41, [60, 65, 69]], // F
  [43, [59, 62, 67]], // G
  [40, [59, 64, 67]], // Em
  [45, [60, 64, 69]], // Am
  [50, [62, 65, 69]], // Dm
  [43, [59, 62, 67]], // G
  [48, [60, 64, 67]], // C
  [43, [59, 62, 67]], // G
];
const CUTE_TUNE = [ // per bar: [8th-note slot, MIDI note]
  [[0, 79], [2, 76], [3, 81], [4, 79], [6, 76]],
  [[0, 74], [1, 76], [2, 79], [4, 83], [6, 79]],
  [[0, 81], [2, 76], [3, 84], [4, 81], [6, 76]],
  [[0, 77], [1, 79], [2, 81], [4, 84], [6, 81]],
  [[0, 84], [2, 79], [3, 81], [4, 79], [6, 76]],
  [[0, 77], [2, 81], [3, 79], [4, 77], [6, 74]],
  [[0, 74], [1, 76], [2, 77], [3, 79], [4, 83], [6, 86]],
  [[0, 84], [2, 79], [4, 84]],
];
const CUTE_VERSE = [ // per bar: [8th-note slot, MIDI note, length in slots]
  [[0, 81, 2], [2, 84, 2], [4, 81, 2], [6, 77, 2]],
  [[0, 79, 2], [2, 83, 2], [4, 86, 4]],
  [[0, 83, 2], [2, 79, 2], [4, 76, 2], [6, 79, 2]],
  [[0, 81, 4], [4, 84, 4]],
  [[0, 86, 2], [2, 84, 1], [3, 86, 1], [4, 81, 2], [6, 77, 2]],
  [[0, 79, 2], [2, 81, 1], [3, 79, 1], [4, 74, 2], [6, 79, 2]],
  [[0, 76, 1], [1, 79, 1], [2, 84, 6]],
  [[0, 86, 4], [4, 83, 2], [6, 79, 2]],
];

function cutesy(ac, out, t0) {
  out = chain(gain(ac, 1.2), out); // lift the mix to match the other zones' loudness
  const verb = reverb(ac, out, 1.4, 0.2); // a small, sweet room
  const band = gain(ac);
  band.connect(out);
  band.connect(verb);

  // Toy piano: two strings a hair apart for a sweet ring, and a bright plink as it's struck
  function toy(t, note, vel, to = band) {
    const f = mtof(note);
    for (const [ratio, amp, decay] of [[1, 0.7, 1.1], [1.004, 0.4, 0.9], [2, 0.12, 0.35], [3.9, 0.05, 0.15], [6.27, 0.18, 0.08]]) {
      const o = new OscillatorNode(ac, { frequency: f * ratio });
      chain(o, hit(ac, t, vel * amp, decay, 0.002), to);
      o.start(t);
      o.stop(t + decay * 1.3 + 0.05);
    }
  }

  // Ocarina: soft and breathy, scooping up into each note, with a wobble if it's held
  function ocarina(t, note, len, vel) {
    const f = mtof(note);
    const o = new OscillatorNode(ac, { type: 'triangle', frequency: f });
    o.frequency.setValueAtTime(f * 0.96, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    const wobble = new OscillatorNode(ac, { frequency: 5.5 });
    const depth = gain(ac, 0);
    depth.gain.setValueAtTime(0, t + 0.15);
    depth.gain.linearRampToValueAtTime(f * 0.012, t + 0.4);
    chain(wobble, depth, o.frequency);
    const amp = gain(ac, 0);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(vel, t + 0.03);
    amp.gain.setTargetAtTime(0, t + len, 0.03);
    chain(o, amp, band);
    for (const n of [o, wobble]) { n.start(t); n.stop(t + len + 0.2); }
  }

  // Pizzicato: a saw wave that's bright as it's plucked and quickly goes dull and quiet
  function pizz(t, note, vel) {
    const o = new OscillatorNode(ac, { type: 'sawtooth', frequency: mtof(note) });
    const tone = filter(ac, 'lowpass', 2400);
    tone.frequency.setValueAtTime(2400, t);
    tone.frequency.exponentialRampToValueAtTime(500, t + 0.1);
    chain(o, tone, hit(ac, t, vel, 0.28, 0.002), band);
    o.start(t);
    o.stop(t + 0.4);
  }
  const chord = (t, notes, vel) => notes.forEach((n, i) => pizz(t + i * 0.01, n, vel)); // a slight roll

  // Round bass that bounces down into each note
  function bass(t, note) {
    const f = mtof(note);
    const o = new OscillatorNode(ac, { type: 'triangle', frequency: f });
    o.frequency.setValueAtTime(f * 1.25, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    chain(o, hit(ac, t, 0.3, 0.35, 0.004), band);
    o.start(t);
    o.stop(t + 0.6);
  }

  // Finger snaps and shaker: short bursts of filtered noise
  function burst(t, type, frequency, Q, level, decay) {
    const src = noiseSource(ac);
    chain(src, filter(ac, type, frequency, Q), hit(ac, t, level, decay, 0.001), band);
    src.start(t, rand(0, 3));
    src.stop(t + decay * 1.3);
  }

  // A tiny woodblock
  function tok(t) {
    const o = new OscillatorNode(ac, { frequency: 1250 });
    chain(o, hit(ac, t, 0.05, 0.05, 0.001), band);
    o.start(t);
    o.stop(t + 0.1);
  }

  const BEAT = 60 / 112, SWING = 0.62; // the first 8th of each beat gets 62% of it: a skip in its step
  let step = 0;
  function music(t) {
    const slot = step % 8, bar = Math.floor(step / 8) % 32, part = Math.floor(bar / 8);
    const [root, voicing] = CUTE_CHORDS[bar % 16];

    // Oom-pah: bass on beats 1 and 3, pizzicato and a snap on 2 and 4, and a little pickup after
    if (slot === 0) bass(t, root);
    if (slot === 4) bass(t, root + 7);
    if (part < 3) {
      if (slot === 2 || slot === 6) {
        chord(t, voicing, 0.06);
        burst(t, 'bandpass', 2200, 1.5, 0.05, 0.06);
      }
      if (slot === 7) chord(t, voicing, 0.03);
    }
    burst(t, 'highpass', 7000, 0.7, slot % 2 ? 0.018 : 0.01, 0.04);

    // On top: the tune, then the ocarina, the tune with bells and a woodblock, then the music box
    if (part === 1) {
      for (const [s, note, len] of CUTE_VERSE[bar % 8]) if (s === slot) ocarina(t, note, len * BEAT / 2, 0.09);
    } else if (part === 3) {
      toy(t, voicing[[0, 1, 2, 1][slot % 4]] + 12, slot % 2 ? 0.065 : 0.1);
    } else {
      for (const [s, note] of CUTE_TUNE[bar % 8]) {
        if (s !== slot) continue;
        toy(t, note, 0.16);
        if (part === 2) toy(t, note + 12, 0.05);
      }
      if (part === 2 && slot % 4 === 3) tok(t);
    }

    // A sparkle to round off each part
    if (bar % 8 === 7 && slot === 6) {
      [...voicing, voicing[0] + 12].forEach((n, i) => toy(t + i * BEAT / 4, n + 24, 0.05));
    }

    step++;
    return BEAT * (slot % 2 ? 1 - SWING : SWING);
  }

  // Somewhere along the block, for a street sound to come from
  function spot() {
    const side = pan(ac, rand(-0.8, 0.8));
    side.connect(out);
    side.connect(verb);
    return side;
  }

  // A little car goes meep-meep, in tune with the song
  function meep(t) {
    const f = mtof(pick([76, 79, 84])), side = spot();
    for (const at of [t, t + 0.2]) {
      const o = new OscillatorNode(ac, { type: 'square', frequency: f });
      o.frequency.setValueAtTime(f * 0.8, at);
      o.frequency.exponentialRampToValueAtTime(f, at + 0.03);
      chain(o, filter(ac, 'lowpass', 1800), hit(ac, at, 0.09, 0.14, 0.006), side);
      o.start(at);
      o.stop(at + 0.2);
    }
    return rand(14, 28);
  }

  // A bike bell: two quick trills
  function bikeBell(t) {
    const side = spot();
    for (let i = 0; i < 6; i++) {
      const at = t + i * 0.07 + (i > 2 ? 0.15 : 0);
      for (const [f, level] of [[2400, 0.02], [3400, 0.012]]) {
        const o = new OscillatorNode(ac, { frequency: f });
        chain(o, hit(ac, at, level, 0.3, 0.001), side);
        o.start(at);
        o.stop(at + 0.45);
      }
    }
    return rand(20, 40);
  }

  // A shop door's ding-dong
  function doorChime(t) {
    const side = spot();
    toy(t, 76, 0.07, side);
    toy(t + 0.5, 72, 0.07, side);
    return rand(25, 50);
  }

  // A sparrow: a few quick cheeps, up and over
  function birdie(t) {
    const f = rand(3000, 4200), side = spot();
    let at = t;
    for (let cheeps = Math.floor(rand(2, 5)); cheeps > 0; cheeps--) {
      const o = new OscillatorNode(ac, { frequency: f });
      o.frequency.setValueAtTime(f * 0.85, at);
      o.frequency.exponentialRampToValueAtTime(f * 1.15, at + 0.05);
      o.frequency.exponentialRampToValueAtTime(f, at + 0.09);
      chain(o, hit(ac, at, rand(0.012, 0.028), 0.12, 0.012), side);
      o.start(at);
      o.stop(at + 0.16);
      at += rand(0.13, 0.22);
    }
    return rand(5, 14);
  }

  return {
    sources: [],
    tracks: [
      { at: t0 + 0.3, play: music, tune: true },
      { at: t0 + rand(2, 6), play: birdie },
      { at: t0 + rand(6, 14), play: meep },
      { at: t0 + rand(10, 25), play: doorChime },
      { at: t0 + rand(15, 30), play: bikeBell },
    ],
  };
}

/* Farm: a sunny country stroll, with the farm going about its day around it.
   A marimba tune over a boom-chick of upright bass and nylon guitar, on a lazy
   swing in A major. 40 bars: the tune, the tune with the guitar in harmony and
   hooves clip-clopping, a bridge on the guitar over a walking bass, the tune
   with everything, then a gentle break. Around it, a breeze stirs the dry
   leaves, crickets chirp, birds sing, and the farm's animals pipe up. */
const STROLL_CHORDS = { // [bass note, guitar voicing], MIDI
  A: [45, [52, 57, 61, 64]],
  'F#m': [42, [54, 57, 61, 66]],
  D: [50, [54, 57, 62, 66]],
  Bm7: [47, [54, 57, 62, 66]],
  E7: [40, [52, 56, 62, 64]],
  'F#7': [42, [52, 58, 61, 66]],
  B7: [47, [51, 57, 59, 66]],
};
// One chord per half bar: the tune, the bridge's circle of fifths, and the break
const STROLL_TUNE_CHORDS = 'A A F#m F#m Bm7 E7 A A A A D D E7 E7 A A'.split(' ');
const STROLL_BRIDGE_CHORDS = 'F#7 F#7 F#7 F#7 B7 B7 B7 B7 E7 E7 E7 E7 A A E7 E7'.split(' ');
const STROLL_BREAK_CHORDS = 'D D A A Bm7 Bm7 E7 E7 D D A A Bm7 E7 A E7'.split(' ');
const STROLL_TUNE = [ // per bar: [8th-note slot, MIDI note]
  [[1, 76], [2, 78], [4, 81], [5, 78], [6, 76]],
  [[1, 73], [2, 76], [4, 78], [5, 76], [6, 73]],
  [[1, 71], [2, 73], [4, 76], [5, 73], [6, 71]],
  [[0, 69], [2, 71], [3, 73], [4, 69]],
  [[1, 76], [2, 78], [4, 81], [5, 78], [6, 76]],
  [[1, 78], [2, 81], [4, 83], [5, 81], [6, 78]],
  [[1, 80], [2, 83], [4, 80], [5, 78], [6, 76]],
  [[0, 81], [2, 76], [3, 78], [4, 81]],
];
const STROLL_HARMONY = [ // the guitar's line under the tune, the same way
  [[1, 73], [2, 74], [4, 78], [5, 74], [6, 73]],
  [[1, 69], [2, 73], [4, 74], [5, 73], [6, 69]],
  [[1, 68], [2, 69], [4, 71], [5, 68], [6, 68]],
  [[0, 64], [2, 68], [3, 69], [4, 64]],
  [[1, 73], [2, 74], [4, 78], [5, 74], [6, 73]],
  [[1, 74], [2, 78], [4, 78], [5, 78], [6, 74]],
  [[1, 76], [2, 80], [4, 76], [5, 74], [6, 71]],
  [[0, 76], [2, 73], [3, 74], [4, 76]],
];
const STROLL_FILLS = { 3: [[5, 64], [6, 66], [7, 69]], 7: [[5, 69], [6, 68], [7, 66]] }; // little guitar licks between phrases
const STROLL_BRIDGE = [ // the guitar's tune over the bridge
  [[0, 73], [1, 76], [2, 78], [4, 82]],
  [[2, 80], [3, 78], [4, 76], [6, 73]],
  [[0, 66], [1, 69], [2, 71], [4, 75]],
  [[2, 73], [3, 71], [4, 69], [6, 66]],
  [[0, 71], [1, 74], [2, 76], [4, 80]],
  [[2, 78], [3, 76], [4, 74], [6, 71]],
  [[0, 73], [2, 76], [4, 81], [6, 80]],
  [[0, 78], [1, 76], [2, 74], [3, 71], [4, 68], [6, 71], [7, 74]],
];
const STROLL_ANSWERS = { 0: [[6, 85], [7, 82]], 2: [[6, 78], [7, 75]], 4: [[6, 83], [7, 80]] }; // the marimba answers the guitar
const STROLL_WALK = [ // the bridge's walking bass, a note per beat
  [42, 46, 49, 52],
  [54, 52, 49, 48],
  [47, 51, 54, 57],
  [59, 57, 54, 53],
  [52, 50, 47, 44],
  [40, 44, 47, 44],
  [45, 49, 52, 49],
  [47, 44, 40, 44],
];
const STROLL_BREAK = [ // a few soft marimba notes over the break
  [[2, 78], [4, 81]],
  [[0, 81], [2, 76]],
  [[2, 74], [4, 78]],
  [[0, 76], [2, 71]],
  [[2, 78], [4, 81]],
  [[0, 83], [2, 81]],
  [[0, 78], [2, 74], [4, 80], [6, 83]],
  [[0, 81]],
];

function harvest(ac, out, t0) {
  const verb = reverb(ac, out, 1.8, 0.22);
  const mix = gain(ac, 1.45); // lifts the band to match the other zones' loudness
  mix.connect(out);
  chain(mix, filter(ac, 'highpass', 250), filter(ac, 'lowpass', 4000), verb); // a soft echo, with no boom or hiss in it
  const strings = chain(filter(ac, 'highpass', 140), pan(ac, -0.2), mix); // the rhythm guitar, kept out of the bass's way
  const lead = chain(pan(ac, -0.08), mix);
  const mallets = chain(pan(ac, 0.12), mix);
  const hooves = chain(pan(ac, 0.3), mix);

  // Short bursts of filtered noise: the shaker, claps and the marimba's mallet
  function burst(t, type, frequency, Q, level, decay) {
    const src = noiseSource(ac);
    chain(src, filter(ac, type, frequency, Q), hit(ac, t, level, decay, 0.001), mix);
    src.start(t, rand(0, 3));
    src.stop(t + decay * 1.3);
  }

  // Marimba: a round wooden note, with a bright knock two octaves up as the mallet lands
  function marimba(t, note, vel) {
    const f = mtof(note), ring = 1.2 - (note - 60) * 0.02; // the high bars die away sooner
    for (const [ratio, amp, decay] of [[1, 1, ring], [2, 0.05, 0.3], [4, 0.2, 0.15], [10, 0.04, 0.04]]) {
      const o = new OscillatorNode(ac, { frequency: f * ratio });
      chain(o, hit(ac, t, vel * amp, decay, 0.002), mallets);
      o.start(t);
      o.stop(t + decay * 1.3 + 0.05);
    }
    burst(t, 'bandpass', 1500, 1, vel * 0.2, 0.02);
  }

  // Nylon guitar: a plucked string, let ring for `decay` seconds
  function guitar(t, note, vel, decay, to = strings) {
    const string = pluckedString(ac, note);
    chain(string, hit(ac, t, vel, decay, 0.001), to);
    string.start(t);
    string.stop(t + decay * 1.3 + 0.02);
  }
  const strum = (t, notes, vel, decay) => notes.forEach((n, i) => guitar(t + i * 0.007, n, vel, decay));

  // Upright bass: a round pluck that carries through to the next note
  function bass(t, note, vel) {
    const o = new OscillatorNode(ac, { type: 'triangle', frequency: mtof(note) });
    chain(o, filter(ac, 'lowpass', 700), hit(ac, t, vel, 0.95, 0.008), mix);
    o.start(t);
    o.stop(t + 1.3);
  }

  // Hooves on a dirt road: a hollow knock that drops in pitch as it lands
  function hoof(t, f, vel) {
    const o = new OscillatorNode(ac, { frequency: f });
    o.frequency.setValueAtTime(f * 1.25, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.015);
    chain(o, hit(ac, t, vel, 0.06, 0.001), hooves);
    o.start(t);
    o.stop(t + 0.1);
  }

  const FORM = [STROLL_TUNE_CHORDS, STROLL_TUNE_CHORDS, STROLL_BRIDGE_CHORDS, STROLL_TUNE_CHORDS, STROLL_BREAK_CHORDS];
  const chordAt = (bar, half) => STROLL_CHORDS[FORM[Math.floor(bar / 8) % 5][(bar % 8) * 2 + half]];
  const BEAT = 60 / 104, SWING = 0.62; // a lazy swing: the first 8th of each beat gets 62% of it
  let step = 0;
  function music(t) {
    const slot = step % 8, bar = Math.floor(step / 8) % 40, inBar = bar % 8;
    const part = Math.floor(bar / 8); // the tune, with harmony, the bridge, with everything, the break
    const full = part === 1 || part === 3;
    const [root, voicing] = chordAt(bar, slot >> 2);
    const light = slot % 2 ? 0.75 : slot === 4 ? 1.1 : 1; // the off-beats fall lighter, and beat 3 leans in

    // The bass: a walking line in the bridge, otherwise the root and fifth, walking up every other bar
    if (part === 2) {
      if (slot % 2 === 0) bass(t, STROLL_WALK[inBar][slot / 2], 0.18);
    } else if (slot === 0) {
      bass(t, root, 0.2);
    } else if (slot === 4) {
      const fifth = root + 7 > 52 ? root - 5 : root + 7;
      bass(t, root === chordAt(bar, 0)[0] ? fifth : root, part === 4 ? 0.13 : 0.17);
    } else if (slot === 7 && inBar % 2 === 1 && part !== 4) {
      bass(t, chordAt(bar + 1, 0)[0] - 1, 0.11);
    }

    // The rhythm guitar: a soft chord left ringing on beats 1 and 3, a strum on beats 2 and 4,
    // and a light up-stroke before the next bar. The break picks through the chord instead
    if (part !== 4 && slot % 4 === 0) strum(t, voicing, 0.024, 1.3);
    if (part === 4) {
      guitar(t, voicing[[1, 2, 3, 2][slot % 4]], 0.07 * light, 1.1);
    } else if (slot === 2 || slot === 6) {
      strum(t, voicing, part === 2 ? 0.05 : 0.07, 0.36);
    } else if (slot === 7 && part !== 2) {
      strum(t, [...voicing].reverse(), 0.04, 0.18);
    }

    // Shaker throughout, then hooves and claps when the whole band's playing
    burst(t, 'highpass', 6500, 0.7, (slot % 2 ? 0.014 : 0.008) * (part === 4 ? 0.6 : 1), 0.04);
    if (full) hoof(t, slot % 2 ? 370 : 494, slot % 2 ? 0.022 : 0.03);
    if (part === 3 && (slot === 2 || slot === 6)) {
      burst(t, 'bandpass', 1400, 0.9, 0.04, 0.1);
      burst(t + 0.012, 'bandpass', 1400, 0.9, 0.05, 0.1);
    }

    // On top: the marimba's tune, or in the bridge the guitar's, with the marimba answering
    if (part === 2) {
      for (const [s, note] of STROLL_BRIDGE[inBar]) if (s === slot) guitar(t, note, 0.2 * light, 1.3, lead);
      for (const [s, note] of STROLL_ANSWERS[inBar] ?? []) if (s === slot) marimba(t, note, 0.1 * light);
    } else {
      for (const [s, note] of (part === 4 ? STROLL_BREAK : STROLL_TUNE)[inBar]) {
        if (s !== slot) continue;
        marimba(t, note, (part === 4 ? 0.12 : 0.18) * light);
        if (part === 3) marimba(t, note + 12, 0.045 * light);
      }
    }

    // The guitar joins in harmony under the tune, with licks between the phrases
    if (full) {
      for (const [s, note] of STROLL_HARMONY[inBar]) if (s === slot) guitar(t, note, 0.1 * light, 0.8, lead);
      for (const [s, note] of STROLL_FILLS[inBar] ?? []) if (s === slot) guitar(t, note, 0.12 * light, 0.8, lead);
    }

    step++;
    return BEAT * (slot % 2 ? 1 - SWING : SWING);
  }

  // The breeze: soft noise, wide across the stereo, whose pitch and level drift
  // at rates that never quite line up
  const swell = gain(ac, 0.06);
  swell.connect(out);
  const drift = new OscillatorNode(ac, { frequency: 0.07 });
  const driftBy = gain(ac, 180);
  drift.connect(driftBy);
  const breeze = [-0.7, 0.7].map((side) => {
    const air = noiseSource(ac), tone = filter(ac, 'bandpass', 520, 0.5);
    chain(air, tone, pan(ac, side), swell);
    driftBy.connect(tone.frequency);
    air.start(t0, rand(0, 3));
    return air;
  });
  const sway = new OscillatorNode(ac, { frequency: 0.113 });
  chain(sway, gain(ac, 0.025), swell.gain);
  drift.start(t0);
  sway.start(t0);

  // Somewhere around the farm, for a sound to come from
  function spot() {
    const side = pan(ac, rand(-0.8, 0.8));
    side.connect(out);
    side.connect(verb);
    return side;
  }

  // The breeze picks up for a moment and stirs the dry leaves
  function gust(t) {
    const len = rand(3, 6), side = spot();
    swell.gain.setTargetAtTime(0.1, t, len * 0.25);
    swell.gain.setTargetAtTime(0.06, t + len * 0.5, len * 0.25);
    const level = gain(ac, 0);
    level.gain.setValueAtTime(0, t);
    level.gain.linearRampToValueAtTime(rand(0.045, 0.09), t + len * 0.4);
    level.gain.linearRampToValueAtTime(0, t + len);
    const leaves = noiseSource(ac, 'crackle');
    chain(leaves, filter(ac, 'highpass', 1800), level, side);
    leaves.start(t, rand(0, 3));
    leaves.stop(t + len);
    return rand(8, 20);
  }

  // A cricket in the grass: a few chirps of three quick pulses, then quiet for a while
  const grass = spot();
  let chirps = 0;
  function cricket(t) {
    if (chirps === 0) chirps = Math.floor(rand(10, 24));
    const o = new OscillatorNode(ac, { frequency: 4600 });
    for (let i = 0; i < 3; i++) chain(o, hit(ac, t + i * 0.035, 0.03, 0.03, 0.004), grass);
    o.start(t);
    o.stop(t + 0.2);
    return --chirps > 0 ? 0.55 : rand(8, 25);
  }

  // One pure whistled note, sliding from one pitch to another
  function whistle(t, from, to, len, level, side) {
    const o = new OscillatorNode(ac, { frequency: from });
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + len);
    const amp = gain(ac, 0);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(level, t + len * 0.25);
    amp.gain.setValueAtTime(level, t + len * 0.6);
    amp.gain.linearRampToValueAtTime(0, t + len);
    chain(o, amp, side);
    o.start(t);
    o.stop(t + len);
  }

  // A chickadee's two clear notes: fee-bee
  function chickadee(t) {
    const side = spot(), level = rand(0.015, 0.026);
    whistle(t, 3600, 3520, 0.42, level, side);
    whistle(t + 0.5, 3100, 3040, 0.5, level * 0.8, side);
    return rand(20, 45);
  }

  // A little warbler: a quick, tumbling run of notes
  function warbler(t) {
    const side = spot(), base = rand(3000, 4200), level = rand(0.013, 0.025);
    let at = t;
    for (let notes = Math.floor(rand(4, 9)); notes > 0; notes--) {
      const f = base * pick([1, 1.12, 1.25, 1.5]);
      whistle(at, f, f * rand(0.9, 1.15), rand(0.06, 0.12), level, side);
      at += rand(0.09, 0.16);
    }
    return rand(14, 35);
  }

  // The chick: a few tiny peeps
  function chick(t) {
    const side = spot(), level = rand(0.017, 0.03);
    let at = t;
    for (let peeps = Math.floor(rand(2, 6)); peeps > 0; peeps--) {
      whistle(at, 3000, 2300, 0.11, level, side);
      at += rand(0.15, 0.24);
    }
    return rand(18, 40);
  }

  // An animal's voice: a buzz that follows a pitch contour, shaped by its throat
  // (each of `throat` is a band of the buzz to keep: [frequency, Q, level])
  function call(t, len, pitches, throat, level, side) {
    const o = new OscillatorNode(ac, { type: 'sawtooth', frequency: pitches[0] });
    o.frequency.setValueAtTime(pitches[0], t);
    pitches.forEach((f, i) => { if (i) o.frequency.linearRampToValueAtTime(f, t + len * i / (pitches.length - 1)); });
    const amp = gain(ac, 0);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(level, t + len * 0.25);
    amp.gain.setValueAtTime(level, t + len * 0.65);
    amp.gain.linearRampToValueAtTime(0, t + len);
    for (const [f, Q, g] of throat) chain(o, filter(ac, 'bandpass', f, Q), gain(ac, g), amp);
    amp.connect(side);
    o.start(t);
    o.stop(t + len);
  }
  function moo(t) {
    call(t, rand(1.3, 1.8), [92, 122, 128, 118, 96], [[280, 2.5, 1], [650, 4, 0.35]], 0.14, spot());
    return rand(35, 70);
  }
  function oink(t) {
    const side = spot();
    for (const at of [t, t + 0.24]) call(at, 0.16, [210, 270, 200], [[800, 3, 1], [1700, 4, 0.4]], 0.22, side);
    return rand(30, 60);
  }
  function meow(t) {
    call(t, 0.75, [470, 700, 780, 560, 430], [[1000, 2, 1], [2400, 3, 0.4]], 0.09, spot());
    return rand(45, 90);
  }
  function arf(t) {
    const side = spot();
    for (const at of [t, t + 0.22]) call(at, 0.12, [430, 330], [[850, 1.5, 1], [1900, 2, 0.4]], 0.15, side);
    return rand(50, 100);
  }

  return {
    sources: [...breeze, drift, sway],
    tracks: [
      { at: t0 + 0.3, play: music, tune: true },
      { at: t0 + rand(5, 12), play: gust },
      { at: t0 + rand(4, 15), play: cricket },
      { at: t0 + rand(3, 8), play: warbler },
      { at: t0 + rand(12, 25), play: chickadee },
      { at: t0 + rand(12, 25), play: chick },
      { at: t0 + rand(8, 18), play: moo },
      { at: t0 + rand(20, 40), play: oink },
      { at: t0 + rand(30, 60), play: meow },
      { at: t0 + rand(40, 80), play: arf },
    ],
  };
}

/* Celebration: a bouncy party tune in G major, on a light swing. A music-box
   melody over a boom-chick of round bass and ukulele, with a soft kick. 40 bars:
   the tune, the tune with a marimba in harmony and claps, a bridge on the guitar
   with the marimba answering, the tune with everything, then a music-box breather.
   Around it, the guests squeak happily. During the finale (reading the party's
   sign) it stays on "everything", with bells running over the top. */
const PARTY_CHORDS = { // [bass note, ukulele voicing], MIDI
  G: [43, [62, 67, 71, 74]],
  Em: [40, [59, 64, 67, 71]],
  C: [48, [60, 64, 67, 72]],
  D: [50, [62, 66, 69, 74]],
  Am: [45, [60, 64, 69, 72]],
};
// One chord per half bar
const PARTY_TUNE_CHORDS = 'G G Em Em C C D D G G Em Em Am D G G'.split(' ');
const PARTY_BRIDGE_CHORDS = 'C C G G Am Am Em Em C C G G Am Am D D'.split(' ');
const PARTY_TUNE = [ // per bar: [8th-note slot, MIDI note]
  [[0, 74], [2, 79], [3, 81], [4, 83], [6, 79]],
  [[0, 83], [2, 79], [4, 76], [6, 79]],
  [[0, 84], [2, 79], [3, 81], [4, 84], [6, 88]],
  [[0, 86], [2, 84], [3, 83], [4, 81], [6, 78]],
  [[0, 74], [2, 79], [3, 81], [4, 83], [6, 86]],
  [[0, 88], [2, 86], [3, 83], [4, 79], [6, 83]],
  [[0, 84], [1, 83], [2, 81], [3, 76], [4, 86], [5, 84], [6, 81], [7, 78]],
  [[0, 79], [2, 83], [4, 91]],
];
const PARTY_BRIDGE = [ // the guitar's tune over the bridge
  [[0, 76], [2, 79], [4, 84], [6, 83]],
  [[0, 83], [2, 79], [4, 74]],
  [[0, 76], [2, 81], [4, 84], [6, 83]],
  [[0, 79], [2, 76], [4, 71]],
  [[0, 72], [2, 76], [4, 79], [6, 84]],
  [[0, 83], [2, 86], [4, 83], [6, 79]],
  [[0, 81], [2, 84], [4, 88], [6, 86]],
  [[0, 86], [2, 81], [4, 78], [6, 81]],
];
const PARTY_ANSWERS = { 1: [[6, 86], [7, 83]], 3: [[6, 83], [7, 79]], 5: [[7, 91]] }; // the marimba answers the guitar
const G_MAJOR = [0, 2, 4, 5, 7, 9, 11]; // semitones above G
// The note a third below in G major, for the marimba's harmony
function thirdBelow(note) {
  const above = (note - 7 + 120) % 12;
  const degree = G_MAJOR.indexOf(above);
  return note - ((above - G_MAJOR[(degree + 5) % 7] + 12) % 12);
}

function party(ac, out, t0) {
  const verb = reverb(ac, out, 1.6, 0.22); // a garden with a little room in it
  const band = gain(ac, 1.3); // lifts the band to match the other zones' loudness
  band.connect(out);
  band.connect(verb);
  const strings = chain(filter(ac, 'highpass', 160), pan(ac, -0.22), band); // the ukulele, kept out of the bass's way
  const lead = chain(pan(ac, -0.05), band);
  const mallets = chain(pan(ac, 0.18), band);
  let celebrating = false; // the finale

  // Music box: a sweet ring and a bright plink as it's struck
  function bell(t, note, vel, to = lead) {
    const f = mtof(note);
    for (const [ratio, amp, decay] of [[1, 0.7, 1.1], [1.004, 0.4, 0.9], [2, 0.12, 0.35], [3.9, 0.05, 0.15], [6.27, 0.18, 0.08]]) {
      const o = new OscillatorNode(ac, { frequency: f * ratio });
      chain(o, hit(ac, t, vel * amp, decay, 0.002), to);
      o.start(t);
      o.stop(t + decay * 1.3 + 0.05);
    }
  }

  // Marimba: a round wooden note
  function marimba(t, note, vel) {
    const f = mtof(note), ring = Math.max(0.5, 1.2 - (note - 60) * 0.02); // the high bars die away sooner
    for (const [ratio, amp, decay] of [[1, 1, ring], [4, 0.2, 0.15], [10, 0.04, 0.04]]) {
      const o = new OscillatorNode(ac, { frequency: f * ratio });
      chain(o, hit(ac, t, vel * amp, decay, 0.002), mallets);
      o.start(t);
      o.stop(t + decay * 1.3 + 0.05);
    }
  }

  // Ukulele and guitar: a plucked string, let ring for `decay` seconds
  function pluck(t, note, vel, decay, to = strings) {
    const string = pluckedString(ac, note);
    chain(string, hit(ac, t, vel, decay, 0.001), to);
    string.start(t);
    string.stop(t + decay * 1.3 + 0.02);
  }
  const strum = (t, notes, vel, decay) => notes.forEach((n, i) => pluck(t + i * 0.008, n, vel, decay));

  // Round bass that bounces down into each note
  function bass(t, note, vel) {
    const f = mtof(note);
    const o = new OscillatorNode(ac, { type: 'triangle', frequency: f });
    o.frequency.setValueAtTime(f * 1.25, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    chain(o, hit(ac, t, vel, 0.4, 0.004), band);
    o.start(t);
    o.stop(t + 0.65);
  }

  function kick(t, vel) {
    const o = new OscillatorNode(ac, { frequency: 120 });
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.1);
    chain(o, hit(ac, t, vel, 0.28, 0.002), band);
    o.start(t);
    o.stop(t + 0.4);
  }

  // Claps, shaker and tambourine: short bursts of filtered noise
  function burst(t, type, frequency, Q, level, decay) {
    const src = noiseSource(ac);
    chain(src, filter(ac, type, frequency, Q), hit(ac, t, level, decay, 0.001), band);
    src.start(t, rand(0, 3));
    src.stop(t + decay * 1.3);
  }
  function clap(t, level) {
    burst(t, 'bandpass', 1400, 0.9, level * 0.8, 0.09);
    burst(t + 0.012, 'bandpass', 1400, 0.9, level, 0.1);
  }

  const FORM = [PARTY_TUNE_CHORDS, PARTY_TUNE_CHORDS, PARTY_BRIDGE_CHORDS, PARTY_TUNE_CHORDS, PARTY_TUNE_CHORDS];
  const BEAT = 60 / 126, SWING = 0.58; // the first 8th of each beat gets 58% of it: a light skip
  let step = 0;
  function music(t) {
    const slot = step % 8, bar = Math.floor(step / 8) % 40, inBar = bar % 8;
    const part = celebrating ? 3 : Math.floor(bar / 8); // the tune, with harmony, the bridge, with everything, the breather
    const [root, voicing] = PARTY_CHORDS[FORM[part][inBar * 2 + (slot >> 2)]];
    const breather = part === 4;

    // Boom-chick: bass on beats 1 and 3, ukulele on 2 and 4, and a soft kick under it
    if (slot === 0) bass(t, root, breather ? 0.18 : 0.27);
    if (slot === 4) bass(t, root + 7 > 50 ? root - 5 : root + 7, breather ? 0.14 : 0.23);
    if (!breather) {
      if (slot === 0 || slot === 4) kick(t, 0.2);
      if (slot === 2 || slot === 6) strum(t, voicing, 0.085, 0.34);
      if (slot === 7) strum(t, [...voicing].reverse(), 0.04, 0.16);
      if (part !== 0 && part !== 2 && (slot === 2 || slot === 6)) clap(t, 0.05);
    }
    burst(t, 'highpass', 7000, 0.7, (slot % 2 ? 0.016 : 0.009) * (breather ? 0.5 : 1), 0.04);
    if (part === 3 && slot % 2) burst(t, 'highpass', 8500, 1.2, 0.012, 0.09); // tambourine

    // On top: the tune, the guitar's bridge, or the music box picking through the chord
    if (part === 2) {
      for (const [s, note] of PARTY_BRIDGE[inBar]) if (s === slot) pluck(t, note, 0.22, 1.2, lead);
      for (const [s, note] of PARTY_ANSWERS[inBar] ?? []) if (s === slot) marimba(t, note, 0.1);
    } else if (breather) {
      bell(t, voicing[[0, 1, 2, 3, 2, 1, 2, 1][slot]] + 12, slot % 2 ? 0.055 : 0.085);
    } else {
      for (const [s, note] of PARTY_TUNE[inBar]) {
        if (s !== slot) continue;
        bell(t, note, 0.17);
        if (part !== 0) marimba(t, thirdBelow(note), 0.08);
        if (part === 3) bell(t, note + 12, 0.05);
      }
    }

    // The finale: bells running over the top
    if (celebrating) bell(t, voicing[[0, 2, 1, 3][slot % 4]] + 24, slot % 2 ? 0.025 : 0.04, mallets);

    // A sparkle to round off each part
    if (inBar === 7 && slot === 6) {
      [...voicing.slice(0, 3), voicing[0] + 12].forEach((n, i) => bell(t + i * BEAT / 4, n + 24, 0.05));
    }

    step++;
    return BEAT * (slot % 2 ? 1 - SWING : SWING);
  }

  // A guest somewhere on the lawn squeaks a couple of happy notes
  function guests(t) {
    const side = pan(ac, rand(-0.8, 0.8)), pitch = rand(0.8, 1.5);
    side.connect(out);
    side.connect(verb);
    let at = t;
    for (let squeaks = Math.floor(rand(1, 4)); squeaks > 0; squeaks--) {
      const from = 650 * pitch * rand(0.9, 1.1), to = from * rand(1.3, 1.6);
      const o = new OscillatorNode(ac, { type: 'triangle', frequency: from });
      o.frequency.setValueAtTime(from, at);
      o.frequency.exponentialRampToValueAtTime(to, at + 0.09);
      chain(o, hit(ac, at, rand(0.012, 0.024), 0.13, 0.008), side);
      o.start(at);
      o.stop(at + 0.2);
      at += rand(0.12, 0.2);
    }
    return celebrating ? rand(0.8, 2.5) : rand(5, 13);
  }

  return {
    sources: [],
    tracks: [
      { at: t0 + 0.3, play: music, tune: true },
      { at: t0 + rand(3, 7), play: guests },
    ],
    finale(on) { celebrating = on; },
  };
}

export const SOUNDSCAPES = { city, gym, cozy, cutesy, harvest, party };

/* ------------------------------------------------------------------ */
/* ONE-SHOT SOUNDS                                                     */
/* Footsteps, jumps, portals and so on, played straight away with      */
/* sfx(name, ...). All soft and toy-sized, to sit under the music.     */
/* ------------------------------------------------------------------ */
// A short note sliding from one pitch to another
function blip(ac, out, t, from, to, len, level, type = 'sine') {
  const o = new OscillatorNode(ac, { type, frequency: from });
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + len);
  chain(o, hit(ac, t, level, len, 0.003), out);
  o.start(t);
  o.stop(t + len * 1.4 + 0.05);
}
// A short burst of filtered noise
function puff(ac, out, t, type, frequency, Q, level, decay, kind = 'white') {
  const src = noiseSource(ac, kind);
  chain(src, filter(ac, type, frequency, Q), hit(ac, t, level, decay, 0.002), out);
  src.start(t, rand(0, 3));
  src.stop(t + decay * 1.4 + 0.02);
}
// A little bell
function ding(ac, out, t, note, level, decay = 0.9) {
  const f = mtof(note);
  for (const [ratio, amp, d] of [[1, 0.8, decay], [2, 0.14, decay * 0.35], [6.27, 0.14, 0.08]]) {
    const o = new OscillatorNode(ac, { frequency: f * ratio });
    chain(o, hit(ac, t, level * amp, d, 0.002), out);
    o.start(t);
    o.stop(t + d * 1.3 + 0.05);
  }
}

const SURFACES = {
  pavement(ac, out, t, v) {
    puff(ac, out, t, 'bandpass', 2200 * v, 1.2, 0.05, 0.03);
    blip(ac, out, t, 240 * v, 170 * v, 0.04, 0.06, 'triangle');
  },
  stone(ac, out, t, v) {
    puff(ac, out, t, 'bandpass', 2800 * v, 1.2, 0.05, 0.03);
    blip(ac, out, t, 320 * v, 230 * v, 0.035, 0.05, 'triangle');
  },
  rubber(ac, out, t, v) {
    blip(ac, out, t, 130 * v, 80 * v, 0.06, 0.12);
    puff(ac, out, t, 'lowpass', 500, 0.7, 0.04, 0.04);
  },
  sand(ac, out, t, v) {
    puff(ac, out, t, 'bandpass', 3200 * v, 0.7, 0.1, 0.09);
    puff(ac, out, t, 'lowpass', 400, 0.7, 0.08, 0.05);
  },
  grass(ac, out, t, v) {
    puff(ac, out, t, 'highpass', 3500 * v, 0.7, 0.035, 0.06);
    puff(ac, out, t, 'highpass', 2000, 0.7, 0.14, 0.08, 'crackle');
  },
  dirt(ac, out, t, v) {
    puff(ac, out, t, 'bandpass', 900 * v, 1, 0.06, 0.05);
    blip(ac, out, t, 150 * v, 100 * v, 0.03, 0.06);
  },
  // The dance floor plays a soft note with every step, always in key with the party's tune
  tiles(ac, out, t) {
    ding(ac, out, t, pick([67, 69, 71, 74, 76, 79, 81, 83]), 0.05, 0.5);
    puff(ac, out, t, 'bandpass', 2400, 1.2, 0.02, 0.02);
  },
  // The raft out in the lagoon: a hollow little knock on the planks
  wood(ac, out, t, v) {
    blip(ac, out, t, 420 * v, 300 * v, 0.05, 0.07, 'triangle');
    puff(ac, out, t, 'bandpass', 1600 * v, 1.4, 0.03, 0.03);
  },
  // Splashing along in the shallows
  water(ac, out, t, v) {
    puff(ac, out, t, 'bandpass', 1500 * v, 0.9, 0.05, 0.08);
    blip(ac, out, t + 0.01, 420 * v, 760 * v, 0.05, 0.025);
  },
};

export const SFX = {
  step: (ac, out, t, surface) => SURFACES[surface]?.(ac, out, t, rand(0.92, 1.08)),
  jump(ac, out, t) {
    blip(ac, out, t, 320, 720, 0.16, 0.08, 'triangle');
    blip(ac, out, t, 640, 1440, 0.12, 0.02);
  },
  land(ac, out, t) {
    blip(ac, out, t, 150, 85, 0.1, 0.14);
    puff(ac, out, t, 'lowpass', 700, 0.7, 0.05, 0.06);
  },
  // A rising whoosh and a run of bells up into the next zone
  portal(ac, out, t) {
    const air = noiseSource(ac), tone = filter(ac, 'bandpass', 300, 1.2);
    tone.frequency.setValueAtTime(300, t);
    tone.frequency.exponentialRampToValueAtTime(3200, t + 0.5);
    const level = gain(ac, 0);
    level.gain.setValueAtTime(0, t);
    level.gain.linearRampToValueAtTime(0.09, t + 0.3);
    level.gain.linearRampToValueAtTime(0, t + 0.7);
    chain(air, tone, level, out);
    air.start(t, rand(0, 3));
    air.stop(t + 0.75);
    [72, 76, 79, 84, 88].forEach((n, i) => ding(ac, out, t + i * 0.08, n, 0.06, 0.6));
  },
  letterOpen(ac, out, t) {
    puff(ac, out, t, 'highpass', 2500, 0.7, 0.035, 0.14);
    puff(ac, out, t + 0.08, 'highpass', 3400, 0.7, 0.025, 0.1);
    ding(ac, out, t + 0.1, 79, 0.07);
    ding(ac, out, t + 0.22, 84, 0.07, 1.2);
  },
  letterClose(ac, out, t) {
    puff(ac, out, t, 'highpass', 2800, 0.7, 0.03, 0.1);
    ding(ac, out, t + 0.03, 76, 0.04, 0.5);
  },
  // A character says hello. Bigger characters have lower voices
  greet(ac, out, t, pitch = 1) {
    blip(ac, out, t, 620 * pitch, 980 * pitch, 0.09, 0.05, 'triangle');
    blip(ac, out, t + 0.09, 980 * pitch, 760 * pitch, 0.08, 0.035, 'triangle');
  },
  // The title screen: a run of bells up two octaves
  start(ac, out, t) {
    [67, 71, 74, 79, 83, 86, 91].forEach((n, i) => ding(ac, out, t + i * 0.075, n, 0.08, 1.1));
  },
  // A firework's soft thump and crackle, somewhere off to one side
  boom(ac, out, t, level = 1, side = 0) {
    const place = pan(ac, side);
    place.connect(out);
    blip(ac, place, t, 110, 50, 0.3, 0.16 * level);
    puff(ac, place, t + 0.06, 'highpass', 2500, 0.7, 0.2 * level, 0.8, 'crackle');
  },
  // A confetti popper
  pop(ac, out, t) {
    puff(ac, out, t, 'bandpass', 1100, 0.9, 0.12, 0.06);
    blip(ac, out, t, 500, 900, 0.06, 0.05, 'triangle');
    puff(ac, out, t + 0.03, 'highpass', 5000, 0.7, 0.03, 0.4);
  },
  // Someone kicks an exercise ball
  bonk(ac, out, t) {
    blip(ac, out, t, 200, 120, 0.12, 0.09, 'triangle');
    blip(ac, out, t, 420, 620, 0.05, 0.02);
  },
  // Something being thrown, going past
  whoosh(ac, out, t) {
    puff(ac, out, t, 'bandpass', 1000, 1.1, 0.06, 0.24);
    blip(ac, out, t, 280, 620, 0.2, 0.018, 'triangle');
  },
  // A dumbbell lands: a little metal plink on a thud
  clunk(ac, out, t, level = 1) {
    blip(ac, out, t, 170, 90, 0.09, 0.09 * level);
    ding(ac, out, t, 74, 0.03 * level, 0.16);
  },
  // A yoga ball bounces
  boing(ac, out, t, level = 1) {
    blip(ac, out, t, 150, 330, 0.14, 0.07 * level, 'triangle');
    blip(ac, out, t + 0.03, 300, 190, 0.1, 0.03 * level);
  },
  // You got hit
  oof(ac, out, t) {
    blip(ac, out, t, 560, 210, 0.17, 0.08, 'triangle');
    ding(ac, out, t + 0.02, 86, 0.03, 0.25);
  },
  // Reaching a checkpoint: a few bells going up
  checkpoint(ac, out, t) {
    [72, 76, 79, 84].forEach((n, i) => ding(ac, out, t + i * 0.08, n, 0.07, 0.8));
  },
  // Standing next to something you can read
  ting: (ac, out, t) => ding(ac, out, t, 88, 0.03, 0.4),
  // Into (or out of) the water. `size` 1 is a hop; a jump in from up high is about 2.
  // A slap of water, the spray, and a few bubbles bloop-blooping up
  splash(ac, out, t, size = 1) {
    const s = Math.min(size, 2.5);
    puff(ac, out, t, 'bandpass', 1300 - 200 * s, 0.8, 0.05 + 0.035 * s, 0.12 + 0.08 * s);
    puff(ac, out, t + 0.015, 'highpass', 3600, 0.7, 0.025 + 0.015 * s, 0.22 + 0.12 * s);
    if (s > 1.3) blip(ac, out, t, 190, 85, 0.16, 0.06 * s); // a big one lands with a plunge
    const bubbles = 2 + Math.round(s * 1.5);
    for (let i = 0; i < bubbles; i++) {
      const at = t + 0.05 + i * rand(0.035, 0.07), from = rand(330, 480) * (1.15 - 0.1 * s);
      blip(ac, out, at, from, from * rand(2, 2.6), rand(0.04, 0.06), 0.03 + 0.008 * s);
    }
  },
  // A hand dipping in as you paddle along: a soft little plip
  paddle(ac, out, t, pitch = 1) {
    puff(ac, out, t, 'bandpass', 1700 * pitch, 1, 0.05, 0.06);
    blip(ac, out, t + 0.008, 520 * pitch, 980 * pitch, 0.045, 0.04);
  },
  // A fish hopping out of the water and back in, somewhere off near you
  plop(ac, out, t, level = 1) {
    blip(ac, out, t, 700, 1500, 0.05, 0.03 * level);
    puff(ac, out, t, 'bandpass', 2400, 1.1, 0.02 * level, 0.05);
  },
  // You've bumped the rubber duck
  squeak(ac, out, t) {
    const o = new OscillatorNode(ac, { type: 'triangle', frequency: 950 });
    o.frequency.setValueAtTime(950, t);
    o.frequency.linearRampToValueAtTime(1550, t + 0.05);
    o.frequency.linearRampToValueAtTime(1250, t + 0.17);
    const wobble = new OscillatorNode(ac, { frequency: 32 }); // the rubber's flutter
    chain(wobble, gain(ac, 60), o.frequency);
    chain(o, filter(ac, 'bandpass', 1400, 1.2), hit(ac, t, 0.1, 0.22, 0.012), out);
    for (const n of [o, wobble]) { n.start(t); n.stop(t + 0.32); }
  },
};

/* ------------------------------------------------------------------ */
/* PLAYBACK                                                            */
/* ------------------------------------------------------------------ */
/* A soundscape with a file here plays it instead of its own `tune`, and keeps the
   rest of its sounds. `end` is where the song's sound stops, in seconds: the files
   trail off into silence (zone3.mp3 has 37 seconds of it), which the loop skips.
   `start` is where it begins, and where it loops back to, if that's not the top. */
const BGM = {
  cutesy:  { url: new URL('../assets/bgm/zone1.mp3', import.meta.url).href, end: 125.6 },
  gym:     { url: new URL('../assets/bgm/zone2.mp3', import.meta.url).href, start: 35, end: 210.9 },
  cozy:    { url: new URL('../assets/bgm/zone3.mp3', import.meta.url).href, end: 184 },
  harvest: { url: new URL('../assets/bgm/zone4.mp3', import.meta.url).href, end: 255.2 },
};
// They start loading with the page, so a song is ready to go when its fade starts
for (const song of Object.values(BGM)) {
  song.audio = new Audio(song.url);
  song.audio.loop = true; // in case the timer misses `end`
  song.audio.currentTime = song.start ?? 0;
}

let ac = null;      // the AudioContext, made on the first key press or click
let master = null;
let effects = null; // where one-shot sounds go
let playing = null; // { name, level, fade, sources, tracks }
let wanted = null;  // the current zone's soundscape, or null for quiet
let muted = false;
let finale = false; // the party's finale is going
const gone = new Set(); // the soundscapes whose songs have faded away for good

function start() {
  ac = new AudioContext();
  master = gain(ac, muted ? 0 : VOLUME);
  // A limiter, so a horn on top of a passing car can't clip
  const limiter = new DynamicsCompressorNode(ac, { threshold: -10, knee: 6, ratio: 12, attack: 0.003, release: 0.25 });
  chain(master, limiter, ac.destination);
  effects = gain(ac, SFX_VOLUME);
  effects.connect(master);
  for (const song of Object.values(BGM)) {
    const level = gain(ac, 0);
    chain(new MediaElementAudioSourceNode(ac, { mediaElement: song.audio }), level, master);
    song.fade = fader(level.gain, BGM_VOLUME);
  }
  setInterval(schedule, 50);
  crossfadeTo(wanted);
}

// Fades a gain between silent and `peak` on an equal-power curve, so the crossfade
// doesn't dip in the middle. A new fade picks up from wherever the last one had got to
function fader(param, peak) {
  let from = 0, to = 0, at = 0, length = CROSSFADE;
  const position = (t) => from + (to - from) * Math.min(1, (t - at) / length);
  return {
    go(target, seconds = CROSSFADE) {
      const t = ac.currentTime;
      from = position(t);
      to = target;
      at = t;
      length = seconds;
      const curve = Float32Array.from({ length: 64 }, (_, i) => peak * Math.sin((from + (to - from) * i / 63) * Math.PI / 2));
      param.cancelScheduledValues(t);
      param.setValueCurveAtTime(curve, t, seconds);
    },
    silent: (t) => to === 0 && position(t) === 0,
  };
}

// Play the songs that can be heard and pause the rest, where they'll wait for the next
// time you're in their zone. A song that wasn't allowed to start yet (the page hasn't
// been clicked) just tries again next time
function updateSongs() {
  const t = ac.currentTime;
  for (const { audio, start = 0, end, fade } of Object.values(BGM)) {
    if (ac.state !== 'running' || fade.silent(t)) {
      if (!audio.paused) audio.pause();
    } else if (audio.paused) {
      audio.play().catch(() => {});
    } else if (audio.currentTime >= end || audio.currentTime < start) {
      audio.currentTime = start;
    }
  }
}

function crossfadeTo(name) {
  if ((playing?.name ?? null) === name) return;
  const t = ac.currentTime;
  for (const [key, song] of Object.entries(BGM)) song.fade.go(key === name && !gone.has(key) ? 1 : 0);
  if (playing) {
    const old = playing;
    old.fade.go(0);
    setTimeout(() => {
      for (const s of old.sources) s.stop();
      old.level.disconnect();
    }, CROSSFADE * 1000 + 200);
    playing = null;
  }
  if (!name) return;
  const level = gain(ac, 0);
  level.connect(master);
  // Without a file, the music is part of the soundscape, so all of it gets BGM_VOLUME
  const fade = fader(level.gain, BGM[name] ? 1 : BGM_VOLUME);
  fade.go(1);
  const sound = SOUNDSCAPES[name](ac, level, t);
  playing = { name, level, fade, ...sound, tracks: sound.tracks.filter((track) => !(BGM[name] && track.tune)) };
  playing.finale?.(finale);
}

// Queue up every event due in the next LOOKAHEAD seconds
function schedule() {
  updateSongs();
  if (!playing) return;
  const now = ac.currentTime;
  for (const track of playing.tracks) {
    track.at = Math.max(track.at, now); // don't try to catch up after a stall
    while (track.at < now + LOOKAHEAD) track.at += track.play(track.at);
  }
}

// The zone's soundscape (a key of SOUNDSCAPES), or nothing for quiet
export function setZoneSound(name) {
  wanted = name ?? null;
  if (ac) crossfadeTo(wanted);
}

// A soundscape's song fades away and doesn't come back. Its other sounds carry on
export function fadeSongAway(name) {
  if (gone.has(name)) return;
  gone.add(name);
  if (ac && wanted === name) BGM[name].fade.go(0, SONG_FADE);
}

// Play a one-shot sound right now (a key of SFX). Does nothing before audio has started
export function sfx(name, ...args) {
  if (ac) SFX[name](ac, effects, ac.currentTime, ...args);
}

// The party's sign is being read (or isn't any more)
export function setFinaleSound(on) {
  finale = on;
  playing?.finale?.(on);
}

export function toggleMute() {
  muted = !muted;
  if (ac) master.gain.setTargetAtTime(muted ? 0 : VOLUME, ac.currentTime, 0.05);
  return muted;
}

// Start on the first key press or click (Esc doesn't count as one, so keep trying)
function unlock() {
  if (!ac) start();
  else if (ac.state === 'suspended' && !document.hidden) ac.resume();
  updateSongs(); // some browsers only let a song start during a key press or click
}
addEventListener('keydown', unlock);
addEventListener('pointerdown', unlock);
// Pause while the tab is hidden (background timers are too slow to keep the music in time)
document.addEventListener('visibilitychange', () => {
  if (!ac) return;
  if (document.hidden) ac.suspend();
  else ac.resume();
});
