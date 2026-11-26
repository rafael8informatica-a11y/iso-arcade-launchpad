import type { Settings } from "./library";

export const performanceProfiles = {
  light: { resolution: "1", eeCycleRate: "-1", frameSkip: 0 },
  balanced: { resolution: "2", eeCycleRate: "0", frameSkip: 0 },
  quality: { resolution: "3", eeCycleRate: "0", frameSkip: 0 },
} as const;

export function performancePatch(profile: keyof typeof performanceProfiles): Partial<Settings> {
  return {
    ...performanceProfiles[profile], renderer: "vulkan", speedHacks: true,
    mtvu: true, skipDuplicateFrames: true, vsync: false, fastCdvd: false,
  };
}

export function isGameFile(name: string): boolean {
  return /\.(iso|bin|chd|cso|img|gz)$/i.test(name);
}