'use client';

import { useEffect, useState } from 'react';

export const WAVEFORM_BAR_COUNT = 88;

/** Decode an audio source and return relative RMS levels for evenly spaced time slices. */
export function useAudioWaveform(source: string) {
  const [waveform, setWaveform] = useState<number[]>([]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setWaveform([]);
    if (!source) return () => controller.abort();

    let audioContext: AudioContext | null = null;
    void (async () => {
      try {
        const response = await fetch(source, { signal: controller.signal });
        if (!response.ok) throw new Error('Não foi possível carregar o áudio para a forma de onda.');
        const encodedAudio = await response.arrayBuffer();
        if (!active) return;
        audioContext = new AudioContext();
        const decodedAudio = await audioContext.decodeAudioData(encodedAudio);
        const channelData = Array.from({ length: decodedAudio.numberOfChannels }, (_, channel) => decodedAudio.getChannelData(channel));
        const levels = Array.from({ length: WAVEFORM_BAR_COUNT }, (_, barIndex) => {
          const start = Math.floor(barIndex * decodedAudio.length / WAVEFORM_BAR_COUNT);
          const end = Math.max(start + 1, Math.floor((barIndex + 1) * decodedAudio.length / WAVEFORM_BAR_COUNT));
          const stride = Math.max(1, Math.floor((end - start) / 2048));
          let sumSquares = 0;
          let sampleCount = 0;
          for (let index = start; index < end; index += stride) {
            for (const channel of channelData) {
              sumSquares += channel[index] * channel[index];
              sampleCount++;
            }
          }
          return sampleCount ? Math.sqrt(sumSquares / sampleCount) : 0;
        });
        const maximum = Math.max(...levels, 0.0001);
        if (active) setWaveform(levels.map(level => Math.max(5, Math.round((level / maximum) * 100))));
      } catch (error) {
        if (active && !controller.signal.aborted) console.warn('Não foi possível calcular a forma de onda do áudio.', error);
      } finally {
        if (audioContext && audioContext.state !== 'closed') void audioContext.close();
      }
    })();

    return () => { active = false; controller.abort(); };
  }, [source]);

  return waveform;
}
