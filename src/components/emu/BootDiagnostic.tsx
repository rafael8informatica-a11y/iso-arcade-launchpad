import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Cpu, Monitor, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { BootDiagnosis, DiagnosticAction } from "@/lib/diagnostics";

const ACTION_ICON = {
  renderer: Monitor,
  bios: Cpu,
  retry: RefreshCw,
  library: ArrowLeft,
} as const;

/** Cobre a tela de jogo quando o boot falha, no lugar da tela preta com status travado. */
export function BootDiagnostic({
  diagnosis,
  onAction,
}: {
  diagnosis: BootDiagnosis;
  onAction: (action: DiagnosticAction) => void;
}) {
  const [primary, ...others] = diagnosis.actions.filter((a) => a.type !== "library");
  const hasLibrary = diagnosis.actions.some((a) => a.type === "library");

  const renderAction = (action: DiagnosticAction, variant: "hero" | "secondary") => {
    const Icon = ACTION_ICON[action.type];
    return (
      <Button key={`${action.type}-${action.label}`} variant={variant} size="lg" onClick={() => onAction(action)}>
        <Icon /> {action.label}
      </Button>
    );
  };

  return (
    <div className="absolute inset-0 z-30 grid place-items-center overflow-y-auto bg-background bg-grid p-4">
      <div role="alert" className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-tight">{diagnosis.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{diagnosis.cause}</p>
          </div>
        </div>

        {diagnosis.tips.length > 0 && (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {diagnosis.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        )}

        <div className="mt-5 grid gap-2">
          {primary && renderAction(primary, "hero")}
          {others.map((a) => renderAction(a, "secondary"))}
          {hasLibrary && (
            <Button variant="ghost" asChild>
              <Link to="/">
                <ArrowLeft /> Voltar à biblioteca
              </Link>
            </Button>
          )}
        </div>

        {diagnosis.detail && (
          <details className="mt-4 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">Detalhe técnico</summary>
            <p className="mt-2 break-words rounded-md bg-background/60 p-2 font-mono">{diagnosis.detail}</p>
          </details>
        )}
      </div>
    </div>
  );
}
