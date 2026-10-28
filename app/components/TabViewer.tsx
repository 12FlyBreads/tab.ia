'use client';

import { useEffect, useRef, useState } from 'react';

type AlphaTabApi = {
  destroy: () => void;
  playPause: () => void;
  playerStateChanged: { on: (callback: (event: { state: number }) => void) => void };
  renderFinished: { on: (callback: () => void) => void };
  soundFontLoaded: { on: (callback: () => void) => void };
  error: { on: (callback: (event: { message?: string }) => void) => void };
  tex: (value: string) => void;
};

export function TabViewer({ tab, alphaTex }: { tab: string; alphaTex: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('Carregando tablatura…');

  useEffect(() => {
    let active = true;
    let api: AlphaTabApi | null = null;

    if (!containerRef.current || !alphaTex) {
      setStatus('Não foi possível preparar a tablatura interativa.');
      return;
    }

    import('@coderline/alphatab').then(alphaTab => {
      if (!active || !containerRef.current) return;

      api = new alphaTab.AlphaTabApi(containerRef.current, {
        core: { fontDirectory: '/alphatab/font/' },
        player: {
          playerMode: alphaTab.PlayerMode.EnabledSynthesizer,
          soundFont: '/alphatab/soundfont/sonivox.sf2',
        },
        display: {
          staveProfile: alphaTab.StaveProfile.Tab,
          layoutMode: alphaTab.LayoutMode.Page,
          scale: 1,
        },
      }) as unknown as AlphaTabApi;
      apiRef.current = api;

      api.playerStateChanged.on(event => {
        if (active) setPlaying(event.state === alphaTab.synth.PlayerState.Playing);
      });
      api.soundFontLoaded.on(() => {
        if (active) setReady(true);
      });
      api.renderFinished.on(() => {
        if (active) setStatus('Tablatura pronta');
      });
      api.error.on(event => {
        if (active) setStatus(event.message || 'Falha ao carregar a tablatura.');
      });

      api.tex(alphaTex);
    }).catch(error => {
      if (active) setStatus(error instanceof Error ? error.message : 'Falha ao carregar alphaTab.');
    });

    return () => {
      active = false;
      api?.destroy();
      apiRef.current = null;
    };
  }, [alphaTex]);

  return <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6 sm:p-8">
    <p className="text-sm font-semibold uppercase tracking-[.2em] text-cyan-300">Resultado final · Etapa 3</p>
    <h2 className="mt-2 text-xl font-semibold">Tablatura interativa</h2>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 pb-4">
      <button type="button" onClick={() => apiRef.current?.playPause()} disabled={!ready}
        className="rounded-lg bg-cyan-300 px-5 py-2.5 font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50">
        {playing ? 'Pausar' : '▶ Tocar tablatura'}
      </button>
      <span role="status" className="text-xs text-slate-400">{status}</span>
    </div>
    <div className="mt-4 min-h-[400px] w-full overflow-x-auto rounded-lg bg-white p-3 text-slate-900">
      {alphaTex ? <div ref={containerRef} className="block min-h-[400px] w-full" style={{ minHeight: 400 }} /> :
        <pre className="overflow-x-auto whitespace-pre font-mono text-sm leading-7 text-slate-900">{tab}</pre>}
    </div>
  </section>;
}
