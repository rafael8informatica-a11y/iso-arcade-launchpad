import type { PadButton, Stick } from "./emulator";

/**
 * Gamepad físico (USB/Bluetooth) via Gamepad API padrão.
 * Este módulo não depende de React nem do núcleo nativo: só lê o controle e repassa
 * para qualquer "sink" com setButton/setAnalog (na prática, o `emulator`).
 */

export const DEADZONE_MIN = 5;
export const DEADZONE_MAX = 30;
export const DEADZONE_DEFAULT = 10;

/** Aceita qualquer valor e devolve um inteiro entre 5 e 30 (%). */
export function clampDeadzone(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : DEADZONE_DEFAULT;
  return Math.min(DEADZONE_MAX, Math.max(DEADZONE_MIN, n));
}

// ---------------------------------------------------------------------------------------
// Mapeamento (layout "standard": Xbox / XInput e PlayStation DualShock/DualSense no navegador)
// ---------------------------------------------------------------------------------------

/** Índice do botão no layout padrão → botão do PS2. A/✕ embaixo vira ✕, B/○ à direita vira ○. */
export const GAMEPAD_BUTTON_MAP: readonly (readonly [number, PadButton])[] = [
  [0, "cross"],
  [1, "circle"],
  [2, "square"],
  [3, "triangle"],
  [4, "l1"],
  [5, "r1"],
  [6, "l2"],
  [7, "r2"],
  [8, "select"],
  [9, "start"],
  [10, "l3"],
  [11, "r3"],
  [12, "up"],
  [13, "down"],
  [14, "left"],
  [15, "right"],
];

export const ALL_PAD_BUTTONS: readonly PadButton[] = GAMEPAD_BUTTON_MAP.map(([, button]) => button);

/** Gatilhos analógicos contam como apertados a partir da metade do curso. */
const ANALOG_PRESS_THRESHOLD = 0.5;

type ButtonLike = { pressed: boolean; value?: number };

/** O que precisamos de um `Gamepad` (facilita testar sem navegador). */
export type PadLike = {
  id?: string;
  index?: number;
  connected?: boolean;
  buttons: readonly ButtonLike[];
  axes: readonly number[];
};

export type PadSink = {
  setButton(button: PadButton, pressed: boolean): void;
  /** x e y entre -1 e 1 */
  setAnalog(stick: Stick, x: number, y: number): void;
};

export type StickValue = { x: number; y: number };
export type PadState = {
  buttons: Record<PadButton, boolean>;
  left: StickValue;
  right: StickValue;
};

// ---------------------------------------------------------------------------------------
// Zona morta
// ---------------------------------------------------------------------------------------

/** O Ps2CorePlugin ignora eixos abaixo de 8% (sendAxis). */
const NATIVE_DEADZONE = 0.08;
/** Primeiro valor enviado depois da zona morta: logo acima do corte nativo, para o movimento não "sumir". */
const FIRST_OUTPUT = NATIVE_DEADZONE + 0.01;

/**
 * Zona morta radial com reescala: dentro do raio morto o analógico vale 0; fora dele o valor
 * cresce suavemente de um pouco acima do corte nativo até 1, mantendo a direção.
 */
export function applyDeadzone(x: number, y: number, deadzonePercent: number): StickValue {
  const deadzone = clampDeadzone(deadzonePercent) / 100;
  const magnitude = Math.hypot(x, y);
  if (!Number.isFinite(magnitude) || magnitude <= deadzone) return { x: 0, y: 0 };
  const travel = (Math.min(magnitude, 1) - deadzone) / (1 - deadzone);
  const scaled = FIRST_OUTPUT + (1 - FIRST_OUTPUT) * travel;
  const k = scaled / magnitude;
  return { x: x * k, y: y * k };
}

// ---------------------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------------------

function isDown(button: ButtonLike | undefined): boolean {
  return Boolean(button && (button.pressed || (button.value ?? 0) > ANALOG_PRESS_THRESHOLD));
}

function emptyButtons(): Record<PadButton, boolean> {
  const buttons = {} as Record<PadButton, boolean>;
  for (const b of ALL_PAD_BUTTONS) buttons[b] = false;
  return buttons;
}

export function readPad(pad: PadLike, deadzonePercent: number): PadState {
  const buttons = emptyButtons();
  for (const [index, button] of GAMEPAD_BUTTON_MAP) buttons[button] = isDown(pad.buttons[index]);
  return {
    buttons,
    left: applyDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0, deadzonePercent),
    right: applyDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0, deadzonePercent),
  };
}

/** Vários controles conectados valem como um só: botões somam, analógico vence quem mexer mais. */
export function mergePadStates(states: readonly PadState[]): PadState {
  const merged: PadState = { buttons: emptyButtons(), left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
  const stronger = (a: StickValue, b: StickValue) => (Math.hypot(b.x, b.y) > Math.hypot(a.x, a.y) ? b : a);
  for (const state of states) {
    for (const b of ALL_PAD_BUTTONS) merged.buttons[b] ||= state.buttons[b];
    merged.left = stronger(merged.left, state.left);
    merged.right = stronger(merged.right, state.right);
  }
  return merged;
}

function readBrowserPads(): readonly (PadLike | null)[] {
  if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return [];
  return Array.from(navigator.getGamepads());
}

// ---------------------------------------------------------------------------------------
// Loop de leitura
// ---------------------------------------------------------------------------------------

export type GamepadLoopOptions = {
  sink: PadSink;
  /** Lido a cada quadro, então mudar o slider vale na hora. */
  getDeadzone: () => number;
  getPads?: () => readonly (PadLike | null)[];
  raf?: (cb: FrameRequestCallback) => number;
  caf?: (handle: number) => void;
};

const ANALOG_EPSILON = 0.004;
const isZero = (v: StickValue) => v.x === 0 && v.y === 0;

/**
 * Lê o gamepad a cada quadro e só repassa o que mudou. Por mandar apenas mudanças, não
 * atropela o controle na tela quando o gamepad está parado. `stop()` solta tudo o que o
 * gamepad estava segurando.
 */
export function createGamepadLoop(options: GamepadLoopOptions) {
  const { sink, getDeadzone } = options;
  const getPads = options.getPads ?? readBrowserPads;
  const raf = options.raf ?? ((cb: FrameRequestCallback) => requestAnimationFrame(cb));
  const caf = options.caf ?? ((h: number) => cancelAnimationFrame(h));

  const held = new Set<PadButton>();
  const sent: Record<Stick, StickValue> = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
  let handle = 0;
  let running = false;

  const poll = () => {
    const pads = getPads().filter((p): p is PadLike => p !== null && p.connected !== false);
    const deadzone = getDeadzone();
    const state = mergePadStates(pads.map((p) => readPad(p, deadzone)));

    for (const button of ALL_PAD_BUTTONS) {
      const want = state.buttons[button];
      if (want && !held.has(button)) {
        held.add(button);
        sink.setButton(button, true);
      } else if (!want && held.has(button)) {
        held.delete(button);
        sink.setButton(button, false);
      }
    }

    for (const stick of ["left", "right"] as const) {
      const next = state[stick];
      const prev = sent[stick];
      const changed = isZero(next)
        ? !isZero(prev)
        : Math.abs(next.x - prev.x) > ANALOG_EPSILON || Math.abs(next.y - prev.y) > ANALOG_EPSILON;
      if (changed) {
        sent[stick] = next;
        sink.setAnalog(stick, next.x, next.y);
      }
    }
  };

  const release = () => {
    for (const button of held) sink.setButton(button, false);
    held.clear();
    for (const stick of ["left", "right"] as const) {
      if (!isZero(sent[stick])) {
        sent[stick] = { x: 0, y: 0 };
        sink.setAnalog(stick, 0, 0);
      }
    }
  };

  const tick = () => {
    if (!running) return;
    poll();
    handle = raf(tick);
  };

  return {
    start() {
      if (running) return;
      running = true;
      handle = raf(tick);
    },
    stop() {
      if (!running) return;
      running = false;
      caf(handle);
      release();
    },
  };
}

// ---------------------------------------------------------------------------------------
// Controles conectados (conexão/desconexão)
// ---------------------------------------------------------------------------------------

export type ConnectedPad = { index: number; id: string };
export type GamepadConnectionEvent = { type: "connected" | "disconnected"; pad: ConnectedPad };

export const NO_PADS: readonly ConnectedPad[] = [];
let connected: readonly ConnectedPad[] = NO_PADS;
const subscribers = new Set<() => void>();

function setConnected(next: readonly ConnectedPad[]) {
  const same = next.length === connected.length && next.every((p, i) => p.index === connected[i]?.index && p.id === connected[i]?.id);
  if (same) return;
  connected = next.length === 0 ? NO_PADS : next;
  subscribers.forEach((l) => l());
}

export function subscribeGamepads(listener: () => void) {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

export function getConnectedGamepads(): readonly ConnectedPad[] {
  return connected;
}

/** Confere os controles que já estavam ligados antes da página perguntar. */
export function scanConnectedGamepads() {
  const found: ConnectedPad[] = [];
  for (const pad of readBrowserPads()) {
    if (pad && pad.connected !== false && typeof pad.index === "number") {
      found.push({ index: pad.index, id: pad.id ?? "" });
    }
  }
  setConnected(found);
}

/** Escuta gamepadconnected/gamepaddisconnected. Devolve a função que remove os ouvintes. */
export function attachGamepadListeners(onEvent?: (event: GamepadConnectionEvent) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = (type: GamepadConnectionEvent["type"]) => (ev: Event) => {
    const gp = (ev as GamepadEvent).gamepad;
    const pad: ConnectedPad = { index: gp.index, id: gp.id };
    const others = connected.filter((p) => p.index !== pad.index);
    setConnected(type === "connected" ? [...others, pad] : others);
    onEvent?.({ type, pad });
  };
  const onConnected = handler("connected");
  const onDisconnected = handler("disconnected");

  window.addEventListener("gamepadconnected", onConnected);
  window.addEventListener("gamepaddisconnected", onDisconnected);
  scanConnectedGamepads();

  return () => {
    window.removeEventListener("gamepadconnected", onConnected);
    window.removeEventListener("gamepaddisconnected", onDisconnected);
  };
}

/** "Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e …)" → "Xbox 360 Controller". */
export function gamepadLabel(id: string): string {
  const name = id
    .replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, "")
    .replace(/\s*\(.*$/, "")
    .replace(/\s*Vendor:.*$/i, "")
    .trim();
  return name || "Controle";
}
