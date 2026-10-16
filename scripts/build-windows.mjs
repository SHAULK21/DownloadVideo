import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const root = process.cwd();
const release = path.join(root, "release");
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
};
for (const [name, expected] of Object.entries(pins))
  if (hash(path.join(release, name)) !== expected)
    throw Error("SHA256 mismatch: " + name);
const resources = path.join(release, "desktop-resources");
const project = path.join(release, "desktop-app");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const dirOnly = process.argv.includes("--dir");
const prepackaged = process.argv.includes("--prepackaged");
if (!prepackaged) {
  fs.rmSync(project, { recursive: true, force: true });
  fs.rmSync(resources, { recursive: true, force: true });
  fs.mkdirSync(path.join(resources, "tools"), { recursive: true });
  for (const name of Object.keys(pins))
    fs.copyFileSync(
      path.join(release, name),
      path.join(
        resources,
        "tools",
        name === "node-win.exe" ? "node.exe" : name,
      ),
    );
  fs.cpSync("plugins", path.join(resources, "plugins"), {
    recursive: true,
    filter: (source) =>
      !source.includes("__pycache__") && !source.endsWith(".pyc"),
  });
  for (const dir of ["desktop", "dist"])
    fs.cpSync(dir, path.join(project, dir), { recursive: true });
  fs.writeFileSync(
    path.join(project, "package.json"),
    JSON.stringify(
      {
        name: "omnigrab",
        version: pkg.version,
        description: "OmniGrab — загрузчик видео и аудио",
        author: "SHAULK21",
        license: "UNLICENSED",
        main: "desktop/electron.mjs",
      },
      null,
      2,
    ),
  );
}
execFileSync(
  process.execPath,
  [
    "node_modules/electron-builder/cli.js",
    "--config",
    "electron-builder.json",
    "--win",
    dirOnly ? "dir" : "portable",
    "--x64",
    "--publish",
    "never",
    ...(prepackaged
      ? ["--prepackaged", path.join(release, "desktop-build", "win-unpacked")]
      : []),
  ],
  {
    stdio: "inherit",
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" },
  },
);
if (dirOnly) process.exit(0);
const output = path.join(release, "OmniGrab.exe");
fs.copyFileSync(path.join(release, "desktop-build", "OmniGrab.exe"), output);
const buildInfo = {
  version: pkg.version,
  platform: "win32-x64",
  shell: "Electron",
  electron: pkg.devDependencies.electron,
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
console.log("Windows desktop executable:", buildInfo);
