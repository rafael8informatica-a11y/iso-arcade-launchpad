import { describe, expect, it } from "vitest";

import { diagnoseBootFailure } from "@/lib/diagnostics";

const withBios = { renderer: "vulkan", hasBios: true } as const;
const noBios = { renderer: "vulkan", hasBios: false } as const;

describe("boot diagnostics", () => {
  it("blames the missing BIOS when none is selected, even for the generic core message", () => {
    expect(diagnoseBootFailure(null, noBios).kind).toBe("bios-missing");
    expect(diagnoseBootFailure("Não abriu: verifique a BIOS e a ISO", noBios).kind).toBe("bios-missing");
    expect(diagnoseBootFailure(null, noBios).actions.map((a) => a.type)).toEqual(["bios", "library"]);
  });

  it("reports an unrecognized BIOS when one is selected", () => {
    const d = diagnoseBootFailure("BIOS file not found or invalid", withBios);
    expect(d.kind).toBe("bios-invalid");
    expect(d.actions[0]?.type).toBe("bios");
  });

  it("offers OpenGL when Vulkan fails and Vulkan when OpenGL fails", () => {
    const vk = diagnoseBootFailure("vkCreateSwapchainKHR failed: VK_ERROR_INITIALIZATION_FAILED", withBios);
    expect(vk.kind).toBe("gpu-driver");
    expect(vk.title).toMatch(/Vulkan/);
    expect(vk.actions[0]).toEqual({ type: "renderer", renderer: "opengl", label: "Alternar para renderizador OpenGL" });

    const gl = diagnoseBootFailure("EGL context creation failed", { renderer: "opengl", hasBios: true });
    expect(gl.kind).toBe("gpu-driver");
    expect(gl.actions[0]).toMatchObject({ type: "renderer", renderer: "vulkan" });
  });

  it("detects an unreadable game image", () => {
    const d = diagnoseBootFailure("Failed to read disc image (CHD header corrupt)", withBios);
    expect(d.kind).toBe("game-corrupt");
    expect(d.actions.map((a) => a.type)).toContain("retry");
  });

  it("detects a missing native core", () => {
    const d = diagnoseBootFailure("Núcleo nativo indisponível: bibliotecas .so ausentes", withBios);
    expect(d.kind).toBe("core-unavailable");
    expect(d.actions.map((a) => a.type)).toEqual(["library"]);
  });

  it("falls back to a generic card, keeping the raw message as detail", () => {
    const d = diagnoseBootFailure("something odd happened", withBios);
    expect(d.kind).toBe("boot-failed");
    expect(d.detail).toBe("something odd happened");
    expect(d.actions.at(-1)?.type).toBe("library");
  });

  it("with a BIOS selected, the generic core message lists both suspects", () => {
    const d = diagnoseBootFailure("Não abriu: verifique a BIOS e a ISO", withBios);
    expect(d.kind).toBe("boot-failed");
    expect(d.tips.length).toBeGreaterThanOrEqual(2);
  });
});
