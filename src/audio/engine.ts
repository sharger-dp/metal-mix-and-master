import { TRACKS } from "./presets";
import type { CompState, EqState, MasterState } from "./presets";

export type TrackAudio = { eq: EqState; comp: CompState; fader: number; pan: number; pol: number; muted: boolean };

type Nodes = {
  input: GainNode; hpf: BiquadFilterNode; low: BiquadFilterNode; mid: BiquadFilterNode;
  high: BiquadFilterNode; comp: DynamicsCompressorNode; compOn: GainNode; compDry: GainNode;
  pan: StereoPannerNode; fader: GainNode; an: AnalyserNode; anBuf: Float32Array<ArrayBuffer>;
};

const db2g = (db: number) => Math.pow(10, db / 20);

function applyEq(nodes: Nodes, eq: EqState, t: number, tc: BaseAudioContext) {
  const set = (p: AudioParam, v: number) =>
    t >= 0 ? p.setTargetAtTime(v, tc.currentTime, 0.015) : (p.value = v);
  set(nodes.hpf.frequency, eq.hpf);
  set(nodes.low.frequency, eq.lf); set(nodes.low.gain, eq.lg);
  set(nodes.mid.frequency, eq.mf); set(nodes.mid.gain, eq.mg);
  set(nodes.high.frequency, eq.hf); set(nodes.high.gain, eq.hg);
}

function applyComp(nodes: Nodes, c: CompState, t: number, tc: BaseAudioContext) {
  const set = (p: AudioParam, v: number) =>
    t >= 0 ? p.setTargetAtTime(v, tc.currentTime, 0.015) : (p.value = v);
  set(nodes.comp.threshold, c.th);
  set(nodes.comp.ratio, c.ratio);
  set(nodes.comp.attack, c.atk / 1000);
  set(nodes.comp.release, c.rel / 1000);
  /* сухой/обходной путь при выключенном компрессоре */
  set(nodes.compOn.gain, c.on ? 1 : 0);
  set(nodes.compDry.gain, c.on ? 0 : 1);
  set(nodes.fader.gain, 1); // makeup применяется к фейдеру снаружи
}

export class Engine {
  ctx: AudioContext | null = null;
  private tracks = new Map<string, Nodes>();
  private bus!: GainNode;
  private mLow!: BiquadFilterNode; private mHigh!: BiquadFilterNode;
  private mComp!: DynamicsCompressorNode; private mCompOn!: GainNode; private mCompDry!: GainNode;
  private mLim!: DynamicsCompressorNode; private mLimOn!: GainNode; private mLimDry!: GainNode;
  private mMake!: GainNode;
  private mAn!: AnalyserNode; private mAnL!: AnalyserNode; private mAnR!: AnalyserNode;
  private mBuf = new Float32Array(2048); private mBufL = new Float32Array(2048); private mBufR = new Float32Array(2048);
  private sources = new Map<string, AudioBufferSourceNode>();
  playing = false;
  private startAt = 0;
  offset = 0;

  ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    const c = this.ctx;

    this.bus = c.createGain();
    this.mLow = c.createBiquadFilter(); this.mLow.type = "lowshelf"; this.mLow.frequency.value = 120;
    this.mHigh = c.createBiquadFilter(); this.mHigh.type = "highshelf"; this.mHigh.frequency.value = 9000;
    this.mComp = c.createDynamicsCompressor(); this.mComp.knee.value = 8;
    this.mCompOn = c.createGain(); this.mCompDry = c.createGain(); this.mCompDry.gain.value = 0;
    this.mLim = c.createDynamicsCompressor();
    this.mLim.threshold.value = -3; this.mLim.ratio.value = 20; this.mLim.knee.value = 0;
    this.mLim.attack.value = 0.002; this.mLim.release.value = 0.06;
    this.mLimOn = c.createGain(); this.mLimDry = c.createGain(); this.mLimDry.gain.value = 0;
    this.mMake = c.createGain();
    this.mAn = c.createAnalyser(); this.mAn.fftSize = 2048;
    this.mAnL = c.createAnalyser(); this.mAnL.fftSize = 2048;
    this.mAnR = c.createAnalyser(); this.mAnR.fftSize = 2048;

    const sp = c.createChannelSplitter(2);
    this.bus.connect(this.mLow);
    this.mLow.connect(this.mHigh);
    this.mHigh.connect(this.mComp); this.mHigh.connect(this.mCompDry);
    this.mComp.connect(this.mCompOn);
    this.mCompOn.connect(this.mLim); this.mCompDry.connect(this.mLim);
    this.mLim.connect(this.mLimOn); this.mLim.connect(this.mLimDry);
    this.mLimDry.disconnect();
    this.mLimDry.connect(this.mMake); this.mLimOn.connect(this.mMake);
    this.mMake.connect(this.mAn);
    this.mAn.connect(c.destination);
    this.mAn.connect(sp);
    sp.connect(this.mAnL, 0); sp.connect(this.mAnR, 1);
    return c;
  }

  private getTrack(id: string): Nodes {
    let n = this.tracks.get(id);
    if (n) return n;
    const c = this.ensure();
    n = {
      input: c.createGain(),
      hpf: c.createBiquadFilter(), low: c.createBiquadFilter(), mid: c.createBiquadFilter(), high: c.createBiquadFilter(),
      comp: c.createDynamicsCompressor(), compOn: c.createGain(), compDry: c.createGain(),
      pan: c.createStereoPanner(), fader: c.createGain(),
      an: c.createAnalyser(), anBuf: new Float32Array(2048),
    };
    n.hpf.type = "highpass"; n.hpf.Q.value = 0.71;
    n.low.type = "peaking"; n.low.Q.value = 0.85;
    n.mid.type = "peaking"; n.mid.Q.value = 1.1;
    n.high.type = "highshelf"; n.high.Q.value = 0.7;
    n.comp.knee.value = 6;
    n.an.fftSize = 2048;
    n.compDry.gain.value = 0;
    n.input.connect(n.hpf); n.hpf.connect(n.low); n.low.connect(n.mid); n.mid.connect(n.high);
    n.high.connect(n.comp); n.high.connect(n.compDry);
    n.comp.connect(n.compOn);
    n.compOn.connect(n.pan); n.compDry.connect(n.pan);
    n.pan.connect(n.fader); n.fader.connect(n.an); n.an.connect(this.bus);
    this.tracks.set(id, n);
    return n;
  }

  updateTrack(id: string, s: TrackAudio) {
    if (!this.ctx) return;
    const n = this.getTrack(id);
    applyEq(n, s.eq, 1, this.ctx);
    applyComp(n, s.comp, 1, this.ctx);
    const g = s.muted ? 0 : db2g(s.fader + (s.comp.on ? s.comp.mk : 0)) * s.pol;
    n.fader.gain.setTargetAtTime(g, this.ctx.currentTime, 0.015);
    n.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, s.pan / 100)), this.ctx.currentTime, 0.015);
  }

  updateMaster(m: MasterState) {
    if (!this.ctx) return;
    const c = this.ctx; const t = c.currentTime;
    this.mLow.gain.setTargetAtTime(m.lowG, t, 0.02);
    this.mHigh.gain.setTargetAtTime(m.highG, t, 0.02);
    this.mComp.threshold.setTargetAtTime(m.cTh, t, 0.02);
    this.mComp.ratio.setTargetAtTime(m.cRatio, t, 0.02);
    this.mComp.attack.setTargetAtTime(m.cAtk / 1000, t, 0.02);
    this.mComp.release.setTargetAtTime(m.cRel / 1000, t, 0.02);
    this.mCompOn.gain.setTargetAtTime(m.cOn ? 1 : 0, t, 0.02);
    this.mCompDry.gain.setTargetAtTime(m.cOn ? 0 : 1, t, 0.02);
    this.mLim.threshold.setTargetAtTime(m.limTh, t, 0.02);
    this.mLimOn.gain.setTargetAtTime(m.limOn ? 1 : 0, t, 0.02);
    this.mLimDry.gain.setTargetAtTime(m.limOn ? 0 : 1, t, 0.02);
    this.mMake.gain.setTargetAtTime(db2g(m.mk), t, 0.02);
  }

  getLevel(id: string): number {
    const n = this.tracks.get(id);
    if (!n) return 0;
    n.an.getFloatTimeDomainData(n.anBuf);
    let mx = 0;
    for (let i = 0; i < n.anBuf.length; i++) { const v = Math.abs(n.anBuf[i]); if (v > mx) mx = v; }
    return mx;
  }

  getMasterLevels(): { peak: number; rms: number; L: number; R: number } {
    if (!this.ctx) return { peak: 0, rms: 0, L: 0, R: 0 };
    this.mAn.getFloatTimeDomainData(this.mBuf);
    this.mAnL.getFloatTimeDomainData(this.mBufL);
    this.mAnR.getFloatTimeDomainData(this.mBufR);
    let peak = 0, sum = 0, L = 0, R = 0;
    for (let i = 0; i < this.mBuf.length; i++) {
      const v = Math.abs(this.mBuf[i]); if (v > peak) peak = v; sum += v * v;
      const l = Math.abs(this.mBufL[i]); if (l > L) L = l;
      const r = Math.abs(this.mBufR[i]); if (r > R) R = r;
    }
    return { peak, rms: Math.sqrt(sum / this.mBuf.length), L, R };
  }

  getReduction(id: string): number {
    const n = this.tracks.get(id);
    return n && n.comp.threshold.value > -60 ? n.comp.reduction : 0;
  }

  play(buffers: Map<string, AudioBuffer>, offset: number) {
    const c = this.ensure();
    this.stopSources();
    this.offset = offset;
    const now = c.currentTime + 0.06;
    buffers.forEach((buf, id) => {
      const n = this.getTrack(id);
      const s = c.createBufferSource();
      s.buffer = buf;
      s.connect(n.input);
      s.start(now, Math.min(offset, Math.max(0, buf.duration - 0.01)));
      this.sources.set(id, s);
    });
    this.startAt = now - offset;
    this.playing = true;
    void c.resume();
  }

  private stopSources() {
    this.sources.forEach((s) => { try { s.stop(); } catch { /* уже остановлен */ } s.disconnect(); });
    this.sources.clear();
  }

  stop() {
    this.stopSources();
    this.playing = false;
    this.offset = 0;
  }

  getPos(): number {
    if (!this.ctx) return 0;
    return this.playing ? Math.max(0, this.ctx.currentTime - this.startAt) : this.offset;
  }

  seek(offset: number) { this.offset = offset; }

  async renderOffline(
    buffers: Map<string, AudioBuffer>,
    settings: (id: string) => TrackAudio,
    master: MasterState,
    duration: number,
  ): Promise<AudioBuffer> {
    const sr = 44100;
    const oac = new OfflineAudioContext(2, Math.ceil((duration + 0.6) * sr), sr);

    const bus = oac.createGain();
    const mLow = oac.createBiquadFilter(); mLow.type = "lowshelf"; mLow.frequency.value = 120; mLow.gain.value = master.lowG;
    const mHigh = oac.createBiquadFilter(); mHigh.type = "highshelf"; mHigh.frequency.value = 9000; mHigh.gain.value = master.highG;
    const mComp = oac.createDynamicsCompressor();
    mComp.threshold.value = master.cTh; mComp.ratio.value = master.cRatio;
    mComp.attack.value = master.cAtk / 1000; mComp.release.value = master.cRel / 1000; mComp.knee.value = 8;
    const mCompOn = oac.createGain(); mCompOn.gain.value = master.cOn ? 1 : 0;
    const mCompDry = oac.createGain(); mCompDry.gain.value = master.cOn ? 0 : 1;
    const mLim = oac.createDynamicsCompressor();
    mLim.threshold.value = master.limTh; mLim.ratio.value = 20; mLim.knee.value = 0;
    mLim.attack.value = 0.002; mLim.release.value = 0.06;
    const mLimOn = oac.createGain(); mLimOn.gain.value = master.limOn ? 1 : 0;
    const mLimDry = oac.createGain(); mLimDry.gain.value = master.limOn ? 0 : 1;
    const mMake = oac.createGain(); mMake.gain.value = db2g(master.mk);

    bus.connect(mLow); mLow.connect(mHigh);
    mHigh.connect(mComp); mHigh.connect(mCompDry);
    mComp.connect(mCompOn); mCompOn.connect(mLim); mCompDry.connect(mLim);
    mLim.connect(mLimOn); mLim.connect(mLimDry);
    mLimOn.connect(mMake); mLimDry.connect(mMake);
    mMake.connect(oac.destination);

    buffers.forEach((buf, id) => {
      const s = settings(id);
      if (s.muted) return;
      const input = oac.createGain(); input.gain.value = 1;
      const hpf = oac.createBiquadFilter(); hpf.type = "highpass"; hpf.Q.value = 0.71;
      const low = oac.createBiquadFilter(); low.type = "peaking"; low.Q.value = 0.85;
      const mid = oac.createBiquadFilter(); mid.type = "peaking"; mid.Q.value = 1.1;
      const high = oac.createBiquadFilter(); high.type = "highshelf"; high.Q.value = 0.7;
      const comp = oac.createDynamicsCompressor(); comp.knee.value = 6;
      const compOn = oac.createGain(); const compDry = oac.createGain();
      const pan = oac.createStereoPanner();
      const fader = oac.createGain();
      applyEq({ hpf, low, mid, high } as unknown as Nodes, s.eq, -1, oac);
      applyComp({ comp, compOn, compDry, fader } as unknown as Nodes, s.comp, -1, oac);
      fader.gain.value = db2g(s.fader) * s.pol;
      pan.pan.value = Math.max(-1, Math.min(1, s.pan / 100));
      const src = oac.createBufferSource(); src.buffer = buf;
      src.connect(input); input.connect(hpf); hpf.connect(low); low.connect(mid); mid.connect(high);
      high.connect(comp); high.connect(compDry);
      comp.connect(compOn); compOn.connect(pan); compDry.connect(pan);
      pan.connect(fader); fader.connect(bus);
      src.start(0);
    });

    return oac.startRendering();
  }
}

export const engine = new Engine();
export { db2g };
export const ALL_IDS = TRACKS.map((t) => t.id);
