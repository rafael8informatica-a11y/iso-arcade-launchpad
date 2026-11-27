import type { Settings } from "./library";

/** Opções e rótulos compartilhados entre a tela de configurações e o dialog por jogo. */
export type Option<V extends string = string> = { value: V; label: string };

export function optionLabel<V extends string>(options: readonly Option<V>[], value: V): string {
  return options.find((o) => o.value === value)?.label ?? String(value);
}

export const RENDERER_OPTIONS: Option<Settings["renderer"]>[] = [
  { value: "vulkan", label: "Vulkan" },
  { value: "opengl", label: "OpenGL" },
  { value: "software", label: "Software" },
];

export const RESOLUTION_OPTIONS: Option<Settings["resolution"]>[] = [
  { value: "1", label: "1x nativa (480p)" },
  { value: "2", label: "2x (720p)" },
  { value: "3", label: "3x (1080p)" },
  { value: "4", label: "4x (1440p)" },
  { value: "6", label: "6x (4K) — só topo de linha" },
];

export const ASPECT_OPTIONS: Option<Settings["aspect"]>[] = [
  { value: "4:3", label: "4:3 (original)" },
  { value: "16:9", label: "16:9 (widescreen)" },
  { value: "stretch", label: "Esticar" },
];

export const EE_OPTIONS: Option<Settings["eeCycleRate"]>[] = [
  { value: "-2", label: "50% (mais leve)" },
  { value: "-1", label: "75%" },
  { value: "0", label: "100% (padrão)" },
  { value: "1", label: "130%" },
  { value: "2", label: "180%" },
];

export const BLENDING_OPTIONS: Option<Settings["blending"]>[] = [
  { value: "core", label: "Padrão do núcleo" },
  { value: "0", label: "Mínima (mais rápido)" },
  { value: "1", label: "Básica" },
  { value: "2", label: "Média" },
  { value: "3", label: "Alta (mais fiel)" },
];

export const PRELOADING_OPTIONS: Option<Settings["texturePreloading"]>[] = [
  { value: "core", label: "Padrão do núcleo" },
  { value: "0", label: "Desligado" },
  { value: "1", label: "Parcial (mais leve)" },
  { value: "2", label: "Total" },
];

export const ANISOTROPY_OPTIONS: Option<Settings["anisotropy"]>[] = [
  { value: "core", label: "Padrão do núcleo" },
  { value: "0", label: "Desligado" },
  { value: "2", label: "2x" },
  { value: "4", label: "4x" },
  { value: "8", label: "8x" },
  { value: "16", label: "16x (mais nítido)" },
];

export const COLOR_BOOST_OPTIONS: Option<Settings["colorBoost"]>[] = [
  { value: "off", label: "Desligado" },
  { value: "soft", label: "Suave" },
  { value: "vivid", label: "Vívido" },
];

export const AUTOSAVE_OPTIONS: Option<Settings["autoSaveMinutes"]>[] = [
  { value: "0", label: "Desligado" },
  { value: "3", label: "A cada 3 minutos" },
  { value: "5", label: "A cada 5 minutos" },
  { value: "10", label: "A cada 10 minutos" },
];

/** Intensidades de nitidez oferecidas por jogo (o global é um slider de 0 a 100). */
export const SHARPENING_OPTIONS: Option[] = [
  { value: "0", label: "Desligada" },
  { value: "25", label: "Suave (25)" },
  { value: "50", label: "Média (50)" },
  { value: "75", label: "Forte (75)" },
];

export const FXAA_OPTIONS: Option[] = [
  { value: "off", label: "Desligado" },
  { value: "on", label: "Ligado" },
];
