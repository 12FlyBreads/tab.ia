'use client';

import { PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { useAudioWaveform } from '../hooks/useAudioWaveform';

type AlphaTabEvent<T = void> = { on: (callback: (event: T) => void) => () => void };
type BeatData = { playbackStart: number; playbackDuration: number };
type ScoreBar = {
  displayWidth: number;
  masterBar: { start: number; calculateDuration: () => number };
  voices: Array<{ beats: BeatData[] }>;
};
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
type BeatLookupResult = { currentBeat: unknown };
type MasterBarBounds = { lineAlignedBounds: { x: number } };
type AlphaTabApi = {
  destroy: () => void;
  load: (data: string | Uint8Array) => boolean;
  tex: (value: string) => void;
  playPause: () => void;
  tickCache: { findBeat: (tracks: Set<number>, tick: number) => BeatLookupResult | null } | null;
  boundsLookup: { findMasterBarByIndex: (index: number) => MasterBarBounds | null } | null;
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
  instrumentalUrl?: string;
  tab?: string;
};

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function TabViewer({ alphaTex, fileUrl, fileData, instrumentalUrl, tab }: TabViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instrumentalAudioRef = useRef<HTMLAudioElement>(null);
  const waveform = useAudioWaveform(instrumentalUrl || '');
  const apiRef = useRef<AlphaTabApi | null>(null);
  const lastPlaybackTickRef = useRef(0);
  const lastPlaybackTimeRef = useRef(0);
  const measureRef = useRef(0);
  const scoreDragRef = useRef<{ pointerId: number; startX: number; startScrollLeft: number; moved: boolean } | null>(null);
  const suppressScoreClickRef = useRef(false);
  const [rendered, setRendered] = useState(false);
  const [soundFontLoaded, setSoundFontLoaded] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [audioSource, setAudioSource] = useState<'synth' | 'guitar'>('synth');
  const [status, setStatus] = useState('Carregando tablatura…');
  const [guitarPlaying, setGuitarPlaying] = useState(false);
  const [guitarCurrentTime, setGuitarCurrentTime] = useState(0);
  const [guitarDuration, setGuitarDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [currentTick, setCurrentTick] = useState(0);
  const [endTick, setEndTick] = useState(0);
  const [metronome, setMetronome] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(80);
  const [measure, setMeasure] = useState(0);
  const [measureCount, setMeasureCount] = useState(0);
  const volumeRef = useRef(80);

  function keepPlaybackCursorInView(force = false) {
    const viewport = containerRef.current?.parentElement;
    if (!viewport || viewport.clientWidth === 0) return;

    // Use alphaTab's rendered cursor as the source of truth. BoundsLookup coordinates
    // can lag behind a seek/loop and leave the scroll position on the old measure.
    const cursor = containerRef.current?.querySelector('.at-cursor-beat');
    if (!cursor) return;
    const cursorX = cursor.getBoundingClientRect().left - viewport.getBoundingClientRect().left + viewport.scrollLeft;

    const targetScrollLeft = Math.max(0, cursorX - viewport.clientWidth / 3);
    const cursorViewportX = cursorX - viewport.scrollLeft;
    if (force || cursorViewportX > viewport.clientWidth / 3) {
      viewport.scrollLeft = Math.min(targetScrollLeft, viewport.scrollWidth - viewport.clientWidth);
    }
  }

  function togglePlayback() {
    const api = apiRef.current;
    if (!api) return;
    api.playPause();
    if (!playing && measureRef.current === 0) keepPlaybackCursorInView(true);
  }

  function selectAudioSource(source: 'synth' | 'guitar') {
    if (source === audioSource) return;
    if (playing) apiRef.current?.playPause();
    instrumentalAudioRef.current?.pause();
    setAudioSource(source);
  }

  useEffect(() => {
    let active = true;
    let api: AlphaTabApi | null = null;
    const unsubscribe: Array<() => void> = [];

    setRendered(false);
    setSoundFontLoaded(false);
    setPlayerReady(false);
    setPlaying(false);
    setGuitarPlaying(false);
    setGuitarCurrentTime(0);
    setGuitarDuration(0);
    setCurrentTime(0);
    setEndTime(0);
    setCurrentTick(0);
    setEndTick(0);
    lastPlaybackTickRef.current = 0;
    lastPlaybackTimeRef.current = 0;
    setMetronome(false);
    setSpeed(1);
    setMeasure(0);
    measureRef.current = 0;
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
          scrollMode: alphaTab.ScrollMode.Off,
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
        const staff = score.tracks[0]?.staves[0];
        if (staff) {
          staff.showStandardNotation = true;
          staff.showTablature = true;
          // In horizontal layout alphaTab honors each bar's absolute display width.
          // Make every bar exactly one visible tablature viewport wide.
          const viewportWidth = containerRef.current?.parentElement?.clientWidth ?? 640;
          const barWidth = Math.max(1, viewportWidth - 16);
          for (const bar of staff.bars) bar.displayWidth = barWidth;
          setMeasureCount(staff.bars.length);
        }
        setMeasure(0);
      }));
      unsubscribe.push(api.playerPositionChanged.on(position => {
        if (!active) return;
        const jumpedBackward = position.currentTick < lastPlaybackTickRef.current
          || position.currentTime + 50 < lastPlaybackTimeRef.current;
        lastPlaybackTickRef.current = position.currentTick;
        lastPlaybackTimeRef.current = position.currentTime;
        setCurrentTime(position.currentTime);
        setEndTime(position.endTime);
        setCurrentTick(position.currentTick);
        setEndTick(position.endTick);
        // alphaTab updates the beat cursor in the same playback cycle; wait for its
        // DOM position so backward seeks and loop wraps immediately reposition it.
        if (measureRef.current === 0) {
          window.requestAnimationFrame(() => keepPlaybackCursorInView(jumpedBackward));
        }
      }));
      unsubscribe.push(api.playerStateChanged.on(event => {
        if (active) setPlaying(event.state === alphaTab.synth.PlayerState.Playing);
      }));
      unsubscribe.push(api.renderFinished.on(() => {
        if (!active) return;
        setRendered(true);
        setStatus('');
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
    if (measureRef.current === 0) keepPlaybackCursorInView(true);
  }

  function toggleMetronome() {
    if (!apiRef.current) return;
    const next = !metronome;
    apiRef.current.metronomeVolume = next ? 0.7 : 0;
    setMetronome(next);
  }

  function changeSpeed(nextSpeed: number) {
    const bounded = Math.max(0.5, Math.min(2, nextSpeed));
    setSpeed(bounded);
    if (apiRef.current) apiRef.current.playbackSpeed = bounded;
    if (instrumentalAudioRef.current) instrumentalAudioRef.current.playbackRate = bounded;
  }

  function seekInstrumental(time: number) {
    const audio = instrumentalAudioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setGuitarCurrentTime(time);
  }

  function toggleInstrumentalPlayback() {
    const audio = instrumentalAudioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().catch(() => setStatus('Não foi possível reproduzir o áudio da guitarra.'));
    } else audio.pause();
  }

  function changeMeasure(nextMeasure: number) {
    const api = apiRef.current;
    if (!api) return;
    const bounded = Math.max(0, Math.min(measureCount, nextMeasure));
    setMeasure(bounded);
    measureRef.current = bounded;
    if (bounded === 0) {
      api.playbackRange = null;
      api.isLooping = false;
      window.requestAnimationFrame(() => keepPlaybackCursorInView(true));
      return;
    }

    const bar = api.score?.tracks[0]?.staves[0]?.bars[bounded - 1];
    // PlaybackRange uses absolute song ticks, so use the master bar's own start
    // and duration instead of the beats' bar-relative playbackStart values.
    const firstTick = bar?.masterBar.start ?? Number.POSITIVE_INFINITY;
    const endTick = bar ? firstTick + bar.masterBar.calculateDuration() : 0;
    if (!Number.isFinite(firstTick) || endTick <= firstTick) {
      api.playbackRange = null;
      api.isLooping = false;
      return;
    }
    api.playbackRange = {
      startTick: firstTick,
      endTick,
    };
    api.isLooping = true;
    // Wait for alphaTab to move its cursor, then pin the selected bar at the left
    // edge of the viewport. The bar width is one viewport, so it stays in the box
    // while the beat cursor traverses the loop.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (measureRef.current !== bounded) return;
      const viewport = containerRef.current?.parentElement;
      if (!viewport || !containerRef.current) return;
      const barBounds = api.boundsLookup?.findMasterBarByIndex(bounded - 1);
      if (!barBounds) return;
      const containerLeft = containerRef.current.getBoundingClientRect().left - viewport.getBoundingClientRect().left + viewport.scrollLeft;
      const barLeft = containerLeft + barBounds.lineAlignedBounds.x;
      const viewportInset = 8;
      viewport.scrollLeft = Math.max(0, Math.min(barLeft - viewportInset, viewport.scrollWidth - viewport.clientWidth));
    }));
  }

  function beginScoreDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    scoreDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: event.currentTarget.scrollLeft,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveScoreDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = scoreDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.startX;
    if (Math.abs(delta) > 4) drag.moved = true;
    if (drag.moved) {
      event.currentTarget.scrollLeft = drag.startScrollLeft - delta;
      event.preventDefault();
    }
  }

  function endScoreDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = scoreDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressScoreClickRef.current = drag.moved;
    scoreDragRef.current = null;
    if (!drag.moved && measureRef.current === 0) keepPlaybackCursorInView(true);
    window.setTimeout(() => { suppressScoreClickRef.current = false; }, 0);
  }

  const playbackProgress = endTick > 0 ? Math.min(1, currentTick / endTick) : 0;

  return <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4 text-slate-100 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">Tablatura interativa</h2>
      <div role="group" aria-label="Fonte de áudio" className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-1">
        <button type="button" aria-pressed={audioSource === 'guitar'} onClick={() => selectAudioSource('guitar')}
          className={`rounded-md px-3 py-2 text-xs font-semibold transition ${audioSource === 'guitar' ? 'bg-cyan-300 text-slate-950' : 'text-slate-300 hover:text-white'}`}>Guitarra isolada</button>
        <button type="button" aria-pressed={audioSource === 'synth'} onClick={() => selectAudioSource('synth')}
          className={`rounded-md px-3 py-2 text-xs font-semibold transition ${audioSource === 'synth' ? 'bg-cyan-300 text-slate-950' : 'text-slate-300 hover:text-white'}`}>Sintetizador</button>
      </div>
    </div>
    <p role="status" className="mt-2 text-xs text-slate-400">{status}</p>

    <div id="tab-scroll-viewport" onPointerDown={beginScoreDrag} onPointerMove={moveScoreDrag} onPointerUp={endScoreDrag}
      onPointerCancel={endScoreDrag} onClickCapture={event => {
        if (suppressScoreClickRef.current) { event.preventDefault(); event.stopPropagation(); suppressScoreClickRef.current = false; }
      }}
      className="tab-scroll-viewport mt-4 min-h-[300px] w-full touch-pan-x select-none overflow-x-auto overflow-y-hidden rounded-xl border border-slate-700 bg-slate-950 p-2 text-slate-100 cursor-grab active:cursor-grabbing">
      <div ref={containerRef} className="block min-h-[300px] w-full" style={{ minHeight: 300 }} />
      {!alphaTex && !fileUrl && !fileData && tab &&
        <pre className="overflow-x-auto whitespace-pre font-mono text-sm leading-7 text-slate-100">{tab}</pre>}
    </div>

    {audioSource === 'guitar' ? <footer className="mt-6 rounded-xl border border-slate-700 bg-slate-950/95 p-3 shadow-2xl backdrop-blur sm:p-4">
      <audio ref={instrumentalAudioRef} aria-label="Áudio da guitarra isolada" className="sr-only" preload="metadata" src={instrumentalUrl}
        onLoadedMetadata={event => {
          const audio = event.currentTarget;
          setGuitarDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
          setGuitarCurrentTime(audio.currentTime);
          audio.volume = volume / 100;
          audio.playbackRate = speed;
          audio.loop = false;
        }}
        onTimeUpdate={event => {
          const audio = event.currentTarget;
          setGuitarCurrentTime(audio.currentTime);
        }}
        onPlay={() => setGuitarPlaying(true)} onPause={() => setGuitarPlaying(false)} onEnded={() => setGuitarPlaying(false)}
        onError={() => setStatus('Não foi possível carregar o áudio da guitarra.')}>Seu navegador não oferece suporte à reprodução de áudio.</audio>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <button type="button" aria-label={guitarPlaying ? 'Pausar' : 'Reproduzir'} onClick={toggleInstrumentalPlayback} disabled={!guitarDuration}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-300 text-lg font-bold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-40">{guitarPlaying ? 'Ⅱ' : '▶'}</button>
        <span className="w-24 shrink-0 text-center font-mono text-xs tabular-nums text-slate-300">{formatTime(guitarCurrentTime * 1000)} / {formatTime(guitarDuration * 1000)}</span>
        <div className="relative flex h-8 min-w-40 flex-1 touch-none items-center justify-between gap-[2px]" aria-label="Linha do tempo da guitarra isolada">
          {waveform.map((height, index) => <span key={index} aria-hidden="true" className={`min-w-0 flex-1 rounded-full ${guitarDuration > 0 && index / waveform.length <= guitarCurrentTime / guitarDuration ? 'bg-cyan-300' : 'bg-slate-700'}`} style={{ height: `${height}%` }} />)}
          <span aria-hidden="true" className="pointer-events-none absolute top-1/2 z-[1] h-7 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `${guitarDuration > 0 ? (guitarCurrentTime / guitarDuration) * 100 : 0}%` }} />
          <input aria-label="Posição da guitarra isolada" type="range" min={0} max={Math.max(1, guitarDuration)} step={0.01}
            value={Math.min(guitarCurrentTime, Math.max(1, guitarDuration))} onChange={event => seekInstrumental(Number(event.target.value))}
            disabled={!guitarDuration} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" />
        </div>
      </div>
    </footer> : <footer className="mt-6 rounded-xl border border-slate-700 bg-slate-950/95 p-3 shadow-2xl backdrop-blur sm:p-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <button type="button" aria-label={playing ? 'Pausar' : 'Reproduzir'} onClick={togglePlayback} disabled={!ready}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-300 text-lg font-bold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-40">
          {playing ? 'Ⅱ' : '▶'}
        </button>

        <span className="w-24 shrink-0 text-center font-mono text-xs tabular-nums text-slate-300">
          {formatTime(currentTime)} / {formatTime(endTime)}
        </span>

        <div className="relative flex h-8 min-w-40 flex-1 touch-none items-center justify-between gap-[2px]" aria-label="Linha do tempo da tablatura">
          {waveform.map((height, index) => <span key={index} aria-hidden="true" className={`min-w-0 flex-1 rounded-full ${index / waveform.length <= playbackProgress ? 'bg-cyan-300' : 'bg-slate-700'}`} style={{ height: `${height}%` }} />)}
          <span aria-hidden="true" className="pointer-events-none absolute top-1/2 z-[1] h-7 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `${playbackProgress * 100}%` }} />
          <input aria-label="Posição da música" type="range" min={0} max={Math.max(1, endTick)} step={1}
            value={Math.min(currentTick, Math.max(1, endTick))} onChange={event => seekToTick(Number(event.target.value))}
            disabled={!ready || endTick === 0} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <button type="button" aria-pressed={metronome} onClick={toggleMetronome} disabled={!ready}
            className={`rounded-lg px-2.5 py-2 text-xs font-semibold ${metronome ? 'bg-cyan-300 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}>Metrônomo</button>

          <label className="flex items-center gap-2 text-xs text-slate-300">
            Velocidade
            <select aria-label="Velocidade da reprodução" value={speed}
              onChange={event => changeSpeed(Number(event.target.value))} disabled={!ready}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-slate-100">
              {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(value =>
                <option key={value} value={value}>{value}×</option>)}
            </select>
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
    </footer>}
  </section>;
}
