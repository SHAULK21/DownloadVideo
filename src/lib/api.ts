const hash = new URLSearchParams(location.hash.slice(1));
if (hash.has("token")) {
  sessionStorage.setItem("omnigrab-token", hash.get("token")!);
  history.replaceState(null, "", location.pathname + location.search);
}
export const accessToken = () => sessionStorage.getItem("omnigrab-token") || "";
export async function api<T = any>(
  url: string,
  method = "GET",
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: "Bearer " + accessToken(),
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    signal,
  });
  let value: any;
  try {
    value = await response.json();
  } catch {
    throw Error("Программа не отвечает. Запустите OmniGrab.exe.");
  }
  if (!response.ok) throw Error(value.error || "Ошибка " + response.status);
  return value;
}
