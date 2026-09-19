import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FolderOpen,
  ImagePlus,
  Layers,
  LockKeyhole,
  Maximize,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Search,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Undo2,
  UnlockKeyhole,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { definitions, getDefinition, presets } from "./catalog";
import {
  applyPreset,
  createLayer,
  layerSeed,
  newProject,
  parseProject,
  randomSeed,
  record,
  redo,
  serializeProject,
  undo,
} from "./project";
import type { History } from "./project";
import { NoiseRenderer } from "./renderer";
import type { Layer, NoiseKind, NoiseParams, Project } from "./types";

const blendLabels = {
  normal: "通常",
  multiply: "乗算",
  screen: "スクリーン",
  overlay: "オーバーレイ",
  "soft-light": "ソフトライト",
};
const playbackCheck =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).has("playback-check");
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  onEnd,
  unit = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  onEnd: () => void;
}) {
  return (
    <label className="slider-field">
      <span>
        {label}
        <span className="slider-value">
          <input
            aria-label={`${label} 数値`}
            type="number"
            min={min}
            max={max}
            step={step}
            value={Number(value.toFixed(3))}
            onChange={(e) => {
              if (e.target.value !== "")
                onChange(
                  Math.max(
                    min,
                    Math.min(
                      max,
                      Math.round((Number(e.target.value) - min) / step) * step +
                        min,
                    ),
                  ),
                );
            }}
            onBlur={onEnd}
          />
          {unit}
        </span>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={
          {
            "--fill": `${((value - min) / (max - min)) * 100}%`,
          } as React.CSSProperties
        }
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onEnd}
        onKeyUp={onEnd}
      />
    </label>
  );
}
function SizeInput({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      aria-label={label}
      type="number"
      min={64}
      max={max}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = Math.round(Math.max(64, Math.min(max, Number(draft) || 64)));
        setDraft(String(n));
        onChange(n);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
function seedValue(text: string) {
  return Math.min(4294967295, Math.max(0, Math.round(Number(text) || 0)));
}

function makeThumbnails(renderer: NoiseRenderer) {
  const thumbs: Record<string, string> = {};
  for (const d of definitions) {
    let p = newProject();
    p.width = 360;
    p.height = 230;
    p.seed = 42817;
    p.backgroundColor = "#20222c";
    const layer = createLayer(d.id);
    layer.id = `sample-${d.id}`;
    layer.params.scale = Math.max(1, layer.params.scale * 0.48);
    if (d.effect) {
      const base = createLayer("marble");
      base.id = "sample-base";
      base.params = {
        ...base.params,
        scale: 95,
        colorMode: "tint",
        color: "#b6a6e0",
      };
      p.layers = [base, layer];
    } else p.layers = [layer];
    renderer.render(p, 0.6, 180, 115);
    thumbs[d.id] = renderer.canvas.toDataURL();
  }
  for (const preset of presets) {
    const p = applyPreset(newProject(), preset);
    p.width = 600;
    p.height = 400;
    p.layers.forEach((l, i) => (l.id = `preset-${preset.id}-${i}`));
    renderer.render(p, 0.6, 180, 115);
    thumbs[`preset-${preset.id}`] = renderer.canvas.toDataURL();
  }
  return thumbs;
}

export default function App() {
  const [history, setHistory] = useState<History<Project>>(() => {
    const p = applyPreset(newProject(), presets[playbackCheck ? 1 : 3]);
    p.layers.forEach((l, i) => (l.id = `initial-cloud-${i}`));
    return { past: [], present: p, future: [] };
  });
  const project = history.present;
  const group = useRef<string | null>(null);
  const change = useCallback((fn: (p: Project) => Project, key?: string) => {
    const coalesce = !!key && group.current === key;
    group.current = key || null;
    setHistory((h) => {
      const next = fn(h.present);
      return coalesce ? { ...h, present: next } : record(h, next);
    });
  }, []);
  const end = () => {
    group.current = null;
  };
  const [selected, setSelected] = useState<string>("initial-cloud-0");
  const layer = project.layers.find((l) => l.id === selected);
  const definition = layer ? getDefinition(layer.kind) : null;
  const [tab, setTab] = useState<"noise" | "presets">("noise");
  const [category, setCategory] = useState("すべて");
  const [search, setSearch] = useState("");
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [time, setTimeState] = useState(0);
  const timeRef = useRef(0);
  const setTime = useCallback((value: number) => {
    timeRef.current = value;
    setTimeState(value);
  }, []);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(0);
  const [playbackResult, setPlaybackResult] = useState("未実行");
  const playbackFrames = useRef(0);
  const [zoom, setZoom] = useState<number | null>(null);
  const [stage, setStage] = useState({ width: 800, height: 650 });
  const [maxSize, setMaxSize] = useState(4096);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [transparentExport, setTransparentExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportResult, setExportResult] = useState<{
    url: string;
    name: string;
    size: number;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<NoiseRenderer | null>(null);
  const workRenderer = useRef<NoiseRenderer | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const settingsInput = useRef<HTMLInputElement>(null);
  const modal = useRef<HTMLDivElement>(null);
  const inspectorScroll = useRef<HTMLDivElement>(null);
  const assets = useRef(new Map<string, HTMLImageElement>());
  const image = project.imageId
    ? assets.current.get(project.imageId) || null
    : null;
  const fit = Math.min(
    stage.width / project.width,
    stage.height / project.height,
    1,
  );
  const displayScale = zoom ?? Math.max(0.05, fit);
  // 100% inspection uses full resolution; fit and small zooms use the lightweight preview.
  const renderScale =
    zoom !== null && zoom >= 1
      ? 1
      : Math.min(1, 1024 / Math.max(project.width, project.height));
  const renderWidth = Math.round(project.width * renderScale),
    renderHeight = Math.round(project.height * renderScale);
  const frameState = useRef({ project, image, renderWidth, renderHeight });
  frameState.current = { project, image, renderWidth, renderHeight };
  const updateLayer = (fn: (l: Layer) => Layer, key?: string) =>
    change(
      (p) => ({
        ...p,
        layers: p.layers.map((l) => (l.id === selected ? fn(l) : l)),
      }),
      key,
    );
  const param = <K extends keyof NoiseParams>(key: K, value: NoiseParams[K]) =>
    updateLayer(
      (l) => ({ ...l, params: { ...l.params, [key]: value } }),
      `${selected}-${key}`,
    );
  const doUndo = useCallback(() => {
    group.current = null;
    setHistory(undo);
  }, []);
  const doRedo = useCallback(() => {
    group.current = null;
    setHistory(redo);
  }, []);

  useEffect(() => {
    let preview: NoiseRenderer | undefined, work: NoiseRenderer | undefined;
    try {
      preview = new NoiseRenderer(canvas.current!);
      work = new NoiseRenderer(document.createElement("canvas"));
      renderer.current = preview;
      workRenderer.current = work;
      setMaxSize(Math.min(preview.maxSize, work.maxSize));
      setThumbs(makeThumbnails(work));
      setReady(true);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
    const lost = (e: Event) => {
      e.preventDefault();
      setPlaying(false);
      setReady(false);
      setError(
        "描画接続が失われました。設定を保存し、ページを再読み込みしてください。",
      );
    };
    const target = canvas.current;
    target?.addEventListener("webglcontextlost", lost);
    return () => {
      target?.removeEventListener("webglcontextlost", lost);
      preview?.destroy();
      work?.destroy();
      renderer.current = null;
      workRenderer.current = null;
    };
  }, []);
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setStage({ width: r.width, height: r.height });
    });
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!ready || playing) return;
    try {
      renderer.current?.render(project, time, renderWidth, renderHeight, image);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setPlaying(false);
    }
  }, [project, time, renderWidth, renderHeight, image, ready, playing]);
  useEffect(() => {
    if (!playing) {
      setTimeState(timeRef.current);
      return;
    }
    let id = 0,
      last = performance.now(),
      report = last,
      frames = 0,
      lastUI = last;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      timeRef.current = Math.min(86400, timeRef.current + dt * speed);
      const current = frameState.current;
      try {
        renderer.current?.render(
          current.project,
          timeRef.current,
          current.renderWidth,
          current.renderHeight,
          current.image,
        );
      } catch (e) {
        setError((e as Error).message);
        setPlaying(false);
        return;
      }
      // Canvas animation is independent of React. Update the time readout at 10 Hz.
      if (now - lastUI >= 100) {
        setTimeState(timeRef.current);
        lastUI = now;
      }
      frames++;
      playbackFrames.current++;
      if (now - report >= 1000) {
        setFps(Math.round((frames * 1000) / (now - report)));
        frames = 0;
        report = now;
      }
      if (timeRef.current >= 86400) setPlaying(false);
      else id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, speed]);
  useEffect(() => {
    if (!playbackCheck || !ready) return;
    playbackFrames.current = 0;
    setPlaying(true);
    setPlaybackResult("RUNNING");
    const start = performance.now();
    const timer = setTimeout(() => {
      setPlaying(false);
      setPlaybackResult(
        JSON.stringify({
          frames: playbackFrames.current,
          elapsedMs: performance.now() - start,
          fps: (playbackFrames.current * 1000) / (performance.now() - start),
          visibility: document.visibilityState,
        }),
      );
    }, 5000);
    return () => clearTimeout(timer);
  }, [ready]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (inspectorScroll.current) inspectorScroll.current.scrollTop = 0;
  }, [selected]);
  useEffect(() => {
    if (!exportOpen) setExportResult(null);
    setExportError("");
  }, [exportOpen]);
  useEffect(
    () => () => {
      if (exportResult) URL.revokeObjectURL(exportResult.url);
    },
    [exportResult],
  );
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (exportOpen) {
        if (e.key === "Escape" && !exporting) setExportOpen(false);
        if (e.key === "Tab") {
          const nodes = modal.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),a[href]",
          );
          if (nodes?.length) {
            const first = nodes[0],
              last = nodes[nodes.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }
        return;
      }
      const target = e.target as HTMLElement;
      if (target.matches("input,select,textarea,button")) {
        if (!(e.ctrlKey || e.metaKey)) return;
        if (target.matches("input,textarea")) return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        doRedo();
      }
      if (e.code === "Space" && ready) {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [doRedo, doUndo, exportOpen, exporting, ready]);
  useEffect(() => {
    const keep = new Set(
      [...history.past, history.present, ...history.future].map(
        (p) => p.imageId,
      ),
    );
    for (const id of assets.current.keys())
      if (!keep.has(id)) assets.current.delete(id);
  }, [history]);

  const add = (kind: NoiseKind) => {
    if (project.layers.length >= 50) {
      setNotice("レイヤーは50枚まで追加できます。");
      return;
    }
    const l = createLayer(kind);
    change((p) => ({ ...p, layers: [...p.layers, l] }));
    setSelected(l.id);
    setNotice(`${l.name}を追加しました`);
  };
  const move = (id: string, delta: number) =>
    change((p) => {
      const list = [...p.layers],
        i = list.findIndex((l) => l.id === id),
        j = i + delta;
      if (j < 0 || j >= list.length) return p;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...p, layers: list };
    });
  const loadImage = async (file?: File) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("PNG・JPEG・WebPの画像を選択してください。");
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      setError("画像は40MB以下にしてください。");
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      if (img.naturalWidth > maxSize || img.naturalHeight > maxSize) {
        const bitmap = document.createElement("canvas");
        const ratio = Math.min(
          maxSize / img.naturalWidth,
          maxSize / img.naturalHeight,
        );
        bitmap.width = Math.round(img.naturalWidth * ratio);
        bitmap.height = Math.round(img.naturalHeight * ratio);
        bitmap
          .getContext("2d")!
          .drawImage(img, 0, 0, bitmap.width, bitmap.height);
        img.src = bitmap.toDataURL("image/png");
        await img.decode();
        setNotice(`画像を長辺${maxSize}px以内に縮小しました`);
      }
      const id = crypto.randomUUID();
      assets.current.set(id, img);
      change((p) => ({
        ...p,
        background: "image",
        imageId: id,
        imageName: file.name,
        width:
          p.background === "image" && p.imageName && !p.imageId
            ? p.width
            : Math.max(64, img.naturalWidth),
        height:
          p.background === "image" && p.imageName && !p.imageId
            ? p.height
            : Math.max(64, img.naturalHeight),
      }));
      setZoom(null);
      setError("");
    } catch {
      setError(
        "画像を読み込めませんでした。別のPNG・JPEG・WebPを選択してください。",
      );
    } finally {
      URL.revokeObjectURL(url);
      if (imageInput.current) imageInput.current.value = "";
    }
  };
  const loadSettings = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 2_000_000)
        throw new Error("設定ファイルは2MB以下にしてください。");
      const saved = parseProject(await file.text());
      if (saved.project.width > maxSize || saved.project.height > maxSize)
        throw new Error(
          `この端末の上限は${maxSize}pxです。設定のサイズを小さくしてください。`,
        );
      change(() => saved.project);
      setTime(saved.time);
      setSpeed(saved.speed);
      setPlaying(false);
      setSelected(saved.project.layers.at(-1)?.id || "");
      setZoom(null);
      setError("");
      setNotice(
        saved.project.background === "image"
          ? "設定を読み込みました。元画像を再選択してください。"
          : "設定を読み込みました",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (settingsInput.current) settingsInput.current.value = "";
    }
  };
  const exportPNG = async () => {
    if (!workRenderer.current) return;
    if (project.background === "image" && !image && !transparentExport) {
      setExportError("完成画像を保存するには元画像を再選択してください。");
      return;
    }
    setPlaying(false);
    setExporting(true);
    setExportError("");
    const capturedTime = timeRef.current;
    const snapshot = project;
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      workRenderer.current.render(
        snapshot,
        capturedTime,
        snapshot.width,
        snapshot.height,
        image,
        transparentExport,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        workRenderer.current!.canvas.toBlob(
          (b) =>
            b
              ? resolve(b)
              : reject(
                  new Error(
                    "PNGを作成できません。サイズを小さくしてください。",
                  ),
                ),
          "image/png",
        ),
      );
      const name = `noise-${snapshot.seed}-${capturedTime.toFixed(2)}${transparentExport ? "-transparent" : ""}.png`;
      setExportResult({
        url: URL.createObjectURL(blob),
        name,
        size: blob.size,
      });
      download(blob, name);
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  const visibleDefinitions = definitions.filter(
    (d) =>
      (category === "すべて" || category === d.category) &&
      `${d.name} ${d.english} ${d.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );

  return (
    <div className="app-shell">
      {playbackCheck && (
        <output
          aria-label="編集画面の性能測定"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            zIndex: 99,
            background: "#171920",
            padding: 12,
          }}
        >
          {playbackResult}
        </output>
      )}
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => e.preventDefault()}
          aria-label="Make Some Noise"
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            make some <b>noise</b>
            <small>TEXTURE STUDIO</small>
          </span>
        </a>
        <div className="project-title">
          <span className="status-dot" />
          {project.title}
          <span className="project-tag">LOCAL</span>
        </div>
        <div className="header-actions">
          <button
            className="icon-button"
            title="元に戻す (Ctrl+Z)"
            aria-label="元に戻す"
            disabled={!history.past.length}
            onClick={doUndo}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-button"
            title="やり直す (Ctrl+Shift+Z)"
            aria-label="やり直す"
            disabled={!history.future.length}
            onClick={doRedo}
          >
            <Redo2 size={17} />
          </button>
          <span className="divider" />
          <button
            className="quiet-button"
            onClick={() => settingsInput.current?.click()}
            title="設定JSONを読み込む"
          >
            <FolderOpen size={16} />
            <span>設定を開く</span>
          </button>
          <button
            className="quiet-button"
            onClick={() =>
              download(
                new Blob([serializeProject(project, timeRef.current, speed)], {
                  type: "application/json",
                }),
                "noise-project.json",
              )
            }
          >
            <FileJson size={16} />
            <span>設定を保存</span>
          </button>
          <button
            className="primary-button"
            disabled={!ready}
            onClick={() => {
              setPlaying(false);
              setExportOpen(true);
            }}
          >
            <Download size={16} />
            PNGを書き出す
          </button>
        </div>
      </header>
      <div className="toolbar">
        <div className="toolbar-left">
          <button
            className="quiet-button"
            onClick={() => imageInput.current?.click()}
          >
            <ImagePlus size={16} />
            画像を読み込む
          </button>
          <span className="divider" />
          <span className="toolbar-label">CANVAS</span>
          <select
            aria-label="サイズプリセット"
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              const [width, height] = e.target.value.split("x").map(Number);
              change((p) => ({
                ...p,
                width: Math.min(maxSize, width),
                height: Math.min(maxSize, height),
              }));
              setZoom(null);
            }}
          >
            <option value="">カスタム</option>
            <option value="1024x1024">正方形 · 1024</option>
            <option value="1920x1080">横長 · 1920 × 1080</option>
            <option value="1080x1920">縦長 · 1080 × 1920</option>
            <option value="3840x2160">4K · 3840 × 2160</option>
          </select>
          <div className="size-inputs">
            <SizeInput
              label="キャンバスの幅"
              value={project.width}
              max={maxSize}
              onChange={(width) => change((p) => ({ ...p, width }))}
            />
            <span>×</span>
            <SizeInput
              label="キャンバスの高さ"
              value={project.height}
              max={maxSize}
              onChange={(height) => change((p) => ({ ...p, height }))}
            />
            <span>px</span>
          </div>
        </div>
        <div className="seed-control">
          <span className="toolbar-label">SEED</span>
          <input
            aria-label="共通シード"
            type="number"
            min={0}
            max={4294967295}
            value={project.seed}
            onChange={(e) =>
              change(
                (p) => ({ ...p, seed: seedValue(e.target.value) }),
                "global-seed",
              )
            }
            onBlur={end}
          />
          <button
            className="icon-button"
            aria-label="シードをランダム化"
            title="固定されていないレイヤーをランダム化"
            onClick={() => change((p) => ({ ...p, seed: randomSeed() }))}
          >
            <Shuffle size={16} />
          </button>
        </div>
      </div>
      <main className="workspace">
        <aside className="library">
          <div className="panel-heading">
            <span>ライブラリ</span>
            <span className="count">{definitions.length}種類</span>
          </div>
          <div className="library-tabs">
            <button
              className={tab === "noise" ? "active" : ""}
              onClick={() => setTab("noise")}
            >
              ノイズ
            </button>
            <button
              className={tab === "presets" ? "active" : ""}
              onClick={() => setTab("presets")}
            >
              <Sparkles size={13} />
              プリセット
            </button>
          </div>
          {tab === "noise" ? (
            <>
              <div className="search-box">
                <Search size={15} />
                <input
                  placeholder="ノイズを探す…"
                  aria-label="ノイズを検索"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="category-list">
                {[
                  "すべて",
                  "粒状",
                  "パターン",
                  "フィルム",
                  "アナログ",
                  "テクスチャ",
                ].map((c) => (
                  <button
                    key={c}
                    className={category === c ? "active" : ""}
                    onClick={() => setCategory(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="library-scroll">
                <div className="noise-grid">
                  {visibleDefinitions.map((d) => (
                    <button
                      className={`noise-card ${layer?.kind === d.id ? "selected" : ""}`}
                      key={d.id}
                      onClick={() => add(d.id)}
                      title={`${d.description} クリックで追加`}
                      aria-label={`${d.name}を追加`}
                    >
                      <div className="noise-sample">
                        {thumbs[d.id] && (
                          <img src={thumbs[d.id]} alt={`${d.name}の見本`} />
                        )}
                        <span className="sample-code">{d.code}</span>
                        <span className="add-badge">
                          <Plus size={14} />
                        </span>
                      </div>
                      <span className="noise-name">{d.name}</span>
                      <span className="noise-english">{d.english}</span>
                    </button>
                  ))}
                </div>
                {!visibleDefinitions.length && (
                  <p className="empty-state">
                    一致するノイズがありません。
                    <br />
                    別の名前で検索してください。
                  </p>
                )}
              </div>
              <div className="library-foot">
                <Plus size={13} />
                見本をクリックしてレイヤーに追加
              </div>
            </>
          ) : (
            <div className="library-scroll presets-list">
              <p className="helper">
                重ね方までセット。現在のレイヤーを置き換えます。元に戻す操作も使えます。
              </p>
              {presets.map((p) => (
                <button
                  className="preset-card"
                  key={p.id}
                  onClick={() => {
                    const next = applyPreset(project, p);
                    change(() => next);
                    setSelected(next.layers.at(-1)?.id || "");
                    setNotice(`「${p.name}」を適用しました`);
                  }}
                >
                  <img src={thumbs[`preset-${p.id}`]} alt={`${p.name}の見本`} />
                  <span>
                    <strong>{p.name}</strong>
                    <small>{p.description}</small>
                  </span>
                  <ChevronDown size={15} />
                </button>
              ))}
            </div>
          )}
        </aside>
        <section className="studio">
          <div className="studio-heading">
            <div>
              <span className="eyebrow">YOUR TEXTURE, YOUR RULES.</span>
              <h1>偶然を、デザインする。</h1>
            </div>
            <span className="preview-badge">
              <span className="status-dot" />
              {playing ? "LIVE PREVIEW" : "PREVIEW"}
            </span>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button aria-label="エラーを閉じる" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {project.background === "image" && !image && (
            <div className="missing-image" role="status">
              元画像「{project.imageName}」を再選択してください。
              <button onClick={() => imageInput.current?.click()}>
                画像を選ぶ
              </button>
            </div>
          )}
          <div
            className="viewport"
            ref={viewport}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void loadImage(e.dataTransfer.files[0]);
            }}
          >
            <div
              className="canvas-holder"
              style={{
                width: Math.round(project.width * displayScale),
                height: Math.round(project.height * displayScale),
              }}
            >
              <canvas
                ref={canvas}
                aria-label="ノイズのプレビュー"
                style={{ width: "100%", height: "100%" }}
              />
              <span className="canvas-corner tl" />
              <span className="canvas-corner tr" />
              <span className="canvas-corner bl" />
              <span className="canvas-corner br" />
            </div>
          </div>
          <div className="canvas-tools">
            <span className="canvas-dimensions">
              {project.width} × {project.height}
              <span>px</span>
            </span>
            <div className="zoom-controls">
              <button
                className="icon-button"
                aria-label="縮小"
                onClick={() => setZoom(Math.max(0.1, displayScale - 0.25))}
              >
                <ZoomOut size={15} />
              </button>
              <span>{Math.round(displayScale * 100)}%</span>
              <button
                className="icon-button"
                aria-label="拡大"
                onClick={() => setZoom(Math.min(4, displayScale + 0.25))}
              >
                <ZoomIn size={15} />
              </button>
              <span className="divider" />
              <button
                className={zoom === null ? "text-button active" : "text-button"}
                onClick={() => setZoom(null)}
              >
                <Maximize size={13} />
                フィット
              </button>
              <button
                className={zoom === 1 ? "text-button active" : "text-button"}
                onClick={() => setZoom(1)}
              >
                100%
              </button>
            </div>
          </div>
          <div className="transport">
            <button
              className={`play-button ${playing ? "playing" : ""}`}
              disabled={!ready}
              aria-label={playing ? "一時停止" : "再生"}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? <Pause size={19} /> : <Play size={19} />}
            </button>
            <button
              className="icon-button"
              aria-label="時刻をリセット"
              onClick={() => {
                setTime(0);
                setPlaying(false);
              }}
            >
              <RotateCcw size={16} />
            </button>
            <div className="time-input">
              <input
                aria-label="プレビュー時刻"
                type="number"
                min={0}
                max={86400}
                step={0.01}
                value={Number(time.toFixed(2))}
                onChange={(e) => {
                  setPlaying(false);
                  setTime(
                    Math.max(0, Math.min(86400, Number(e.target.value) || 0)),
                  );
                }}
              />
              <span>秒</span>
            </div>
            <div className="timeline">
              <input
                aria-label="タイムライン"
                type="range"
                min={0}
                max={Math.max(10, Math.ceil(time / 10) * 10)}
                step={0.01}
                value={time}
                onChange={(e) => {
                  setPlaying(false);
                  setTime(Number(e.target.value));
                }}
              />
              <div className="timeline-ticks">
                <span>0s</span>
                <span>時間で変わるノイズを試す</span>
                <span>{Math.max(10, Math.ceil(time / 10) * 10)}s</span>
              </div>
            </div>
            <select
              aria-label="再生速度"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={0.25}>0.25×</option>
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={3}>3×</option>
            </select>
          </div>
          <div className="studio-foot">
            <span>
              <span className="status-dot" />
              端末内で処理 · 画像は送信されません
            </span>
            <span>
              {playing ? `${fps} fps · ` : ""}
              {renderWidth} × {renderHeight} preview
            </span>
          </div>
        </section>
        <aside className="inspector">
          <div className="panel-heading">
            <span>
              <Layers size={15} />
              レイヤー
            </span>
            <span className="count">{project.layers.length}</span>
          </div>
          <div className="layer-stack">
            {[...project.layers].reverse().map((l, reverseIndex) => (
              <div
                key={l.id}
                className={`layer-row ${selected === l.id ? "selected" : ""}`}
              >
                <button
                  className="icon-button visibility"
                  aria-label={`${l.name}を${l.visible ? "非表示" : "表示"}`}
                  onClick={() =>
                    change((p) => ({
                      ...p,
                      layers: p.layers.map((x) =>
                        x.id === l.id ? { ...x, visible: !x.visible } : x,
                      ),
                    }))
                  }
                >
                  {l.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  className="layer-select"
                  aria-label={`${l.name}を選択`}
                  onClick={() => setSelected(l.id)}
                >
                  <img src={thumbs[l.kind]} alt="" />
                  <span>
                    <strong>{l.name}</strong>
                    <small>
                      {blendLabels[l.blend]} · {Math.round(l.opacity * 100)}%
                    </small>
                  </span>
                  {l.seed !== null && <LockKeyhole size={11} />}
                </button>
                <div className="layer-reorder">
                  <button
                    aria-label={`${l.name}を上へ`}
                    disabled={reverseIndex === 0}
                    onClick={() => move(l.id, 1)}
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    aria-label={`${l.name}を下へ`}
                    disabled={reverseIndex === project.layers.length - 1}
                    onClick={() => move(l.id, -1)}
                  >
                    <ArrowDown size={12} />
                  </button>
                </div>
              </div>
            ))}
            {!project.layers.length && (
              <p className="empty-state">
                左の見本から
                <br />
                最初のノイズを追加しましょう。
              </p>
            )}
          </div>
          <div className="layer-actions">
            <button
              className="text-button"
              onClick={() => {
                setTab("noise");
                setCategory("すべて");
                setSearch("");
              }}
            >
              <Plus size={14} />
              レイヤーを追加
            </button>
            <div>
              <button
                className="icon-button"
                aria-label="選択レイヤーを複製"
                disabled={!layer || project.layers.length >= 50}
                onClick={() => {
                  if (!layer) return;
                  const next = {
                    ...layer,
                    id: crypto.randomUUID(),
                    name: `${layer.name} コピー`,
                    seed: layerSeed(project, layer),
                    params: { ...layer.params },
                  };
                  change((p) => ({ ...p, layers: [...p.layers, next] }));
                  setSelected(next.id);
                }}
              >
                <Copy size={14} />
              </button>
              <button
                className="icon-button"
                aria-label="選択レイヤーを削除"
                disabled={!layer}
                onClick={() => {
                  change((p) => ({
                    ...p,
                    layers: p.layers.filter((l) => l.id !== selected),
                  }));
                  setSelected(
                    project.layers.filter((l) => l.id !== selected).at(-1)
                      ?.id || "",
                  );
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <div className="inspector-scroll" ref={inspectorScroll}>
            {layer && definition ? (
              <>
                <div className="adjustment-title">
                  <span>
                    <SlidersHorizontal size={14} />
                    調整
                  </span>
                  <button
                    className="icon-button"
                    aria-label="調整を初期値に戻す"
                    onClick={() =>
                      updateLayer((l) => ({
                        ...l,
                        params: { ...definition.defaults },
                      }))
                    }
                  >
                    <RotateCcw size={13} />
                  </button>
                </div>
                <div className="selected-noise">
                  <span className="eyebrow">
                    {definition.english.toUpperCase()}
                  </span>
                  <h2>{definition.name}</h2>
                  <p>{definition.description}</p>
                </div>
                <div className="adjustment-fields">
                  <label className="inline-field">
                    合成方法
                    <select
                      aria-label="合成方法"
                      value={layer.blend}
                      disabled={definition.effect}
                      onChange={(e) =>
                        updateLayer((l) => ({
                          ...l,
                          blend: e.target.value as Layer["blend"],
                        }))
                      }
                    >
                      {Object.entries(blendLabels).map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {definition.effect && (
                    <p className="helper">
                      下の合成画像を変形します。効果の量は不透明度で調整します。
                    </p>
                  )}
                  <Slider
                    label="不透明度"
                    value={layer.opacity * 100}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={(v) =>
                      updateLayer(
                        (l) => ({ ...l, opacity: v / 100 }),
                        `${selected}-opacity`,
                      )
                    }
                    onEnd={end}
                  />
                  <div className="field-divider" />
                  <Slider
                    label={definition.controls.scale}
                    value={layer.params.scale}
                    min={1}
                    max={200}
                    step={0.1}
                    unit={definition.id === "flicker" ? "" : "px"}
                    onChange={(v) => param("scale", v)}
                    onEnd={end}
                  />
                  <Slider
                    label={definition.controls.amount}
                    value={layer.params.amount}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => param("amount", v)}
                    onEnd={end}
                  />
                  <Slider
                    label={definition.controls.detail}
                    value={layer.params.detail}
                    min={1}
                    max={8}
                    onChange={(v) => param("detail", v)}
                    onEnd={end}
                  />
                  <Slider
                    label="動きの速さ"
                    value={layer.params.speed}
                    min={0}
                    max={3}
                    step={0.05}
                    onChange={(v) => param("speed", v)}
                    onEnd={end}
                  />
                  {!definition.effect && (
                    <>
                      <div className="field-divider" />
                      <label className="field-label">カラー</label>
                      <div className="segmented">
                        {(
                          [
                            ["mono", "白黒"],
                            ["rgb", "RGB"],
                            ["tint", "指定色"],
                          ] as const
                        )
                          .filter(
                            ([v]) =>
                              v !== "rgb" ||
                              [
                                "uniform",
                                "gaussian",
                                "salt-pepper",
                                "grain",
                                "value",
                                "perlin",
                                "simplex",
                                "worley",
                                "fbm",
                                "turbulence",
                                "marble",
                                "signal-noise",
                                "glitch-flare",
                                "color-film",
                                "latent-bloom",
                                "decode-noise",
                                "color-snow",
                              ].includes(layer.kind),
                          )
                          .map(([v, label]) => (
                            <button
                              key={v}
                              className={
                                layer.params.colorMode === v ? "active" : ""
                              }
                              onClick={() => {
                                param("colorMode", v);
                                end();
                              }}
                            >
                              {label}
                            </button>
                          ))}
                      </div>
                      {layer.params.colorMode === "tint" && (
                        <label className="color-field">
                          <input
                            aria-label="ノイズの色"
                            type="color"
                            value={layer.params.color}
                            onChange={(e) => param("color", e.target.value)}
                            onBlur={end}
                          />
                          <span>{layer.params.color.toUpperCase()}</span>
                        </label>
                      )}
                    </>
                  )}
                  <div className="field-divider" />
                  <div className="lock-field">
                    <span>
                      レイヤーのシード
                      <small>
                        {layer.seed === null
                          ? "共通シードに連動"
                          : "ランダム化しても変わりません"}
                      </small>
                    </span>
                    <button
                      className={
                        layer.seed === null
                          ? "lock-button"
                          : "lock-button locked"
                      }
                      aria-label={
                        layer.seed === null
                          ? "レイヤーのシードを固定"
                          : "レイヤーのシード固定を解除"
                      }
                      onClick={() =>
                        updateLayer((l) => ({
                          ...l,
                          seed: l.seed === null ? layerSeed(project, l) : null,
                        }))
                      }
                    >
                      {layer.seed === null ? (
                        <UnlockKeyhole size={14} />
                      ) : (
                        <LockKeyhole size={14} />
                      )}
                    </button>
                  </div>
                  {layer.seed !== null && (
                    <input
                      className="fixed-seed"
                      aria-label="固定シード"
                      type="number"
                      min={0}
                      max={4294967295}
                      value={layer.seed}
                      onChange={(e) =>
                        updateLayer(
                          (l) => ({ ...l, seed: seedValue(e.target.value) }),
                          `${selected}-seed`,
                        )
                      }
                      onBlur={end}
                    />
                  )}
                </div>
              </>
            ) : (
              <p className="empty-state">
                レイヤーを選ぶと
                <br />
                ここで細かく調整できます。
              </p>
            )}
            <div className="background-panel">
              <div className="adjustment-title">
                <span>背景</span>
              </div>
              <div className="segmented">
                {(
                  [
                    ["transparent", "透明"],
                    ["solid", "単色"],
                    ["image", "画像"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    className={project.background === v ? "active" : ""}
                    onClick={() => {
                      change((p) => ({ ...p, background: v }));
                      if (v === "image" && !image) imageInput.current?.click();
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {project.background === "solid" && (
                <label className="color-field">
                  <input
                    type="color"
                    aria-label="背景色"
                    value={project.backgroundColor}
                    onChange={(e) =>
                      change(
                        (p) => ({ ...p, backgroundColor: e.target.value }),
                        "background-color",
                      )
                    }
                    onBlur={end}
                  />
                  <span>{project.backgroundColor.toUpperCase()}</span>
                </label>
              )}
              {project.background === "image" && (
                <button
                  className="image-replace"
                  onClick={() => imageInput.current?.click()}
                >
                  <ImagePlus size={15} />
                  {project.imageName || "画像を選ぶ"}
                </button>
              )}
            </div>
          </div>
        </aside>
      </main>
      <input
        ref={imageInput}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => void loadImage(e.target.files?.[0])}
      />
      <input
        ref={settingsInput}
        hidden
        type="file"
        accept=".json,application/json"
        onChange={(e) => void loadSettings(e.target.files?.[0])}
      />
      {notice && (
        <div className="toast" role="status">
          <Check size={15} />
          {notice}
        </div>
      )}
      {exportOpen && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !exporting)
              setExportOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-title"
            ref={modal}
            className="export-modal"
          >
            <div className="modal-heading">
              <span className="eyebrow">EXPORT TEXTURE</span>
              <button
                className="icon-button"
                aria-label="書き出しを閉じる"
                disabled={exporting}
                onClick={() => setExportOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <h2 id="export-title">テクスチャを書き出す</h2>
            <p>いまの表情を、そのまま素材に。</p>
            {exportError && (
              <p className="export-error" role="alert">
                {exportError}
              </p>
            )}
            {exportResult ? (
              <div className="export-result">
                <img src={exportResult.url} alt="生成されたPNG" />
                <p role="status">
                  PNGを生成しました（{Math.round(exportResult.size / 1024)}{" "}
                  KB）。ダウンロードが始まらない場合は、下のリンクから保存できます。
                </p>
                <a
                  className="primary-button export-submit"
                  href={exportResult.url}
                  download={exportResult.name}
                >
                  <Download size={16} />
                  PNGをダウンロード
                </a>
                <button
                  className="quiet-button"
                  onClick={() => setExportResult(null)}
                >
                  書き出し設定に戻る
                </button>
              </div>
            ) : (
              <>
                <div className="export-summary">
                  <span>
                    PNG · {project.width} × {project.height}px
                  </span>
                  <span>{time.toFixed(2)} 秒</span>
                </div>
                <label className="export-option">
                  <input
                    type="checkbox"
                    checked={transparentExport}
                    onChange={(e) => setTransparentExport(e.target.checked)}
                  />
                  <span>
                    背景を除いて保存
                    <small>ノイズレイヤーだけを書き出します</small>
                  </span>
                </label>
                <p className="helper">
                  透明保存でも、雲や粒など画面を覆うレイヤーは不透明です。色ずれなどの変形は、下層の画像やノイズがある部分にだけ現れます。
                </p>
                <div className="export-limit">
                  この端末の上限：各辺 {maxSize}px ·
                  元画像は設定JSONに含まれません
                </div>
                <button
                  autoFocus
                  className="primary-button export-submit"
                  disabled={
                    exporting ||
                    project.width > maxSize ||
                    project.height > maxSize
                  }
                  onClick={() => void exportPNG()}
                >
                  <Download size={17} />
                  {exporting ? "PNGを作成中…" : "PNGを保存する"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
