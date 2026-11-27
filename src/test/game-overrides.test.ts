import { beforeEach, describe, expect, it, vi } from "vitest";

async function freshLibrary() {
  vi.resetModules();
  return import("@/lib/library");
}

describe("per-game settings overrides", () => {
  beforeEach(() => localStorage.clear());

  it("uses the global settings when a game has no overrides", async () => {
    const lib = await freshLibrary();
    expect(lib.getGameSettings("g1")).toEqual(lib.defaultSettings);
  });

  it("lets a game's own rules win over the global ones, only for that game", async () => {
    const lib = await freshLibrary();
    lib.updateSettings({ renderer: "vulkan", resolution: "2", aspect: "4:3" });
    lib.setGameOverride("g1", { renderer: "opengl", resolution: "3", eeCycleRate: "-1", frameSkip: 2 });

    expect(lib.getGameSettings("g1")).toMatchObject({
      renderer: "opengl",
      resolution: "3",
      aspect: "4:3",
      eeCycleRate: "-1",
      frameSkip: 2,
    });
    expect(lib.getGameSettings("g2").renderer).toBe("vulkan");
    expect(JSON.parse(localStorage.getItem("nebula2.gameOverrides") ?? "{}")).toEqual({
      g1: { renderer: "opengl", resolution: "3", eeCycleRate: "-1", frameSkip: 2 },
    });
  });

  it("follows later changes to the global settings for anything not overridden", async () => {
    const lib = await freshLibrary();
    lib.setGameOverride("g1", { renderer: "software" });
    lib.updateSettings({ aspect: "16:9" });
    expect(lib.getGameSettings("g1")).toMatchObject({ renderer: "software", aspect: "16:9" });
  });

  it("null returns one setting to the global default; the last one removes the entry", async () => {
    const lib = await freshLibrary();
    lib.setGameOverride("g1", { renderer: "opengl", frameSkip: 0 });
    lib.setGameOverride("g1", { renderer: null });
    expect(lib.getGameOverride("g1")).toEqual({ frameSkip: 0 });
    lib.setGameOverride("g1", { frameSkip: null });
    expect(JSON.parse(localStorage.getItem("nebula2.gameOverrides") ?? "{}")).toEqual({});
  });

  it("resetGameOverride restores the global defaults for that game", async () => {
    const lib = await freshLibrary();
    lib.setGameOverride("g1", { aspect: "stretch" });
    lib.resetGameOverride("g1");
    expect(lib.countOverrides(lib.getGameOverride("g1"))).toBe(0);
    expect(lib.getGameSettings("g1").aspect).toBe(lib.defaultSettings.aspect);
  });

  it("drops invalid values found in storage instead of passing them to the core", async () => {
    localStorage.setItem(
      "nebula2.gameOverrides",
      JSON.stringify({ g1: { renderer: "directx", resolution: "9", frameSkip: 7, eeCycleRate: "1" }, g2: 5 }),
    );
    const lib = await freshLibrary();
    expect(lib.getGameOverride("g1")).toEqual({ eeCycleRate: "1" });
    expect(lib.getGameOverride("g2")).toEqual({});
  });

  it("survives corrupted override JSON without touching the game list", async () => {
    localStorage.setItem("nebula2.gameOverrides", "{not json");
    localStorage.setItem("nebula2.games", JSON.stringify([{ id: "g1", title: "A" }]));
    const lib = await freshLibrary();
    expect(lib.getGameOverride("g1")).toEqual({});
    expect(lib.getGameSettings("g1")).toEqual(lib.defaultSettings);
  });

  it("deadzone defaults to 10%, hides the pad on gamepad by default, and is clamped when loaded", async () => {
    let lib = await freshLibrary();
    expect(lib.defaultSettings.deadzone).toBe(10);
    expect(lib.defaultSettings.hidePadOnGamepad).toBe(true);

    localStorage.setItem("nebula2.settings", JSON.stringify({ deadzone: 99, hidePadOnGamepad: "yes" }));
    lib = await freshLibrary();
    expect(lib.getGameSettings("g1").deadzone).toBe(30);
    expect(lib.getGameSettings("g1").hidePadOnGamepad).toBe(true);
  });

  it("accepts the new image options per game, including 6x (4K)", async () => {
    const lib = await freshLibrary();
    lib.setGameOverride("g1", {
      resolution: "6",
      anisotropy: "16",
      blending: "3",
      texturePreloading: "1",
      sharpening: 40,
      colorBoost: "vivid",
      fxaa: true,
    });
    expect(lib.getGameSettings("g1")).toMatchObject({
      resolution: "6",
      anisotropy: "16",
      blending: "3",
      texturePreloading: "1",
      sharpening: 40,
      colorBoost: "vivid",
      fxaa: true,
    });
    expect(lib.getGameSettings("g2").resolution).toBe(lib.defaultSettings.resolution);
  });

  it("an explicit fxaa=false override beats a global fxaa=true", async () => {
    const lib = await freshLibrary();
    lib.updateSettings({ fxaa: true });
    lib.setGameOverride("g1", { fxaa: false });
    expect(lib.getGameSettings("g1").fxaa).toBe(false);
    expect(lib.getGameSettings("g2").fxaa).toBe(true);
  });

  it("rejects out-of-range image overrides from storage", async () => {
    localStorage.setItem(
      "nebula2.gameOverrides",
      JSON.stringify({ g1: { resolution: "5", anisotropy: "32", blending: "9", sharpening: 150, colorBoost: "neon", fxaa: "yes" } }),
    );
    const lib = await freshLibrary();
    expect(lib.getGameOverride("g1")).toEqual({});
  });

  it("normalizes invalid global settings loaded from storage", async () => {
    localStorage.setItem(
      "nebula2.settings",
      JSON.stringify({ resolution: "9", sharpening: 500, anisotropy: "x", autoSaveMinutes: "7", autoSaveOnExit: 1 }),
    );
    const lib = await freshLibrary();
    expect(lib.getGameSettings("g1")).toMatchObject({
      resolution: lib.defaultSettings.resolution,
      sharpening: 100,
      anisotropy: "core",
      autoSaveMinutes: "0",
      autoSaveOnExit: true,
    });
  });

  it("new defaults: no extra shaders, autosave on exit only, hint not yet seen", async () => {
    const lib = await freshLibrary();
    expect(lib.defaultSettings).toMatchObject({
      blending: "core",
      anisotropy: "core",
      fxaa: false,
      sharpening: 0,
      colorBoost: "off",
      autoSaveOnExit: true,
      autoSaveMinutes: "0",
      autoLoad: false,
      profileHintSeen: false,
    });
  });
});

