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

import { BootDiagnostic } from "@/components/emu/BootDiagnostic";
import { VirtualPad } from "@/components/emu/VirtualPad";
import { Button } from "@/components/ui/button";
import { useConnectedGamepads, useGamepadInput } from "@/hooks/use-gamepad";
import { diagnoseBootFailure, type BootDiagnosis, type DiagnosticAction } from "@/lib/diagnostics";
import { emulator, isNativeCore, pickNativeBios, pickNativeIsos, type IsoSource } from "@/lib/emulator";
import {
  getBios,
  getGameSettings,
  getIsoSource,
  ISO_ACCEPT,
  markPlayed,
  relinkIso,
  relinkNativeIso,
  setBiosName,
  setGameOverride,
  useGames,
  useGameSettings,
} from "@/lib/library";
import { createLowFpsDetector, suggestLighter, type LighterSuggestion } from "@/lib/performance";
import {
  AUTO_SLOT,
  formatSavedAt,
  getSaveSlots,
  MANUAL_SLOTS,
  recordSave,
  useSaveSlots,
  type SaveKind,
} from "@/lib/saves";
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
  // Global + ajustes próprios deste jogo.
  const settings = useGameSettings(gameId);
  const game = games.find((g) => g.id === gameId);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [file, setFile] = useState<IsoSource | null>(null);
  const [status, setStatus] = useState("Preparando…");
  const [fps, setFps] = useState(0);
  const [paused, setPaused] = useState(false);
  const [slot, setSlot] = useState(1);
  const [failure, setFailure] = useState<BootDiagnosis | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [lowFpsHint, setLowFpsHint] = useState<LighterSuggestion | null>(null);
  const saves = useSaveSlots(gameId);
  const slotInfo = saves[String(slot)];

  // Controle na tela: some sozinho com um gamepad físico (se a opção estiver ligada),
  // e o botão do olho vale como escolha manual até o gamepad conectar/desconectar.
  const hasGamepad = useConnectedGamepads().length > 0;
  const autoHidePad = settings.hidePadOnGamepad && hasGamepad;
  const [padOverride, setPadOverride] = useState<boolean | null>(null);
  useEffect(() => setPadOverride(null), [autoHidePad]);
  const padVisible = padOverride ?? !autoHidePad;

  useGamepadInput(!paused && !failure, settings.deadzone);

  useEffect(() => {
    setFile(getIsoSource(gameId));
  }, [gameId, game?.uri]);

  useEffect(() => {
    if (!file || !canvasRef.current) return;
    const canvas = canvasRef.current;
    // Lido na hora de ligar: pega o que foi mudado nas configurações deste jogo.
    const effective = getGameSettings(gameId);
    const biosName = getBios()?.name ?? effective.biosName;

    setFailure(null);
    setLowFpsHint(null);
    setStatus("Preparando…");
    setFps(0);

    // No APK o núcleo não liga sem BIOS: avisa antes, em vez de deixar a tela preta.
    if (isNativeCore && !biosName) {
      setFailure(diagnoseBootFailure(null, { renderer: effective.renderer, hasBios: false }));
      return;
    }

    const started = Date.now();
    let cancelled = false;
    let reported = false;
    const fail = (message?: string | null) => {
      if (cancelled || reported) return;
      reported = true;
      setFailure(diagnoseBootFailure(message, { renderer: effective.renderer, hasBios: Boolean(biosName) }));
    };

    // O canvas é só a prévia; a resolução real (até 6x) é do núcleo. Não vale gastar memória com 4K aqui.
    const canvasScale = Math.min(3, Number(effective.resolution));
    canvas.width = 640 * canvasScale;
    canvas.height = 480 * canvasScale;

    // Jogo lento: depois de alguns segundos abaixo de 25 FPS, sugere um passo mais leve só para este jogo.
    const lighter = suggestLighter(effective);
    const detector = lighter ? createLowFpsDetector() : null;
    // Retoma do salvamento automático assim que o jogo começa a render.
    let autoLoadPending = effective.autoLoad && getSaveSlots(gameId)[String(AUTO_SLOT)] !== undefined;
    const onFps = (value: number) => {
      setFps(value);
      if (value > 0 && autoLoadPending) {
        autoLoadPending = false;
        window.setTimeout(() => {
          if (cancelled) return;
          emulator
            .loadState(AUTO_SLOT)
            .then(() => toast.success("Continuando de onde você parou"))
            .catch(() => toast.info("Não encontrei o salvamento automático deste jogo"));
        }, 1500);
      }
      if (lighter && detector?.push(value) && !cancelled) setLowFpsHint(lighter);
    };

    void emulator
      .boot({
        canvas,
        iso: file,
        bios: getBios(),
        settings: effective,
        onStatus: setStatus,
        onFps,
        onError: fail,
      })
      .catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
    markPlayed(gameId);
    // Partida sempre em tela cheia (no APK o Android já esconde as barras).
    if (!isNativeCore) {
      void goFullscreen();
      const retry = () => void goFullscreen();
      window.addEventListener("pointerdown", retry, { once: true });
    }
    return () => {
      cancelled = true;
      if (!isNativeCore && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      emulator.stop();
      markPlayed(gameId, Math.round((Date.now() - started) / 60000));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, gameId, attempt]);

  const handleDiagnosticAction = (action: DiagnosticAction) => {
    if (action.type === "retry") {
      setAttempt((n) => n + 1);
    } else if (action.type === "renderer") {
      // Só este jogo muda de renderizador; o global fica como está.
      setGameOverride(gameId, { renderer: action.renderer });
      toast.success(`Este jogo agora usa ${action.renderer === "opengl" ? "OpenGL" : action.renderer === "vulkan" ? "Vulkan" : "Software"}`);
      setAttempt((n) => n + 1);
    } else if (action.type === "bios") {
      if (!isNativeCore) {
        void navigate({ to: "/configuracoes" });
        return;
      }
      pickNativeBios()
        .then((bios) => {
          if (!bios) return;
          setBiosName(bios.name);
          toast.success(bios.description ? `BIOS pronta: ${bios.description}` : "BIOS pronta");
          setAttempt((n) => n + 1);
        })
        .catch((err: unknown) => toast.error(err instanceof Error ? err.message : String(err)));
    }
  };

  const saveSlot = async (n: number, kind: SaveKind, quiet = false) => {
    try {
      await emulator.saveState(n);
      recordSave(gameId, n, kind);
      if (!quiet) toast.success(kind === "auto" ? "Salvo no slot Auto" : `Estado salvo no slot ${n}`);
      return true;
    } catch (err) {
      if (!quiet) toast.error(err instanceof Error ? err.message : `Não deu para salvar no slot ${n}`);
      return false;
    }
  };

  const playing = fps > 0 && !failure;

  /** Sai do jogo, salvando antes no slot Auto quando pedido. */
  const exitGame = async (save: boolean) => {
    if (save && playing) await saveSlot(AUTO_SLOT, "auto", true);
    void navigate({ to: "/" });
  };

  // Salvamento automático a cada N minutos, só enquanto o jogo está rodando.
  useEffect(() => {
    const minutes = Number(settings.autoSaveMinutes);
    if (!playing || paused || !minutes) return;
    const id = window.setInterval(() => void saveSlot(AUTO_SLOT, "auto", true), minutes * 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, paused, settings.autoSaveMinutes, gameId]);

  // App foi para segundo plano (o Android pode encerrar depois): salva antes.
  const latest = useRef({ playing, autoSave: settings.autoSaveOnExit });
  latest.current = { playing, autoSave: settings.autoSaveOnExit };
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden" && latest.current.playing && latest.current.autoSave) {
        void saveSlot(AUTO_SLOT, "auto", true);
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

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
            aria-label={padVisible ? "Esconder controle" : "Mostrar controle"}
            onClick={() => setPadOverride(!padVisible)}
          >
            {padVisible ? <EyeOff /> : <Eye />}
          </Button>
          <Button variant="glass" size="icon" aria-label="Tela cheia" onClick={goFullscreen}>
            <Maximize />
          </Button>
        </div>
      </div>

      {padVisible && !paused && !failure && (
        <VirtualPad opacity={settings.padOpacity} scale={settings.padScale} vibration={settings.vibration} />
      )}

      {lowFpsHint && !paused && !failure && (
        <div
          role="status"
          className="absolute left-0 right-0 top-16 z-10 mx-auto w-[min(92vw,26rem)] rounded-xl border border-border bg-card/95 p-3 shadow-card"
        >
          <p className="text-sm font-medium">Está rodando devagar</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Dá para aliviar só este jogo: {lowFpsHint.message}. Vale a partir da próxima vez que ele abrir.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="hero"
              onClick={() => {
                setGameOverride(gameId, lowFpsHint.patch);
                toast.success("Ajuste guardado para este jogo");
                setLowFpsHint(null);
              }}
            >
              Aplicar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLowFpsHint(null)}>
              Agora não
            </Button>
          </div>
        </div>
      )}

      {failure && <BootDiagnostic diagnosis={failure} onAction={handleDiagnosticAction} />}

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
                {[...MANUAL_SLOTS, AUTO_SLOT].map((n) => (
                  <button
                    key={n}
                    aria-pressed={slot === n}
                    onClick={() => setSlot(n)}
                    className={cn(
                      "flex h-12 flex-col items-center justify-center gap-1 rounded-md border font-display text-sm leading-none transition-colors",
                      slot === n ? "border-primary bg-primary/20 text-primary" : "border-border hover:bg-accent",
                    )}
                  >
                    {n === AUTO_SLOT ? "Auto" : n}
                    <span
                      aria-hidden
                      className={cn("size-1.5 rounded-full", saves[String(n)] ? "bg-primary" : "bg-transparent")}
                    />
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {slot === AUTO_SLOT ? "Auto" : `Slot ${slot}`} ·{" "}
                {slotInfo ? `salvo ${formatSavedAt(slotInfo.savedAt)}` : "sem registro de save"}
              </p>
            </div>

            <div className="grid gap-2">
              <Button variant="hero" size="lg" onClick={togglePause}>
                <Play /> Continuar
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  onClick={async () => {
                    const info = saves[String(slot)];
                    if (
                      info &&
                      slot !== AUTO_SLOT &&
                      !window.confirm(`Sobrescrever o slot ${slot} (salvo ${formatSavedAt(info.savedAt)})?`)
                    ) {
                      return;
                    }
                    await saveSlot(slot, slot === AUTO_SLOT ? "auto" : "manual");
                  }}
                >
                  <Download /> Salvar
                </Button>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await emulator.loadState(slot);
                      toast.success(slot === AUTO_SLOT ? "Slot Auto carregado" : `Slot ${slot} carregado`);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : `O slot ${slot === AUTO_SLOT ? "Auto" : slot} está vazio`);
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
              <Button variant="secondary" onClick={() => void exitGame(true)}>
                <Download /> Salvar e sair
              </Button>
              <Button variant="ghost" className="text-destructive" onClick={() => void exitGame(settings.autoSaveOnExit)}>
                <ArrowLeft /> Sair do jogo
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                Salvar ao sair: {settings.autoSaveOnExit ? "ligado" : "desligado"}
                {Number(settings.autoSaveMinutes) > 0 ? ` · autosave a cada ${settings.autoSaveMinutes} min` : ""}
              </p>
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
