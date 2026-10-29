'use client';

import { FormEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { useAudioPreview } from '../hooks/useAudioPreview';
import { useAudioWaveform } from '../hooks/useAudioWaveform';
import { formatTime } from '../utils/audio';

type YoutubeResult = { id: string; url: string; title: string; duration: number | null; thumbnail: string | null };

function TrimRangeSelector({ duration, start, end, currentTime, waveform, onChange, onSeek }: {
  duration: number; start: number; end: number; currentTime: number;
  waveform: number[];
  onChange: (start: number, end: number) => void; onSeek: (time: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'start' | 'end' | 'playhead' | null>(null);
  if (!duration) return null;

  function updateFromPointer(kind: 'start' | 'end' | 'playhead', event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = trackRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const value = Math.round(ratio * duration * 10) / 10;
    const gap = Math.min(0.1, duration);
    if (kind === 'start') onChange(Math.min(value, end - gap), end);
    else if (kind === 'end') onChange(start, Math.max(value, start + gap));
    else onSeek(Math.max(start, Math.min(end, value)));
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
  const playheadPercent = (currentTime / duration) * 100;
  return <div>
    <div ref={trackRef} className="relative mx-3 my-2 h-10 touch-none cursor-pointer" onPointerDown={event => {
      const target = event.target as HTMLElement;
      const handle = target.closest<HTMLElement>('[data-range-handle]')?.dataset.rangeHandle;
      dragging.current = handle === 'start' || handle === 'end' ? handle : 'playhead';
      event.currentTarget.setPointerCapture(event.pointerId);
      updateFromPointer(dragging.current, event);
    }} onPointerMove={event => { if (dragging.current) updateFromPointer(dragging.current, event); }}
      onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 flex h-8 -translate-y-1/2 items-center justify-between gap-[2px] overflow-hidden">
        {waveform.map((height, index) => {
          const position = ((index + 0.5) / waveform.length) * 100;
          const selected = position >= startPercent && position <= endPercent;
          const played = position <= playheadPercent;
          return <span key={index} className={`min-w-0 flex-1 rounded-full transition-colors ${selected ? played ? 'bg-cyan-300' : 'bg-cyan-300/35' : 'bg-slate-700'}`} style={{ height: `${height}%` }} />;
        })}
      </div>
      {(['start', 'end'] as const).map(kind => {
        const value = kind === 'start' ? start : end;
        return <button key={kind} type="button" role="slider" aria-label={kind === 'start' ? 'Início do trecho' : 'Fim do trecho'}
          aria-valuemin={kind === 'start' ? 0 : start + 0.1} aria-valuemax={kind === 'start' ? end - 0.1 : duration}
          aria-valuenow={value} aria-valuetext={formatTime(value)} onKeyDown={event => handleKeyDown(kind, event)}
          data-range-handle={kind}
          className="absolute top-1/2 z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-slate-950 bg-cyan-200 shadow-lg shadow-cyan-950/50 outline-none ring-cyan-300 focus-visible:ring-2"
          style={{ left: `${(value / duration) * 100}%` }} />;
      })}
      <div aria-hidden="true" className="pointer-events-none absolute top-1/2 z-[5] h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `${playheadPercent}%` }} />
    </div>
    <div className="flex items-center justify-between gap-3 text-xs text-slate-400"><span>{formatTime(currentTime)} / {formatTime(duration)}</span><span>Trecho: {formatTime(start)} – {formatTime(end)}</span></div>
  </div>;
}

export function AudioUploader({ busy, onSubmit }: {
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>, file: File | null, youtubePreviewId: string, duration: number, start: number, end: number) => Promise<boolean>;
}) {
  const [sourceMode, setSourceMode] = useState<'file' | 'youtube'>('file');
  const [youtubeSource, setYoutubeSource] = useState('');
  const [youtubeResults, setYoutubeResults] = useState<YoutubeResult[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<YoutubeResult | null>(null);
  const [searchingYoutube, setSearchingYoutube] = useState(false);
  const [youtubeSearchError, setYoutubeSearchError] = useState('');
  const [youtubePreviewId, setYoutubePreviewId] = useState('');
  const [youtubePreviewUrl, setYoutubePreviewUrl] = useState('');
  const [youtubePreviewLoading, setYoutubePreviewLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useAudioPreview(file);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectionPlaying, setSelectionPlaying] = useState(false);
  const [uploadAudioStatus, setUploadAudioStatus] = useState('');
  const uploadAudioRef = useRef<HTMLAudioElement>(null);
  const previewRequestRef = useRef(0);

  async function prepareYoutubePreview(source: string) {
    const requestId = ++previewRequestRef.current;
    if (youtubePreviewId) void fetch(`/api/youtube/preview/${youtubePreviewId}`, { method: 'DELETE' });
    setYoutubePreviewId('');
    setYoutubePreviewUrl('');
    setYoutubePreviewLoading(true);
    setDuration(0); setTrimStart(0); setTrimEnd(0); setCurrentTime(0);
    setUploadAudioStatus('Preparando prévia do YouTube…');
    const body = new FormData(); body.append('youtube_source', source);
    try {
      const response = await fetch('/api/youtube/preview', { method: 'POST', body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a prévia do YouTube.');
      if (requestId !== previewRequestRef.current) {
        void fetch(`/api/youtube/preview/${data.id}`, { method: 'DELETE' });
        return;
      }
      setYoutubePreviewId(data.id);
      setYoutubePreviewUrl(data.audio_url);
      setUploadAudioStatus('Áudio do YouTube pronto');
    } catch (error) {
      if (requestId === previewRequestRef.current) setYoutubeSearchError(error instanceof Error ? error.message : 'Falha ao preparar a prévia.');
    } finally {
      if (requestId === previewRequestRef.current) setYoutubePreviewLoading(false);
    }
  }

  function selectYoutubeResult(result: YoutubeResult) {
    setSelectedVideo(result);
    void prepareYoutubePreview(result.url);
  }

  function clearYoutubePreview() {
    previewRequestRef.current += 1;
    if (youtubePreviewId) void fetch(`/api/youtube/preview/${youtubePreviewId}`, { method: 'DELETE' });
    setYoutubePreviewId(''); setYoutubePreviewUrl(''); setYoutubePreviewLoading(false);
    setDuration(0); setTrimStart(0); setTrimEnd(0); setCurrentTime(0);
    setYoutubeSearchError('');
  }

  useEffect(() => {
    const query = youtubeSource.trim();
    if (query.length < 2 || /^https?:\/\//i.test(query)) {
      setYoutubeResults([]);
      setSearchingYoutube(false);
      setYoutubeSearchError('');
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchingYoutube(true);
      setYoutubeSearchError('');
      try {
        const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Falha ao pesquisar no YouTube.');
        setYoutubeResults(data.results || []);
      } catch (error) {
        if (!controller.signal.aborted) {
          setYoutubeResults([]);
          setYoutubeSearchError(error instanceof Error ? error.message : 'Falha ao pesquisar no YouTube.');
        }
      } finally {
        if (!controller.signal.aborted) setSearchingYoutube(false);
      }
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [youtubeSource]);

  function selectFile(nextFile: File | null) {
    if (nextFile) setSourceMode('file');
    setFile(nextFile); setDuration(0); setTrimStart(0); setTrimEnd(0); setCurrentTime(0);
    setSelectionPlaying(false); setUploadAudioStatus(nextFile ? 'Carregando áudio enviado…' : '');
  }

  function playSelectedInterval() {
    const audio = uploadAudioRef.current;
    if (!audio) return;
    if (selectionPlaying) { audio.pause(); setSelectionPlaying(false); return; }
    audio.currentTime = trimStart;
    setCurrentTime(trimStart);
    setSelectionPlaying(true);
    void audio.play().catch(() => { setSelectionPlaying(false); setUploadAudioStatus('Não foi possível reproduzir o áudio'); });
  }

  const waitingForDuration = Boolean(file && duration <= 0 && uploadAudioStatus !== 'Não foi possível carregar este áudio');
  const directYoutubeUrl = /^https?:\/\//i.test(youtubeSource.trim());
  const youtubeSubmission = youtubePreviewId;
  const activePreviewUrl = sourceMode === 'file' ? previewUrl : youtubePreviewUrl;
  const waveform = useAudioWaveform(activePreviewUrl);
  const canSubmit = Boolean(sourceMode === 'file' ? file : youtubePreviewId) && !busy && (sourceMode !== 'file' ? !youtubePreviewLoading && duration > 0 : !waitingForDuration);
  return <form onSubmit={event => { void onSubmit(event, sourceMode === 'file' ? file : null, sourceMode === 'youtube' ? youtubeSubmission : '', duration, trimStart, trimEnd).then(ok => { if (ok) setUploadAudioStatus(''); }); }} className="rounded-2xl border border-slate-700 bg-slate-900 p-6 sm:p-8">
    <div className="mb-5 flex justify-center">
      <div role="group" aria-label="Origem do áudio" className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-1">
        <button type="button" aria-pressed={sourceMode === 'file'} onClick={() => setSourceMode('file')}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${sourceMode === 'file' ? 'bg-cyan-300 text-slate-950' : 'text-slate-300 hover:text-white'}`}>Arquivo</button>
        <button type="button" aria-pressed={sourceMode === 'youtube'} onClick={() => setSourceMode('youtube')}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${sourceMode === 'youtube' ? 'bg-cyan-300 text-slate-950' : 'text-slate-300 hover:text-white'}`}>YouTube</button>
      </div>
    </div>
    <div className="grid gap-4">
      <div hidden={sourceMode !== 'file'}><label htmlFor="audio" className="block text-sm font-medium">Arquivo de áudio (.mp3 ou .wav)</label><input ref={fileInputRef} id="audio" type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,.mp3,.wav" onChange={e => selectFile(e.target.files?.[0] ?? null)} className="mt-3 block w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-cyan-300 file:px-3 file:py-2 file:font-semibold file:text-slate-950" />{file && <p className="mt-2 flex items-center gap-2 text-xs text-slate-400"><span className="truncate">{file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</span><button type="button" onClick={() => { if (fileInputRef.current) fileInputRef.current.value = ''; selectFile(null); }} className="shrink-0 text-cyan-300 underline">Remover</button></p>}</div>
      <div hidden={sourceMode !== 'youtube'}><label htmlFor="youtube-source" className="block text-sm font-medium">Buscar ou colar link do YouTube</label><input id="youtube-source" value={youtubeSource} onChange={event => { setYoutubeSource(event.target.value); setYoutubeResults([]); setSelectedVideo(null); clearYoutubePreview(); }} onBlur={() => { if (directYoutubeUrl) void prepareYoutubePreview(youtubeSource.trim()); }} placeholder="Digite o nome do vídeo ou cole o link" maxLength={500} className="mt-3 block w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm" /><p className="mt-2 text-xs text-slate-400">Vídeos com menos de 20 minutos.</p></div>
    </div>
    {sourceMode === 'youtube' && youtubeSource.trim().length >= 2 && <div className="mt-4" aria-live="polite">
      {searchingYoutube && <p className="text-sm text-slate-400">Pesquisando vídeos…</p>}
      {youtubePreviewLoading && <p className="text-sm text-slate-400">Preparando o áudio para a prévia…</p>}
      {youtubeSearchError && <p className="text-sm text-rose-300">{youtubeSearchError}</p>}
      {!directYoutubeUrl && !searchingYoutube && !youtubeSearchError && !selectedVideo && youtubeResults.length === 0 && <p className="text-sm text-slate-400">Nenhum vídeo encontrado.</p>}
      {selectedVideo && <div className="flex items-center justify-between gap-3 rounded-lg border border-cyan-700 bg-cyan-950/40 p-3 text-sm text-cyan-100"><span className="min-w-0 truncate">Selecionado: {selectedVideo.title}</span>{youtubeSearchError && <button type="button" onClick={() => prepareYoutubePreview(selectedVideo.url)} className="shrink-0 underline">Tentar de novo</button>}</div>}
      {!selectedVideo && youtubeResults.length > 0 && <ul className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-2">{youtubeResults.map(result => <li key={result.id}><button type="button" onClick={() => selectYoutubeResult(result)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">{result.thumbnail && <img src={result.thumbnail} alt="" className="h-14 w-24 shrink-0 rounded object-cover" />}<span className="min-w-0"><span className="block line-clamp-2 text-sm font-medium text-slate-100">{result.title}</span><span className="mt-1 block text-xs text-slate-400">{result.duration ? formatTime(result.duration) : 'Duração indisponível'}</span></span></button></li>)}</ul>}
    </div>}
    {activePreviewUrl && <div className="mt-6 rounded-xl border border-slate-700 bg-slate-950 p-4 sm:p-5">
      <div><h2 className="font-semibold">{sourceMode === 'file' ? 'Prévia do áudio enviado' : 'Prévia do áudio do YouTube'}</h2><p className="mt-1 text-xs text-slate-400">Arraste as extremidades da barra para escolher o trecho ou toque nela para avançar.</p></div>
      <audio ref={uploadAudioRef} className="sr-only" preload="metadata" src={activePreviewUrl}
        onLoadedMetadata={event => { const audioDuration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0; setDuration(audioDuration); setTrimStart(0); setTrimEnd(audioDuration); setCurrentTime(0); setUploadAudioStatus('Áudio pronto'); }}
        onWaiting={() => setUploadAudioStatus('Carregando áudio…')} onCanPlay={() => setUploadAudioStatus('Áudio pronto')} onPause={() => setSelectionPlaying(false)}
        onTimeUpdate={event => { setCurrentTime(event.currentTarget.currentTime); if (selectionPlaying && event.currentTarget.currentTime >= trimEnd) { event.currentTarget.pause(); event.currentTarget.currentTime = trimEnd; setCurrentTime(trimEnd); } }}
        onError={() => setUploadAudioStatus('Não foi possível carregar este áudio')}>Seu navegador não oferece suporte à reprodução de áudio.</audio>
      <p aria-live="polite" className="mt-1 text-xs text-slate-500">{uploadAudioStatus}</p>
      {duration > 0 && <div className="mt-4 flex items-center gap-4"><button type="button" onClick={playSelectedInterval} aria-label={selectionPlaying ? 'Pausar trecho selecionado' : 'Reproduzir trecho selecionado'} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-300 font-bold text-slate-950 hover:bg-cyan-200">{selectionPlaying ? 'Ⅱ' : '▶'}</button><div className="min-w-0 flex-1"><TrimRangeSelector duration={duration} start={trimStart} end={trimEnd} currentTime={currentTime} waveform={waveform} onSeek={time => { const audio = uploadAudioRef.current; if (audio) { audio.currentTime = time; setCurrentTime(time); } }} onChange={(nextStart, nextEnd) => { setTrimStart(nextStart); setTrimEnd(nextEnd); }} /></div></div>}
    </div>}
    <button disabled={!canSubmit} className="mt-5 rounded-lg bg-cyan-300 px-5 py-3 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Enviando…' : waitingForDuration ? 'Carregando áudio…' : 'Gerar tablatura'}</button>
  </form>;
}
