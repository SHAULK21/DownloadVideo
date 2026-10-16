import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export function fileHash(file) {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const fd = fs.openSync(file, "r");
  try {
    let length;
    while ((length = fs.readSync(fd, buffer, 0, buffer.length, null)))
      hash.update(buffer.subarray(0, length));
    return hash.digest("hex");
  } finally {
    fs.closeSync(fd);
  }
}

// The caller holds Electron's single-instance lock. Never execute binaries from
// the portable launcher's temporary extraction directory: another launch or
// temporary-file cleanup must not remove tools used by the running app.
export function prepareRuntime({ sourceDir, dataDir, manifest }) {
  const entries = Object.entries(manifest).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  if (!entries.length) throw Error("Пустой список компонентов OmniGrab.");
  for (const [name, hash] of entries)
    if (
      !/^(tools|plugins)\/[A-Za-z0-9_./-]+$/.test(name) ||
      name.split("/").some((part) => part === ".." || part === ".") ||
      !/^[a-f0-9]{64}$/.test(hash)
    )
      throw Error("Некорректный список компонентов OmniGrab.");
  const key = createHash("sha256")
    .update(JSON.stringify(entries))
    .digest("hex")
    .slice(0, 24);
  const runtime = path.join(dataDir, "runtime", key);
  for (const [name, expected] of entries) {
    const target = path.join(runtime, name);
    let temporary;
    try {
      if (fs.existsSync(target) && fileHash(target) === expected) continue;
      const source = path.join(sourceDir, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      temporary = target + "." + randomUUID() + ".tmp";
      fs.copyFileSync(source, temporary);
      if (fileHash(temporary) !== expected)
        throw Error("Контрольная сумма компонента не совпадает.");
      fs.renameSync(temporary, target);
    } catch (cause) {
      throw Error(
        `Не удалось восстановить компонент ${path.basename(name)}. Закройте OmniGrab и снова запустите новый OmniGrab.exe.\nПапка компонентов: ${runtime}\n${cause.message}`,
        { cause },
      );
    } finally {
      if (temporary) fs.rmSync(temporary, { force: true });
    }
  }
  return {
    tools: path.join(runtime, "tools"),
    plugins: path.join(runtime, "plugins"),
  };
}
