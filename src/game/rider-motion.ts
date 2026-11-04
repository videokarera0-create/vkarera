import { RACE_DIST, type HorseRun } from "./sim";

// Presentation only: never changes stamina, speed or race outcomes.
export function finishDrive(h: Pick<HorseRun, "d" | "finished" | "whipping">) {
  return !h.finished && (h.whipping || (h.d > 0 && RACE_DIST - h.d < 200));
}

export function driveCycle(time: number, idx: number) {
  return (Math.sin(time * 9 + idx * 0.7) + 1) / 2;
}