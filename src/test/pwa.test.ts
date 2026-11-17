import { describe, expect, it } from "vitest";

import { isNativeApp, isPreviewHost } from "@/lib/pwa";

describe("offline mode only outside the editor preview", () => {
  it("refuses the Lovable preview", () => {
    expect(isPreviewHost("id-preview--bf3940e2-57fa-4040-9850-dd4ebb38a94f.lovable.app")).toBe(true);
    expect(isPreviewHost("abc.lovableproject.com")).toBe(true);
  });

  it("allows the published app", () => {
    expect(isPreviewHost("iso-arcade-launchpad.lovable.app")).toBe(false);
  });
});

describe("no offline cache inside the Android app", () => {
  it("detects the Android app", () => {
    expect(isNativeApp({ Capacitor: { isNativePlatform: () => true } })).toBe(true);
  });

  it("treats a normal browser as not the Android app", () => {
    expect(isNativeApp({})).toBe(false);
    expect(isNativeApp({ Capacitor: { isNativePlatform: () => false } })).toBe(false);
  });
});
