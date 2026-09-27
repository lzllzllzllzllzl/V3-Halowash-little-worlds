/* Bundles src/hw-scene.js and src/hw-index.js to IIFEs exposing
 * window.HWScene / window.HWIndex. Patches DRACOLoader's import.meta.url
 * defaults: esbuild's IIFE shim leaves import.meta.url undefined and the
 * top-level `new URL(..., import.meta.url)` throws. The patched values are
 * unused — setDecoderPath() overrides them. */
import { build } from "esbuild";
import { readFile } from "node:fs/promises";

const plugin = {
  name: "patch-draco-import-meta-url",
  setup(b) {
    b.onLoad({ filter: /DRACOLoader\.js$/ }, async (args) => {
      let src = await readFile(args.path, "utf8");
      src = src.replace(
        /new URL\(\s*(['"])([^'"]+)\1\s*,\s*import\.meta\.url\s*\)\.toString\(\)/g,
        "'$2'"
      );
      return { contents: src, loader: "js" };
    });
  }
};

await build({
  entryPoints: ["src/hw-scene.js"],
  bundle: true,
  minify: true,
  format: "iife",
  outfile: "scene-bundle.js",
  logLevel: "warning",
  plugins: [plugin]
});
console.log("scene-bundle.js rebuilt");

await build({
  entryPoints: ["src/hw-index.js"],
  bundle: true,
  minify: true,
  format: "iife",
  outfile: "index-bundle.js",
  logLevel: "warning",
  plugins: [plugin]
});
console.log("index-bundle.js rebuilt");
