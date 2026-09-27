/* Pushes the local HEAD commit to GitHub via the Git Data API
 * (used when github.com:443 is unreachable but api.github.com works).
 * Rebuilds the exact same commit object — same tree, parents, author,
 * committer and message bytes — so the resulting SHA matches local HEAD
 * and the remote stays a fast-forward of the same history. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const REPO = (process.argv[2] ??
  execFileSync("git", ["remote", "get-url", "origin"]).toString().trim()
    .replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, ""));
const gh = (args, input) =>
  execFileSync("gh", ["api", ...args], { input, maxBuffer: 1 << 28, timeout: 180000 }).toString();

const raw = execFileSync("git", ["cat-file", "commit", "HEAD"], { maxBuffer: 1 << 26 }).toString();
if (raw.includes("gpgsig")) throw new Error("signed commit not supported by this script");
const [headBlock, ...msgParts] = raw.split("\n\n");
const message = msgParts.join("\n\n");
const lines = headBlock.split("\n");
const tree = lines.find(l => l.startsWith("tree ")).slice(5);
const parents = lines.filter(l => l.startsWith("parent ")).map(l => l.slice(7));
const person = l => {
  const m = l.match(/^(?:author|committer) (.*) <([^>]*)> (\d+) ([+-]\d{4})$/);
  return { name: m[1], email: m[2], epoch: +m[3], tz: m[4] };
};
const toIso = ({ epoch, tz }) => {
  const sign = tz[0], hh = tz.slice(1, 3), mm = tz.slice(3);
  const shifted = new Date(epoch * 1000 + (sign === "+" ? 1 : -1) * (+hh * 60 + +mm) * 60000);
  return shifted.toISOString().replace(/\.\d{3}Z$/, "") + sign + hh + ":" + mm;
};
const author = person(lines.find(l => l.startsWith("author ")));
const committer = person(lines.find(l => l.startsWith("committer ")));

const remoteRef = JSON.parse(gh([`repos/${REPO}/git/ref/heads/main`]));
if (remoteRef.object.sha !== parents[0]) {
  throw new Error(`remote main is ${remoteRef.object.sha}, expected parent ${parents[0]} — aborting`);
}
const remoteTree = JSON.parse(gh([`repos/${REPO}/git/commits/${parents[0]}`])).tree.sha;

const files = execFileSync("git", ["diff", "--name-only", "HEAD~1", "HEAD"]).toString().trim().split("\n");
console.log(`pushing ${files.length} files on top of ${parents[0].slice(0, 7)}`);

const entries = [];
for (const f of files) {
  const b64 = readFileSync(f).toString("base64");
  const { sha } = JSON.parse(gh([`repos/${REPO}/git/blobs`, "--input", "-"],
    JSON.stringify({ content: b64, encoding: "base64" })));
  entries.push({ path: f, mode: "100644", type: "blob", sha });
  console.log("  blob", f, sha.slice(0, 8));
}
const newTree = JSON.parse(gh([`repos/${REPO}/git/trees`, "--input", "-"],
  JSON.stringify({ base_tree: remoteTree, tree: entries })));

const payload = {
  message,
  tree: newTree.sha,
  parents,
  author: { name: author.name, email: author.email, date: toIso(author) },
  committer: { name: committer.name, email: committer.email, date: toIso(committer) }
};
const commit = JSON.parse(gh([`repos/${REPO}/git/commits`, "--input", "-"], JSON.stringify(payload)));
console.log("created commit", commit.sha);
if (commit.sha !== execFileSync("git", ["rev-parse", "HEAD"]).toString().trim()) {
  console.warn("WARNING: API commit sha differs from local HEAD — remote will diverge");
}
gh([`repos/${REPO}/git/refs/heads/main`, "-X", "PATCH", "--input", "-"],
  JSON.stringify({ sha: commit.sha, force: false }));
console.log("main updated:", commit.sha);
