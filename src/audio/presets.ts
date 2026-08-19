export type EqState = { hpf: number; lf: number; lg: number; mf: number; mg: number; hf: number; hg: number };
export type CompState = { on: boolean; th: number; ratio: number; atk: number; rel: number; mk: number };
export type MasterState = {
  lowG: number; highG: number;
  cOn: boolean; cTh: number; cRatio: number; cAtk: number; cRel: number;
  limOn: boolean; limTh: number; mk: number;
};

export type TrackDef = {
  id: string; name: string; tag: string; color: string; group: string;
  tune: boolean; quant: boolean;
};

export type Genre = "modern" | "thrash" | "core" | "doom";

export const TRACKS: TrackDef[] = [
  { id: "kick",   name: "БОЧКА",                  tag: "KCK", color: "#fbbf24", group: "DRUMS",  tune: false, quant: false },
  { id: "bass",   name: "БАС",                    tag: "BSS", color: "#f87171", group: "DRUMS",  tune: false, quant: true  },
  { id: "drums",  name: "УДАРНЫЕ БЕЗ БОЧКИ",      tag: "DRM", color: "#fb923c", group: "DRUMS",  tune: false, quant: true  },
  { id: "fx",     name: "FX-Ы",                   tag: "FXS", color: "#a3e635", group: "SPACE",  tune: false, quant: false },
  { id: "solo",   name: "СОЛО",                   tag: "SOL", color: "#22d3ee", group: "LEAD",   tune: false, quant: true  },
  { id: "smooth", name: "БЕЗ ЩЕЛЧКОВ",            tag: "LEG", color: "#60a5fa", group: "RHYTHM", tune: false, quant: true  },
  { id: "stac",   name: "ОТРЫВИСТЫЕ / ЩЕЛКАЮЩИЕ", tag: "RHY", color: "#2dd4bf", group: "RHYTHM", tune: false, quant: true  },
  { id: "vox",    name: "ЛИД-ВОКАЛ",              tag: "VOX", color: "#f472b6", group: "VOCALS", tune: true,  quant: true  },
  { id: "dbl",    name: "ДАБЛЫ",                  tag: "DBL", color: "#fb7185", group: "VOCALS", tune: true,  quant: true  },
  { id: "bkv",    name: "БЭКИ И ХОР",             tag: "BKV", color: "#c084fc", group: "VOCALS", tune: true,  quant: false },
  { id: "airs",   name: "AIRS",                   tag: "AIR", color: "#93c5fd", group: "SPACE",  tune: false, quant: false },
];

export type ChPreset = { eq: EqState; comp: CompState; fader: number; pan: number };

const eq = (hpf: number, lf: number, lg: number, mf: number, mg: number, hf: number, hg: number): EqState =>
  ({ hpf, lf, lg, mf, mg, hf, hg });
const cp = (on: boolean, th: number, ratio: number, atk: number, rel: number, mk: number): CompState =>
  ({ on, th, ratio, atk, rel, mk });

/* Базовые пресеты современного метала */
const BASE: Record<string, ChPreset> = {
  kick:   { eq: eq(28, 58, 5.5, 380, -6, 3500, 4),   comp: cp(true, -18, 6, 3, 90, 2),     fader: -1,  pan: 0 },
  bass:   { eq: eq(35, 85, 4.5, 300, -4, 1200, 3.5), comp: cp(true, -20, 5, 4, 110, 2),    fader: -2,  pan: 0 },
  drums:  { eq: eq(45, 120, 2, 400, -3, 6000, 2.5),  comp: cp(true, -14, 3, 10, 160, 1),   fader: -1.5, pan: 0 },
  fx:     { eq: eq(200, 250, -1, 900, 0, 8000, 3),   comp: cp(false, -20, 2, 20, 200, 0),  fader: -8,  pan: 0 },
  solo:   { eq: eq(90, 150, 1, 350, -3, 2500, 3),    comp: cp(true, -16, 3.5, 8, 140, 2),  fader: -4,  pan: 8 },
  smooth: { eq: eq(80, 130, 1, 250, -2, 1800, 2),    comp: cp(true, -14, 3, 12, 150, 1),   fader: -5,  pan: -16 },
  stac:   { eq: eq(110, 160, 1.5, 400, -4.5, 2000, 2.5), comp: cp(true, -18, 4, 5, 120, 1.5), fader: -3, pan: 16 },
  vox:    { eq: eq(110, 180, 1.5, 280, -3.5, 3200, 3), comp: cp(true, -18, 4, 8, 120, 2.5), fader: -2, pan: 0 },
  dbl:    { eq: eq(130, 200, 1, 400, -3, 8000, 2),   comp: cp(true, -18, 4, 8, 130, 1.5),  fader: -7,  pan: 0 },
  bkv:    { eq: eq(150, 220, 0, 350, -2, 7000, 2),   comp: cp(true, -16, 3, 12, 160, 1),   fader: -9,  pan: 0 },
  airs:   { eq: eq(250, 300, -1, 800, 0, 6000, 3),   comp: cp(false, -24, 2, 30, 300, 0),  fader: -11, pan: 0 },
};

export const GENRES: { id: Genre; name: string }[] = [
  { id: "modern", name: "MODERN" },
  { id: "thrash", name: "THRASH" },
  { id: "core",   name: "CORE" },
  { id: "doom",   name: "DOOM" },
];

type Mod = { eq?: Partial<EqState>; comp?: Partial<CompState> };
const MODS: Record<Genre, Record<string, Mod>> = {
  modern: {},
  thrash: {
    kick:  { eq: { hg: 5.5 } },
    bass:  { eq: { mg: -2, hg: 5 } },
    drums: { eq: { hg: 4 } },
    stac:  { eq: { mg: -1.5, hg: 3.5 }, comp: { ratio: 5 } },
    vox:   { comp: { ratio: 5, th: -20 } },
  },
  core: {
    kick:  { eq: { hf: 5000, hg: 5.5 } },
    bass:  { eq: { mg: -2, hg: 5.5 } },
    stac:  { eq: { hpf: 125, mf: 450 } },
    drums: { comp: { ratio: 4 } },
    vox:   { comp: { ratio: 5, th: -20 } },
    bkv:   { comp: { ratio: 4 } },
  },
  doom: {
    kick:  { eq: { hg: 2.5, mf: 300 }, comp: { atk: 9, rel: 220, ratio: 4 } },
    bass:  { comp: { atk: 12, ratio: 4, rel: 160 } },
    drums: { eq: { hg: 1 }, comp: { rel: 260 } },
    stac:  { eq: { hg: 1 }, comp: { atk: 14 } },
    solo:  { eq: { hg: 1.5 } },
    vox:   { comp: { ratio: 3, rel: 190 } },
    airs:  { eq: { hg: 4 } },
  },
};

export function presetFor(genre: Genre, id: string): ChPreset {
  const b = BASE[id];
  const m = MODS[genre][id] ?? {};
  return {
    eq: { ...b.eq, ...(m.eq ?? {}) },
    comp: { ...b.comp, ...(m.comp ?? {}) },
    fader: b.fader,
    pan: b.pan,
  };
}

export const MASTER_BASE: MasterState = {
  lowG: 1, highG: 1.5,
  cOn: true, cTh: -14, cRatio: 2.5, cAtk: 22, cRel: 190,
  limOn: true, limTh: -3, mk: 4,
};

/* Тональности для тюнера */
export const ROOTS = [
  { n: "C", m: 60 }, { n: "C#", m: 61 }, { n: "D", m: 62 }, { n: "D#", m: 63 },
  { n: "E", m: 64 }, { n: "F", m: 65 }, { n: "F#", m: 66 }, { n: "G", m: 67 },
  { n: "G#", m: 68 }, { n: "A", m: 69 }, { n: "A#", m: 70 }, { n: "B", m: 71 },
];

export const SCALES = [
  { id: "min",  name: "натур. минор", s: [0, 2, 3, 5, 7, 8, 10] },
  { id: "maj",  name: "мажор",        s: [0, 2, 4, 5, 7, 9, 11] },
  { id: "harm", name: "гарм. минор",  s: [0, 2, 3, 5, 7, 8, 11] },
  { id: "phr",  name: "фригийский",   s: [0, 1, 3, 5, 7, 8, 10] },
  { id: "dor",  name: "дорический",   s: [0, 2, 3, 5, 7, 9, 10] },
];

export const SUBDIVS = [
  { v: 4,  n: "1/4" },
  { v: 8,  n: "1/8" },
  { v: 16, n: "1/16" },
];

export const keyName = (rootMidi: number, scaleId: string) => {
  const r = ROOTS.find((x) => x.m === rootMidi)?.n ?? "E";
  const s = SCALES.find((x) => x.id === scaleId)?.name ?? "минор";
  return `${r} ${s}`;
};
