import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, Sky } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import FlatHorse from "./FlatHorse";
import * as THREE from "three";
import {
  FINISH_S, HORSES, PERIM, TRACK_L, TRACK_R, TRACK_W, getGame, laneOffset, stepGame, trackPoint,
} from "@/game/sim";

/* ---------- procedural textures ---------- */
function canvasTex(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void, repeat = 1) {
  const cv = document.createElement("canvas"); cv.width = cv.height = size;
  draw(cv.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const dirtTex = () => canvasTex(512, (c, s) => {
  c.fillStyle = "#8a6142"; c.fillRect(0, 0, s, s);
  for (let i = 0; i < 26000; i++) {
    const l = 30 + Math.random() * 30; c.fillStyle = `hsla(26,${35 + Math.random() * 20}%,${l}%,${0.25 + Math.random() * 0.3})`;
    c.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  c.strokeStyle = "rgba(60,38,22,0.25)"; c.lineWidth = 2;
  for (let i = 0; i < 40; i++) { const x = Math.random() * s; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + Math.random() * 20 - 10, s); c.stroke(); }
});
const grassTex = () => canvasTex(512, (c, s) => {
  for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? "#3f6b2a" : "#4a7a31"; c.fillRect(0, (i * s) / 8, s, s / 8); }
  for (let i = 0; i < 30000; i++) { c.fillStyle = `hsla(${90 + Math.random() * 20},45%,${22 + Math.random() * 20}%,0.35)`; c.fillRect(Math.random() * s, Math.random() * s, 1, 2 + Math.random() * 3); }
}, 60);
const softTex = () => canvasTex(64, (c, s) => {
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = g; c.fillRect(0, 0, s, s);
});
/* ---------- one stepper ---------- */
function Stepper() {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const target = window as typeof window & { __game?: { state: ReturnType<typeof getGame>; sim: (seconds: number) => void } };
    target.__game = {
      get state() { return getGame(); },
      sim(seconds) { for (let t = 0; t < seconds; t += 1 / 60) stepGame(getGame(), 1 / 60); },
    };
    return () => { delete target.__game; };
  }, []);
  useFrame((_, dt) => stepGame(getGame(), dt));
  return null;
}

function leaderIdx() {
  const g = getGame(); let b = 0;
  g.horses.forEach((h, i) => { if (h.d > g.horses[b].d) b = i; });
  return b;
}

/* ---------- track ---------- */
function strip(off0: number, off1: number, y: number, vScale: number, samples = 700) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const s = (i / samples) * PERIM; const a = trackPoint(s, off0), b = trackPoint(s, off1);
    pos.push(a.x, y, a.z, b.x, y, b.z); uv.push(0, s / vScale, 1, s / vScale);
    if (i < samples) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
function railCurve(off: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 240; i++) { const p = trackPoint((i / 240) * PERIM, off); pts.push(new THREE.Vector3(p.x, 1.05, p.z)); }
  return new THREE.CatmullRomCurve3(pts, true);
}
function Rails() {
  const inner = useMemo(() => new THREE.TubeGeometry(railCurve(-0.6), 600, 0.07, 6, true), []);
  const outer = useMemo(() => new THREE.TubeGeometry(railCurve(TRACK_W + 0.6), 600, 0.07, 6, true), []);
  const posts = useRef<THREE.InstancedMesh>(null);
  const n = Math.floor(PERIM / 5) * 2;
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(); let k = 0;
    for (let i = 0; i < n / 2; i++) for (const off of [-0.6, TRACK_W + 0.6]) {
      const p = trackPoint(i * 5, off); m.makeTranslation(p.x, 0.52, p.z); posts.current!.setMatrixAt(k++, m);
    }
    posts.current!.instanceMatrix.needsUpdate = true;
  }, [n]);
  return (
    <group>
      <mesh geometry={inner} castShadow><meshStandardMaterial color="#f4f1ea" roughness={0.4} /></mesh>
      <mesh geometry={outer} castShadow><meshStandardMaterial color="#f4f1ea" roughness={0.4} /></mesh>
      <instancedMesh ref={posts} args={[undefined, undefined, n]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 1.05, 6]} /><meshStandardMaterial color="#e8e4da" />
      </instancedMesh>
    </group>
  );
}
function Track() {
  const geo = useMemo(() => strip(-1, TRACK_W + 1, 0.02, 14), []);
  const tex = useMemo(() => dirtTex(), []);
  const grass = useMemo(() => grassTex(), []);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[1400, 1400]} /><meshStandardMaterial map={grass} roughness={0.95} />
      </mesh>
      <mesh geometry={geo} receiveShadow><meshStandardMaterial map={tex} roughness={1} color="#d9b99a" /></mesh>
      <Rails />
      <FinishLine />
    </group>
  );
}
function FinishLine() {
  const a = trackPoint(FINISH_S, -0.8);
  const c = trackPoint(FINISH_S, TRACK_W / 2);
  return (
    <group>
      <mesh position={[c.x, 0.03, c.z]} rotation-x={-Math.PI / 2}><planeGeometry args={[0.4, TRACK_W + 2]} /><meshStandardMaterial color="#ffffff" /></mesh>
      <mesh position={[a.x, 3, a.z]} castShadow><cylinderGeometry args={[0.12, 0.12, 6, 10]} /><meshStandardMaterial color="#f5f5f5" /></mesh>
      <mesh position={[a.x, 6.3, a.z]} rotation-y={Math.PI / 2}><cylinderGeometry args={[0.8, 0.8, 0.08, 24]} /><meshStandardMaterial color="#c8102e" /></mesh>
      <mesh position={[a.x + 0.05, 6.3, a.z]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.45, 0.45, 0.1, 24]} /><meshStandardMaterial color="#ffffff" /></mesh>
      {/* judges' box across the track */}
      <mesh position={[a.x, 4, trackPoint(FINISH_S, TRACK_W + 4).z]} castShadow><boxGeometry args={[2.4, 3, 2.4]} /><meshStandardMaterial color="#e9e2d0" /></mesh>
    </group>
  );
}
function Gate() {
  const ref = useRef<THREE.Group>(null);
  const p = trackPoint(FINISH_S - 1.5, 0);
  useFrame(() => {
    const g = getGame(); const show = g.state === "betting" || g.state === "gate" || (g.state === "running" && g.time < 2);
    ref.current!.visible = show;
  });
  return (
    <group ref={ref} position={[p.x, 0, 0]}>
      {Array.from({ length: 11 }).map((_, i) => (
        <mesh key={i} position={[0, 1.6, TRACK_R + 0.75 + i * 1.75]} castShadow><boxGeometry args={[3.6, 3.2, 0.12]} /><meshStandardMaterial color="#2d5a3d" roughness={0.6} /></mesh>
      ))}
      <mesh position={[0, 3.4, TRACK_R + 9.5]} castShadow><boxGeometry args={[3.8, 0.4, 19]} /><meshStandardMaterial color="#1f3f2b" /></mesh>
    </group>
  );
}

/* ---------- grandstand + crowd ---------- */
const CROWD = 2200;
function Stands() {
  const crowd = useRef<THREE.InstancedMesh>(null);
  const base = useMemo(() => {
    const arr: [number, number, number, number][] = [];
    for (let i = 0; i < CROWD; i++) { const row = i % 14; arr.push([-120 + Math.random() * 240, 1.3 + row * 0.9, TRACK_R + TRACK_W + 9 + row * 1.2, Math.random() * 10]); }
    return arr;
  }, []);
  useLayoutEffect(() => {
    const col = new THREE.Color(); const pal = ["#c8102e", "#f2f2f2", "#1d3b6f", "#e8c35a", "#2f6b3a", "#d97a2b", "#3a3a3a", "#8fb8de"];
    base.forEach((_, i) => { crowd.current!.setColorAt(i, col.set(pal[i % pal.length]!).offsetHSL(0, 0, Math.random() * 0.1 - 0.05)); });
    crowd.current!.instanceColor!.needsUpdate = true;
  }, [base]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame((st) => {
    const g = getGame(); const t = st.clock.elapsedTime;
    const lead = Math.max(...g.horses.map((h) => h.d));
    const ex = g.state === "photo" || g.state === "finishing" ? 1 : g.state === "running" ? Math.max(0.15, 1 - (PERIM - lead) / 400) : 0.05;
    base.forEach(([x, y, z, ph], i) => { m.makeTranslation(x, y + Math.max(0, Math.sin(t * 9 + ph)) * 0.25 * ex, z); crowd.current!.setMatrixAt(i, m); });
    crowd.current!.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      {Array.from({ length: 14 }).map((_, r) => (
        <mesh key={r} position={[0, r * 0.9 + 0.4, TRACK_R + TRACK_W + 9 + r * 1.2]} receiveShadow castShadow>
          <boxGeometry args={[250, 0.9 + r * 0 , 1.2]} /><meshStandardMaterial color="#b9b4a8" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 7, TRACK_R + TRACK_W + 26]} castShadow><boxGeometry args={[252, 14, 1]} /><meshStandardMaterial color="#e6dfcf" /></mesh>
      <mesh position={[0, 15, TRACK_R + TRACK_W + 17]} rotation-x={-0.12} castShadow><boxGeometry args={[256, 0.5, 20]} /><meshStandardMaterial color="#1f3f2b" /></mesh>
      {Array.from({ length: 9 }).map((_, i) => (
        <mesh key={i} position={[-120 + i * 30, 7.5, TRACK_R + TRACK_W + 8]}><cylinderGeometry args={[0.25, 0.25, 15, 8]} /><meshStandardMaterial color="#f2efe6" /></mesh>
      ))}
      <instancedMesh ref={crowd} args={[undefined, undefined, CROWD]}>
        <capsuleGeometry args={[0.22, 0.5, 2, 6]} /><meshStandardMaterial roughness={0.8} />
      </instancedMesh>
    </group>
  );
}
function Trees() {
  const crowns = useRef<THREE.InstancedMesh>(null), trunks = useRef<THREE.InstancedMesh>(null);
  const N = 120;
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      let x: number, z: number;
      if (i < 30) { x = -TRACK_L / 2 + Math.random() * TRACK_L; z = (Math.random() * 2 - 1) * (TRACK_R - 25); }
      else { const a = Math.random() * Math.PI * 2, r = 260 + Math.random() * 200; x = Math.cos(a) * r; z = Math.sin(a) * r * 0.8 - 40; }
      const sc = 0.8 + Math.random() * 0.9;
      m.compose(p.set(x, 4 * sc + 2, z), q, s.set(sc, sc, sc)); crowns.current!.setMatrixAt(i, m);
      m.compose(p.set(x, 1.5 * sc, z), q, s.set(sc, sc, sc)); trunks.current!.setMatrixAt(i, m);
    }
    crowns.current!.instanceMatrix.needsUpdate = trunks.current!.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <group>
      <instancedMesh ref={crowns} args={[undefined, undefined, N]} castShadow><icosahedronGeometry args={[3, 1]} /><meshStandardMaterial color="#2f5a26" roughness={0.9} flatShading /></instancedMesh>
      <instancedMesh ref={trunks} args={[undefined, undefined, N]}><cylinderGeometry args={[0.25, 0.35, 3, 6]} /><meshStandardMaterial color="#4b3423" /></instancedMesh>
      {/* infield pond */}
      <mesh rotation-x={-Math.PI / 2} position={[-20, 0.04, 0]} scale={[1.6, 1, 1]}><circleGeometry args={[18, 40]} /><meshStandardMaterial color="#3e6f7d" roughness={0.15} metalness={0.3} /></mesh>
    </group>
  );
}

/* ---------- dust + mist ---------- */
const DUST = 1400;
function Dust() {
  const geo = useMemo(() => { const g = new THREE.BufferGeometry(); const a = new Float32Array(DUST * 3).fill(-100); g.setAttribute("position", new THREE.BufferAttribute(a, 3)); return g; }, []);
  const tex = useMemo(() => softTex(), []);
  const sim = useMemo(() => ({ vel: new Float32Array(DUST * 3), life: new Float32Array(DUST), next: 0 }), []);
  useFrame((_, dtR) => {
    const g = getGame(); const dt = Math.min(dtR, 0.05) * g.timeScale;
    const pos = geo.attributes.position.array as Float32Array;
    for (const h of g.horses) {
      if (h.v < 4) continue;
      const n = Math.floor(h.v * 2.2 * dt + Math.random());
      for (let k = 0; k < n; k++) {
        const i = sim.next = (sim.next + 1) % DUST;
        pos[i * 3] = h.x - h.tx * 0.9 + (Math.random() - 0.5) * 0.6; pos[i * 3 + 1] = 0.1; pos[i * 3 + 2] = h.z - h.tz * 0.9 + (Math.random() - 0.5) * 0.6;
        sim.vel[i * 3] = -h.tx * 1.5 + (Math.random() - 0.5); sim.vel[i * 3 + 1] = 0.5 + Math.random() * 0.9; sim.vel[i * 3 + 2] = -h.tz * 1.5 + (Math.random() - 0.5);
        sim.life[i] = 1 + Math.random() * 1.2;
      }
    }
    for (let i = 0; i < DUST; i++) {
      if (sim.life[i] <= 0) continue;
      sim.life[i] -= dt;
      if (sim.life[i] <= 0) { pos[i * 3 + 1] = -100; continue; }
      pos[i * 3] += sim.vel[i * 3] * dt; pos[i * 3 + 1] += sim.vel[i * 3 + 1] * dt; pos[i * 3 + 2] += sim.vel[i * 3 + 2] * dt;
      sim.vel[i * 3 + 1] -= 0.4 * dt;
    }
    geo.attributes.position.needsUpdate = true;
  });
  return <points geometry={geo} frustumCulled={false}><pointsMaterial map={tex} size={1.1} color="#c4a37d" transparent opacity={0.4} depthWrite={false} /></points>;
}
function Mist() {
  const tex = useMemo(() => softTex(), []);
  const ref = useRef<THREE.Group>(null);
  const sheets = useMemo(() => Array.from({ length: 14 }, (_, i) => { const p = trackPoint((i / 14) * PERIM, TRACK_W / 2 + (Math.random() - 0.5) * 30); return [p.x, 0.5 + Math.random() * 1.2, p.z, 40 + Math.random() * 50] as const; }), []);
  useFrame((st) => { ref.current!.children.forEach((c, i) => { c.position.x = sheets[i][0] + Math.sin(st.clock.elapsedTime * 0.05 + i) * 8; }); });
  return (
    <group ref={ref}>
      {sheets.map(([x, y, z, s], i) => (
        <mesh key={i} position={[x, y, z]} rotation-x={-Math.PI / 2}><planeGeometry args={[s, s]} /><meshBasicMaterial map={tex} color="#f1ece0" transparent opacity={0.14} depthWrite={false} /></mesh>
      ))}
    </group>
  );
}

/* ---------- light + camera ---------- */
function Sun() {
  const light = useRef<THREE.DirectionalLight>(null);
  const { scene } = useThree();
  useLayoutEffect(() => { scene.add(light.current!.target); }, [scene]);
  useFrame(() => {
    const h = getGame().horses[leaderIdx()];
    light.current!.position.set(h.x - 50, 70, h.z + 35); light.current!.target.position.set(h.x, 0, h.z); light.current!.target.updateMatrixWorld();
  });
  return (
    <directionalLight ref={light} castShadow intensity={2.6} color="#ffe6c2" shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
      shadow-camera-left={-40} shadow-camera-right={40} shadow-camera-top={40} shadow-camera-bottom={-40} shadow-camera-far={250} />
  );
}

function CameraRig() {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3(0, 1, TRACK_R));
  const pos = useMemo(() => new THREE.Vector3(), []), tgt = useMemo(() => new THREE.Vector3(), []);
  useFrame((st, dtR) => {
    const g = getGame(); const dt = Math.min(dtR, 0.05); const t = st.clock.elapsedTime;
    let mode = g.cam; if (g.state === "photo") mode = "finish";
    const L = g.horses[leaderIdx()];
    const lp = trackPoint(FINISH_S + L.d, TRACK_W / 2);
    let fov = 50, snap = false;
    const probe = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("rider") : null;
    if (probe) {
      const h = g.horses[g.playerIdx];
      const p = trackPoint(FINISH_S + h.d, laneOffset(h.lane));
      const rear = probe === "back";
      pos.set(h.x - h.tx * (rear ? 4 : 1.4) + p.nx * (rear ? 2 : 4.8), 3.0, h.z - h.tz * (rear ? 4 : 1.4) + p.nz * (rear ? 2 : 4.8));
      tgt.set(h.x + h.tx * .25, 1.65, h.z + h.tz * .25);
      camera.position.copy(pos); camera.lookAt(tgt);
      const pc = camera as THREE.PerspectiveCamera; pc.fov = 38; pc.updateProjectionMatrix();
      return;
    }
    if (g.state === "betting") {
      const c = trackPoint(FINISH_S, TRACK_W / 2);
      pos.set(c.x + Math.sin(t * 0.12) * 26, 7, c.z + Math.cos(t * 0.12) * 20); tgt.set(c.x, 1.4, c.z);
    } else if (g.state === "gate" && mode !== "helmet") {
      // Side-on view of the gate: flat-drawn horses must be seen from the side, never head-on.
      const c = trackPoint(FINISH_S - 4, TRACK_W + 13); const m = trackPoint(FINISH_S + 1, TRACK_W / 2);
      pos.set(c.x, 5, c.z); tgt.set(m.x, 1.3, m.z);
    } else if (mode === "track") {
      pos.set(L.x - L.tx * 5 - lp.nx * 13, 4.2, L.z - L.tz * 5 - lp.nz * 13); tgt.set(L.x + L.tx * 3, 1.4, L.z + L.tz * 3);
    } else if (mode === "broadcast") {
      const s = trackPoint(FINISH_S + L.d - 6, TRACK_W + 16); pos.set(s.x, 7, s.z); tgt.set(lp.x - L.tx * 4, 1.4, lp.z - L.tz * 4); fov = 38;
    } else if (mode === "helmet") {
      const h = g.horses[g.playerIdx]; const amp = Math.min(1, h.v / 9);
      const bob = Math.abs(Math.sin(h.phase * Math.PI * 2)) * 0.06 * amp + (h.whipping ? Math.sin(t * 16) * 0.03 : 0);
      pos.set(h.x + h.tx * 0.55, 2.7 + bob, h.z + h.tz * 0.55); tgt.set(h.x + h.tx * 25, 1.7, h.z + h.tz * 25); fov = 72; snap = true;
    } else if (mode === "drone") {
      pos.set(L.x - L.tx * 18, 48, L.z - L.tz * 18); tgt.set(L.x, 0, L.z);
    } else {
      const s = trackPoint(FINISH_S, TRACK_W + 12), m = trackPoint(FINISH_S, TRACK_W / 2); pos.set(s.x, 2.6, s.z); tgt.set(m.x, 1.3, m.z); fov = g.state === "photo" ? 24 : 34;
    }
    const k = snap ? 1 : 1 - Math.exp(-3.5 * dt);
    camera.position.lerp(pos, k); look.current.lerp(tgt, snap ? 1 : k); camera.lookAt(look.current);
    const pc = camera as THREE.PerspectiveCamera; pc.fov += (fov - pc.fov) * (snap ? 1 : k); pc.updateProjectionMatrix();
  });
  return null;
}

function Ready({ onReady }: { onReady: () => void }) {
  const done = useRef(0);
  useFrame(() => { if (done.current++ === 2) onReady(); });
  return null;
}

export default function RaceScene({ onReady }: { onReady: () => void }) {
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ fov: 50, near: 0.1, far: 2500, position: [70, 8, 110] }} gl={{ antialias: true }}>
      <Stepper />
      <color attach="background" args={["#c7d7df"]} />
      <fog attach="fog" args={["#d8d2c0", 140, 750]} />
      <Sky sunPosition={[-100, 35, 60]} turbidity={6} rayleigh={1.4} mieCoefficient={0.006} mieDirectionalG={0.86} distance={4000} />
      <hemisphereLight args={["#dfe9f3", "#5a4a32", 0.65]} />
      <Sun />
      <Environment resolution={128}>
        <Lightformer intensity={2} position={[0, 5, 0]} scale={[10, 10, 1]} rotation-x={Math.PI / 2} />
        <Lightformer intensity={1} color="#ffd9a8" position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
      </Environment>
      <Track />
      <Gate />
      <Stands />
      <Trees />
      {HORSES.map((_, i) => <FlatHorse key={i} idx={i} />)}
      <Dust />
      <Mist />
      <CameraRig />
      <Ready onReady={onReady} />
    </Canvas>
  );
}

export { laneOffset };
