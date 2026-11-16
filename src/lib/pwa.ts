// Único lugar que registra o service worker do modo offline.
// Nunca registra no editor/preview do Lovable, em iframe ou em desenvolvimento.

const PROJECT_ID = "bf3940e2-57fa-4040-9850-dd4ebb38a94f";
const LOVABLE_HOST_SUFFIXES = [".lovable.app", ".gpt-eng.com", ".gptengineer.run"];
const PREVIEW_LABEL = /^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/;

function endsWithDomain(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

export function isPreviewHost(rawHost: string) {
  const host = rawHost.toLowerCase();
  const suffix = LOVABLE_HOST_SUFFIXES.find((s) => host.endsWith(s));
  if (suffix) {
    const label = host.slice(0, -suffix.length);
    if (!label.includes(".") && PREVIEW_LABEL.test(label)) return true;
    if (label === `project--${PROJECT_ID}-dev`) return true;
  }
  return (
    endsWithDomain(host, "lovableproject.com") ||
    endsWithDomain(host, "lovableproject-dev.com") ||
    endsWithDomain(host, "beta.lovable.dev")
  );
}

function inIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

async function unregisterAppWorker() {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs
      .filter((r) => [r.active, r.waiting, r.installing].some((w) => w?.scriptURL.endsWith("/sw.js")))
      .map((r) => r.unregister()),
  );
}

export async function setupPwa() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const refused =
    !import.meta.env.PROD ||
    inIframe() ||
    isPreviewHost(window.location.hostname) ||
    new URLSearchParams(window.location.search).get("sw") === "off";

  if (refused) {
    await unregisterAppWorker().catch(() => {});
    return;
  }

  // O service worker gerado já se atualiza sozinho (skipWaiting + clientsClaim).
  const { Workbox } = await import("workbox-window");
  await new Workbox("/sw.js", { scope: "/" }).register();
}
