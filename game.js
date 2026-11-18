'use strict';
// Bye Bye Angus — a slapstick ragdoll toy. Bump APP_VERSION (+ sw.js VERSION + ?v= in index.html) on every change.
const APP_VERSION = '1.0.0';
const STORE_KEY = 'angus.v1';

const WEAPONS = [
  { id: 'grab',      icon: '✋', name: 'Grab',       verb: 'GOT YEETED',      how: 'Drag him and fling him into a wall' },
  { id: 'punch',     icon: '👊', name: 'Punch',      verb: 'GOT KNOCKED OUT', how: 'Tap him. Keep tapping.' },
  { id: 'bomb',      icon: '💣', name: 'Bomb',       verb: 'GOT BLOWN UP',    how: 'Tap to drop a bomb near him' },
  { id: 'rocket',    icon: '🚀', name: 'Rocket',     verb: 'GOT ROCKETED',    how: 'Tap where the rocket should go' },
  { id: 'boulder',   icon: '🪨', name: 'Boulder',    verb: 'GOT FLATTENED',   how: 'Tap above him to drop a boulder' },
  { id: 'piano',     icon: '🎹', name: 'Piano',      verb: 'GOT PIANO\'D',    how: 'Tap above him to drop a piano' },
  { id: 'lightning', icon: '⚡', name: 'Lightning',  verb: 'GOT FRIED',       how: 'Tap him to call down lightning' },
  { id: 'fire',      icon: '🔥', name: 'Fire',       verb: 'GOT TOASTED',     how: 'Tap him to set him on fire' },
  { id: 'ice',       icon: '🧊', name: 'Freeze',     verb: 'GOT SHATTERED',   how: 'Freeze him, then freeze him again' },
  { id: 'hole',      icon: '🕳️', name: 'Black Hole', verb: 'GOT SPAGHETTIFIED', how: 'Tap to open a black hole' },
];
const WMAP = Object.fromEntries(WEAPONS.map(w => [w.id, w]));
const STYLE = { grab: 'ko', punch: 'ko', bomb: 'char', rocket: 'char', lightning: 'char', boulder: 'flat', piano: 'flat', fire: 'ash', ice: 'shatter', hole: 'vanish' };

const OUCH = ['Ow!', 'Hey!', 'Not the beanie!', 'Rude!', 'Why me?!', 'Ouch!', 'Watch it!', 'Oi!', 'That hurt!', 'Stop it!'];
const BACK = ['I\'m back!', 'Round two?', 'Please no more', 'That was uncalled for', 'Beanie: still on.', 'Can we talk about this?', 'Again?!', 'I forgive you. Barely.'];

// ---------- save ----------
function loadSave() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY));
    if (d && typeof d.kills === 'number') return { kills: d.kills, counts: d.counts || {}, muted: !!d.muted };
  } catch (e) {}
  return { kills: 0, counts: {}, muted: false };
}
const save = loadSave();
function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify(save)); } catch (e) {} }

// ---------- canvas / layout ----------
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, S = 30, floorY = 0, ceilY = 0;
function layout() {
  DPR = Math.min(window.devicePixelRatio || 1, 3);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  const tools = document.getElementById('tools').getBoundingClientRect();
  const hud = document.getElementById('hud').getBoundingClientRect();
  floorY = Math.min(H - 20, tools.top + 4);
  ceilY = hud.bottom;
  const playH = floorY - ceilY;
  S = Math.max(14, Math.min(W / 11, playH / 13));
}

// ---------- sound (synthesised, no files) ----------
const Snd = (() => {
  let ac = null, master = null, noiseBuf = null;
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = save.muted ? 0 : 0.6; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function setMuted(m) { if (master) master.gain.value = m ? 0 : 0.6; }
  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function tone(type, f1, f2, dur, vol, delay = 0) {
    if (!ac) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    env(g, t, 0.005, vol, dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, freq, type = 'lowpass', delay = 0, f2) {
    if (!ac) return;
    const t = ac.currentTime + delay;
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t);
    if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ac.createGain(); env(g, t, 0.005, vol, dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  return {
    init, setMuted,
    thud(k = 1) { tone('sine', 160, 45, 0.18, 0.5 * k); noise(0.08, 0.25 * k, 900); },
    punch() { tone('square', 220, 60, 0.12, 0.25); noise(0.1, 0.5, 2500); },
    boom() { noise(1.1, 0.9, 1200, 'lowpass', 0, 80); tone('sine', 90, 30, 0.8, 0.8); },
    zap() { for (let i = 0; i < 5; i++) tone('sawtooth', 600 + Math.random() * 1500, 80, 0.12, 0.18, i * 0.04); noise(0.4, 0.4, 4000, 'highpass'); },
    whoosh() { noise(0.35, 0.3, 400, 'bandpass', 0, 2500); },
    fire() { noise(0.6, 0.35, 900, 'bandpass', 0, 300); },
    freeze() { tone('sine', 1800, 3200, 0.3, 0.15); tone('triangle', 2400, 1200, 0.4, 0.1, 0.05); noise(0.25, 0.2, 6000, 'highpass'); },
    shatter() { for (let i = 0; i < 8; i++) tone('triangle', 2000 + Math.random() * 3000, 1500, 0.15, 0.12, i * 0.03); noise(0.4, 0.5, 5000, 'highpass'); },
    piano() { [130.8, 138.6, 196, 207.7, 311, 329.6, 466].forEach((f, i) => { tone('triangle', f, f * 0.99, 1.6, 0.18, i * 0.01); tone('sine', f * 2, 0, 1.0, 0.06, i * 0.01); }); noise(0.3, 0.6, 700); },
    suck() { tone('sine', 300, 40, 1.0, 0.3); noise(1.0, 0.25, 2000, 'lowpass', 0, 100); },
    pop() { tone('sine', 400, 900, 0.12, 0.3); },
    ding() { tone('sine', 880, 0, 0.25, 0.25); tone('sine', 1320, 0, 0.4, 0.2, 0.12); },
    rocket() { noise(0.5, 0.3, 800, 'bandpass', 0, 3000); },
  };
})();

// ---------- helpers ----------
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function mix(c1, c2, t) { return 'rgb(' + [0, 1, 2].map(i => Math.round(c1[i] + (c2[i] - c1[i]) * t)).join(',') + ')'; }
const C = {
  skin: [255, 205, 168], hoodie: [76, 132, 255], jeans: [52, 70, 120], shoe: [40, 40, 48],
  beanie: [230, 70, 60], beanie2: [255, 240, 230], hair: [120, 70, 40], char: [36, 32, 32], ice: [170, 225, 255],
};

// ---------- the ragdoll ----------
// Points: 0 head, 1 neck, 2 hip, 3 L elbow, 4 L hand, 5 R elbow, 6 R hand, 7 L knee, 8 L foot, 9 R knee, 10 R foot
const POSE = [[0, -6.05, .9], [0, -4.85, .35], [0, -2.65, .45], [-.9, -4.0, .28], [-1.3, -3.0, .28], [.9, -4.0, .28], [1.3, -3.0, .28],
  [-.45, -1.3, .28], [-.5, 0, .3], [.45, -1.3, .28], [.5, 0, .3]];
const STICKS = [[0, 1], [1, 2], [1, 3], [3, 4], [1, 5], [5, 6], [2, 7], [7, 8], [2, 9], [9, 10], [0, 2, .6]];

function makeAngus(x, footY) {
  const pts = POSE.map(([dx, dy, r]) => ({ x: x + dx * S, y: footY + dy * S, px: x + dx * S, py: footY + dy * S, r: r * S }));
  const sticks = STICKS.map(([a, b, k]) => ({ a, b, k: k || 1, len: Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y) }));
  return {
    pts, sticks, rigid: null, hp: 100, dead: false, deathT: 0, style: null, method: null,
    stun: 0.8, control: 0, hurtT: 0, frozen: 0, burn: 0, char: 0, zap: 0, hasBeanie: true,
    grab: null, flungBy: 'grab', speech: null, speechCD: 0, runDir: 1, hidden: false, flat: 0, vanish: null,
    lookX: x, lookY: footY - 6 * S, ghost: false, spawnT: 0,
  };
}

let angus = null;
let objects = [], holes = [], particles = [], floaters = [], beanies = [], ashes = [], bolts = [], ghosts = [], fires = [];
let weapon = 'grab';
let shake = 0, flash = 0, flashColor = '#fff', time = 0;

function bodyCenter(b) { return { x: b.pts[2].x, y: b.pts[2].y }; }
function nearestPoint(b, x, y, maxD) {
  let best = -1, bd = maxD;
  b.pts.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y) - p.r * 0.5; if (d < bd) { bd = d; best = i; } });
  return best;
}
function say(b, text, force) {
  if (!force && b.speechCD > 0) return;
  b.speech = { text, t: 1.6 }; b.speechCD = 1.4;
}

function hurt(b, amt, wid, stun = 0) {
  if (!b || b.dead || b.spawnT > 0) return;
  if (b.frozen > 0 && wid !== 'ice') amt *= 1.5;
  b.hp -= amt; b.hurtT = 0.45; b.flungBy = wid;
  if (stun) { b.stun = Math.max(b.stun, stun); }
  if (b.hp <= 0) { kill(b, wid); return; }
  if (amt > 4 && Math.random() < 0.55) say(b, b.burn > 0 ? 'HOT HOT HOT!' : b.frozen > 0 ? 'brrrr...' : pick(OUCH));
  updateHud();
}

function detachBeanie(b, vx, vy) {
  if (!b.hasBeanie) return;
  b.hasBeanie = false;
  const h = b.pts[0], n = b.pts[1];
  const a = Math.atan2(h.y - n.y, h.x - n.x) + Math.PI / 2;
  beanies.push({ x: h.x + Math.sin(a) * h.r * 0.5, y: h.y - Math.cos(a) * h.r * 0.5, vx, vy, rot: a, vr: rand(-0.3, 0.3), r: h.r, life: 30, char: b.char, gone: 0 });
  if (beanies.length > 7) beanies.shift();
}

function kill(b, wid) {
  b.dead = true; b.hp = 0; b.deathT = 0; b.method = wid; b.grab = null;
  let style = STYLE[wid];
  if (b.frozen > 0) style = 'shatter';
  b.style = style;
  save.kills++;
  const isNew = !save.counts[wid];
  save.counts[wid] = (save.counts[wid] || 0) + 1;
  persist();
  const c = bodyCenter(b), h = b.pts[0];
  if (style === 'char') {
    b.char = 1; detachBeanie(b, rand(-0.4, 0.4) * S, -rand(0.6, 0.9) * S);
    for (let i = 0; i < 12; i++) puff(h.x, h.y, '#555', 1.2);
  } else if (style === 'flat') {
    b.flat = 0.001; detachBeanie(b, rand(-0.5, 0.5) * S, -0.5 * S);
  } else if (style === 'ash') {
    b.hidden = true; detachBeanie(b, 0, -0.3 * S);
    ashes.push({ x: c.x, life: 7 });
    for (let i = 0; i < 25; i++) puff(rand(c.x - S, c.x + S), rand(c.y - 3 * S, c.y + S), '#444', 1.6);
  } else if (style === 'shatter') {
    b.hidden = true; detachBeanie(b, rand(-0.3, 0.3) * S, -0.6 * S); Snd.shatter();
    b.pts.forEach(p => { for (let i = 0; i < 6; i++) particles.push({ kind: 'shard', x: p.x + rand(-p.r, p.r), y: p.y + rand(-p.r, p.r), vx: rand(-0.4, 0.4) * S + (p.x - p.px), vy: rand(-0.6, 0.1) * S, life: rand(1.5, 2.5), max: 2.5, size: rand(0.2, 0.5) * S, rot: rand(0, 6), vr: rand(-0.3, 0.3), color: Math.random() < 0.6 ? 'rgba(190,235,255,.9)' : pick(['#ffcda8', '#4c84ff', '#34467a']), g: 1, bounce: true }); });
  } else if (style === 'vanish') {
    b.vanish = { t: 0, hole: b.vanishHole || holes[0] || { x: c.x, y: c.y } };
    if (b.vanish.hole.life !== undefined) b.vanish.hole.life = Math.max(b.vanish.hole.life, 1.8);
  }
  if (style === 'ko' && Math.random() < 0.5) detachBeanie(b, rand(-0.3, 0.3) * S, -0.4 * S);
  const way = WMAP[wid];
  showBanner('ANGUS ' + way.verb + '!', isNew ? `NEW WAY! ${foundCount()}/${WEAPONS.length} discovered` : `${way.icon} x${save.counts[wid]}`);
  if (isNew) Snd.ding();
  updateHud(); renderTools();
}

function foundCount() { return WEAPONS.filter(w => save.counts[w.id]).length; }

function spawnAngus() {
  const x = clamp(W / 2 + rand(-W * 0.15, W * 0.15), 3 * S, W - 3 * S);
  angus = makeAngus(x, ceilY - S);
  angus.spawnT = 0.6;
  setTimeout(() => { if (angus && !angus.dead) say(angus, pick(BACK), true); }, 700);
  Snd.pop();
  updateHud();
}

// ---------- physics ----------
const DT = 1 / 60;
function stepBody(b) {
  const g = 0.02 * S, pts = b.pts;
  b.speechCD -= DT; b.hurtT -= DT; b.spawnT -= DT;
  if (b.speech && (b.speech.t -= DT) <= 0) b.speech = null;
  if (b.zap > 0) b.zap -= DT;
  if (b.stun > 0) b.stun -= DT;

  // status effects
  if (!b.dead) {
    if (b.burn > 0) {
      b.burn -= DT; b.char = Math.min(0.85, b.char + DT * 0.08);
      hurt(b, 16 * DT, 'fire');
      for (let i = 0; i < 2; i++) { const p = pick(pts); flame(p.x, p.y); }
      if (Math.random() < 0.02) say(b, pick(['HOT HOT HOT!', 'AAAAH!', 'Stop drop and roll!', 'Fire!!']));
    }
    if (b.frozen > 0) {
      b.frozen -= DT;
      if (b.frozen <= 0) { b.rigid = null; say(b, 'Phew...', true); }
    }
  } else {
    b.deathT += DT;
    b.burn = 0;
    if (b.flat > 0) b.flat = Math.min(1, b.flat + DT * 8);
  }

  // integrate
  const damp = b.frozen > 0 ? 0.998 : 0.992;
  const maxV = 2.6 * S;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (b.grab && b.grab.idx === i) {
      p.px = p.x; p.py = p.y;
      const dx = clamp(b.grab.tx - p.x, -maxV, maxV), dy = clamp(b.grab.ty - p.y, -maxV, maxV);
      p.x += dx; p.y += dy; continue;
    }
    let vx = (p.x - p.px) * damp, vy = (p.y - p.py) * damp;
    const sp = Math.hypot(vx, vy); if (sp > maxV) { vx *= maxV / sp; vy *= maxV / sp; }
    p.px = p.x; p.py = p.y;
    p.x += vx; p.y += vy + g;
  }

  // black holes pull
  for (const h of holes) {
    for (const p of pts) {
      const dx = h.x - p.x, dy = h.y - p.y, d = Math.hypot(dx, dy) + 1;
      const f = 0.1 * S * clamp(4 * S / d, 0.25, 2.5) * h.power;
      p.x += dx / d * f * DT * 4; p.y += dy / d * f * DT * 4;
      if (d < 2.5 * S) { p.px += (p.x - p.px) * 0.12; p.py += (p.y - p.py) * 0.12; }
    }
    const closest = Math.min(...pts.map(p => Math.hypot(h.x - p.x, h.y - p.y)));
    if (closest < 1.5 * S && !b.dead) { b.vanishHole = h; hurt(b, 45 * DT, 'hole', 0.3); }
  }

  // standing / panicking control
  const canStand = !b.dead && b.stun <= 0 && !b.grab && b.frozen <= 0;
  b.control = canStand ? Math.min(1, b.control + DT * 1.2) : 0;
  if (b.control > 0 && b.spawnT <= 0) {
    const k = b.control, hip = pts[2];
    const lowest = Math.max(pts[8].y, pts[10].y);
    if (lowest > floorY - 2.5 * S) {
      const ty = floorY - 2.65 * S;
      hip.y += (ty - hip.y) * 0.06 * k;
      if (b.burn > 0) {
        hip.x += b.runDir * 0.09 * S * k;
        if (hip.x < 2 * S) b.runDir = 1; if (hip.x > W - 2 * S) b.runDir = -1;
      }
      const t = time * (b.burn > 0 ? 14 : 2);
      const target = (i, x, y, s) => { const p = pts[i]; p.x += (x - p.x) * s * k; p.y += (y - p.y) * s * k; };
      target(1, hip.x, hip.y - 2.2 * S, 0.1);
      target(0, hip.x + (b.lookX - hip.x) * 0.02, hip.y - 3.4 * S, 0.1);
      const step = b.burn > 0 ? Math.sin(t) * 0.7 * S : 0;
      target(8, hip.x - 0.5 * S + step, floorY - 0.3 * S, 0.05);
      target(10, hip.x + 0.5 * S - step, floorY - 0.3 * S, 0.05);
      if (b.burn > 0) { target(4, hip.x - 1.4 * S, hip.y - 4.4 * S, 0.06); target(6, hip.x + 1.4 * S, hip.y - 4.4 * S, 0.06); }
      else { const sw = Math.sin(t) * 0.15 * S; target(4, hip.x - 1.3 * S + sw, hip.y - 0.4 * S, 0.02); target(6, hip.x + 1.3 * S - sw, hip.y - 0.4 * S, 0.02); }
      for (const p of pts) { p.px += (p.x - p.px) * 0.08 * k; p.py += (p.y - p.py) * 0.08 * k; }
    }
  }

  // bounds with impact damage
  let impact = 0;
  for (const p of pts) {
    const vx = p.x - p.px, vy = p.y - p.py;
    if (p.y > floorY - p.r) { impact = Math.max(impact, vy); p.y = floorY - p.r; p.py = p.y + vy * 0.35; p.px = p.x - vx * 0.82; }
    if (p.y < ceilY + p.r) { impact = Math.max(impact, -vy); p.y = ceilY + p.r; p.py = p.y + vy * 0.35; }
    if (p.x < p.r) { impact = Math.max(impact, -vx); p.x = p.r; p.px = p.x + vx * 0.4; }
    if (p.x > W - p.r) { impact = Math.max(impact, vx); p.x = W - p.r; p.px = p.x + vx * 0.4; }
  }
  const thresh = (b.frozen > 0 ? 0.45 : 0.7) * S;
  if (impact > thresh && b.spawnT <= 0) {
    const dmg = (impact - thresh) / S * 22;
    if (!b.dead) hurt(b, dmg, b.flungBy, 0.6 + dmg / 40);
    Snd.thud(clamp(impact / (2 * S), 0.3, 1));
    if (dmg > 10) { shake = Math.max(shake, dmg * 0.4); const c = pts[2]; stars(c.x, Math.min(c.y, floorY - S)); }
  }

  // constraints
  const sticks = b.rigid ? b.sticks.concat(b.rigid) : b.sticks;
  for (let it = 0; it < 10; it++) {
    for (const s of sticks) {
      const a = pts[s.a], c = pts[s.b];
      const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 0.001;
      const diff = (d - s.len) / d * s.k;
      const ga = b.grab && b.grab.idx === s.a, gb = b.grab && b.grab.idx === s.b;
      const wa = ga ? 0 : gb ? 1 : 0.5, wb = gb ? 0 : ga ? 1 : 0.5;
      a.x += dx * diff * wa; a.y += dy * diff * wa;
      c.x -= dx * diff * wb; c.y -= dy * diff * wb;
    }
    for (const p of pts) {
      if (p.y > floorY - p.r) p.y = floorY - p.r;
      if (p.y < ceilY + p.r) p.y = ceilY + p.r;
      if (p.x < p.r) p.x = p.r;
      if (p.x > W - p.r) p.x = W - p.r;
    }
  }

  // fire patches ignite
  if (!b.dead && b.frozen <= 0) for (const f of fires) for (const p of pts) if (Math.abs(p.x - f.x) < 1.2 * S && p.y > floorY - 1.4 * S) { if (b.burn <= 0) say(b, 'HOT HOT HOT!', true); b.burn = Math.max(b.burn, 4); b.flungBy = 'fire'; }

  // death sequence
  if (b.dead) {
    if (b.vanish) {
      b.vanish.t += DT * 1.3;
      if (b.vanish.t >= 1) b.hidden = true;
    }
    if (b.deathT > 1.0 && !b.ghost) {
      b.ghost = true;
      const c = b.hidden && ashes.length ? { x: ashes[ashes.length - 1].x, y: floorY - S } : b.pts[0];
      ghosts.push({ x: c.x, y: c.y, t: 0 });
    }
    if (b.deathT > 3.3) {
      if (!b.hidden) { const c = bodyCenter(b); for (let i = 0; i < 14; i++) puff(c.x + rand(-S, S), c.y + rand(-2 * S, S), '#fff', 1.2); }
      spawnAngus();
    }
  }
}

function makeRigid(b) {
  b.rigid = [];
  for (let i = 0; i < b.pts.length; i++) for (let j = i + 1; j < b.pts.length; j++)
    b.rigid.push({ a: i, b: j, k: 1, len: Math.hypot(b.pts[i].x - b.pts[j].x, b.pts[i].y - b.pts[j].y) });
}

function impulse(b, ix, iy, idx, spread = 0.35) {
  b.pts.forEach((p, i) => {
    const k = idx === undefined || i === idx ? 1 : spread;
    p.px -= ix * k; p.py -= iy * k;
  });
}

function explode(x, y, R, power, dmg, wid) {
  shake = Math.max(shake, 18); flash = 0.35; flashColor = '#fff6c0';
  Snd.boom();
  floaters.push({ x, y: y - S, text: pick(['BOOM!', 'KABOOM!', 'BLAM!']), life: 1, size: 1.6, color: '#ffd166' });
  for (let i = 0; i < 34; i++) { const a = rand(0, 7), v = rand(0.2, 0.9) * S; particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.7), max: 0.7, size: rand(0.2, 0.5) * S, color: pick(['#ffd166', '#ff8c42', '#ff4d4d', '#fff']), g: 0.3 }); }
  for (let i = 0; i < 16; i++) puff(x + rand(-S, S), y + rand(-S, S), '#666', 2.2);
  particles.push({ kind: 'ring', x, y, life: 0.35, max: 0.35, size: R });
  const b = angus;
  if (b) {
    let maxF = 0;
    for (const p of b.pts) {
      const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy) || 1;
      if (d < R) { const f = 1 - d / R; maxF = Math.max(maxF, f); p.px -= dx / d * f * power; p.py -= (dy / d - 0.6) * f * power; }
    }
    if (maxF > 0) {
      b.char = Math.min(0.7, b.char + maxF * 0.4);
      if (maxF > 0.5) detachBeanie(b, rand(-0.5, 0.5) * S, -S);
      hurt(b, dmg * Math.min(1, maxF * 1.4), wid, 1.4);
      b.flungBy = wid;
    }
  }
  for (const bn of beanies) { const dx = bn.x - x, dy = bn.y - y, d = Math.hypot(dx, dy) || 1; if (d < R) { bn.vx += dx / d * power * 0.5; bn.vy += (dy / d - 0.5) * power * 0.5; bn.vr += rand(-0.5, 0.5); } }
}

// ---------- particles ----------
function puff(x, y, color, size = 1) {
  particles.push({ kind: 'smoke', x, y, vx: rand(-0.06, 0.06) * S, vy: rand(-0.12, -0.03) * S, life: rand(0.8, 1.6), max: 1.6, size: rand(0.4, 0.9) * S * size, color, g: 0 });
}
function flame(x, y) {
  particles.push({ kind: 'flame', x: x + rand(-0.3, 0.3) * S, y, vx: rand(-0.03, 0.03) * S, vy: rand(-0.12, -0.05) * S, life: rand(0.35, 0.7), max: 0.7, size: rand(0.6, 1.1) * S, g: 0 });
}
function stars(x, y) {
  for (let i = 0; i < 6; i++) { const a = rand(0, 7); particles.push({ kind: 'star', x, y, vx: Math.cos(a) * 0.2 * S, vy: Math.sin(a) * 0.2 * S - 0.1 * S, life: 0.6, max: 0.6, size: 0.35 * S, rot: rand(0, 6), vr: 0.2, g: 0.2 }); }
}

// ---------- weapons ----------
function useWeapon(x, y) {
  const b = angus;
  hideHint();
  switch (weapon) {
    case 'punch': {
      const i = b ? nearestPoint(b, x, y, 2.4 * S) : -1;
      if (i < 0) { Snd.whoosh(); floaters.push({ x, y, text: 'whiff', life: 0.6, size: 0.7, color: '#fff' }); return; }
      const p = b.pts[i], c = b.pts[2];
      let dir = Math.sign(p.x - x) || Math.sign(c.x - W / 2) * -1 || 1;
      if (Math.abs(p.x - x) < 0.2 * S) dir = Math.random() < 0.5 ? -1 : 1;
      impulse(b, dir * 0.9 * S, -0.45 * S, i, 0.35);
      hurt(b, rand(9, 14), 'punch', 0.7);
      Snd.punch(); shake = Math.max(shake, 6);
      floaters.push({ x, y: y - 0.5 * S, text: pick(['POW!', 'BAM!', 'WHACK!', 'BONK!', 'SMACK!']), life: 0.7, size: 1, color: '#fff' });
      particles.push({ kind: 'emoji', ch: '👊', x, y, vx: 0, vy: 0, life: 0.25, max: 0.25, size: 1.6 * S, g: 0 });
      stars(p.x, p.y);
      if (i === 0 && Math.random() < 0.25) detachBeanie(b, dir * 0.4 * S, -0.5 * S);
      break;
    }
    case 'bomb':
      objects.push({ type: 'bomb', x, y: Math.min(y, floorY - S), vx: 0, vy: 0, r: 0.55 * S, fuse: 1.4, rot: 0 });
      break;
    case 'rocket': {
      const fromLeft = x > W / 2;
      const sx = fromLeft ? -S : W + S, sy = clamp(y - rand(1, 3) * S, ceilY + S, floorY - S);
      const d = Math.hypot(x - sx, y - sy), v = 0.55 * S;
      objects.push({ type: 'rocket', x: sx, y: sy, vx: (x - sx) / d * v, vy: (y - sy) / d * v, r: 0.35 * S, life: 4 });
      Snd.rocket();
      break;
    }
    case 'boulder':
      objects.push({ type: 'boulder', x: clamp(x, 1.5 * S, W - 1.5 * S), y: ceilY - 2 * S, vx: rand(-0.02, 0.02) * S, vy: 0, r: 1.35 * S, rot: 0, life: 6, hitCD: 0, entered: false });
      break;
    case 'piano':
      objects.push({ type: 'piano', x: clamp(x, 2.2 * S, W - 2.2 * S), y: ceilY - 3 * S, vx: 0, vy: 0, w: 4.2 * S, h: 2.8 * S, hit: false, entered: false });
      floaters.push({ x, y: ceilY + 1.5 * S, text: 'look out!', life: 0.9, size: 0.7, color: '#fff' });
      break;
    case 'lightning': {
      let tx = x, ty = floorY, hit = -1;
      if (b && !b.hidden) {
        let best = 3 * S;
        b.pts.forEach((p, i) => { const d = Math.abs(p.x - x) + Math.max(0, p.y - y) * 0.2; if (d < best) { best = d; hit = i; } });
        if (hit >= 0) { const p = b.pts[hit]; tx = p.x; ty = p.y; }
      }
      bolts.push({ x0: tx + rand(-S, S), y0: ceilY, x1: tx, y1: ty, life: 0.3 });
      Snd.zap(); flash = 0.4; flashColor = '#dff3ff'; shake = Math.max(shake, 8);
      if (hit >= 0) {
        b.zap = 0.55; b.char = Math.min(0.75, b.char + 0.3);
        b.pts.forEach(p => { p.px += rand(-0.25, 0.25) * S; p.py += rand(-0.25, 0.25) * S; });
        if (b.frozen > 0) { b.frozen = 0.01; }
        hurt(b, 34, 'lightning', 1.2);
        floaters.push({ x: tx, y: ty - S, text: 'ZZZAP!', life: 0.8, size: 1.1, color: '#bfefff' });
      } else {
        for (let i = 0; i < 10; i++) particles.push({ kind: 'spark', x: tx, y: ty, vx: rand(-0.4, 0.4) * S, vy: rand(-0.6, -0.1) * S, life: 0.4, max: 0.4, size: 0.2 * S, color: '#bfefff', g: 0.5 });
      }
      break;
    }
    case 'fire': {
      const i = b && !b.dead ? nearestPoint(b, x, y, 2.4 * S) : -1;
      Snd.fire();
      if (i >= 0) {
        if (b.frozen > 0) { b.frozen = 0.01; floaters.push({ x, y, text: 'sizzle', life: 0.8, size: 0.8, color: '#fff' }); for (let k = 0; k < 10; k++) puff(x, y, '#ddd', 1); return; }
        if (b.burn <= 0) say(b, 'HOT HOT HOT!', true);
        b.burn = 5.5; b.flungBy = 'fire'; b.runDir = Math.random() < 0.5 ? -1 : 1; hurt(b, 8, 'fire');
        for (let k = 0; k < 12; k++) flame(x, y);
      } else {
        fires.push({ x, life: 3.5 });
      }
      break;
    }
    case 'ice': {
      const i = b && !b.dead ? nearestPoint(b, x, y, 2.6 * S) : -1;
      Snd.freeze();
      for (let k = 0; k < 14; k++) particles.push({ kind: 'spark', x, y, vx: rand(-0.3, 0.3) * S, vy: rand(-0.3, 0.3) * S, life: 0.5, max: 0.5, size: rand(0.1, 0.25) * S, color: '#dff6ff', g: 0 });
      if (i < 0) return;
      if (b.burn > 0) { b.burn = 0; for (let k = 0; k < 12; k++) puff(x, y, '#ddd', 1); say(b, 'Thanks...?', true); return; }
      if (b.frozen > 0) { hurt(b, 45, 'ice'); b.frozen = 4; floaters.push({ x, y: y - S, text: 'CRACK', life: 0.7, size: 0.9, color: '#dff6ff' }); }
      else { b.frozen = 4; b.stun = 0; makeRigid(b); hurt(b, 15, 'ice'); say(b, 'brrrr...', true); }
      break;
    }
    case 'hole':
      if (holes.length >= 2) holes.shift();
      holes.push({ x, y: clamp(y, ceilY + 2 * S, floorY - 1.5 * S), life: 4, age: 0, power: 1 });
      Snd.suck();
      break;
  }
}

function stepObjects() {
  const b = angus;
  for (const o of objects) {
    if (o.type === 'bomb') {
      o.vy += 0.03 * S; o.y += o.vy; o.x += o.vx; o.vx *= 0.96;
      if (o.y > floorY - o.r) { o.y = floorY - o.r; o.vy *= -0.3; }
      o.fuse -= DT;
      if (Math.random() < 0.6) particles.push({ kind: 'spark', x: o.x + o.r * 0.6, y: o.y - o.r * 1.3, vx: rand(-0.05, 0.05) * S, vy: rand(-0.12, 0) * S, life: 0.25, max: 0.25, size: 0.15 * S, color: pick(['#ffd166', '#fff']), g: 0 });
      if (o.fuse <= 0) { o.dead = true; explode(o.x, o.y, 5.5 * S, 1.6 * S, 70, 'bomb'); }
    } else if (o.type === 'rocket') {
      o.x += o.vx; o.y += o.vy; o.life -= DT;
      if (Math.random() < 0.9) puff(o.x - o.vx * 1.5, o.y - o.vy * 1.5, '#bbb', 0.5);
      let boom = o.life <= 0 || o.y > floorY - o.r || o.y < ceilY;
      if ((o.x < -2 * S && o.vx < 0) || (o.x > W + 2 * S && o.vx > 0)) boom = true;
      if (o.vx > 0 && o.x > W - o.r && o.life < 3.6) boom = true;
      if (o.vx < 0 && o.x < o.r && o.life < 3.6) boom = true;
      if (b && !b.hidden) for (const p of b.pts) if (Math.hypot(p.x - o.x, p.y - o.y) < p.r + o.r) boom = true;
      if (boom) { o.dead = true; explode(clamp(o.x, 0, W), o.y, 4 * S, 1.4 * S, 55, 'rocket'); }
    } else if (o.type === 'boulder' || o.type === 'piano') {
      o.vy += 0.04 * S; o.x += o.vx; o.y += o.vy;
      const isP = o.type === 'piano';
      const half = isP ? o.h / 2 : o.r;
      if (o.y - half > ceilY) o.entered = true;
      if (o.y > floorY - half) {
        if (isP) { smashPiano(o); continue; }
        if (o.vy > 0.3 * S) { shake = Math.max(shake, 10); Snd.thud(1); for (let i = 0; i < 8; i++) puff(o.x + rand(-o.r, o.r), floorY, '#a89', 1); }
        o.y = floorY - half; o.vy *= -0.25; o.vx *= 0.98;
      }
      if (!isP) {
        o.rot += o.vx / o.r; o.life -= DT; o.hitCD -= DT;
        if (o.x < o.r) { o.x = o.r; o.vx = Math.abs(o.vx) * 0.5; } if (o.x > W - o.r) { o.x = W - o.r; o.vx = -Math.abs(o.vx) * 0.5; }
        if (o.life <= 0) { o.dead = true; for (let i = 0; i < 8; i++) puff(o.x, o.y, '#999', 1.3); }
      }
      if (b && !b.hidden && o.entered) {
        let touched = false;
        for (const p of b.pts) {
          if (isP) {
            const L = o.x - o.w / 2 - p.r, R = o.x + o.w / 2 + p.r, T = o.y - o.h / 2 - p.r, B = o.y + o.h / 2 + p.r;
            if (p.x > L && p.x < R && p.y > T && p.y < B) {
              touched = true;
              const pushes = [p.y - T, B - p.y, p.x - L, R - p.x];
              const m = Math.min(...pushes);
              if (m === pushes[0] || o.vy > 0.2 * S) { p.y = o.y + o.h / 2 + p.r; p.py = p.y - o.vy; }
              else if (m === pushes[2]) p.x = L; else if (m === pushes[3]) p.x = R; else p.y = T;
            }
          } else {
            const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy) || 1, min = o.r + p.r;
            if (d < min) {
              touched = true;
              p.x = o.x + dx / d * min; p.y = o.y + dy / d * min;
              p.px = p.x - o.vx * 0.9 - dx / d * 0.1 * S; p.py = p.y - o.vy * 0.9;
            }
          }
        }
        if (touched) {
          const speed = Math.hypot(o.vx, o.vy);
          if (isP && !o.hit && o.vy > 0.2 * S) { o.hit = true; hurt(b, 100, 'piano', 2); Snd.thud(1); shake = 16; floaters.push({ x: o.x, y: o.y - o.h, text: 'CRUNCH!', life: 1, size: 1.3, color: '#fff' }); }
          else if (!isP && o.hitCD <= 0 && speed > 0.15 * S) {
            o.hitCD = 0.4; const dmg = o.vy > 0.3 * S ? 55 : 12;
            hurt(b, dmg, 'boulder', 1.5); Snd.thud(1); shake = Math.max(shake, dmg / 4);
            if (dmg > 20) { floaters.push({ x: o.x, y: o.y - o.r * 1.5, text: 'SPLAT!', life: 1, size: 1.2, color: '#fff' }); detachBeanie(b, rand(-0.5, 0.5) * S, -0.6 * S); }
          }
          if (isP) o.vy *= 0.85; else { o.vy *= 0.6; }
        }
      }
    }
  }
  objects = objects.filter(o => !o.dead);
}

function smashPiano(o) {
  o.dead = true; Snd.piano(); shake = Math.max(shake, 14);
  floaters.push({ x: o.x, y: floorY - 3 * S, text: '♪ PLONK ♪', life: 1.2, size: 1.1, color: '#ffd166' });
  for (let i = 0; i < 26; i++) particles.push({ kind: 'shard', x: o.x + rand(-o.w / 2, o.w / 2), y: floorY - rand(0, o.h), vx: rand(-0.4, 0.4) * S, vy: rand(-0.7, -0.1) * S, life: rand(1.5, 3), max: 3, size: rand(0.3, 0.7) * S, rot: rand(0, 6), vr: rand(-0.3, 0.3), color: pick(['#5a3420', '#3d2214', '#fff', '#111', '#7a4a2c']), g: 1, bounce: true });
  for (let i = 0; i < 10; i++) puff(o.x + rand(-o.w / 2, o.w / 2), floorY - S, '#b9a', 1.3);
  for (let i = 0; i < 4; i++) floaters.push({ x: o.x + rand(-2, 2) * S, y: floorY - rand(1, 3) * S, text: pick(['♪', '♫', '♬']), life: 1.4, size: 1, color: '#fff' });
}

function stepWorld() {
  time += DT;
  if (angus) stepBody(angus);
  stepObjects();
  for (const h of holes) {
    h.life -= DT; h.age += DT;
    for (const bn of beanies) { const dx = h.x - bn.x, dy = h.y - bn.y, d = Math.hypot(dx, dy) + 1; bn.vx += dx / d * 0.05 * S; bn.vy += dy / d * 0.05 * S; bn.vr += 0.02; if (d < 0.8 * S) bn.gone = Math.max(bn.gone, 0.01); }
    for (const p of particles) if (p.kind !== 'ring') { const dx = h.x - p.x, dy = h.y - p.y, d = Math.hypot(dx, dy) + 1; p.vx += dx / d * 0.04 * S; p.vy += dy / d * 0.04 * S; }
  }
  holes = holes.filter(h => {
    if (h.life <= 0) { for (let i = 0; i < 10; i++) puff(h.x, h.y, '#8a5cff', 0.8); Snd.pop(); return false; }
    return true;
  });
  for (const bn of beanies) {
    if (bn.gone > 0) { bn.gone += DT * 2; continue; }
    bn.vy += 0.02 * S; bn.x += bn.vx; bn.y += bn.vy; bn.rot += bn.vr; bn.vx *= 0.995;
    if (bn.y > floorY - bn.r * 0.4) {
      bn.y = floorY - bn.r * 0.4; bn.vy *= -0.3; bn.vx *= 0.85; bn.vr *= 0.6;
      const tgt = Math.round(bn.rot / (Math.PI * 2)) * Math.PI * 2; bn.rot += (tgt - bn.rot) * 0.15;
    }
    if (bn.x < bn.r) { bn.x = bn.r; bn.vx = Math.abs(bn.vx) * 0.5; } if (bn.x > W - bn.r) { bn.x = W - bn.r; bn.vx = -Math.abs(bn.vx) * 0.5; }
    if (bn.y < ceilY + bn.r) { bn.y = ceilY + bn.r; bn.vy = Math.abs(bn.vy) * 0.5; }
    bn.life -= DT;
  }
  beanies = beanies.filter(bn => bn.life > 0 && bn.gone < 1);
  for (const p of particles) {
    p.life -= DT; p.x += p.vx; p.y += p.vy; p.vy += (p.g || 0) * 0.03 * S;
    if (p.kind === 'smoke') { p.vx *= 0.97; p.vy *= 0.97; }
    if (p.vr) p.rot += p.vr;
    if (p.bounce && p.y > floorY - 2) { p.y = floorY - 2; p.vy *= -0.3; p.vx *= 0.7; p.vr *= 0.6; }
  }
  particles = particles.filter(p => p.life > 0);
  if (particles.length > 600) particles.splice(0, particles.length - 600);
  for (const f of floaters) { f.life -= DT; f.y -= 0.03 * S; }
  floaters = floaters.filter(f => f.life > 0);
  for (const bl of bolts) bl.life -= DT;
  bolts = bolts.filter(b => b.life > 0);
  for (const g of ghosts) { g.t += DT; g.y -= 0.05 * S; }
  ghosts = ghosts.filter(g => g.t < 2.2);
  for (const a of ashes) a.life -= DT;
  ashes = ashes.filter(a => a.life > 0);
  for (const f of fires) { f.life -= DT; if (Math.random() < 0.8) flame(f.x + rand(-0.6, 0.6) * S, floorY - 0.2 * S); }
  fires = fires.filter(f => f.life > 0);
  shake *= 0.86; flash = Math.max(0, flash - DT);
}

// ---------- drawing ----------
function drawRoom() {
  const g = ctx.createLinearGradient(0, 0, 0, floorY);
  g.addColorStop(0, '#2b3352'); g.addColorStop(1, '#3d4670');
  ctx.fillStyle = g; ctx.fillRect(-50, -50, W + 100, floorY + 50);
  // wallpaper stripes
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let x = 0; x < W; x += 2 * S) ctx.fillRect(x, 0, S, floorY);
  // window
  const wx = W * 0.72, wy = ceilY + (floorY - ceilY) * 0.2, ww = 3 * S, wh = 3.4 * S;
  ctx.fillStyle = '#1a1f33'; ctx.fillRect(wx - ww / 2 - 6, wy - 6, ww + 12, wh + 12);
  const sky = ctx.createLinearGradient(0, wy, 0, wy + wh); sky.addColorStop(0, '#6ec3ff'); sky.addColorStop(1, '#bfe6ff');
  ctx.fillStyle = sky; ctx.fillRect(wx - ww / 2, wy, ww, wh);
  ctx.fillStyle = '#1a1f33'; ctx.fillRect(wx - 3, wy, 6, wh); ctx.fillRect(wx - ww / 2, wy + wh / 2 - 3, ww, 6);
  // picture frame
  const fx = W * 0.22, fy = wy + 0.4 * S;
  ctx.fillStyle = '#c99a5b'; ctx.fillRect(fx - 1.2 * S, fy, 2.4 * S, 1.8 * S);
  ctx.fillStyle = '#f4ead8'; ctx.fillRect(fx - 1 * S, fy + 0.2 * S, 2 * S, 1.4 * S);
  ctx.fillStyle = '#e6463c'; ctx.beginPath(); ctx.arc(fx, fy + 1.1 * S, 0.45 * S, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); circ(fx, fy + 0.58 * S, 0.14 * S); ctx.fill();
  // floor
  const fg = ctx.createLinearGradient(0, floorY, 0, H);
  fg.addColorStop(0, '#8a5a3c'); fg.addColorStop(1, '#5e3a25');
  ctx.fillStyle = fg; ctx.fillRect(-50, floorY, W + 100, H - floorY + 50);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-50, floorY, W + 100, 4);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 2;
  for (let x = -((time * 0) % (3 * S)); x < W; x += 3 * S) { ctx.beginPath(); ctx.moveTo(x, floorY); ctx.lineTo(x - S, H); ctx.stroke(); }
}

function drawBeanie(x, y, rot, r, charAmt) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.translate(0, -0.2 * r);
  const main = mix(C.beanie, C.char, charAmt * 0.8), band = mix([200, 50, 45], C.char, charAmt * 0.8), stripe = mix(C.beanie2, C.char, charAmt * 0.8);
  // dome
  ctx.fillStyle = main;
  ctx.beginPath(); ctx.ellipse(0, -0.25 * r, 1.04 * r, 1.0 * r, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
  // stripe
  ctx.save(); ctx.beginPath(); ctx.ellipse(0, -0.25 * r, 1.04 * r, 1.0 * r, 0, Math.PI, 0); ctx.clip();
  ctx.fillStyle = stripe; ctx.fillRect(-1.2 * r, -0.85 * r, 2.4 * r, 0.18 * r); ctx.restore();
  // folded band
  ctx.fillStyle = band;
  roundRect(-1.12 * r, -0.42 * r, 2.24 * r, 0.42 * r, 0.16 * r); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = Math.max(1, r * 0.06);
  for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * 0.24 * r, -0.38 * r); ctx.lineTo(i * 0.24 * r, -0.04 * r); ctx.stroke(); }
  // pompom
  ctx.fillStyle = stripe; ctx.beginPath(); circ(0, -1.3 * r, 0.3 * r); ctx.fill();
  ctx.restore();
}

function circ(x, y, r) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }

function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function limb(a, b, c, color, w) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); if (c) ctx.lineTo(c.x, c.y); ctx.stroke();
}

function drawAngus(b) {
  if (b.hidden) return;
  const P = b.pts, ch = b.char;
  const col = k => {
    let c = C[k];
    if (b.frozen > 0) c = c.map((v, i) => v + (C.ice[i] - v) * 0.45);
    return mix(c, C.char, ch);
  };
  const skeleton = b.zap > 0 && Math.floor(b.zap * 30) % 2 === 0;
  ctx.save();
  if (b.flat > 0) {
    const cx = P[2].x, f = b.flat;
    ctx.translate(cx, floorY); ctx.scale(1 + 0.5 * f, 1 - 0.8 * f); ctx.translate(-cx, -floorY);
  }
  if (b.vanish) {
    const h = b.vanish.hole, t = Math.min(1, b.vanish.t);
    ctx.translate(h.x, h.y); ctx.rotate(t * t * 8); ctx.scale(1 - t, 1 - t * 0.7); ctx.translate(-h.x, -h.y);
  }
  // shadow
  if (!b.flat) {
    const sh = clamp(1 - (floorY - P[2].y) / (10 * S), 0.2, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.25 * sh})`; ctx.beginPath(); ctx.ellipse(P[2].x, floorY + 2, 1.6 * S * sh, 0.25 * S, 0, 0, 7); ctx.fill();
  }
  if (skeleton) {
    ctx.fillStyle = 'rgba(30,60,120,0.85)';
    P.forEach(p => { ctx.beginPath(); circ(p.x, p.y, p.r * 1.6); ctx.fill(); });
    const bone = '#fff', w = 0.16 * S;
    limb(P[1], P[2], null, bone, w); limb(P[1], P[3], P[4], bone, w); limb(P[1], P[5], P[6], bone, w);
    limb(P[2], P[7], P[8], bone, w); limb(P[2], P[9], P[10], bone, w);
    for (let i = 0; i < 4; i++) { const t = 0.15 + i * 0.18, x = P[1].x + (P[2].x - P[1].x) * t, y = P[1].y + (P[2].y - P[1].y) * t; ctx.beginPath(); ctx.moveTo(x - 0.5 * S, y); ctx.lineTo(x + 0.5 * S, y); ctx.stroke(); }
    const h = P[0]; ctx.fillStyle = bone; ctx.beginPath(); circ(h.x, h.y, h.r * 0.85); ctx.fill();
    ctx.fillStyle = '#123'; ctx.beginPath(); circ(h.x - h.r * 0.3, h.y, h.r * 0.2); circ(h.x + h.r * 0.3, h.y, h.r * 0.2); ctx.fill();
    ctx.restore(); return;
  }
  // legs
  const lw = 0.55 * S;
  limb(P[2], P[7], P[8], col('jeans'), lw); limb(P[2], P[9], P[10], col('jeans'), lw);
  [8, 10].forEach(i => { const k = i - 1; const dir = Math.sign(P[i].x - P[k].x) || (i === 8 ? -1 : 1); ctx.fillStyle = col('shoe'); ctx.beginPath(); ctx.ellipse(P[i].x + dir * 0.15 * S, P[i].y + 0.05 * S, 0.42 * S, 0.24 * S, 0, 0, 7); ctx.fill(); });
  // back arm
  limb(P[1], P[3], P[4], col('hoodie'), 0.5 * S);
  ctx.fillStyle = col('skin'); ctx.beginPath(); circ(P[4].x, P[4].y, 0.26 * S); ctx.fill();
  // torso (hoodie)
  limb(P[1], P[2], null, col('hoodie'), 1.35 * S);
  // hoodie pocket + strings
  { const mx = (P[1].x + P[2].x) / 2, my = (P[1].y + P[2].y) / 2, a = Math.atan2(P[2].y - P[1].y, P[2].x - P[1].x) - Math.PI / 2;
    ctx.save(); ctx.translate(mx, my); ctx.rotate(a);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; roundRect(-0.45 * S, 0.25 * S, 0.9 * S, 0.45 * S, 0.12 * S); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.07 * S;
    ctx.beginPath(); ctx.moveTo(-0.18 * S, -0.95 * S); ctx.lineTo(-0.2 * S, -0.35 * S); ctx.moveTo(0.18 * S, -0.95 * S); ctx.lineTo(0.2 * S, -0.35 * S); ctx.stroke();
    ctx.restore(); }
  // front arm
  limb(P[1], P[5], P[6], col('hoodie'), 0.5 * S);
  ctx.fillStyle = col('skin'); ctx.beginPath(); circ(P[6].x, P[6].y, 0.26 * S); ctx.fill();
  // head
  drawHead(b, col);
  // ice block
  if (b.frozen > 0) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    P.forEach(p => { x0 = Math.min(x0, p.x - p.r); y0 = Math.min(y0, p.y - p.r); x1 = Math.max(x1, p.x + p.r); y1 = Math.max(y1, p.y + p.r); });
    const pad = 0.4 * S;
    ctx.fillStyle = 'rgba(180,230,255,0.38)'; ctx.strokeStyle = 'rgba(230,248,255,0.9)'; ctx.lineWidth = 3;
    roundRect(x0 - pad, y0 - pad - (b.hasBeanie ? 0.9 * S : 0), x1 - x0 + pad * 2, y1 - y0 + pad * 2 + (b.hasBeanie ? 0.9 * S : 0), 0.4 * S); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, y0 + S); ctx.lineTo(x0 + 0.6 * S, y0); ctx.moveTo(x0 + 0.1 * S, y0 + 2 * S); ctx.lineTo(x0 + 1.2 * S, y0 + 0.3 * S); ctx.stroke();
  }
  ctx.restore();
}

function drawHead(b, col) {
  const h = b.pts[0], n = b.pts[1], r = h.r;
  const a = Math.atan2(h.y - n.y, h.x - n.x) + Math.PI / 2;
  ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(a);
  // ears
  ctx.fillStyle = col('skin');
  ctx.beginPath(); circ(-r * 0.98, 0.1 * r, r * 0.22); circ(r * 0.98, 0.1 * r, r * 0.22); ctx.fill();
  // face
  ctx.beginPath(); circ(0, 0, r); ctx.fill();
  // hair (visible when beanie gone, and a fringe otherwise)
  ctx.fillStyle = col('hair');
  if (!b.hasBeanie) {
    ctx.beginPath(); ctx.arc(0, -0.15 * r, r * 0.98, Math.PI * 1.08, Math.PI * 1.92); ctx.closePath(); ctx.fill();
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 0.25 * r, -0.9 * r); ctx.lineTo(i * 0.3 * r + 0.15 * r, -1.25 * r); ctx.lineTo(i * 0.25 * r + 0.18 * r, -0.85 * r); ctx.fill(); }
  } else {
    ctx.beginPath(); ctx.moveTo(-0.9 * r, -0.35 * r); ctx.quadraticCurveTo(-0.5 * r, -0.05 * r, -0.2 * r, -0.4 * r); ctx.quadraticCurveTo(0.2 * r, -0.1 * r, 0.6 * r, -0.4 * r); ctx.lineTo(0.9 * r, -0.4 * r); ctx.lineTo(0.9 * r, -0.5 * r); ctx.lineTo(-0.9 * r, -0.5 * r); ctx.fill();
  }
  // cheeks + freckles
  ctx.fillStyle = 'rgba(255,110,110,0.25)';
  ctx.beginPath(); circ(-0.55 * r, 0.35 * r, 0.18 * r); circ(0.55 * r, 0.35 * r, 0.18 * r); ctx.fill();
  ctx.fillStyle = 'rgba(150,80,50,0.5)';
  [[-0.6, 0.22], [-0.48, 0.3], [-0.62, 0.38], [0.6, 0.22], [0.48, 0.3], [0.62, 0.38]].forEach(([x, y]) => { ctx.beginPath(); circ(x * r, y * r, 0.035 * r); ctx.fill(); });
  // eyes
  const ex = 0.36 * r, ey = 0.02 * r;
  ctx.strokeStyle = '#222'; ctx.fillStyle = '#222'; ctx.lineWidth = Math.max(1.5, 0.09 * r); ctx.lineCap = 'round';
  const stunned = !b.dead && b.stun > 0.3 && b.control === 0;
  if (b.dead) {
    [-ex, ex].forEach(x => { const s = 0.17 * r; ctx.beginPath(); ctx.moveTo(x - s, ey - s); ctx.lineTo(x + s, ey + s); ctx.moveTo(x + s, ey - s); ctx.lineTo(x - s, ey + s); ctx.stroke(); });
  } else if (b.hurtT > 0 && b.frozen <= 0) {
    ctx.beginPath(); ctx.moveTo(-ex - 0.17 * r, ey - 0.12 * r); ctx.lineTo(-ex + 0.12 * r, ey); ctx.lineTo(-ex - 0.17 * r, ey + 0.12 * r);
    ctx.moveTo(ex + 0.17 * r, ey - 0.12 * r); ctx.lineTo(ex - 0.12 * r, ey); ctx.lineTo(ex + 0.17 * r, ey + 0.12 * r); ctx.stroke();
  } else if (stunned) {
    [-ex, ex].forEach(x => { ctx.beginPath(); for (let t = 0; t < 12; t += 0.4) { const rr = t * 0.017 * r; ctx.lineTo(x + Math.cos(t + time * 8) * rr, ey + Math.sin(t + time * 8) * rr); } ctx.stroke(); });
  } else {
    const big = b.burn > 0 || b.frozen > 0 ? 1.25 : 1;
    // look toward finger
    const la = Math.atan2(b.lookY - h.y, b.lookX - h.x) - a, lx = Math.cos(la) * 0.06 * r, ly = Math.sin(la) * 0.06 * r;
    [-ex, ex].forEach(x => {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, ey, 0.2 * r * big, 0.24 * r * big, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#222'; ctx.beginPath(); circ(x + lx, ey + ly, 0.1 * r); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); circ(x + lx + 0.03 * r, ey + ly - 0.04 * r, 0.03 * r); ctx.fill();
    });
    // brows
    const worried = b.hp < 40 || b.burn > 0;
    ctx.strokeStyle = mix(C.hair, C.char, b.char); ctx.lineWidth = Math.max(1.5, 0.08 * r);
    ctx.beginPath();
    ctx.moveTo(-ex - 0.18 * r, ey - (worried ? 0.28 : 0.34) * r); ctx.lineTo(-ex + 0.18 * r, ey - (worried ? 0.4 : 0.34) * r);
    ctx.moveTo(ex + 0.18 * r, ey - (worried ? 0.28 : 0.34) * r); ctx.lineTo(ex - 0.18 * r, ey - (worried ? 0.4 : 0.34) * r);
    ctx.stroke();
  }
  // mouth
  ctx.strokeStyle = '#5a2020'; ctx.fillStyle = '#5a2020'; ctx.lineWidth = Math.max(1.5, 0.08 * r);
  const my = 0.5 * r;
  if (b.dead) {
    ctx.beginPath(); ctx.moveTo(-0.25 * r, my); ctx.lineTo(0.25 * r, my); ctx.stroke();
    ctx.fillStyle = '#ff7a8a'; ctx.beginPath(); ctx.ellipse(0.08 * r, my + 0.12 * r, 0.1 * r, 0.15 * r, 0.2, 0, 7); ctx.fill();
  } else if (b.hurtT > 0 || b.burn > 0 || stunned) {
    ctx.beginPath(); ctx.ellipse(0, my, 0.17 * r, b.burn > 0 ? 0.22 * r : 0.15 * r, 0, 0, 7); ctx.fill();
  } else if (b.frozen > 0) {
    ctx.beginPath(); for (let i = 0; i <= 6; i++) ctx.lineTo(-0.25 * r + i * 0.0833 * r, my + (i % 2 ? 0.05 : -0.05) * r); ctx.stroke();
  } else if (b.hp < 40) {
    ctx.beginPath(); ctx.arc(0, my + 0.18 * r, 0.2 * r, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(0, my - 0.12 * r, 0.22 * r, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
  }
  ctx.restore();
  if (b.hasBeanie) drawBeanie(h.x, h.y, a, r, b.char);
  // stun stars
  if (stunned && !b.dead) {
    for (let i = 0; i < 3; i++) { const t = time * 4 + i * 2.09; drawStar(h.x + Math.cos(t) * r * 1.2, h.y - r * 1.5 + Math.sin(t) * r * 0.3, 0.22 * S, '#ffd166'); }
  }
}

function drawStar(x, y, r, color, rot = 0) {
  ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, a = rot + i * Math.PI / 5 - Math.PI / 2; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}

function drawObjects() {
  for (const o of objects) {
    if (o.type === 'bomb') {
      ctx.fillStyle = '#1b1b22'; ctx.beginPath(); circ(o.x, o.y, o.r); ctx.fill();
      ctx.fillStyle = '#444'; ctx.fillRect(o.x - o.r * 0.3, o.y - o.r * 1.25, o.r * 0.6, o.r * 0.4);
      ctx.strokeStyle = '#c9a26b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(o.x, o.y - o.r * 1.2); ctx.quadraticCurveTo(o.x + o.r * 0.2, o.y - o.r * 1.6, o.x + o.r * 0.6, o.y - o.r * 1.3); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); circ(o.x - o.r * 0.35, o.y - o.r * 0.35, o.r * 0.25); ctx.fill();
      if (o.fuse < 0.6 && Math.floor(o.fuse * 12) % 2 === 0) { ctx.fillStyle = 'rgba(255,60,60,0.5)'; ctx.beginPath(); circ(o.x, o.y, o.r); ctx.fill(); }
    } else if (o.type === 'rocket') {
      const a = Math.atan2(o.vy, o.vx);
      ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(a);
      const L = 1.4 * S, w = 0.38 * S;
      ctx.fillStyle = '#ff8c42'; ctx.beginPath(); ctx.moveTo(-L / 2, -w * 0.6); ctx.lineTo(-L / 2 - rand(0.4, 0.9) * S, 0); ctx.lineTo(-L / 2, w * 0.6); ctx.fill();
      ctx.fillStyle = '#e8e8ef'; roundRect(-L / 2, -w / 2, L * 0.8, w, w / 2); ctx.fill();
      ctx.fillStyle = '#e6463c'; ctx.beginPath(); ctx.moveTo(L * 0.3, -w / 2); ctx.lineTo(L / 2 + 0.1 * S, 0); ctx.lineTo(L * 0.3, w / 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-L / 2, -w / 2); ctx.lineTo(-L / 2 - 0.2 * S, -w); ctx.lineTo(-L / 4, -w / 2); ctx.moveTo(-L / 2, w / 2); ctx.lineTo(-L / 2 - 0.2 * S, w); ctx.lineTo(-L / 4, w / 2); ctx.fill();
      ctx.restore();
    } else if (o.type === 'boulder') {
      ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.rot);
      if (o.life < 1) ctx.globalAlpha = Math.max(0, o.life);
      ctx.fillStyle = '#8b8f99'; ctx.beginPath();
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, rr = o.r * (0.9 + 0.1 * Math.sin(i * 3.7)); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6b6f79'; ctx.beginPath(); circ(o.r * 0.3, o.r * 0.2, o.r * 0.25); circ(-o.r * 0.35, -o.r * 0.3, o.r * 0.15); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); circ(-o.r * 0.3, o.r * 0.35, o.r * 0.12); ctx.fill();
      ctx.restore();
    } else if (o.type === 'piano') {
      const x = o.x - o.w / 2, y = o.y - o.h / 2;
      ctx.fillStyle = '#1e1410'; roundRect(x, y, o.w, o.h * 0.75, 0.2 * S); ctx.fill();
      ctx.fillStyle = '#3d2214'; ctx.fillRect(x + 0.2 * S, y + 0.2 * S, o.w - 0.4 * S, o.h * 0.3);
      ctx.fillStyle = '#fff'; ctx.fillRect(x, y + o.h * 0.5, o.w, o.h * 0.22);
      ctx.fillStyle = '#111'; for (let i = 0; i < 14; i++) if (i % 7 !== 2 && i % 7 !== 6) ctx.fillRect(x + (i + 0.65) * o.w / 14, y + o.h * 0.5, o.w / 28, o.h * 0.13);
      ctx.fillStyle = '#1e1410'; ctx.fillRect(x + 0.2 * S, y + o.h * 0.72, 0.3 * S, o.h * 0.28); ctx.fillRect(x + o.w - 0.5 * S, y + o.h * 0.72, 0.3 * S, o.h * 0.28);
    }
  }
}

function drawHoles() {
  for (const h of holes) {
    const grow = Math.min(1, h.age * 3) * Math.min(1, h.life * 2);
    const R = 0.9 * S * grow;
    ctx.save(); ctx.translate(h.x, h.y);
    for (let i = 0; i < 3; i++) {
      ctx.rotate(time * (2 + i));
      ctx.strokeStyle = `rgba(${150 + i * 30},90,255,${0.5 - i * 0.12})`; ctx.lineWidth = 0.25 * S;
      ctx.beginPath(); ctx.ellipse(0, 0, R * (1.6 + i * 0.6), R * (1.2 + i * 0.4), 0, 0, Math.PI * 1.3); ctx.stroke();
    }
    const g = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R * 1.4);
    g.addColorStop(0, '#000'); g.addColorStop(0.7, '#000'); g.addColorStop(1, 'rgba(120,60,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); circ(0, 0, R * 1.4); ctx.fill();
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of particles) {
    const t = clamp(p.life / p.max, 0, 1);
    if (p.kind === 'smoke') { ctx.globalAlpha = t * 0.5; ctx.fillStyle = p.color; ctx.beginPath(); circ(p.x, p.y, p.size * (1.6 - t * 0.6)); ctx.fill(); }
    else if (p.kind === 'spark') { ctx.globalAlpha = t; ctx.fillStyle = p.color; ctx.beginPath(); circ(p.x, p.y, p.size * t); ctx.fill(); }
    else if (p.kind === 'flame') {
      ctx.globalAlpha = Math.min(1, t * 1.6); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = t > 0.6 ? '#fff3b0' : t > 0.3 ? '#ffb347' : '#ff5a36';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * t * 0.7, p.size * t * 1.2, 0, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    else if (p.kind === 'shard') {
      ctx.globalAlpha = Math.min(1, t * 2); ctx.fillStyle = p.color;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.6, p.size * 0.5); ctx.lineTo(-p.size * 0.5, p.size * 0.4); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    else if (p.kind === 'star') { ctx.globalAlpha = t; drawStar(p.x, p.y, p.size, '#ffd166', p.rot); }
    else if (p.kind === 'ring') { ctx.globalAlpha = t; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6 * t; ctx.beginPath(); circ(p.x, p.y, p.size * (1 - t * 0.7)); ctx.stroke(); }
    else if (p.kind === 'emoji') { ctx.globalAlpha = t; ctx.font = `${p.size}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.ch, p.x, p.y); }
  }
  ctx.globalAlpha = 1;
}

function drawBolts() {
  for (const bl of bolts) {
    ctx.strokeStyle = '#fff'; ctx.shadowColor = '#7fd4ff'; ctx.shadowBlur = 20; ctx.lineJoin = 'miter';
    for (let pass = 0; pass < 2; pass++) {
      ctx.lineWidth = pass ? 0.12 * S : 0.3 * S; ctx.strokeStyle = pass ? '#fff' : '#9fe0ff';
      ctx.beginPath(); ctx.moveTo(bl.x0, bl.y0);
      const n = 9;
      for (let i = 1; i < n; i++) { const t = i / n; ctx.lineTo(bl.x0 + (bl.x1 - bl.x0) * t + rand(-0.8, 0.8) * S, bl.y0 + (bl.y1 - bl.y0) * t); }
      ctx.lineTo(bl.x1, bl.y1); ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
}

function drawGhosts() {
  for (const g of ghosts) {
    const a = Math.min(1, g.t * 2) * Math.min(1, (2.2 - g.t) * 1.5) * 0.8;
    const r = 0.9 * S, x = g.x + Math.sin(g.t * 4) * 0.4 * S, y = g.y;
    ctx.globalAlpha = a;
    ctx.fillStyle = '#f2f6ff';
    ctx.beginPath(); ctx.arc(x, y, r, Math.PI, 0); ctx.lineTo(x + r, y + 1.3 * r);
    for (let i = 0; i < 4; i++) { const sx = x + r - (i + 0.5) * r / 2; ctx.quadraticCurveTo(sx, y + 1.3 * r + Math.sin(g.t * 10 + i) * 0.25 * r + 0.25 * r, x + r - (i + 1) * r / 2, y + 1.3 * r); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#334'; ctx.beginPath(); ctx.ellipse(x - 0.32 * r, y, 0.12 * r, 0.18 * r, 0, 0, 7); ctx.ellipse(x + 0.32 * r, y, 0.12 * r, 0.18 * r, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y + 0.45 * r, 0.12 * r, 0.16 * r, 0, 0, 7); ctx.fill();
    drawBeanie(x, y, 0, r, 0);
    ctx.globalAlpha = 1;
  }
}

function drawSpeech(b) {
  if (!b.speech || b.hidden || b.dead) return;
  const h = b.pts[0];
  ctx.font = `800 ${Math.round(0.5 * S + 4)}px -apple-system, system-ui, sans-serif`;
  const tw = ctx.measureText(b.speech.text).width, pad = 10, bw = tw + pad * 2, bh = 0.5 * S + 22;
  let x = clamp(h.x - bw / 2, 6, W - bw - 6), y = Math.max(ceilY + 4, h.y - h.r * 2.6 - bh);
  ctx.globalAlpha = Math.min(1, b.speech.t * 4);
  ctx.fillStyle = '#fff'; roundRect(x, y, bw, bh, 12); ctx.fill();
  ctx.beginPath(); const tx = clamp(h.x, x + 14, x + bw - 14); ctx.moveTo(tx - 8, y + bh - 1); ctx.lineTo(tx, y + bh + 10); ctx.lineTo(tx + 8, y + bh - 1); ctx.fill();
  ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.speech.text, x + bw / 2, y + bh / 2 + 1);
  ctx.globalAlpha = 1;
}

function drawFloaters() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of floaters) {
    const t = f.life;
    ctx.globalAlpha = Math.min(1, t * 3);
    ctx.font = `900 ${Math.round(f.size * S)}px -apple-system, system-ui, sans-serif`;
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function drawAshes() {
  for (const a of ashes) {
    ctx.globalAlpha = Math.min(1, a.life);
    ctx.fillStyle = '#3a3636'; ctx.beginPath(); ctx.ellipse(a.x, floorY, 1.5 * S, 0.8 * S, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#555'; ctx.beginPath(); ctx.ellipse(a.x - 0.4 * S, floorY - 0.4 * S, 0.5 * S, 0.25 * S, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const sx = shake > 0.5 ? rand(-shake, shake) : 0, sy = shake > 0.5 ? rand(-shake, shake) : 0;
  ctx.translate(sx, sy);
  drawRoom();
  drawHoles();
  drawAshes();
  for (const f of fires) { ctx.fillStyle = 'rgba(255,120,40,0.25)'; ctx.beginPath(); ctx.ellipse(f.x, floorY, 1.2 * S, 0.3 * S, 0, 0, 7); ctx.fill(); }
  for (const bn of beanies) {
    const s = bn.gone > 0 ? Math.max(0, 1 - bn.gone) : 1;
    if (bn.life < 1) ctx.globalAlpha = Math.max(0, bn.life);
    drawBeanie(bn.x, bn.y, bn.rot + bn.gone * 10, bn.r * s, bn.char);
    ctx.globalAlpha = 1;
  }
  if (angus) drawAngus(angus);
  drawObjects();
  drawParticles();
  drawBolts();
  drawGhosts();
  if (angus) drawSpeech(angus);
  drawFloaters();
  if (flash > 0) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.globalAlpha = Math.min(0.8, flash * 2); ctx.fillStyle = flashColor; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
}

// ---------- HUD / UI ----------
const hpFill = document.getElementById('hpFill');
function updateHud() {
  const hp = angus ? Math.max(0, angus.hp) : 0;
  hpFill.style.width = hp + '%';
  hpFill.classList.toggle('low', hp < 35);
  document.getElementById('killCount').textContent = save.kills;
  document.getElementById('wayCount').textContent = `${foundCount()}/${WEAPONS.length}`;
}

let bannerTimer = 0;
function showBanner(main, sub) {
  const el = document.getElementById('banner');
  document.getElementById('bannerMain').textContent = main;
  document.getElementById('bannerSub').textContent = sub || '';
  el.classList.remove('hidden', 'show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}

function renderTools() {
  const nav = document.getElementById('tools');
  nav.innerHTML = '';
  for (const w of WEAPONS) {
    const btn = document.createElement('button');
    btn.className = 'tool' + (w.id === weapon ? ' sel' : '');
    btn.innerHTML = `<span class="ic">${w.icon}</span><span class="lb">${w.name}</span>` + (save.counts[w.id] ? '<i class="dot"></i>' : '');
    btn.addEventListener('click', () => {
      weapon = w.id; Snd.init();
      nav.querySelectorAll('.tool').forEach(t => t.classList.remove('sel')); btn.classList.add('sel');
      showHint(w.how);
    });
    nav.appendChild(btn);
  }
}

let hintTimer = 0;
function showHint(text) {
  const el = document.getElementById('hint');
  el.textContent = text; el.classList.remove('gone');
  clearTimeout(hintTimer); hintTimer = setTimeout(hideHint, 2200);
}
function hideHint() { document.getElementById('hint').classList.add('gone'); }

function openBook() {
  const grid = document.getElementById('bookGrid');
  grid.innerHTML = '';
  for (const w of WEAPONS) {
    const n = save.counts[w.id] || 0;
    const d = document.createElement('div');
    d.className = 'way' + (n ? '' : ' locked');
    d.innerHTML = `<span class="ic">${w.icon}</span><div><b>${n ? 'Angus ' + w.verb.toLowerCase() : '???'}</b><small>${n ? 'x' + n : w.how}</small></div>`;
    grid.appendChild(d);
  }
  document.getElementById('bookSummary').textContent = `${foundCount()} of ${WEAPONS.length} ways discovered · ${save.kills} total KOs`;
  document.getElementById('book').classList.remove('hidden');
}
document.getElementById('bookBtn').addEventListener('click', () => { Snd.init(); openBook(); });
document.getElementById('bookClose').addEventListener('click', () => document.getElementById('book').classList.add('hidden'));
document.getElementById('book').addEventListener('click', e => { if (e.target.id === 'book') e.target.classList.add('hidden'); });
document.getElementById('resetBtn').addEventListener('click', () => {
  if (!confirm('Reset all progress?')) return;
  save.kills = 0; save.counts = {}; persist(); updateHud(); renderTools(); openBook();
});
const soundBtn = document.getElementById('soundBtn');
function syncSoundBtn() { soundBtn.textContent = save.muted ? '🔇' : '🔊'; }
soundBtn.addEventListener('click', () => { save.muted = !save.muted; persist(); Snd.init(); Snd.setMuted(save.muted); syncSoundBtn(); });

// ---------- input ----------
let activePointer = null;
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); Snd.init();
  const x = e.clientX, y = e.clientY;
  if (angus) { angus.lookX = x; angus.lookY = y; }
  if (y < ceilY || y > floorY + 10) return;
  if (weapon === 'grab') {
    if (!angus || angus.hidden || angus.vanish) return;
    const i = nearestPoint(angus, x, y, 2.4 * S);
    if (i < 0) return;
    hideHint();
    activePointer = e.pointerId;
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    angus.grab = { idx: i, tx: x, ty: y };
    angus.stun = Math.max(angus.stun, 0.5);
    if (!angus.dead && Math.random() < 0.4) say(angus, pick(['Put me down!', 'Whoa whoa whoa', 'Hey!', 'Easy...']));
  } else {
    useWeapon(x, y);
  }
});
cv.addEventListener('pointermove', e => {
  if (e.pointerId !== activePointer || !angus || !angus.grab) return;
  angus.grab.tx = clamp(e.clientX, 0, W); angus.grab.ty = clamp(e.clientY, ceilY, floorY);
  angus.lookX = e.clientX; angus.lookY = e.clientY;
});
function release(e) {
  if (e.pointerId !== activePointer) return;
  activePointer = null;
  if (angus && angus.grab) {
    angus.grab = null; angus.flungBy = 'grab'; angus.stun = Math.max(angus.stun, 1.2);
    const p = angus.pts[2]; if (Math.hypot(p.x - p.px, p.y - p.py) > 0.6 * S) Snd.whoosh();
  }
}
cv.addEventListener('pointerup', release);
cv.addEventListener('pointercancel', release);
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('touchmove', e => { if (!e.target.closest('#tools, .book')) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', e => e.preventDefault());

// ---------- main loop ----------
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  let steps = 0;
  while (acc >= DT && steps < 4) { stepWorld(); acc -= DT; steps++; }
  if (steps === 4) acc = 0;
  render();
  if (angus) {
    const pct = Math.max(0, angus.hp);
    if (hpFill._last !== Math.round(pct)) { hpFill._last = Math.round(pct); updateHud(); }
  }
  requestAnimationFrame(frame);
}

function start() {
  renderTools(); syncSoundBtn();
  layout();
  angus = makeAngus(W / 2, floorY);
  angus.stun = 0; angus.control = 1;
  updateHud();
  setTimeout(() => say(angus, 'Hi, I\'m Angus! Nice beanie, right?', true), 600);
  requestAnimationFrame(t => { last = t; frame(t); });
}
window.addEventListener('resize', () => {
  const oldFloor = floorY; layout();
  if (angus) { const dy = floorY - oldFloor; angus.pts.forEach(p => { p.y += dy; p.py += dy; p.x = clamp(p.x, p.r, W - p.r); p.px = clamp(p.px, p.r, W - p.r); }); }
});
window.addEventListener('load', start);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
