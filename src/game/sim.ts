// Pure race simulation: no React, no three.js.
export const TRACK_L = 220;
export const TRACK_R = 70;
export const TRACK_W = 18;
export const PERIM = 2 * TRACK_L + 2 * Math.PI * TRACK_R;
export const FINISH_S = TRACK_L * 0.8;
export const RACE_DIST = PERIM; // one full lap, start = finish post
export const SEASON_RACES = 1000;
export const STRIDE = 6.4;
export const HORSE_LEN = 2.4;

export const laneOffset = (lane: number) => 1.6 + lane * 1.75;

export type RaceState = "betting" | "gate" | "running" | "photo" | "finishing" | "results";
export type CamMode = "track" | "broadcast" | "helmet" | "drone" | "finish";

export interface HorseDef {
  num: number;
  name: string;
  jockey: string;
  coat: string;
  mane: string;
  silk: string;
  silk2: string;
  top: number;
  accel: number;
  stamina: number;
  kick: number;
}

export const HORSES: HorseDef[] = [
  { num: 1, name: "Thunder Bolt", jockey: "R. Santos", coat: "#6b3a1e", mane: "#1a0f08", silk: "#c8102e", silk2: "#ffd100", top: 17.2, accel: 0.9, stamina: 0.9, kick: 1.0 },
  { num: 2, name: "Golden Mirage", jockey: "M. Delgado", coat: "#a0522d", mane: "#5c2e12", silk: "#ffd100", silk2: "#002868", top: 16.8, accel: 0.75, stamina: 1.1, kick: 1.4 },
  { num: 3, name: "Night Fury", jockey: "J. Reyes", coat: "#1c1a19", mane: "#0a0a0a", silk: "#161616", silk2: "#f2f2f2", top: 17.0, accel: 0.8, stamina: 1.0, kick: 1.3 },
  { num: 4, name: "Silver Arrow", jockey: "A. Cruz", coat: "#9a9a96", mane: "#d8d8d4", silk: "#0057b8", silk2: "#e6e6e6", top: 16.6, accel: 1.0, stamina: 1.0, kick: 1.5 },
  { num: 5, name: "Desert Storm", jockey: "L. Navarro", coat: "#b08a5a", mane: "#3b2a1a", silk: "#ff7f00", silk2: "#161616", top: 16.9, accel: 0.7, stamina: 1.15, kick: 1.1 },
  { num: 6, name: "Royal Flush", jockey: "E. Batac", coat: "#4a2614", mane: "#140a05", silk: "#006747", silk2: "#ffd100", top: 17.3, accel: 0.65, stamina: 0.85, kick: 1.2 },
  { num: 7, name: "Midnight Run", jockey: "K. Tan", coat: "#3a2418", mane: "#120a06", silk: "#00a3e0", silk2: "#c8102e", top: 16.5, accel: 0.95, stamina: 1.1, kick: 1.8 },
  { num: 8, name: "Crimson Tide", jockey: "P. Ramos", coat: "#8b3a1a", mane: "#3a160a", silk: "#e4007c", silk2: "#ffffff", top: 16.7, accel: 0.85, stamina: 0.95, kick: 1.6 },
  { num: 9, name: "Lucky Star", jockey: "D. Garcia", coat: "#c9a46a", mane: "#efe3c2", silk: "#ffffff", silk2: "#007a3d", top: 16.4, accel: 1.0, stamina: 1.2, kick: 1.7 },
];

export interface TrackPoint { x: number; z: number; heading: number; tx: number; tz: number; nx: number; nz: number }

export function trackPoint(sIn: number, off: number): TrackPoint {
  const L = TRACK_L, R = TRACK_R, arc = Math.PI * R;
  const s = ((sIn % PERIM) + PERIM) % PERIM;
  let x: number, z: number, nx: number, nz: number, tx: number, tz: number;
  if (s < L) { x = -L / 2 + s; z = R; nx = 0; nz = 1; tx = 1; tz = 0; }
  else if (s < L + arc) { const t = (s - L) / R; x = L / 2 + R * Math.sin(t); z = R * Math.cos(t); nx = Math.sin(t); nz = Math.cos(t); tx = Math.cos(t); tz = -Math.sin(t); }
  else if (s < 2 * L + arc) { const u = s - L - arc; x = L / 2 - u; z = -R; nx = 0; nz = -1; tx = -1; tz = 0; }
  else { const t = (s - 2 * L - arc) / R; x = -L / 2 - R * Math.sin(t); z = -R * Math.cos(t); nx = -Math.sin(t); nz = -Math.cos(t); tx = -Math.cos(t); tz = Math.sin(t); }
  return { x: x + nx * off, z: z + nz * off, heading: Math.atan2(-tz, tx), tx, tz, nx, nz };
}

export function isTurn(sIn: number) {
  const s = ((sIn % PERIM) + PERIM) % PERIM;
  return (s >= TRACK_L && s < TRACK_L + Math.PI * TRACK_R) || s >= 2 * TRACK_L + Math.PI * TRACK_R;
}

export interface HorseRun {
  d: number; v: number; stamina: number; lane: number; phase: number;
  whipping: boolean; burstT: number; cooldown: number;
  finished: boolean; finishTime: number; place: number;
  form: number; noiseP: number; kickAt: number;
  x: number; z: number; heading: number; tx: number; tz: number;
}

export interface Game {
  state: RaceState; time: number; countdown: number; timeScale: number; photoReal: number;
  horses: HorseRun[]; order: number[]; playerIdx: number; manual: boolean;
  input: { whip: boolean; burst: boolean; left: boolean; right: boolean };
  cam: CamMode; events: string[];
}

export function makeForms(rand = Math.random) {
  return HORSES.map(() => 0.97 + rand() * 0.06);
}

export function newRace(playerIdx: number, manual: boolean, forms: number[], rand = Math.random): Game {
  const horses = HORSES.map((_, i) => {
    const p = trackPoint(FINISH_S, laneOffset(i));
    return {
      d: 0, v: 0, stamina: 1, lane: i, phase: rand(), whipping: false, burstT: 0, cooldown: 0,
      finished: false, finishTime: 0, place: 0, form: forms[i] ?? 1,
      noiseP: rand() * 100, kickAt: 160 + rand() * 200,
      x: p.x, z: p.z, heading: p.heading, tx: p.tx, tz: p.tz,
    };
  });
  return { state: "betting", time: 0, countdown: 0, timeScale: 1, photoReal: 0, horses, order: [], playerIdx, manual,
    input: { whip: false, burst: false, left: false, right: false }, cam: "track", events: [] };
}

let current: Game = newRace(0, false, HORSES.map(() => 1));
export const getGame = () => current;
export const setGame = (g: Game) => { current = g; };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function stepGame(g: Game, dtReal: number) {
  const dtR = Math.min(dtReal, 0.05);
  if (g.state === "gate") {
    g.countdown -= dtR;
    if (g.countdown <= 0) { g.state = "running"; g.events.push("go"); }
  }
  if (g.state === "photo") {
    g.photoReal += dtR;
    if (g.photoReal > 2.8) { g.timeScale = 1; g.state = g.order.length === HORSES.length ? "results" : "finishing"; g.events.push("photoEnd"); }
  }
  const racing = g.state === "running" || g.state === "photo" || g.state === "finishing";
  const dt = racing ? dtR * g.timeScale : 0;
  g.time += dt;

  g.horses.forEach((h, i) => {
    const def = HORSES[i];
    if (racing) {
      if (h.finished) {
        h.v += (7 - h.v) * Math.min(1, 0.6 * dt);
        h.whipping = false;
      } else {
        const rem = RACE_DIST - h.d;
        let target = def.top * h.form * (0.86 + 0.14 * h.stamina)
          + Math.sin(g.time * 0.35 + h.noiseP) * 0.3 + Math.sin(g.time * 1.1 + h.noiseP * 2) * 0.12;
        let drain = (0.012 * Math.pow(h.v / def.top, 3)) / def.stamina;
        const isPlayer = g.manual && i === g.playerIdx;
        if (isPlayer) {
          h.whipping = g.input.whip && h.stamina > 0.02;
          if (h.whipping) { target += 1.1; drain += 0.035 / def.stamina; }
          if (g.input.burst) {
            g.input.burst = false;
            if (h.cooldown <= 0 && h.stamina > 0.2) { h.burstT = 2.5; h.cooldown = 8; h.stamina -= 0.1; g.events.push("burst"); }
          }
          const steer = (g.input.right ? 1 : 0) - (g.input.left ? 1 : 0);
          h.lane = clamp(h.lane + steer * 1.6 * dt, 0, 9);
        } else {
          h.whipping = rem < h.kickAt;
          if (h.whipping) { target += def.kick; drain += 0.03 / def.stamina; }
        }
        if (h.burstT > 0) { h.burstT -= dt; target += 2.2; }
        h.cooldown -= dt;
        h.v += (target - h.v) * Math.min(1, def.accel * (h.v < target ? 1 : 0.6) * dt);

        // traffic: blocked by a horse just ahead in the same lane
        let blocked = false, innerClear = true;
        g.horses.forEach((o, j) => {
          if (j === i) return;
          const dd = o.d - h.d, dl = o.lane - h.lane;
          if (dd > 0 && dd < 2.8 && Math.abs(dl) < 0.9) { blocked = true; h.v = Math.min(h.v, o.v + 0.15); }
          if (Math.abs(dd) < 3 && dl < -0.2 && dl > -1.3) innerClear = false;
        });
        if (!isPlayer) {
          if (blocked) h.lane = clamp(h.lane + 1.2 * dt, 0, 9);
          else if (innerClear) h.lane = clamp(h.lane - 0.45 * dt, 0, 9);
        }
        h.stamina = clamp(h.stamina - drain * dt, 0, 1);
      }
      const s = FINISH_S + h.d;
      const eff = isTurn(s) ? 1 - ((laneOffset(h.lane) - 1.6) / TRACK_R) * 0.15 : 1;
      const prev = h.d;
      h.d += h.v * dt * eff;
      if (!h.finished && h.d >= RACE_DIST) {
        h.finished = true;
        h.finishTime = g.time - dt * ((h.d - RACE_DIST) / Math.max(1e-6, h.d - prev));
        g.order.push(i);
        h.place = g.order.length;
        if (h.place === 1) { g.state = "photo"; g.timeScale = 0.18; g.photoReal = 0; g.events.push("finish"); }
        else if (h.place === HORSES.length && g.state === "finishing") g.state = "results";
      }
      h.phase = (h.phase + (h.v / STRIDE) * dt) % 1;
    }
    const p = trackPoint(FINISH_S + h.d, laneOffset(h.lane));
    h.x = p.x; h.z = p.z; h.heading = p.heading; h.tx = p.tx; h.tz = p.tz;
  });
  if (g.state === "finishing" && g.order.length === HORSES.length) g.state = "results";
}

export function standings(g: Game): number[] {
  return g.horses.map((_, i) => i).sort((a, b) => {
    const A = g.horses[a], B = g.horses[b];
    if (A.finished && B.finished) return A.place - B.place;
    if (A.finished) return -1;
    if (B.finished) return 1;
    return B.d - A.d;
  });
}
