import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/* ================= КНОБКА ================= */

export function Knob({
  label, v, min, max, onChange, fmt, size = 54, def, color = "#ffb020", log, disabled,
}: {
  label: string; v: number; min: number; max: number; onChange: (v: number) => void;
  fmt?: (v: number) => string; size?: number; def?: number; color?: string; log?: boolean; disabled?: boolean;
}) {
  const drag = useRef<{ y: number; t: number } | null>(null);
  const [hot, setHot] = useState(false);

  const t01 = log
    ? Math.log(clamp(v, min, max) / min) / Math.log(max / min)
    : (clamp(v, min, max) - min) / (max - min);
  const ang = -135 + 270 * t01;

  const c = size / 2, r = size / 2 - 7;
  const pt = (deg: number, rr: number) => {
    const a = (deg * Math.PI) / 180;
    return [c + rr * Math.sin(a), c - rr * Math.cos(a)];
  };
  const arcPath = (a0: number, a1: number, rr: number) => {
    const [x0, y0] = pt(a0, rr);
    const [x1, y1] = pt(a1, rr);
    return `M ${x0} ${y0} A ${rr} ${rr} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  const [px, py] = pt(ang, r - 3);

  const fromT = (t: number) => {
    const tt = clamp(t, 0, 1);
    const val = log ? min * Math.pow(max / min, tt) : min + tt * (max - min);
    const st = (max - min) / (log ? 120 : 80);
    onChange(Math.round(val / st) * st);
  };

  return (
    <div
      className={`flex flex-col items-center select-none ${disabled ? "opacity-40 pointer-events-none" : ""}`}
      title={`${label}: ${fmt ? fmt(v) : v}`}
    >
      <svg
        width={size} height={size}
        className="knob-cursor"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, t: t01 };
          setHot(true);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          fromT(drag.current.t + (drag.current.y - e.clientY) / 130);
        }}
        onPointerUp={() => { drag.current = null; setHot(false); }}
        onDoubleClick={() => def !== undefined && onChange(def)}
        onWheel={(e) => {
          const d = e.deltaY > 0 ? -0.03 : 0.03;
          fromT(t01 + d);
        }}
      >
        <circle cx={c} cy={c} r={r + 4} fill="#0d1015" stroke="#2a3140" strokeWidth="1" />
        <path d={arcPath(-135, 135, r)} stroke="#2c3340" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <path d={arcPath(-135, Math.max(-134.5, ang), r)} stroke={color} strokeWidth="3.5" fill="none"
          strokeLinecap="round" opacity={hot ? 1 : 0.85} />
        <circle cx={c} cy={c} r={r - 7} fill="#1c212b" stroke={hot ? color : "#3a4354"} strokeWidth="1.2" />
        <line x1={c} y1={c} x2={px} y2={py} stroke={hot ? color : "#d5dbe5"} strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <div className="font-mono text-[9px] tracking-wider text-dim -mt-0.5">{label}</div>
      <div className="font-mono text-[10px] text-silk leading-tight" style={hot ? { color } : undefined}>
        {fmt ? fmt(v) : v.toFixed(1)}
      </div>
    </div>
  );
}

/* ================= ФЕЙДЕР ================= */

export function VFader({ v, onChange, color = "#ffb020" }: { v: number; onChange: (v: number) => void; color?: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; v: number } | null>(null);
  const [hot, setHot] = useState(false);
  const t = clamp((v + 60) / 72, 0, 1);

  const setFromClient = (clientY: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const tt = 1 - clamp((clientY - r.top) / r.height, 0, 1);
    onChange(Math.round((-60 + tt * 72) * 2) / 2);
  };

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div
        ref={trackRef}
        className="relative w-8 h-32 inset-well rounded-[3px] knob-cursor"
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, v };
          setHot(true);
          setFromClient(e.clientY);
        }}
        onPointerMove={(e) => drag.current && setFromClient(e.clientY)}
        onPointerUp={() => { drag.current = null; setHot(false); }}
        onDoubleClick={() => onChange(0)}
      >
        {[0.25, 0.5, 0.75, 0.8333, 0.9166].map((p) => (
          <div key={p} className="absolute left-0 right-0 h-px bg-line2/60" style={{ bottom: `${p * 100}%` }} />
        ))}
        <div className="absolute left-0 bottom-0 right-0 rounded-[2px]" style={{
          height: `${t * 100}%`,
          background: `linear-gradient(to top, ${color}22, ${color}66)`,
        }} />
        <div className="absolute left-[-3px] right-[-3px] h-[13px] -translate-y-1/2 bevel rounded-[3px]"
          style={{
            bottom: `${t * 100}%`,
            background: "linear-gradient(180deg,#3a4354,#1e232d 55%,#2b323e)",
            boxShadow: hot ? `0 0 10px ${color}88, inset 0 1px 0 rgba(255,255,255,.15)` : undefined,
          }}>
          <div className="absolute left-1 right-1 top-1/2 h-[2px] -translate-y-1/2" style={{ background: color }} />
        </div>
      </div>
      <div className={`font-mono text-[10px] ${hot ? "" : "text-dim"}`} style={hot ? { color } : undefined}>
        {v > 0 ? "+" : ""}{v.toFixed(1)}
      </div>
    </div>
  );
}

/* ================= ИЗМЕРИТЕЛЬ УРОВНЯ ================= */

export function LevelMeter({ get, h = 96, w = 9 }: { get: () => number; h?: number; w?: number }) {
  const fillRef = useRef<HTMLDivElement>(null);
  const peakRef = useRef<HTMLDivElement>(null);
  const hold = useRef(0);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const v = get();
      hold.current = Math.max(hold.current - 0.014, v);
      const pct = Math.min(100, v * 135);
      const hpct = Math.min(100, hold.current * 135);
      if (fillRef.current) fillRef.current.style.height = `${pct}%`;
      if (peakRef.current) peakRef.current.style.bottom = `${hpct}%`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [get]);

  return (
    <div className="relative inset-well rounded-[2px] overflow-hidden" style={{ width: w, height: h }}>
      <div ref={fillRef} className="absolute bottom-0 left-0 right-0" style={{
        height: "0%",
        background: "linear-gradient(to top, #2ea86b 0%, #40dd8f 55%, #ffb020 78%, #ff4b3a 95%)",
      }} />
      <div ref={peakRef} className="absolute left-0 right-0 h-[2px] bg-silk/90" style={{ bottom: "0%" }} />
      {[25, 50, 75].map((p) => (
        <div key={p} className="absolute left-0 right-0 h-px bg-ink/70" style={{ bottom: `${p}%` }} />
      ))}
    </div>
  );
}

/* ================= GR-метр компрессора ================= */

export function GRMeter({ get }: { get: () => number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const gr = get();
      if (ref.current) ref.current.style.width = `${Math.min(100, (-gr / 24) * 100)}%`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [get]);
  return (
    <div className="h-3 inset-well rounded-[2px] overflow-hidden">
      <div ref={ref} className="h-full" style={{
        width: "0%",
        background: "linear-gradient(90deg, #ff7a1a, #ff4b3a)",
      }} />
    </div>
  );
}

/* ================= КНОПКИ / ПРОЧЕЕ ================= */

export function TButton({ on, onClick, children, title, big }: {
  on?: boolean; onClick: () => void; children: ReactNode; title?: string; big?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`bevel rounded-[4px] font-mono tracking-wider transition-colors ${big ? "px-5 py-2.5 text-sm" : "px-2.5 py-1.5 text-[11px]"} ${
        on ? "bg-amber text-ink" : "bg-raise text-silk hover:bg-line"
      }`}
    >
      {children}
    </button>
  );
}

export function MSButton({ kind, on, onClick }: { kind: "M" | "S"; on: boolean; onClick: () => void }) {
  const active = kind === "M" ? on : on;
  return (
    <button
      onClick={onClick}
      className={`bevel w-7 h-6 rounded-[3px] font-mono text-[11px] font-bold transition-colors ${
        active
          ? kind === "M" ? "bg-hot text-ink" : "bg-amber text-ink"
          : "bg-raise text-dim hover:text-silk"
      }`}
    >
      {kind}
    </button>
  );
}

export function Chip({ on, color, children }: { on: boolean; color: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] font-mono text-[8.5px] tracking-widest border ${
      on ? "text-ink" : "text-faint border-line"
    }`} style={on ? { background: color, borderColor: color } : undefined}>
      {children}
    </span>
  );
}

export function Led({ on, color = "#40dd8f", pulse }: { on: boolean; color?: string; pulse?: boolean }) {
  return (
    <span
      className={`inline-block w-[7px] h-[7px] rounded-full ${on && pulse ? "led-pulse" : ""}`}
      style={{
        background: on ? color : "#232935",
        color,
        boxShadow: on ? `0 0 7px ${color}` : "inset 0 1px 2px rgba(0,0,0,.8)",
      }}
    />
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => onChange(!on)} className="flex items-center gap-1.5 group">
      <span className={`w-8 h-4 rounded-full relative transition-colors ${on ? "bg-amber/80" : "bg-raise border border-line"}`}>
        <span className={`absolute top-[2px] w-3 h-3 rounded-full bg-silk transition-all ${on ? "left-[17px]" : "left-[2px]"}`} />
      </span>
      <span className={`font-mono text-[10px] tracking-wider ${on ? "text-amber" : "text-dim group-hover:text-silk"}`}>{label}</span>
    </button>
  );
}

export function PanelTitle({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-1 h-3.5" style={{ background: color ?? "#ffb020" }} />
      <span className="font-disp text-[11px] tracking-[0.18em] text-silk">{children}</span>
      <span className="flex-1 h-px bg-line" />
    </div>
  );
}

export function ProgressBar({ p }: { p: number }) {
  return (
    <div className="h-2.5 inset-well rounded-[2px] overflow-hidden">
      <div className="h-full progress-stripes" style={{ width: `${Math.round(p * 100)}%` }} />
    </div>
  );
}
