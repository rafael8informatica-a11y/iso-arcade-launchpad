import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type PadButton =
  | "up" | "down" | "left" | "right"
  | "triangle" | "circle" | "cross" | "square"
  | "l1" | "l2" | "l3" | "r1" | "r2" | "r3"
  | "start" | "select";

export type Stick = "left" | "right";

export type BootOptions = {
  canvas: HTMLCanvasElement;
  iso: File & { uri?: string; path?: string };
  bios: (File & { uri?: string; path?: string; name?: string }) | null;
  settings: Record<string, unknown>;
  onStatus?: (status: string) => void;
  onFps?: (fps: number) => void;
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
  boot(opts: { uri: string; bios?: string | null; settings?: Record<string, unknown> }): Promise<void>;
  stop(): Promise<void>;
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

  const clearListeners = async () => {
    while (listeners.length > 0) {
      const h = listeners.pop();
      await h?.remove().catch(() => {});
    }
  };

  return {
    async boot({ canvas, iso, bios, settings, onStatus, onFps }) {
      await clearListeners();

      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      document.documentElement.style.background = "transparent";
      document.body.style.background = "transparent";

      listeners.push(
        await Ps2Core.addListener("status", ({ text }) => onStatus?.(text)),
        await Ps2Core.addListener("fps", ({ fps }) => onFps?.(fps)),
        await Ps2Core.addListener("ended", ({ ok, error }) => {
          if (!ok && error) onStatus?.(`Erro: ${error}`);
        })
      );

      const isoUri = iso.uri || iso.path || (iso as unknown as { webkitRelativePath?: string }).webkitRelativePath || iso.name;
      const biosName = bios?.name ?? (typeof settings.bios === "string" ? settings.bios : null);

      try {
        const st = await Ps2Core.status();
        if (!st.loaded) {
          onStatus?.(`Núcleo nativo indisponível: ${st.error || "bibliotecas .so ausentes"}`);
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
        throw err;
      }
    },

    pause() {
      Ps2Core.pause().catch(() => {});
    },

    resume() {
      Ps2Core.resume().catch(() => {});
    },

    stop() {
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
      Ps2Core.setAnalog({ stick, x, y }).catch(() => {});
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

export const emulator: EmulatorCore = Capacitor.isNativePlatform()
  ? createNativeCore()
  : createStubCore();
