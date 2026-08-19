import type { CompState, EqState } from "./audio/presets";

export type TState = {
  fileName: string | null;
  buffer: AudioBuffer | null;
  processed: AudioBuffer | null;
  eq: EqState;
  comp: CompState;
  fader: number;
  pan: number;
  pol: number;
  mute: boolean;
  solo: boolean;
  amount: number;    // интенсивность тюнинга, %
  subdiv: number;    // сетка квантизации
  strength: number;  // сила квантизации, %
  tuneDone: boolean;
  gridDone: boolean;
  busy: null | "tune" | "grid";
  prog: number;
};
