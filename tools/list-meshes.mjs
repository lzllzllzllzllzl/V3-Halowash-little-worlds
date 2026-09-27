/* Lists every mesh instance in a GLB: world-space bbox dims + material name.
 * Usage: node tools/list-meshes.mjs <model.glb> */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";

const io = new NodeIO()
  .registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "draco3d.encoder": await draco3d.createEncoderModule()
  })
  .registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);

for (const scene of doc.getRoot().listScenes()) {
  scene.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const [tx, ty, tz] = node.getWorldTranslation();
    const [sx, sy, sz] = node.getWorldScale();
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      if (!pos) continue;
      for (let i = 0; i < pos.getCount(); i++) {
        const [x, y, z] = pos.getElement(i, [0, 0, 0]);
        for (const [axis, v] of [[0, x], [1, y], [2, z]]) {
          min[axis] = Math.min(min[axis], v);
          max[axis] = Math.max(max[axis], v);
        }
      }
    }
    const wx = (max[0] - min[0]) * sx, wy = (max[1] - min[1]) * sy, wz = (max[2] - min[2]) * sz;
    const mats = mesh.listPrimitives().map(p => p.getMaterial()?.getName() ?? "?").join(",");
    console.log(
      `${mesh.getName() || "(unnamed)"} | node "${node.getName()}" | mat ${mats}` +
      ` | size(${wx.toFixed(2)}, ${wy.toFixed(2)}, ${wz.toFixed(2)})` +
      ` | worldMin(${(min[0] * sx + tx).toFixed(2)}, ${(min[1] * sy + ty).toFixed(2)}, ${(min[2] * sz + tz).toFixed(2)})`
    );
  });
}
