import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { CheckCircle2, Cpu, Gamepad2, Monitor, Volume2, Zap } from "lucide-react";

import { AppHeader } from "@/components/emu/AppHeader";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { defaultSettings, setBios, updateSettings, useSettings, type Settings } from "@/lib/library";

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

function Range({ k, min, max, step = 1, unit = "" }: { k: "volume" | "padOpacity" | "padScale" | "frameSkip"; min: number; max: number; step?: number; unit?: string }) {
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

function Toggle({ k }: { k: "showFps" | "vibration" | "speedHacks" }) {
  const s = useSettings();
  return (
    <div className="flex sm:justify-end">
      <Switch checked={s[k]} onCheckedChange={(v) => updateSettings({ [k]: v })} />
    </div>
  );
}

function SettingsPage() {
  const s = useSettings();

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
          <Row label="Resolução interna" hint="Mais alto = mais nítido, mais pesado">
            <Choice
              k="resolution"
              options={[
                { value: "1", label: "1x nativa (480p)" },
                { value: "2", label: "2x (720p)" },
                { value: "3", label: "3x (1080p)" },
                { value: "4", label: "4x (1440p)" },
              ]}
            />
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
        </Section>

        <Section icon={<Zap className="size-4" />} title="Desempenho">
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
          <Row label="Speedhacks">
            <Toggle k="speedHacks" />
          </Row>
        </Section>

        <div className="flex justify-end">
          <Button
            variant="ghost"
            onClick={() => updateSettings({ ...defaultSettings, biosName: s.biosName })}
          >
            Restaurar padrões
          </Button>
        </div>
      </main>
    </div>
  );
}
