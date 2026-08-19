import { useCallback, useEffect, useRef } from "react";
import type { MasterState } from "../audio/presets";
import { engine } from "../audio/engine";
import { Knob, LevelMeter, PanelTitle, Toggle } from "./controls";

const db = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;

export function MasterPanel({ master, onMaster, onBounce, bouncing, loaded }: {
  master: MasterState;
  onMaster: (p: Partial<MasterState>) => void;
  onBounce: () => void;
  bouncing: boolean;
  loaded: number;
}) {
  const getL = useCallback(() => engine.getMasterLevels().L, []);
  const getR = useCallback(() => engine.getMasterLevels().R, []);
  const peakRef = useRef<HTMLSpanElement>(null);
  const rmsRef = useRef<HTMLSpanElement>(null);
  const drRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const lv = engine.getMasterLevels();
      const pd = lv.peak > 1e-5 ? 20 * Math.log10(lv.peak) : -60;
      const rd = lv.rms > 1e-5 ? 20 * Math.log10(lv.rms) : -60;
      if (peakRef.current) peakRef.current.textContent = pd.toFixed(1);
      if (rmsRef.current) rmsRef.current.textContent = rd.toFixed(1);
      if (drRef.current) drRef.current.textContent = (pd - rd).toFixed(1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section className="steel rounded-[6px] border border-line relative w-[250px] shrink-0 px-3 pb-3 pt-2">
      <i className="screw absolute top-2 left-2" /><i className="screw absolute top-2 right-2" />
      <i className="screw absolute bottom-2 left-2" /><i className="screw absolute bottom-2 right-2" />

      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="w-1 h-3.5 bg-hot" />
        <span className="font-disp text-[11px] tracking-[0.18em] text-silk">MASTER BUS</span>
        <span className="ml-auto font-mono text-[8px] text-faint">{loaded}/11 TRK</span>
      </div>

      <div className="bg-panel rounded-[4px] border border-line p-2 mb-2">
        <PanelTitle>МАСТЕР-EQ</PanelTitle>
        <div className="flex justify-around">
          <Knob label="LOW" v={master.lowG} min={-6} max={6} def={1} size={46} fmt={db}
            onChange={(v) => onMaster({ lowG: v })} />
          <Knob label="HIGH" v={master.highG} min={-6} max={6} def={1.5} size={46} fmt={db}
            onChange={(v) => onMaster({ highG: v })} />
        </div>
      </div>

      <div className="bg-panel rounded-[4px] border border-line p-2 mb-2">
        <div className="flex items-center justify-between mb-1">
          <PanelTitle color="#ff7a1a">BUS-COMP</PanelTitle>
          <div className="-mb-2"><Toggle on={master.cOn} onChange={(v) => onMaster({ cOn: v })} label={master.cOn ? "ВКЛ" : "ВЫКЛ"} /></div>
        </div>
        <div className="flex justify-between">
          <Knob label="THRESH" v={master.cTh} min={-30} max={0} size={42} color="#ff7a1a" fmt={(v) => v.toFixed(0)}
            onChange={(v) => onMaster({ cTh: v })} disabled={!master.cOn} />
          <Knob label="RATIO" v={master.cRatio} min={1} max={8} size={42} color="#ff7a1a" fmt={(v) => `${v.toFixed(1)}`}
            onChange={(v) => onMaster({ cRatio: Math.round(v * 2) / 2 })} disabled={!master.cOn} />
          <Knob label="ATTACK" v={master.cAtk} min={1} max={60} log size={42} color="#ff7a1a" fmt={(v) => `${Math.round(v)}`}
            onChange={(v) => onMaster({ cAtk: v })} disabled={!master.cOn} />
          <Knob label="REL" v={master.cRel} min={40} max={500} log size={42} color="#ff7a1a" fmt={(v) => `${Math.round(v)}`}
            onChange={(v) => onMaster({ cRel: v })} disabled={!master.cOn} />
        </div>
      </div>

      <div className="bg-panel rounded-[4px] border border-line p-2 mb-2">
        <div className="flex items-center justify-between mb-1">
          <PanelTitle color="#ff4b3a">ЛИМИТЕР</PanelTitle>
          <div className="-mb-2"><Toggle on={master.limOn} onChange={(v) => onMaster({ limOn: v })} label={master.limOn ? "ВКЛ" : "ВЫКЛ"} /></div>
        </div>
        <div className="flex justify-around">
          <Knob label="THRESH" v={master.limTh} min={-12} max={-0.3} size={44} color="#ff4b3a" fmt={(v) => v.toFixed(1)}
            onChange={(v) => onMaster({ limTh: v })} disabled={!master.limOn} />
          <Knob label="MAKEUP" v={master.mk} min={0} max={12} def={4} size={44} color="#ff4b3a" fmt={(v) => `+${v.toFixed(1)}`}
            onChange={(v) => onMaster({ mk: v })} />
        </div>
      </div>

      {/* метры */}
      <div className="flex gap-2 justify-center items-end mb-2">
        <div className="flex flex-col items-center gap-1">
          <LevelMeter get={getL} h={92} w={16} />
          <span className="font-mono text-[8px] text-faint">L</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <LevelMeter get={getR} h={92} w={16} />
          <span className="font-mono text-[8px] text-faint">R</span>
        </div>
        <div className="flex-1 self-stretch flex flex-col justify-center gap-1 pl-2 font-mono text-[9px]">
          <div className="flex justify-between border-b border-line/60 pb-0.5">
            <span className="text-faint">PEAK</span>
            <span className="text-amber"><span ref={peakRef}>-60.0</span> dB</span>
          </div>
          <div className="flex justify-between border-b border-line/60 pb-0.5">
            <span className="text-faint">RMS</span>
            <span className="text-silk"><span ref={rmsRef}>-60.0</span> dB</span>
          </div>
          <div className="flex justify-between">
            <span className="text-faint">DR</span>
            <span className="text-ok"><span ref={drRef}>0.0</span> dB</span>
          </div>
        </div>
      </div>

      <button
        onClick={onBounce}
        disabled={bouncing || loaded === 0}
        className={`w-full bevel rounded-[4px] py-2.5 font-disp text-[11px] tracking-[0.15em] flex items-center justify-center gap-2 transition-all ${
          bouncing || loaded === 0
            ? "bg-raise text-faint cursor-not-allowed"
            : "bg-amber text-ink hover:brightness-110"
        }`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
          <path d="M12 3v12m0 0l-5-5m5 5l5-5M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {bouncing ? "РЕНДЕР МАСТЕРА…" : "РЕНДЕР МАСТЕРА • WAV"}
      </button>
      <div className="font-mono text-[8px] text-faint text-center mt-1.5">
        офлайн-рендер всей цепочки: EQ → COMP → LIM → 44.1 kHz / 16 bit
      </div>
    </section>
  );
}
