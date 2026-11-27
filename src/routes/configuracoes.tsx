import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, Cpu, Download, Trash2, Gamepad2, Monitor, Volume2, Zap } from "lucide-react";

import { AppHeader } from "@/components/emu/AppHeader";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

import { useConnectedGamepads } from "@/hooks/use-gamepad";
import {
  ANISOTROPY_OPTIONS,
  AUTOSAVE_OPTIONS,
  BLENDING_OPTIONS,
  COLOR_BOOST_OPTIONS,
  PRELOADING_OPTIONS,
  RESOLUTION_OPTIONS,
} from "@/lib/options";
import { DEADZONE_MAX, DEADZONE_MIN, gamepadLabel } from "@/lib/gamepad";
import { isNativeCore, listGpuDrivers, pickGpuDriver, pickNativeBios, removeGpuDriver, type GpuDriver } from "@/lib/emulator";
import { defaultSettings, setBios, setBiosName, updateSettings, useSettings, type Settings } from "@/lib/library";
import { performancePatch, PROFILE_LABELS } from "@/lib/performance";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — NEBULA·2" },
      { name: "description", content: "BIOS, gráficos, áudio e controles do emulador NEBULA·2." },
      { property: "og:title", content: "Configurações — NEBULA·2" },
      { property: "og:description", content: "Ajuste BIOS, gráficos, áudio e controles do emulador." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <h2 className="mb-4 flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-primary">
        {icon} {title}
      </h2>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="sm:w-56">{children}</div>
    </div>
  );
}

function Choice<K extends keyof Settings>({
  k,
  options,
}: {
  k: K;
  options: { value: Settings[K] & string; label: string }[];
}) {
  const s = useSettings();
  return (
    <Select value={s[k] as string} onValueChange={(v) => updateSettings({ [k]: v } as Partial<Settings>)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Range({ k, min, max, step = 1, unit = "" }: { k: "volume" | "padOpacity" | "padScale" | "frameSkip" | "deadzone" | "sharpening"; min: number; max: number; step?: number; unit?: string }) {
  const s = useSettings();
  return (
    <div className="flex items-center gap-3">
      <Slider
        value={[s[k]]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => updateSettings({ [k]: v })}
        className="flex-1"
      />
      <span className="w-12 text-right font-display text-sm text-muted-foreground">
        {s[k]}
        {unit}
      </span>
    </div>
  );
}

function Toggle({ k }: { k: "showFps" | "vibration" | "speedHacks" | "mtvu" | "fastCdvd" | "skipDuplicateFrames" | "vsync" | "hidePadOnGamepad" | "fxaa" | "autoSaveOnExit" | "autoLoad" }) {
  const s = useSettings();
  return (
    <div className="flex sm:justify-end">
      <Switch checked={s[k]} onCheckedChange={(v) => updateSettings({ [k]: v })} />
    </div>
  );
}

function DriverSection() {
  const s = useSettings();
  const [drivers, setDrivers] = useState<GpuDriver[]>([]);
  const refresh = () => void listGpuDrivers().then(setDrivers).catch(() => {});
  useEffect(refresh, []);

  const select = (id: string) => {
    const d = drivers.find((x) => x.id === id);
    updateSettings({ gpuDriver: d?.id ?? null, gpuDriverName: d?.name ?? null });
  };

  return (
    <Section icon={<Cpu className="size-4" />} title="Driver da GPU">
      <Row label="Driver Vulkan" hint="Turnip (Adreno), MaliSX2 ou PanVK (Mali). Só vale no renderizador Vulkan.">
        <Select value={s.gpuDriver ?? "system"} onValueChange={(v) => select(v === "system" ? "" : v)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">Driver do sistema</SelectItem>
            {drivers.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
                {d.version ? ` (${d.version})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <div className="flex flex-wrap items-center justify-between gap-3 py-3 last:pb-0">
        <p className="text-xs text-muted-foreground">
          {isNativeCore ? "Instale o .zip do driver (formato AdrenoTools)." : "Disponível só no app Android."}
        </p>
        <div className="flex gap-2">
          {s.gpuDriver && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const id = s.gpuDriver;
                if (!id) return;
                void removeGpuDriver(id).then(() => {
                  updateSettings({ gpuDriver: null, gpuDriverName: null });
                  refresh();
                });
              }}
            >
              <Trash2 className="size-4" /> Remover
            </Button>
          )}
          <Button
            size="sm"
            disabled={!isNativeCore}
            onClick={() =>
              void pickGpuDriver()
                .then((d) => {
                  if (!d) return;
                  updateSettings({ gpuDriver: d.id, gpuDriverName: d.name, renderer: "vulkan" });
                  refresh();
                  toast.success(`Driver instalado: ${d.name}`);
                })
                .catch((err: unknown) => toast.error(err instanceof Error ? err.message : String(err)))
            }
          >
            Instalar driver
          </Button>
        </div>
      </div>
    </Section>
  );
}

function SettingsPage() {
  const s = useSettings();
  const pads = useConnectedGamepads();

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        <div>
          <h1 className="text-3xl font-bold">Configurações</h1>
          <p className="text-sm text-muted-foreground">As mudanças são salvas automaticamente.</p>
        </div>

        <Section icon={<Cpu className="size-4" />} title="BIOS">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              {s.biosName ? (
                <CheckCircle2 className="size-5 shrink-0 text-success" />
              ) : (
                <span className="size-2.5 shrink-0 rounded-full bg-warning" />
              )}
              <div>
                <p className="font-medium">{s.biosName ?? "Nenhuma BIOS selecionada"}</p>
                <p className="text-xs text-muted-foreground">
                  Use o arquivo .bin da BIOS extraído do seu próprio console.
                </p>
              </div>
            </div>
            <label>
              <input
                type="file"
                accept=".bin,.rom,.rom0"
                hidden
                onClick={(e) => {
                  // No APK a BIOS é copiada para dentro do app e conferida pelo núcleo.
                  if (!isNativeCore) return;
                  e.preventDefault();
                  pickNativeBios()
                    .then((bios) => {
                      if (!bios) return;
                      setBiosName(bios.name);
                      toast.success(bios.description ? `BIOS pronta: ${bios.description}` : "BIOS pronta");
                    })
                    .catch((err: unknown) => toast.error(err instanceof Error ? err.message : String(err)));
                }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setBios(f);
                }}
              />
              <span className="inline-flex h-9 cursor-pointer items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                {s.biosName ? "Trocar BIOS" : "Selecionar BIOS"}
              </span>
            </label>
          </div>
        </Section>

        <Section icon={<Monitor className="size-4" />} title="Gráficos">
          <Row label="Renderizador">
            <Choice
              k="renderer"
              options={[
                { value: "vulkan", label: "Vulkan" },
                { value: "opengl", label: "OpenGL" },
                { value: "software", label: "Software" },
              ]}
            />
          </Row>
          <Row label="Resolução interna" hint="Mais alto = mais nítido, mais pesado. 6x chega perto de 4K.">
            <Choice k="resolution" options={RESOLUTION_OPTIONS} />
          </Row>
          <Row label="Proporção da tela">
            <Choice
              k="aspect"
              options={[
                { value: "4:3", label: "4:3 (original)" },
                { value: "16:9", label: "16:9 (widescreen)" },
                { value: "stretch", label: "Esticar" },
              ]}
            />
          </Row>
          <Row label="Pular quadros" hint="Ajuda em aparelhos mais fracos">
            <Range k="frameSkip" min={0} max={3} />
          </Row>
          <Row label="Mostrar FPS">
            <Toggle k="showFps" />
          </Row>
        </Section>

        <Section icon={<Monitor className="size-4" />} title="Imagem e shaders">
          <Row label="Filtro anisotrópico" hint="Texturas nítidas em chão e estradas vistas de ângulo">
            <Choice k="anisotropy" options={ANISOTROPY_OPTIONS} />
          </Row>
          <Row label="Nitidez (CAS)" hint="Afia a imagem sem serrilhar. 0 desliga.">
            <Range k="sharpening" min={0} max={100} step={5} />
          </Row>
          <Row label="Realce de cores" hint="Mais contraste e saturação, no estilo HDR leve">
            <Choice k="colorBoost" options={COLOR_BOOST_OPTIONS} />
          </Row>
          <Row label="Suavizar serrilhado (FXAA)" hint="Leve; faz mais diferença abaixo de 3x">
            <Toggle k="fxaa" />
          </Row>
        </Section>

        <DriverSection />

        <Section icon={<Volume2 className="size-4" />} title="Áudio">
          <Row label="Volume">
            <Range k="volume" min={0} max={100} unit="%" />
          </Row>
        </Section>

        <Section icon={<Gamepad2 className="size-4" />} title="Controles">
          <Row label="Opacidade do controle na tela">
            <Range k="padOpacity" min={20} max={100} step={5} unit="%" />
          </Row>
          <Row label="Tamanho dos botões">
            <Range k="padScale" min={70} max={140} step={5} unit="%" />
          </Row>
          <Row label="Vibrar ao tocar">
            <Toggle k="vibration" />
          </Row>
          <Row
            label="Gamepad físico"
            hint="USB ou Bluetooth. Se o controle não aparecer, aperte um botão nele."
          >
            <p className="text-sm text-muted-foreground sm:text-right">
              {pads[0] ? gamepadLabel(pads[0].id) : "Nenhum controle detectado"}
            </p>
          </Row>
          <Row label="Zona morta dos analógicos" hint="Ignora pequenos desvios do analógico parado (drift)">
            <Range k="deadzone" min={DEADZONE_MIN} max={DEADZONE_MAX} step={1} unit="%" />
          </Row>
          <Row
            label="Ocultar controle na tela ao detectar gamepad"
            hint="O controle na tela volta sozinho quando o gamepad desconecta"
          >
            <Toggle k="hidePadOnGamepad" />
          </Row>
        </Section>

        <Section icon={<Zap className="size-4" />} title="Desempenho">
          <div className="flex flex-wrap gap-2 pb-4">
            {(Object.keys(PROFILE_LABELS) as (keyof typeof PROFILE_LABELS)[]).map((profile) => (
              <Button key={profile} variant="secondary" size="sm" onClick={() => {
                updateSettings(performancePatch(profile));
                toast.success(`Perfil ${PROFILE_LABELS[profile].toLowerCase()} aplicado`);
              }}>
                <Zap className="size-4" /> {PROFILE_LABELS[profile]}
              </Button>
            ))}
          </div>
          <p className="-mt-2 pb-4 text-xs text-muted-foreground">
            "Realista 4K" usa 6x, anisotrópico 16x, blending alto, nitidez e realce suave de cores. É pesado: só vale
            em aparelhos topo de linha.
          </p>
          <Row label="Velocidade do EE" hint="Underclock ajuda em celulares mais fracos">
            <Choice
              k="eeCycleRate"
              options={[
                { value: "-2", label: "50% (mais leve)" },
                { value: "-1", label: "75%" },
                { value: "0", label: "100% (padrão)" },
                { value: "1", label: "130%" },
                { value: "2", label: "180%" },
              ]}
            />
          </Row>
          <Row label="Speedhacks" hint="VU1 instantâneo, detecção de loops e INTC">
            <Toggle k="speedHacks" />
          </Row>
          <Row label="VU1 em outra thread (MTVU)" hint="Grande ganho em celulares com 4+ núcleos">
            <Toggle k="mtvu" />
          </Row>
          <Row label="Pular quadros repetidos" hint="Economiza GPU sem perder fluidez">
            <Toggle k="skipDuplicateFrames" />
          </Row>
          <Row label="Carregamento rápido de disco" hint="Pode travar alguns jogos">
            <Toggle k="fastCdvd" />
          </Row>
          <Row label="VSync" hint="Menos cortes na imagem, um pouco mais de atraso">
            <Toggle k="vsync" />
          </Row>
          <Row label="Precisão de blending" hint="Menor = mais rápido, mas pode errar sombras e transparências">
            <Choice k="blending" options={BLENDING_OPTIONS} />
          </Row>
          <Row label="Pré-carregar texturas" hint="Parcial alivia a memória de vídeo">
            <Choice k="texturePreloading" options={PRELOADING_OPTIONS} />
          </Row>
        </Section>

        <Section icon={<Download className="size-4" />} title="Salvamento">
          <Row label="Salvar ao sair" hint="Também salva quando o app vai para segundo plano">
            <Toggle k="autoSaveOnExit" />
          </Row>
          <Row label="Salvamento automático" hint="Grava no slot Auto enquanto você joga">
            <Choice k="autoSaveMinutes" options={AUTOSAVE_OPTIONS} />
          </Row>
          <Row label="Continuar de onde parou" hint="Ao abrir o jogo, retoma do slot Auto">
            <Toggle k="autoLoad" />
          </Row>
        </Section>

        <div className="flex justify-end">
          <Button
            variant="ghost"
            onClick={() => updateSettings({ ...defaultSettings, biosName: s.biosName, profileHintSeen: s.profileHintSeen })}
          >
            Restaurar padrões
          </Button>
        </div>
      </main>
    </div>
  );
}
