/* Conservative meshopt simplification of the salon scene's dense hero pod
 * (980k verts). error 0.0005 = max surface deviation of 0.05% of extent.
 * Writes an UNCOMPRESSED glb; draco/webp pass runs via the CLI afterwards. */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { simplify, weld, dedup, prune } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);

await doc.transform(
  dedup(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, error: 0.0005 }),
  prune()
);

await io.write(process.argv[3], doc);
console.log("simplified written:", process.argv[3]);
