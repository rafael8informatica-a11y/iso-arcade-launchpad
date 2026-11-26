import { describe, expect, it } from "vitest";
import { isGameFile, performancePatch } from "@/lib/performance";

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