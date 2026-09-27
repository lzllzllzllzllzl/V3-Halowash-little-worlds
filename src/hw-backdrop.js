/* Near-white monochrome street backdrop for the overview page: soft white
 * sky gradient, camera-adaptive fog, a procedurally painted ground (light
 * concrete sidewalks, dark crossroads with rounded intersection corners,
 * wide zebra crossings, stop lines) that fades into the sky at its edges
 * and receives real shadows, plus a ring of pale distant towers for depth. */
import * as THREE from "three";

export const FOG_COLOR = 0xeef0f2;

function skyTexture() {
  const cnv = document.createElement("canvas");
  cnv.width = 2; cnv.height = 512;
  const cx = cnv.getContext("2d");
  const g = cx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.00, "#dfe4e8");   /* zenith */
  g.addColorStop(0.55, "#e9edf0");
  g.addColorStop(1.00, "#eef0f2");   /* horizon (== fog color) */
  cx.fillStyle = g;
  cx.fillRect(0, 0, 2, 512);
  const tex = new THREE.CanvasTexture(cnv);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* Street grid painted on a square world-space canvas: light concrete
 * sidewalks with faint paving joints, a dark crossroads whose inner
 * corners are filleted, bright zebra crossings and stop lines. The ground
 * fades to the sky color near its edges so the plane boundary is
 * invisible at any camera distance. */
function groundTexture(sizeUnits) {
  const S = 2048;
  const px = S / sizeUnits;                       /* px per world unit */
  const cnv = document.createElement("canvas");
  cnv.width = cnv.height = S;
  const cx = cnv.getContext("2d");
  const u = v => v * px;                          /* world units -> px */
  const center = S / 2;
  const H = sizeUnits / 2;
  const RH = 2.05;                                /* road half width, units */
  const RC = 1.5;                                 /* intersection corner fillet */

  /* light concrete base */
  cx.fillStyle = "#e9ecee";
  cx.fillRect(0, 0, S, S);

  /* faint paving joints on the sidewalks (roads get painted over) */
  cx.strokeStyle = "rgba(148,156,163,.15)";
  cx.lineWidth = Math.max(1, u(.05));
  cx.beginPath();
  for (let d = -H + 1.15; d <= H; d += 2.3) {
    cx.moveTo(center + u(d), 0); cx.lineTo(center + u(d), S);
    cx.moveTo(0, center + u(d)); cx.lineTo(S, center + u(d));
  }
  cx.stroke();

  /* road cross as one path with rounded inner corners (all in px) */
  const RHpx = u(RH), RCpx = u(RC), hxpx = u(H + 1);
  const p = new Path2D();
  p.moveTo(-hxpx, -RHpx);
  p.arcTo(-RHpx, -RHpx, -RHpx, -hxpx, RCpx);
  p.lineTo(-RHpx, -hxpx); p.lineTo(RHpx, -hxpx);
  p.arcTo(RHpx, -RHpx, hxpx, -RHpx, RCpx);
  p.lineTo(hxpx, -RHpx); p.lineTo(hxpx, RHpx);
  p.arcTo(RHpx, RHpx, RHpx, hxpx, RCpx);
  p.lineTo(RHpx, hxpx); p.lineTo(-RHpx, hxpx);
  p.arcTo(-RHpx, RHpx, -hxpx, RHpx, RCpx);
  p.lineTo(-hxpx, RHpx);
  p.closePath();

  cx.save();
  cx.translate(center, center);

  /* asphalt */
  cx.fillStyle = "#4b5054";
  cx.fill(p);

  /* mottling + fine speckle so the asphalt doesn't read as flat fill */
  cx.save();
  cx.clip(p);
  for (let i = 0; i < 110; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.random() * 50;
    const r = u(1.5 + Math.random() * 4);
    const x = Math.cos(a) * rr * px, y = Math.sin(a) * rr * px;
    const g2 = cx.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() < .5;
    g2.addColorStop(0, dark ? "rgba(46,50,54,.14)" : "rgba(132,138,144,.13)");
    g2.addColorStop(1, "rgba(0,0,0,0)");
    cx.fillStyle = g2;
    cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
  }
  for (let i = 0; i < 30000; i++) {
    const v = 72 + Math.random() * 78 | 0;
    cx.fillStyle = `rgba(${v},${v + 3},${v + 7},${Math.random() * .13})`;
    cx.fillRect(Math.random() * S - center, Math.random() * S - center, 1.5, 1.5);
  }
  cx.restore();

  /* curbs follow the road outline */
  cx.lineWidth = u(.17);
  cx.strokeStyle = "#d3d8dc";
  cx.stroke(p);

  /* wide zebra crossings on the four approaches */
  const ZD = 2.0, Z_OFF = RH + .5;                /* depth / offset from centre */
  const M = .34, BW = .5, BG = .42;               /* margin, bar width, gap */
  cx.fillStyle = "#f5f7f8";
  for (const dir of [-1, 1]) {
    const x0 = dir * u(Z_OFF), wpx = u(ZD);
    for (let y = u(-RH + M); y + u(BW) <= u(RH - M) + .01; y += u(BW + BG))
      cx.fillRect(Math.min(x0, x0 + dir * wpx), y, wpx, u(BW));       /* across the E-W road */
    for (let x = u(-RH + M); x + u(BW) <= u(RH - M) + .01; x += u(BW + BG))
      cx.fillRect(x, Math.min(x0, x0 + dir * wpx), u(BW), wpx);       /* across the N-S road */
  }
  /* stop lines just before each crossing */
  cx.fillStyle = "#f0f3f4";
  for (const dir of [-1, 1]) {
    const q = dir * u(Z_OFF + ZD + .5);
    cx.fillRect(q, u(-RH + M), dir * u(.26), u(RH * 2 - 2 * M));
    cx.fillRect(u(-RH + M), q, u(RH * 2 - 2 * M), dir * u(.26));
  }
  cx.restore();

  /* radial fade to sky color near the edges of the ground plane */
  const fade = cx.createRadialGradient(center, center, S * .30, center, center, S * .495);
  fade.addColorStop(0, "rgba(238,240,242,0)");
  fade.addColorStop(1, "rgba(238,240,242,1)");
  cx.fillStyle = fade;
  cx.fillRect(0, 0, S, S);

  const tex = new THREE.CanvasTexture(cnv);
  tex.anisotropy = 8;
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createBackdrop(scene) {
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(FOG_COLOR, 45, 110);

  /* street ground, receives the dioramas' shadows */
  const GROUND = 160;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND, GROUND),
    new THREE.MeshStandardMaterial({ map: groundTexture(GROUND), roughness: .96 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  /* distant skyline: pale gray tower slabs plus a few far white high-rises,
   * softened by fog — the printed-backdrop feel of the key visual.
   * Each block fades out as the camera gets near it, so the ring only
   * ever reads as a far-side skyline at any zoom or orientation. */
  const shades = [0xc9ced4, 0xbfc6cc, 0xd4d9de, 0xb6bdc4, 0xcdd3d8];
  const ring = new THREE.Group();
  const blocks = [];
  function block(x, z, w, d, h, color) {
    const mat = new THREE.MeshStandardMaterial({
      color, roughness: .95, transparent: true, opacity: 0
    });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, h / 2, z);
    b.rotation.y = Math.random() * Math.PI;
    ring.add(b);
    blocks.push(b);
  }
  const N = 40;
  for (let i = 0; i < N; i++) {
    const a = (i + Math.random() * .7) / N * Math.PI * 2;
    const r = 66 + Math.random() * 12;
    const w = 2.5 + Math.random() * 2, d = 2.5 + Math.random() * 1.5;
    const h = Math.random() < .3 ? 16 + Math.random() * 12 : 7 + Math.random() * 9;
    block(Math.cos(a) * r, Math.sin(a) * r, w, d, h, shades[i % shades.length]);
  }
  const T = 10;
  for (let i = 0; i < T; i++) {
    const a = (i + Math.random() * .5) / T * Math.PI * 2;
    const r = 86 + Math.random() * 16;
    block(Math.cos(a) * r, Math.sin(a) * r,
      3.5 + Math.random() * 2, 3 + Math.random() * 1.5, 34 + Math.random() * 22,
      0xdadfe3);
  }
  scene.add(ring);

  /* fog follows the camera distance so the models stay crisp while the
   * skyline and ground edge stay hazed at any zoom or orientation */
  const v3 = new THREE.Vector3();
  function setDistance(cd, camPos) {
    scene.fog.near = cd * 1.5;
    scene.fog.far = cd * 3.4;
    for (const b of blocks) {
      const d = v3.copy(b.position).distanceTo(camPos);
      b.material.opacity = THREE.MathUtils.smoothstep(d, cd * .8, cd * 1.15) * .85;
    }
  }
  function update() {}
  return { update, setDistance };
}
