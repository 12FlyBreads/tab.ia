'use client';

import { FormEvent, useEffect, useState } from 'react';

type Job = { id: string; status: 'queued' | 'processing' | 'completed' | 'failed'; tab?: string; error?: string };

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [playerStatus, setPlayerStatus] = useState('Pronto para reproduzir');

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
      const response = await fetch('/api/jobs', { method: 'POST', body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao enviar áudio.');
      setJob(data);
      setPlayerStatus('Pronto para reproduzir');
      window.sessionStorage.setItem('tab-ia-job-id', data.id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Falha ao enviar áudio.');
    } finally { setBusy(false); }
  }

  return <main className="min-h-screen px-5 py-12 sm:py-20">
    <section className="mx-auto max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-[.25em] text-cyan-300">MVP · áudio para tablatura</p>
      <h1 className="mt-4 text-4xl font-bold sm:text-5xl">Transforme uma música em notas.</h1>
      <p className="mt-4 max-w-2xl leading-7 text-slate-300">Envie um arquivo de áudio. Um worker em segundo plano separa os instrumentos e tenta converter a guitarra em uma tablatura básica.</p>

      <form onSubmit={submit} className="mt-10 rounded-2xl border border-slate-700 bg-slate-900 p-6 sm:p-8">
        <label htmlFor="audio" className="block text-sm font-medium">Arquivo de áudio (.mp3 ou .wav)</label>
        <input id="audio" type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,.mp3,.wav" onChange={e => setFile(e.target.files?.[0] ?? null)} className="mt-3 block w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-cyan-300 file:px-4 file:py-2 file:font-semibold file:text-slate-950" />
        <button disabled={!file || busy} className="mt-5 rounded-lg bg-cyan-300 px-5 py-3 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Enviando…' : 'Gerar tablatura'}</button>
        {file && <p className="mt-3 text-sm text-slate-400">Selecionado: {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</p>}
      </form>

      {job && <section aria-live="polite" className="mt-6 rounded-2xl border border-slate-700 bg-slate-900 p-6">
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
        {job.tab && <pre className="mt-5 overflow-x-auto rounded-xl bg-slate-950 p-5 font-mono text-sm leading-7 text-emerald-200">{job.tab}</pre>}
      </section>}
      {message && <p role="alert" className="mt-4 text-sm text-rose-300">{message}</p>}
    </section>
  </main>;
}
