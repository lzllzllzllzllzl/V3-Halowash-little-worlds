/* Crops the ward scene's oversized floor slab down to hug the room's
 * walls (Wall_Back spans x[-2.36, 5.24]; the left window wall spans
 * z[-1.72, 4.80]) with a small uniform margin, and removes the floating
 * Outside_Light card that hangs outside the window wall. The Floor is a
 * unit cube scaled ×11 by its node, so world bounds are converted to
 * local space before clamping. Rewrites models/ward.glb in place.
 * Usage: node tools/crop-ward-floor.mjs */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";

const MARGIN = 0.1;                       /* slab border around the walls */
const WALL = { minX: -2.36, maxX: 5.24, minZ: -1.72, maxZ: 4.80 };
const WORLD = {
  minX: WALL.minX - MARGIN, maxX: WALL.maxX + MARGIN,
  minZ: WALL.minZ - MARGIN, maxZ: WALL.maxZ + MARGIN
};

const io = new NodeIO()
  .registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "draco3d.encoder": await draco3d.createEncoderModule()
  })
  .registerExtensions(ALL_EXTENSIONS);
const doc = await io.read("models/ward.glb");

let clamped = 0;
let removed = 0;
for (const scene of doc.getRoot().listScenes()) {
  scene.traverse((node) => {
    if (node.getName() === "Outside_Light") {   /* floating card outside the window wall */
      node.dispose();
      removed++;
      return;
    }
    if (node.getName() !== "Floor") return;
    const [tx, , tz] = node.getWorldTranslation();
    const [sx, , sz] = node.getWorldScale();
    const local = {
      minX: (WORLD.minX - tx) / sx, maxX: (WORLD.maxX - tx) / sx,
      minZ: (WORLD.minZ - tz) / sz, maxZ: (WORLD.maxZ - tz) / sz
    };
    for (const prim of node.getMesh().listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      for (let i = 0; i < pos.getCount(); i++) {
        const [x, y, z] = pos.getElement(i, [0, 0, 0]);
        const cx = Math.min(Math.max(x, local.minX), local.maxX);
        const cz = Math.min(Math.max(z, local.minZ), local.maxZ);
        if (cx !== x || cz !== z) clamped++;
        pos.setElement(i, [cx, y, cz]);
      }
    }
  });
}
console.log("vertices clamped:", clamped, "| outside lights removed:", removed);
await io.write("models/ward.glb", doc);
console.log("ward.glb rewritten; floor now spans x[%s, %s] z[%s, %s]",
  WORLD.minX, WORLD.maxX, WORLD.minZ, WORLD.maxZ);
