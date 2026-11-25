import { describe, expect, it } from "vite-plus/test";

import { speechEnvelope } from "./speechEnvelope";

function wav(samples: ReadonlyArray<number>): string {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, sample, true));
  return btoa(String.fromCharCode(...bytes));
}

describe("speechEnvelope", () => {
  it("follows loudness per 50 ms, scaled to the clip's peak", () => {
    // 20 samples per step at 400 Hz: silence, a quiet step, then a loud step with negative samples.
    const samples = [...Array(20).fill(0), ...Array(20).fill(1000), ...Array(20).fill(-4000)];
    const levels = speechEnvelope(wav(samples), 400);
    expect(Array.from(levels)).toEqual([0, 0.25, 1]);
  });

  it("is empty for a clip with no samples", () => {
    expect(speechEnvelope(wav([]), 24_000)).toHaveLength(0);
  });
});
