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

const RENDERER_LABEL: Record<Settings["renderer"], string> = {
  vulkan: "Vulkan",
  opengl: "OpenGL",
  software: "Software",
};
const RESOLUTION_LABEL: Record<Settings["resolution"], string> = {
  "1": "1x (480p)",
  "2": "2x (720p)",
  "3": "3x (1080p)",
  "4": "4x (1440p)",
};
const ASPECT_LABEL: Record<Settings["aspect"], string> = {
  "4:3": "4:3",
  "16:9": "16:9",
  stretch: "Stretch",
};
const EE_LABEL: Record<Settings["eeCycleRate"], string> = {
  "-2": "-2 (50%)",
  "-1": "-1 (75%)",
  "0": "0 (100%)",
  "1": "+1 (130%)",
  "2": "+2 (180%)",
};
const FRAME_SKIP_LABEL = (n: number) => (n === 0 ? "0 (desligado)" : String(n));

type Option = { value: string; label: string };

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
  options: Option[];
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

const toOptions = (labels: Record<string, string>): Option[] =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

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
              globalLabel={RENDERER_LABEL[global.renderer]}
              options={toOptions(RENDERER_LABEL)}
              onChange={(v) => set({ renderer: v as Settings["renderer"] | null })}
            />
            <OverrideRow
              label="Resolução interna"
              hint="Mais alto = mais nítido, mais pesado"
              value={override.resolution}
              globalLabel={RESOLUTION_LABEL[global.resolution]}
              options={toOptions({ "1": RESOLUTION_LABEL["1"], "2": RESOLUTION_LABEL["2"], "3": RESOLUTION_LABEL["3"] })}
              onChange={(v) => set({ resolution: v as "1" | "2" | "3" | null })}
            />
            <OverrideRow
              label="Proporção da tela"
              value={override.aspect}
              globalLabel={ASPECT_LABEL[global.aspect]}
              options={toOptions(ASPECT_LABEL)}
              onChange={(v) => set({ aspect: v as Settings["aspect"] | null })}
            />
          </TabsContent>

          <TabsContent value="performance" className="mt-3 divide-y divide-border">
            <OverrideRow
              label="Velocidade do EE (EE Cycle Rate)"
              hint="Negativo alivia celulares fracos; positivo acelera jogos que ficam lentos"
              value={override.eeCycleRate}
              globalLabel={EE_LABEL[global.eeCycleRate]}
              options={toOptions(EE_LABEL)}
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
