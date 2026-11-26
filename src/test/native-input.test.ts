import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const plugin = vi.hoisted(() => ({
  setAnalog: vi.fn(async () => {}),
  pause: vi.fn(async () => {}),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => plugin,
}));
import { emulator } from "@/lib/emulator";

describe("native analog optimization", () => {
  let nextFrame: FrameRequestCallback | undefined;
  beforeEach(() => {
    vi.clearAllMocks();
    nextFrame = undefined;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { nextFrame = cb; return 1; });
    vi.stubGlobal("cancelAnimationFrame", () => { nextFrame = undefined; });
  });
  afterEach(() => {
    emulator.pause();
    vi.unstubAllGlobals();
  });
  it("sends only the latest position per display frame", () => {
    emulator.setAnalog("left", 0.1, 0.2);
    emulator.setAnalog("left", 0.8, 0.6);
    expect(plugin.setAnalog).not.toHaveBeenCalled();
    expect(nextFrame).toBeTypeOf("function");
    nextFrame?.(16);
    expect(plugin.setAnalog).toHaveBeenCalledExactlyOnceWith({ stick: "left", x: 0.8, y: 0.6 });
  });
  it("releases immediately without a queued movement restoring the stick", () => {
    emulator.setAnalog("right", 0.8, 0.6);
    emulator.setAnalog("right", 0, 0);
    nextFrame?.(16);
    expect(plugin.setAnalog).toHaveBeenCalledExactlyOnceWith({ stick: "right", x: 0, y: 0 });
  });
  it("cancels pending movement and neutralizes both sticks on pause", () => {
    emulator.setAnalog("left", 1, 0);
    emulator.pause();
    expect(nextFrame).toBeUndefined();
    expect(plugin.setAnalog.mock.calls).toEqual([
      [{ stick: "left", x: 0, y: 0 }], [{ stick: "right", x: 0, y: 0 }],
    ]);
  });
});