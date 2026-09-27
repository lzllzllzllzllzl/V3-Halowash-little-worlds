/* Pure-JSON wall analyzer: reads an uncompressed GLB, walks the node graph,
 * transforms each mesh's POSITION accessor min/max into world space, and
 * reports thin/large meshes ("walls") with the azimuth of their center from
 * the scene center — i.e. which side the room is closed toward. */
import { readFileSync } from "node:fs";

const [, , inPath] = process.argv;
const buf = readFileSync(inPath);
const jsonLen = buf.readUInt32LE(12);
const g = JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));

const acc = g.accessors || [];
const matName = i => (g.materials?.[i]?.name ?? "?");

function localMatrix(n) {
  if (n.matrix) return n.matrix;
  const t = n.translation ?? [0, 0, 0];
  const r = n.rotation ?? [0, 0, 0, 1];
  const s = n.scale ?? [1, 1, 1];
  const [x, y, z, w] = r;
  const rot = [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
  ];
  for (let c = 0; c < 3; c++) for (let rI = 0; rI < 3; rI++) rot[rI * 4 + c] *= s[c];
  return [rot[0], rot[1], rot[2], 0, rot[4], rot[5], rot[6], 0, rot[8], rot[9], rot[10], 0, t[0], t[1], t[2], 1];
}
function mul(a, b) { // a*b, column-major 4x4
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function apply(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

const world = new Map();
function walk(i, parent) {
  const n = g.nodes[i];
  const m = mul(parent, localMatrix(n));
  world.set(i, m);
  for (const c of n.children ?? []) walk(c, m);
}
for (const s of g.scenes) for (const r of s.nodes) walk(r, [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

// scene bbox from all mesh instances
let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
const items = [];
for (const [i, m] of world) {
  const n = g.nodes[i];
  if (n.mesh == null) continue;
  for (const p of g.meshes[n.mesh].primitives) {
    const a = acc[p.attributes.POSITION];
    if (!a.min || !a.max) continue;
    const corners = [];
    for (const X of [a.min[0], a.max[0]]) for (const Y of [a.min[1], a.max[1]]) for (const Z of [a.min[2], a.max[2]])
      corners.push(apply(m, [X, Y, Z]));
    const b = {
      minX: Math.min(...corners.map(c => c[0])), maxX: Math.max(...corners.map(c => c[0])),
      minY: Math.min(...corners.map(c => c[1])), maxY: Math.max(...corners.map(c => c[1])),
      minZ: Math.min(...corners.map(c => c[2])), maxZ: Math.max(...corners.map(c => c[2])),
    };
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY); minZ = Math.min(minZ, b.minZ);
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY); maxZ = Math.max(maxZ, b.maxZ);
    items.push({ name: n.name, mat: matName(p.material), b });
  }
}
const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
console.log(`scene bbox x[${minX.toFixed(2)},${maxX.toFixed(2)}] y[${minY.toFixed(2)},${maxY.toFixed(2)}] z[${minZ.toFixed(2)},${maxZ.toFixed(2)}]`);

for (const it of items) {
  const { b } = it;
  const sx = b.maxX - b.minX, sy = b.maxY - b.minY, sz = b.maxZ - b.minZ;
  const dims = [sx, sy, sz].sort((a, b2) => a - b2);
  const thin = dims[0] < 0.05 * Math.max(sx, sy, sz) || /wall/i.test(it.mat);
  if (!thin) continue;
  const ccx = (b.minX + b.maxX) / 2, ccy = (b.minY + b.maxY) / 2, ccz = (b.minZ + b.maxZ) / 2;
  const ang = Math.atan2(ccx - cx, ccz - cz) * 180 / Math.PI;
  console.log(`${it.mat} | node ${it.name} | size(${sx.toFixed(2)},${sy.toFixed(2)},${sz.toFixed(2)}) | center(${ccx.toFixed(2)},${ccy.toFixed(2)},${ccz.toFixed(2)}) | azimuth ${ang.toFixed(0)}°`);
}
