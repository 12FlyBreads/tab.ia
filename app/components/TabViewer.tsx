'use client';

import { useEffect, useRef, useState } from 'react';

type AlphaTabEvent<T = void> = { on: (callback: (event: T) => void) => () => void };
type BeatData = { playbackStart: number; playbackDuration: number };
type ScoreBar = { displayWidth: number; voices: Array<{ beats: BeatData[] }> };
type ScoreStaff = {
  showStandardNotation: boolean;
  showTablature: boolean;
  bars: ScoreBar[];
};
type ScoreData = {
  tempo: number;
  tracks: Array<{ staves: ScoreStaff[] }>;
};
type PlayerPosition = {
  currentTime: number;
  endTime: number;
  currentTick: number;
  endTick: number;
};
type AlphaTabApi = {
  destroy: () => void;
  load: (data: string | Uint8Array) => boolean;
  tex: (value: string) => void;
  playPause: () => void;
  isReadyForPlayback: boolean;
  playbackSpeed: number;
  masterVolume: number;
  metronomeVolume: number;
  isLooping: boolean;
  tickPosition: number;
  playbackRange: { startTick: number; endTick: number } | null;
  score: ScoreData | null;
  playerReady: AlphaTabEvent;
  scoreLoaded: AlphaTabEvent<ScoreData>;
  soundFontLoad: AlphaTabEvent<{ loaded: number; total: number }>;
  soundFontLoaded: AlphaTabEvent;
  playerPositionChanged: AlphaTabEvent<PlayerPosition>;
  playerStateChanged: AlphaTabEvent<{ state: number }>;
  renderFinished: AlphaTabEvent<unknown>;
  error: AlphaTabEvent<Error>;
};

type TabViewerProps = {
  alphaTex?: string;
  fileUrl?: string;
  fileData?: Uint8Array;
  tab?: string;
};

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function TabViewer({ alphaTex, fileUrl, fileData, tab }: TabViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const [rendered, setRendered] = useState(false);
  const [soundFontLoaded, setSoundFontLoaded] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('Carregando tablatura…');
  const [currentTime, setCurrentTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [currentTick, setCurrentTick] = useState(0);
  const [endTick, setEndTick] = useState(0);
  const [looping, setLooping] = useState(false);
  const [metronome, setMetronome] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [volume, setVolume] = useState(80);
  const [measure, setMeasure] = useState(0);
  const [measureCount, setMeasureCount] = useState(0);
  const volumeRef = useRef(80);
  const baseTempoRef = useRef(120);

  useEffect(() => {
    let active = true;
    let api: AlphaTabApi | null = null;
    const unsubscribe: Array<() => void> = [];

    setRendered(false);
    setSoundFontLoaded(false);
    setPlayerReady(false);
    setPlaying(false);
    setCurrentTime(0);
    setEndTime(0);
    setCurrentTick(0);
    setEndTick(0);
    setLooping(false);
    setMetronome(false);
    setBpm(120);
    setMeasure(0);
    setMeasureCount(0);
    setStatus('Carregando tablatura…');

    const hasInput = Boolean(alphaTex || fileUrl || fileData);
    if (!containerRef.current || !hasInput) {
      setStatus('Nenhum dado de partitura foi recebido.');
      return;
    }

    import('@coderline/alphatab').then(alphaTab => {
      if (!active || !containerRef.current) return;

      api = new alphaTab.AlphaTabApi(containerRef.current, {
        core: { fontDirectory: '/alphatab/font/' },
        player: {
          enablePlayer: true,
          enableUserInteraction: true,
          playerMode: alphaTab.PlayerMode.EnabledSynthesizer,
          soundFont: '/alphatab/soundfont/sonivox.sf2',
          enableCursor: true,
          enableAnimatedBeatCursor: true,
          enableElementHighlighting: true,
          scrollElement: '#tab-scroll-viewport',
          scrollMode: alphaTab.ScrollMode.Smooth,
          scrollSpeed: 500,
        },
        display: {
          staveProfile: alphaTab.StaveProfile.ScoreTab,
          layoutMode: alphaTab.LayoutMode.Horizontal,
          resources: {
            staffLineColor: '#475569',
            barSeparatorColor: '#64748b',
            barNumberColor: '#67e8f9',
            mainGlyphColor: '#e2e8f0',
            secondaryGlyphColor: '#94a3b8',
            scoreInfoColor: '#e2e8f0',
          },
        },
      }) as unknown as AlphaTabApi;
      apiRef.current = api;

      unsubscribe.push(api.soundFontLoad.on(event => {
        if (!active) return;
        const percent = event.total > 0 ? Math.round(event.loaded / event.total * 100) : 0;
        setStatus(`Carregando sons… ${percent}%`);
      }));
      unsubscribe.push(api.soundFontLoaded.on(() => {
        if (active) setSoundFontLoaded(true);
      }));
      unsubscribe.push(api.playerReady.on(() => {
        if (!active) return;
        setPlayerReady(true);
        api!.masterVolume = volumeRef.current / 100;
        setStatus('Tablatura e áudio prontos');
      }));
      unsubscribe.push(api.scoreLoaded.on(score => {
        if (!active) return;
        baseTempoRef.current = Math.max(1, score.tempo || 120);
        setBpm(Math.round(baseTempoRef.current));
        const staff = score.tracks[0]?.staves[0];
        if (staff) {
          staff.showStandardNotation = true;
          staff.showTablature = true;
          const barWidth = Math.max(280, (containerRef.current?.clientWidth ?? 640) - 32);
          for (const bar of staff.bars) bar.displayWidth = barWidth;
          setMeasureCount(staff.bars.length);
        }
        setMeasure(0);
      }));
      unsubscribe.push(api.playerPositionChanged.on(position => {
        if (!active) return;
        setCurrentTime(position.currentTime);
        setEndTime(position.endTime);
        setCurrentTick(position.currentTick);
        setEndTick(position.endTick);
      }));
      unsubscribe.push(api.playerStateChanged.on(event => {
        if (active) setPlaying(event.state === alphaTab.synth.PlayerState.Playing);
      }));
      unsubscribe.push(api.renderFinished.on(() => {
        if (!active) return;
        setRendered(true);
        setStatus('Partitura renderizada; preparando áudio…');
      }));
      unsubscribe.push(api.error.on(error => {
        if (active) setStatus(error.message || 'O alphaTab encontrou um erro.');
      }));

      if (alphaTex) api.tex(alphaTex);
      else {
        const accepted = api.load(fileData ?? fileUrl!);
        if (!accepted) setStatus('Formato não suportado pelo alphaTab.');
      }
    }).catch(error => {
      if (active) setStatus(error instanceof Error ? error.message : 'Falha ao inicializar alphaTab.');
    });

    return () => {
      active = false;
      unsubscribe.forEach(removeListener => removeListener());
      api?.destroy();
      if (apiRef.current === api) apiRef.current = null;
    };
  }, [alphaTex, fileData, fileUrl]);

  const ready = rendered && soundFontLoaded && playerReady;

  function seekToTick(tick: number) {
    if (!apiRef.current) return;
    const boundedTick = Math.max(0, Math.min(endTick, tick));
    setCurrentTick(boundedTick);
    apiRef.current.tickPosition = boundedTick;
  }

  function toggleLoop() {
    if (!apiRef.current) return;
    const next = !looping;
    apiRef.current.isLooping = next;
    setLooping(next);
  }

  function toggleMetronome() {
    if (!apiRef.current) return;
    const next = !metronome;
    apiRef.current.metronomeVolume = next ? 0.7 : 0;
    setMetronome(next);
  }

  function changeBpm(nextBpm: number) {
    const bounded = Math.max(40, Math.min(240, nextBpm));
    setBpm(bounded);
    if (apiRef.current) {
      apiRef.current.playbackSpeed = bounded / baseTempoRef.current;
    }
  }

  function changeMeasure(nextMeasure: number) {
    const api = apiRef.current;
    if (!api) return;
    const bounded = Math.max(0, Math.min(measureCount, nextMeasure));
    setMeasure(bounded);
    api.tickPosition = 0;
    if (bounded === 0) {
      api.playbackRange = null;
      return;
    }

    const bar = api.score?.tracks[0]?.staves[0]?.bars[bounded - 1];
    const beats = bar?.voices.flatMap(voice => voice.beats)
      .sort((left, right) => left.playbackStart - right.playbackStart) ?? [];
    const firstBeat = beats[0];
    const lastBeat = beats[beats.length - 1];
    if (!firstBeat || !lastBeat) {
      api.playbackRange = null;
      return;
    }
    api.playbackRange = {
      startTick: firstBeat.playbackStart,
      endTick: lastBeat.playbackStart + lastBeat.playbackDuration,
    };
    api.tickPosition = firstBeat.playbackStart;
  }

  return <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 sm:p-8">
    <p className="text-sm font-semibold uppercase tracking-[.2em] text-cyan-300">Resultado final · Etapa 3</p>
    <h2 className="mt-2 text-xl font-semibold">Tablatura interativa</h2>
    <p role="status" className="mt-2 text-xs text-slate-400">{status}</p>

    <div id="tab-scroll-viewport" className="mt-5 min-h-[400px] w-full overflow-x-hidden rounded-xl border border-slate-700 bg-slate-950 p-3 text-slate-100">
      <div ref={containerRef} className="block min-h-[400px] w-full" style={{ minHeight: 400 }} />
      {!alphaTex && !fileUrl && !fileData && tab &&
        <pre className="overflow-x-auto whitespace-pre font-mono text-sm leading-7 text-slate-100">{tab}</pre>}
    </div>

    <footer className="sticky bottom-3 z-20 mt-6 rounded-xl border border-slate-700 bg-slate-950/95 p-3 shadow-2xl backdrop-blur sm:p-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <button type="button" aria-label={playing ? 'Pausar' : 'Reproduzir'} onClick={() => apiRef.current?.playPause()} disabled={!ready}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-300 text-lg font-bold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-40">
          {playing ? 'Ⅱ' : '▶'}
        </button>

        <span className="w-24 shrink-0 text-center font-mono text-xs tabular-nums text-slate-300">
          {formatTime(currentTime)} / {formatTime(endTime)}
        </span>

        <input aria-label="Posição da música" type="range" min={0} max={Math.max(1, endTick)} step={1}
          value={Math.min(currentTick, Math.max(1, endTick))} onChange={event => seekToTick(Number(event.target.value))}
          disabled={!ready || endTick === 0} className="min-w-40 flex-1 accent-cyan-300 disabled:opacity-40" />

        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <button type="button" aria-pressed={looping} onClick={toggleLoop} disabled={!ready}
            className={`rounded-lg px-2.5 py-2 text-xs font-semibold ${looping ? 'bg-cyan-300 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}>Loop</button>
          <button type="button" aria-pressed={metronome} onClick={toggleMetronome} disabled={!ready}
            className={`rounded-lg px-2.5 py-2 text-xs font-semibold ${metronome ? 'bg-cyan-300 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}>Metrônomo</button>

          <label className="flex items-center gap-2 text-xs text-slate-300">
            BPM
            <input aria-label="BPM da reprodução" type="number" min={40} max={240} step={1} value={bpm}
              onChange={event => changeBpm(Number(event.target.value) || 40)} disabled={!ready}
              className="w-20 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-center text-slate-100" />
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-300">
            <span aria-hidden="true">🔊</span>
            <input aria-label="Volume" type="range" min={0} max={100} step={1} value={volume}
              onChange={event => {
                const next = Number(event.target.value);
                setVolume(next);
                volumeRef.current = next;
                if (apiRef.current) apiRef.current.masterVolume = next / 100;
              }} disabled={!ready} className="w-20 accent-cyan-300 disabled:opacity-40" />
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-300">
            Compasso
            <select aria-label="Compasso para reprodução" value={measure}
              onChange={event => changeMeasure(Number(event.target.value))} disabled={!ready || measureCount === 0}
              className="max-w-32 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-slate-100">
              <option value={0}>Todos</option>
              {Array.from({ length: measureCount }, (_, index) =>
                <option key={index + 1} value={index + 1}>{index + 1}</option>)}
            </select>
          </label>
        </div>
      </div>
    </footer>
  </section>;
}
