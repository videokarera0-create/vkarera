import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getGame, HORSES } from "@/game/sim";
import { driveCycle, finishDrive } from "@/game/rider-motion";
import { CH, CW, GROUND, drawFlatHorse, type FlatLook } from "./flat-horse-draw";

// Plane size in metres; canvas ground line sits on the track.
const W = 4.4, H = W * CH / CW;

export default function FlatHorse({ idx }: { idx: number }) {
  const def = HORSES[idx];
  const group = useRef<THREE.Group>(null), sprite = useRef<THREE.Mesh>(null), shadow = useRef<THREE.Mesh>(null);
  const last = useRef(-1);
  const res = useMemo(() => {
    const canvas = document.createElement("canvas"); canvas.width = CW; canvas.height = CH;
    const ctx = canvas.getContext("2d")!;
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: .35, side: THREE.DoubleSide });
    const shadowMat = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: .28, depthWrite: false });
    const look: FlatLook = { coat: def.coat, mane: def.mane, silk: def.silk, silk2: def.silk2, num: def.num, blaze: idx % 3 === 0, socks: idx % 2 === 1 };
    return { ctx, tex, mat, shadowMat, look };
  }, [def, idx]);
  useEffect(() => () => { res.tex.dispose(); res.mat.dispose(); res.shadowMat.dispose(); }, [res]);

  useFrame(({ camera, clock }) => {
    const g = getGame(), h = g.horses[idx];
    if (!group.current || !sprite.current || !shadow.current) return;
    group.current.position.set(h.x, 0, h.z);
    shadow.current.rotation.z = h.heading;
    // Billboard around the vertical axis, and face the way the horse is running on screen.
    // The drawing lies along the horse's running direction (never sideways to the track).
    // Pick the side facing the camera, then turn it at most ~30° toward the camera so it never vanishes edge-on.
    const dx = camera.position.x - h.x, dz = camera.position.z - h.z;
    const flip = dx * Math.sin(h.heading) + dz * Math.cos(h.heading) < 0;
    const base = h.heading + (flip ? Math.PI : 0);
    let diff = Math.atan2(dx, dz) - base;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    sprite.current.rotation.y = base + THREE.MathUtils.clamp(diff, -.35, .35);
    const t = clock.elapsedTime;
    if (t - last.current < 1 / 30) return;
    last.current = t;
    drawFlatHorse(res.ctx, res.look, {
      phase: h.phase, amp: Math.min(1, h.v / 9), driving: finishDrive(h),
      strike: driveCycle(g.time, idx) ** 2, time: g.time, flip,
    });
    res.tex.needsUpdate = true;
  });

  return <group ref={group} name={`Horse-${def.num}`}>
    <mesh ref={shadow} rotation-x={-Math.PI / 2} position-y={.03} scale={[1.6, .45, 1]} material={res.shadowMat}><circleGeometry args={[1, 24]} /></mesh>
    <mesh ref={sprite} position-y={H / 2 - H * (CH - GROUND) / CH} material={res.mat}><planeGeometry args={[W, H]} /></mesh>
  </group>;
}
