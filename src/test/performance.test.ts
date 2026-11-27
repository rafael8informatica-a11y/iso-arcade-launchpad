import { describe, expect, it } from "vitest";
import {
  createLowFpsDetector,
  detectDevice,
  isGameFile,
  performancePatch,
  suggestLighter,
  suggestProfile,
} from "@/lib/performance";

describe("game folder discovery", () => {
  it("detects supported disc images without importing drivers or unrelated files", () => {
    for (const file of ["Game.ISO", "Game.chd", "Game.cso", "Game.bin", "Game.img", "Game.iso.gz"]) {
      expect(isGameFile(file)).toBe(true);
    }
    for (const file of ["Lossless.dll", "driver.zip", "cover.jpg", "Game.iso.txt"]) {
      expect(isGameFile(file)).toBe(false);
    }
  });
});

describe("additional performance optimization", () => {
  it("light profile reduces GPU and EE load without frame skipping", () => {
    expect(performancePatch("light")).toMatchObject({
      resolution: "1", eeCycleRate: "-1", frameSkip: 0,
      mtvu: true, speedHacks: true, skipDuplicateFrames: true, vsync: false, fastCdvd: false,
    });
  });
  it("balanced and quality retain normal EE timing", () => {
    expect(performancePatch("balanced")).toMatchObject({ resolution: "2", eeCycleRate: "0" });
    expect(performancePatch("quality")).toMatchObject({ resolution: "3", eeCycleRate: "0" });
  });
});

describe("image profiles", () => {
  it("light profile also trims blending and texture preloading", () => {
    expect(performancePatch("light")).toMatchObject({ blending: "0", texturePreloading: "1", sharpening: 0 });
  });

  it("realistic 4K profile uses 6x with sharp, high-quality image options", () => {
    expect(performancePatch("ultra")).toMatchObject({
      resolution: "6",
      anisotropy: "16",
      blending: "3",
      texturePreloading: "2",
      sharpening: 40,
      colorBoost: "soft",
      fxaa: false,
    });
  });

  it("switching to a normal profile clears the 4K extras", () => {
    expect(performancePatch("balanced")).toMatchObject({
      blending: "core",
      anisotropy: "core",
      sharpening: 0,
      colorBoost: "off",
      fxaa: false,
    });
  });
});

describe("device profile suggestion", () => {
  it("reads cores and memory, ignoring missing or invalid values", () => {
    expect(detectDevice({ hardwareConcurrency: 8, deviceMemory: 6 })).toEqual({ cores: 8, memoryGb: 6 });
    expect(detectDevice({})).toEqual({ cores: null, memoryGb: null });
    expect(detectDevice({ hardwareConcurrency: 0, deviceMemory: -1 })).toEqual({ cores: null, memoryGb: null });
  });

  it("suggests light for little memory or few cores", () => {
    expect(suggestProfile({ cores: 8, memoryGb: 2 })).toBe("light");
    expect(suggestProfile({ cores: 4, memoryGb: 6 })).toBe("light");
  });

  it("suggests quality only with 8+ cores and 8 GB or more, never 4K", () => {
    expect(suggestProfile({ cores: 8, memoryGb: 8 })).toBe("quality");
    expect(suggestProfile({ cores: 8, memoryGb: 6 })).toBe("balanced");
    expect(suggestProfile({ cores: 12, memoryGb: 8 })).not.toBe("ultra");
  });

  it("falls back to balanced when the WebView reports nothing", () => {
    expect(suggestProfile({ cores: null, memoryGb: null })).toBe("balanced");
  });
});

describe("low FPS detector", () => {
  const feed = (d: ReturnType<typeof createLowFpsDetector>, fps: number, times: number) => {
    let fired = false;
    for (let i = 0; i < times; i++) fired = d.push(fps) || fired;
    return fired;
  };

  it("ignores the warm-up period, loading screens and pauses", () => {
    const d = createLowFpsDetector();
    expect(feed(d, 10, 15)).toBe(false); // aquecimento
    expect(feed(d, 0, 30)).toBe(false); // carregando/pausado
  });

  it("fires once after sustained low FPS", () => {
    const d = createLowFpsDetector();
    feed(d, 60, 15);
    expect(feed(d, 12, 7)).toBe(false);
    expect(d.push(12)).toBe(true);
    expect(feed(d, 12, 20)).toBe(false);
  });

  it("a recovery resets the streak", () => {
    const d = createLowFpsDetector();
    feed(d, 60, 15);
    feed(d, 12, 7);
    d.push(45);
    expect(feed(d, 12, 7)).toBe(false);
  });
});

describe("lighter suggestion", () => {
  it("halves the resolution first, so 6x drops to 3x", () => {
    const s = suggestLighter({ resolution: "6", eeCycleRate: "0", frameSkip: 0 });
    expect(s?.patch).toEqual({ resolution: "3" });
    expect(suggestLighter({ resolution: "2", eeCycleRate: "0", frameSkip: 0 })?.patch).toEqual({ resolution: "1" });
  });

  it("then eases the EE, then frame skip, then gives up", () => {
    expect(suggestLighter({ resolution: "1", eeCycleRate: "0", frameSkip: 0 })?.patch).toEqual({ eeCycleRate: "-1" });
    expect(suggestLighter({ resolution: "1", eeCycleRate: "1", frameSkip: 0 })?.patch).toEqual({ eeCycleRate: "0" });
    expect(suggestLighter({ resolution: "1", eeCycleRate: "-1", frameSkip: 0 })?.patch).toEqual({ frameSkip: 1 });
    expect(suggestLighter({ resolution: "1", eeCycleRate: "-2", frameSkip: 1 })).toBeNull();
  });
});

