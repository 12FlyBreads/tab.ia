'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { AudioPlayer } from './components/AudioPlayer';
import { AudioUploader } from './components/AudioUploader';
import { useAudioJob } from './hooks/useAudioJob';

const TabViewer = dynamic(() => import('./components/TabViewer').then(module => module.TabViewer), {
  ssr: false,
  loading: () => <div className="flex min-h-[400px] w-full items-center justify-center rounded-xl bg-slate-900 text-slate-300">Carregando visualizador de tablatura…</div>,
});

export default function Home() {
  const { job, busy, message, submit } = useAudioJob();
  const [stage, setStage] = useState(0);
  const maxStage = job?.tab ? 2 : job ? 1 : 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>, file: File | null,
    duration: number, start: number, end: number) {
    const created = await submit(event, file, duration, start, end);
    if (created) setStage(1);
    return created;
  }

  function moveStage(next: number) { setStage(Math.max(0, Math.min(maxStage, next))); }

  return <main className="min-h-screen px-5 py-12 sm:py-20">
    <section className="mx-auto max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-[.25em] text-cyan-300">MVP · áudio para tablatura</p>
      <h1 className="mt-4 text-4xl font-bold sm:text-5xl">Transforme uma música em notas.</h1>
      <p className="mt-4 max-w-2xl leading-7 text-slate-300">Envie um arquivo de áudio. Um worker em segundo plano separa os instrumentos e tenta converter a guitarra em uma tablatura básica.</p>
      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-4">
          <button type="button" aria-label="Etapa anterior" onClick={() => moveStage(stage - 1)} disabled={stage === 0} className="rounded-full border border-slate-700 p-3 text-cyan-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30">←</button>
          <div className="text-center"><p className="text-xs font-semibold uppercase tracking-[.2em] text-slate-400">Etapa {stage + 1} de 3</p><div className="mt-2 flex justify-center gap-2" aria-label={`Etapa ${stage + 1} de 3`}>{[0, 1, 2].map(index => <span key={index} className={`h-1.5 w-8 rounded-full ${index === stage ? 'bg-cyan-300' : 'bg-slate-700'}`} />)}</div></div>
          <button type="button" aria-label="Próxima etapa" onClick={() => moveStage(stage + 1)} disabled={stage >= maxStage} className="rounded-full border border-slate-700 p-3 text-cyan-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30">→</button>
        </div>
        <div hidden={stage !== 0}><AudioUploader busy={busy} onSubmit={handleSubmit} /></div>
        {job && <section hidden={stage !== 1} aria-live="polite" className="rounded-2xl border border-slate-700 bg-slate-900 p-6 sm:p-8">
          <h2 className="text-lg font-semibold">{job.status === 'queued' ? 'Na fila' : job.status === 'processing' ? 'Processando áudio…' : job.status === 'completed' ? 'Tablatura pronta' : 'Não foi possível processar'}</h2>
          {(job.status === 'queued' || job.status === 'processing') && <p className="mt-2 text-slate-300">O worker está trabalhando. Esta página consulta o resultado automaticamente.</p>}
          {job.status === 'failed' && <p className="mt-2 text-rose-300">{job.error || 'Erro inesperado no worker.'}</p>}
          {job.status === 'completed' && <AudioPlayer job={job} />}
        </section>}
        {job?.tab && stage === 2 && <TabViewer tab={job.tab} alphaTex={job.alpha_tex || ''} />}
        {message && <p role="alert" className="mt-4 text-sm text-rose-300">{message}</p>}
      </div>
    </section>
  </main>;
}
