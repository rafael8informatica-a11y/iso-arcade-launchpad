import { beforeEach, describe, expect, it, vi } from "vitest";

async function freshSaves() {
  vi.resetModules();
  return import("@/lib/saves");
}

describe("save slot registry", () => {
  beforeEach(() => localStorage.clear());

  it("has nine manual slots plus an auto slot", async () => {
    const saves = await freshSaves();
    expect(saves.MANUAL_SLOTS).toHaveLength(9);
    expect(saves.AUTO_SLOT).toBe(10);
  });

  it("records when each slot was saved and keeps games apart", async () => {
    const saves = await freshSaves();
    saves.recordSave("g1", 3, "manual", 1000);
    saves.recordSave("g1", saves.AUTO_SLOT, "auto", 2000);
    expect(saves.getSaveSlots("g1")).toEqual({
      "3": { savedAt: 1000, kind: "manual" },
      "10": { savedAt: 2000, kind: "auto" },
    });
    expect(saves.getSaveSlots("g2")).toEqual({});
  });

  it("overwriting a slot replaces its time", async () => {
    const saves = await freshSaves();
    saves.recordSave("g1", 1, "manual", 1000);
    saves.recordSave("g1", 1, "manual", 5000);
    expect(saves.getSaveSlots("g1")["1"]?.savedAt).toBe(5000);
  });

  it("persists across reloads and forgets a removed game", async () => {
    let saves = await freshSaves();
    saves.recordSave("g1", 2, "manual", 1234);
    saves = await freshSaves();
    expect(saves.getSaveSlots("g1")["2"]?.savedAt).toBe(1234);
    saves.forgetSaves("g1");
    saves = await freshSaves();
    expect(saves.getSaveSlots("g1")).toEqual({});
  });

  it("ignores invalid entries in storage", async () => {
    localStorage.setItem(
      "nebula2.saves",
      JSON.stringify({ g1: { "0": { savedAt: 1, kind: "manual" }, "11": { savedAt: 1, kind: "manual" }, "4": { savedAt: "x" }, "5": { savedAt: 99, kind: "weird" } } }),
    );
    const saves = await freshSaves();
    expect(saves.getSaveSlots("g1")).toEqual({ "5": { savedAt: 99, kind: "manual" } });
  });

  it("survives corrupted JSON", async () => {
    localStorage.setItem("nebula2.saves", "{oops");
    const saves = await freshSaves();
    expect(saves.getSaveSlots("g1")).toEqual({});
  });
});

describe("formatSavedAt", () => {
  it("says today, yesterday, or the date", async () => {
    const { formatSavedAt } = await freshSaves();
    const now = new Date(2026, 10, 27, 15, 0).getTime();
    expect(formatSavedAt(new Date(2026, 10, 27, 9, 5).getTime(), now)).toBe("hoje 09:05");
    expect(formatSavedAt(new Date(2026, 10, 26, 20, 10).getTime(), now)).toBe("ontem 20:10");
    expect(formatSavedAt(new Date(2026, 10, 20, 14, 32).getTime(), now)).toBe("20/11 14:32");
  });
});
