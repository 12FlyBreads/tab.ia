'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { AudioUploader } from './components/AudioUploader';
import { useAudioJob } from './hooks/useAudioJob';
import { SettingsPanel } from './components/SettingsPanel';
import { DEFAULT_BASIC_PITCH_SETTINGS, type BasicPitchSettings } from './utils/basicPitchSettings';

const TabViewer = dynamic(() => import('./components/TabViewer').then(module => module.TabViewer), {
  ssr: false,
  loading: () => <div className="flex min-h-[300px] w-full items-center justify-center rounded-xl bg-slate-900 text-slate-300">Carregando visualizador de tablatura…</div>,
});

export default function Home() {
  const { job, busy, message, submit } = useAudioJob();
  const [settings, setSettings] = useState<BasicPitchSettings>(DEFAULT_BASIC_PITCH_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stage, setStage] = useState(0);
  const [started, setStarted] = useState(false);
  const stageLabels = ['Selecione um áudio', 'IA processando', 'Resultado pronto'];
  const maxStage = job?.tab ? 2 : job ? 1 : 0;
  const processingPhase = !job ? 0 : job.status === 'completed' && job.tab ? 2 : 1;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('tab-ia-basic-pitch-settings');
      if (stored) setSettings({ ...DEFAULT_BASIC_PITCH_SETTINGS, ...JSON.parse(stored) });
    } catch { /* Ignore invalid or unavailable local preferences. */ }
    setSettingsReady(true);
  }, []);
  useEffect(() => {
    if (settingsReady) window.localStorage.setItem('tab-ia-basic-pitch-settings', JSON.stringify(settings));
  }, [settings, settingsReady]);
  useEffect(() => {
    if (job?.status === 'completed' && job.tab && stage === 1) setStage(2);
  }, [job?.status, job?.tab, stage]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>, file: File | null,
    youtubePreviewId: string, duration: number, start: number, end: number) {
    const created = await submit(event, file, youtubePreviewId, duration, start, end, settings);
    if (created) setStage(1);
    return created;
  }

  function moveStage(next: number) {
    if (job?.status === 'completed' && job.tab) {
      if (stage === 2 && next < 2) setStage(0);
      else if (stage === 0 && next > 0) setStage(2);
      return;
    }
    setStage(Math.max(0, Math.min(maxStage, next)));
  }

  return <main className={`flex min-h-screen flex-col px-5 ${started ? 'justify-start pt-16 pb-4 sm:pb-6' : 'py-10 sm:py-16'}`}>
    {started && <>
      <div className="absolute left-1/2 top-6 z-40 w-full max-w-3xl -translate-x-1/2 px-5"><p className="text-left text-xs font-semibold uppercase tracking-[.2em] text-cyan-300">TAB.IA · ÁUDIO PARA TABLATURA</p></div>
      <button type="button" aria-label="Abrir configurações" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(true)} className="fixed right-5 top-5 z-40 rounded-xl border border-slate-700 bg-slate-900/90 p-3 text-cyan-200 shadow-lg transition hover:border-cyan-300 hover:bg-slate-800">
        <span className="flex w-6 flex-col gap-1.5" aria-hidden="true"><span className="h-0.5 w-full rounded bg-current" /><span className="h-0.5 w-full rounded bg-current" /><span className="h-0.5 w-full rounded bg-current" /></span>
      </button>
      <button type="button" aria-label="Etapa anterior" onClick={() => moveStage(stage - 1)} disabled={stage === 0} className="stage-arrow-left fixed z-30 -translate-y-1/2 rounded-full border border-slate-700 bg-slate-900 p-2 text-cyan-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30 sm:p-3">←</button>
      <button type="button" aria-label="Próxima etapa" onClick={() => moveStage(stage + 1)} disabled={stage >= maxStage} className="stage-arrow-right fixed z-30 -translate-y-1/2 rounded-full border border-slate-700 bg-slate-900 p-2 text-cyan-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30 sm:p-3">→</button>
      <SettingsPanel open={settingsOpen} settings={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} onReset={() => setSettings(DEFAULT_BASIC_PITCH_SETTINGS)} />
    </>}
    <section className={`mx-auto w-full max-w-3xl ${started ? '' : 'my-auto'}`}>
      {!started ? <div className="mx-auto max-w-2xl text-left">
        <p className="text-sm font-semibold uppercase tracking-[.25em] text-cyan-300">TAB.IA · ÁUDIO PARA TABLATURA</p>
        <h1 className="mt-4 text-4xl font-bold sm:text-5xl">Transforme uma música em notas.</h1>
        <p className="mt-4 leading-7 text-slate-300">Envie uma música e transforme o áudio em uma tablatura de guitarra para acompanhar, estudar e tocar.</p>
        <button type="button" onClick={() => setStarted(true)} className="mt-8 rounded-lg bg-cyan-300 px-7 py-3 font-bold text-slate-950 transition hover:bg-cyan-200">Vamos lá</button>
      </div> : <>
      <div>
        <div className="mb-8 text-center"><p className="text-xs font-semibold uppercase tracking-[.2em] text-slate-400">{stageLabels[processingPhase]}</p><div className="mt-2 flex justify-center gap-2" aria-label={`Fase: ${stageLabels[processingPhase]}`}>{[0, 1, 2].map(index => <span key={index} className={`h-1.5 w-8 rounded-full ${index <= processingPhase ? 'bg-cyan-300' : 'bg-slate-700'}`} />)}</div></div>
        <div className="min-w-0">
            <div hidden={stage !== 0}><AudioUploader busy={busy} onSubmit={handleSubmit} /></div>
            {job && job.status !== 'completed' && <section hidden={stage !== 1} aria-live="polite" className="rounded-2xl border border-slate-700 bg-slate-900 p-6 sm:p-8">
              <h2 className="text-lg font-semibold">{job.status === 'queued' ? 'Na fila' : job.status === 'processing' ? 'Processando áudio…' : 'Não foi possível processar'}</h2>
              {(job.status === 'queued' || job.status === 'processing') && <p className="mt-2 text-slate-300">O worker está trabalhando. Esta página consulta o resultado automaticamente.</p>}
              {job.status === 'failed' && <p className="mt-2 text-rose-300">{job.error || 'Erro inesperado no worker.'}</p>}
            </section>}
            {job?.tab && stage === 2 && <TabViewer tab={job.tab} alphaTex={job.alpha_tex || ''} instrumentalUrl={`/api/jobs/${job.id}/instrumental`} />}
            {message && <p role="alert" className="mt-4 text-sm text-rose-300">{message}</p>}
        </div>
      </div>
      </>}
    </section>
  </main>;
}
