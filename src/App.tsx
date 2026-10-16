import React, { useState, useEffect, useRef } from "react";
import {
  Download,
  Plus,
  Play,
  Pause,
  Trash2,
  FolderOpen,
  Settings as SettingsIcon,
  Puzzle,
  Globe,
  Search,
  X,
  Check,
  RefreshCw,
  Film,
  Music,
  Copy,
  Menu,
  ArrowDownToLine,
  AlertTriangle,
  LoaderCircle,
} from "lucide-react";
import icon from "../desktop/assets/icon.png";
import type { State, Settings, Task, Stream } from "./types";
import { api, accessToken } from "./lib/api";
import {
  bytes,
  duration,
  expandBatch,
  allVisibleSelected,
} from "./lib/helpers";
const labels = {
  queued: "В очереди",
  downloading: "Скачивается",
  paused: "На паузе",
  merging: "Обработка",
  completed: "Сохранено",
  error: "Ошибка",
};
function chime() {
  try {
    const c = new AudioContext(),
      o = c.createOscillator(),
      g = c.createGain();
    o.connect(g);
    g.connect(c.destination);
    o.frequency.value = 784;
    g.gain.setValueAtTime(0.05, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);
    o.start();
    o.stop(c.currentTime + 0.25);
    o.onended = () => c.close();
  } catch {}
}
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    ref.current
      ?.querySelector<HTMLElement>("button,input,select,textarea")
      ?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const a = [
          ...ref.current!.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
          ),
        ].filter((el) => el.offsetParent !== null);
        if (!a.length) return;
        if (e.shiftKey && document.activeElement === a[0]) {
          a.at(-1)!.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === a.at(-1)) {
          a[0].focus();
          e.preventDefault();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      old?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button
            className="icon"
            aria-label="Закрыть"
            title="Закрыть"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
function AddDialog({
  settings,
  onClose,
  onAdded,
  report,
}: {
  settings: Settings;
  onClose: () => void;
  onAdded: () => void;
  report: (s: string) => void;
}) {
  const [mode, setMode] = useState<"single" | "batch" | "site">("single"),
    [url, setUrl] = useState(""),
    [batch, setBatch] = useState(""),
    [folder, setFolder] = useState(settings.defaultDownloadDir),
    [streams, setStreams] = useState<Stream[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [sending, setSending] = useState(false);
  const request = useRef<AbortController | null>(null),
    revision = useRef(0);
  useEffect(() => () => request.current?.abort(), []);
  function invalidate() {
    revision.current++;
    request.current?.abort();
    setBusy(false);
    setStreams([]);
    setSelected([]);
  }
  async function analyze() {
    const rev = ++revision.current;
    request.current?.abort();
    request.current = new AbortController();
    setBusy(true);
    setStreams([]);
    try {
      const d = await api<{ streams: Stream[] }>(
        "/api/analyze",
        "POST",
        { url, playlist: mode === "site" },
        request.current.signal,
      );
      if (rev !== revision.current) return;
      setStreams(d.streams);
      setSelected(
        mode === "site"
          ? d.streams.map((s) => s.id)
          : d.streams.length
            ? [d.streams[0].id]
            : [],
      );
      if (!d.streams.length)
        report("На этой странице не найдено доступных видео.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") report((e as Error).message);
    } finally {
      if (rev === revision.current) setBusy(false);
    }
  }
  async function add() {
    setSending(true);
    try {
      let items;
      if (mode === "batch")
        items = expandBatch(batch).map((url) => ({ url, saveFolder: folder }));
      else if (streams.length)
        items = streams
          .filter((s) => selected.includes(s.id))
          .map((s) => ({
            ...s,
            formatId: mode === "site" ? "auto" : s.id,
            saveFolder: folder,
          }));
      else items = expandBatch(url).map((url) => ({ url, saveFolder: folder }));
      if (!items.length) throw Error("Выберите хотя бы одну ссылку.");
      await api("/api/tasks", "POST", { items });
      onAdded();
      onClose();
    } catch (e) {
      report((e as Error).message);
    } finally {
      setSending(false);
    }
  }
  return (
    <Dialog title="Добавить загрузку" onClose={onClose}>
      <div className="tabs in-dialog">
        {(
          [
            ["single", "Одна ссылка"],
            ["batch", "Список ссылок"],
            ["site", "Страница / плейлист"],
          ] as const
        ).map(([key, text]) => (
          <button
            key={key}
            className={mode === key ? "active" : ""}
            onClick={() => {
              invalidate();
              setMode(key);
            }}
          >
            {text}
          </button>
        ))}
      </div>
      <div className="dialog-body">
        {mode === "batch" ? (
          <>
            <label>
              Ссылки — по одной на строку
              <textarea
                value={batch}
                onChange={(e) => setBatch(e.target.value)}
                rows={7}
                placeholder={
                  "https://site.com/video.mp4\nhttps://site.com/video_[01-10].mp4"
                }
              />
            </label>
            <p className="muted">
              До 100 ссылок за один раз. Поддерживаются диапазоны [01-10].
            </p>
          </>
        ) : (
          <>
            <label>
              {mode === "site"
                ? "Адрес страницы или плейлиста"
                : "Ссылка на видео, поток или страницу"}
              <div className="input-row">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => {
                    invalidate();
                    setUrl(e.target.value);
                  }}
                  placeholder="https://…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && url && !busy) analyze();
                  }}
                />
                <button onClick={analyze} disabled={busy || !url.trim()}>
                  {busy ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Search size={16} />
                  )}{" "}
                  {busy ? "Анализ…" : "Распознать"}
                </button>
              </div>
            </label>
            <p className="muted">
              Анализ реального источника может занять до двух минут.
            </p>
          </>
        )}
        {streams.length > 0 && (
          <div className="stream-list">
            {mode === "site" && (
              <button
                onClick={() =>
                  setSelected(
                    allVisibleSelected(
                      selected,
                      streams.map((s) => s.id),
                    )
                      ? []
                      : streams.map((s) => s.id),
                  )
                }
              >
                Выбрать все ({streams.length})
              </button>
            )}
            {streams.map((s) => (
              <label
                className={
                  "stream " + (selected.includes(s.id) ? "chosen" : "")
                }
                key={s.id}
              >
                <input
                  type={mode === "site" ? "checkbox" : "radio"}
                  name="stream"
                  checked={selected.includes(s.id)}
                  onChange={() =>
                    setSelected(
                      mode === "site"
                        ? selected.includes(s.id)
                          ? selected.filter((id) => id !== s.id)
                          : [...selected, s.id]
                        : [s.id],
                    )
                  }
                />
                <span>
                  <strong>{mode === "site" ? s.title : s.quality}</strong>
                  <small>
                    {s.format.toUpperCase()} ·{" "}
                    {s.filesize
                      ? (s.approximate ? "≈ " : "") + bytes(s.filesize)
                      : "Размер уточняется при скачивании"}
                  </small>
                </span>
              </label>
            ))}
          </div>
        )}
        <label>
          Папка сохранения
          <div className="input-row">
            <input value={folder} onChange={(e) => setFolder(e.target.value)} />
            <button
              title="Выбрать папку"
              onClick={async () => {
                try {
                  const r = await api("/api/choose-folder", "POST");
                  if (r.path) setFolder(r.path);
                } catch (e) {
                  report((e as Error).message);
                }
              }}
            >
              <FolderOpen size={16} />
            </button>
          </div>
        </label>
      </div>
      <footer>
        <button onClick={onClose}>Отмена</button>
        <button
          className="primary"
          disabled={
            busy ||
            sending ||
            (!url.trim() && mode !== "batch") ||
            (mode === "batch" && !batch.trim())
          }
          onClick={add}
        >
          <Plus size={16} />
          {sending
            ? "Добавление…"
            : settings.autoStartOnDetect
              ? "Начать скачивание"
              : "Добавить на паузе"}
        </button>
      </footer>
    </Dialog>
  );
}
function SettingsDialog({
  settings,
  onClose,
  onSaved,
  report,
}: {
  settings: Settings;
  onClose: () => void;
  onSaved: () => void;
  report: (s: string) => void;
}) {
  const [form, setForm] = useState({ ...settings }),
    [busy, setBusy] = useState(false);
  const number = (
    key: keyof Settings,
    min: number,
    max: number,
    label: string,
  ) => (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={Number(form[key])}
        onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
      />
    </label>
  );
  return (
    <Dialog title="Настройки" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("/api/settings", "PUT", form);
            onSaved();
            onClose();
          } catch (e) {
            report((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="dialog-body">
          <div className="settings-grid">
            {number("maxConcurrentDownloads", 1, 10, "Одновременно файлов")}
            {number("maxThreads", 1, 32, "Параллельных фрагментов HLS/DASH")}
            {number(
              "speedLimitKbps",
              0,
              1048576,
              "Общий предел скорости, КБ/с (0 — без лимита)",
            )}
            {number(
              "minFileSizeToCatchKb",
              0,
              1048576,
              "Минимальный размер для перехвата, КБ",
            )}
          </div>
          <p className="muted">
            Предел скорости распределяется консервативно между файлами и
            фрагментами. Сетевые настройки применяются с перезапуском и
            продолжением задач.
          </p>
          <label>
            Папка по умолчанию
            <div className="input-row">
              <input
                required
                value={form.defaultDownloadDir}
                onChange={(e) =>
                  setForm({ ...form, defaultDownloadDir: e.target.value })
                }
              />
              <button
                type="button"
                title="Выбрать папку"
                onClick={async () => {
                  try {
                    const r = await api("/api/choose-folder", "POST");
                    if (r.path)
                      setForm({ ...form, defaultDownloadDir: r.path });
                  } catch (e) {
                    report((e as Error).message);
                  }
                }}
              >
                <FolderOpen size={16} />
              </button>
            </div>
          </label>
          <label>
            Типы медиа для расширения
            <input
              value={form.interceptVideoTypes.join(", ")}
              onChange={(e) =>
                setForm({
                  ...form,
                  interceptVideoTypes: e.target.value
                    .split(",")
                    .map((s) => s.trim()),
                })
              }
            />
          </label>
          {(
            [
              [
                "autoStartOnDetect",
                "Начинать скачивание сразу после добавления",
              ],
              [
                "showFloatingButton",
                "Показывать кнопку расширения над плеером",
              ],
              ["soundOnComplete", "Звук после сохранения файла"],
            ] as const
          ).map(([key, text]) => (
            <label className="check" key={key}>
              <input
                type="checkbox"
                checked={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
              />
              {text}
            </label>
          ))}
        </div>
        <footer>
          <button type="button" onClick={onClose}>
            Отмена
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Сохранение…" : "Сохранить"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
export default function App() {
  const [state, setState] = useState<State | null>(null),
    [connected, setConnected] = useState(false),
    [error, setError] = useState(""),
    [tab, setTab] = useState("downloads"),
    [mobileMenu, setMobileMenu] = useState(false),
    [addOpen, setAddOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [preview, setPreview] = useState<Task | null>(null),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [kind, setKind] = useState("all"),
    [selected, setSelected] = useState<string[]>([]);
  const mounted = useRef(true),
    previous = useRef<Map<string, string> | null>(null),
    fetching = useRef(false);
  async function refresh() {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const d = await api<State>("/api/state");
      if (!mounted.current) return;
      if (
        previous.current &&
        d.settings.soundOnComplete &&
        d.tasks.some(
          (t) =>
            t.status === "completed" &&
            previous.current!.has(t.id) &&
            previous.current!.get(t.id) !== "completed",
        )
      )
        chime();
      previous.current = new Map(d.tasks.map((t) => [t.id, t.status]));
      setState(d);
      setConnected(true);
    } catch (e) {
      if (mounted.current) {
        setConnected(false);
        setError((e as Error).message);
      }
    } finally {
      fetching.current = false;
    }
  }
  useEffect(() => {
    mounted.current = true;
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => setSelected([]), [filter, kind, query]);
  const tasks = state?.tasks || [],
    visible = tasks.filter(
      (t) =>
        (filter === "all" || t.status === filter) &&
        (kind === "all" || t.category === kind) &&
        (!query.trim() ||
          (t.filename + " " + t.url + " " + t.quality)
            .toLowerCase()
            .includes(query.trim().toLowerCase())),
    ),
    chosen = selected.filter((id) => visible.some((t) => t.id === id)),
    speed = tasks.reduce((sum, t) => sum + t.speed, 0),
    active = tasks.filter((t) =>
      ["downloading", "merging"].includes(t.status),
    ).length,
    completed = tasks.filter((t) => t.status === "completed").length;
  async function action(url: string, method = "POST", body?: unknown) {
    try {
      await api(url, method, body);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function bulk(name: string) {
    for (const id of chosen)
      await action(
        "/api/tasks/" + id,
        name === "delete" ? "DELETE" : "POST",
        name === "delete" ? undefined : { action: name },
      );
    setSelected([]);
  }
  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setTab("downloads")}>
          <img src={icon} alt="" />
          <span>
            OmniGrab <small>3.1.0</small>
          </span>
        </button>
        <nav className={mobileMenu ? "open" : ""}>
          {[
            ["downloads", "Загрузки", Download],
            ["extension", "Расширение", Puzzle],
          ].map(([key, title, Icon]: any) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => {
                setTab(key);
                setMobileMenu(false);
              }}
            >
              <Icon size={16} />
              {title}
            </button>
          ))}
        </nav>
        <span className={"connection " + (connected ? "ok" : "")}>
          <i />
          {connected ? "Подключён" : "Нет соединения"}
        </span>
        <button
          className="icon"
          title="Настройки"
          aria-label="Настройки"
          disabled={!state}
          onClick={() => setSettingsOpen(true)}
        >
          <SettingsIcon size={19} />
        </button>
        <button
          className="primary add-top"
          disabled={!connected}
          onClick={() => setAddOpen(true)}
        >
          <Plus size={17} />
          <span>Добавить ссылку</span>
        </button>
        <button
          className="icon menu-toggle"
          title="Меню"
          aria-label="Меню"
          onClick={() => setMobileMenu(!mobileMenu)}
        >
          <Menu />
        </button>
      </header>
      {error && (
        <div className="notice error" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button
            className="icon"
            title="Скрыть сообщение"
            onClick={() => setError("")}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {state?.warning && <div className="notice">{state.warning}</div>}
      {tab === "downloads" ? (
        <>
          <section className="overview">
            <div>
              <span className="eyebrow">ВАШИ ФАЙЛЫ</span>
              <h1>Менеджер загрузок</h1>
              <p>Видео и аудио — с реальным прогрессом и сохранением на ПК.</p>
            </div>
            <div className="stats">
              <span>
                <strong>{active}</strong>активных
              </span>
              <span>
                <strong>{completed}</strong>сохранено
              </span>
              <span>
                <strong>{speed ? bytes(speed) + "/с" : "—"}</strong>скорость
              </span>
            </div>
          </section>
          <section className="workspace">
            <aside>
              <h3>Библиотека</h3>
              {[
                ["all", "Все файлы"],
                ["video", "Видео"],
                ["audio", "Аудио"],
              ].map(([v, title]) => (
                <button
                  className={kind === v ? "active" : ""}
                  key={v}
                  onClick={() => setKind(v)}
                >
                  {v === "audio" ? (
                    <Music size={17} />
                  ) : v === "video" ? (
                    <Film size={17} />
                  ) : (
                    <Download size={17} />
                  )}
                  <span>{title}</span>
                  <small>
                    {v === "all"
                      ? tasks.length
                      : tasks.filter((t) => t.category === v).length}
                  </small>
                </button>
              ))}
              <h3>Состояние</h3>
              {[
                ["all", "Все задачи"],
                ["downloading", "Скачиваются"],
                ["queued", "В очереди"],
                ["paused", "На паузе"],
                ["completed", "Сохранены"],
                ["error", "С ошибками"],
              ].map(([v, title]) => (
                <button
                  className={filter === v ? "active" : ""}
                  key={v}
                  onClick={() => setFilter(v)}
                >
                  <span>{title}</span>
                  <small>
                    {v === "all"
                      ? tasks.length
                      : tasks.filter((t) => t.status === v).length}
                  </small>
                </button>
              ))}
              <button
                className="folder-shortcut"
                onClick={() => action("/api/folder")}
                disabled={!connected}
              >
                <FolderOpen size={17} />
                Папка загрузок
              </button>
            </aside>
            <main>
              <div className="tools">
                <div className="bulk">
                  <label className="check">
                    <input
                      aria-label="Выбрать все видимые задачи"
                      type="checkbox"
                      checked={allVisibleSelected(
                        chosen,
                        visible.map((t) => t.id),
                      )}
                      onChange={() =>
                        setSelected(
                          allVisibleSelected(
                            chosen,
                            visible.map((t) => t.id),
                          )
                            ? []
                            : visible.map((t) => t.id),
                        )
                      }
                    />
                    {chosen.length ? `Выбрано ${chosen.length}` : "Выбрать"}
                  </label>
                  <button
                    title="Продолжить выбранные"
                    disabled={!chosen.length || !connected}
                    onClick={() => bulk("resume")}
                  >
                    <Play size={15} />
                    <span>Старт</span>
                  </button>
                  <button
                    title="Пауза выбранных"
                    disabled={!chosen.length || !connected}
                    onClick={() => bulk("pause")}
                  >
                    <Pause size={15} />
                    <span>Пауза</span>
                  </button>
                  <button
                    title="Удалить выбранные из списка (файлы останутся)"
                    disabled={!chosen.length || !connected}
                    onClick={() => bulk("delete")}
                  >
                    <Trash2 size={15} />
                  </button>
                  <button
                    onClick={() => action("/api/stop-all")}
                    disabled={!active || !connected}
                  >
                    Пауза всех
                  </button>
                  <button
                    title="Убрать сохранённые задачи из списка"
                    onClick={() => action("/api/clear")}
                    disabled={!completed || !connected}
                  >
                    Очистить
                  </button>
                </div>
                <label className="search">
                  <Search size={16} />
                  <input
                    placeholder="Поиск файлов…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="task-list">
                {!state ? (
                  <div className="empty">
                    <Globe size={36} />
                    <h2>Запустите OmniGrab.exe</h2>
                    <p>
                      Программа откроет интерфейс автоматически. Node.js и
                      Python устанавливать не нужно.
                    </p>
                    <button onClick={refresh}>
                      <RefreshCw size={16} />
                      Повторить подключение
                    </button>
                  </div>
                ) : visible.length === 0 ? (
                  <div className="empty">
                    <ArrowDownToLine size={42} />
                    <h2>
                      {tasks.length ? "Ничего не найдено" : "Готов к загрузке"}
                    </h2>
                    <p>
                      {tasks.length
                        ? "Измените поиск или фильтр."
                        : "Добавьте ссылку или отправьте видео из расширения браузера."}
                    </p>
                    <button
                      className="primary"
                      onClick={() => setAddOpen(true)}
                      disabled={!connected}
                    >
                      <Plus size={16} />
                      Добавить ссылку
                    </button>
                  </div>
                ) : (
                  visible.map((t) => {
                    const percent =
                      t.totalBytes > 0
                        ? Math.min(
                            t.status === "completed" ? 100 : 99,
                            Math.floor(
                              (t.downloadedBytes / t.totalBytes) * 100,
                            ),
                          )
                        : 0;
                    return (
                      <article className={"task " + t.status} key={t.id}>
                        <input
                          type="checkbox"
                          aria-label={"Выбрать " + t.filename}
                          checked={chosen.includes(t.id)}
                          onChange={() =>
                            setSelected(
                              chosen.includes(t.id)
                                ? chosen.filter((id) => id !== t.id)
                                : [...chosen, t.id],
                            )
                          }
                        />
                        <div className="file-icon">
                          {t.category === "audio" ? <Music /> : <Film />}
                        </div>
                        <div className="task-main">
                          <div className="task-title">
                            <strong title={t.outputPath || t.url}>
                              {t.filename}
                            </strong>
                            <span className={"status " + t.status}>
                              {t.status === "completed" && <Check size={12} />}{" "}
                              {labels[t.status]}
                            </span>
                          </div>
                          <p className="task-meta">
                            {t.quality} · {bytes(t.downloadedBytes)}
                            {t.totalBytes > 0
                              ? " / " +
                                (t.estimated ? "≈ " : "") +
                                bytes(t.totalBytes)
                              : " · размер уточняется"}
                          </p>
                          <div
                            className={
                              "progress " +
                              (!t.totalBytes && t.status === "downloading"
                                ? "indeterminate"
                                : "")
                            }
                          >
                            <div
                              style={{
                                width:
                                  t.status === "completed"
                                    ? "100%"
                                    : percent + "%",
                              }}
                            />
                          </div>
                          <div className="task-bottom">
                            <span>
                              {t.status === "downloading"
                                ? t.speed
                                  ? bytes(t.speed) + "/с"
                                  : "Подключение…"
                                : t.status === "merging"
                                  ? "Объединение дорожек / обработка"
                                  : t.saveFolder}
                            </span>
                            <span>
                              {t.fragmentCount > 0
                                ? `Фрагмент ${t.fragmentIndex}/${t.fragmentCount} · `
                                : ""}
                              {t.status === "downloading"
                                ? `Осталось ${duration(t.eta)}`
                                : t.status === "completed"
                                  ? "Файл на диске"
                                  : ""}
                            </span>
                          </div>
                          {t.errorMsg && (
                            <p className="task-error">{t.errorMsg}</p>
                          )}
                        </div>
                        <div className="task-actions">
                          {t.status !== "completed" && (
                            <button
                              className="icon"
                              title={
                                ["downloading", "merging", "queued"].includes(
                                  t.status,
                                )
                                  ? "Приостановить"
                                  : "Продолжить"
                              }
                              disabled={!connected}
                              onClick={() =>
                                action("/api/tasks/" + t.id, "POST", {
                                  action: [
                                    "downloading",
                                    "merging",
                                    "queued",
                                  ].includes(t.status)
                                    ? "pause"
                                    : "resume",
                                })
                              }
                            >
                              {["downloading", "merging", "queued"].includes(
                                t.status,
                              ) ? (
                                <Pause size={17} />
                              ) : (
                                <Play size={17} />
                              )}
                            </button>
                          )}
                          {t.status === "completed" && (
                            <button
                              className="icon"
                              title="Воспроизвести сохранённый файл"
                              onClick={() => setPreview(t)}
                            >
                              <Play size={17} />
                            </button>
                          )}
                          <button
                            className="icon"
                            title="Открыть папку"
                            onClick={() =>
                              action("/api/folder", "POST", { id: t.id })
                            }
                          >
                            <FolderOpen size={17} />
                          </button>
                          <button
                            className="icon danger"
                            title="Удалить из списка (файл останется)"
                            disabled={!connected}
                            onClick={() =>
                              action("/api/tasks/" + t.id, "DELETE")
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
              <div className="list-footer">
                <span>
                  {visible.length} задач ·{" "}
                  {state?.settings.maxConcurrentDownloads || 0} одновременно
                </span>
                <span>Очередь сохраняется между запусками</span>
              </div>
            </main>
          </section>
        </>
      ) : (
        <section className="extension-page">
          <div className="extension-hero">
            <div className="big-icon">
              <Puzzle size={32} />
            </div>
            <span className="eyebrow">
              CHROME · EDGE · BRAVE · OPERA · YANDEX
            </span>
            <h1>Заберите видео из браузера</h1>
            <p>
              Расширение находит медиапотоки и отправляет выбранный адрес в
              запущенный OmniGrab.
            </p>
            <a className="button primary" href="/extension.zip" download>
              <Download size={18} />
              Скачать расширение ZIP
            </a>
          </div>
          <div className="setup-grid">
            <div className="panel">
              <h2>
                <span className="step">1</span>Установите расширение
              </h2>
              <ol>
                <li>Скачайте и распакуйте ZIP в отдельную папку.</li>
                <li>
                  Откройте <code>chrome://extensions</code> или{" "}
                  <code>edge://extensions</code>.
                </li>
                <li>
                  Включите «Режим разработчика» → «Загрузить распакованное».
                </li>
                <li>Выберите папку с manifest.json.</li>
              </ol>
              <p className="muted">
                После установки папку расширения не удаляйте.
              </p>
            </div>
            <div className="panel">
              <h2>
                <span className="step">2</span>Подключите к программе
              </h2>
              <p>В значке расширения введите код:</p>
              <div className="pair-code">
                {state?.pairing?.code || "— — — — — —"}
                <button
                  className="icon"
                  title="Скопировать код"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        state?.pairing?.code || "",
                      );
                    } catch {
                      setError("Введите код вручную.");
                    }
                  }}
                >
                  <Copy size={19} />
                </button>
              </div>
              <button
                onClick={() => action("/api/pair-code")}
                disabled={!connected}
              >
                <RefreshCw size={15} />
                Обновить код
              </button>
              <p className="muted">
                Код действует 10 минут. Повторное подключение обычно не
                требуется.
              </p>
            </div>
            <div className="panel wide">
              <h2>
                <span className="step">3</span>Начните скачивание
              </h2>
              <p>
                Включите видео на сайте и нажмите кнопку OmniGrab над плеером
                или выберите поток в значке расширения. Для выбора качества
                используйте «Распознать» в программе.
              </p>
              <p className="muted">
                Для blob-плеера отправляется адрес страницы. DRM не
                поддерживается. Некоторые сайты требуют вход или ограничивают
                загрузку.
              </p>
            </div>
          </div>
        </section>
      )}
      <footer className="app-footer">
        <span>
          {state?.desktop
            ? "Закрытие окна сворачивает в трей · загрузки продолжаются"
            : "OmniGrab 3.1 · Загрузчик для ПК"}
        </span>
        {state?.desktop && (
          <button
            onClick={() => action("/api/app", "POST", { action: "quit" })}
          >
            Выйти из программы
          </button>
        )}
        <a href="/THIRD_PARTY_NOTICES.txt" target="_blank" rel="noreferrer">
          yt-dlp + FFmpeg · лицензии
        </a>
      </footer>
      {addOpen && state && (
        <AddDialog
          settings={state.settings}
          onClose={() => setAddOpen(false)}
          onAdded={refresh}
          report={setError}
        />
      )}{" "}
      {settingsOpen && state && (
        <SettingsDialog
          settings={state.settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={refresh}
          report={setError}
        />
      )}{" "}
      {preview && (
        <Dialog title={preview.filename} onClose={() => setPreview(null)}>
          <div className="dialog-body">
            {preview.category === "audio" ? (
              <audio
                controls
                autoPlay
                src={
                  "/api/tasks/" + preview.id + "/file?token=" + accessToken()
                }
              />
            ) : (
              <video
                controls
                autoPlay
                src={
                  "/api/tasks/" + preview.id + "/file?token=" + accessToken()
                }
              />
            )}
            <p className="muted">{preview.outputPath}</p>
          </div>
        </Dialog>
      )}
    </div>
  );
}
