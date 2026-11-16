/**
 * Ponte entre a interface e o núcleo do emulador de PS2.
 *
 * A interface só conversa com este objeto `emulator`. Para ligar um núcleo real
 * (ex.: uma build nativa no Android via plugin Capacitor, ou um núcleo WASM),
 * substitua a implementação de `stubCore` mantendo a mesma interface.
 */

export type PadButton =
  | "up" | "down" | "left" | "right"
  | "triangle" | "circle" | "cross" | "square"
  | "l1" | "l2" | "l3" | "r1" | "r2" | "r3"
  | "start" | "select";

export type Stick = "left" | "right";

export type BootOptions = {
  canvas: HTMLCanvasElement;
  iso: File;
  bios: File | null;
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

/** Implementação de demonstração: desenha uma tela de espera e registra os comandos. */
function createStubCore(): EmulatorCore {
  let raf = 0;
  let paused = false;
  const pressed = new Set<PadButton>();

  return {
    async boot({ canvas, iso, onStatus, onFps }) {
      onStatus?.(`Núcleo não conectado — ${iso.name}`);
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
        ctx.fillText("Conecte o núcleo do emulador em src/lib/emulator.ts", w / 2, h / 2);
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

export const emulator: EmulatorCore = createStubCore();
