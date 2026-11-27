import { useSyncExternalStore } from "react";

/**
 * Registro de quando cada slot de save state foi gravado. Os arquivos em si ficam no núcleo
 * (armazenamento do app); aqui só guardamos data e tipo para mostrar no menu de pausa.
 * Slots 1–9 são manuais; o 10 é o salvamento automático.
 */

export const MANUAL_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const AUTO_SLOT = 10;

export type SaveKind = "manual" | "auto";
export type SlotInfo = { savedAt: number; kind: SaveKind };
export type GameSaves = Record<string, SlotInfo>;

const KEY = "nebula2.saves";
const NO_SAVES: GameSaves = {};
const NO_STORE: Record<string, GameSaves> = {};

let store: Record<string, GameSaves> = NO_STORE;
let loaded = false;
const listeners = new Set<() => void>();

function sanitize(raw: unknown): Record<string, GameSaves> {
  const out: Record<string, GameSaves> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [gameId, slots] of Object.entries(raw)) {
    if (!slots || typeof slots !== "object") continue;
    const clean: GameSaves = {};
    for (const [slot, info] of Object.entries(slots as Record<string, unknown>)) {
      const n = Number(slot);
      const i = info as Partial<SlotInfo> | null;
      if (!Number.isInteger(n) || n < 1 || n > AUTO_SLOT) continue;
      if (!i || typeof i.savedAt !== "number" || !Number.isFinite(i.savedAt)) continue;
      clean[String(n)] = { savedAt: i.savedAt, kind: i.kind === "auto" ? "auto" : "manual" };
    }
    if (Object.keys(clean).length > 0) out[gameId] = clean;
  }
  return out;
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    store = sanitize(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
  } catch {
    store = {};
  }
}

function emit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* sem espaço ou modo privado: o menu só perde as datas */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSaveSlots(gameId: string): GameSaves {
  load();
  return store[gameId] ?? NO_SAVES;
}

export function useSaveSlots(gameId: string): GameSaves {
  return useSyncExternalStore(
    subscribe,
    () => getSaveSlots(gameId),
    () => NO_SAVES,
  );
}

export function recordSave(gameId: string, slot: number, kind: SaveKind, now = Date.now()) {
  load();
  store = { ...store, [gameId]: { ...(store[gameId] ?? NO_SAVES), [String(slot)]: { savedAt: now, kind } } };
  emit();
}

export function forgetSaves(gameId: string) {
  load();
  if (!(gameId in store)) return;
  const rest = { ...store };
  delete rest[gameId];
  store = rest;
  emit();
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "hoje 14:32", "ontem 20:10" ou "27/11 14:32". */
export function formatSavedAt(timestamp: number, now = Date.now()): string {
  const d = new Date(timestamp);
  const today = new Date(now);
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return `hoje ${time}`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, yesterday)) return `ontem ${time}`;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} ${time}`;
}
