import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Maximize,
  Pause,
  Play,
  Settings,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { VirtualPad } from "@/components/emu/VirtualPad";
import { Button } from "@/components/ui/button";
import { emulator, isNativeCore, pickNativeIsos, type IsoSource } from "@/lib/emulator";
import {
  getBios,
  getIsoSource,
  ISO_ACCEPT,
  markPlayed,
  relinkIso,
  relinkNativeIso,
  useGames,
  useSettings,
} from "@/lib/library";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/jogar/$gameId")({
  head: () => ({
    meta: [
      { title: "Jogando — NEBULA·2" },
      { name: "description", content: "Tela de jogo do emulador NEBULA·2 com controle virtual." },
      { property: "og:title", content: "Jogando — NEBULA·2" },
      { property: "og:description", content: "Tela de jogo do emulador NEBULA·2." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlayerPage,
});

const ASPECT_CLASS = {
  "4:3": "aspect-[4/3] h-full max-w-full",
  "16:9": "aspect-video h-full max-w-full",
  stretch: "h-full w-full",
} as const;

function PlayerPage() {
  const { gameId } = Route.useParams();
  const navigate = useNavigate();
  const games = useGames();
  const settings = useSettings();
  const game = games.find((g) => g.id === gameId);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [file, setFile] = useState<IsoSource | null>(null);
  const [status, setStatus] = useState("Preparando…");
  const [fps, setFps] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showPad, setShowPad] = useState(true);
  const [slot, setSlot] = useState(1);

  useEffect(() => {
    setFile(getIsoSource(gameId));
  }, [gameId, game?.uri]);

  useEffect(() => {
    if (!file || !canvasRef.current) return;
    const started = Date.now();
    const canvas = canvasRef.current;
    canvas.width = 640 * Number(settings.resolution);
    canvas.height = 480 * Number(settings.resolution);
    void emulator.boot({
      canvas,
      iso: file,
      bios: getBios(),
      settings,
      onStatus: setStatus,
      onFps: setFps,
    });
    markPlayed(gameId);
    // Partida sempre em tela cheia (no APK o Android já esconde as barras).
    if (!isNativeCore) {
      void goFullscreen();
      const retry = () => void goFullscreen();
      window.addEventListener("pointerdown", retry, { once: true });
    }
    return () => {
      if (!isNativeCore && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      emulator.stop();
      markPlayed(gameId, Math.round((Date.now() - started) / 60000));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, gameId]);

  const togglePause = () => {
    if (paused) emulator.resume();
    else emulator.pause();
    setPaused(!paused);
  };

  const goFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await o.lock?.("landscape");
    } catch {
      /* nem todo navegador permite */
    }
  };

  if (games.length > 0 && !game) {
    return (
      <CenterMessage title="Jogo não encontrado">
        <Button asChild>
          <Link to="/">Voltar à biblioteca</Link>
        </Button>
      </CenterMessage>
    );
  }

  if (!file) {
    return (
      <CenterMessage
        title={game?.title ?? "Carregando…"}
        text="Selecione o arquivo da ISO novamente para começar a jogar nesta sessão."
      >
        <label className="inline-flex">
          <input
            type="file"
            accept={ISO_ACCEPT}
            hidden
            onClick={(e) => {
              if (!isNativeCore) return;
              e.preventDefault();
              void pickNativeIsos(false)
                .then(([picked]) => {
                  if (picked) relinkNativeIso(gameId, picked.uri);
                })
                .catch((err: unknown) => toast.error(String(err instanceof Error ? err.message : err)));
            }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                relinkIso(gameId, f);
                setFile(f);
              }
            }}
          />
          <span className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-lg bg-primary px-6 font-display uppercase tracking-wider text-primary-foreground glow">
            <FolderOpen className="size-5" /> Escolher ISO
          </span>
        </label>
        <Button variant="ghost" asChild>
          <Link to="/">Voltar</Link>
        </Button>
      </CenterMessage>
    );
  }

  return (
    <div className={cn("fixed inset-0 overflow-hidden", isNativeCore ? "bg-transparent" : "bg-screen")}>
      {/* Tela do jogo */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* No APK o jogo aparece por trás da página (tela nativa); o canvas fica transparente. */}
        <canvas
          ref={canvasRef}
          className={cn("object-contain", isNativeCore ? "bg-transparent" : "bg-screen", ASPECT_CLASS[settings.aspect])}
        />
      </div>

      {/* Barra superior */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-background/80 to-transparent px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="glass" size="icon" aria-label="Pausar" onClick={togglePause}>
            {paused ? <Play /> : <Pause />}
          </Button>
          <div className="min-w-0">
            <p className="truncate font-display text-sm">{game?.title}</p>
            <p className="truncate text-[11px] text-muted-foreground">{status}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {settings.showFps && (
            <span className="rounded-md bg-background/60 px-2 py-1 font-display text-xs text-success">
              {fps} FPS
            </span>
          )}
          <Button
            variant="glass"
            size="icon"
            aria-label={showPad ? "Esconder controle" : "Mostrar controle"}
            onClick={() => setShowPad(!showPad)}
          >
            {showPad ? <EyeOff /> : <Eye />}
          </Button>
          <Button variant="glass" size="icon" aria-label="Tela cheia" onClick={goFullscreen}>
            <Maximize />
          </Button>
        </div>
      </div>

      {showPad && !paused && (
        <VirtualPad opacity={settings.padOpacity} scale={settings.padScale} vibration={settings.vibration} />
      )}

      {/* Menu de pausa */}
      {paused && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="max-h-full w-full max-w-sm overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-wide">Pausado</h2>
              <button aria-label="Fechar" onClick={togglePause} className="text-muted-foreground hover:text-foreground">
                <X className="size-5" />
              </button>
            </div>

            <div className="mb-4">
              <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Slot de save</p>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setSlot(n)}
                    className={cn(
                      "h-9 rounded-md border font-display text-sm transition-colors",
                      slot === n ? "border-primary bg-primary/20 text-primary" : "border-border hover:bg-accent",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Button variant="hero" size="lg" onClick={togglePause}>
                <Play /> Continuar
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await emulator.saveState(slot);
                      toast.success(`Estado salvo no slot ${slot}`);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : `Não deu para salvar no slot ${slot}`);
                    }
                  }}
                >
                  <Download /> Salvar
                </Button>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await emulator.loadState(slot);
                      toast.success(`Slot ${slot} carregado`);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : `O slot ${slot} está vazio`);
                    }
                  }}
                >
                  <Upload /> Carregar
                </Button>
              </div>
              <Button variant="secondary" asChild>
                <Link to="/configuracoes">
                  <Settings /> Configurações
                </Link>
              </Button>
              <Button variant="ghost" className="text-destructive" onClick={() => navigate({ to: "/" })}>
                <ArrowLeft /> Sair do jogo
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CenterMessage({ title, text, children }: { title: string; text?: string; children?: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background bg-grid px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {text && <p className="mt-2 text-sm text-muted-foreground">{text}</p>}
        <div className="mt-6 flex flex-col items-center gap-2">{children}</div>
      </div>
    </div>
  );
}
