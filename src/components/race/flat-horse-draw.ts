// Hand-drawn 2D side-view horse and jockey, painted to a canvas each frame.
// Canvas faces right; ground line at GROUND. Pure drawing, no game logic.
export const CW = 512, CH = 400, GROUND = 372;

export interface FlatPose {
  phase: number;   // gallop cycle 0..1
  amp: number;     // 0 standing .. 1 full gallop
  driving: boolean;
  strike: number;  // 1 = whip raised, 0 = whip landing on the hindquarter
  time: number;
  flip: boolean;   // true when the horse runs toward screen-left
}
export interface FlatLook { coat: string; mane: string; silk: string; silk2: string; num: number; blaze: boolean; socks: boolean }

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}
type P = [number, number];
const add = (a: P, len: number, ang: number): P => [a[0] + Math.sin(ang) * len, a[1] + Math.cos(ang) * len];

function limb(c: CanvasRenderingContext2D, hip: P, l1: number, l2: number, a1: number, a2: number, w1: number, w2: number, col: string, hoofAng: number, sock: boolean) {
  const knee = add(hip, l1, a1), fet = add(knee, l2, a2);
  c.lineCap = "round"; c.strokeStyle = col;
  c.lineWidth = w1; c.beginPath(); c.moveTo(hip[0], hip[1] - 6); c.lineTo(knee[0], knee[1]); c.stroke();
  c.lineWidth = w2; c.beginPath(); c.moveTo(knee[0], knee[1]); c.lineTo(fet[0], fet[1]); c.stroke();
  if (sock) { c.strokeStyle = "#ece8dc"; c.lineWidth = w2 + 1; c.beginPath(); c.moveTo(...add(knee, l2 * .55, a2)); c.lineTo(fet[0], fet[1]); c.stroke(); }
  // pastern + hoof
  c.save(); c.translate(fet[0], fet[1]); c.rotate(-hoofAng);
  c.fillStyle = "#2a2622"; c.beginPath(); c.moveTo(-6, -2); c.lineTo(7, -2); c.lineTo(10, 11); c.lineTo(-7, 11); c.closePath(); c.fill();
  c.restore();
}

export function drawFlatHorse(c: CanvasRenderingContext2D, look: FlatLook, pose: FlatPose) {
  c.clearRect(0, 0, CW, CH);
  c.save();
  if (pose.flip) { c.translate(CW, 0); c.scale(-1, 1); }
  const { amp, driving, strike } = pose, ph = pose.phase * Math.PI * 2;
  const bob = -Math.sin(ph * 2) * 5 * amp;      // body rises at suspension
  const pump = Math.sin(ph + Math.PI) * amp;    // head-neck pump, -1..1
  const coat = look.coat, coatDark = shade(coat, -.35), coatLight = shade(coat, .18);

  // gallop: far-hind, near-hind, far-fore, near-fore lead sequence
  const legPose = (off: number, front: boolean) => {
    const a = ph + off * Math.PI * 2, swing = Math.max(0, Math.cos(a)), reach = Math.sin(a);
    if (front) {
      const up = reach * .75 * amp;
      return { a1: up, a2: up - swing * 1.9 * amp, hoof: up - swing * 2.3 * amp };
    }
    const up = (reach * .62 - .32) * amp - .3 * (1 - amp);
    return { a1: up, a2: up + .55 - swing * 1.25 * amp, hoof: up + .3 - swing * 1.5 * amp };
  };
  const fHip: P = [336, 214 + bob], hHip: P = [182, 206 + bob];
  const legs = [
    { off: 0, front: false, near: false }, { off: .1, front: false, near: true },
    { off: .45, front: true, near: false }, { off: .57, front: true, near: true },
  ];
  const drawLeg = (L: typeof legs[number]) => {
    const p = legPose(L.off, L.front), hip: P = L.front ? [fHip[0] + (L.near ? 0 : -8), fHip[1]] : [hHip[0] + (L.near ? 0 : -8), hHip[1]];
    const col = L.near ? coat : coatDark;
    if (L.front) limb(c, hip, 80, 72, p.a1, p.a2, 22, 10, col, p.hoof, look.socks && L.near);
    else limb(c, hip, 82, 74, p.a1, p.a2, 30, 10, col, p.hoof, look.socks && !L.near);
  };
  legs.filter(l => !l.near).forEach(drawLeg);

  // tail streams back with speed
  const tw = Math.sin(pose.time * 6) * 6;
  c.strokeStyle = look.mane; c.lineCap = "round";
  for (let i = 0; i < 5; i++) {
    c.lineWidth = 9 - i;
    c.beginPath(); c.moveTo(140, 162 + bob + i * 2);
    c.quadraticCurveTo(100 - amp * 20, 175 + bob + i * 6 - amp * 25, 70 - amp * 30 + tw, 230 - amp * 70 + i * 9 + tw);
    c.stroke();
  }

  // barrel + hindquarter
  const grad = c.createLinearGradient(0, 140 + bob, 0, 250 + bob);
  grad.addColorStop(0, coatLight); grad.addColorStop(.55, coat); grad.addColorStop(1, coatDark);
  c.fillStyle = grad;
  c.beginPath();
  c.moveTo(368, 214 + bob);
  c.bezierCurveTo(355, 252 + bob, 270, 246 + bob, 228, 240 + bob);
  c.bezierCurveTo(196, 238 + bob, 186, 248 + bob, 162, 236 + bob);
  c.bezierCurveTo(120, 220 + bob, 118, 170 + bob, 140, 156 + bob);
  c.bezierCurveTo(160, 140 + bob, 200, 146 + bob, 250, 156 + bob);
  c.bezierCurveTo(280, 160 + bob, 300, 150 + bob, 318, 146 + bob);
  c.lineTo(368, 214 + bob); c.fill();

  // neck and head
  const poll: P = [404 + pump * 7, 86 + bob + pump * 9 + (1 - amp) * -6];
  const headAng = .78 + pump * .1 + amp * .12;
  c.fillStyle = grad;
  c.beginPath();
  c.moveTo(300, 150 + bob);
  c.bezierCurveTo(330, 120 + bob, 370, 82 + bob, poll[0] - 4, poll[1] - 6);
  c.lineTo(poll[0] + 10, poll[1] + 24);
  c.bezierCurveTo(385, 140 + bob, 380, 175 + bob, 372, 220 + bob);
  c.lineTo(320, 215 + bob); c.closePath(); c.fill();
  // mane
  c.strokeStyle = look.mane; c.lineWidth = 7;
  c.beginPath(); c.moveTo(304, 146 + bob); c.bezierCurveTo(332, 116 + bob, 366, 84 + bob, poll[0] - 6, poll[1] - 6); c.stroke();
  c.lineWidth = 3;
  for (let i = 0; i < 7; i++) { const t = i / 7, x = 308 + t * 90, y = 142 + bob - t * 52; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 10 - amp * 6, y + 4 + Math.sin(pose.time * 14 + i) * 2); c.stroke(); }

  c.save(); c.translate(poll[0], poll[1]); c.rotate(headAng);
  c.fillStyle = coat;
  c.beginPath(); c.moveTo(-6, -12); c.quadraticCurveTo(35, -16, 70, -8);
  c.quadraticCurveTo(80, 0, 72, 12); c.lineTo(42, 15); c.quadraticCurveTo(20, 30, 2, 22); c.closePath(); c.fill();
  c.fillStyle = shade(coat, -.5); c.beginPath(); c.ellipse(70, 3, 7, 8, 0, 0, Math.PI * 2); c.fill(); // muzzle
  if (look.blaze) { c.fillStyle = "#ece8dc"; c.beginPath(); c.moveTo(14, -13); c.quadraticCurveTo(45, -13, 66, -7); c.lineTo(64, -4); c.quadraticCurveTo(40, -9, 14, -9); c.fill(); }
  c.fillStyle = coatDark; c.beginPath(); c.moveTo(-2, -12); c.lineTo(-12, -30); c.lineTo(6, -14); c.fill(); // ear
  c.fillStyle = "#0d0a08"; c.beginPath(); c.ellipse(19, -4, 4, 3, 0, 0, Math.PI * 2); c.fill();   // eye
  c.beginPath(); c.ellipse(72, -3, 3, 2, .3, 0, Math.PI * 2); c.fill();                            // nostril
  // bridle: crown, cheek, noseband, bit ring at the corner of the mouth
  c.strokeStyle = "#1e140e"; c.lineWidth = 3;
  c.beginPath(); c.moveTo(4, -12); c.lineTo(8, 22); c.moveTo(8, 4); c.lineTo(60, 10); c.moveTo(50, -10); c.lineTo(52, 14); c.stroke();
  c.strokeStyle = "#b9b6ae"; c.lineWidth = 2; c.beginPath(); c.arc(60, 11, 4, 0, Math.PI * 2); c.stroke();
  c.restore();
  const bit: P = [poll[0] + Math.cos(headAng) * 60 - Math.sin(headAng) * 11, poll[1] + Math.sin(headAng) * 60 + Math.cos(headAng) * 11];

  // saddle cloth with number, saddle, girth
  c.fillStyle = look.silk; c.beginPath(); c.moveTo(228, 160 + bob); c.lineTo(300, 154 + bob); c.lineTo(306, 212 + bob); c.lineTo(234, 218 + bob); c.closePath(); c.fill();
  c.fillStyle = "#f8f7f2"; c.fillRect(250, 168 + bob, 34, 32);
  c.save(); c.translate(267, 185 + bob); if (pose.flip) c.scale(-1, 1);
  c.fillStyle = "#151515"; c.font = "bold 26px Arial"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(look.num), 0, 1); c.restore();
  c.fillStyle = "#2a1d14"; c.beginPath(); c.ellipse(268, 152 + bob, 34, 7, -.05, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "#2a1d14"; c.lineWidth = 5; c.beginPath(); c.moveTo(304, 156 + bob); c.lineTo(312, 236 + bob); c.stroke();

  legs.filter(l => l.near).forEach(drawLeg);

  // jockey: crouched in short stirrups; rides the stride and pumps forward when driving
  const push = driving ? pump : pump * .3;
  const hip: P = [262 + push * 4, 128 + bob * .4];
  const knee: P = [302, 150 + bob * .7], ankle: P = [290, 196 + bob];
  c.lineCap = "round";
  c.strokeStyle = "#ece8dc"; c.lineWidth = 17; c.beginPath(); c.moveTo(...hip); c.lineTo(...knee); c.stroke();
  c.strokeStyle = "#141210"; c.lineWidth = 12; c.beginPath(); c.moveTo(...knee); c.lineTo(...ankle); c.stroke();
  c.fillStyle = "#141210"; c.fillRect(ankle[0] - 4, ankle[1] - 3, 20, 7);
  c.strokeStyle = "#a8a6a0"; c.lineWidth = 2; c.beginPath(); c.moveTo(ankle[0] - 8, 150 + bob); c.lineTo(ankle[0], ankle[1] + 4); c.stroke();

  const lean = -.12 - (driving ? .06 + push * .08 + (1 - strike) * .05 : 0);
  const sh: P = [hip[0] + Math.cos(lean) * 60, hip[1] + Math.sin(lean) * 60];
  c.strokeStyle = look.silk; c.lineWidth = 30; c.beginPath(); c.moveTo(...hip); c.lineTo(...sh); c.stroke();
  // number patch on the jockey's back
  c.save(); c.translate((hip[0] + sh[0]) / 2 - 4, (hip[1] + sh[1]) / 2 - 10); c.rotate(lean);
  c.fillStyle = "#f8f7f2"; c.fillRect(-11, -7, 22, 14);
  if (pose.flip) c.scale(-1, 1);
  c.fillStyle = "#151515"; c.font = "bold 13px Arial"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(look.num), 0, 1); c.restore();
  // head, helmet, goggles
  const head: P = [sh[0] + 20, sh[1] - 10];
  c.fillStyle = "#bd8b69"; c.beginPath(); c.arc(head[0] + 3, head[1] + 4, 11, 0, Math.PI * 2); c.fill();
  c.fillStyle = look.silk; c.beginPath(); c.arc(head[0], head[1], 13, Math.PI, Math.PI * 2.1); c.fill();
  c.fillStyle = look.silk2; c.fillRect(head[0] - 13, head[1] - 3, 26, 4);
  c.fillStyle = "#151515"; c.fillRect(head[0] + 8, head[1] - 1, 10, 3);
  c.fillStyle = "#504337"; c.fillRect(head[0] + 6, head[1] + 2, 9, 5);

  // reins: from the bit ring at the mouth to the rein hand, slight sag
  const rh: P = [352 + push * 16, 140 + bob * .6 + push * 4];
  c.strokeStyle = "#1e140e"; c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(...bit); c.quadraticCurveTo((bit[0] + rh[0]) / 2, Math.max(bit[1], rh[1]) + 6, rh[0], rh[1]); c.stroke();
  const arm = (to: P, col: string) => {
    const el: P = [(sh[0] + to[0]) / 2 + 2, Math.max(sh[1], to[1]) + 12];
    c.strokeStyle = col; c.lineWidth = 11; c.beginPath(); c.moveTo(...sh); c.lineTo(...el); c.lineTo(...to); c.stroke();
    c.fillStyle = "#c9b69c"; c.beginPath(); c.arc(to[0], to[1], 6, 0, Math.PI * 2); c.fill();
  };
  arm(rh, shade(look.silk, -.2));

  // whip hand: at rest it carries the crop down the shoulder; driving it raises high and cracks onto the hindquarter
  const target: P = [168, 176 + bob];
  let wh: P, cropAng: number;
  if (driving) {
    const up: P = [sh[0] - 16, sh[1] - 34], down: P = [sh[0] - 30, sh[1] + 26];
    wh = [down[0] + (up[0] - down[0]) * strike, down[1] + (up[1] - down[1]) * strike];
    const hitAng = Math.atan2(target[1] - wh[1], target[0] - wh[0]), upAng = -2.55;
    cropAng = hitAng + (upAng - hitAng) * strike;
  } else {
    wh = [rh[0] - 6, rh[1] + 3]; cropAng = Math.PI * .86;
  }
  c.strokeStyle = "#141210"; c.lineWidth = 3;
  const tip: P = [wh[0] + Math.cos(cropAng) * 92, wh[1] + Math.sin(cropAng) * 92];
  c.beginPath(); c.moveTo(...wh); c.lineTo(...tip); c.stroke();
  c.fillStyle = "#2a1d14"; c.fillRect(tip[0] - 4, tip[1] - 3, 8, 6);
  if (driving && strike < .08) { // contact flick on the hindquarter
    c.strokeStyle = "rgba(255,240,200,.8)"; c.lineWidth = 2;
    for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(tip[0] + i * 6, tip[1] - 8); c.lineTo(tip[0] + i * 10, tip[1] - 16); c.stroke(); }
  }
  arm(wh, look.silk);
  c.restore();
}
