export type BasicPitchSettings = {
  onsetThreshold: number;
  frameThreshold: number;
  minimumNoteLengthMs: number;
  minimumFrequency: number | null;
  maximumFrequency: number | null;
  melodiaTrick: boolean;
  multiplePitchBends: boolean;
  midiTempo: number;
};

export const DEFAULT_BASIC_PITCH_SETTINGS: BasicPitchSettings = {
  onsetThreshold: 0.5,
  frameThreshold: 0.3,
  minimumNoteLengthMs: 127.7,
  minimumFrequency: null,
  maximumFrequency: null,
  melodiaTrick: true,
  multiplePitchBends: false,
  midiTempo: 120,
};
