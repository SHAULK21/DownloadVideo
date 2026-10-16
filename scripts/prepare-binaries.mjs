import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import JSZip from "jszip";
const files = [
  [
    "node-win.exe",
    "https://nodejs.org/dist/v24.19.0/win-x64/node.exe",
    "3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237",
  ],
  [
    "yt-dlp.exe",
    "https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp.exe",
    "66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a",
  ],
  [
    "ffmpeg-win.zip",
    "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
    "c32269c715f932b45487702cfc238bca54945a63957efa3263f025a273000e99",
  ],
];
fs.mkdirSync("release", { recursive: true });
const hash = (b) => createHash("sha256").update(b).digest("hex");
for (const [name, url, expected] of files) {
  const dest = path.join("release", name);
  if (fs.existsSync(dest) && hash(fs.readFileSync(dest)) === expected) {
    console.log("Verified", name);
    continue;
  }
  console.log("Downloading", name);
  const r = await fetch(url, { signal: AbortSignal.timeout(300000) });
  if (!r.ok) throw Error("HTTP " + r.status + " " + url);
  const bytes = Buffer.from(await r.arrayBuffer());
  if (hash(bytes) !== expected)
    throw Error(
      "SHA256 mismatch: " +
        name +
        ". Upstream build changed; review and update locked hashes explicitly.",
    );
  fs.writeFileSync(dest, bytes);
}
const zip = await JSZip.loadAsync(fs.readFileSync("release/ffmpeg-win.zip"));
for (const name of ["ffmpeg.exe", "ffprobe.exe"]) {
  const key = Object.keys(zip.files).find((k) => k.endsWith("/bin/" + name));
  if (!key) throw Error("Missing " + name);
  fs.writeFileSync(
    path.join("release", name),
    await zip.files[key].async("nodebuffer"),
  );
}
console.log("Windows tools ready.");
fs.copyFileSync("release/node-win.exe", "release/node.exe");
