/* Rebuilds the four HaloWash scene pages from the template + models/*.glb.
 * Each page embeds its GLB as a base64 data URI so it works from file://. */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const template = readFileSync(join(root, "tools/scene-page-template.html"), "utf8");
const bundleV = Math.floor(statSync(join(root, "scene-bundle.js")).mtimeMs);

const pages = [
  {
    out: "scene-home.html",
    title: "居家护理 · HaloWash 小世界",
    sign: "居家护理 · HaloWash",
    aria: "HaloWash 居家护理小世界：家中客厅里的光环护理舱，可拖拽旋转查看",
    desc: "家中客厅里，长辈半躺在单人护理椅上，光环护理舱缓缓罩下 —— 不出门，也能完成一次温和的头皮洗护。",
    model: "models/home.glb",
    azimuth: 45
  },
  {
    out: "scene-ward.html",
    title: "病房护理 · HaloWash 小世界",
    sign: "病房护理 · HaloWash",
    aria: "HaloWash 病房护理小世界：病床上方的便携光环护理舱，可拖拽旋转查看",
    desc: "病房里，便携光环舱移到病床上方，无需搬运患者，卧床也能完成一次清洁护理。",
    model: "models/ward.glb",
    azimuth: 45,
    focus: [0.9, 0.7],
    span: 5.8
  },
  {
    out: "scene-garden.html",
    title: "养老院护理 · HaloWash 小世界",
    sign: "养老院护理 · HaloWash",
    aria: "HaloWash 养老院护理小世界：公共客厅里的两台 SCALP360 照护椅，可拖拽旋转查看",
    desc: "养老院的公共客厅里，两台 SCALP360 照护椅与轮椅相邻，长辈们伴着绿植与置物架，悠闲完成日常洗护。",
    model: "models/garden.glb",
    azimuth: 45
  },
  {
    out: "scene-salon.html",
    title: "头皮沙龙 · HaloWash 小世界",
    sign: "头皮沙龙 · SCALP360",
    aria: "HaloWash 头皮沙龙小世界：SCALP360 SALON 镜墙下的两台光环护理舱，可拖拽旋转查看",
    desc: "SCALP360 SALON：镜墙与聚光灯下，三台光环舱同时开工，头皮护理变成一种享受。",
    model: "models/salon.glb"
  }
];

for (const p of pages) {
  const b64 = readFileSync(join(root, p.model)).toString("base64");
  const html = template
    .replaceAll("@@TITLE@@", p.title)
    .replaceAll("@@SIGN@@", p.sign)
    .replaceAll("@@ARIA@@", p.aria)
    .replaceAll("@@DESC@@", p.desc)
    .replaceAll("@@AZIMUTH@@", String(p.azimuth ?? 38))
    .replaceAll("@@FOCUS@@", JSON.stringify(p.focus ?? null))
    .replaceAll("@@SPAN@@", String(p.span ?? null))
    .replaceAll("@@BUNDLE_V@@", String(bundleV))
    .replaceAll("@@MODEL@@", b64);
  writeFileSync(join(root, p.out), html);
  console.log(p.out, (html.length / 1024 / 1024).toFixed(2) + " MB");
}
