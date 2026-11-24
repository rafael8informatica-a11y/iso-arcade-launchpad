<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- The UI talks to the PS2 core only through `src/lib/emulator.ts`: in the APK it calls the Capacitor plugin `Ps2Core` (Ps2CorePlugin.java), in the browser a demo stub, so screens never touch native code.
- The native core is the official ARMSX2 release APK, pinned by version + SHA-256 in `scripts/fetch-armsx2-core.sh` and downloaded at APK build time (never committed); `kr.co.iefriends.pcsx2.NativeApp`, `com.armsx2.BiosInfo` and `org.libsdl.app.*` keep ARMSX2's exact names because the .so binds to them, so check new natives against the pinned version's exports.
- Game list and settings persist in localStorage via `src/lib/library.ts`; ISO/BIOS files live only in memory per session because browsers can't reliably keep multi-GB files.
- Offline mode uses vite-plugin-pwa (generateSW, client environment only, sw.js written to dist/client); the only registrar is src/lib/pwa.ts, which refuses dev, iframes and Lovable preview hosts so the editor preview never gets a stale cache.
- Fonts are self-hosted via @fontsource (latin subsets) so the app renders offline.
- Android APK uses Capacitor (`capacitor.config.ts`, `android/`, webDir `dist/client`); `CAPACITOR_BUILD=1 vite build` switches TanStack Start to SPA mode (static index.html) and drops the service worker, and `.github/workflows/android-apk.yml` builds the debug APK on GitHub because the user has no Android Studio. Normal web builds stay SSR.
