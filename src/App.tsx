import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GENRES, MASTER_BASE, ROOTS, SCALES, TRACKS, keyName, presetFor,
} from "./audio/presets";
import type { Genre, MasterState } from "./audio/presets";
import { engine } from "./audio/engine";
import type { TrackAudio } from "./audio/engine";
import { encodeWav, quantizeBuffer, tuneBuffer } from "./audio/processing";
import { DEMO_BPM, generateDemo } from "./audio/demoSynth";
import type { TState } from "./types";
import { ChannelStrip } from "./components/ChannelStrip";
import { ChannelEditor } from "./components/ChannelEditor";
import { MasterPanel } from "./components/MasterPanel";
import { Led, TButton } from "./components/controls";

const initTracks = (): Record<string, TState> => {
  const o: Record<string, TState> = {};
  for (const d of TRACKS) {
    const p = presetFor("modern", d.id);
    o[d.id] = {
      fileName: null, buffer: null, processed: null,
      eq: p.eq, comp: p.comp, fader: p.fader, pan: p.pan, pol: 1,
      mute: false, solo: false, amount: 85,
      subdiv: d.id === "drums" || d.id === "stac" ? 16 : 8,
      strength: 100, tuneDone: false, gridDone: false, busy: null, prog: 0,
    };
  }
  return o;
};

type Toast = { id: number; text: string; err?: boolean };
const fmtTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
};

export default function App() {
  const [tracks, setTracks] = useState<Record<string, TState>>(initTracks);
  const [selected, setSelected] = useState("vox");
  const [genre, setGenre] = useState<Genre>("modern");
  const [bpm, setBpm] = useState(150);
  const [rootMidi, setRootMidi] = useState(64);
  const [scaleId, setScaleId] = useState("min");
  const [master, setMaster] = useState<MasterState>(MASTER_BASE);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [bouncing, setBouncing] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [bpmText, setBpmText] = useState("150");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const timeRef = useRef(0);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;

  const anySolo = useMemo(() => TRACKS.some((d) => tracks[d.id].solo), [tracks]);
  const loadedCount = useMemo(() => TRACKS.filter((d) => tracks[d.id].buffer).length, [tracks]);
  const duration = useMemo(() => {
    let mx = 0;
    for (const d of TRACKS) {
      const b = tracks[d.id].processed ?? tracks[d.id].buffer;
      if (b && b.duration > mx) mx = b.duration;
    }
    return mx;
  }, [tracks]);

  const selDef = TRACKS.find((d) => d.id === selected)!;
  const selSt = tracks[selected];

  const toast = useCallback((text: string, err = false) => {
    const id = ++toastId.current;
    setToasts((ts) => [...ts.slice(-3), { id, text, err }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 3600);
  }, []);

  const patch = useCallback((id: string, p: Partial<TState>) => {
    setTracks((t) => ({ ...t, [id]: { ...t[id], ...p } }));
  }, []);

  /* синхронизация состояния с аудио-движком */
  const syncEngine = useCallback(() => {
    if (!engine.ctx) return;
    for (const d of TRACKS) {
      const st = tracks[d.id];
      engine.updateTrack(d.id, {
        eq: st.eq, comp: st.comp, fader: st.fader, pan: st.pan, pol: st.pol,
        muted: st.mute || (anySolo && !st.solo),
      });
    }
    engine.updateMaster(master);
  }, [tracks, anySolo, master]);

  useEffect(() => { syncEngine(); }, [syncEngine]);

  /* плейхед */
  useEffect(() => {
    let raf = 0, last = 0;
    const loop = (ts: number) => {
      const p = engine.getPos();
      timeRef.current = p;
      if (ts - last > 50) { setTime(p); last = ts; }
      if (engine.playing && duration > 0 && p > duration + 0.15) {
        engine.stop(); setPlaying(false); setTime(0); timeRef.current = 0;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [duration]);

  const collectBufs = useCallback((): Map<string, AudioBuffer> => {
    const m = new Map<string, AudioBuffer>();
    for (const d of TRACKS) {
      const st = tracksRef.current[d.id];
      const b = st.processed ?? st.buffer;
      if (b) m.set(d.id, b);
    }
    return m;
  }, []);

  /* транспорт */
  const doPlay = () => {
    const bufs = collectBufs();
    if (!bufs.size) { toast("СНАЧАЛА ЗАГРУЗИТЕ ДОРОЖКИ ИЛИ НАЖМИТЕ «ДЕМО-ТРЕК»", true); return; }
    const c = engine.ensure();
    void c.resume();
    syncEngine();
    const off = timeRef.current >= duration - 0.05 ? 0 : timeRef.current;
    engine.play(bufs, off);
    setPlaying(true);
  };
  const doStop = () => { engine.stop(); setPlaying(false); setTime(0); timeRef.current = 0; };
  const onSeek = (t: number) => {
    const tt = Math.max(0, Math.min(Math.max(0.01, duration), t));
    if (engine.playing) { engine.play(collectBufs(), tt); }
    else engine.seek(tt);
    setTime(tt); timeRef.current = tt;
  };
  const restartIfPlaying = () => {
    if (engine.playing) { engine.play(collectBufs(), engine.getPos()); }
  };

  /* загрузка файла */
  const handleFile = async (id: string, f: File) => {
    try {
      const c = engine.ensure();
      void c.resume();
      const ab = await f.arrayBuffer();
      const buf = await c.decodeAudioData(ab);
      const p = presetFor(genre, id);
      const name = TRACKS.find((d) => d.id === id)!.name;
      setTracks((t) => ({
        ...t,
        [id]: {
          ...t[id], buffer: buf, processed: null, fileName: f.name,
          eq: p.eq, comp: p.comp, fader: p.fader, pan: p.pan,
          tuneDone: false, gridDone: false, busy: null,
        },
      }));
      toast(`${name}: ЗАГРУЖЕНА • ПРЕСЕТ ${GENRES.find((g) => g.id === genre)?.name}`);
      window.setTimeout(syncEngine, 30);
    } catch {
      toast("НЕ УДАЛОСЬ ДЕКОДИРОВАТЬ ФАЙЛ", true);
    }
  };

  /* жанр */
  const applyGenre = (g: Genre) => {
    setGenre(g);
    setTracks((t) => {
      const n = { ...t };
      for (const d of TRACKS) {
        if (t[d.id].buffer) {
          const p = presetFor(g, d.id);
          n[d.id] = { ...n[d.id], eq: p.eq, comp: p.comp };
        }
      }
      return n;
    });
    toast(`ЖАНРОВАЯ СХЕМА: ${GENRES.find((x) => x.id === g)?.name}`);
  };

  /* тюнинг и квантизация */
  const runTune = async (id: string) => {
    const st = tracks[id];
    const src = st.processed ?? st.buffer;
    if (!src) return;
    const name = TRACKS.find((d) => d.id === id)!.name;
    patch(id, { busy: "tune", prog: 0 });
    const scale = SCALES.find((s) => s.id === scaleId)!.s;
    try {
      const out = await tuneBuffer(src, rootMidi, scale, tracks[id].amount / 100, (p) => patch(id, { prog: p }));
      patch(id, { processed: out, busy: null, tuneDone: true, prog: 1 });
      toast(`${name}: ТЮНИНГ В ${keyName(rootMidi, scaleId).toUpperCase()} ГОТОВ`);
      window.setTimeout(restartIfPlaying, 50);
    } catch {
      patch(id, { busy: null });
      toast("ОШИБКА ТЮНИНГА", true);
    }
  };

  const runGrid = async (id: string) => {
    const st = tracks[id];
    const src = st.processed ?? st.buffer;
    if (!src) return;
    const name = TRACKS.find((d) => d.id === id)!.name;
    patch(id, { busy: "grid", prog: 0 });
    try {
      const out = await quantizeBuffer(src, bpm, tracks[id].subdiv, tracks[id].strength / 100, (p) => patch(id, { prog: p }));
      patch(id, { processed: out, busy: null, gridDone: true, prog: 1 });
      toast(`${name}: ВЫРОВНЯНА ПО СЕТКЕ ${bpm} BPM`);
      window.setTimeout(restartIfPlaying, 50);
    } catch {
      patch(id, { busy: null });
      toast("ОШИБКА КВАНТИЗАЦИИ", true);
    }
  };

  const resetProc = (id: string) => {
    patch(id, { processed: null, tuneDone: false, gridDone: false });
    toast("ОБРАБОТКА СБРОШЕНА К ИСХОДНОЙ ДОРОЖКЕ");
    window.setTimeout(restartIfPlaying, 50);
  };

  /* демо-трек */
  const doDemo = async () => {
    setDemoBusy(true);
    try {
      const bufs = await generateDemo();
      setTracks((t) => {
        const n = { ...t };
        for (const d of TRACKS) {
          const p = presetFor(genre, d.id);
          n[d.id] = {
            ...n[d.id], buffer: bufs[d.id], processed: null, fileName: `demo_${d.id}.pcm`,
            eq: p.eq, comp: p.comp, fader: p.fader, pan: p.pan, tuneDone: false, gridDone: false,
          };
        }
        return n;
      });
      setBpm(DEMO_BPM); setBpmText(String(DEMO_BPM)); setRootMidi(64); setScaleId("min");
      toast("ДЕМО-МУЛЬТИТРЕК СГЕНЕРИРОВАН: 150 BPM • E-МИНОР • 8 ТАКТОВ");
    } catch {
      toast("ОШИБКА ГЕНЕРАЦИИ ДЕМО", true);
    }
    setDemoBusy(false);
  };

  /* рендер мастера */
  const doBounce = async () => {
    const bufs = collectBufs();
    if (!bufs.size) { toast("НЕТ ДАННЫХ ДЛЯ РЕНДЕРА", true); return; }
    setBouncing(true);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const settings = (id: string): TrackAudio => {
        const st = tracks[id];
        return {
          eq: st.eq, comp: st.comp, fader: st.fader, pan: st.pan, pol: st.pol,
          muted: st.mute || (anySolo && !st.solo),
        };
      };
      const out = await engine.renderOffline(bufs, settings, master, duration);
      const url = URL.createObjectURL(encodeWav(out));
      const a = document.createElement("a");
      a.href = url; a.download = "kuznya_metal_master.wav"; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast("МАСТЕР ОТРЕНДЕРЕН: kuznya_metal_master.wav");
    } catch {
      toast("ОШИБКА РЕНДЕРА МАСТЕРА", true);
    }
    setBouncing(false);
  };

  const keyLabel = keyName(rootMidi, scaleId);

  return (
    <div className="min-h-screen flex flex-col bg-ink bg-blueprint noise text-silk">
      {/* ================= ШАПКА ================= */}
      <header className="steel border-b border-line relative z-10">
        <div className="hazard h-[5px]" />
        <div className="flex items-center gap-4 px-4 py-2 flex-wrap">
          {/* лого */}
          <div className="flex items-center gap-2.5 pr-3 border-r border-line">
            <div className="w-9 h-9 bg-amber rounded-[4px] bevel flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#14151a">
                <path d="M13 2L4.5 13.5H11L9.5 22 19 9.5h-6.5L13 2z" />
              </svg>
            </div>
            <div>
              <div className="font-disp text-xl leading-none text-silk tracking-wide">КУЗНЯ</div>
              <div className="font-mono text-[8px] text-amber tracking-[0.32em] mt-0.5">METAL MIX CONSOLE</div>
            </div>
          </div>

          {/* транспорт */}
          <div className="flex items-center gap-2">
            <button
              onClick={doPlay}
              className={`bevel rounded-[4px] px-4 py-2 flex items-center gap-2 font-disp text-[12px] tracking-[0.12em] transition-colors ${
                playing ? "bg-raise text-dim" : "bg-ok text-ink hover:brightness-110"
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 3l16 9-16 9z" /></svg>
              PLAY
            </button>
            <button onClick={doStop}
              className="bevel rounded-[4px] px-4 py-2 flex items-center gap-2 font-disp text-[12px] tracking-[0.12em] bg-raise text-silk hover:bg-line">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
              STOP
            </button>
            <div className="inset-well rounded-[3px] px-3 py-1.5 font-mono text-sm text-amber glow-amber min-w-[132px] text-center">
              {fmtTime(time)} <span className="text-faint">/ {fmtTime(duration)}</span>
            </div>
            <Led on={playing} color="#ff4b3a" pulse />
          </div>

          {/* таймлайн */}
          <div
            className="flex-1 min-w-[140px] h-3.5 inset-well rounded-[2px] cursor-crosshair relative overflow-hidden"
            onPointerDown={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              onSeek(((e.clientX - r.left) / r.width) * duration);
            }}
            title="Перемотка"
          >
            <div className="absolute top-0 bottom-0 left-0 bg-amber/70" style={{ width: `${duration ? (time / duration) * 100 : 0}%` }} />
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="absolute top-0 bottom-0 w-px bg-line2/70" style={{ left: `${(i + 1) * 12.5}%` }} />
            ))}
          </div>

          {/* темп / тональность / жанр */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 font-mono text-[9px] text-dim tracking-widest">
              BPM
              <input
                value={bpmText}
                onChange={(e) => {
                  setBpmText(e.target.value.replace(/[^\d]/g, "").slice(0, 3));
                }}
                onBlur={() => {
                  const v = parseInt(bpmText, 10);
                  const c = Math.max(60, Math.min(220, isNaN(v) ? bpm : v));
                  setBpm(c); setBpmText(String(c));
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className="w-14 inset-well rounded-[3px] text-center text-amber text-xs py-1 outline-none border border-transparent focus:border-amber"
              />
            </label>
            <label className="flex items-center gap-1 font-mono text-[9px] text-dim tracking-widest">
              KEY
              <select value={rootMidi} onChange={(e) => setRootMidi(parseInt(e.target.value, 10))}>
                {ROOTS.map((r) => <option key={r.m} value={r.m}>{r.n}</option>)}
              </select>
              <select value={scaleId} onChange={(e) => setScaleId(e.target.value)}>
                {SCALES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <div className="flex rounded-[4px] overflow-hidden border border-line">
              {GENRES.map((g) => (
                <button key={g.id} onClick={() => applyGenre(g.id)}
                  className={`px-2.5 py-1.5 font-mono text-[9.5px] tracking-wider transition-colors ${
                    genre === g.id ? "bg-ember text-ink" : "bg-raise text-dim hover:text-silk"
                  }`}>
                  {g.name}
                </button>
              ))}
            </div>
            <TButton onClick={doDemo} on={demoBusy} title="Синтезировать демонстрационный мультитрек">
              {demoBusy ? "ГЕНЕРАЦИЯ…" : "⚡ ДЕМО-ТРЕК"}
            </TButton>
          </div>
        </div>
      </header>

      {/* ================= КОНСОЛЬ ================= */}
      <main className="flex-1 w-full max-w-[1760px] mx-auto px-3 py-3 flex flex-col gap-3">
        <div className="flex gap-3 items-stretch">
          <div className="flex-1 overflow-x-auto pb-1.5">
            <div className="flex gap-2.5 min-w-max pr-2">
              {TRACKS.map((d) => (
                <ChannelStrip
                  key={d.id}
                  def={d}
                  st={tracks[d.id]}
                  selected={selected === d.id}
                  anySolo={anySolo}
                  onSelect={() => setSelected(d.id)}
                  onFile={(f) => void handleFile(d.id, f)}
                  onSeek={onSeek}
                  onMute={() => patch(d.id, { mute: !tracks[d.id].mute })}
                  onSolo={() => patch(d.id, { solo: !tracks[d.id].solo })}
                  onFader={(v) => patch(d.id, { fader: v })}
                  onPan={(v) => patch(d.id, { pan: v })}
                />
              ))}
            </div>
          </div>

          <MasterPanel
            master={master}
            onMaster={(p) => setMaster((m) => ({ ...m, ...p }))}
            onBounce={() => void doBounce()}
            bouncing={bouncing}
            loaded={loadedCount}
          />
        </div>

        <ChannelEditor
          def={selDef}
          st={selSt}
          genre={genre}
          bpm={bpm}
          keyLabel={keyLabel}
          onPatch={(p) => patch(selected, p)}
          onEq={(eq) => patch(selected, { eq })}
          onComp={(c) => patch(selected, { comp: c })}
          onTune={() => void runTune(selected)}
          onGrid={() => void runGrid(selected)}
          onReset={() => resetProc(selected)}
        />
      </main>

      {/* ================= СТАТУС-БАР ================= */}
      <footer className="border-t border-line bg-coal px-4 py-1.5 flex items-center gap-4 font-mono text-[9px] text-faint tracking-wider">
        <span className="flex items-center gap-1.5">
          <Led on={engine.ctx !== null} color="#40dd8f" pulse={playing} /> CTX {engine.ctx ? "ONLINE" : "STANDBY"}
        </span>
        <span>44.1 kHz / 32 bit FLOAT</span>
        <span>ДОРОЖКИ: <span className="text-silk">{loadedCount}/11</span></span>
        <span>ТОНАЛЬНОСТЬ: <span className="text-amber">{keyLabel.toUpperCase()}</span></span>
        <span>СЕТКА: <span className="text-silk">{bpm} BPM</span></span>
        <span className="ml-auto hidden md:block">
          ЛКМ ПО ВОЛНЕ — ПЕРЕМОТКА • ДВОЙНОЙ КЛИК ПО КНОБКЕ — СБРОС • КОЛЕСО — ТОЧНАЯ ПОДСТРОЙКА
        </span>
      </footer>

      {/* ================= ТОСТЫ ================= */}
      <div className="fixed bottom-10 right-4 z-50 flex flex-col gap-2 items-end">
        {toasts.map((t) => (
          <div key={t.id}
            className={`toast-in font-mono text-[10.5px] tracking-wider px-3 py-2 rounded-[4px] border bevel max-w-[340px] ${
              t.err ? "bg-[#2a1412] border-hot text-hot" : "bg-panel2 border-amber/60 text-amber"
            }`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
