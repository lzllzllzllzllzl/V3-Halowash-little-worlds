/* HaloWash overview page bootstrap: four scene dioramas (GLB, one per care
 * scenario) stand on light concrete plazas around a rounded crossroads,
 * labelled by white callout pills (HTML overlay) that link to each live
 * scene. Bundled to an IIFE exposing window.HWIndex.start(config). The
 * Draco decoder ships inside the bundle as data URIs; the GLB dioramas
 * load from models/ over HTTP (pages are served from GitHub Pages). */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import dracoWasm from "./draco-data/draco_decoder.wasm.js";
import dracoWrapper from "./draco-data/draco_wasm_wrapper.js";
import { createBackdrop } from "./hw-backdrop.js";

const START_THETA = 45;     /* camera azimuth the fronts are composed against */
const START_PHI = 46;       /* camera elevation: high, plan-like, as in the key visual */
const AUTO_SPIN = 0.45;
const CELLS = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
const SLAB_HALF = 6.15;     /* plaza slab half side */
const SLAB_TOP = .23;       /* slab surface height (extrude depth + bevel) */

/* GLB diorama per world key; a world may override via its config `model` */
const MODEL_URLS = {
  home: "models/home-main.glb",     /* 居家护理 */
  ward: "models/ward-main.glb",     /* 病房护理 */
  garden: "models/garden-main.glb", /* 养老院护理 */
  salon: "models/salon-main.glb"    /* 头皮沙龙 */
};
const TREE_MODEL_URL = "models/tree-main.glb"; /* street trees, height-normalized */
const TREE_H = 2.4;                            /* matches the old procedural trees */

/* ------------------------------------- white callout pills (3D sprites) */
const ICON_PATHS = {
  home: ["M4 11.4 12 4.8l8 6.6", "M6.3 10.4v8.2h11.4v-8.2"],
  cross: ["M12 5.6v12.8", "M5.6 12h12.8"],
  face: ["M8.9 13.6c.8 1.2 1.9 1.9 3.1 1.9s2.3-.7 3.1-1.9", "M9.4 9.9h.01", "M14.6 9.9h.01"],
  salon: ["M8 8.3 19 16.5", "M8 15.7 19 7.5"]
};

/* One billboard per building: white pill (icon disc, title, subtitle,
 * chevron) with a thin stem down to an anchor dot on the roofline. Drawn
 * as a canvas texture so it stays crisp and immune to DOM compositing. */
function makeCalloutMesh(name, desc, iconKey) {
  const W = 720, H = 300;
  const cnv = document.createElement("canvas");
  cnv.width = W; cnv.height = H;
  const cx = cnv.getContext("2d");

  /* stem + anchor dot */
  cx.strokeStyle = "#c3cad1"; cx.lineWidth = 3;
  cx.beginPath(); cx.moveTo(W / 2, 120); cx.lineTo(W / 2, 244); cx.stroke();
  cx.beginPath(); cx.arc(W / 2, 256, 10, 0, Math.PI * 2);
  cx.fillStyle = "#ffffff"; cx.fill();
  cx.strokeStyle = "#aab2ba"; cx.stroke();

  /* pill */
  cx.save();
  cx.shadowColor = "rgba(40,50,60,.20)";
  cx.shadowBlur = 16; cx.shadowOffsetY = 5;
  cx.beginPath();
  if (cx.roundRect) cx.roundRect(10, 10, W - 20, 110, 55);
  else cx.rect(10, 10, W - 20, 110);
  cx.fillStyle = "#ffffff"; cx.fill();
  cx.restore();
  cx.lineWidth = 2; cx.strokeStyle = "#e6e9ec"; cx.stroke();

  /* icon in a periwinkle disc */
  const cxI = 74, cyI = 65, rI = 30;
  cx.beginPath(); cx.arc(cxI, cyI, rI, 0, Math.PI * 2);
  cx.fillStyle = "#b7bad3"; cx.fill();
  cx.save();
  cx.translate(cxI - 15, cyI - 15);
  cx.scale(30 / 24, 30 / 24);
  cx.strokeStyle = "#ffffff"; cx.lineWidth = 2 * (24 / 30);
  cx.lineCap = "round"; cx.lineJoin = "round";
  if (iconKey === "face") { cx.beginPath(); cx.arc(12, 12, 7.6, 0, Math.PI * 2); cx.stroke(); }
  if (iconKey === "salon") {
    cx.beginPath(); cx.arc(6.3, 6.9, 2, 0, Math.PI * 2); cx.stroke();
    cx.beginPath(); cx.arc(6.3, 17.1, 2, 0, Math.PI * 2); cx.stroke();
  }
  for (const d of (ICON_PATHS[iconKey] || ICON_PATHS.home)) cx.stroke(new Path2D(d));
  cx.restore();

  /* texts */
  cx.textBaseline = "middle";
  cx.fillStyle = "#23282e";
  cx.font = "700 38px 'Microsoft YaHei','PingFang SC',sans-serif";
  cx.fillText(name, 124, 50);
  cx.fillStyle = "#8d949b";
  cx.font = "400 25px 'Microsoft YaHei','PingFang SC',sans-serif";
  if (desc) cx.fillText(desc, 124, 93);
  cx.fillStyle = "#b9bfc6";
  cx.font = "400 46px system-ui,sans-serif";
  cx.textAlign = "center";
  cx.fillText("›", 668, 63);

  const tex = new THREE.CanvasTexture(cnv);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const PLANE_W = 8.2, PLANE_H = PLANE_W * H / W;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(PLANE_W, PLANE_H),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false, toneMapped: false })
  );
  mesh.renderOrder = 10;
  /* anchor dot sits at canvas y 256; keep it at the building-top anchor */
  mesh.userData.dotOffset = (0.5 - 256 / H) * PLANE_H;
  return mesh;
}

/* ------------------------------------------------- plaza slab + greenery */
function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

const MATS = {
  slab: new THREE.MeshStandardMaterial({ color: 0xe3e7ea, roughness: .93 }),
  bark: new THREE.MeshStandardMaterial({ color: 0x63686d, roughness: .95 }),
  leafA: new THREE.MeshStandardMaterial({ color: 0x6d7a70, roughness: 1 }),
  leafB: new THREE.MeshStandardMaterial({ color: 0x5f6d63, roughness: 1 }),
  hedge: new THREE.MeshStandardMaterial({ color: 0x7a9455, roughness: 1 }),
  planter: new THREE.MeshStandardMaterial({ color: 0xd5d9dc, roughness: .92 })
};

let treeProto = null;                        /* prepared GLB street tree */

function makeTree() {
  const g = new THREE.Group();
  if (treeProto) {                             /* GLB street tree, height-normalized */
    const t = treeProto.clone(true);
    t.rotation.y = Math.random() * Math.PI * 2;
    t.scale.multiplyScalar(.85 + Math.random() * .3);
    g.add(t);
    return g;
  }
  /* procedural fallback while / if the GLB tree is unavailable */
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.1, .15, 1.15, 7), MATS.bark);
  trunk.position.y = .58;
  const blob1 = new THREE.Mesh(new THREE.IcosahedronGeometry(.8, 1), MATS.leafA);
  blob1.position.y = 1.62; blob1.scale.set(1, .82, 1);
  const blob2 = new THREE.Mesh(new THREE.IcosahedronGeometry(.52, 1), MATS.leafB);
  blob2.position.y = 2.18; blob2.scale.set(1, .8, 1);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .12, 12), MATS.planter);
  pot.position.y = .06;
  for (const m of [trunk, blob1, blob2]) { m.castShadow = true; m.receiveShadow = true; }
  pot.receiveShadow = true;
  g.add(trunk, blob1, blob2, pot);
  return g;
}

/* prepare the GLB tree once: height-normalize, base on y=0 */
function prepTreeProto(src) {
  const t = src.clone(true);
  const box3 = new THREE.Box3().setFromObject(t);
  const size = box3.getSize(new THREE.Vector3());
  const s = TREE_H / size.y;
  t.scale.setScalar(s);
  t.position.y = -box3.min.y * s;
  const g = new THREE.Group();
  g.add(t);
  return g;
}

/* rows of small trees on the sidewalk band along the four street arms,
 * plus one at each rounded corner of the intersection */
function addStreetTrees(scene) {
  const g = new THREE.Group();
  const off = 2.72;                            /* between curb and plaza edge */
  const stops = [5.9, 9.1, 12.3];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    for (const d of stops) {
      const t1 = makeTree();
      t1.position.set(sx * off, 0, sz * d);
      const t2 = makeTree();
      t2.position.set(sz * d, 0, sx * off);
      for (const t of [t1, t2]) {
        t.rotation.y = Math.random() * Math.PI * 2;
        t.scale.setScalar(.85 + Math.random() * .3);
        g.add(t);
      }
    }
    const c = makeTree();                      /* intersection corner tree */
    c.position.set(sx * off, 0, sz * off);
    c.rotation.y = Math.random() * Math.PI * 2;
    g.add(c);
  }
  scene.add(g);
}

function addHedges(unit) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const L = SLAB_HALF * 2 - 2.4, off = SLAB_HALF - .5;
  for (const [x, z, w, d] of [[0, off, L, .34], [0, -off, L, .34], [off, 0, .34, L], [-off, 0, .34, L]]) {
    const m = new THREE.Mesh(geo, MATS.hedge);
    m.scale.set(w, .4, d);
    m.position.set(x, SLAB_TOP + .2, z);
    m.castShadow = true; m.receiveShadow = true;
    unit.add(m);
  }
}

/* --------------------------------------------------------------- start */
async function start(config) {
  const canvas = document.getElementById("world");
  const fallback = document.getElementById("fallback");
  const worlds = config.worlds;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    fallback.hidden = false;
    document.getElementById("loading")?.remove();
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  const backdrop = createBackdrop(scene);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.46;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 600);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = .07;
  controls.enablePan = false;
  controls.rotateSpeed = .55;
  controls.zoomSpeed = .8;
  controls.minPolarAngle = Math.PI * .14;
  controls.maxPolarAngle = Math.PI * .49;
  controls.autoRotate = true;
  controls.autoRotateSpeed = AUTO_SPIN;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfd4d8, .78));
  const key = new THREE.DirectionalLight(0xffffff, 2.9);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xeef2f5, .7);
  scene.add(rim);

  /* load the four GLB dioramas (Draco-compressed) */
  const draco = new DRACOLoader();
  const decoderFiles = {
    "draco_decoder.wasm": dracoWasm,
    "draco_wasm_wrapper.js": dracoWrapper
  };
  draco.setDecoderPath("");
  draco._loadLibrary = function (url, responseType) {
    const uri = decoderFiles[url];
    if (!uri) return Promise.reject(new Error("missing decoder file " + url));
    return fetch(uri).then(r => responseType === "arraybuffer" ? r.arrayBuffer() : r.text());
  };
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  let gltfs, treeGltf;
  try {
    [gltfs, treeGltf] = await Promise.all([
      Promise.all(worlds.map(w => loader.loadAsync(w.model || MODEL_URLS[w.key]))),
      loader.loadAsync(TREE_MODEL_URL).catch(e => { console.error("tree model:", e); return null; })
    ]);
  } catch (e) {
    console.error(e);
    fallback.hidden = false;
    document.getElementById("loading")?.remove();
    return;
  }
  if (treeGltf) treeProto = prepTreeProto(treeGltf.scene);

  /* normalize each diorama onto its plaza + white callout pill. Yaw is set
   * before measuring: footprint then refers to the ROTATED footprint, so
   * the GLB's own base pad (whose corners swing out under a 45° yaw) stays
   * on the plaza and every diorama fills its slab uniformly. */
  const items = worlds.map((w, i) => {
    const model = gltfs[i].scene;
    model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    model.rotation.y = THREE.MathUtils.degToRad(START_THETA - 180 + (w.yaw || 0));
    const box3 = new THREE.Box3().setFromObject(model);
    const size = box3.getSize(new THREE.Vector3());
    const center = box3.getCenter(new THREE.Vector3());
    const foot = w.footprint || 11.2;
    const s = foot / Math.max(size.x, size.z);
    const wrap = new THREE.Group();
    const unit = new THREE.Group();
    model.scale.setScalar(s);
    model.position.set(-center.x * s, -box3.min.y * s + SLAB_TOP + .015, -center.z * s);
    unit.add(model);
    /* light concrete plaza with rounded corners, reaching the curb line */
    const slab = new THREE.Mesh(
      new THREE.ExtrudeGeometry(roundedRectShape(SLAB_HALF * 2, SLAB_HALF * 2, 1.0),
        { depth: .2, bevelEnabled: true, bevelThickness: .025, bevelSize: .03, bevelSegments: 2, curveSegments: 10 }),
      MATS.slab
    );
    slab.rotation.x = -Math.PI / 2;
    slab.receiveShadow = true;
    unit.add(slab);
    addHedges(unit);
    wrap.add(unit);
    const anchorY = size.y * s + .35;          /* pill dot floats just above the roof */
    const callout = makeCalloutMesh(w.name, w.desc, w.icon);
    callout.position.y = anchorY - callout.userData.dotOffset;
    wrap.add(callout);
    scene.add(wrap);
    return { wrap, unit, model, callout, spec: w, index: i };
  });

  /* rows of street trees on the sidewalk band */
  addStreetTrees(scene);

  /* layout: landscape 2×2, portrait tightened */
  let portrait = null;
  const homePos = new THREE.Vector3();
  let userMoved = false;
  function layout() {
    const p = camera.aspect < 0.9;
    const changed = p !== portrait;
    portrait = p;
    const gap = p ? 16.2 : 18.7;
    const us = p ? .8 : 1;
    for (const it of items) {
      const [cx, cz] = CELLS[it.index];
      it.wrap.position.set(cx * gap / 2, 0, cz * gap / 2);
      if (it.unitScale !== us) {
        it.unitScale = us;
        it.unit.scale.setScalar(us);
      }
    }
    scene.updateMatrixWorld(true);
    const gridBox = new THREE.Box3();
    for (const it of items)
      gridBox.union(new THREE.Box3().setFromObject(it.wrap));
    const center = gridBox.getCenter(new THREE.Vector3());
    const sph = new THREE.Sphere();
    gridBox.getBoundingSphere(sph);
    if (!userMoved || changed) {
      const vfov = THREE.MathUtils.degToRad(camera.fov);
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
      const dist = sph.radius / Math.sin(Math.min(vfov, hfov) / 2) * (p ? 0.98 : 0.86);
      const spherical = new THREE.Spherical(dist, THREE.MathUtils.degToRad(START_PHI), THREE.MathUtils.degToRad(START_THETA));
      camera.position.copy(center).add(new THREE.Vector3().setFromSpherical(spherical));
      controls.target.copy(center);
      controls.minDistance = dist * .3;
      controls.maxDistance = dist * 1.9;
      controls.update();
      homePos.copy(camera.position);
    }
    const gs = sph.radius;
    key.shadow.camera.left = -gs; key.shadow.camera.right = gs;
    key.shadow.camera.top = gs; key.shadow.camera.bottom = -gs;
    key.shadow.camera.near = .1; key.shadow.camera.far = gs * 8;
    key.shadow.bias = -.0004;
    key.position.copy(center).add(new THREE.Vector3(gs * .9, gs * 1.4, gs * .6));
    key.target.position.copy(center);
    key.shadow.camera.updateProjectionMatrix();
    rim.position.copy(center).add(new THREE.Vector3(-gs, gs * 1.2, -gs));
    return changed;
  }

  function resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    layout();
  }
  window.addEventListener("resize", resize, { passive: true });
  resize();

  /* HUD */
  const pauseBtn = document.getElementById("pause");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let paused = reduced;
  function applyPaused() {
    controls.autoRotate = !paused && !userMoved;
    pauseBtn.textContent = paused ? "▶ 播放" : "⏸ 暂停";
    pauseBtn.setAttribute("aria-pressed", String(paused));
  }
  controls.addEventListener("start", () => { userMoved = true; controls.autoRotate = false; canvas.dataset.view = "interactive"; });
  pauseBtn.addEventListener("click", () => { paused = !paused; applyPaused(); });
  applyPaused();

  /* click-to-enter on the dioramas themselves */
  const raycaster = new THREE.Raycaster();
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(
      (e.clientX - r.left) / r.width * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    ), camera);
    const hits = raycaster.intersectObjects(items.map(i => i.wrap), true);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o.parent && !items.some(i => i.wrap === o)) o = o.parent;
    return items.find(i => i.wrap === o) || null;
  }
  canvas.addEventListener("click", e => {
    const it = pick(e);
    if (it) location.href = it.spec.href;
  });
  canvas.addEventListener("pointermove", e => {
    canvas.style.cursor = pick(e) ? "pointer" : "grab";
  });
  window.addEventListener("keydown", e => {
    if (e.key === " ") { e.preventDefault(); paused = !paused; applyPaused(); }
    if (e.key === "Escape") {
      controls.target.set(0, controls.target.y, 0);
      camera.position.copy(homePos);
      controls.update();
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      const off = camera.position.clone().sub(controls.target);
      const sp = new THREE.Spherical().setFromVector3(off);
      if (e.key === "ArrowLeft") sp.theta -= .075;
      if (e.key === "ArrowRight") sp.theta += .075;
      if (e.key === "ArrowUp") sp.phi -= .065;
      if (e.key === "ArrowDown") sp.phi += .065;
      sp.phi = THREE.MathUtils.clamp(sp.phi, controls.minPolarAngle, controls.maxPolarAngle);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sp));
      controls.update();
    }
  });

  /* callout pills billboard toward the camera; stem + dot stay pinned
   * to the roofline anchor */
  renderer.setAnimationLoop(() => {
    const cd = camera.position.distanceTo(controls.target);
    backdrop.setDistance(cd, camera.position);
    backdrop.update();
    for (const it of items) it.callout.quaternion.copy(camera.quaternion);
    controls.update();
    renderer.render(scene, camera);
  });

  canvas.classList.add("ready");
  document.getElementById("loading")?.remove();

  canvas.addEventListener("webglcontextlost", e => {
    e.preventDefault();
    fallback.hidden = false;
  });
  renderer.domElement.addEventListener("webglcontextrestored", () => location.reload());
}

window.HWIndex = { start };
