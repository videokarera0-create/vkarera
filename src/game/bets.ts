import { HORSES } from "./sim";

export type BetType = "WIN" | "FC" | "TRI" | "QUARTET" | "PENTA" | "SUPER6";

export const BET_TYPES: { id: BetType; label: string; picks: number; desc: string }[] = [
  { id: "WIN", label: "Win", picks: 1, desc: "Pick the winner" },
  { id: "FC", label: "FC", picks: 2, desc: "Forecast · 1st & 2nd in exact order" },
  { id: "TRI", label: "TRI", picks: 3, desc: "Trifecta · 1st, 2nd, 3rd in order" },
  { id: "QUARTET", label: "Quartet", picks: 4, desc: "1st to 4th in exact order" },
  { id: "PENTA", label: "Penta", picks: 5, desc: "1st to 5th in exact order" },
  { id: "SUPER6", label: "Super6", picks: 6, desc: "1st to 6th in exact order" },
];

/** Market win probability for each horse given its pre-race form. */
export function winProbs(forms: number[]): number[] {
  const r = HORSES.map((h, i) => h.top * (forms[i] ?? 1) + h.kick * 0.3 + h.stamina * 0.6);
  const m = Math.max(...r);
  const e = r.map((x) => Math.exp((x - m) * 2.2));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

/** Harville probability of an exact finishing sequence. */
export function seqProb(p: number[], seq: number[]): number {
  let prob = 1, rem = 1;
  for (const i of seq) { prob *= p[i] / rem; rem -= p[i]; }
  return prob;
}

export function multiplier(p: number[], seq: number[]): number {
  if (!seq.length) return 0;
  const m = 0.85 / seqProb(p, seq);
  return Math.round(Math.min(Math.max(m, 1.1), 9_999_999) * 100) / 100;
}

/** A bet wins only when every pick matches the finishing order position by position. */
export function isWinningBet(picks: number[], order: number[]): boolean {
  return picks.length > 0 && picks.every((h, i) => order[i] === h);
}
