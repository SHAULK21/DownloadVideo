import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".zip": "application/zip",
};
const equal = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
async function body(req) {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 512 * 1024) throw Error("Запрос слишком большой.");
  }
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw Error("Некорректный JSON.");
  }
}
export function createServer(
  manager,
  { port = 17893, token, readAsset, openFolder, chooseFolder, desktop } = {},
) {
  if (!token) throw Error("Missing access token");
  let pairing = {
    code: String(randomInt(100000, 1000000)),
    expires: Date.now() + 600000,
  };
  let failures = [];
  const origin = `http://127.0.0.1:${port}`;
  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host;
      if (
        host !== `127.0.0.1:${server.address().port}` &&
        host !== `localhost:${server.address().port}`
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
      const url = new URL(req.url, origin);
      const requestOrigin = req.headers.origin;
      const localOrigin = `http://127.0.0.1:${server.address().port}`;
      const allowed =
        !requestOrigin ||
        requestOrigin === localOrigin ||
        requestOrigin === `http://localhost:${server.address().port}` ||
        /^chrome-extension:\/\/[a-p]{32}$/.test(requestOrigin);
      if (!allowed) {
        res.writeHead(403);
        res.end("Origin denied");
        return;
      }
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("Cache-Control", "no-store");
      if (requestOrigin) {
        res.setHeader("Access-Control-Allow-Origin", requestOrigin);
        res.setHeader("Vary", "Origin");
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Authorization, Content-Type",
        );
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, DELETE, OPTIONS",
        );
        res.setHeader("Access-Control-Allow-Private-Network", "true");
      }
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      const json = (value, status = 200) => {
        res.writeHead(status, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify(value));
      };
      if (url.pathname === "/api/health" && req.method === "GET") {
        json({
          app: "OmniGrab",
          version: manager.publicState().version,
          desktop: !!desktop,
        });
        return;
      }
      if (url.pathname === "/api/pair" && req.method === "POST") {
        const input = await body(req);
        failures = failures.filter((t) => t > Date.now() - 60000);
        if (failures.length >= 6) {
          json({ error: "Слишком много попыток. Подождите минуту." }, 429);
          return;
        }
        if (
          Date.now() > pairing.expires ||
          !equal(String(input.code), pairing.code)
        ) {
          failures.push(Date.now());
          json(
            {
              error:
                "Неверный или просроченный код. Откройте «Расширение» в программе.",
            },
            403,
          );
          return;
        }
        json({
          token,
          settings: manager.settings,
          version: manager.publicState().version,
        });
        return;
      }
      const authorization = req.headers.authorization?.replace(/^Bearer /, "");
      const fileToken = url.pathname.match(/^\/api\/tasks\/[\w-]+\/file$/)
        ? url.searchParams.get("token")
        : null;
      if (
        url.pathname.startsWith("/api/") &&
        !equal(authorization || fileToken, token)
      ) {
        json(
          {
            error:
              "Откройте программу из EXE или подключите расширение по коду.",
          },
          401,
        );
        return;
      }
      if (url.pathname === "/api/state" && req.method === "GET") {
        json({
          ...manager.publicState(),
          desktop: !!desktop,
          pairing: Date.now() < pairing.expires ? pairing : null,
        });
        return;
      }
      if (url.pathname === "/api/pair-code" && req.method === "POST") {
        pairing = {
          code: String(randomInt(100000, 1000000)),
          expires: Date.now() + 600000,
        };
        json(pairing);
        return;
      }
      if (url.pathname === "/api/app" && req.method === "POST") {
        const input = await body(req);
        if (!desktop || !["show", "hide", "quit"].includes(input.action))
          throw Error("Действие доступно в настольном приложении.");
        desktop[input.action]();
        json({ ok: true });
        return;
      }
      if (url.pathname === "/api/settings" && req.method === "PUT") {
        json(manager.updateSettings(await body(req)));
        return;
      }
      if (url.pathname === "/api/analyze" && req.method === "POST") {
        const input = await body(req);
        const controller = new AbortController();
        res.on("close", () => controller.abort());
        json({
          streams: await manager.analyze(
            input.url,
            input.headers,
            input.playlist === true,
            controller.signal,
          ),
        });
        return;
      }
      if (url.pathname === "/api/tasks" && req.method === "POST") {
        const input = await body(req);
        json({ ids: manager.add(input.items) }, 201);
        return;
      }
      if (url.pathname === "/api/folder" && req.method === "POST") {
        const input = await body(req);
        if (!openFolder)
          throw Error("Открытие папки недоступно в этой системе.");
        const task = input.id && manager.tasks.find((t) => t.id === input.id);
        await openFolder(
          task?.saveFolder || manager.settings.defaultDownloadDir,
        );
        json({ ok: true });
        return;
      }
      if (url.pathname === "/api/choose-folder" && req.method === "POST") {
        if (!chooseFolder) throw Error("Введите полный путь к папке вручную.");
        json({ path: await chooseFolder(manager.settings.defaultDownloadDir) });
        return;
      }
      if (url.pathname === "/api/stop-all" && req.method === "POST") {
        for (const t of [...manager.tasks])
          if (["queued", "downloading", "merging"].includes(t.status))
            manager.control(t.id, "pause");
        json({ ok: true });
        return;
      }
      if (url.pathname === "/api/clear" && req.method === "POST") {
        for (const t of [...manager.tasks])
          if (t.status === "completed") manager.control(t.id, "delete");
        json({ ok: true });
        return;
      }
      const route = url.pathname.match(/^\/api\/tasks\/([\w-]+)(?:\/(file))?$/);
      if (route) {
        const task = manager.tasks.find((t) => t.id === route[1]);
        if (!task) {
          json({ error: "Задача не найдена." }, 404);
          return;
        }
        if (route[2] === "file" && ["GET", "HEAD"].includes(req.method)) {
          if (
            task.status !== "completed" ||
            !task.outputPath ||
            !fs.existsSync(task.outputPath)
          ) {
            json(
              { error: "Готовый файл не найден. Возможно, он был перемещён." },
              404,
            );
            return;
          }
          const size = fs.statSync(task.outputPath).size;
          const range = req.headers.range;
          let start = 0,
            end = size - 1;
          if (range) {
            const m = /^bytes=(\d+)-(\d*)$/.exec(range);
            if (
              !m ||
              Number(m[1]) >= size ||
              (m[2] && Number(m[2]) < Number(m[1]))
            ) {
              res.writeHead(416, { "Content-Range": `bytes */${size}` });
              res.end();
              return;
            }
            start = Number(m[1]);
            end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
          }
          res.writeHead(range ? 206 : 200, {
            "Content-Type":
              mime[path.extname(task.outputPath).toLowerCase()] ||
              "application/octet-stream",
            "Content-Length": end - start + 1,
            "Accept-Ranges": "bytes",
            ...(range
              ? { "Content-Range": `bytes ${start}-${end}/${size}` }
              : {}),
          });
          if (req.method === "HEAD") {
            res.end();
            return;
          }
          const stream = fs.createReadStream(task.outputPath, { start, end });
          res.on("close", () => stream.destroy());
          stream.on("error", () => res.destroy());
          stream.pipe(res);
          return;
        }
        if (req.method === "POST") {
          const input = await body(req);
          manager.control(task.id, input.action);
          json({ ok: true });
          return;
        }
        if (req.method === "DELETE") {
          manager.control(task.id, "delete");
          json({ ok: true });
          return;
        }
      }
      if (url.pathname.startsWith("/api/")) {
        json({ error: "Маршрут не найден." }, 404);
        return;
      }
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405);
        res.end();
        return;
      }
      const asset =
        url.pathname === "/"
          ? "index.html"
          : decodeURIComponent(url.pathname).replace(/^\//, "");
      if (
        asset.includes("..") ||
        asset.includes("\\") ||
        asset.includes("\0")
      ) {
        res.writeHead(400);
        res.end();
        return;
      }
      let bytes;
      try {
        bytes = readAsset(asset);
      } catch {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      );
      res.writeHead(200, {
        "Content-Type": mime[path.extname(asset)] || "application/octet-stream",
      });
      res.end(req.method === "HEAD" ? undefined : bytes);
    } catch (e) {
      if (!res.headersSent) {
        res.writeHead(400, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify({ error: e.message || "Ошибка операции." }));
      } else res.destroy();
    }
  });
  server.requestTimeout = 150000;
  server.headersTimeout = 10000;
  return server;
}
export function persistentToken(dataDir) {
  const p = path.join(dataDir, "access-token");
  try {
    return fs.readFileSync(p, "utf8").trim();
  } catch {
    const token = randomBytes(32).toString("hex");
    fs.writeFileSync(p, token, { mode: 0o600 });
    return token;
  }
}
