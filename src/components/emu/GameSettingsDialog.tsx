import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ANISOTROPY_OPTIONS,
  ASPECT_OPTIONS,
  BLENDING_OPTIONS,
  COLOR_BOOST_OPTIONS,
  EE_OPTIONS,
  FXAA_OPTIONS,
  PRELOADING_OPTIONS,
  RENDERER_OPTIONS,
  RESOLUTION_OPTIONS,
  SHARPENING_OPTIONS,
  optionLabel,
  type Option,
} from "@/lib/options";
import {
  countOverrides,
  resetGameOverride,
  setGameOverride,
  useGameOverride,
  useSettings,
  type Game,
  type GameOverridePatch,
  type Settings,
} from "@/lib/library";

const GLOBAL = "global";

const FRAME_SKIP_LABEL = (n: number) => (n === 0 ? "0 (desligado)" : String(n));

function OverrideRow({
  label,
  hint,
  value,
  globalLabel,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  /** Valor próprio deste jogo; undefined = segue o global. */
  value: string | undefined;
  globalLabel: string;
  options: readonly Option[];
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Select value={value ?? GLOBAL} onValueChange={(v) => onChange(v === GLOBAL ? null : v)}>
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={GLOBAL}>Padrão global ({globalLabel})</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function GameSettingsDialog({
  game,
  open,
  onOpenChange,
}: {
  game: Game;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const global = useSettings();
  const override = useGameOverride(game.id);
  const count = countOverrides(override);
  const set = (patch: GameOverridePatch) => setGameOverride(game.id, patch);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{game.title}</DialogTitle>
          <DialogDescription>
            {count > 0
              ? `${count} ${count === 1 ? "ajuste vale" : "ajustes valem"} só para este jogo. Entram em vigor na próxima vez que ele iniciar.`
              : "Este jogo usa as configurações globais. Mude abaixo só o que ele precisa de diferente."}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="graphics">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="graphics">Imagem</TabsTrigger>
            <TabsTrigger value="performance">Desempenho</TabsTrigger>
          </TabsList>

          <TabsContent value="graphics" className="mt-3 divide-y divide-border">
            <OverrideRow
              label="Renderizador"
              value={override.renderer}
              globalLabel={optionLabel(RENDERER_OPTIONS, global.renderer)}
              options={RENDERER_OPTIONS}
              onChange={(v) => set({ renderer: v as Settings["renderer"] | null })}
            />
            <OverrideRow
              label="Resolução interna"
              hint="Mais alto = mais nítido, mais pesado. 6x chega perto de 4K."
              value={override.resolution}
              globalLabel={optionLabel(RESOLUTION_OPTIONS, global.resolution)}
              options={RESOLUTION_OPTIONS}
              onChange={(v) => set({ resolution: v as Settings["resolution"] | null })}
            />
            <OverrideRow
              label="Proporção da tela"
              value={override.aspect}
              globalLabel={optionLabel(ASPECT_OPTIONS, global.aspect)}
              options={ASPECT_OPTIONS}
              onChange={(v) => set({ aspect: v as Settings["aspect"] | null })}
            />
            <OverrideRow
              label="Filtro anisotrópico"
              hint="Texturas nítidas em chão e estradas vistas de ângulo"
              value={override.anisotropy}
              globalLabel={optionLabel(ANISOTROPY_OPTIONS, global.anisotropy)}
              options={ANISOTROPY_OPTIONS}
              onChange={(v) => set({ anisotropy: v as Settings["anisotropy"] | null })}
            />
            <OverrideRow
              label="Nitidez (CAS)"
              value={override.sharpening === undefined ? undefined : String(override.sharpening)}
              globalLabel={global.sharpening === 0 ? "Desligada" : String(global.sharpening)}
              options={SHARPENING_OPTIONS}
              onChange={(v) => set({ sharpening: v === null ? null : Number(v) })}
            />
            <OverrideRow
              label="Realce de cores"
              value={override.colorBoost}
              globalLabel={optionLabel(COLOR_BOOST_OPTIONS, global.colorBoost)}
              options={COLOR_BOOST_OPTIONS}
              onChange={(v) => set({ colorBoost: v as Settings["colorBoost"] | null })}
            />
            <OverrideRow
              label="Suavizar serrilhado (FXAA)"
              hint="Leve; faz mais diferença abaixo de 3x"
              value={override.fxaa === undefined ? undefined : override.fxaa ? "on" : "off"}
              globalLabel={global.fxaa ? "Ligado" : "Desligado"}
              options={FXAA_OPTIONS}
              onChange={(v) => set({ fxaa: v === null ? null : v === "on" })}
            />
          </TabsContent>

          <TabsContent value="performance" className="mt-3 divide-y divide-border">
            <OverrideRow
              label="Velocidade do EE (EE Cycle Rate)"
              hint="Negativo alivia celulares fracos; positivo acelera jogos que ficam lentos"
              value={override.eeCycleRate}
              globalLabel={optionLabel(EE_OPTIONS, global.eeCycleRate)}
              options={EE_OPTIONS}
              onChange={(v) => set({ eeCycleRate: v as Settings["eeCycleRate"] | null })}
            />
            <OverrideRow
              label="Pular quadros (Frame Skip)"
              hint="Ajuda em aparelhos mais fracos"
              value={override.frameSkip === undefined ? undefined : String(override.frameSkip)}
              globalLabel={FRAME_SKIP_LABEL(global.frameSkip)}
              options={[0, 1, 2, 3].map((n) => ({ value: String(n), label: FRAME_SKIP_LABEL(n) }))}
              onChange={(v) => set({ frameSkip: v === null ? null : Number(v) })}
            />
            <OverrideRow
              label="Precisão de blending"
              hint="Menor = mais rápido, mas pode errar sombras e transparências"
              value={override.blending}
              globalLabel={optionLabel(BLENDING_OPTIONS, global.blending)}
              options={BLENDING_OPTIONS}
              onChange={(v) => set({ blending: v as Settings["blending"] | null })}
            />
            <OverrideRow
              label="Pré-carregar texturas"
              value={override.texturePreloading}
              globalLabel={optionLabel(PRELOADING_OPTIONS, global.texturePreloading)}
              options={PRELOADING_OPTIONS}
              onChange={(v) => set({ texturePreloading: v as Settings["texturePreloading"] | null })}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            disabled={count === 0}
            onClick={() => {
              resetGameOverride(game.id);
              toast.success("Este jogo voltou ao padrão global");
            }}
          >
            Restaurar para o padrão global
          </Button>
          <DialogClose asChild>
            <Button variant="secondary">Fechar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
