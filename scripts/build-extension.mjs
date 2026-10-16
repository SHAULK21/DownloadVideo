import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
const zip = new JSZip();
for (const name of fs.readdirSync("extension"))
  zip.file(name, fs.readFileSync(path.join("extension", name)));
const bytes = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
});
await JSZip.loadAsync(bytes, { checkCRC32: true });
fs.mkdirSync("dist", { recursive: true });
fs.mkdirSync("release", { recursive: true });
for (const name of ["THIRD_PARTY_NOTICES.txt"]) {
  if (fs.existsSync(name)) fs.copyFileSync(name, path.join("dist", name));
}
if (fs.existsSync("README-Windows.txt"))
  fs.copyFileSync("README-Windows.txt", "dist/README.txt");
fs.writeFileSync("dist/extension.zip", bytes);
fs.writeFileSync("release/OmniGrab-Extension.zip", bytes);
console.log("Extension ZIP:", bytes.length, "bytes");
