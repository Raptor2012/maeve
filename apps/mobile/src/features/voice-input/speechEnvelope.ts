const WAV_HEADER_BYTES = 44;
export const ENVELOPE_STEP_SECONDS = 0.05;

/**
 * Loudness of a mono 16-bit PCM WAV (base64), one value per 50 ms, scaled 0..1 against the clip's
 * own peak so quiet and loud replies move the orb alike.
 */
export function speechEnvelope(wavBase64: string, sampleRate: number): Float32Array {
  const bytes = atob(wavBase64);
  const samples = Math.max(0, Math.floor((bytes.length - WAV_HEADER_BYTES) / 2));
  const perStep = Math.max(1, Math.round(sampleRate * ENVELOPE_STEP_SECONDS));
  const levels = new Float32Array(Math.ceil(samples / perStep));
  let peak = 0;
  for (let step = 0; step < levels.length; step++) {
    const end = Math.min(samples, (step + 1) * perStep);
    let sum = 0;
    for (let i = step * perStep; i < end; i++) {
      const offset = WAV_HEADER_BYTES + 2 * i;
      const value = ((bytes.charCodeAt(offset) | (bytes.charCodeAt(offset + 1) << 8)) << 16) >> 16;
      sum += value * value;
    }
    levels[step] = Math.sqrt(sum / Math.max(1, end - step * perStep));
    peak = Math.max(peak, levels[step]!);
  }
  if (peak > 0) for (let step = 0; step < levels.length; step++) levels[step]! /= peak;
  return levels;
}
