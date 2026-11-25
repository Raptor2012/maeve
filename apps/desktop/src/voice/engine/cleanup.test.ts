import { describe, expect, it } from "@effect/vitest";

import { acceptCleaned } from "./cleanup.ts";

describe("acceptCleaned", () => {
  it("keeps the model's text", () => {
    expect(acceptCleaned("um so the orb is slow", "So the orb is slow.")).toBe(
      "So the orb is slow.",
    );
  });

  it("drops filler-only speech", () => {
    expect(acceptCleaned("um, uh", "")).toBe("");
  });

  it("keeps the spoken words when the model answers nothing for them", () => {
    expect(acceptCleaned("please rebuild the windows installer", "")).toBe(
      "please rebuild the windows installer",
    );
  });
});
