'use client';

import { useState } from 'react';
import type { Job } from '../hooks/useAudioJob';

export function AudioPlayer({ job }: { job: Job }) {
  const [playerStatus, setPlayerStatus] = useState('Pronto para reproduzir');
  return <div className="mt-5 rounded-xl bg-slate-950 p-5">
    <h3 className="font-semibold">Guitarra/violão isolado</h3>
    <audio className="mt-3 w-full accent-cyan-300" controls preload="auto" src={`/api/jobs/${job.id}/instrumental`}
      onLoadStart={() => setPlayerStatus('Preparando áudio…')} onCanPlay={() => setPlayerStatus('Pronto para reproduzir')}
      onWaiting={() => setPlayerStatus('Carregando trecho…')} onPlaying={() => setPlayerStatus('Reproduzindo')}
      onPause={() => setPlayerStatus('Pausado')} onError={() => setPlayerStatus('Não foi possível carregar o áudio')}>
      Seu navegador não oferece suporte à reprodução de áudio.
    </audio>
    <p aria-live="polite" className="mt-2 text-xs text-slate-400">{playerStatus}</p>
    <a className="mt-3 inline-flex rounded-lg border border-cyan-300 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-300/10" href={`/api/jobs/${job.id}/instrumental`} download="guitarra.mp3">Baixar guitarra isolada</a>
    <p className="mt-2 text-xs text-slate-400">A separação de guitarra é experimental e pode deixar outros sons residuais. O arquivo temporário é removido ao recarregar a página.</p>
  </div>;
}
