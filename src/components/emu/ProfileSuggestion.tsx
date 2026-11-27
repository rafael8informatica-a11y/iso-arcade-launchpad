import { Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { updateSettings, useSettings } from "@/lib/library";
import {
  detectDevice,
  performancePatch,
  PROFILE_LABELS,
  suggestProfile,
  type DeviceInfo,
} from "@/lib/performance";

/** Na primeira abertura, sugere o perfil que combina com o aparelho. Nunca aplica nada sozinho. */
export function ProfileSuggestion() {
  const settings = useSettings();
  // Lido depois de montar: no servidor não existe navigator.
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  useEffect(() => setDevice(detectDevice()), []);

  if (!device || settings.profileHintSeen) return null;

  const profile = suggestProfile(device);
  const parts = [
    device.cores ? `${device.cores} núcleos` : null,
    device.memoryGb ? `${device.memoryGb >= 8 ? "8 GB ou mais" : `~${device.memoryGb} GB`} de memória` : null,
  ].filter(Boolean);

  return (
    <div role="status" className="border-b border-border bg-card/60">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            Sugestão para este aparelho: perfil <span className="text-primary">{PROFILE_LABELS[profile]}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {parts.length > 0 ? `${parts.join(" · ")}. ` : ""}É só uma estimativa; dá para trocar a qualquer hora em
            Configurações.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="hero"
            onClick={() => {
              updateSettings({ ...performancePatch(profile), profileHintSeen: true });
              toast.success(`Perfil ${PROFILE_LABELS[profile].toLowerCase()} aplicado`);
            }}
          >
            <Zap /> Aplicar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => updateSettings({ profileHintSeen: true })}>
            Agora não
          </Button>
        </div>
      </div>
    </div>
  );
}
