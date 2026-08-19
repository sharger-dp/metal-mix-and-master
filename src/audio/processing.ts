/* Офлайн-обработка аудио: тюнинг в тональность + квантизация в сетку */

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function makeBuffer(ch: number, len: number, sr: number): AudioBuffer {
  return new OfflineAudioContext(ch, Math.max(8, len), sr).createBuffer(ch, len, sr);
}

function monoOf(src: AudioBuffer): Float32Array {
  const n = src.numberOfChannels;
  const out = new Float32Array(src.length);
  for (let c = 0; c < n; c++) {
    const d = src.getChannelData(c);
    for (let i = 0; i < d.length; i++) out[i] += d[i] / n;
  }
  return out;
}

const interp = (data: Float32Array, pos: number): number => {
  const i = Math.floor(pos);
  if (i < 0) return 0;
  if (i >= data.length - 1) return i < data.length ? data[i] : 0;
  const f = pos - i;
  return data[i] + (data[i + 1] - data[i]) * f;
};

const median3 = (a: number[]): number[] =>
  a.map((_, i) => {
    const x = a[Math.max(0, i - 1)], y = a[i], z = a[Math.min(a.length - 1, i + 1)];
    return [x, y, z].sort((p, q) => p - q)[1];
  });

/* ============ ДЕТЕКЦИЯ ВЫСОТЫ (NSDF на децимированном сигнале) ============ */

type Frame = { t: number; cents: number };

function centsToScale(f: number, rootMidi: number, scale: number[], amount: number): number {
  const midi = 69 + 12 * Math.log2(f / 440);
  let bestS = Math.round(midi);
  let bestD = 1e9;
  for (let s = Math.floor(midi) - 8; s <= Math.ceil(midi) + 8; s++) {
    const pc = ((s - rootMidi) % 12 + 12) % 12;
    if (!scale.includes(pc)) continue;
    const d = Math.abs(midi - s);
    if (d < bestD) { bestD = d; bestS = s; }
  }
  return Math.max(-70, Math.min(70, (bestS - midi) * 100)) * amount;
}

async function detectFrames(
  mono: Float32Array, sr: number, rootMidi: number, scale: number[], amount: number,
  onP: (p: number) => void,
): Promise<{ frames: Frame[]; frameDt: number }> {
  const srD = sr / 2;
  const N = mono.length >> 1;
  const ds = new Float32Array(N);
  for (let i = 0; i < N; i++) ds[i] = mono[2 * i];

  const win = 1024, hop = 512;
  const lagMin = Math.max(20, Math.floor(srD / 700));
  const lagMax = Math.min(win - 2, Math.ceil(srD / 65));
  const frames: Frame[] = [];
  const frameDt = (hop * 2) / sr;

  const corrAt = (s: number, lag: number, e1: number): number => {
    let num = 0, d2 = 0;
    for (let i = 0; i < win; i++) {
      const b = ds[s + i + lag];
      num += ds[s + i] * b;
      d2 += b * b;
    }
    return num / Math.sqrt(e1 * d2 + 1e-9);
  };

  let count = 0;
  for (let s = 0; s + win + lagMax <= N; s += hop) {
    let e1 = 0, rms = 0;
    for (let i = 0; i < win; i++) { const v = ds[s + i]; e1 += v * v; rms += v * v; }
    rms = Math.sqrt(rms / win);

    let cents = 0;
    if (rms > 0.012) {
      let best = 0, bestLag = lagMin;
      for (let lag = lagMin; lag <= lagMax; lag++) {
        const ncc = corrAt(s, lag, e1);
        if (ncc > best) { best = ncc; bestLag = lag; }
      }
      if (best > 0.56 && bestLag > lagMin && bestLag < lagMax) {
        const y0 = corrAt(s, bestLag - 1, e1);
        const y2 = corrAt(s, bestLag + 1, e1);
        const den = y0 - 2 * best + y2;
        const shift = den !== 0 ? (0.5 * (y0 - y2)) / den : 0;
        const f = srD / (bestLag + Math.max(-1, Math.min(1, shift)));
        if (f > 60 && f < 900) cents = centsToScale(f, rootMidi, scale, amount);
      }
    }
    frames.push({ t: ((s + win / 2) * 2) / sr, cents });
    if (++count % 260 === 0) { onP(Math.min(0.55, (s / N) * 0.55)); await tick(); }
  }
  return { frames, frameDt };
}

/* ============ ТЮНИНГ (granular OLA pitch shift) ============ */

export async function tuneBuffer(
  src: AudioBuffer, rootMidi: number, scale: number[], amount: number,
  onP: (p: number) => void,
): Promise<AudioBuffer> {
  const sr = src.sampleRate, len = src.length, nch = src.numberOfChannels;
  const mono = monoOf(src);

  const { frames, frameDt } = await detectFrames(mono, sr, rootMidi, scale, amount, onP);
  const centsArr = median3(frames.map((f) => f.cents));
  const centsAt = (tSec: number): number => {
    if (!centsArr.length) return 0;
    const x = Math.max(0, Math.min(centsArr.length - 1.001, tSec / frameDt));
    const i = Math.floor(x);
    const f = x - i;
    return centsArr[i] * (1 - f) + centsArr[i + 1] * f;
  };

  const out = makeBuffer(nch, len, sr);
  const grain = 4096, hopF = 1024;
  const hann = new Float32Array(grain);
  for (let i = 0; i < grain; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (grain - 1));

  for (let ch = 0; ch < nch; ch++) {
    const inp = src.getChannelData(ch);
    const outp = out.getChannelData(ch);
    const wsum = new Float32Array(len);
    for (let p = 0; p < len; p += hopF) {
      const c = centsAt((p + grain / 2) / sr);
      const gEnd = Math.min(grain, len - p);
      if (Math.abs(c) < 0.5) {
        for (let i = 0; i < gEnd; i++) { outp[p + i] += inp[p + i] * hann[i]; wsum[p + i] += hann[i]; }
      } else {
        const r = Math.pow(2, c / 1200);
        for (let i = 0; i < gEnd; i++) {
          const pos = p + i * r;
          if (pos < len - 1) { outp[p + i] += interp(inp, pos) * hann[i]; wsum[p + i] += hann[i]; }
        }
      }
      if (p % (hopF * 24) === 0) { onP(0.55 + ((ch + p / len) / nch) * 0.44); await tick(); }
    }
    for (let i = 0; i < len; i++) if (wsum[i] > 0.25) outp[i] /= wsum[i];
  }
  onP(1);
  return out;
}

/* ============ КВАНТИЗАЦИЯ В СЕТКУ (time warp к ближайшим долям) ============ */

export async function quantizeBuffer(
  src: AudioBuffer, bpm: number, subdiv: number, strength: number,
  onP: (p: number) => void,
): Promise<AudioBuffer> {
  const sr = src.sampleRate, len = src.length, nch = src.numberOfChannels;
  const T = 60 / bpm / subdiv;
  const mono = monoOf(src);
  const w = Math.max(8, Math.min(Math.round(0.05 * sr), Math.round(T * 0.45 * sr)));

  const deltas: number[] = [];
  const total = Math.floor(len / (T * sr)) + 1;
  for (let k = 0; k <= total; k++) {
    const g = Math.round(k * T * sr);
    if (g >= len) { deltas.push(0); continue; }
    const a = Math.max(0, g - w), b = Math.min(len - 1, g + w);
    let peak = 0;
    for (let i = a; i <= b; i++) { const v = Math.abs(mono[i]); if (v > peak) peak = v; }
    let d = 0;
    if (peak > 0.035) {
      const thr = peak * 0.5;
      let pos = g;
      for (let i = a; i <= b; i++) if (Math.abs(mono[i]) > thr) { pos = i; break; }
      d = Math.max(-T * 0.4, Math.min(T * 0.4, (pos - g) / sr));
    }
    deltas.push(d * strength);
    if (k % 40 === 0) { onP((k / total) * 0.25); await tick(); }
  }
  const sm = median3(deltas);

  const out = makeBuffer(nch, len, sr);
  for (let ch = 0; ch < nch; ch++) {
    const inp = src.getChannelData(ch);
    const outp = out.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      let k = Math.floor(t / T);
      if (k < 0) k = 0;
      if (k >= sm.length - 1) k = Math.max(0, sm.length - 2);
      const f = (t - k * T) / T;
      const d = sm[k] * (1 - f) + sm[k + 1] * f;
      outp[i] = interp(inp, i + d * sr);
      if (i % (sr * 2) === 0) { onP(0.25 + ((ch + i / len) / nch) * 0.74); await tick(); }
    }
  }
  onP(1);
  return out;
}

/* ============ WAV ============ */

export function encodeWav(buf: AudioBuffer): Blob {
  const nch = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length;
  const bytes = 44 + len * nch * 2;
  const ab = new ArrayBuffer(bytes);
  const dv = new DataView(ab);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); dv.setUint32(4, bytes - 8, true); ws(8, "WAVEfmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nch, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * nch * 2, true);
  dv.setUint16(32, nch * 2, true); dv.setUint16(34, 16, true);
  ws(36, "data"); dv.setUint32(40, len * nch * 2, true);
  const chs: Float32Array[] = [];
  for (let c = 0; c < nch; c++) chs.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++)
    for (let c = 0; c < nch; c++) {
      const v = Math.max(-1, Math.min(1, chs[c][i]));
      dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  return new Blob([ab], { type: "audio/wav" });
}

/* ============ ПИКИ ДЛЯ ВОЛНЫ ============ */

export function computePeaks(buf: AudioBuffer, buckets: number): Float32Array {
  const mono = monoOf(buf);
  const out = new Float32Array(buckets);
  const per = Math.max(1, Math.floor(mono.length / buckets));
  for (let b = 0; b < buckets; b++) {
    let mx = 0;
    const s = b * per, e = Math.min(mono.length, s + per);
    for (let i = s; i < e; i += 4) { const v = Math.abs(mono[i]); if (v > mx) mx = v; }
    out[b] = mx;
  }
  return out;
}
