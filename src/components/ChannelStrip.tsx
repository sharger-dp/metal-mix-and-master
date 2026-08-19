import { useCallback, useEffect, useRef, useState } from "react";
import type { TrackDef } from "../audio/presets";
import type { TState } from "../types";
import { engine } from "../audio/engine";
import { computePeaks } from "../audio/processing";
import { Chip, Led, LevelMeter, MSButton, ProgressBar, VFader, Knob } from "./controls";

export function ChannelStrip({ def, st, selected, anySolo, onSelect, onFile, onSeek, onMute, onSolo, onFader, onPan }: {
  def: TrackDef;
  st: TState;
  selected: boolean;
  anySolo: boolean;
  onSelect: () => void;
  onFile: (f: File) => void;
  onSeek: (t: number) => void;
  onMute: () => void;
  onSolo: () => void;
  onFader: (v: number) => void;
  onPan: (v: number) => void;
}) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const peaksRef = useRef<Float32Array | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [drop, setDrop] = useState(false);
  const buf = st.processed ?? st.buffer;
  const dur = buf?.duration ?? 0;

  /* расчёт пиков */
  useEffect(() => {
    peaksRef.current = buf ? computePeaks(buf, 132) : null;
  }, [buf]);

  /* отрисовка волны + плейхед */
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = 2, Wd = 132 * dpr, Hd = 46 * dpr;
    cv.width = Wd; cv.height = Hd;
    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, Wd, Hd);
      ctx.fillStyle = "#0d1015";
      ctx.fillRect(0, 0, Wd, Hd);
      const peaks = peaksRef.current;
      if (peaks) {
        const mid = Hd / 2;
        const pos = engine.playing || engine.offset > 0 ? engine.getPos() / Math.max(0.001, dur) : 0;
        const px = Math.min(1, Math.max(0, pos)) * Wd;
        ctx.fillStyle = def.color + "55";
        ctx.fillRect(0, 0, px, Hd);
        ctx.fillStyle = def.color + "cc";
        for (let x = 0; x < peaks.length; x++) {
          const h = Math.max(1 * dpr, peaks[x] * mid * 0.92);
          ctx.fillRect(x * dpr, mid - h, dpr - 0.6, h * 2);
        }
        if (pos > 0 && pos < 1) {
          ctx.fillStyle = "#ffb020";
          ctx.fillRect(px - 1, 0, 2, Hd);
        }
      }
      ctx.strokeStyle = "#232935";
      ctx.strokeRect(0.5, 0.5, Wd - 1, Hd - 1);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [def.color, dur, buf]);

  const getLevel = useCallback(() => (mutedVisual(st) ? 0 : engine.getLevel(def.id)), [def.id, st.mute, st.solo, anySolo]);

  const handleFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  };

  return (
    <div
      onClick={onSelect}
      className={`relative shrink-0 w-[150px] steel rounded-[5px] border px-2 pt-1.5 pb-2 transition-all duration-150 ${
        selected ? "border-amber shadow-[0_0_18px_rgba(255,176,32,0.15)]" : "border-line hover:border-line2"
      }`}
    >
      {/* шапка */}
      <div className="flex items-center gap-1.5">
        <Led on={!!buf} color={st.busy ? "#ffb020" : def.color} pulse={!!st.busy} />
        <span className="font-mono text-[9px] text-dim tracking-widest">{def.tag}</span>
        <span className="ml-auto font-mono text-[7.5px] text-faint tracking-wider">{def.group}</span>
      </div>
      <div className="h-7 flex items-start mt-0.5">
        <span className="font-disp text-[9.5px] leading-[11px] tracking-wide text-silk">{def.name}</span>
      </div>

      {/* волна / дропзона */}
      <div
        className="relative mt-1"
        onDragOver={(e) => { e.preventDefault(); setDrop(true); }}
        onDragLeave={() => setDrop(false)}
        onDrop={(e) => { e.preventDefault(); setDrop(false); handleFiles(e.dataTransfer.files); }}
        onClick={(e) => e.stopPropagation()}
      >
        <canvas
          ref={cvRef}
          className={`w-full h-[46px] rounded-[2px] ${buf ? "cursor-crosshair" : ""}`}
          onPointerDown={(e) => {
            if (!buf || !dur) return;
            const r = e.currentTarget.getBoundingClientRect();
            onSeek(((e.clientX - r.left) / r.width) * dur);
          }}
        />
        {!buf && (
          <button
            onClick={() => fileRef.current?.click()}
            className={`absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-[2px] border border-dashed transition-colors ${
              drop ? "border-amber bg-amber/10 text-amber" : "border-line2 text-faint hover:text-dim hover:border-dim"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            <span className="font-mono text-[8px] tracking-wider">ЗАГРУЗИТЬ / DROP</span>
          </button>
        )}
        {st.busy && (
          <div className="absolute inset-x-1 bottom-1">
            <ProgressBar p={st.prog} />
          </div>
        )}
        <input ref={fileRef} type="file" accept="audio/*" className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {/* фейдер + метр */}
      <div className="flex items-start justify-between mt-1.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-1.5">
          <LevelMeter get={getLevel} h={128} w={8} />
          <VFader v={st.fader} onChange={onFader} color={def.color} />
        </div>
        <div className="flex flex-col items-center gap-1 pt-1">
          <Knob label="PAN" v={st.pan} min={-100} max={100} def={0} size={40} color={def.color}
            fmt={(v) => (v === 0 ? "C" : v < 0 ? `L${-v}` : `R${v}`)} onChange={onPan} />
        </div>
      </div>

      {/* M/S + чипы */}
      <div className="flex items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
        <MSButton kind="M" on={st.mute} onClick={onMute} />
        <MSButton kind="S" on={st.solo} onClick={onSolo} />
        <span className="flex-1" />
        {def.tune && <Chip on={st.tuneDone} color="#f472b6">TUNE</Chip>}
        {def.quant && <Chip on={st.gridDone} color="#2dd4bf">GRID</Chip>}
      </div>

      <div className="mt-1 h-3 overflow-hidden">
        {st.fileName ? (
          <span className="font-mono text-[8px] text-faint truncate block">{st.fileName}</span>
        ) : (
          <span className="font-mono text-[8px] text-faint/60">— нет файла —</span>
        )}
      </div>

      {/* цветная полоса группы */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-[5px]" style={{ background: def.color, opacity: 0.85 }} />
    </div>
  );
}

function mutedVisual(st: TState): boolean {
  return st.mute;
}
