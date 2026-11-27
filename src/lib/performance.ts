import type { GameOverridePatch, Settings } from "./library";

export const performanceProfiles = {
  light: { resolution: "1", eeCycleRate: "-1", frameSkip: 0 },
  balanced: { resolution: "2", eeCycleRate: "0", frameSkip: 0 },
  quality: { resolution: "3", eeCycleRate: "0", frameSkip: 0 },
  /** ~4K (6x). Só para aparelhos topo de linha. */
  ultra: { resolution: "6", eeCycleRate: "0", frameSkip: 0 },
} as const;

export type PerformanceProfile = keyof typeof performanceProfiles;

export const PROFILE_LABELS: Record<PerformanceProfile, string> = {
  light: "Mais leve",
  balanced: "Equilibrado",
  quality: "Mais nitidez",
  ultra: "Realista 4K",
};

const NEUTRAL_VISUALS = {
  blending: "core",
  texturePreloading: "core",
  anisotropy: "core",
  fxaa: false,
  sharpening: 0,
  colorBoost: "off",
} as const;

/** Cada perfil também zera os ajustes de imagem, para trocar de perfil não deixar sobras do anterior. */
const PROFILE_VISUALS: Record<PerformanceProfile, Partial<Settings>> = {
  light: { ...NEUTRAL_VISUALS, blending: "0", texturePreloading: "1" },
  balanced: NEUTRAL_VISUALS,
  quality: NEUTRAL_VISUALS,
  ultra: { blending: "3", texturePreloading: "2", anisotropy: "16", fxaa: false, sharpening: 40, colorBoost: "soft" },
};

export function performancePatch(profile: PerformanceProfile): Partial<Settings> {
  return {
    ...performanceProfiles[profile],
    ...PROFILE_VISUALS[profile],
    renderer: "vulkan",
    speedHacks: true,
    mtvu: true,
    skipDuplicateFrames: true,
    vsync: false,
    fastCdvd: false,
  };
}

export function isGameFile(name: string): boolean {
  return /\.(iso|bin|chd|cso|img|gz)$/i.test(name);
}

// ---------------------------------------------------------------------------------------
// Sugestão de perfil para o aparelho
// ---------------------------------------------------------------------------------------

export type DeviceInfo = { cores: number | null; memoryGb: number | null };

type NavigatorLike = { hardwareConcurrency?: number; deviceMemory?: number };

/** Lê núcleos e memória que o WebView informa. É uma estimativa: não enxerga a GPU. */
export function detectDevice(nav?: NavigatorLike): DeviceInfo {
  const n: NavigatorLike = nav ?? (typeof navigator !== "undefined" ? (navigator as NavigatorLike) : {});
  const positive = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  return { cores: positive(n.hardwareConcurrency), memoryGb: positive(n.deviceMemory) };
}

/** Nunca sugere 4K sozinho: esse perfil é escolha do usuário. */
export function suggestProfile(device: DeviceInfo): Exclude<PerformanceProfile, "ultra"> {
  const { cores, memoryGb } = device;
  if ((memoryGb !== null && memoryGb <= 3) || (cores !== null && cores <= 4)) return "light";
  // O navegador limita deviceMemory a 8, então 8 significa "8 GB ou mais".
  if (memoryGb !== null && memoryGb >= 8 && cores !== null && cores >= 8) return "quality";
  return "balanced";
}

// ---------------------------------------------------------------------------------------
// Aviso de FPS baixo durante o jogo
// ---------------------------------------------------------------------------------------

/**
 * Recebe uma leitura de FPS por segundo. Avisa uma única vez, quando o FPS fica abaixo do limite
 * por vários segundos seguidos, depois de um tempo de aquecimento (carregamentos não contam).
 */
export function createLowFpsDetector({ threshold = 25, warmup = 15, seconds = 8 } = {}) {
  let samples = 0;
  let low = 0;
  let fired = false;
  return {
    push(fps: number): boolean {
      if (fired) return false;
      if (!(fps > 0)) {
        low = 0; // 0 = carregando ou pausado
        return false;
      }
      samples += 1;
      if (samples <= warmup) return false;
      low = fps < threshold ? low + 1 : 0;
      if (low >= seconds) {
        fired = true;
        return true;
      }
      return false;
    },
  };
}

export type LighterSuggestion = { patch: GameOverridePatch; message: string };

/** O próximo passo mais barato para aliviar um jogo lento, ou null se já está no mínimo. */
export function suggestLighter(s: Pick<Settings, "resolution" | "eeCycleRate" | "frameSkip">): LighterSuggestion | null {
  const res = Number(s.resolution);
  if (res > 1) {
    const next = Math.max(1, Math.ceil(res / 2));
    return { patch: { resolution: String(next) as Settings["resolution"] }, message: `resolução ${res}x → ${next}x` };
  }
  const ee = Number(s.eeCycleRate);
  if (ee > -1) {
    const next = ee > 0 ? "0" : "-1";
    return { patch: { eeCycleRate: next }, message: `velocidade do EE ${next === "0" ? "100%" : "75%"}` };
  }
  if (s.frameSkip < 1) return { patch: { frameSkip: 1 }, message: "pular 1 quadro" };
  return null;
}
