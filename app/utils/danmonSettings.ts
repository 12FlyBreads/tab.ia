export type DanmonSettings = {
  onset: number;
  frame: number;
  min_frames: number;
  legato: number;
  orphan: boolean;
  fret_frames: number;
  dedup: number;
  reattack: number;
};

export const DEFAULT_DANMON_SETTINGS: DanmonSettings = {
  onset: 0.45,
  frame: 0.6,
  min_frames: 3,
  legato: 8,
  orphan: false,
  fret_frames: 3,
  dedup: 4,
  reattack: 0.75,
};

export function isDanmonSettings(value: unknown): value is DanmonSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  return typeof settings.onset === 'number' && Number.isFinite(settings.onset) && settings.onset >= 0.3 && settings.onset <= 0.8
    && typeof settings.frame === 'number' && Number.isFinite(settings.frame) && settings.frame >= 0 && settings.frame <= 1
    && Number.isInteger(settings.min_frames) && Number(settings.min_frames) >= 1 && Number(settings.min_frames) <= 30
    && Number.isInteger(settings.legato) && Number(settings.legato) >= 1 && Number(settings.legato) <= 60
    && typeof settings.orphan === 'boolean'
    && Number.isInteger(settings.fret_frames) && Number(settings.fret_frames) >= 1 && Number(settings.fret_frames) <= 30
    && Number.isInteger(settings.dedup) && Number(settings.dedup) >= 0 && Number(settings.dedup) <= 30
    && typeof settings.reattack === 'number' && Number.isFinite(settings.reattack) && settings.reattack >= 0 && settings.reattack <= 1;
}
