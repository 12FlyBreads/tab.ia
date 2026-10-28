'use client';

import { FormEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, useRef, useState } from 'react';
import { useAudioPreview } from '../hooks/useAudioPreview';
import { formatTime } from '../utils/audio';

function TrimRangeSelector({ duration, start, end, onChange }: {
  duration: number; start: number; end: number; onChange: (start: number, end: number) => void;
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

  function handleKeyDown(kind: 'start' | 'end', event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 5 : 1);
    const gap = Math.min(0.1, duration);
    if (kind === 'start') onChange(Math.max(0, Math.min(start + delta, end - gap)), end);
    else onChange(start, Math.min(duration, Math.max(end + delta, start + gap)));
  }

  const startPercent = (start / duration) * 100;
  const endPercent = (end / duration) * 100;
  return <div>
    <div ref={trackRef} className="relative mx-3 my-3 h-9 touch-none">
      <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-slate-700" />
      <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-cyan-300" style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }} />
      {(['start', 'end'] as const).map(kind => {
        const value = kind === 'start' ? start : end;
        return <button key={kind} type="button" role="slider" aria-label={kind === 'start' ? 'Início do trecho' : 'Fim do trecho'}
          aria-valuemin={kind === 'start' ? 0 : start + 0.1} aria-valuemax={kind === 'start' ? end - 0.1 : duration}
          aria-valuenow={value} aria-valuetext={formatTime(value)}
          onPointerDown={event => { dragging.current = kind; event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={event => { if (dragging.current === kind) updateFromPointer(kind, event); }}
          onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }}
          onKeyDown={event => handleKeyDown(kind, event)}
          className="absolute top-1/2 z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-slate-950 bg-cyan-200 shadow-lg shadow-cyan-950/50 outline-none ring-cyan-300 focus-visible:ring-2"
          style={{ left: `${(value / duration) * 100}%` }} />;
      })}
    </div>
    <div className="flex justify-between text-xs text-slate-400"><span>Início: {formatTime(start)}</span><span>Fim: {formatTime(end)}</span></div>
  </div>;
}

export function AudioUploader({ busy, onSubmit }: {
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>, file: File | null, duration: number, start: number, end: number) => Promise<boolean>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const previewUrl = useAudioPreview(file);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [selectionPlaying, setSelectionPlaying] = useState(false);
  const [uploadAudioStatus, setUploadAudioStatus] = useState('');
  const uploadAudioRef = useRef<HTMLAudioElement>(null);

  function selectFile(nextFile: File | null) {
    setFile(nextFile); setDuration(0); setTrimStart(0); setTrimEnd(0);
    setSelectionPlaying(false); setUploadAudioStatus(nextFile ? 'Carregando áudio enviado…' : '');
  }

  function playSelectedInterval() {
    const audio = uploadAudioRef.current;
    if (!audio) return;
    if (selectionPlaying) { audio.pause(); setSelectionPlaying(false); return; }
    audio.currentTime = trimStart;
    setSelectionPlaying(true);
    void audio.play().catch(() => { setSelectionPlaying(false); setUploadAudioStatus('Não foi possível reproduzir o áudio'); });
  }

  const waitingForDuration = Boolean(file && duration <= 0 && uploadAudioStatus !== 'Não foi possível carregar este áudio');
  return <form onSubmit={event => { void onSubmit(event, file, duration, trimStart, trimEnd).then(ok => { if (ok) setUploadAudioStatus(''); }); }} className="rounded-2xl border border-slate-700 bg-slate-900 p-6 sm:p-8">
    <label htmlFor="audio" className="block text-sm font-medium">Arquivo de áudio (.mp3 ou .wav)</label>
    <input id="audio" type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,.mp3,.wav" onChange={e => selectFile(e.target.files?.[0] ?? null)} className="mt-3 block w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-cyan-300 file:px-4 file:py-2 file:font-semibold file:text-slate-950" />
    {previewUrl && <div className="mt-6 rounded-xl border border-slate-700 bg-slate-950 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Prévia do áudio enviado</h2><p className="mt-1 text-xs text-slate-400">Escute a faixa e arraste os marcadores para escolher o trecho a processar.</p></div>{duration > 0 && <span className="text-xs text-slate-400">Duração: {formatTime(duration)}</span>}</div>
      <audio ref={uploadAudioRef} className="mt-4 w-full accent-cyan-300" controls preload="metadata" src={previewUrl}
        onLoadedMetadata={event => { const audioDuration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0; setDuration(audioDuration); setTrimStart(0); setTrimEnd(audioDuration); setUploadAudioStatus('Áudio pronto'); }}
        onWaiting={() => setUploadAudioStatus('Carregando áudio…')} onCanPlay={() => setUploadAudioStatus('Áudio pronto')} onPause={() => setSelectionPlaying(false)}
        onTimeUpdate={event => { if (selectionPlaying && event.currentTarget.currentTime >= trimEnd) { event.currentTarget.pause(); event.currentTarget.currentTime = trimEnd; } }}
        onError={() => setUploadAudioStatus('Não foi possível carregar este áudio')}>Seu navegador não oferece suporte à reprodução de áudio.</audio>
      <p aria-live="polite" className="mt-1 text-xs text-slate-500">{uploadAudioStatus}</p>
      {duration > 0 && <><TrimRangeSelector duration={duration} start={trimStart} end={trimEnd} onChange={(nextStart, nextEnd) => { setTrimStart(nextStart); setTrimEnd(nextEnd); }} />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-300">Trecho selecionado: {formatTime(trimStart)} – {formatTime(trimEnd)}</p><button type="button" onClick={playSelectedInterval} className="rounded-lg border border-cyan-300 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-300/10">{selectionPlaying ? 'Parar trecho' : 'Ouvir trecho selecionado'}</button></div></>}
    </div>}
    <button disabled={!file || busy || waitingForDuration} className="mt-5 rounded-lg bg-cyan-300 px-5 py-3 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Enviando…' : waitingForDuration ? 'Carregando áudio…' : 'Gerar tablatura'}</button>
    {file && <p className="mt-3 text-sm text-slate-400">Selecionado: {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</p>}
  </form>;
}
