'use client';

import type { DanmonSettings } from '../utils/danmonSettings';

type Props = {
  open: boolean;
  settings: DanmonSettings;
  onClose: () => void;
  onChange: (settings: DanmonSettings) => void;
  onReset: () => void;
};

const inputClass = 'mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-300';
const labelClass = 'block text-sm font-medium text-slate-200';

export function SettingsPanel({ open, settings, onClose, onChange, onReset }: Props) {
  if (!open) return null;
  const set = <K extends keyof DanmonSettings>(key: K, value: DanmonSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return <div className="fixed inset-0 z-50" role="presentation">
    <button type="button" aria-label="Fechar configurações" onClick={onClose} className="absolute inset-0 h-full w-full bg-black/60" />
    <aside role="dialog" aria-modal="true" aria-labelledby="settings-title" className="settings-panel-scroll absolute inset-y-0 right-0 flex w-full max-w-sm flex-col overflow-y-auto border-l border-slate-700 bg-slate-900 p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-cyan-300">DanmoN · Guitab E25</p><h2 id="settings-title" className="mt-2 text-xl font-bold">Configurações da IA</h2></div>
        <button type="button" aria-label="Fechar painel" onClick={onClose} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800">✕</button>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-400">Os ajustes de extração de notas serão usados no próximo processamento e salvos neste navegador.</p>

      <div className="mt-7 space-y-5">
        <label className={labelClass}>Sensibilidade ao início das notas <span className="text-slate-400">({settings.onset.toFixed(2)})</span>
          <input className={inputClass} type="range" min="0.3" max="0.8" step="0.05" value={settings.onset} onChange={event => set('onset', Number(event.target.value))} />
          <span className="mt-1 block text-xs font-normal text-slate-400">Menor valor detecta mais ataques; maior valor reduz notas espúrias.</span>
        </label>
        <label className={labelClass}>Limiar de atividade da nota <span className="text-slate-400">({settings.frame.toFixed(2)})</span>
          <input className={inputClass} type="range" min="0" max="1" step="0.05" value={settings.frame} onChange={event => set('frame', Number(event.target.value))} />
          <span className="mt-1 block text-xs font-normal text-slate-400">Controla quando uma corda é considerada ativa ou silenciosa.</span>
        </label>
        <label className={labelClass}>Quadros mínimos da nota <span className="text-slate-400">({settings.min_frames})</span>
          <input className={inputClass} type="range" min="1" max="15" step="1" value={settings.min_frames} onChange={event => set('min_frames', Number(event.target.value))} />
          <span className="mt-1 block text-xs font-normal text-slate-400">Duração mínima para aceitar notas sem um ataque detectado.</span>
        </label>
        <label className={labelClass}>Sensibilidade a mudanças de casa <span className="text-slate-400">({settings.legato})</span>
          <input className={inputClass} type="range" min="1" max="30" step="1" value={settings.legato} onChange={event => set('legato', Number(event.target.value))} />
          <span className="mt-1 block text-xs font-normal text-slate-400">Quadros consecutivos para reconhecer uma nova nota ligada.</span>
        </label>
        <label className={labelClass}>Quadros para estimar a casa <span className="text-slate-400">({settings.fret_frames})</span>
          <input className={inputClass} type="range" min="1" max="15" step="1" value={settings.fret_frames} onChange={event => set('fret_frames', Number(event.target.value))} />
          <span className="mt-1 block text-xs font-normal text-slate-400">Mais quadros suavizam a estimativa da casa da nota.</span>
        </label>
        <label className={labelClass}>Deduplicação de notas <span className="text-slate-400">({settings.dedup === 0 ? 'desativada' : `${settings.dedup} quadros`})</span>
          <input className={inputClass} type="range" min="0" max="15" step="1" value={settings.dedup} onChange={event => set('dedup', Number(event.target.value))} />
          <span className="mt-1 block text-xs font-normal text-slate-400">Remove a mesma nota detectada em duas cordas próximas.</span>
        </label>
        <label className={labelClass}>Limiar para reataques <span className="text-slate-400">({settings.reattack === 0 ? 'desativado' : settings.reattack.toFixed(2)})</span>
          <input className={inputClass} type="range" min="0" max="1" step="0.05" value={settings.reattack} onChange={event => set('reattack', Number(event.target.value))} />
          <span className="mt-1 block text-xs font-normal text-slate-400">Evita separar uma nota sustentada em vários ataques.</span>
        </label>
        <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-200">
          <input type="checkbox" className="h-4 w-4 accent-cyan-300" checked={settings.orphan} onChange={event => set('orphan', event.target.checked)} />
          Detectar notas sem ataque claro
        </label>
      </div>
      <div className="mt-auto flex gap-3 pt-8">
        <button type="button" onClick={onReset} className="flex-1 rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Restaurar padrões</button>
        <button type="button" onClick={onClose} className="flex-1 rounded-lg bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200">Concluir</button>
      </div>
    </aside>
  </div>;
}
