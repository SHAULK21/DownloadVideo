import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
export async function until(fn, timeout = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw Error("Desktop smoke timeout");
}
export async function freePort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
export async function fixture(temp) {
  const made = spawnSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:size=160x90:rate=10",
    "-t",
    "1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    path.join(temp, "test.mp4"),
  ]);
  assert.equal(made.status, 0, made.stderr?.toString());
  const bytes = fs.readFileSync(path.join(temp, "test.mp4"));
  const fileBytes = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  );
  const slow = Buffer.concat(
    Array.from(
      { length: Math.ceil((4 * 1024 * 1024) / bytes.length) },
      () => bytes,
    ),
  );
  const server = http.createServer((req, res) => {
    const payload =
      req.url === "/report.pdf"
        ? fileBytes
        : req.url === "/slow.mp4"
          ? slow
          : bytes;
    const start = Number(req.headers.range?.match(/bytes=(\d+)-/)?.[1]) || 0;
    res.writeHead(start ? 206 : 200, {
      "Content-Type": payload === fileBytes ? "application/pdf" : "video/mp4",
      "Content-Length": payload.length - start,
      "Accept-Ranges": "bytes",
      ...(start
        ? {
            "Content-Range": `bytes ${start}-${payload.length - 1}/${payload.length}`,
          }
        : {}),
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    if (payload !== slow) {
      res.end(payload.subarray(start));
      return;
    }
    let index = start;
    const timer = setInterval(() => {
      res.write(payload.subarray(index, index + 65536));
      index += 65536;
      if (index >= payload.length) {
        clearInterval(timer);
        res.end();
      }
    }, 100);
    res.on("close", () => clearInterval(timer));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    server,
    bytes,
    fileBytes,
    slow,
    base: "http://127.0.0.1:" + server.address().port,
  };
}
export function api(base, token) {
  return async (route, method = "GET", body) => {
    const response = await fetch(base + route, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const value = await response.json();
    assert.ok(response.ok, JSON.stringify(value));
    return value;
  };
}
export function assertGUI(executable) {
  const bytes = fs.readFileSync(executable);
  const offset = bytes.readUInt32LE(0x3c);
  assert.equal(bytes.toString("ascii", offset, offset + 4), "PE\0\0");
  assert.equal(
    bytes.readUInt16LE(offset + 24 + 68),
    2,
    "Windows executable must use GUI subsystem, not a console",
  );
}
