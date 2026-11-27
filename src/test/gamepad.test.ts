import { describe, expect, it, vi } from "vitest";

import {
  applyDeadzone,
  clampDeadzone,
  createGamepadLoop,
  gamepadLabel,
  readPad,
  type PadLike,
} from "@/lib/gamepad";

const button = (pressed = false, value = pressed ? 1 : 0) => ({ pressed, value });

function makePad(patch: { buttons?: Record<number, { pressed: boolean; value: number }>; axes?: number[] } = {}): PadLike {
  const buttons = Array.from({ length: 17 }, () => button());
  for (const [i, b] of Object.entries(patch.buttons ?? {})) buttons[Number(i)] = b;
  return { id: "Test Pad", index: 0, connected: true, buttons, axes: patch.axes ?? [0, 0, 0, 0] };
}

describe("deadzone", () => {
  it("clamps the setting to 5-30% and falls back to 10%", () => {
    expect(clampDeadzone(1)).toBe(5);
    expect(clampDeadzone(80)).toBe(30);
    expect(clampDeadzone(17.4)).toBe(17);
    expect(clampDeadzone(Number.NaN)).toBe(10);
    expect(clampDeadzone("12")).toBe(10);
  });

  it("zeroes the stick inside the dead radius, on both axes together", () => {
    expect(applyDeadzone(0.09, 0.04, 10)).toEqual({ x: 0, y: 0 });
    expect(applyDeadzone(0.1, 0, 10)).toEqual({ x: 0, y: 0 });
  });

  it("keeps direction and reaches full tilt at the edge", () => {
    const full = applyDeadzone(1, 0, 10);
    expect(full.x).toBeCloseTo(1);
    expect(full.y).toBe(0);
    const diagonal = applyDeadzone(0.6, -0.6, 10);
    expect(diagonal.x).toBeGreaterThan(0);
    expect(diagonal.y).toBeLessThan(0);
    expect(diagonal.x).toBeCloseTo(-diagonal.y);
    expect(Math.hypot(applyDeadzone(1, 1, 10).x, applyDeadzone(1, 1, 10).y)).toBeCloseTo(1);
  });

  it("starts just above the native 8% cut so slight movement is not swallowed twice", () => {
    const start = applyDeadzone(0.11, 0, 10);
    expect(start.x).toBeGreaterThanOrEqual(0.09);
    expect(start.x).toBeLessThan(0.2);
  });

  it("a larger dead zone ignores more of the travel", () => {
    expect(applyDeadzone(0.25, 0, 10).x).toBeGreaterThan(0);
    expect(applyDeadzone(0.25, 0, 30)).toEqual({ x: 0, y: 0 });
  });
});

describe("standard mapping", () => {
  it("maps Xbox/PlayStation standard buttons to the PS2 pad", () => {
    const state = readPad(
      makePad({ buttons: { 0: button(true), 1: button(true), 9: button(true), 12: button(true), 10: button(true) } }),
      10,
    );
    expect(state.buttons.cross).toBe(true);
    expect(state.buttons.circle).toBe(true);
    expect(state.buttons.start).toBe(true);
    expect(state.buttons.up).toBe(true);
    expect(state.buttons.l3).toBe(true);
    expect(state.buttons.square).toBe(false);
    expect(state.buttons.select).toBe(false);
  });

  it("treats analog triggers as pressed past half travel", () => {
    const state = readPad(makePad({ buttons: { 6: button(false, 0.8), 7: button(false, 0.3) } }), 10);
    expect(state.buttons.l2).toBe(true);
    expect(state.buttons.r2).toBe(false);
  });

  it("reads left stick from axes 0-1 and right stick from axes 2-3", () => {
    const state = readPad(makePad({ axes: [1, 0, 0, -1] }), 10);
    expect(state.left.x).toBeCloseTo(1);
    expect(state.right.y).toBeCloseTo(-1);
  });
});

describe("gamepad loop", () => {
  function setup(initial: PadLike | null) {
    let current: PadLike | null = initial;
    let next: FrameRequestCallback | undefined;
    const sink = { setButton: vi.fn(), setAnalog: vi.fn() };
    let deadzone = 10;
    const loop = createGamepadLoop({
      sink,
      getDeadzone: () => deadzone,
      getPads: () => [current],
      raf: (cb) => {
        next = cb;
        return 1;
      },
      caf: () => {
        next = undefined;
      },
    });
    const frame = () => {
      const cb = next;
      next = undefined;
      cb?.(0);
    };
    return { sink, loop, frame, setPad: (p: PadLike | null) => (current = p), setDeadzone: (d: number) => (deadzone = d) };
  }

  it("sends a press once and a release once", () => {
    const t = setup(makePad({ buttons: { 0: button(true) } }));
    t.loop.start();
    t.frame();
    t.frame();
    expect(t.sink.setButton).toHaveBeenCalledExactlyOnceWith("cross", true);
    t.setPad(makePad());
    t.frame();
    expect(t.sink.setButton).toHaveBeenLastCalledWith("cross", false);
    expect(t.sink.setButton).toHaveBeenCalledTimes(2);
  });

  it("sends analog only when it changes and releases to exactly zero", () => {
    const t = setup(makePad({ axes: [1, 0, 0, 0] }));
    t.loop.start();
    t.frame();
    t.frame();
    expect(t.sink.setAnalog).toHaveBeenCalledTimes(1);
    expect(t.sink.setAnalog.mock.calls[0]?.[0]).toBe("left");
    t.setPad(makePad({ axes: [0.05, 0.02, 0, 0] }));
    t.frame();
    expect(t.sink.setAnalog).toHaveBeenLastCalledWith("left", 0, 0);
  });

  it("applies a deadzone change on the next frame", () => {
    const t = setup(makePad({ axes: [0.2, 0, 0, 0] }));
    t.setDeadzone(30);
    t.loop.start();
    t.frame();
    expect(t.sink.setAnalog).not.toHaveBeenCalled();
    t.setDeadzone(5);
    t.frame();
    expect(t.sink.setAnalog).toHaveBeenCalledTimes(1);
  });

  it("releases held buttons when the controller disappears", () => {
    const t = setup(makePad({ buttons: { 2: button(true) } }));
    t.loop.start();
    t.frame();
    t.setPad(null);
    t.frame();
    expect(t.sink.setButton).toHaveBeenLastCalledWith("square", false);
  });

  it("stop() lets go of everything the pad was holding and stops polling", () => {
    const t = setup(makePad({ buttons: { 3: button(true) }, axes: [0, 0, 1, 0] }));
    t.loop.start();
    t.frame();
    t.loop.stop();
    expect(t.sink.setButton).toHaveBeenLastCalledWith("triangle", false);
    expect(t.sink.setAnalog).toHaveBeenLastCalledWith("right", 0, 0);
    const calls = t.sink.setButton.mock.calls.length;
    t.frame();
    expect(t.sink.setButton.mock.calls.length).toBe(calls);
  });
});

describe("gamepadLabel", () => {
  it("strips vendor details from browser ids", () => {
    expect(gamepadLabel("Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)")).toBe("Xbox 360 Controller");
    expect(gamepadLabel("054c-0ce6-DualSense Wireless Controller")).toBe("DualSense Wireless Controller");
    expect(gamepadLabel("")).toBe("Controle");
  });
});
