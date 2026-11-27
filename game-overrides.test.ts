import { useMemo, useSyncExternalStore } from "react";
import { clampDeadzone } from "./gamepad";
import { isGameFile } from "./performance";

export type Game = {
  id: string;
  title: string;
  fileName: string;
  size: number;
  addedAt: number;
  lastPlayedAt: number | null;
  playMinutes: number;
  /** No APK: link do arquivo no Android (content://), guardado entre aberturas. */
  uri?: string;
};

export type Settings = {
  renderer: "vulkan" | "opengl" | "software";
  resolution: "1" | "2" | "3" | "4";
  aspect: "4:3" | "16:9" | "stretch";
  showFps: boolean;
  frameSkip: number;
  volume: number;
  padOpacity: number;
  padScale: number;
  vibration: boolean;
  eeCycleRate: "-2" | "-1" | "0" | "1" | "2";
  speedHacks: boolean;
  /** Fila da VU1 em outra thread (MTVU) — grande ganho em celulares com vários núcleos. */
  mtvu: boolean;
  fastCdvd: boolean;
  skipDuplicateFrames: boolean;
  vsync: boolean;
  /** Driver Vulkan instalado no APK (Turnip, MaliSX2, PanVK); null = driver do sistema. */
  gpuDriver: string | null;
  gpuDriverName: string | null;
  biosName: string | null;
  /** Zona morta dos analógicos do gamepad físico, em % (5 a 30). */
  deadzone: number;
  /** Esconde o controle na tela quando um gamepad físico é detectado. */
  hidePadOnGamepad: boolean;
};

/**
 * Ajustes que um jogo pode sobrescrever. O que não estiver aqui usa a configuração global.
 * A resolução por jogo vai de 1x a 3x (o global ainda aceita 4x).
 */
export type GameSettingsOverride = Partial<Pick<Settings, "renderer" | "aspect" | "eeCycleRate" | "frameSkip">> & {
  resolution?: "1" | "2" | "3";
};

/** Para alterar: valor novo; `null` (ou undefined) volta aquele ajuste ao padrão global. */
export type GameOverridePatch = { [K in keyof GameSettingsOverride]?: GameSettingsOverride[K] | null };


export const defaultSettings: Settings = {
  renderer: "vulkan",
  resolution: "2",
  aspect: "4:3",
  showFps: true,
  frameSkip: 0,
  volume: 80,
  padOpacity: 70,
  padScale: 100,
  vibration: true,
  eeCycleRate: "0",
  speedHacks: true,
  mtvu: true,
  fastCdvd: false,
  skipDuplicateFrames: true,
  vsync: false,
  gpuDriver: null,
  gpuDriverName: null,
  biosName: null,
  deadzone: 10,
  hidePadOnGamepad: true,
};

export const ISO_ACCEPT = ".iso,.bin,.chd,.cso,.img,.gz";

const GAMES_KEY = "nebula2.games";
const SETTINGS_KEY = "nebula2.settings";
const OVERRIDES_KEY = "nebula2.gameOverrides";

// Arquivos ISO/BIOS ficam só na memória desta sessão (navegador não guarda arquivos grandes de forma confiável).
const isoFiles = new Map<string, File>();
let biosFile: File | null = null;

let games: Game[] = [];
let settings: Settings = defaultSettings;
let overrides: Record<string, GameSettingsOverride> = {};
let loaded = false;
const listeners = new Set<() => void>();

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return allowed.find((a) => a === value);
}

/** Descarta qualquer valor fora do que o app entende (localStorage pode ter sido editado ou ser de outra versão). */
function sanitizeOverride(raw: unknown): GameSettingsOverride {
  const out: GameSettingsOverride = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  const renderer = pick(r["renderer"], ["vulkan", "opengl", "software"] as const);
  if (renderer) out.renderer = renderer;
  const resolution = pick(r["resolution"], ["1", "2", "3"] as const);
  if (resolution) out.resolution = resolution;
  const aspect = pick(r["aspect"], ["4:3", "16:9", "stretch"] as const);
  if (aspect) out.aspect = aspect;
  const ee = pick(r["eeCycleRate"], ["-2", "-1", "0", "1", "2"] as const);
  if (ee) out.eeCycleRate = ee;
  const skip = r["frameSkip"];
  if (typeof skip === "number" && Number.isInteger(skip) && skip >= 0 && skip <= 3) out.frameSkip = skip;
  return out;
}

function loadOverrides(): Record<string, GameSettingsOverride> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(OVERRIDES_KEY) ?? "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, GameSettingsOverride> = {};
    for (const [id, value] of Object.entries(raw)) {
      const clean = sanitizeOverride(value);
      if (Object.keys(clean).length > 0) out[id] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    games = JSON.parse(localStorage.getItem(GAMES_KEY) ?? "[]");
    settings = { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") };
    settings = {
      ...settings,
      deadzone: clampDeadzone(settings.deadzone),
      hidePadOnGamepad:
        typeof settings.hidePadOnGamepad === "boolean" ? settings.hidePadOnGamepad : defaultSettings.hidePadOnGamepad,
    };
  } catch {
    games = [];
    settings = defaultSettings;
  }
  overrides = loadOverrides();
}

function emit() {
  localStorage.setItem(GAMES_KEY, JSON.stringify(games));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const EMPTY: Game[] = [];
export function useGames() {
  return useSyncExternalStore(
    subscribe,
    () => (load(), games),
    () => EMPTY,
  );
}

export function useSettings() {
  return useSyncExternalStore(
    subscribe,
    () => (load(), settings),
    () => defaultSettings,
  );
}

const NO_OVERRIDE: GameSettingsOverride = {};
const NO_OVERRIDES: Record<string, GameSettingsOverride> = {};

export function useGameOverrides() {
  return useSyncExternalStore(
    subscribe,
    () => (load(), overrides),
    () => NO_OVERRIDES,
  );
}

/** Só o que este jogo sobrescreve (vazio = usa tudo do global). */
export function useGameOverride(gameId: string): GameSettingsOverride {
  const all = useGameOverrides();
  return all[gameId] ?? NO_OVERRIDE;
}

/** Configuração efetiva do jogo: global + ajustes próprios, para telas que precisam reagir a mudanças. */
export function useGameSettings(gameId: string): Settings {
  const base = useSettings();
  const override = useGameOverride(gameId);
  return useMemo(() => ({ ...base, ...override }), [base, override]);
}

export function getGameOverride(gameId: string): GameSettingsOverride {
  load();
  return overrides[gameId] ?? NO_OVERRIDE;
}

/** Mescla as configurações globais com as regras específicas do jogo (as do jogo vencem). */
export function getGameSettings(gameId: string): Settings {
  load();
  return { ...settings, ...(overrides[gameId] ?? NO_OVERRIDE) };
}

export function countOverrides(override: GameSettingsOverride): number {
  return Object.keys(override).length;
}

export function setGameOverride(gameId: string, patch: GameOverridePatch) {
  load();
  const next: Record<string, unknown> = { ...(overrides[gameId] ?? NO_OVERRIDE) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) delete next[key];
    else next[key] = value;
  }
  const clean = sanitizeOverride(next);
  const rest = { ...overrides };
  if (Object.keys(clean).length === 0) delete rest[gameId];
  else rest[gameId] = clean;
  overrides = rest;
  emit();
}

/** Volta o jogo a usar só a configuração global. */
export function resetGameOverride(gameId: string) {
  load();
  if (!(gameId in overrides)) return;
  const rest = { ...overrides };
  delete rest[gameId];
  overrides = rest;
  emit();
}

export function cleanTitle(fileName: string) {
  return fileName
    .replace(/\.(iso|bin|chd|cso|img|mdf|nrg|gz)$/i, "")
    .replace(/[_.]+/g, " ")
    .replace(/\s*[([][^)\]]*[)\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function addIsoFiles(files: FileList | File[]) {
  load();
  const added: Game[] = [];
  for (const file of Array.from(files)) {
    if (!isGameFile(file.name)) continue;
    const existing = [...games, ...added].find((g) => g.fileName === file.name && g.size === file.size);
    if (existing) {
      isoFiles.set(existing.id, file);
      continue;
    }
    const game: Game = {
      id: crypto.randomUUID(),
      title: cleanTitle(file.name) || file.name,
      fileName: file.name,
      size: file.size,
      addedAt: Date.now(),
      lastPlayedAt: null,
      playMinutes: 0,
    };
    isoFiles.set(game.id, file);
    added.push(game);
  }
  games = [...added, ...games];
  emit();
  return added.length;
}

/** Jogos escolhidos pelo seletor do Android (só no APK). Retorna quantos são novos. */
export function addNativeIsos(files: { uri: string; name: string; size: number }[]) {
  load();
  const added: Game[] = [];
  for (const f of files) {
    if (!isGameFile(f.name)) continue;
    const existing = [...games, ...added].find((g) => g.uri === f.uri || (g.fileName === f.name && g.size === f.size));
    if (existing) {
      games = games.map((g) => (g.id === existing.id ? { ...g, uri: f.uri } : g));
      continue;
    }
    added.push({
      id: crypto.randomUUID(),
      title: cleanTitle(f.name) || f.name,
      fileName: f.name,
      size: f.size,
      addedAt: Date.now(),
      lastPlayedAt: null,
      playMinutes: 0,
      uri: f.uri,
    });
  }
  games = [...added, ...games];
  emit();
  return added.length;
}

export function relinkNativeIso(id: string, uri: string) {
  games = games.map((g) => (g.id === id ? { ...g, uri } : g));
  emit();
}

/** O que dá para abrir deste jogo agora: o arquivo da sessão ou o link guardado do Android. */
export function getIsoSource(id: string): { name: string; uri?: string } | null {
  load();
  const file = isoFiles.get(id);
  if (file) return file;
  const game = games.find((g) => g.id === id);
  return game?.uri ? { name: game.fileName, uri: game.uri } : null;
}

export function relinkIso(id: string, file: File) {
  isoFiles.set(id, file);
  listeners.forEach((l) => l());
}

export function getIso(id: string) {
  return isoFiles.get(id) ?? null;
}

export function hasIso(id: string) {
  return isoFiles.has(id);
}

export function removeGame(id: string) {
  games = games.filter((g) => g.id !== id);
  isoFiles.delete(id);
  if (id in overrides) {
    const rest = { ...overrides };
    delete rest[id];
    overrides = rest;
  }
  emit();
}

export function renameGame(id: string, title: string) {
  games = games.map((g) => (g.id === id ? { ...g, title } : g));
  emit();
}

export function markPlayed(id: string, minutes = 0) {
  games = games.map((g) =>
    g.id === id ? { ...g, lastPlayedAt: Date.now(), playMinutes: g.playMinutes + minutes } : g,
  );
  emit();
}

export function updateSettings(patch: Partial<Settings>) {
  load();
  settings = { ...settings, ...patch };
  emit();
}

export function setBios(file: File | null) {
  biosFile = file;
  updateSettings({ biosName: file?.name ?? null });
}

/** BIOS já copiada para dentro do APK: só o nome é guardado. */
export function setBiosName(name: string) {
  biosFile = null;
  updateSettings({ biosName: name });
}

export function getBios() {
  return biosFile;
}

export function formatSize(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

export function coverClass(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ["cover-1", "cover-2", "cover-3", "cover-4", "cover-5"][h % 5];
}
