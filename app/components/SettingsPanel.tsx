'use client';

import type { BasicPitchSettings } from '../utils/basicPitchSettings';

type Props = {
  open: boolean;
  settings: BasicPitchSettings;
  onClose: () => void;
  onChange: (settings: BasicPitchSettings) => void;
  onReset: () => void;
};

const inputClass = 'mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-300';
const labelClass = 'block text-sm font-medium text-slate-200';

export function SettingsPanel({ open, settings, onClose, onChange, onReset }: Props) {
  if (!open) return null;
  const set = <K extends keyof BasicPitchSettings>(key: K, value: BasicPitchSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return <div className="fixed inset-0 z-50" role="presentation">
    <button type="button" aria-label="Fechar configurações" onClick={onClose} className="absolute inset-0 h-full w-full bg-black/60" />
    <aside role="dialog" aria-modal="true" aria-labelledby="settings-title" className="settings-panel-scroll absolute inset-y-0 right-0 flex w-full max-w-sm flex-col overflow-y-auto border-l border-slate-700 bg-slate-900 p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-cyan-300">Preferências</p><h2 id="settings-title" className="mt-2 text-xl font-bold">Configurações da IA</h2></div>
        <button type="button" aria-label="Fechar painel" onClick={onClose} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800">✕</button>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-400">Os ajustes serão usados na próxima transcrição e salvos neste navegador.</p>

      <div className="mt-7 space-y-5">
        <label className={labelClass}>Limiar de onset <span className="text-slate-400">({settings.onsetThreshold.toFixed(2)})</span>
          <input className={inputClass} type="range" min="0" max="1" step="0.01" value={settings.onsetThreshold} onChange={event => set('onsetThreshold', Number(event.target.value))} />
          <span className="mt-1 block text-xs font-normal text-slate-400">Sensibilidade ao início das notas.</span>
        </label>
        <label className={labelClass}>Limiar de frame <span className="text-slate-400">({settings.frameThreshold.toFixed(2)})</span>
          <input className={inputClass} type="range" min="0" max="1" step="0.01" value={settings.frameThreshold} onChange={event => set('frameThreshold', Number(event.target.value))} />
          <span className="mt-1 block text-xs font-normal text-slate-400">Sensibilidade para manter uma nota ativa.</span>
        </label>
        <label className={labelClass}>Duração mínima da nota (ms)
          <input className={inputClass} type="number" min="1" max="10000" step="0.1" value={settings.minimumNoteLengthMs} onChange={event => { if (event.target.value !== '') set('minimumNoteLengthMs', Number(event.target.value)); }} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>Frequência mínima (Hz)
            <input className={inputClass} type="number" min="1" max="20000" placeholder="Sem limite" value={settings.minimumFrequency ?? ''} onChange={event => set('minimumFrequency', event.target.value === '' ? null : Number(event.target.value))} />
          </label>
          <label className={labelClass}>Frequência máxima (Hz)
            <input className={inputClass} type="number" min="1" max="20000" placeholder="Sem limite" value={settings.maximumFrequency ?? ''} onChange={event => set('maximumFrequency', event.target.value === '' ? null : Number(event.target.value))} />
          </label>
        </div>
        <label className={labelClass}>Tempo MIDI (BPM)
          <input className={inputClass} type="number" min="1" max="600" step="1" value={settings.midiTempo} onChange={event => { if (event.target.value !== '') set('midiTempo', Number(event.target.value)); }} />
        </label>
        <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-200"><input type="checkbox" className="h-4 w-4 accent-cyan-300" checked={settings.melodiaTrick} onChange={event => set('melodiaTrick', event.target.checked)} /> Pós-processamento Melodia</label>
        <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-200"><input type="checkbox" className="h-4 w-4 accent-cyan-300" checked={settings.multiplePitchBends} onChange={event => set('multiplePitchBends', event.target.checked)} /> Permitir pitch bends sobrepostos</label>
      </div>
      <div className="mt-auto flex gap-3 pt-8">
        <button type="button" onClick={onReset} className="flex-1 rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Restaurar padrões</button>
        <button type="button" onClick={onClose} className="flex-1 rounded-lg bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200">Concluir</button>
      </div>
    </aside>
  </div>;
}
