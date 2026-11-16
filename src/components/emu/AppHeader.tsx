import { Link } from "@tanstack/react-router";
import { Library, Settings } from "lucide-react";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-md bg-primary font-display text-sm font-bold text-primary-foreground glow">
            N2
          </span>
          <span className="font-display text-lg font-semibold tracking-[0.2em]">NEBULA·2</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-foreground bg-secondary" }}
            activeOptions={{ exact: true }}
          >
            <Library className="size-4" />
            <span className="hidden sm:inline">Biblioteca</span>
          </Link>
          <Link
            to="/configuracoes"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-foreground bg-secondary" }}
          >
            <Settings className="size-4" />
            <span className="hidden sm:inline">Configurações</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
