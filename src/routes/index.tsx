import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import RaceScene from "@/components/race/RaceScene";
import {
  HORSES, HORSE_LEN, RACE_DIST, SEASON_RACES, getGame, makeForms, newRace, setGame, standings,
  type CamMode, type RaceState,
} from "@/game/sim";
import { BET_TYPES, isWinningBet, multiplier, winProbs, type BetType } from "@/game/bets";
import { RaceAudio } from "@/game/audio";
import { AccountGate } from "@/components/account/AccountGate";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Derby Nine — 3D Horse Racing & Betting" },
      { name: "description", content: "Nine-horse 3D derby with FC, TRI, Quartet, Penta and Super6 betting over a 1000-race season." },
      { property: "og:title", content: "Derby Nine — 3D Horse Racing" },
      { property: "og:description", content: "Pick your horse, place exotic bets and ride the final furlong in 3D." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RacePage,
});

interface Season { race: number; balance: number; points: number[]; wins: number; history: { race: number; order: number[]; type: BetType; picks: number[]; stake: number; payout: number }[] }
const freshSeason = (): Season => ({ race: 1, balance: 10000, points: HORSES.map(() => 0), wins: 0, history: [] });
const PTS = [10, 7, 5, 4, 3, 2, 1, 0, 0];
const CAMS: { id: CamMode; label: string; key: string }[] = [
  { id: "track", label: "Tracking", key: "1" }, { id: "broadcast", label: "Broadcast", key: "2" },
];
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const gameDb = supabase as unknown as SupabaseClient;

interface Snap { state: RaceState; countdown: number; order: number[]; d: number[]; v: number[]; stamina: number[]; finishTimes: number[]; cooldown: number }

function Silk({ i, size = "md" }: { i: number; size?: "sm" | "md" }) {
  const h = HORSES[i];
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-sm font-hud font-bold ring-1 ring-border ${size === "sm" ? "h-5 w-5 text-xs" : "h-7 w-7 text-sm"}`}
      style={{ background: h.silk, color: h.silk2 }}>{h.num}</span>
  );
}

function RacePage() {
  return <AccountGate><RaceExperience /></AccountGate>;
}

function RaceExperience() {
  const [season, setSeason] = useState<Season>(freshSeason);
  const [forms, setForms] = useState(() => makeForms());
  const [winRate, setWinRate] = useState(20);
  const [betType, setBetType] = useState<BetType>("WIN");
  const [picks, setPicks] = useState<number[]>([]);
  const [stake, setStake] = useState(500);
  const [manual, setManual] = useState(false);
  const [cam, setCam] = useState<CamMode>("track");
  const [muted, setMuted] = useState(false);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState<{ win: boolean; payout: number } | null>(null);
  const audio = useRef<RaceAudio | null>(null);
  const settled = useRef(false);
  const bet = useRef({ type: betType, picks, stake });

  const probs = useMemo(() => winProbs(forms), [forms]);
  const need = BET_TYPES.find((b) => b.id === betType)!.picks;
  const mult = picks.length === need ? multiplier(probs, picks) : 0;

  useEffect(() => {
    try { const s = localStorage.getItem("derby9-season"); if (s) setSeason(JSON.parse(s)); } catch { /* ignore */ }
    setGame(newRace(0, false, forms));
    void gameDb.from("game_settings").select("win_rate").eq("id", true).maybeSingle().then(({ data }) => {
      const setting = data as { win_rate?: number } | null;
      if (setting?.win_rate !== undefined) setWinRate(setting.win_rate);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { localStorage.setItem("derby9-season", JSON.stringify(season)); }, [season]);
  useEffect(() => { getGame().cam = cam; }, [cam]);

  // keyboard
  useEffect(() => {
    const set = (e: KeyboardEvent, on: boolean) => {
      const g = getGame(); const k = e.key.toLowerCase();
      if (k === " ") { g.input.whip = on; e.preventDefault(); }
      else if (k === "shift" || k === "b") { if (on) g.input.burst = true; }
      else if (k === "arrowleft" || k === "a") g.input.left = on;
      else if (k === "arrowright" || k === "d") g.input.right = on;
      else if (on && "12345".includes(k)) { const c = CAMS[Number(k) - 1]; if (c) setCam(c.id); }
    };
    const dn = (e: KeyboardEvent) => set(e, true), up = (e: KeyboardEvent) => set(e, false);
    window.addEventListener("keydown", dn); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, []);

  // HUD poll + audio sync (10 Hz)
  useEffect(() => {
    const id = setInterval(() => {
      const g = getGame(); const a = audio.current;
      for (const ev of g.events.splice(0)) {
        if (ev === "go") { a?.bell(); a?.cheer(); }
        if (ev === "finish") a?.cheer();
        if (ev === "burst") a?.crack(a.ctx!.currentTime);
      }
      if (a) {
        const running = g.horses.filter((h) => h.v > 1);
        const avg = running.length ? running.reduce((s, h) => s + h.v, 0) / running.length : 0;
        const lead = Math.max(...g.horses.map((h) => h.d));
        const ex = g.state === "running" ? Math.min(1, 0.2 + Math.max(0, 1 - (RACE_DIST - lead) / 300) * 0.8) : g.state === "finishing" ? 0.6 : 0.05;
        a.update(avg * g.timeScale, ex, g.horses.some((h) => h.whipping && !h.finished));
      }
      setSnap({
        state: g.state, countdown: g.countdown, order: standings(g),
        d: g.horses.map((h) => h.d), v: g.horses.map((h) => h.v), stamina: g.horses.map((h) => h.stamina),
        finishTimes: g.horses.map((h) => h.finishTime), cooldown: g.horses[g.playerIdx].cooldown,
      });
      if (g.state === "results" && !settled.current) {
        settled.current = true;
        const b = bet.current; const win = isWinningBet(b.picks, g.order);
        const payout = win ? Math.round(b.stake * multiplier(winProbs(forms), b.picks)) : 0;
        setResult({ win, payout });
        setSeason((s) => ({
          ...s, balance: s.balance + payout, wins: s.wins + (win ? 1 : 0),
          points: s.points.map((p, i) => p + PTS[g.order.indexOf(i)]),
          history: [{ race: s.race, order: [...g.order], type: b.type, picks: b.picks, stake: b.stake, payout }, ...s.history].slice(0, 30),
        }));
      }
    }, 100);
    return () => clearInterval(id);
  }, [forms]);

  const togglePick = (i: number) => setPicks((p) => (p.includes(i) ? p.filter((x) => x !== i) : p.length < need ? [...p, i] : p));
  const start = () => {
    if (picks.length !== need || stake <= 0 || stake > season.balance) return;
    if (!audio.current) audio.current = new RaceAudio();
    audio.current.init(); audio.current.setMuted(muted); audio.current.trumpet();
    bet.current = { type: betType, picks, stake };
    settled.current = false; setResult(null);
    setSeason((s) => ({ ...s, balance: s.balance - stake }));
    const raceForms = makeForms();
    raceForms[picks[0]] = Math.max(0.88, Math.min(1.12, raceForms[picks[0]] + (Math.random() * 100 < winRate ? 0.2 : -0.12)));
    setForms(raceForms);
    const g = newRace(picks[0], manual, raceForms); g.state = "gate"; g.countdown = 4.5; g.cam = manual ? "track" : cam;
    if (manual) setCam("track");
    setGame(g);
  };
  const nextRace = () => {
    const f = makeForms(); setForms(f); setPicks([]); setResult(null);
    setSeason((s) => (s.race >= SEASON_RACES ? { ...freshSeason(), balance: s.balance } : { ...s, race: s.race + 1 }));
    setGame(newRace(0, false, f));
  };
  const press = useCallback((k: "whip" | "left" | "right", on: boolean) => { getGame().input[k] = on; }, []);

  const state = snap?.state ?? "betting";
  const racing = state === "gate" || state === "running" || state === "photo" || state === "finishing";
  const leaderD = snap ? Math.max(...snap.d) : 0;
  const me = picks[0] ?? 0;
  const focus = manual || cam === "helmet" ? me : (snap?.order[0] ?? 0);
  const champ = season.points.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]).slice(0, 3);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0" data-scene-ready={ready ? "" : undefined}>
        <RaceScene onReady={() => setReady(true)} />
      </div>

      {/* top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <div className="hud-panel pointer-events-auto px-4 py-2">
          <h1 className="font-display text-xl font-black italic leading-none text-primary md:text-2xl">Derby Nine</h1>
          <p className="font-hud text-xs uppercase tracking-widest text-muted-foreground">Race {season.race} / {SEASON_RACES} · Championship</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="hud-panel pointer-events-auto flex items-center gap-3 px-4 py-2 font-hud">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Balance</span>
            <span className="text-xl font-bold text-primary">₱{fmt(season.balance)}</span>
            <button onClick={() => { const m = !muted; setMuted(m); audio.current?.setMuted(m); }} className="rounded border border-border px-2 py-0.5 text-xs uppercase hover:bg-secondary">{muted ? "Sound off" : "Sound on"}</button>
          </div>
          {racing && (
            <div className="hud-panel pointer-events-auto flex flex-wrap justify-end gap-1 p-1">
              {CAMS.map((c) => (
                <button key={c.id} onClick={() => setCam(c.id)} className={`rounded px-2.5 py-1 font-hud text-xs font-semibold uppercase tracking-wide transition ${cam === c.id ? "bg-gold text-primary-foreground" : "text-foreground hover:bg-secondary"}`}>
                  <span className="mr-1 opacity-60">{c.key}</span>{c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* betting panel */}
      {state === "betting" && (
        <section className="hud-panel absolute inset-x-2 bottom-2 max-h-[62dvh] overflow-y-auto p-4 md:inset-x-auto md:bottom-3 md:left-3 md:top-24 md:max-h-none md:w-[440px]">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-bold">Place your bet</h2>
            <span className="font-hud text-xs uppercase tracking-widest text-muted-foreground">9 runners · {Math.round(RACE_DIST)}m</span>
          </div>
          <div className="mb-2 grid grid-cols-6 gap-1">
            {BET_TYPES.map((b) => (
              <button key={b.id} onClick={() => { setBetType(b.id); setPicks((p) => p.slice(0, b.picks)); }}
                className={`rounded py-1.5 font-hud text-xs font-bold uppercase ${betType === b.id ? "bg-gold text-primary-foreground" : "bg-secondary hover:bg-muted"}`}>{b.label}</button>
            ))}
          </div>
          <p className="mb-3 text-xs text-muted-foreground">{BET_TYPES.find((b) => b.id === betType)!.desc}. Tap horses in finishing order — your 1st pick is the horse you ride.</p>
          <ul className="mb-3 space-y-1">
            {HORSES.map((h, i) => {
              const pos = picks.indexOf(i);
              return (
                <li key={i}>
                  <button onClick={() => togglePick(i)} className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition ${pos >= 0 ? "bg-primary/15 ring-1 ring-primary" : "hover:bg-secondary"}`}>
                    <Silk i={i} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold leading-tight">{h.name}</span>
                      <span className="block font-hud text-xs text-muted-foreground">{h.jockey} · form {(forms[i] * 100).toFixed(0)}</span>
                    </span>
                    <span className="font-hud text-sm text-muted-foreground">{multiplier(probs, [i]).toFixed(2)}x</span>
                    <span className="w-8 text-right font-hud text-sm font-bold text-primary">{pos >= 0 ? ["1st", "2nd", "3rd", "4th", "5th", "6th"][pos] : ""}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mb-3 flex items-center gap-2">
            <input type="number" min={1} value={stake} onChange={(e) => setStake(Math.max(0, Math.floor(Number(e.target.value))))}
              className="w-28 rounded border border-input bg-background px-2 py-1.5 font-hud text-lg" aria-label="Bet amount" />
            {[100, 500, 1000].map((v) => <button key={v} onClick={() => setStake(v)} className="rounded bg-secondary px-2 py-1.5 font-hud text-sm hover:bg-muted">{v}</button>)}
            <button onClick={() => setStake(season.balance)} className="rounded bg-secondary px-2 py-1.5 font-hud text-sm hover:bg-muted">All</button>
          </div>
          <div className="mb-3 flex rounded bg-secondary p-1 font-hud text-sm font-semibold uppercase">
            {[false, true].map((m) => (
              <button key={String(m)} onClick={() => setManual(m)} className={`flex-1 rounded py-1.5 ${manual === m ? "bg-background text-primary" : "text-muted-foreground"}`}>{m ? "Jockey control" : "Spectator"}</button>
            ))}
          </div>
          <div className="mb-3 flex items-center justify-between font-hud">
            <span className="text-muted-foreground">Multiplier <b className="text-foreground">{mult ? `${fmt(mult)}x` : "—"}</b></span>
            <span className="text-muted-foreground">Payout <b className="text-primary">{mult ? `₱${fmt(Math.round(stake * mult))}` : "—"}</b></span>
          </div>
          <button onClick={start} disabled={picks.length !== need || stake <= 0 || stake > season.balance}
            className="w-full rounded bg-gold py-3 font-display text-lg font-bold text-primary-foreground shadow-lg transition hover:brightness-110 disabled:opacity-40">
            {picks.length !== need ? `Pick ${need - picks.length} more` : stake > season.balance ? "Not enough balance" : "Start race"}
          </button>
          <div className="mt-4 border-t border-border pt-3 font-hud text-xs text-muted-foreground">
            <p className="mb-1 uppercase tracking-widest">Season standings</p>
            {champ.map(([p, i], k) => <p key={i} className="flex items-center gap-2"><span className="w-4">{k + 1}.</span><Silk i={i} size="sm" /> {HORSES[i].name} <span className="ml-auto">{p} pts</span></p>)}
            <p className="mt-1">Bets won: {season.wins}</p>
          </div>
        </section>
      )}

      {/* live HUD */}
      {racing && snap && (
        <>
          <aside className="hud-panel pointer-events-none absolute left-3 top-24 w-56 p-2 font-hud">
            <p className="mb-1 px-1 text-xs uppercase tracking-widest text-muted-foreground">Leaderboard</p>
            <ol className="space-y-0.5">
              {snap.order.map((i, k) => {
                const gap = (leaderD - snap.d[i]) / HORSE_LEN;
                return (
                  <li key={i} className={`flex items-center gap-2 rounded px-1 py-0.5 text-sm ${i === me ? "bg-primary/20" : ""}`}>
                    <span className="w-4 text-right font-bold text-primary">{k + 1}</span><Silk i={i} size="sm" />
                    <span className="flex-1 truncate">{HORSES[i].name}</span>
                    <span className="text-xs text-muted-foreground">{snap.d[i] >= RACE_DIST ? `${snap.finishTimes[i].toFixed(2)}s` : k === 0 ? "—" : `+${gap.toFixed(1)}L`}</span>
                  </li>
                );
              })}
            </ol>
          </aside>
          <div className="hud-panel pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-5 px-5 py-2 font-hud">
            <div className="text-center"><p className="text-4xl font-bold leading-none tabular-nums">{Math.round(snap.v[focus] * 3.6)}</p><p className="text-xs uppercase tracking-widest text-muted-foreground">km/h · #{HORSES[focus].num}</p></div>
            <div className="text-center"><p className="text-4xl font-bold leading-none tabular-nums text-primary">{Math.max(0, Math.round(RACE_DIST - leaderD))}<span className="text-lg">m</span></p><p className="text-xs uppercase tracking-widest text-muted-foreground">to finish</p></div>
            <div className="w-28"><p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Stamina #{HORSES[me].num}</p>
              <div className="h-2 overflow-hidden rounded bg-secondary"><div className="h-full bg-gold transition-all" style={{ width: `${snap.stamina[me] * 100}%` }} /></div></div>
          </div>
          {manual && (
            <div className="absolute bottom-24 right-3 flex flex-col items-end gap-2 md:bottom-3">
              <p className="hud-panel hidden px-3 py-1 font-hud text-xs text-muted-foreground md:block">Space whip · Shift burst · A/D lanes</p>
              <div className="flex gap-2">
                {(["left", "right"] as const).map((k) => (
                  <button key={k} onPointerDown={() => press(k, true)} onPointerUp={() => press(k, false)} onPointerLeave={() => press(k, false)}
                    className="hud-panel h-14 w-14 font-hud text-sm font-bold uppercase select-none">{k === "left" ? "Rail" : "Out"}</button>
                ))}
                <button onPointerDown={() => press("whip", true)} onPointerUp={() => press("whip", false)} onPointerLeave={() => press("whip", false)}
                  className="h-14 w-20 rounded bg-accent font-hud text-sm font-bold uppercase text-accent-foreground select-none">Whip</button>
                <button onClick={() => { getGame().input.burst = true; }} disabled={snap.cooldown > 0}
                  className="h-14 w-20 rounded bg-gold font-hud text-sm font-bold uppercase text-primary-foreground disabled:opacity-40">{snap.cooldown > 0 ? `${Math.ceil(snap.cooldown)}s` : "Burst"}</button>
              </div>
            </div>
          )}
        </>
      )}

      {state === "gate" && snap && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p key={Math.ceil(snap.countdown)} className="animate-flash font-display text-8xl font-black italic text-primary drop-shadow-lg">{snap.countdown > 3 ? "Ready" : Math.ceil(snap.countdown)}</p>
        </div>
      )}
      {state === "photo" && snap && (
        <div className="pointer-events-none absolute inset-x-0 top-1/4 flex flex-col items-center">
          <p className="animate-flash bg-accent px-8 py-2 font-display text-5xl font-black uppercase italic tracking-wide text-accent-foreground md:text-7xl">Photo Finish</p>
          <p className="mt-3 hud-panel flex items-center gap-2 px-4 py-2 font-hud text-xl font-bold"><Silk i={snap.order[0]} /> {HORSES[snap.order[0]].name} wins!</p>
        </div>
      )}

      {state === "results" && snap && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 p-3">
          <section className="hud-panel w-full max-w-md p-5">
            <p className="font-hud text-xs uppercase tracking-widest text-muted-foreground">Race {season.race} result</p>
            <h2 className="mb-3 font-display text-3xl font-black italic text-primary">{HORSES[snap.order[0]].name}</h2>
            <ol className="mb-4 space-y-1 font-hud">
              {snap.order.map((i, k) => (
                <li key={i} className={`flex items-center gap-2 text-sm ${bet.current.picks[k] === i ? "text-success" : ""}`}>
                  <span className="w-5 font-bold">{k + 1}</span><Silk i={i} size="sm" /><span className="flex-1">{HORSES[i].name} <span className="text-muted-foreground">· {HORSES[i].jockey}</span></span>
                  <span className="tabular-nums text-muted-foreground">{snap.finishTimes[i].toFixed(2)}s</span>
                </li>
              ))}
            </ol>
            <div className={`mb-4 rounded p-3 text-center font-hud ${result?.win ? "bg-success/20 text-success" : "bg-secondary text-muted-foreground"}`}>
              <p className="text-xs uppercase tracking-widest">{BET_TYPES.find((b) => b.id === bet.current.type)!.label} · {bet.current.picks.map((p) => `#${HORSES[p].num}`).join(" › ")}</p>
              <p className="text-2xl font-bold">{result?.win ? `You won ₱${fmt(result.payout)}!` : `Lost ₱${fmt(bet.current.stake)}`}</p>
            </div>
            <button onClick={nextRace} className="w-full rounded bg-gold py-3 font-display text-lg font-bold text-primary-foreground">
              {season.race >= SEASON_RACES ? "Start new season" : `Next race (${season.race + 1}/${SEASON_RACES})`}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
