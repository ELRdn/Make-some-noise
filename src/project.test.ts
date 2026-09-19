import { describe, expect, it } from "vitest";
import { definitions, presets } from "./catalog";
import {
  applyPreset,
  createLayer,
  gaussianSample,
  hash32,
  layerSeed,
  newProject,
  parseProject,
  record,
  redo,
  serializeProject,
  undo,
} from "./project";
import type { History } from "./project";

describe("ノイズの定義", () => {
  it("28種類のIDと説明・初期値を持つ", () => {
    expect(definitions).toHaveLength(28);
    expect(new Set(definitions.map((d) => d.id)).size).toBe(28);
    for (const d of definitions) {
      expect(d.description.length).toBeGreaterThan(10);
      expect(d.defaults.scale).toBeGreaterThanOrEqual(1);
      expect(d.defaults.scale).toBeLessThanOrEqual(200);
    }
  });
  it("14プリセットが有効なノイズだけを使用する", () => {
    expect(presets).toHaveLength(14);
    for (const preset of presets) {
      const p = applyPreset(newProject(), preset);
      expect(p.layers.length).toBeGreaterThan(1);
      expect(parseProject(serializeProject(p, 0, 1)).project.layers).toEqual(
        p.layers,
      );
    }
  });
});
describe("シードとノイズ分布", () => {
  it("作り直した同じ種類のレイヤーも同じシードを使う", () => {
    const p = newProject();
    expect(layerSeed(p, createLayer("gaussian"))).toBe(
      layerSeed(p, createLayer("gaussian")),
    );
    expect(layerSeed(p, createLayer("gaussian"))).not.toBe(
      layerSeed(p, createLayer("uniform")),
    );
  });
  it("ハッシュはunsigned 32bitで再現する", () => {
    expect(hash32(123)).toBe(hash32(123));
    expect(hash32(123)).not.toBe(hash32(124));
    expect(hash32(-1)).toBeGreaterThanOrEqual(0);
  });
  it("同じレイヤーのシードは並べ替えで変わらない", () => {
    const p = newProject(),
      a = createLayer("uniform"),
      b = createLayer("gaussian");
    p.layers = [a, b];
    const seed = layerSeed(p, a);
    p.layers.reverse();
    expect(layerSeed(p, a)).toBe(seed);
    expect(layerSeed({ ...p, seed: p.seed + 1 }, a)).not.toBe(seed);
  });
  it("固定したシードは共通シードから独立する", () => {
    const p = newProject(),
      a = createLayer("uniform");
    a.seed = 0;
    expect(layerSeed(p, a)).toBe(0);
    expect(layerSeed({ ...p, seed: 9999 }, a)).toBe(0);
  });
  it("Box–Mullerの平均と標準偏差が設定に沿う", () => {
    let sum = 0,
      squares = 0;
    const n = 100000,
      sigma = 0.18;
    for (let i = 0; i < n; i++) {
      const x = gaussianSample(
        (hash32(i * 2) >>> 8) / 16777216,
        (hash32(i * 2 + 1) >>> 8) / 16777216,
        sigma,
      );
      sum += x;
      squares += x * x;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.003);
    expect(Math.sqrt(squares / n - (sum / n) ** 2)).toBeCloseTo(sigma, 2);
  });
});
describe("履歴", () => {
  it("50操作まで保持し、undo・redoで戻せる", () => {
    let h: History<number> = { past: [], present: 0, future: [] };
    for (let i = 1; i <= 60; i++) h = record(h, i);
    expect(h.past).toHaveLength(50);
    h = undo(h);
    expect(h.present).toBe(59);
    h = redo(h);
    expect(h.present).toBe(60);
  });
  it("undo後の新規編集はredo履歴を破棄する", () => {
    let h: History<number> = { past: [1], present: 2, future: [] };
    h = record(undo(h), 3);
    expect(h.future).toEqual([]);
    expect(redo(h).present).toBe(3);
  });
  it("同値の変更は履歴を増やさない", () => {
    const h = { past: [], present: { a: 1 }, future: [] };
    expect(record(h, { a: 1 })).toBe(h);
  });
});
describe("設定の入出力", () => {
  const valid = () => {
    const p = applyPreset(newProject(), presets[0]);
    return serializeProject(p, 12.5, 0.5);
  };
  it("シード・色・レイヤー・時刻・再生速度を復元する", () => {
    const text = valid(),
      p = parseProject(text);
    expect(serializeProject(p.project, p.time, p.speed)).toBe(text);
  });
  it("外部画像を埋め込まず、再選択する状態で読み込む", () => {
    const p = {
      ...newProject(),
      background: "image" as const,
      imageName: "photo.png",
      imageId: "local-image-1",
    };
    const result = parseProject(serializeProject(p, 0, 1));
    expect(result.project.imageName).toBe("photo.png");
    expect(result.project.imageId).toBeNull();
  });
  it.each(["width", "height", "seed"])(
    "範囲外または小数の %s を拒否する",
    (field) => {
      const v = JSON.parse(valid());
      v.project[field] = -1;
      expect(() => parseProject(JSON.stringify(v))).toThrow();
      v.project[field] = 64.5;
      expect(() => parseProject(JSON.stringify(v))).toThrow();
    },
  );
  it("不明な種類、重複ID、無効な色、範囲外パラメーターを拒否する", () => {
    for (const mutation of [
      (v: any) => (v.project.layers[0].kind = "unknown"),
      (v: any) => (v.project.layers[1].id = v.project.layers[0].id),
      (v: any) => (v.project.layers[0].params.color = "red"),
      (v: any) => (v.project.layers[0].params.amount = 9),
      (v: any) => (v.project.layers[0].params.detail = 1.5),
    ]) {
      const v = JSON.parse(valid());
      mutation(v);
      expect(() => parseProject(JSON.stringify(v))).toThrow();
    }
  });
  it("破損JSON・新しすぎるバージョン・巨大ファイルを拒否する", () => {
    expect(() => parseProject("{")).toThrow();
    const v = JSON.parse(valid());
    v.version = 2;
    expect(() => parseProject(JSON.stringify(v))).toThrow();
    expect(() => parseProject(" ".repeat(2_000_001))).toThrow();
  });
});
