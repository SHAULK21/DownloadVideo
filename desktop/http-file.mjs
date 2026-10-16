import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export function responseName(response, url) {
  const disposition = response.headers.get("content-disposition") || "";
  const encoded = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1];
  let name =
    encoded ||
    disposition.match(/filename\s*=\s*"([^"]+)"/i)?.[1] ||
    disposition.match(/filename\s*=\s*([^;]+)/i)?.[1];
  if (!name) name = new URL(response.url || url).pathname.split("/").pop();
  try {
    name = decodeURIComponent(name || "download");
  } catch {}
  return name.replaceAll("\\", "/").split("/").pop().trim() || "download";
}
export function ordinaryFile(meta) {
  const mime = meta.mime.toLowerCase();
  if (
    /(?:mpegurl|dash\+xml)/.test(mime) ||
    /\.(?:m3u8|mpd)$/i.test(meta.filename)
  )
    return false;
  return (
    /attachment/i.test(meta.disposition) ||
    (!/^(?:text\/html|application\/(?:xhtml\+xml|json|javascript)|text\/javascript)/.test(
      mime,
    ) &&
      !/^(?:video|audio)\//.test(mime) &&
      !/(?:mpegurl|dash\+xml)/.test(mime) &&
      !!mime)
  );
}
async function request(url, headers, signal, method = "GET") {
  const timeout = new AbortController();
  const timer = setTimeout(
    () => timeout.abort(Error("Источник не отвечает.")),
    20000,
  );
  try {
    return await fetch(url, {
      method,
      headers: { ...headers, "Accept-Encoding": "identity" },
      signal: signal
        ? AbortSignal.any([signal, timeout.signal])
        : timeout.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
export async function probeFile(url, headers = {}, signal, head = false) {
  let response = await request(
    url,
    head ? headers : { ...headers, Range: "bytes=0-0" },
    signal,
    head ? "HEAD" : "GET",
  );
  if (head && [405, 501].includes(response.status)) {
    await response.body?.cancel();
    response = await request(url, { ...headers, Range: "bytes=0-0" }, signal);
  }
  try {
    if (!response.ok)
      throw Error("Источник вернул HTTP " + response.status + ".");
    return {
      filename: responseName(response, url),
      mime: response.headers.get("content-type") || "",
      disposition: response.headers.get("content-disposition") || "",
      size:
        Number(response.headers.get("content-range")?.match(/\/(\d+)$/)?.[1]) ||
        Number(response.headers.get("content-length")) ||
        0,
    };
  } finally {
    await response.body?.cancel();
  }
}

export async function openFile(url, headers) {
  const response = await request(url, headers);
  if (!response.ok) {
    await response.body?.cancel();
    throw Error("Источник вернул HTTP " + response.status + ".");
  }
  return {
    response,
    meta: {
      filename: responseName(response, url),
      mime: response.headers.get("content-type") || "",
      size: Number(response.headers.get("content-length")) || 0,
    },
  };
}
export async function downloadFile({
  task,
  headers,
  signal,
  sanitize,
  progress,
  rate,
  response: preparedResponse,
}) {
  const partial = path.join(
    task.saveFolder,
    ".omnigrab-" + task.id.replace(/[^\w-]/g, "_") + ".part",
  );
  const validator =
    task.fileEtag && !task.fileEtag.startsWith("W/")
      ? task.fileEtag
      : task.fileModified;
  let offset =
    validator && fs.existsSync(partial) ? fs.statSync(partial).size : 0;
  let response =
    preparedResponse ||
    (await request(
      task.url,
      {
        ...headers,
        ...(offset ? { Range: `bytes=${offset}-`, "If-Range": validator } : {}),
      },
      signal,
    ));
  if (response.status === 416 && offset) {
    await response.body?.cancel();
    offset = 0;
    response = await request(task.url, headers, signal);
  }
  let fd, idle, reader, abortReader;
  try {
    if (!response.ok)
      throw Error("Источник вернул HTTP " + response.status + ".");
    const encoded =
      !!response.headers.get("content-encoding") &&
      response.headers.get("content-encoding") !== "identity";
    const range = response.headers
      .get("content-range")
      ?.match(/^bytes (\d+)-(\d+)\/(\d+|\*)$/);
    if (response.status === 206 && (!range || Number(range[1]) !== offset))
      throw Error("Источник вернул неверный диапазон байтов.");
    if (response.status !== 206) offset = 0;
    if (encoded && offset)
      throw Error("Источник изменил сжатие. Повторите загрузку.");
    const expected = encoded
      ? null
      : response.headers.has("content-length")
        ? Number(response.headers.get("content-length"))
        : null;
    const total = encoded
      ? 0
      : range?.[3] !== "*" && range?.[3]
        ? Number(range[3])
        : expected === null
          ? 0
          : offset + expected;
    task.fileEtag = encoded ? null : response.headers.get("etag");
    task.fileModified = encoded ? null : response.headers.get("last-modified");
    const filename = sanitize(
      task.suggestedFilename || responseName(response, task.url),
    );
    task.filename = filename;
    task.title = filename;
    task.mimeType = response.headers.get("content-type") || "";
    task.threads = 1;
    fd = fs.openSync(partial, offset ? "a" : "w");
    reader = response.body?.getReader();
    abortReader = () => {
      void reader?.cancel().catch(() => {});
    };
    signal?.addEventListener("abort", abortReader, { once: true });
    let received = 0,
      sampleBytes = offset,
      sampleTime = Date.now(),
      rateTime = Date.now();
    progress(offset, total, 0);
    while (reader) {
      const next = reader.read();
      const timeout = new Promise((_, reject) => {
        idle = setTimeout(() => {
          void reader.cancel().catch(() => {});
          reject(Error("Источник перестал передавать данные."));
        }, 30000);
      });
      let chunk;
      try {
        chunk = await Promise.race([next, timeout]);
      } finally {
        clearTimeout(idle);
      }
      signal?.throwIfAborted();
      if (chunk.done) break;
      let written = 0;
      while (written < chunk.value.length)
        written += fs.writeSync(
          fd,
          chunk.value,
          written,
          chunk.value.length - written,
        );
      received += chunk.value.length;
      const now = Date.now(),
        speed =
          (offset + received - sampleBytes) /
          Math.max(0.001, (now - sampleTime) / 1000);
      progress(offset + received, total, speed);
      if (now - sampleTime >= 500) {
        sampleBytes = offset + received;
        sampleTime = now;
      }
      const limit = rate();
      if (limit > 0) {
        const wait = (received / limit) * 1000 - (Date.now() - rateTime);
        if (wait > 0) await delay(wait, undefined, { signal });
      } else {
        rateTime = Date.now();
      }
    }
    if (expected !== null && received !== expected)
      throw Error("Источник передал неполный файл.");
    if (total && offset + received !== total)
      throw Error("Размер файла не совпал с ответом источника.");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    const ext = path.extname(filename),
      stem = filename.slice(0, filename.length - ext.length);
    for (let i = 0; ; i++) {
      const output = path.join(
        task.saveFolder,
        i
          ? `${stem} [${task.id.slice(0, 8)}${i > 1 ? "-" + i : ""}]${ext}`
          : filename,
      );
      try {
        try {
          fs.linkSync(partial, output);
        } catch (error) {
          if (error.code === "EEXIST") throw error;
          fs.copyFileSync(partial, output, fs.constants.COPYFILE_EXCL);
        }
        fs.unlinkSync(partial);
        return output;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
    }
  } finally {
    if (abortReader) signal?.removeEventListener("abort", abortReader);
    clearTimeout(idle);
    if (fd !== undefined) fs.closeSync(fd);
    await response.body?.cancel().catch(() => {});
  }
}
