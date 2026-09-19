export type NoiseKind =
  | "uniform"
  | "gaussian"
  | "salt-pepper"
  | "value"
  | "perlin"
  | "simplex"
  | "worley"
  | "fbm"
  | "turbulence"
  | "marble"
  | "grain"
  | "scratches"
  | "dust"
  | "flicker"
  | "scanlines"
  | "sync"
  | "rgb-shift"
  | "glitch"
  | "paper"
  | "dither"
  | "grunge"
  | "film-damage"
  | "signal-noise"
  | "glitch-flare"
  | "color-film"
  | "latent-bloom"
  | "decode-noise"
  | "color-snow";
export type BlendMode =
  "normal" | "multiply" | "screen" | "overlay" | "soft-light";
export type ColorMode = "mono" | "rgb" | "tint";
export interface NoiseParams {
  scale: number;
  amount: number;
  detail: number;
  speed: number;
  colorMode: ColorMode;
  color: string;
}
export interface NoiseDefinition {
  id: NoiseKind;
  code: string;
  name: string;
  english: string;
  category: string;
  description: string;
  defaults: NoiseParams;
  effect?: boolean;
  controls: { scale: string; amount: string; detail: string };
}
export interface Layer {
  id: string;
  kind: NoiseKind;
  name: string;
  visible: boolean;
  opacity: number;
  blend: BlendMode;
  seed: number | null;
  params: NoiseParams;
}
export interface Project {
  version: 1;
  title: string;
  width: number;
  height: number;
  seed: number;
  background: "transparent" | "solid" | "image";
  backgroundColor: string;
  imageName: string | null;
  imageId: string | null;
  layers: Layer[];
}
export interface Preset {
  id: string;
  name: string;
  description: string;
  backgroundColor: string;
  layers: {
    kind: NoiseKind;
    opacity?: number;
    blend?: BlendMode;
    params?: Partial<NoiseParams>;
  }[];
}
export interface SavedProject {
  format: "make-some-noise";
  version: 1;
  project: Project;
  time: number;
  speed: number;
}
