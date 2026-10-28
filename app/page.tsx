'use client';

import { FormEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';

type Job = { id: string; status: 'queued' | 'processing' | 'completed' | 'failed'; tab?: string; error?: string };

function formatTime(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds * 10) / 10);
  const safeSeconds = Math.floor(rounded);
  const tenth = Math.round((rounded - safeSeconds) * 10);
  const base = `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
  return tenth ? `${base}.${tenth}` : base;
}

function TrimRangeSelector({
  duration, start, end, onChange,
}: {
  duration: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'start' | 'end' | null>(null);
  if (!duration) return null;

  function updateFromPointer(kind: 'start' | 'end', event: ReactPointerEvent<HTMLButtonElement>) {
    const bounds = trackRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const value = Math.round(ratio * duration * 10) / 10;
    const gap = Math.min(0.1, duration);
    if (kind === 'start') onChange(Math.min(value, end - gap), end);
    else onChange(start, Math.max(value, start + gap));
  }

  function moveWithKeyboard(kind: 'start' | 'end', delta: number) {
    const gap = Math.min(0.1, duration);
    if (kind === 'start') onChange(Math.max(0, Math.min(start + delta, end - gap)), end);
    else onChange(start, Math.min(duration, Math.max(end + delta, start + gap)));
  }

  function handleKeyDown(kind: 'start' | 'end', event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    moveWithKeyboard(kind, (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 5 : 1));
  }

  const startPercent = (start / duration) * 100;
  const endPercent = (end / duration) * 100;

  return <div>
    <div ref={trackRef} className="relative mx-3 my-3 h-9 touch-none">
      <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-slate-700" />
      <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-cyan-300" style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }} />
      {(['start', 'end'] as const).map(kind => {
        const value = kind === 'start' ? start : end;
        return <button
          key={kind}
          type="button"
          role="slider"
          aria-label={kind === 'start' ? 'Início do trecho' : 'Fim do trecho'}
          aria-valuemin={kind === 'start' ? 0 : start + 0.1}
          aria-valuemax={kind === 'start' ? end - 0.1 : duration}
          aria-valuenow={value}
          aria-valuetext={formatTime(value)}
          onPointerDown={event => {
            dragging.current = kind;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => { if (dragging.current === kind) updateFromPointer(kind, event); }}
          onPointerUp={() => { dragging.current = null; }}
          onPointerCancel={() => { dragging.current = null; }}
          onKeyDown={event => handleKeyDown(kind, event)}
          className="absolute top-1/2 z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-slate-950 bg-cyan-200 shadow-lg shadow-cyan-950/50 outline-none ring-cyan-300 focus-visible:ring-2"
          style={{ left: `${(value / duration) * 100}%` }}
        />;
      })}
    </div>
    <div className="flex justify-between text-xs text-slate-400">
      <span>Início: {formatTime(start)}</span>
      <span>Fim: {formatTime(end)}</span>
    </div>
  </div>;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [selectionPlaying, setSelectionPlaying] = useState(false);
  const [uploadAudioStatus, setUploadAudioStatus] = useState('');
  const uploadAudioRef = useRef<HTMLAudioElement>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [playerStatus, setPlayerStatus] = useState('Pronto para reproduzir');
  const [stage, setStage] = useState(0);

  useEffect(() => {
    setDuration(0);
    setTrimStart(0);
    setTrimEnd(0);
    setSelectionPlaying(false);
    if (!file) {
      setPreviewUrl('');
      setUploadAudioStatus('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setUploadAudioStatus('Carregando áudio enviado…');
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const previousJobId = window.sessionStorage.getItem('tab-ia-job-id');
    if (!previousJobId) return;
    window.sessionStorage.removeItem('tab-ia-job-id');
    void fetch(`/api/jobs/${encodeURIComponent(previousJobId)}`, { method: 'DELETE', keepalive: true });
  }, []);

  useEffect(() => {
    if (!job || job.status === 'completed' || job.status === 'failed') return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${job.id}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível consultar o processamento.');
        setJob(data);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Falha ao consultar o processamento.');
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [job]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const previousJobId = window.sessionStorage.getItem('tab-ia-job-id');
    if (previousJobId) void fetch(`/api/jobs/${encodeURIComponent(previousJobId)}`, { method: 'DELETE', keepalive: true });
    window.sessionStorage.removeItem('tab-ia-job-id');
    setBusy(true); setJob(null); setMessage('');
    try {
      const body = new FormData(); body.append('file', file);
      const wholeTrackSelected = duration > 0 && trimStart <= 0.05 && trimEnd >= duration - 0.05;
      if (duration > 0 && !wholeTrackSelected) {
        body.append('start_seconds', trimStart.toFixed(2));
        body.append('end_seconds', trimEnd.toFixed(2));
      }
      const response = await fetch('/api/jobs', { method: 'POST', body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao enviar áudio.');
      setJob(data);
      setStage(1);
      setPlayerStatus('Pronto para reproduzir');
      window.sessionStorage.setItem('tab-ia-job-id', data.id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Falha ao enviar áudio.');
    } finally { setBusy(false); }
  }

  function playSelectedInterval() {
    const audio = uploadAudioRef.current;
    if (!audio) return;
    if (selectionPlaying) {
      audio.pause();
      setSelectionPlaying(false);
      return;
    }
    audio.currentTime = trimStart;
    setSelectionPlaying(true);
    void audio.play().catch(() => {
      setSelectionPlaying(false);
      setUploadAudioStatus('Não foi possível reproduzir o áudio');
    });
  }

  const waitingForDuration = Boolean(file && duration <= 0 && uploadAudioStatus !== 'Não foi possível carregar este áudio');
  const maxStage = job?.tab ? 2 : job ? 1 : 0;

  function moveStage(next: number) {
    setStage(Math.max(0, Math.min(maxStage, next)));
  }

  return <main className="min-h-screen px-5 py-12 sm:py-20">
    <section className="mx-auto max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-[.25em] text-cyan-300">MVP · áudio para tablatura</p>
      <h1 className="mt-4 text-4xl font-bold sm:text-5xl">Transforme uma música em notas.</h1>
      <p className="mt-4 max-w-2xl leading-7 text-slate-300">Envie um arquivo de áudio. Um worker em segundo plano separa os instrumentos e tenta converter a guitarra em uma tablatura básica.</p>

      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-4">
          <button type="button" aria-label="Etapa anterior" onClick={() => moveStage(stage - 1)} disabled={stage === 0} className="rounded-full border border-slate-700 p-3 text-cyan-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30">←</button>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-slate-400">Etapa {stage + 1} de 3</p>
            <div className="mt-2 flex justify-center gap-2" aria-label={`Etapa ${stage + 1} de 3`}>{[0, 1, 2].map(index => <span key={index} className={`h-1.5 w-8 rounded-full ${index === stage ? 'bg-cyan-300' : 'bg-slate-700'}`} />)}</div>
          </div>
          <button type="button" aria-label="Próxima etapa" onClick={() => moveStage(stage + 1)} disabled={stage >= maxStage} className="rounded-full border border-slate-700 p-3 text-cyan-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30">→</button>
        </div>

      <form onSubmit={submit} hidden={stage !== 0} className="rounded-2xl border border-slate-700 bg-slate-900 p-6 sm:p-8">
        <label htmlFor="audio" className="block text-sm font-medium">Arquivo de áudio (.mp3 ou .wav)</label>
        <input id="audio" type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,.mp3,.wav" onChange={e => setFile(e.target.files?.[0] ?? null)} className="mt-3 block w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-cyan-300 file:px-4 file:py-2 file:font-semibold file:text-slate-950" />
        {previewUrl && <div className="mt-6 rounded-xl border border-slate-700 bg-slate-950 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Prévia do áudio enviado</h2>
              <p className="mt-1 text-xs text-slate-400">Escute a faixa e arraste os marcadores para escolher o trecho a processar.</p>
            </div>
            {duration > 0 && <span className="text-xs text-slate-400">Duração: {formatTime(duration)}</span>}
          </div>
          <audio
            ref={uploadAudioRef}
            className="mt-4 w-full accent-cyan-300"
            controls
            preload="metadata"
            src={previewUrl}
            onLoadedMetadata={event => {
              const audioDuration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0;
              setDuration(audioDuration);
              setTrimStart(0);
              setTrimEnd(audioDuration);
              setUploadAudioStatus('Áudio pronto');
            }}
            onWaiting={() => setUploadAudioStatus('Carregando áudio…')}
            onCanPlay={() => setUploadAudioStatus('Áudio pronto')}
            onPause={() => setSelectionPlaying(false)}
            onTimeUpdate={event => {
              if (selectionPlaying && event.currentTarget.currentTime >= trimEnd) {
                event.currentTarget.pause();
                event.currentTarget.currentTime = trimEnd;
              }
            }}
            onError={() => setUploadAudioStatus('Não foi possível carregar este áudio')}
          >Seu navegador não oferece suporte à reprodução de áudio.</audio>
          <p aria-live="polite" className="mt-1 text-xs text-slate-500">{uploadAudioStatus}</p>
          {duration > 0 && <>
            <TrimRangeSelector
              duration={duration}
              start={trimStart}
              end={trimEnd}
              onChange={(nextStart, nextEnd) => { setTrimStart(nextStart); setTrimEnd(nextEnd); }}
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-300">Trecho selecionado: {formatTime(trimStart)} – {formatTime(trimEnd)}</p>
              <button type="button" onClick={playSelectedInterval} className="rounded-lg border border-cyan-300 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-300/10">
                {selectionPlaying ? 'Parar trecho' : 'Ouvir trecho selecionado'}
              </button>
            </div>
          </>}
        </div>}
        <button disabled={!file || busy || waitingForDuration} className="mt-5 rounded-lg bg-cyan-300 px-5 py-3 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Enviando…' : waitingForDuration ? 'Carregando áudio…' : 'Gerar tablatura'}</button>
        {file && <p className="mt-3 text-sm text-slate-400">Selecionado: {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</p>}
      </form>

      {job && <section hidden={stage !== 1} aria-live="polite" className="rounded-2xl border border-slate-700 bg-slate-900 p-6 sm:p-8">
        <h2 className="text-lg font-semibold">{job.status === 'queued' ? 'Na fila' : job.status === 'processing' ? 'Processando áudio…' : job.status === 'completed' ? 'Tablatura pronta' : 'Não foi possível processar'}</h2>
        {(job.status === 'queued' || job.status === 'processing') && <p className="mt-2 text-slate-300">O worker está trabalhando. Esta página consulta o resultado automaticamente.</p>}
        {job.status === 'failed' && <p className="mt-2 text-rose-300">{job.error || 'Erro inesperado no worker.'}</p>}
        {job.status === 'completed' && <div className="mt-5 rounded-xl bg-slate-950 p-5">
          <h3 className="font-semibold">Guitarra/violão isolado</h3>
          <audio
            className="mt-3 w-full accent-cyan-300"
            controls
            preload="auto"
            src={`/api/jobs/${job.id}/instrumental`}
            onLoadStart={() => setPlayerStatus('Preparando áudio…')}
            onCanPlay={() => setPlayerStatus('Pronto para reproduzir')}
            onWaiting={() => setPlayerStatus('Carregando trecho…')}
            onPlaying={() => setPlayerStatus('Reproduzindo')}
            onPause={() => setPlayerStatus('Pausado')}
            onError={() => setPlayerStatus('Não foi possível carregar o áudio')}
          >
            Seu navegador não oferece suporte à reprodução de áudio.
          </audio>
          <p aria-live="polite" className="mt-2 text-xs text-slate-400">{playerStatus}</p>
          <a className="mt-3 inline-flex rounded-lg border border-cyan-300 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-300/10" href={`/api/jobs/${job.id}/instrumental`} download="guitarra.mp3">
            Baixar guitarra isolada
          </a>
          <p className="mt-2 text-xs text-slate-400">A separação de guitarra é experimental e pode deixar outros sons residuais. O arquivo temporário é removido ao recarregar a página.</p>
        </div>}
      </section>}
      {job?.tab && <section hidden={stage !== 2} className="rounded-2xl border border-slate-700 bg-slate-900 p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[.2em] text-cyan-300">Resultado final</p>
        <h2 className="mt-2 text-xl font-semibold">Tablatura gerada</h2>
        <pre className="mt-5 overflow-x-auto rounded-xl bg-slate-950 p-5 font-mono text-sm leading-7 text-emerald-200">{job.tab}</pre>
      </section>}
      {message && <p role="alert" className="mt-4 text-sm text-rose-300">{message}</p>}
      </div>
    </section>
  </main>;
}
