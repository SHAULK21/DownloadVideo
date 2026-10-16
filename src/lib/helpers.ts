export function bytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "—";
  const i = Math.min(4, Math.floor(Math.log(n) / Math.log(1024)));
  return (
    (n / 1024 ** i).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) +
    " " +
    ["Б", "КБ", "МБ", "ГБ", "ТБ"][i]
  );
}
export function duration(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 60) return Math.ceil(n) + " с";
  if (n < 3600) return Math.floor(n / 60) + " мин " + Math.floor(n % 60) + " с";
  return Math.floor(n / 3600) + " ч " + Math.floor((n % 3600) / 60) + " мин";
}
export function allVisibleSelected(ids: string[], visible: string[]) {
  return visible.length > 0 && visible.every((id) => ids.includes(id));
}
export function expandBatch(text: string) {
  const results: string[] = [];
  for (const line of text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const m = line.match(/\[(\d+)-(\d+)\]/);
    if (!m) results.push(line);
    else {
      const start = Number(m[1]),
        end = Number(m[2]);
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        Math.abs(end - start) > 99
      )
        throw Error("В одном диапазоне допускается не более 100 ссылок.");
      const step = start <= end ? 1 : -1;
      for (let i = start; step > 0 ? i <= end : i >= end; i += step)
        results.push(line.replace(m[0], String(i).padStart(m[1].length, "0")));
    }
    if (results.length > 100)
      throw Error("За один раз можно добавить до 100 ссылок.");
  }
  for (const raw of results) {
    let u;
    try {
      u = new URL(raw);
    } catch {
      throw Error("Некорректная ссылка: " + raw);
    }
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
      throw Error("Нужна HTTP(S) ссылка без пароля: " + raw);
  }
  return [...new Set(results)];
}
