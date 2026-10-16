import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { inject } from "postject";
const ROOT = process.cwd(),
  release = path.join(ROOT, "release");
fs.mkdirSync(release, { recursive: true });
const hash = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const pins = {
  "node-win.exe":
    "3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237",
  "yt-dlp.exe":
    "66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a",
  "ffmpeg.exe":
    "5fd1fd85df1fc5b29192e5c8cd71b3cc99a0ac2af35338ad2007b221960d65ae",
  "ffprobe.exe":
    "7a904eb5b51682d33e6e9fcb5c7c3fb1d53b65658f70251b1a4687ff042a3763",
  "ffmpeg-win.zip":
    "c32269c715f932b45487702cfc238bca54945a63957efa3263f025a273000e99",
};
for (const [name, expected] of Object.entries(pins)) {
  if (!fs.existsSync(path.join(release, name)))
    throw Error(
      "Отсутствует release/" +
        name +
        ". См. README: подготовка бинарных зависимостей.",
    );
  if (hash(path.join(release, name)) !== expected)
    throw Error("SHA256 mismatch: " + name);
}
await build({
  entryPoints: ["desktop/main.mjs"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  outfile: "release/main.cjs",
  external: ["node:*"],
});
const assets = {};
function walk(dir, prefix) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name),
      key = prefix + entry.name;
    if (entry.isDirectory()) walk(file, key + "/");
    else assets[key] = file;
  }
}
walk(path.join(ROOT, "dist"), "web/");
for (const name of ["yt-dlp.exe", "ffmpeg.exe", "ffprobe.exe", "node.exe"]) {
  const input = path.join(release, name === "node.exe" ? "node-win.exe" : name);
  const compressed = path.join(release, name + ".gz");
  if (
    !fs.existsSync(compressed) ||
    fs.statSync(compressed).mtimeMs < fs.statSync(input).mtimeMs
  )
    fs.writeFileSync(
      compressed,
      gzipSync(fs.readFileSync(input), { level: 9 }),
    );
  assets["tools/" + name + ".gz"] = compressed;
}
const config = {
  main: path.join(release, "main.cjs"),
  output: path.join(release, "sea.blob"),
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
  execArgvExtension: "none",
  assets,
};
fs.writeFileSync(path.join(release, "sea.json"), JSON.stringify(config));
if (process.versions.node !== "24.19.0")
  throw Error("SEA требует Node v24.19.0, совпадающий с Windows runtime.");
execFileSync(
  process.execPath,
  ["--experimental-sea-config", path.join(release, "sea.json")],
  { stdio: "inherit" },
);
const output = path.join(release, "OmniGrab.exe");
// The packaged program has its own identity; do not retain Node's Authenticode signature.
const executable = fs.readFileSync(path.join(release, "node-win.exe"));
const pe = executable.readUInt32LE(0x3c);
if (executable.toString("ascii", pe, pe + 4) !== "PE\0\0")
  throw Error("Invalid Windows PE");
const optional = pe + 24;
if (executable.readUInt16LE(optional) !== 0x20b) throw Error("Expected PE32+");
const security = optional + 112 + 4 * 8;
const certificateOffset = executable.readUInt32LE(security);
const certificateSize = executable.readUInt32LE(security + 4);
executable.writeUInt32LE(0, security);
executable.writeUInt32LE(0, security + 4);
executable.writeUInt32LE(0, optional + 64);
fs.writeFileSync(
  output,
  certificateOffset && certificateOffset + certificateSize === executable.length
    ? executable.subarray(0, certificateOffset)
    : executable,
);
await inject(
  output,
  "NODE_SEA_BLOB",
  fs.readFileSync(path.join(release, "sea.blob")),
  { sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2" },
);
const buildInfo = {
  version: "3.0.0",
  platform: "win32-x64",
  node: "24.19.0",
  ytDlp: "2026.08.19",
  sha256: hash(output),
  bytes: fs.statSync(output).size,
  dependencies: pins,
};
fs.writeFileSync(
  path.join(release, "build-info.json"),
  JSON.stringify(buildInfo, null, 2),
);
fs.writeFileSync(
  path.join(release, "SHA256SUMS.txt"),
  `${buildInfo.sha256}  OmniGrab.exe\n${hash(path.join(release, "OmniGrab-Extension.zip"))}  OmniGrab-Extension.zip\n`,
);
console.log("Windows executable:", buildInfo);
