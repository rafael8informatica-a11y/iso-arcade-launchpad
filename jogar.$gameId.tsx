import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type PadButton =
  | "up" | "down" | "left" | "right"
  | "triangle" | "circle" | "cross" | "square"
  | "l1" | "l2" | "l3" | "r1" | "r2" | "r3"
  | "start" | "select";

export type Stick = "left" | "right";

/** Um jogo: um File do navegador ou, no APK, um link de arquivo do Android (content://). */
export type IsoSource = { name: string; uri?: string; path?: string };

export type BootOptions = {
  canvas: HTMLCanvasElement;
  iso: IsoSource;
  bios: { name: string } | null;
  settings: Record<string, unknown>;
  onStatus?: (status: string) => void;
  onFps?: (fps: number) => void;
  /** O núcleo não conseguiu iniciar (ou o jogo caiu). Texto cru do erro; vazio se o núcleo não disse o motivo. */
  onError?: (message: string) => void;
};

export interface EmulatorCore {
  boot(opts: BootOptions): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  setButton(button: PadButton, pressed: boolean): void;
  /** x e y entre -1 e 1 */
  setAnalog(stick: Stick, x: number, y: number): void;
  saveState(slot: number): Promise<void>;
  loadState(slot: number): Promise<void>;
}

export const PS2_KEYS: Record<PadButton, number> = {
  up: 19,
  down: 20,
  left: 21,
  right: 22,
  cross: 96,
  circle: 97,
  square: 99,
  triangle: 100,
  l1: 102,
  r1: 103,
  l2: 104,
  r2: 105,
  l3: 106,
  r3: 107,
  start: 108,
  select: 109,
};

interface Ps2CoreNativePlugin {
  status(): Promise<{ loaded: boolean; error?: string; running: boolean }>;
  pickIsos(opts?: { multiple?: boolean }): Promise<{ files: Array<{ uri: string; name: string; size: number }> }>;
  pickBios(): Promise<{ name?: string; description?: string }>;
  pickGameFolder(): Promise<FolderScan>;
  scanGameFolder(): Promise<FolderScan>;
  boot(opts: { uri: string; bios?: string | null; settings?: Record<string, unknown> }): Promise<void>;
  stop(): Promise<void>;
  listDrivers(): Promise<{ drivers: GpuDriver[] }>;
  pickDriver(): Promise<Partial<GpuDriver>>;
  removeDriver(opts: { id: string }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  saveState(opts: { slot: number }): Promise<void>;
  loadState(opts: { slot: number }): Promise<void>;
  setButton(opts: { key: number; pressed: boolean }): Promise<void>;
  setAnalog(opts: { stick: Stick; x: number; y: number }): Promise<void>;
  addListener(eventName: "fps", cb: (data: { fps: number }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: "status", cb: (data: { text: string }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: "paused", cb: (data: { paused: boolean }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: "ended", cb: (data: { ok: boolean; error?: string }) => void): Promise<PluginListenerHandle>;
}

export const Ps2Core = registerPlugin<Ps2CoreNativePlugin>("Ps2Core");

function createNativeCore(): EmulatorCore {
  const listeners: PluginListenerHandle[] = [];
  const pendingAnalog = new Map<Stick, { x: number; y: number }>();
  let analogFrame = 0;
  const flushAnalog = () => {
    analogFrame = 0;
    for (const [stick, value] of pendingAnalog) {
      void Ps2Core.setAnalog({ stick, ...value }).catch(() => {});
    }
    pendingAnalog.clear();
  };
  const resetAnalog = () => {
    cancelAnimationFrame(analogFrame);
    analogFrame = 0;
    pendingAnalog.clear();
    for (const stick of ["left", "right"] as const) {
      void Ps2Core.setAnalog({ stick, x: 0, y: 0 }).catch(() => {});
    }
  };

  const clearListeners = async () => {
    while (listeners.length > 0) {
      const h = listeners.pop();
      await h?.remove().catch(() => {});
    }
  };

  return {
    async boot({ canvas, iso, bios, settings, onStatus, onFps, onError }) {
      await clearListeners();

      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      document.documentElement.style.background = "transparent";
      document.body.style.background = "transparent";

      listeners.push(
        await Ps2Core.addListener("status", ({ text }) => onStatus?.(text)),
        await Ps2Core.addListener("fps", ({ fps }) => onFps?.(fps)),
        await Ps2Core.addListener("ended", ({ ok, error }) => {
          if (ok) return;
          if (error) onStatus?.(`Erro: ${error}`);
          onError?.(error ?? "");
        })
      );

      const isoUri = iso.uri || iso.path;
      if (!isoUri) {
        onStatus?.("Escolha o jogo de novo pelo botão do app.");
        onError?.("Sem acesso ao arquivo do jogo (corrompido ou removido). Escolha a ISO de novo.");
        return;
      }
      const biosName = bios?.name ?? (typeof settings["biosName"] === "string" ? settings["biosName"] : null);

      try {
        const st = await Ps2Core.status();
        if (!st.loaded) {
          const msg = `Núcleo nativo indisponível: ${st.error || "bibliotecas .so ausentes"}`;
          onStatus?.(msg);
          onError?.(msg);
          return;
        }
        if (st.running) {
          await Ps2Core.stop();
        }

        await Ps2Core.boot({
          uri: isoUri,
          bios: biosName,
          settings,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        onStatus?.(`Falha ao iniciar: ${msg}`);
        onError?.(msg);
        throw err;
      }
    },

    pause() {
      resetAnalog();
      Ps2Core.pause().catch(() => {});
    },

    resume() {
      Ps2Core.resume().catch(() => {});
    },

    stop() {
      resetAnalog();
      clearListeners();
      document.documentElement.style.background = "";
      document.body.style.background = "";
      Ps2Core.stop().catch(() => {});
    },

    setButton(button, pressed) {
      const key = PS2_KEYS[button];
      if (key !== undefined) {
        Ps2Core.setButton({ key, pressed }).catch(() => {});
      }
    },

    setAnalog(stick, x, y) {
      // Keep only the latest movement per display frame; release stays immediate.
      if (x === 0 && y === 0) {
        pendingAnalog.delete(stick);
        void Ps2Core.setAnalog({ stick, x, y }).catch(() => {});
        return;
      }
      pendingAnalog.set(stick, { x, y });
      if (!analogFrame) analogFrame = requestAnimationFrame(flushAnalog);
    },

    async saveState(slot) {
      await Ps2Core.saveState({ slot });
    },

    async loadState(slot) {
      await Ps2Core.loadState({ slot });
    },
  };
}

function createStubCore(): EmulatorCore {
  let raf = 0;
  let paused = false;
  const pressed = new Set<PadButton>();

  return {
    async boot({ canvas, iso, onStatus, onFps }) {
      onStatus?.(`Modo Web (sem Android) — ${iso.name}`);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      let t = 0;
      let last = performance.now();
      let frames = 0;
      const draw = (now: number) => {
        raf = requestAnimationFrame(draw);
        if (paused) return;
        frames++;
        if (now - last >= 1000) {
          onFps?.(frames);
          frames = 0;
          last = now;
        }
        t += 0.01;
        const { width: w, height: h } = canvas;
        ctx.fillStyle = "#03060d";
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 9; i++) {
          const x = (w / 10) * (i + 1);
          const hh = h * (0.2 + 0.5 * Math.abs(Math.sin(t + i * 0.8)));
          const g = ctx.createLinearGradient(x, h, x, h - hh);
          g.addColorStop(0, "rgba(80,170,255,0.55)");
          g.addColorStop(1, "rgba(80,170,255,0)");
          ctx.fillStyle = g;
          ctx.fillRect(x - w / 60, h - hh, w / 30, hh);
        }
        ctx.fillStyle = "rgba(220,235,255,0.85)";
        ctx.font = `${Math.round(h / 22)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("Abra o APK no Android para rodar o núcleo PS2", w / 2, h / 2);
        ctx.fillStyle = "rgba(120,190,255,0.8)";
        ctx.fillText(pressed.size ? [...pressed].join(" + ").toUpperCase() : "", w / 2, h / 2 + h / 12);
      };
      raf = requestAnimationFrame(draw);
    },
    pause() { paused = true; },
    resume() { paused = false; },
    stop() { cancelAnimationFrame(raf); pressed.clear(); },
    setButton(button, isDown) {
      if (isDown) pressed.add(button); else pressed.delete(button);
    },
    setAnalog() {},
    async saveState(slot) { console.info("[emulator] saveState", slot); },
    async loadState(slot) { console.info("[emulator] loadState", slot); },
  };
}

/** true dentro do APK: jogos e BIOS são escolhidos pelo Android e rodam no núcleo ARMSX2. */
export const isNativeCore = Capacitor.isNativePlatform();

export type PickedFile = { uri: string; name: string; size: number };
export type FolderScan = { files: PickedFile[]; folderName?: string };

export async function pickGameFolder(): Promise<FolderScan> {
  return Ps2Core.pickGameFolder();
}

export async function scanGameFolder(): Promise<FolderScan> {
  return Ps2Core.scanGameFolder();
}

/** Abre o seletor de arquivos do Android. O app guarda o acesso, então não precisa escolher de novo. */
export async function pickNativeIsos(multiple = true): Promise<PickedFile[]> {
  const { files } = await Ps2Core.pickIsos({ multiple });
  return files ?? [];
}

/** Copia a BIOS escolhida para dentro do app e confere se é uma BIOS de PS2. */
export async function pickNativeBios(): Promise<{ name: string; description?: string } | null> {
  const res = await Ps2Core.pickBios();
  if (!res.name) return null;
  return res.description ? { name: res.name, description: res.description } : { name: res.name };
}

export const emulator: EmulatorCore = isNativeCore ? createNativeCore() : createStubCore();

export type GpuDriver = { id: string; name: string; version?: string };

/** Drivers Vulkan personalizados (Turnip, MaliSX2, PanVK) instalados no APK. */
export async function listGpuDrivers(): Promise<GpuDriver[]> {
  if (!isNativeCore) return [];
  return (await Ps2Core.listDrivers()).drivers;
}

export async function pickGpuDriver(): Promise<GpuDriver | null> {
  const d = await Ps2Core.pickDriver();
  return d.id ? { id: d.id, name: d.name ?? d.id, ...(d.version ? { version: d.version } : {}) } : null;
}

export async function removeGpuDriver(id: string): Promise<void> {
  await Ps2Core.removeDriver({ id });
}
