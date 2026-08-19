/* Генерация демонстрационного метал-мультитрека (150 BPM, E minor, 8 тактов) */

const SR = 44100;
const BPM = 150;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const BARS = 8;
const DUR = BAR * BARS;
const N = Math.ceil(DUR * SR);
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

type Buf = { L: Float32Array<ArrayBuffer>; R: Float32Array<ArrayBuffer> };
const mk = (): Buf => ({ L: new Float32Array(N), R: new Float32Array(N) });
/* запись со стерео-балансом (equal power) */
const add = (b: Buf, idx: number, v: number, pan = 0) => {
  if (idx < 0 || idx >= N) return;
  b.L[idx] += v * Math.sqrt(0.5 * (1 - pan));
  b.R[idx] += v * Math.sqrt(0.5 * (1 + pan));
};

const soft = (x: number) => { const y = x * 1.6; return y / (1 + Math.abs(y)); };

function kick(b: Buf, t0: number, g = 1) {
  const n = Math.floor(0.12 * SR); let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 47 + 120 * Math.exp(-t / 0.016);
    ph += (2 * Math.PI * f) / SR;
    const v = (Math.sin(ph) * 0.9 + (Math.random() * 2 - 1) * Math.exp(-t / 0.0035) * 0.55)
      * Math.exp(-t / 0.058) * g;
    add(b, Math.floor(t0 * SR) + i, v);
  }
}

function snare(b: Buf, t0: number, g = 1) {
  const n = Math.floor(0.17 * SR); let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * 187) / SR;
    const v = ((Math.random() * 2 - 1) * 0.65 + Math.sin(ph) * 0.45) * Math.exp(-t / 0.075) * g;
    add(b, Math.floor(t0 * SR) + i, v, -0.08);
  }
}

function hat(b: Buf, t0: number, g: number, open = false) {
  const n = Math.floor((open ? 0.12 : 0.04) * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    add(b, Math.floor(t0 * SR) + i, (Math.random() * 2 - 1) * Math.exp(-t / (open ? 0.05 : 0.016)) * g, 0.18);
  }
}

function tom(b: Buf, t0: number, f: number, g = 1) {
  const n = Math.floor(0.3 * SR); let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * f * (1 + 0.5 * Math.exp(-t / 0.03))) / SR;
    add(b, Math.floor(t0 * SR) + i, (Math.sin(ph) * 0.8 + (Math.random() * 2 - 1) * 0.15) * Math.exp(-t / 0.14) * g);
  }
}

function bassNote(b: Buf, t0: number, dur: number, f: number, g = 1) {
  const n = Math.floor(dur * SR); let ph = 0, ph2 = 0, lp = 0;
  const a = 1 - Math.exp((-2 * Math.PI * 900) / SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * f) / SR; ph2 += (2 * Math.PI * f * 0.5) / SR;
    const saw = 2 * ((ph / (2 * Math.PI)) % 1) - 1;
    const sq = Math.sin(ph2) > 0 ? 0.5 : -0.5;
    lp += (soft(saw * 0.7 + sq * 0.3) - lp) * a;
    const env = t < 0.004 ? t / 0.004 : Math.exp(-(t - 0.004) / (dur * 0.6));
    add(b, Math.floor(t0 * SR) + i, lp * env * g);
  }
}

function gtr(b: Buf, t0: number, dur: number, fs: number[], g: number, pan = 0, choke = true) {
  const n = Math.floor(dur * SR);
  const phs = fs.map((f) => [f * 1.006, f * 0.994].map((ff) => ({ ff, ph: Math.random() * 6 })));
  let hp = 0, lp = 0;
  const aH = 1 - Math.exp((-2 * Math.PI * 120) / SR);
  const aL = 1 - Math.exp((-2 * Math.PI * 3300) / SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let x = 0;
    for (const pair of phs) for (const o of pair) {
      o.ph += (2 * Math.PI * o.ff) / SR;
      x += 2 * ((o.ph / (2 * Math.PI)) % 1) - 1;
    }
    x = Math.tanh(x * 0.9);
    lp += (x - lp) * aL;
    hp += (lp - hp) * aH;
    const env = choke
      ? (t < 0.002 ? t / 0.002 : Math.exp(-(t - 0.002) / (dur * 0.42)))
      : (t < 0.02 ? t / 0.02 : Math.exp(-(t - 0.02) / (dur * 0.8)));
    add(b, Math.floor(t0 * SR) + i, hp * env * g, pan);
  }
}

function pad(b: Buf, t0: number, dur: number, fs: number[], g: number, pan = 0) {
  const n = Math.floor(dur * SR);
  const osc = fs.map((f) => ({ f, ph: Math.random() * 6 }));
  let lp = 0;
  const aL = 1 - Math.exp((-2 * Math.PI * 1150) / SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let x = 0;
    for (const o of osc) { o.ph += (2 * Math.PI * o.f) / SR; x += 2 * ((o.ph / (2 * Math.PI)) % 1) - 1; }
    lp += (x / osc.length - lp) * aL;
    const atk = Math.min(1, t / 0.28);
    const rel = Math.min(1, Math.max(0, (dur - t) / 0.3));
    add(b, Math.floor(t0 * SR) + i, lp * atk * rel * g, pan);
  }
}

function lead(b: Buf, t0: number, dur: number, f: number, g: number, pan = 0) {
  const n = Math.floor((dur + 0.6) * SR); let ph = 0, lp = 0;
  const aL = 1 - Math.exp((-2 * Math.PI * 2700) / SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const vib = 1 + 0.005 * Math.sin(2 * Math.PI * 5.6 * Math.max(0, t - 0.12));
    ph += (2 * Math.PI * f * vib) / SR;
    let x = 2 * ((ph / (2 * Math.PI)) % 1) - 1;
    x = Math.tanh(x * 1.4);
    lp += (x - lp) * aL;
    let env = t < 0.008 ? t / 0.008 : Math.exp(-(t - 0.008) / (dur * 0.7));
    if (t > dur) env *= Math.max(0, 1 - (t - dur) / 0.05);
    let v = lp * env * g;
    if (t > 0.29) v += lp * env * g * 0.35;
    add(b, Math.floor(t0 * SR) + i, v, pan);
  }
}

class Res {
  a1: number; a2: number; g: number; y1 = 0; y2 = 0;
  constructor(fc: number, q: number) {
    const r = Math.exp(-Math.PI * fc / (q * SR));
    this.a1 = 2 * r * Math.cos((2 * Math.PI * fc) / SR);
    this.a2 = -r * r;
    this.g = (1 - r * r) * 0.9;
  }
  proc(x: number) {
    const y = x + this.a1 * this.y1 + this.a2 * this.y2;
    this.y2 = this.y1; this.y1 = y;
    return y * this.g;
  }
}

function vox(b: Buf, t0: number, dur: number, f: number, g: number, pan = 0, growl = 1) {
  const n = Math.floor((dur + 0.08) * SR); let ph = 0, hp = 0, prev = 0;
  const r1 = new Res(f < 200 ? 750 : 700, 7);
  const r2 = new Res(1220, 9);
  const aH = 1 - Math.exp((-2 * Math.PI * 95) / SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * f * (1 + 0.004 * Math.sin(2 * Math.PI * 5 * t))) / SR;
    let x = 2 * ((ph / (2 * Math.PI)) % 1) - 1;
    x = soft(x * (1.2 + growl)) + (Math.random() * 2 - 1) * 0.03;
    const y = r1.proc(x) * 0.9 + r2.proc(x) * 0.55;
    hp += (y - prev) * aH; prev = y;
    const atk = Math.min(1, t / 0.035);
    const rel = t > dur ? Math.max(0, 1 - (t - dur) / 0.07) : 1;
    add(b, Math.floor(t0 * SR) + i, (y * 0.6 + hp * 0.4) * atk * rel * g, pan);
  }
}

/* ============ паттерны ============ */

export async function generateDemo(onP?: (p: number) => void): Promise<Record<string, AudioBuffer>> {
  const kickB = mk(), drumB = mk(), bassB = mk(), stacB = mk(), smoothB = mk();
  const soloB = mk(), fxB = mk(), voxB = mk(), dblB = mk(), bkvB = mk(), airB = mk();

  const roots = [40, 40, 36, 38, 40, 36, 38, 43]; // E E C D E C D B
  const melody = [
    [64, 67, 69, 71], [71, 69, 67, 64], [64, 67, 69, 71], [74, 71, 69, 67],
    [64, 67, 69, 71], [74, 71, 69, 67], [64, 67, 69, 71], [71, 69, 67, 64],
  ];
  const soloRuns = [
    [64, 67, 69, 71, 74, 71, 69, 67, 64, 67, 69, 71, 74, 76, 74, 71],
    [74, 71, 74, 76, 74, 71, 69, 67, 69, 71, 69, 67, 64, 67, 69, 71],
    [76, 74, 71, 74, 76, 79, 76, 74, 71, 69, 67, 69, 71, 74, 71, 69],
    [67, 69, 71, 74, 71, 69, 67, 64, 62, 64, 67, 69, 71, 74, 76, 64],
  ];

  for (let bar = 0; bar < BARS; bar++) {
    const t0 = bar * BAR;
    const r = roots[bar];

    for (let e = 0; e < 8; e++) kick(kickB, t0 + (e * BEAT) / 2, e % 2 === 0 ? 1 : 0.82);
    snare(drumB, t0 + BEAT); snare(drumB, t0 + 3 * BEAT);
    for (let s = 0; s < 16; s++) hat(drumB, t0 + (s * BEAT) / 4, s % 4 === 0 ? 0.3 : 0.15, s % 8 === 7);
    if (bar === BARS - 1) for (let s = 8; s < 16; s++) snare(drumB, t0 + (s * BEAT) / 4, 0.55);
    if (bar === BARS - 2) { tom(drumB, t0 + 3 * BEAT, 130); tom(drumB, t0 + 3.5 * BEAT, 98); }

    for (let e = 0; e < 8; e++) {
      const f = e === 7 && bar < BARS - 1 ? roots[bar + 1] - 1 : r;
      bassNote(bassB, t0 + (e * BEAT) / 2, BEAT * 0.47, mtof(f - 0), 0.95);
    }

    for (let s = 0; s < 16; s++) {
      const t = t0 + (s * BEAT) / 4;
      const open = s === 0 || s === 8;
      gtr(stacB, t, open ? 0.16 : 0.085, [mtof(r), mtof(r + 7), mtof(r + 12)], open ? 0.4 : 0.3, 0.2);
      gtr(stacB, t, open ? 0.16 : 0.085, [mtof(r), mtof(r + 7)], open ? 0.4 : 0.3, -0.2);
    }

    pad(smoothB, t0, BAR * 0.99, [mtof(r + 12), mtof(r + 19), mtof(r + 24)], 0.3, bar % 2 ? 0.25 : -0.25);

    if (bar >= 4) {
      const run = soloRuns[bar - 4];
      for (let s = 0; s < 16; s++)
        lead(soloB, t0 + (s * BEAT) / 4, s === 15 ? 0.5 : 0.11, mtof(run[s]), 0.42, 0.15);
    }

    const mel = melody[bar];
    for (let q = 0; q < 4; q++) {
      const long = bar === BARS - 1 && q === 3;
      const d = long ? BEAT * 1.9 : BEAT * 0.92;
      vox(voxB, t0 + q * BEAT, d, mtof(mel[q]), 0.5, 0, 0.9);
      vox(dblB, t0 + q * BEAT, d, mtof(mel[q]) * 1.008, 0.22, -0.4, 0.6);
      vox(dblB, t0 + q * BEAT, d, mtof(mel[q]) * 0.992, 0.22, 0.4, 0.6);
      if (bar >= 4) {
        vox(bkvB, t0 + q * BEAT, BEAT * 0.95, mtof(mel[q] - 12), 0.16, -0.3, 0.3);
        vox(bkvB, t0 + q * BEAT, BEAT * 0.95, mtof(mel[q] - 5 > 40 ? mel[q] - 5 : mel[q] - 7), 0.14, 0.3, 0.3);
      }
    }

    onP?.((bar + 1) / BARS * 0.85);
    await new Promise((r2) => setTimeout(r2, 0));
  }

  /* FX: райзер в такте 4 + удар в такте 5 */
  const rN = Math.floor(BAR * SR);
  let lpA = 0;
  const aStep = () => 1 - Math.exp((-2 * Math.PI * 300) / SR);
  for (let i = 0; i < rN; i++) {
    const t = i / SR;
    const pr = i / rN;
    const fc = 300 + 3600 * pr * pr;
    const a = 1 - Math.exp((-2 * Math.PI * fc) / SR);
    lpA += ((Math.random() * 2 - 1) - lpA) * a;
    add(fxB, 3 * BAR * SR + i - 0, lpA * pr * 0.5, Math.sin(pr * 9) * 0.5);
  }
  kick(fxB, 4 * BAR, 1.4);
  for (let i = 0; i < 0.5 * SR; i++) {
    const t = i / SR;
    add(fxB, Math.floor(4 * BAR * SR) + i, (Math.random() * 2 - 1) * Math.exp(-t / 0.22) * 0.5);
  }
  void aStep;

  /* AIRs: медленный шумовой пэд */
  let l1 = 0, l2 = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const fc = 650 + 420 * Math.sin(2 * Math.PI * 0.06 * t);
    const a = 1 - Math.exp((-2 * Math.PI * fc) / SR);
    l1 += ((Math.random() * 2 - 1) - l1) * a;
    l2 += ((Math.random() * 2 - 1) - l2) * a;
    const g = 0.22 * (0.7 + 0.3 * Math.sin(2 * Math.PI * 0.11 * t));
    add(airB, i, (l1 + l2 * 0.5) * g, 0);
    airB.L[i] += l1 * g * 0.5; airB.R[i] += l2 * g * 0.5;
  }

  const oac = new OfflineAudioContext(2, 8, SR);
  const toBuf = (b: Buf): AudioBuffer => {
    const ab = oac.createBuffer(2, N, SR);
    ab.copyToChannel(b.L, 0);
    ab.copyToChannel(b.R, 1);
    return ab;
  };

  onP?.(1);
  return {
    kick: toBuf(kickB), bass: toBuf(bassB), drums: toBuf(drumB), fx: toBuf(fxB),
    solo: toBuf(soloB), smooth: toBuf(smoothB), stac: toBuf(stacB),
    vox: toBuf(voxB), dbl: toBuf(dblB), bkv: toBuf(bkvB), airs: toBuf(airB),
  };
}

export const DEMO_BPM = BPM;
