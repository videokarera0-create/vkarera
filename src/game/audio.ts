import { STRIDE } from "./sim";

// All sounds synthesized with the Web Audio API (no external files).
export class RaceAudio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  crowd!: GainNode;
  noise!: AudioBuffer;
  nextBeat = 0;
  beat = 0;
  muted = false;

  init() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.5 + last * 3; }
    // ambient wind / track bed
    const amb = this.loop(); const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 350;
    const ag = ctx.createGain(); ag.gain.value = 0.07; amb.connect(lp).connect(ag).connect(this.master);
    // crowd murmur: two band-passed layers
    this.crowd = ctx.createGain(); this.crowd.gain.value = 0.05; this.crowd.connect(this.master);
    for (const f of [700, 1500]) {
      const src = this.loop(); const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 0.8;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.3 + Math.random() * 0.4; const lg = ctx.createGain(); lg.gain.value = 0.3;
      const g = ctx.createGain(); g.gain.value = 0.7; lfo.connect(lg).connect(g.gain); lfo.start();
      src.connect(bp).connect(g).connect(this.crowd);
    }
  }

  private loop() {
    const s = this.ctx!.createBufferSource(); s.buffer = this.noise; s.loop = true; s.loopStart = Math.random(); s.start(); return s;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  hoof(t: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(150 + Math.random() * 30, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.09);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.15);
    const n = ctx.createBufferSource(); n.buffer = this.noise; const hp = ctx.createBiquadFilter(); hp.type = "bandpass"; hp.frequency.value = 900;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(vol * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(hp).connect(ng).connect(this.master); n.start(t, Math.random()); n.stop(t + 0.06);
  }

  /** speed in m/s of the pack; excitement 0..1 */
  update(speed: number, excitement: number, whipping: boolean) {
    const ctx = this.ctx; if (!ctx) return;
    this.crowd.gain.setTargetAtTime(0.05 + excitement * 0.45, ctx.currentTime, 0.6);
    if (speed > 1) {
      const stride = STRIDE / speed;
      const gaps = [0.12, 0.33, 0.12, 0.43];
      if (this.nextBeat < ctx.currentTime) this.nextBeat = ctx.currentTime + 0.02;
      while (this.nextBeat < ctx.currentTime + 0.3) {
        this.hoof(this.nextBeat + Math.random() * 0.012, Math.min(0.5, 0.15 + speed * 0.02));
        // second (pack) layer
        if (Math.random() < 0.7) this.hoof(this.nextBeat + 0.03 + Math.random() * 0.04, 0.12);
        this.nextBeat += gaps[this.beat++ % 4] * stride;
      }
    }
    if (whipping && Math.random() < 0.12) this.crack(ctx.currentTime + Math.random() * 0.1);
  }

  crack(t: number) {
    const ctx = this.ctx!; const n = ctx.createBufferSource(); n.buffer = this.noise;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2500;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    n.connect(hp).connect(g).connect(this.master); n.start(t, Math.random()); n.stop(t + 0.05);
  }

  trumpet() {
    const ctx = this.ctx; if (!ctx) return;
    const N: Record<string, number> = { G4: 392, C5: 523.25, E5: 659.25, G5: 783.99 };
    const tune: [string, number][] = [["G4", .18], ["C5", .18], ["E5", .18], ["G5", .36], ["E5", .18], ["G5", .6], ["G4", .18], ["C5", .18], ["E5", .18], ["G5", .18], ["E5", .18], ["C5", .18], ["E5", .18], ["G5", .9]];
    let t = ctx.currentTime + 0.05;
    for (const [n, d] of tune) {
      const f = N[n]; const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.03); g.gain.setValueAtTime(0.14, t + d * 0.8); g.gain.linearRampToValueAtTime(0, t + d);
      for (const [type, det] of [["sawtooth", 0], ["square", 6]] as const) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
        o.connect(lp); o.start(t); o.stop(t + d + 0.02);
      }
      lp.connect(g).connect(this.master); t += d;
    }
  }

  bell() {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = 1400;
      const g = ctx.createGain(); const s = t + i * 0.09; g.gain.setValueAtTime(0.12, s); g.gain.exponentialRampToValueAtTime(0.001, s + 0.08);
      o.connect(g).connect(this.master); o.start(s); o.stop(s + 0.09);
    }
  }

  cheer() {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    this.crowd.gain.cancelScheduledValues(t);
    this.crowd.gain.setValueAtTime(this.crowd.gain.value, t);
    this.crowd.gain.linearRampToValueAtTime(0.9, t + 0.4);
    this.crowd.gain.setTargetAtTime(0.15, t + 2, 1.5);
  }
}
