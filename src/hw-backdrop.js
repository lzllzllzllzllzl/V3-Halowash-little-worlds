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
  g.addColorStop(0.00, "#d9dee2");   /* zenith */
  g.addColorStop(0.55, "#e6eaed");
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
  cx.fillStyle = "#3f444a";
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
    g2.addColorStop(0, dark ? "rgba(38,42,47,.16)" : "rgba(126,132,139,.14)");
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

  /* distant skyline: a few large, high-contrast prismatic slabs — light
   * off-white volumes against a deep anthracite wall — the studio-lit
   * studio-backdrop look of the key visual. Only a handful of masses, so
   * the silhouettes stay graphic instead of reading as noise.
   * Each block fades out as the camera gets near it, so the ring only
   * ever reads as a far-side skyline at any zoom or orientation. */
  const ring = new THREE.Group();
  const blocks = [];
  function block(x, z, w, d, h, color, rotY) {
    const mat = new THREE.MeshStandardMaterial({
      color, roughness: .88, transparent: true, opacity: 0
    });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, h / 2, z);
    b.rotation.y = rotY ?? Math.random() * Math.PI;
    ring.add(b);
    blocks.push(b);
  }
  /* near ring: pale concrete masses, tall enough to read as walls */
  const NEAR_SHADES = [0xe8ebee, 0xdfe3e7, 0xd6dbdf, 0xcdd2d7];
  const N = 14;
  for (let i = 0; i < N; i++) {
    const a = (i + Math.random() * .45) / N * Math.PI * 2;
    const r = 58 + Math.random() * 16;
    block(Math.cos(a) * r, Math.sin(a) * r,
      5 + Math.random() * 5, 4 + Math.random() * 4,
      11 + Math.random() * 11, NEAR_SHADES[i % NEAR_SHADES.length]);
  }
  /* far ring: near-black anthracite monoliths — hard silhouette contrast */
  const DARK = [0x24282d, 0x2e3339, 0x1c2024];
  const T = 7;
  for (let i = 0; i < T; i++) {
    const a = (i + Math.random() * .5) / T * Math.PI * 2;
    const r = 76 + Math.random() * 14;
    block(Math.cos(a) * r, Math.sin(a) * r,
      5 + Math.random() * 4, 4 + Math.random() * 3,
      26 + Math.random() * 24, DARK[i % DARK.length]);
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
