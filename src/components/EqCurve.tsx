import { useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { EqState } from "../audio/presets";

const W = 480, H = 158, PL = 10, PR = 10, PT = 8, PB = 18;
const IW = W - PL - PR, IH = H - PT - PB;
const F0 = 20, F1 = 20000;

const xOf = (f: number) => PL + (Math.log10(f / F0) / 3) * IW;
const yOf = (db: number) => PT + IH / 2 - (Math.max(-16, Math.min(16, db)) / 16) * (IH / 2);
const fOfX = (x: number) => F0 * Math.pow(10, (3 * (x - PL)) / IW);
const dbOfY = (y: number) => ((PT + IH / 2 - y) / (IH / 2)) * 16;

/* RBJ biquad коэффициенты -> АЧХ */
function magDb(b: number[], a: number[], w: number): number {
  const c1 = Math.cos(w), c2 = Math.cos(2 * w), s1 = Math.sin(w), s2 = Math.sin(2 * w);
  const nr = b[0] + b[1] * c1 + b[2] * c2, ni = -(b[1] * s1 + b[2] * s2);
  const dr = 1 + a[1] * c1 + a[2] * c2, di = -(a[1] * s1 + a[2] * s2);
  return 20 * Math.log10((Math.sqrt(nr * nr + ni * ni) / Math.sqrt(dr * dr + di * di)) + 1e-9);
}

const peak = (g: number, f: number, Q: number): [number[], number[]] => {
  const A = Math.pow(10, g / 40);
  const w = (2 * Math.PI * f) / 44100;
  const al = Math.sin(w) / (2 * Q);
  return [
    [1 + al * A, -2 * Math.cos(w), 1 - al * A],
    [1 + al / A, -2 * Math.cos(w), 1 - al / A],
  ];
};

const hshelf = (g: number, f: number): [number[], number[]] => {
  const A = Math.pow(10, g / 40);
  const w = (2 * Math.PI * f) / 44100;
  const al = (Math.sin(w) / 2) * Math.sqrt((A + 1 / A) * (1 / 0.8 - 1) + 2);
  const cw = Math.cos(w);
  return [
    [A * (A + 1 + (A - 1) * cw + al), -2 * A * (A - 1 + (A + 1) * cw), A * (A + 1 + (A - 1) * cw - al)],
    [A + 1 - (A - 1) * cw + al, 2 * (A - 1 - (A + 1) * cw), A + 1 - (A - 1) * cw - al],
  ];
};

const hpf = (f: number): [number[], number[]] => {
  const w = (2 * Math.PI * f) / 44100;
  const al = Math.sin(w) / (2 * 0.71);
  const cw = Math.cos(w);
  return [
    [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2],
    [1 + al, -2 * cw, 1 - al],
  ];
};

type DragIdx = "hpf" | "low" | "mid" | "high" | null;

export function EqCurve({ eq, color, onChange }: {
  eq: EqState; color: string; onChange: (eq: EqState) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragIdx>(null);

  const path = useMemo(() => {
    const bands: [number[], number[]][] = [
      hpf(eq.hpf), peak(eq.lg, eq.lf, 0.85), peak(eq.mg, eq.mf, 1.1), hshelf(eq.hg, eq.hf),
    ];
    let d = "";
    const n = 130;
    for (let i = 0; i <= n; i++) {
      const f = F0 * Math.pow(F1 / F0, i / n);
      const w = (2 * Math.PI * f) / 44100;
      let db = 0;
      for (const [b, a] of bands) db += magDb(b, a, w);
      d += `${i === 0 ? "M" : "L"} ${xOf(f).toFixed(1)} ${yOf(db).toFixed(1)} `;
    }
    return d;
  }, [eq]);

  const toLocal = (e: ReactPointerEvent): { x: number; y: number } => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const move = (e: ReactPointerEvent) => {
    if (!drag) return;
    const { x, y } = toLocal(e);
    const clampF = (f: number, a: number, b: number) => Math.max(a, Math.min(b, f));
    const g = Math.round(Math.max(-15, Math.min(15, dbOfY(y))) * 2) / 2;
    if (drag === "hpf") onChange({ ...eq, hpf: Math.round(clampF(fOfX(x), 20, 500)) });
    if (drag === "low") onChange({ ...eq, lf: Math.round(clampF(fOfX(x), 30, 400)), lg: g });
    if (drag === "mid") onChange({ ...eq, mf: Math.round(clampF(fOfX(x), 120, 6000)), mg: g });
    if (drag === "high") onChange({ ...eq, hf: Math.round(clampF(fOfX(x), 1500, 16000)), hg: g });
  };

  const handles: { k: Exclude<DragIdx, null>; x: number; y: number; label: string }[] = [
    { k: "hpf", x: xOf(eq.hpf), y: yOf(0), label: "HPF" },
    { k: "low", x: xOf(eq.lf), y: yOf(eq.lg), label: "LOW" },
    { k: "mid", x: xOf(eq.mf), y: yOf(eq.mg), label: "MID" },
    { k: "high", x: xOf(eq.hf), y: yOf(eq.hg), label: "HIGH" },
  ];

  const gridF = [50, 100, 500, 1000, 5000, 10000];

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto inset-well rounded-[3px] touch-none"
      onPointerMove={move}
      onPointerUp={() => setDrag(null)}
      onPointerLeave={() => setDrag(null)}
    >
      {gridF.map((f) => (
        <g key={f}>
          <line x1={xOf(f)} y1={PT} x2={xOf(f)} y2={PT + IH} stroke="#232935" strokeWidth="1" />
          <text x={xOf(f)} y={H - 5} textAnchor="middle" fontSize="8" fill="#5d6779" fontFamily="IBM Plex Mono">
            {f >= 1000 ? `${f / 1000}k` : f}
          </text>
        </g>
      ))}
      {[-12, -6, 0, 6, 12].map((db) => (
        <g key={db}>
          <line x1={PL} y1={yOf(db)} x2={W - PR} y2={yOf(db)} stroke={db === 0 ? "#39414f" : "#1d222c"} strokeWidth="1" />
          <text x={W - PR + 2} y={yOf(db) + 2.5} fontSize="7.5" fill="#5d6779" fontFamily="IBM Plex Mono">{db > 0 ? `+${db}` : db}</text>
        </g>
      ))}

      <path d={`${path} L ${W - PR} ${yOf(0)} L ${PL} ${yOf(0)} Z`} fill={color} opacity="0.10" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />

      {handles.map((h) => (
        <g key={h.k}
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture(e.pointerId);
            setDrag(h.k);
          }}
          className="cursor-grab active:cursor-grabbing"
        >
          <circle cx={h.x} cy={h.y} r="9" fill="transparent" />
          <circle cx={h.x} cy={h.y} r={drag === h.k ? 5.5 : 4.5} fill="#0d1015" stroke={color} strokeWidth="2" />
          <text x={h.x} y={h.y - 8} textAnchor="middle" fontSize="7.5" fill={drag === h.k ? color : "#8b95a6"} fontFamily="IBM Plex Mono">
            {h.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
