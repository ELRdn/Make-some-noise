# Make Some Noise

**English** | [日本語](README.jp.md)

**Choose noise. Stack layers. Make textures.**

A browser-based texture studio with **28 noise types and effects** and **14 presets**. Generate seeded color noise, film scratches, RGB glitches, and abstract patterns that resemble failed image generation, or apply them to your own images.

All image processing runs on your device. No image uploads, accounts, or AI models are required. The app is intended for local use and currently has a **Japanese interface**.

## Getting started

### Requirements

- Node.js 22.12 or later and npm
- A desktop browser with WebGL2 support
- GPU acceleration available in the browser

If WebGL2 is unavailable, the app displays its requirements. See [Validation and known limitations](#validation-and-known-limitations) for browser testing status.

```sh
git clone https://github.com/ELRdn/Make-some-noise.git
cd Make-some-noise
npm ci
npm run dev
```

Open the local URL printed in your terminal, usually `http://127.0.0.1:5173/`. The development server binds only to `127.0.0.1`.

## Basic workflow

1. **Choose a sample** — Add noise from the library on the left, or choose a preset.
2. **Stack layers** — Adjust order, visibility, opacity, and blending in the panel on the right.
3. **Tune the texture** — Change grain size, intensity, color, and seed.
4. **Generate a PNG** — Choose output dimensions and a time, then select **PNGを書き出す** (Export PNG).

To process an existing image, select **画像を読み込む** (Load image) or drag and drop it into the center panel. Presets replace the current layers; Undo restores the previous state.

Use **設定を保存** (Save settings) to export a JSON project, then **設定を開く** (Open settings) to restore it later. Save your settings before reloading the page.

## All 28 noise types and effects

| Category | Types |
| --- | --- |
| Grain · 4 | Uniform, Gaussian, Salt & pepper, Color snow |
| Patterns · 8 | Value, Perlin, Simplex, Worley, Fractal clouds, Turbulence, Marble, Latent bloom |
| Film · 6 | Film grain, Scratches, Dust, Flicker, Film damage, Color film |
| Analog · 7 | Scanlines, Horizontal drift, RGB shift, Block glitch, RGB signal, Glitch flare, Decode noise |
| Textures · 3 | Paper fibers, Dither dots, Grunge scratches |

Every type has a preview, a short Japanese description, and default settings. Supported types offer monochrome, RGB, and custom-color modes.

### Color snow

**カラー砂嵐** (Color snow) isolates the fine colored static from Decode noise with its color-band strength set to zero. It produces no color bands and provides grain size, contrast, and brightness controls.

At the default contrast of **0.78** and brightness of **4**, it matches band-free Decode noise when seed, grain size, time, speed, and color settings match. Both types share the random sequence derived from the global seed.

### Grunge, film, and glowing textures

- **Grunge scratches**: fine intersecting scratches and worn surface grime.
- **Film damage**: irregular dust, fibers, and broken vertical scratches.
- **Color film**: red and blue color patches, fine grain, and surface wear.
- **RGB signal**: broken rainbow-colored horizontal bands separated by dark gaps.
- **Glitch flare**: bright smeared light and horizontal streaks with colored edges.

RGB signal and Glitch flare can generate textures without a source image.

### Generation-error textures

**Latent bloom** creates melted rainbow and white shapes separated by black gaps. **Decode noise** combines fine RGB static with color bands that change over time.

These are procedural visual effects inspired by failed image generation. They do not use an AI model or actual latent data.

## All 14 presets

| Preset | Japanese UI label |
| --- | --- |
| Old film | 古い映画 |
| VHS | VHS |
| Print grain | 印刷の粒 |
| Clouds | 雲 |
| Paper | 紙 |
| Color static | カラースタティック |
| Dark grunge | ダークグランジ |
| Dust film | ダストフィルム |
| RGB signal | RGBシグナル |
| Chroma blocks | クロマブロック |
| Glitch flare | グリッチフレア |
| Color film | カラーフィルム |
| Generation error | 生成エラー |
| Broken decode | 壊れたデコード |

Presets include layer combinations, blend modes, and opacity settings. Every layer remains editable after applying a preset.

## Layers, seeds, and preview

- Add, duplicate, delete, reorder, and toggle up to 50 layers. Layers at the top appear in front.
- Five blend modes: Normal, Multiply, Screen, Overlay, and Soft Light.
- Horizontal drift, RGB shift, and Block glitch transform the composite below them. Their blend mode cannot be changed; opacity controls their strength.
- Randomize the global seed or lock a seed per layer. Locked layers are unaffected by global randomization.
- Results are reproducible with the same app version, environment, settings, seed, time, and dimensions. Reordering layers does not change their random patterns.
- To give two layers of the same type different patterns, lock and change one layer's seed. Duplicating a layer locks its effective seed to preserve its pattern.
- The preview starts paused. Playback, pause, time entry, speed controls, fit-to-view, zoom, and 100% view are available.
- Fit-to-view uses a preview no larger than 1024px on its longest edge. At 100% zoom or above, rendering uses output resolution. Grain sizes use output-image coordinates.

Gaussian noise exposes **シグマ（粒の強さ）** (Sigma / grain strength). It uses Box–Muller samples centered at 0.5 and clips values to 0–1. At large sigma values or reduced grain density, the final image's standard deviation will differ from the requested sigma.

| Shortcut | Action |
| --- | --- |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z / Ctrl+Y | Redo |
| Space | Play / pause, outside input fields |

History retains the most recent 50 operations.

## Image input and export

### Input and output dimensions

Import PNG, JPEG, or WebP images up to 40MB. On initial import, the canvas adopts the image dimensions; images exceeding device limits are downscaled. After resizing the canvas, the image is centered and fitted entirely inside it.

Output dimensions range from **64 to 4096px per side**, with square, landscape, portrait, and other presets plus custom input. GPU texture and renderbuffer limits may reduce the maximum. Export renders at the requested dimensions with the current time frozen.

### Finished images and transparent textures

Choose a transparent, solid-color, or imported-image background. **背景を除いて保存** (Save without background) removes the image and solid-color background.

- Scratches, Dust, Film damage, RGB signal, Glitch flare, and Color film can produce partially transparent textures.
- Full-surface layers such as Clouds, Grunge scratches, Latent bloom, Decode noise, and Color snow remain opaque. Use Screen, Soft Light, or reduced opacity when compositing them over an image.
- Effects that transform underlying content do not appear on an empty transparent layer stack.

After generating a PNG, the app starts a download and keeps the generated image and a save link visible. If an in-app browser does not start the download, open the same local URL in a regular browser.

### Project JSON

The `make-some-noise` format, version 1, stores layers, colors, seeds, time, speed, and dimensions. **Source images and undo history are not included.** Projects that require a source image prompt you to select it again while preserving the saved canvas dimensions.

## Development

Built with React, TypeScript, Vite, and WebGL2. There is no public server API, and fonts use the device's system fonts.

```sh
npm test        # Unit tests for seeds, project format, history, and distributions
npm run build   # Type checking and production build
npm run preview # Preview the production build locally
```

| File | Purpose |
| --- | --- |
| `src/catalog.ts` | Types, descriptions, controls, defaults, and presets |
| `src/renderer.ts` | WebGL2 generation, image processing, and compositing |
| `src/project.ts` | Seeds, project validation, and history |
| `src/App.tsx` | Studio UI, image input, and export |
| `src/project.test.ts` | Unit tests |
| `src/gpuChecks.ts` | Rendering, reproducibility, PNG, and other GPU checks |
| `tests/fixtures/` | Test images and JSON files |

When adding a type, update `NoiseKind` in `src/types.ts`, the catalog, and the shader dispatch together. Append new types to preserve existing rendering IDs.

On the development server, open `/?diagnostics` to run GPU checks. `/?playback-check` plays the editor for five seconds and measures its frame count. Diagnostic pages are excluded from the production build.

## Validation and known limitations

The recorded results as of **2026-09-19** show **17 passing unit tests**, **23 passing GPU checks**, and successful type checking and production builds. Visual and interaction checks have also been performed in the Codex in-app browser.

- End-to-end interaction testing in standalone Windows Chrome and Edge remains incomplete.
- PNG generation and decoding, and JSON project restoration, have been verified. Completed browser downloads to disk have not been verified.
- The GPU diagnostic page and the regular editor have different playback performance. An unresolved editor playback issue remains; 30fps operation is not guaranteed.
- Pixel-identical output across different GPUs or browsers is not guaranteed.

See [docs/VALIDATION.md](docs/VALIDATION.md) for detailed measurements, conditions, and outstanding checks. The validation log is in Japanese.

## Initial release scope

The app supports still-image texture creation, image processing, and animated previews. Video import/export, audio noise, AI image generation, latent tensor export, fully seamless generation, and exact Photoshop processing parity are outside the current scope. There is no hosted deployment.
