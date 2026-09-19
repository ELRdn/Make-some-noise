import { useRef, useState } from "react";
import { definitions, presets } from "./catalog";
import { applyPreset, createLayer, newProject } from "./project";
import { NoiseRenderer } from "./renderer";
import { runGPUChecks } from "./gpuChecks";
import type { CheckResult } from "./gpuChecks";
export default function Diagnostics() {
  const [results, setResults] = useState<CheckResult[]>([]),
    [running, setRunning] = useState(false),
    [samples, setSamples] = useState<{ name: string; url: string }[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  async function run() {
    setRunning(true);
    setResults([]);
    try {
      await runGPUChecks(canvas.current!, (result) =>
        setResults((old) => [...old, result]),
      );
      const r = new NoiseRenderer(canvas.current!),
        rows = [];
      for (const d of definitions) {
        const p = newProject();
        p.width = 640;
        p.height = 400;
        p.layers = [createLayer(d.id)];
        if (d.effect) p.layers.unshift(createLayer("marble"));
        r.render(p, 1.3, 320, 200);
        rows.push({ name: d.name, url: canvas.current!.toDataURL() });
      }
      for (const preset of presets) {
        const p = applyPreset(newProject(), preset);
        p.width = 640;
        p.height = 400;
        r.render(p, 1.3, 320, 200);
        rows.push({
          name: `プリセット: ${preset.name}`,
          url: canvas.current!.toDataURL(),
        });
      }
      r.destroy();
      setSamples(rows);
    } catch (e) {
      setResults((old) => [
        ...old,
        { name: "実行エラー", passed: false, detail: String(e) },
      ]);
    } finally {
      setRunning(false);
    }
  }
  return (
    <main style={{ maxWidth: 1300, margin: "0 auto", padding: 32 }}>
      <h1>描画・再現性の検証</h1>
      <p>開発用検証ページ。テストは実際のWebGL2出力とPNGを検証します。</p>
      <button
        className="primary-button"
        disabled={running}
        onClick={() => void run()}
      >
        {running ? "検証中…" : "検証を実行"}
      </button>
      <a href="/" style={{ marginLeft: 20 }}>
        スタジオに戻る
      </a>
      <canvas
        ref={canvas}
        aria-label="検証中の描画"
        style={{ display: "block", width: 320, height: 200, marginTop: 20 }}
      />
      <section aria-label="検証結果">
        <h2>
          {running
            ? "RUNNING"
            : results.length
              ? `${results.filter((x) => x.passed).length}/${results.length} PASS`
              : "未実行"}
        </h2>
        {results.map((r, i) => (
          <div
            key={i}
            style={{ borderBottom: "1px solid #333", padding: "10px 0" }}
          >
            <strong style={{ color: r.passed ? "#b9d9c7" : "#f5a4a8" }}>
              {r.passed ? "PASS" : "FAIL"} · {r.name}
            </strong>
            <pre
              style={{ whiteSpace: "pre-wrap", fontSize: 11, color: "#b4b3c8" }}
            >
              {r.detail}
            </pre>
          </div>
        ))}
      </section>
      <section
        aria-label="全種類の見本"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 16,
          marginTop: 32,
        }}
      >
        {samples.map((s) => (
          <figure key={s.name} style={{ margin: 0 }}>
            <img
              src={s.url}
              alt={s.name}
              style={{ width: "100%", borderRadius: 4 }}
            />
            <figcaption style={{ padding: 10 }}>{s.name}</figcaption>
          </figure>
        ))}
      </section>
    </main>
  );
}
