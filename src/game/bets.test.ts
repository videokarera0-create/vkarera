import { describe, expect, it } from "vitest";
import { isWinningBet, multiplier, seqProb, BET_TYPES } from "./bets";

describe("betting", () => {
  it("FC wins only with 1st and 2nd in exact order", () => {
    expect(isWinningBet([2, 5], [2, 5, 1])).toBe(true);
    expect(isWinningBet([5, 2], [2, 5, 1])).toBe(false);
  });
  it("Super6 needs all six positions right", () => {
    expect(isWinningBet([0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5, 6, 7, 8])).toBe(true);
    expect(isWinningBet([0, 1, 2, 3, 4, 6], [0, 1, 2, 3, 4, 5, 6, 7, 8])).toBe(false);
  });
  it("bet types require 1..6 picks", () => {
    expect(BET_TYPES.map((b) => b.picks)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("longer exact sequences pay more", () => {
    const p = Array(9).fill(1 / 9);
    expect(seqProb(p, [0, 1])).toBeCloseTo(1 / 72);
    expect(multiplier(p, [0, 1, 2])).toBeGreaterThan(multiplier(p, [0, 1]));
  });
});
