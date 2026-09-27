/* HaloWash scene pages shared bootstrap.
 * Bundled to an IIFE exposing window.HWScene.start(config).
 * Draco decoder ships inside the bundle as data URIs so pages
 * also work when opened directly from disk (file://). */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import dracoWasm from "./draco-data/draco_decoder.wasm.js";
import dracoWrapper from "./draco-data/draco_wasm_wrapper.js";

const NAVY = 0x122039;

function makeDracoLoader() {
  const loader = new DRACOLoader();
  const files = {
    "draco_decoder.wasm": dracoWasm,
    "draco_wasm_wrapper.js": dracoWrapper
  };
  loader.setDecoderPath("");
  loader._loadLibrary = function (url, responseType) {
    const uri = files[url];
    if (!uri) return Promise.reject(new Error("missing decoder file " + url));
    return fetch(uri).then(r => responseType === "arraybuffer" ? r.arrayBuffer() : r.text());
  };
  return loader;
}

function fitShadowCamera(light, box) {
  const s = Math.max(box.getSize(new THREE.Vector3()).length() * 0.75, 4);
  const c = box.getCenter(new THREE.Vector3());
  light.shadow.camera.left = -s; light.shadow.camera.right = s;
  light.shadow.camera.top = s; light.shadow.camera.bottom = -s;
  light.shadow.camera.near = 0.1; light.shadow.camera.far = s * 8;
  light.shadow.bias = -0.0004;
  light.position.copy(c).add(new THREE.Vector3(s * 0.9, s * 1.4, s * 0.6));
  light.target.position.copy(c);
  light.shadow.camera.updateProjectionMatrix();
}

async function start(config) {
  const canvas = document.getElementById("world");
  const fallback = document.getElementById("fallback");

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
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  /* soft studio environment so mirrors and chrome reflect something */
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.8;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.55;
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    canvas.dataset.view = "interactive";
  });

  /* lights: warm key + cool rim + soft hemisphere fill */
  scene.add(new THREE.HemisphereLight(0xcfe4f2, 0x2a3550, 0.55));
  const key = new THREE.DirectionalLight(0xfff1dd, 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x9fd8e8, 1.1);
  scene.add(rim);

  /* soft shadow catcher so the room reads as a floating diorama */
  const catcher = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.ShadowMaterial({ opacity: 0.28 })
  );
  catcher.rotation.x = -Math.PI / 2;
  catcher.receiveShadow = true;
  scene.add(catcher);

  /* initial camera: corner view into the room's open side
   * (per-scene azimuth; phi 58° matches the blends' composed pitch) */
  function frame(model) {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    /* optional per-scene focus: frame a sub-region (e.g. a room on an
     * oversized floor slab) instead of the whole bounding box */
    if (config.focus) { center.x = config.focus[0]; center.z = config.focus[1]; }
    const span = config.span ?? Math.max(size.x, size.z);
    const dist = span * 1.5 + size.y * 0.7;
    const sph = new THREE.Spherical(dist, THREE.MathUtils.degToRad(58), THREE.MathUtils.degToRad(config.azimuth ?? 38));
    camera.position.copy(center).add(new THREE.Vector3().setFromSpherical(sph));
    controls.target.copy(center);
    controls.minDistance = dist * 0.3;
    controls.maxDistance = dist * 2.4;
    controls.update();
    const low = new THREE.Vector3(center.x, box.min.y, center.z);
    catcher.position.set(low.x, -0.02, low.z);
    fitShadowCamera(key, box);
    rim.position.copy(center).add(new THREE.Vector3(-size.x, size.y * 1.2, -size.z));
    return box;
  }

  const draco = makeDracoLoader();
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  const gltf = await loader.loadAsync(config.model);
  const model = gltf.scene;
  model.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  scene.add(model);
  const box = frame(model);
  model.position.y = -box.min.y; /* room floor sits on y = 0 */

  function resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize, { passive: true });
  resize();

  /* HUD wiring */
  const pauseBtn = document.getElementById("pause");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let paused = reduced;
  function applyPaused() {
    controls.autoRotate = !paused;
    pauseBtn.textContent = paused ? "▶ 播放" : "⏸ 暂停";
    pauseBtn.setAttribute("aria-pressed", String(paused));
  }
  pauseBtn.addEventListener("click", () => { paused = !paused; applyPaused(); });
  window.addEventListener("keydown", e => {
    if (e.key === "Escape") { location.href = "index.html"; }
    if (e.key === " ") { e.preventDefault(); paused = !paused; applyPaused(); }
  });
  applyPaused();

  /* animation loop: gentle diorama bob + damping */
  const clock = new THREE.Clock();
  const baseY = model.position.y;
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    if (!paused) {
      model.position.y = baseY + Math.sin(t * 0.7) * 0.035;
      model.rotation.y = Math.sin(t * 0.11) * 0.05;
    }
    controls.update();
    renderer.render(scene, camera);
  });

  canvas.classList.add("ready");
  document.getElementById("loading")?.remove();

  /* ?dbg: expose the live graph for one-off visual debugging */
  if (new URLSearchParams(location.search).has("dbg")) {
    window.__hwdbg = { scene, camera, controls, THREE };
  }

  canvas.addEventListener("webglcontextlost", e => {
    e.preventDefault();
    fallback.hidden = false;
  });
  renderer.domElement.addEventListener("webglcontextrestored", () => location.reload());
}

window.HWScene = { start };
