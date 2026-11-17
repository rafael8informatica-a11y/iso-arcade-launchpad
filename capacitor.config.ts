import type { CapacitorConfig } from "@capacitor/cli";

// Android app wrapper. The web part is the static export made with
// `CAPACITOR_BUILD=1 vite build` (see .github/workflows/android-apk.yml).
const config: CapacitorConfig = {
  appId: "com.nebula2.emulador",
  appName: "NEBULA·2",
  webDir: "dist/client",
  backgroundColor: "#0a1020",
  android: { allowMixedContent: false },
};

export default config;
