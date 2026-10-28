export function formatTime(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds * 10) / 10);
  const safeSeconds = Math.floor(rounded);
  const tenth = Math.round((rounded - safeSeconds) * 10);
  const base = `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
  return tenth ? `${base}.${tenth}` : base;
}
