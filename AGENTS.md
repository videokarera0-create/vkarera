<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Race rules (speed, stamina, traffic, finish order) live in `src/game/sim.ts` and betting math in `src/game/bets.ts`; both are plain TS with no React/three imports so they stay testable.
- The 3D scene only reads the module-level game object (`getGame()`) inside `useFrame`; a single `Stepper` advances the sim; the HUD polls it at 10 Hz instead of React state per frame — keeps 60fps.
- All audio is synthesized in `src/game/audio.ts` (Web Audio); no external sound files.
- `noUncheckedIndexedAccess` is off: the game indexes fixed 9-horse arrays everywhere.
- Horses and jockeys are flat 2D canvas drawings (`flat-horse-draw.ts`) billboarded by `FlatHorse`; presentation-only finish driving lives in `rider-motion` so visual changes cannot alter betting outcomes.
- Dev verification uses `window.__game.state` (live game), `window.__game.sim(seconds)` (fixed-step advancement), and `?rider=side|back` (close-up camera); these are dev-only so published gameplay cannot be skipped.
