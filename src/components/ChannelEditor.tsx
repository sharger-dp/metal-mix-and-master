import { useCallback } from "react";
import type { Genre, TrackDef } from "../audio/presets";
import { SUBDIVS } from "../audio/presets";
import type { TState } from "../types";
import { engine } from "../audio/engine";
import { EqCurve } from "./EqCurve";
import { GRMeter, Knob, PanelTitle, ProgressBar, TButton, Toggle } from "./controls";

const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);
const db = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;

export function ChannelEditor({ def, st, genre, bpm, keyLabel, onPatch, onEq, onComp, onTune, onGrid, onReset }: {
  def: TrackDef;
  st: TState;
  genre: Genre;
  bpm: number;
  keyLabel: string;
  onPatch: (p: Partial<TState>) => void;
  onEq: (eq: TState["eq"]) => void;
  onComp: (c: TState["comp"]) => void;
  onTune: () => void;
  onGrid: () => void;
  onReset: () => void;
}) {
  const getGR = useCallback(() => engine.getReduction(def.id), [def.id]);
  const loaded = !!st.buffer;
  const genreName = { modern: "MODERN METAL", thrash: "THRASH", core: "METALCORE", doom: "DOOM" }[genre];

  return (
    <section className="steel rounded-[6px] border border-line relative">
      <i className="screw absolute top-2 left-2" /><i className="screw absolute top-2 right-2" />
      <i className="screw absolute bottom-2 left-2" /><i className="screw absolute bottom-2 right-2" />

      {/* заголовок */}
      <div className="flex items-center gap-3 px-5 pt-3">
        <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: def.color }} />
        <h2 className="font-disp text-sm tracking-[0.14em] text-silk">CHANNEL RACK — {def.name}</h2>
        <span className="font-mono text-[9px] text-dim border border-line rounded-[2px] px-1.5 py-0.5 tracking-widest">
          PRESET: {genreName} / {def.tag}
        </span>
        <button
          onClick={() => onPatch({ pol: st.pol === 1 ? -1 : 1 })}
          className={`ml-auto bevel rounded-[3px] px-2 py-1 font-mono text-[10px] tracking-wider ${
            st.pol === -1 ? "bg-ember text-ink" : "bg-raise text-dim hover:text-silk"
          }`}
          title="Инверсия фазы"
        >
          Ø PHASE
        </button>
        {st.processed && (
          <button onClick={onReset}
            className="bevel rounded-[3px] px-2 py-1 font-mono text-[10px] tracking-wider bg-raise text-ember hover:text-hot">
            ↺ СБРОС ОБРАБОТКИ
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr_0.9fr] gap-4 p-4">
        {/* ======== EQ ======== */}
        <div className="bg-panel rounded-[5px] border border-line p-3">
          <PanelTitle color={def.color}>ЭКВАЛАЙЗЕР</PanelTitle>
          <EqCurve eq={st.eq} color={def.color} onChange={onEq} />
          <div className="flex flex-wrap justify-between gap-1 mt-2">
            <Knob label="HPF" v={st.eq.hpf} min={20} max={500} log def={st.eq.hpf} size={48} color={def.color} fmt={hz}
              onChange={(v) => onEq({ ...st.eq, hpf: v })} />
            <Knob label="LOW F" v={st.eq.lf} min={30} max={400} log size={48} color={def.color} fmt={hz}
              onChange={(v) => onEq({ ...st.eq, lf: v })} />
            <Knob label="LOW G" v={st.eq.lg} min={-15} max={15} size={48} color={def.color} fmt={db}
              onChange={(v) => onEq({ ...st.eq, lg: v })} />
            <Knob label="MID F" v={st.eq.mf} min={120} max={6000} log size={48} color={def.color} fmt={hz}
              onChange={(v) => onEq({ ...st.eq, mf: v })} />
            <Knob label="MID G" v={st.eq.mg} min={-15} max={15} size={48} color={def.color} fmt={db}
              onChange={(v) => onEq({ ...st.eq, mg: v })} />
            <Knob label="HIGH F" v={st.eq.hf} min={1500} max={16000} log size={48} color={def.color} fmt={hz}
              onChange={(v) => onEq({ ...st.eq, hf: v })} />
            <Knob label="HIGH G" v={st.eq.hg} min={-15} max={15} size={48} color={def.color} fmt={db}
              onChange={(v) => onEq({ ...st.eq, hg: v })} />
          </div>
        </div>

        {/* ======== КОМПРЕССОР ======== */}
        <div className="bg-panel rounded-[5px] border border-line p-3 flex flex-col">
          <div className="flex items-center justify-between">
            <PanelTitle color="#ff7a1a">КОМПРЕССОР</PanelTitle>
          </div>
          <div className="-mt-1 mb-2">
            <Toggle on={st.comp.on} onChange={(v) => onComp({ ...st.comp, on: v })} label={st.comp.on ? "ВКЛ" : "ОБХОД"} />
          </div>
          <div className="flex flex-wrap gap-1 justify-between">
            <Knob label="THRESH" v={st.comp.th} min={-45} max={0} size={50} color="#ff7a1a" fmt={(v) => `${v.toFixed(0)}`}
              onChange={(v) => onComp({ ...st.comp, th: v })} disabled={!st.comp.on} />
            <Knob label="RATIO" v={st.comp.ratio} min={1} max={20} size={50} color="#ff7a1a" fmt={(v) => `${v.toFixed(1)}:1`}
              onChange={(v) => onComp({ ...st.comp, ratio: Math.round(v * 2) / 2 })} disabled={!st.comp.on} />
            <Knob label="ATTACK" v={st.comp.atk} min={0.5} max={60} log size={50} color="#ff7a1a" fmt={(v) => `${v.toFixed(v < 10 ? 1 : 0)}`}
              onChange={(v) => onComp({ ...st.comp, atk: v })} disabled={!st.comp.on} />
            <Knob label="RELEASE" v={st.comp.rel} min={30} max={600} log size={50} color="#ff7a1a" fmt={(v) => `${Math.round(v)}`}
              onChange={(v) => onComp({ ...st.comp, rel: v })} disabled={!st.comp.on} />
            <Knob label="MAKEUP" v={st.comp.mk} min={0} max={18} size={50} color="#ff7a1a" fmt={(v) => `+${v.toFixed(1)}`}
              onChange={(v) => onComp({ ...st.comp, mk: v })} disabled={!st.comp.on} />
          </div>
          <div className="mt-auto pt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[9px] text-dim tracking-widest">GAIN REDUCTION</span>
              <span className="font-mono text-[9px] text-ember">{st.comp.on ? "SSL-BUS STYLE" : "BYPASS"}</span>
            </div>
            <GRMeter get={getGR} />
          </div>

          <div className="mt-3 pt-2 border-t border-line grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[9px] text-faint">
            <span>ФАЙЛ: <span className="text-dim">{st.fileName ?? "—"}</span></span>
            <span>ДЛИНА: <span className="text-dim">{st.buffer ? `${st.buffer.duration.toFixed(1)}s` : "—"}</span></span>
            <span>SR: <span className="text-dim">{st.buffer ? `${(st.buffer.sampleRate / 1000).toFixed(1)} kHz` : "—"}</span></span>
            <span>КАНАЛЫ: <span className="text-dim">{st.buffer ? st.buffer.numberOfChannels : "—"}</span></span>
          </div>
        </div>

        {/* ======== ТЮНИНГ / СЕТКА ======== */}
        <div className="bg-panel rounded-[5px] border border-line p-3 flex flex-col gap-3">
          {def.tune && (
            <div>
              <PanelTitle color="#f472b6">ТЮНИНГ ВОКАЛА</PanelTitle>
              <div className="flex items-center gap-3">
                <Knob label="AMOUNT" v={st.amount} min={0} max={100} def={85} size={50} color="#f472b6"
                  fmt={(v) => `${Math.round(v)}%`} onChange={(v) => onPatch({ amount: v })} />
                <div className="flex-1">
                  <div className="font-mono text-[9px] text-dim mb-1">ТОНАЛЬНОСТЬ: <span className="text-silk">{keyLabel}</span></div>
                  <div className="font-mono text-[8.5px] text-faint leading-relaxed">
                    ноты вокала будут притянуты к ближайшим ступеням тональности (offline, без изменения тайминга)
                  </div>
                </div>
              </div>
              <button
                onClick={onTune}
                disabled={!loaded || st.busy !== null}
                className={`mt-2 w-full bevel rounded-[4px] py-2 font-disp text-[11px] tracking-[0.15em] transition-colors ${
                  !loaded || st.busy !== null
                    ? "bg-raise text-faint cursor-not-allowed"
                    : st.tuneDone ? "bg-panel2 text-ok border border-ok/40" : "bg-amber text-ink hover:brightness-110"
                }`}
              >
                {st.busy === "tune" ? "ОБРАБОТКА…" : st.tuneDone ? "✓ ОТТЮНЕНО — ПОВТОРИТЬ" : "ОТТЮНИТЬ В ТОНАЛЬНОСТЬ"}
              </button>
            </div>
          )}

          {def.quant && (
            <div>
              <PanelTitle color="#2dd4bf">ВЫРАВНИВАНИЕ В СЕТКУ</PanelTitle>
              <div className="flex items-center gap-3">
                <Knob label="СИЛА" v={st.strength} min={0} max={100} def={100} size={50} color="#2dd4bf"
                  fmt={(v) => `${Math.round(v)}%`} onChange={(v) => onPatch({ strength: v })} />
                <div className="flex-1">
                  <div className="font-mono text-[9px] text-dim mb-1">ТЕМПО: <span className="text-silk">{bpm} BPM</span></div>
                  <div className="flex gap-1">
                    {SUBDIVS.map((s) => (
                      <button key={s.v} onClick={() => onPatch({ subdiv: s.v })}
                        className={`bevel rounded-[3px] px-2 py-1 font-mono text-[10px] ${
                          st.subdiv === s.v ? "bg-amber text-ink" : "bg-raise text-dim hover:text-silk"
                        }`}>
                        {s.n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button
                onClick={onGrid}
                disabled={!loaded || st.busy !== null}
                className={`mt-2 w-full bevel rounded-[4px] py-2 font-disp text-[11px] tracking-[0.15em] transition-colors ${
                  !loaded || st.busy !== null
                    ? "bg-raise text-faint cursor-not-allowed"
                    : st.gridDone ? "bg-panel2 text-ok border border-ok/40" : "bg-amber text-ink hover:brightness-110"
                }`}
              >
                {st.busy === "grid" ? "ОБРАБОТКА…" : st.gridDone ? "✓ В СЕТКЕ — ПОВТОРИТЬ" : "ВЫРОВНЯТЬ ПО СЕТКЕ"}
              </button>
            </div>
          )}

          {!def.tune && !def.quant && (
            <div className="font-mono text-[10px] text-faint leading-relaxed pt-1">
              Служебная дорожка: редактура по сетке и тюнинг не требуются — только эквализация и динамика слева.
            </div>
          )}

          {st.busy && (
            <div>
              <div className="flex justify-between font-mono text-[9px] text-dim mb-1">
                <span>{st.busy === "tune" ? "ТЮНИНГ" : "КВАНТИЗАЦИЯ"}</span>
                <span>{Math.round(st.prog * 100)}%</span>
              </div>
              <ProgressBar p={st.prog} />
            </div>
          )}

          <div className="mt-auto flex flex-wrap gap-1 pt-2 border-t border-line">
            {st.tuneDone && <span className="font-mono text-[8.5px] text-ok border border-ok/30 rounded-[2px] px-1.5 py-0.5">✓ ТЮНИНГ: {keyLabel}</span>}
            {st.gridDone && <span className="font-mono text-[8.5px] text-ok border border-ok/30 rounded-[2px] px-1.5 py-0.5">✓ СЕТКА: {bpm} BPM / {st.subdiv === 4 ? "1/4" : st.subdiv === 8 ? "1/8" : "1/16"}</span>}
            {!st.tuneDone && !st.gridDone && !st.busy && (
              <span className="font-mono text-[8.5px] text-faint">
                {loaded ? "обработка не применена" : "загрузите дорожку, пресет уже применён"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* оверлей, если канал пуст */}
      {!loaded && (
        <div className="absolute inset-0 rounded-[6px] bg-ink/55 backdrop-blur-[1.5px] flex items-center justify-center pointer-events-none">
          <span className="font-disp text-[13px] tracking-[0.2em] text-dim">ЗАГРУЗИТЕ ДОРОЖКУ «{def.name}» — ПРЕСЕТ {genreName} УЖЕ НАСТРОЕН</span>
        </div>
      )}
    </section>
  );
}
