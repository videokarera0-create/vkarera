import { describe, expect, it } from "vitest";
import { RACE_DIST } from "./sim";
import { finishDrive } from "./rider-motion";

describe("jockey finish drive", () => {
  it("uses the whip approaching the finish, not at the starting line", () => {
    expect(finishDrive({ d: 0, finished: false, whipping: false })).toBe(false);
    expect(finishDrive({ d: RACE_DIST - 300, finished: false, whipping: false })).toBe(false);
    expect(finishDrive({ d: RACE_DIST - 100, finished: false, whipping: false })).toBe(true);
  });
  it("stops driving once the horse has finished", () => {
    expect(finishDrive({ d: RACE_DIST + 1, finished: true, whipping: true })).toBe(false);
  });
});