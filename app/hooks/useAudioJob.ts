'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

export type Job = { id: string; status: 'queued' | 'processing' | 'completed' | 'failed'; tab?: string; alpha_tex?: string; error?: string };

export function useAudioJob() {
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const discardStoredJob = useCallback(() => {
    const previousJobId = window.sessionStorage.getItem('tab-ia-job-id');
    if (previousJobId) void fetch(`/api/jobs/${encodeURIComponent(previousJobId)}`, { method: 'DELETE', keepalive: true });
    window.sessionStorage.removeItem('tab-ia-job-id');
  }, []);

  useEffect(() => { discardStoredJob(); }, [discardStoredJob]);

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

  const submit = useCallback(async (event: FormEvent<HTMLFormElement>, file: File | null,
    duration: number, trimStart: number, trimEnd: number) => {
    event.preventDefault();
    if (!file) return false;
    discardStoredJob();
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
      window.sessionStorage.setItem('tab-ia-job-id', data.id);
      return true;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Falha ao enviar áudio.');
      return false;
    } finally { setBusy(false); }
  }, [discardStoredJob]);

  return { job, busy, message, submit };
}
