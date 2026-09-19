import { definitions, getDefinition } from "./catalog";
import type { Layer, NoiseKind, Preset, Project, SavedProject } from "./types";

export const MAX_SIDE = 4096;
export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}
export function createLayer(kind: NoiseKind): Layer {
  const d = getDefinition(kind);
  return {
    id: crypto.randomUUID(),
    kind,
    name: d.name,
    visible: true,
    opacity: 1,
    blend: "normal",
    seed: null,
    params: { ...d.defaults },
  };
}
export function applyPreset(project: Project, preset: Preset): Project {
  return {
    ...project,
    title: preset.name,
    backgroundColor: preset.backgroundColor,
    layers: preset.layers.map((l) => ({
      ...createLayer(l.kind),
      ...l,
      params: { ...getDefinition(l.kind).defaults, ...l.params },
    })),
  };
}
export function newProject(): Project {
  return {
    version: 1,
    title: "無題のテクスチャ",
    width: 1600,
    height: 1000,
    seed: 42817,
    background: "solid",
    backgroundColor: "#202534",
    imageName: null,
    imageId: null,
    layers: [],
  };
}
// Stable identity, independent of stack position. Mirrors the shader's uint hash.
export function hash32(x: number): number {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}
export function layerSeed(project: Project, layer: Layer): number {
  if (layer.seed !== null) return layer.seed >>> 0;
  let id = 2166136261;
  // A newly created layer with the same kind/settings/seed must reproduce too.
  // UUIDs only identify editable layers; they must not introduce hidden randomness.
  // Color snow intentionally shares the exact band-free decoder grain pattern.
  const seedKind = layer.kind === "color-snow" ? "decode-noise" : layer.kind;
  for (const c of seedKind) id = Math.imul(id ^ c.charCodeAt(0), 16777619);
  return hash32(project.seed ^ id);
}
export function gaussianSample(a: number, b: number, sigma: number): number {
  return (
    Math.sqrt(-2 * Math.log(Math.max(a, 1 / 16777216))) *
    Math.cos(2 * Math.PI * b) *
    sigma
  );
}
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}
export function record<T>(state: History<T>, next: T): History<T> {
  if (JSON.stringify(next) === JSON.stringify(state.present)) return state;
  return {
    past: [...state.past, state.present].slice(-50),
    present: next,
    future: [],
  };
}
export function undo<T>(state: History<T>): History<T> {
  return state.past.length
    ? {
        past: state.past.slice(0, -1),
        present: state.past.at(-1)!,
        future: [state.present, ...state.future],
      }
    : state;
}
export function redo<T>(state: History<T>): History<T> {
  return state.future.length
    ? {
        past: [...state.past, state.present].slice(-50),
        present: state.future[0],
        future: state.future.slice(1),
      }
    : state;
}
const obj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const number = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const integer = (v: unknown, min: number, max: number) =>
  number(v, min, max) && Number.isInteger(v);
const color = (v: unknown) => typeof v === "string" && /^#[\da-f]{6}$/i.test(v);
export function parseProject(text: string): SavedProject {
  const fail = () => {
    throw new Error(
      "設定ファイルの形式または値が正しくありません（対応バージョン: 1）。",
    );
  };
  if (text.length > 2_000_000) return fail();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return fail();
  }
  if (
    !obj(value) ||
    value.format !== "make-some-noise" ||
    value.version !== 1 ||
    !number(value.time, 0, 86400) ||
    !number(value.speed, 0, 3) ||
    !obj(value.project)
  )
    return fail();
  const p = value.project;
  if (
    p.version !== 1 ||
    typeof p.title !== "string" ||
    p.title.length > 200 ||
    !integer(p.width, 64, MAX_SIDE) ||
    !integer(p.height, 64, MAX_SIDE) ||
    !integer(p.seed, 0, 4294967295) ||
    !["transparent", "solid", "image"].includes(String(p.background)) ||
    !color(p.backgroundColor) ||
    !(p.imageName === null || typeof p.imageName === "string") ||
    !Array.isArray(p.layers) ||
    p.layers.length > 50
  )
    return fail();
  const ids = new Set();
  const layers: Layer[] = p.layers.map((l: unknown) => {
    if (
      !obj(l) ||
      typeof l.id !== "string" ||
      l.id.length > 100 ||
      ids.has(l.id) ||
      typeof l.name !== "string" ||
      l.name.length > 200 ||
      !definitions.some((d) => d.id === l.kind) ||
      typeof l.visible !== "boolean" ||
      !number(l.opacity, 0, 1) ||
      !["normal", "multiply", "screen", "overlay", "soft-light"].includes(
        String(l.blend),
      ) ||
      !(l.seed === null || integer(l.seed, 0, 4294967295)) ||
      !obj(l.params)
    )
      return fail();
    ids.add(l.id);
    const q = l.params;
    if (
      !number(q.scale, 1, 200) ||
      !number(q.amount, 0, 1) ||
      !integer(q.detail, 1, 8) ||
      !number(q.speed, 0, 3) ||
      !["mono", "rgb", "tint"].includes(String(q.colorMode)) ||
      !color(q.color)
    )
      return fail();
    // Construct a clean object; do not retain unrecognized imported properties.
    return {
      id: l.id,
      kind: l.kind,
      name: l.name,
      visible: l.visible,
      opacity: l.opacity,
      blend: l.blend,
      seed: l.seed,
      params: {
        scale: q.scale,
        amount: q.amount,
        detail: q.detail,
        speed: q.speed,
        colorMode: q.colorMode,
        color: q.color,
      },
    } as Layer;
  });
  return {
    format: "make-some-noise",
    version: 1,
    time: value.time as number,
    speed: value.speed as number,
    project: {
      version: 1,
      title: p.title,
      width: p.width,
      height: p.height,
      seed: p.seed,
      background: p.background,
      backgroundColor: p.backgroundColor,
      imageName: p.imageName,
      imageId: null,
      layers,
    } as Project,
  };
}
export function serializeProject(
  project: Project,
  time: number,
  speed: number,
): string {
  return JSON.stringify(
    { format: "make-some-noise", version: 1, project, time, speed },
    null,
    2,
  );
}
