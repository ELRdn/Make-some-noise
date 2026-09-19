import { definitions, presets } from "./catalog";
import {
  applyPreset,
  createLayer,
  newProject,
  parseProject,
  serializeProject,
} from "./project";
import { NoiseRenderer } from "./renderer";
import type { BlendMode, Project } from "./types";
export interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}
const equal = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);
function stats(p: Uint8Array) {
  let sum = 0,
    sq = 0;
  for (let i = 0; i < p.length; i += 4) {
    const x = p[i] / 255;
    sum += x;
    sq += x * x;
  }
  const n = p.length / 4;
  return { mean: sum / n, sd: Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2)) };
}
export async function runGPUChecks(
  canvas: HTMLCanvasElement,
  report: (result: CheckResult) => void,
) {
  const r = new NoiseRenderer(canvas),
    g = r.gl;
  const check = (name: string, fn: () => string) => {
    try {
      const detail = fn();
      report({ name, passed: true, detail });
    } catch (e) {
      report({ name, passed: false, detail: String(e) });
    }
  };
  const assert = (condition: boolean, message: string) => {
    if (!condition) throw new Error(message);
  };
  const p = newProject();
  p.width = 256;
  p.height = 256;
  p.background = "transparent";
  const l = createLayer("uniform");
  l.seed = 42817;
  l.params = { ...l.params, scale: 1, amount: 1, detail: 8 };
  p.layers = [l];
  try {
    check("WebGL2 初期化・エラー", () => {
      r.render(p, 0, 256, 256);
      assert(g.getError() === g.NO_ERROR, "WebGLエラー");
      return `上限 ${r.maxSize}px`;
    });
    check("同一シード・時刻・寸法でピクセル一致", () => {
      r.render(p, 1.2, 256, 256);
      const a = r.pixels();
      r.render({ ...p, seed: 765 }, 9, 128, 128);
      r.render(p, 1.2, 256, 256);
      assert(equal(a, r.pixels()), "一致しません");
      return "全262,144 bytes一致";
    });
    check("異なるシード・時刻で結果が変化", () => {
      r.render(p, 0, 256, 256);
      const a = r.pixels();
      const q = structuredClone(p);
      q.layers[0].seed = 42818;
      r.render(q, 0, 256, 256);
      assert(!equal(a, r.pixels()), "seed不変");
      r.render(p, 1, 256, 256);
      assert(!equal(a, r.pixels()), "time不変");
      return "シード・時刻それぞれで差分あり";
    });
    check("均一ノイズの平均・標準偏差", () => {
      r.render(p, 0, 256, 256);
      const s = stats(r.pixels());
      assert(
        Math.abs(s.mean - 0.5) < 0.012 &&
          Math.abs(s.sd - Math.sqrt(1 / 12)) < 0.012,
        JSON.stringify(s),
      );
      return JSON.stringify(s);
    });
    check("ガウスノイズ σ=0.10 の分布", () => {
      const q = structuredClone(p);
      q.layers[0].kind = "gaussian";
      q.layers[0].params.amount = 0.1;
      r.render(q, 0, 256, 256);
      const s = stats(r.pixels());
      assert(
        Math.abs(s.mean - 0.5) < 0.008 && Math.abs(s.sd - 0.1) < 0.008,
        JSON.stringify(s),
      );
      return JSON.stringify(s);
    });
    check("ガウス σ=0 / RGB / 指定色", () => {
      const q = structuredClone(p);
      q.layers[0].kind = "gaussian";
      q.layers[0].params.amount = 0;
      r.render(q, 0, 256, 256);
      assert(stats(r.pixels()).sd < 0.002, "sigma=0が一定でない");
      q.layers[0].params.colorMode = "rgb";
      q.layers[0].params.amount = 0.2;
      r.render(q, 0, 256, 256);
      const a = r.pixels();
      assert(
        a.some((v, i) => i % 4 === 0 && v !== a[i + 1]),
        "RGBチャンネルが同じ",
      );
      q.layers[0].params.colorMode = "tint";
      q.layers[0].params.color = "#ff0000";
      r.render(q, 0, 256, 256);
      assert(
        r.pixels().every((v, i) => (i % 4 !== 1 && i % 4 !== 2) || v === 0),
        "tintに他色が混入",
      );
      return "ゼロ分散・独立チャンネル・赤指定を確認";
    });
    check("設定JSONの再読込でピクセル一致", () => {
      const q = applyPreset(p, presets[3]);
      r.render(q, 3.2, 256, 256);
      const a = r.pixels();
      const saved = parseProject(serializeProject(q, 3.2, 1));
      r.render(saved.project, saved.time, 256, 256);
      assert(equal(a, r.pixels()), "再読込で差分");
      return "レイヤーIDと時刻を含めて一致";
    });
    check("透明背景・非表示・不透明度ゼロ", () => {
      const q = { ...p, layers: [] };
      r.render(q, 0, 256, 256);
      assert(
        r.pixels().every((v) => v === 0),
        "背景が透明でない",
      );
      r.render({ ...p, layers: [{ ...l, visible: false }] }, 0, 256, 256);
      assert(
        r.pixels().every((v) => v === 0),
        "非表示レイヤーが残る",
      );
      r.render({ ...p, layers: [{ ...l, opacity: 0 }] }, 0, 256, 256);
      assert(
        r.pixels().every((v) => v === 0),
        "opacity 0が残る",
      );
      return "RGBAすべて0";
    });
    check("5種類の合成方法の数値一致", () => {
      for (const mode of [
        "normal",
        "multiply",
        "screen",
        "overlay",
        "soft-light",
      ] as BlendMode[]) {
        const q = structuredClone(p);
        q.background = "solid";
        q.backgroundColor = "#404040";
        q.layers[0].params.amount = 0;
        q.layers[0].blend = mode;
        const b = 64 / 255,
          s = 0.5;
        const expected =
          mode === "normal"
            ? s
            : mode === "multiply"
              ? b * s
              : mode === "screen"
                ? b + s - b * s
                : mode === "overlay"
                  ? 2 * b * s
                  : b;
        r.render(q, 0, 256, 256);
        assert(
          Math.abs(r.pixels()[0] / 255 - expected) < 0.009,
          `${mode}: ${r.pixels()[0]}`,
        );
      }
      return "CPU参照式との差 < 0.009";
    });
    check("レイヤーの合成順が結果に反映", () => {
      const a = createLayer("uniform"),
        b = createLayer("uniform");
      a.params = {
        ...a.params,
        amount: 0,
        colorMode: "tint",
        color: "#ff0000",
      };
      b.params = {
        ...b.params,
        amount: 0,
        colorMode: "tint",
        color: "#0000ff",
      };
      r.render({ ...p, layers: [a, b] }, 0, 256, 256);
      const first = r.pixels();
      r.render({ ...p, layers: [b, a] }, 0, 256, 256);
      assert(!equal(first, r.pixels()), "順序が反映されない");
      return "上のレイヤーの色で上書き";
    });
    check("変形効果だけでは透明部分を埋めない", () => {
      const q = {
        ...p,
        layers: ["sync", "rgb-shift", "glitch"].map((k) =>
          createLayer(k as "sync"),
        ),
      };
      r.render(q, 0, 256, 256);
      assert(
        r.pixels().every((v) => v === 0),
        "透明部分に色が発生",
      );
      return "変形後もRGBAすべて0";
    });
    check("28種類の生成と特性", () => {
      for (const d of definitions) {
        const q: Project = {
          ...p,
          background: "solid",
          backgroundColor: "#202030",
          layers: [createLayer(d.id)],
        };
        if (d.effect) q.layers.unshift(createLayer("marble"));
        q.layers.forEach((x) => {
          x.seed = 123;
          x.params.scale = Math.min(x.params.scale, 70);
        });
        r.render(q, 1.3, 256, 256);
        assert(g.getError() === g.NO_ERROR, `${d.id} GL error`);
        const a = r.pixels();
        assert(
          a.every((v, i) => i % 4 !== 3 || v === 255),
          `${d.id} opacity`,
        );
        if (d.id !== "flicker")
          assert(stats(a).sd > 0.001, `${d.id} output constant`);
      }
      return "28種類がエラーなく異なる濃淡を描画";
    });
    check("追加5種類のシード・設定復元・調整・透明素材", () => {
      for (const d of definitions.slice(20, 25)) {
        const q: Project = { ...p, seed: 123, layers: [createLayer(d.id)] };
        r.render(q, 1.3, 256, 256);
        const original = r.pixels();
        const restored = parseProject(serializeProject(q, 1.3, 1));
        r.render(restored.project, restored.time, 256, 256);
        assert(equal(original, r.pixels()), `${d.id} JSON restore`);
        r.render({ ...q, seed: 124 }, 1.3, 256, 256);
        assert(!equal(original, r.pixels()), `${d.id} seed unchanged`);
        for (const [key, value] of [
          ["amount", 0.1],
          ["scale", 20],
          ["detail", 1],
        ] as const) {
          const changed = structuredClone(q);
          changed.layers[0].params[key] = value;
          r.render(changed, 1.3, 256, 256);
          assert(!equal(original, r.pixels()), `${d.id} ${key} unchanged`);
        }
        if (d.id !== "grunge") {
          assert(
            original.some((v, i) => i % 4 === 3 && v < 128),
            `${d.id} missing transparency`,
          );
          assert(
            original.some((v, i) => i % 4 === 3 && v > 10),
            `${d.id} empty material`,
          );
        }
        if (["signal-noise", "glitch-flare", "color-film"].includes(d.id)) {
          const changed = structuredClone(q);
          changed.layers[0].params.colorMode = "mono";
          r.render(changed, 1.3, 256, 256);
          const mono = r.pixels();
          assert(
            mono.every(
              (v, i) => i % 4 !== 0 || (v === mono[i + 1] && v === mono[i + 2]),
            ),
            `${d.id} mono mismatch`,
          );
        }
      }
      return "5種類でJSONピクセル一致・シード差・3調整を確認。4種類の部分透明と3種類の白黒を確認";
    });
    check("生成エラー風2種類の再現性・時刻・調整", () => {
      for (const kind of ["latent-bloom", "decode-noise"] as const) {
        const q: Project = { ...p, seed: 739, layers: [createLayer(kind)] };
        r.render(q, 0.7, 256, 256);
        const original = r.pixels();
        const restored = parseProject(serializeProject(q, 0.7, 1));
        r.render(restored.project, restored.time, 256, 256);
        assert(equal(original, r.pixels()), `${kind} restore`);
        r.render({ ...q, seed: 740 }, 0.7, 256, 256);
        assert(!equal(original, r.pixels()), `${kind} seed`);
        r.render(q, 1.2, 256, 256);
        assert(!equal(original, r.pixels()), `${kind} time`);
        for (const [key, value] of [
          ["scale", 35],
          ["amount", 0.1],
          ["detail", 1],
        ] as const) {
          const changed = structuredClone(q);
          changed.layers[0].params[key] = value;
          r.render(changed, 0.7, 256, 256);
          assert(!equal(original, r.pixels()), `${kind} ${key}`);
        }
        const mono = structuredClone(q);
        mono.layers[0].params.colorMode = "mono";
        r.render(mono, 0.7, 256, 256);
        const pixels = r.pixels();
        assert(
          pixels.every(
            (v, i) =>
              i % 4 !== 0 || (v === pixels[i + 1] && v === pixels[i + 2]),
          ),
          `${kind} mono`,
        );
        assert(
          original.every((v, i) => i % 4 !== 3 || v === 255),
          `${kind} opaque surface`,
        );
      }
      return "2種類のJSON一致・シード差・時間差・3調整・白黒・不透明度を確認";
    });
    check("カラー砂嵐は色帯ゼロのデコード崩れと完全一致", () => {
      const snow = createLayer("color-snow"),
        decoder = createLayer("decode-noise");
      decoder.params.amount = 0;
      for (const seed of [0, 739, 42817])
        for (const time of [0, 0.7, 2.1]) {
          const q = { ...p, seed, layers: [snow] };
          r.render(q, time, 256, 256);
          const original = r.pixels();
          r.render({ ...q, layers: [decoder] }, time, 256, 256);
          assert(equal(original, r.pixels()), `seed=${seed} time=${time}`);
          const restored = parseProject(serializeProject(q, time, 1));
          r.render(restored.project, restored.time, 256, 256);
          assert(equal(original, r.pixels()), "snow restore");
        }
      return "共通シード3通り×時刻3通りでRGBA全ピクセル一致、設定JSON復元も一致";
    });
    check("連続ノイズは粒状ノイズより隣接差が小さい", () => {
      const rough = (a: Uint8Array) => {
        let sum = 0;
        for (let y = 0; y < 256; y++)
          for (let x = 0; x < 255; x++)
            sum += Math.abs(a[(y * 256 + x) * 4] - a[(y * 256 + x + 1) * 4]);
        return sum / (256 * 255);
      };
      r.render(p, 0, 256, 256);
      const grain = rough(r.pixels());
      for (const kind of ["value", "perlin", "simplex", "fbm"] as const) {
        r.render({ ...p, layers: [createLayer(kind)] }, 0, 256, 256);
        assert(rough(r.pixels()) < grain * 0.4, kind);
      }
      return "Value / Perlin / Simplex / fBmで連続性を確認";
    });
    check("高解像度出力とプレビューの座標整合", () => {
      const q = { ...p, width: 768, height: 768 };
      r.render(q, 0, 256, 256);
      const small = r.pixels();
      r.render(q, 0, 768, 768);
      const full = r.pixels();
      let mismatch = 0;
      for (let y = 0; y < 256; y++)
        for (let x = 0; x < 256; x++) {
          const a = (y * 256 + x) * 4,
            b = ((y * 3 + 1) * 768 + x * 3 + 1) * 4;
          for (let c = 0; c < 4; c++)
            if (small[a + c] !== full[b + c]) mismatch++;
        }
      assert(mismatch === 0, `${mismatch}差分`);
      return "3倍解像度の中心サンプルが完全一致";
    });
    // PNG roundtrip tests real encoding, alpha, orientation, and image containment.
    const source = document.createElement("canvas");
    source.width = 64;
    source.height = 128;
    const ctx = source.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "#0000ff";
    ctx.fillRect(0, 64, 64, 64);
    const image = new Image();
    image.src = source.toDataURL();
    await image.decode();
    check("画像の上下方向・中央配置・透明余白", () => {
      const q = { ...p, background: "image" as const, layers: [] };
      r.render(q, 0, 256, 256, image);
      const a = r.pixels(),
        pixel = (x: number, y: number) =>
          a.slice((y * 256 + x) * 4, (y * 256 + x) * 4 + 4);
      assert(pixel(128, 230)[0] === 255, "上が赤でない");
      assert(pixel(128, 20)[2] === 255, "下が青でない");
      assert(pixel(10, 128)[3] === 0, "余白が透明でない");
      return "縦長画像を中央配置、上下と余白が正しい";
    });
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNGなし")))),
    );
    const url = URL.createObjectURL(png);
    try {
      const decoded = new Image();
      decoded.src = url;
      await decoded.decode();
      check("PNGデコード後の寸法・色・透明度", () => {
        assert(
          decoded.naturalWidth === 256 && decoded.naturalHeight === 256,
          "PNG寸法",
        );
        source.width = 256;
        source.height = 256;
        ctx.drawImage(decoded, 0, 0);
        const top = ctx.getImageData(128, 20, 1, 1).data,
          left = ctx.getImageData(10, 128, 1, 1).data;
        assert(
          top[0] === 255 && top[3] === 255 && left[3] === 0,
          "PNGの色・alpha",
        );
        return `${png.size} bytes · 256×256 PNG、赤と透明を保持`;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
    for (const mime of ["image/jpeg", "image/webp"]) {
      const encoded = source.toDataURL(mime, 0.95),
        photo = new Image();
      photo.src = encoded;
      await photo.decode();
      check(`${mime} の画像デコード・描画`, () => {
        assert(
          encoded.startsWith(`data:${mime}`),
          "指定形式でエンコードされなかった",
        );
        r.render({ ...p, background: "image", layers: [] }, 0, 256, 256, photo);
        assert(g.getError() === g.NO_ERROR, "画像テクスチャのエラー");
        assert(stats(r.pixels()).sd > 0.1, "画像が失われた");
        return "256×256、濃淡・色のある画像を描画";
      });
    }
    const large = {
      ...p,
      width: Math.min(3840, r.maxSize),
      height: Math.min(2160, r.maxSize),
    };
    r.render(large, 2.5, large.width, large.height);
    const largeBlob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("4K PNGなし")))),
    );
    const largeUrl = URL.createObjectURL(largeBlob);
    try {
      const photo = new Image();
      photo.src = largeUrl;
      await photo.decode();
      check("4K PNGの生成・デコード", () => {
        assert(
          photo.naturalWidth === large.width &&
            photo.naturalHeight === large.height,
          "寸法不一致",
        );
        assert(g.getError() === g.NO_ERROR, "4K描画エラー");
        return `${photo.naturalWidth}×${photo.naturalHeight} · ${largeBlob.size} bytes`;
      });
    } finally {
      URL.revokeObjectURL(largeUrl);
    }
    const perf = applyPreset(newProject(), presets[1]);
    perf.width = 1024;
    perf.height = 640;
    for (let i = 0; i < 15; i++) r.render(perf, i / 60, 1024, 640);
    g.finish();
    const timings: number[] = [];
    const syncPixel = new Uint8Array(4);
    let wallStart = 0;
    for (let i = 0; i < 120; i++) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      if (i === 0) wallStart = performance.now();
      const start = performance.now();
      r.render(perf, i / 60, 1024, 640);
      // readPixels forces GPU completion; finish alone may return after command submission.
      g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, syncPixel);
      timings.push(performance.now() - start);
      if (performance.now() - wallStart > 6000) break;
    }
    const elapsed = performance.now() - wallStart;
    timings.sort((a, b) => a - b);
    const debug = g.getExtension("WEBGL_debug_renderer_info");
    const gpu = debug
      ? g.getParameter(debug.UNMASKED_RENDERER_WEBGL)
      : g.getParameter(g.RENDERER);
    report({
      name: "5レイヤー性能測定",
      passed: ((timings.length - 1) * 1000) / elapsed >= 30,
      detail: JSON.stringify({
        gpu,
        width: 1024,
        height: 640,
        layers: perf.layers.length,
        frames: timings.length,
        fps: Number((((timings.length - 1) * 1000) / elapsed).toFixed(1)),
        medianMs: timings[Math.floor(timings.length * 0.5)],
        p95Ms: timings[Math.floor(timings.length * 0.95)],
        userAgent: navigator.userAgent,
      }),
    });
  } finally {
    r.destroy();
  }
}
