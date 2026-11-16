import { Link } from "@tanstack/react-router";
import { MoreVertical, Pencil, Play, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { coverClass, formatSize, removeGame, renameGame, type Game } from "@/lib/library";
import { cn } from "@/lib/utils";

export function GameCard({ game, index }: { game: Game; index: number }) {
  const initials = game.title
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <div
      className="group relative animate-float-up"
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <Link
        to="/jogar/$gameId"
        params={{ gameId: game.id }}
        className="block overflow-hidden rounded-xl border border-border bg-card shadow-card transition-transform duration-300 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className={cn("relative aspect-[3/4] overflow-hidden", coverClass(game.id))}>
          <div className="absolute inset-0 scanlines opacity-60" />
          <div className="absolute left-0 top-0 h-full w-3 bg-foreground/10" />
          <div className="absolute left-5 top-4 font-display text-[10px] uppercase tracking-[0.3em] text-foreground/70">
            PS2 · DVD
          </div>
          <div className="absolute inset-0 grid place-items-center font-display text-5xl font-bold text-foreground/90 text-glow">
            {initials || "?"}
          </div>
          <div className="absolute inset-0 grid place-items-center bg-background/50 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground glow">
              <Play className="ml-0.5 size-6 fill-current" />
            </span>
          </div>
        </div>
        <div className="space-y-1 p-3">
          <h3 className="line-clamp-1 text-sm font-semibold">{game.title}</h3>
          <p className="text-xs text-muted-foreground">
            {formatSize(game.size)} ·{" "}
            {game.lastPlayedAt
              ? formatDistanceToNow(game.lastPlayedAt, { addSuffix: true, locale: ptBR })
              : "Nunca jogado"}
          </p>
        </div>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Opções do jogo"
          className="absolute right-2 top-2 grid size-8 place-items-center rounded-md bg-background/70 text-foreground opacity-100 backdrop-blur transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
        >
          <MoreVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              const t = window.prompt("Novo nome do jogo", game.title);
              if (t?.trim()) renameGame(game.id, t.trim());
            }}
          >
            <Pencil /> Renomear
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => removeGame(game.id)}
          >
            <Trash2 /> Remover da biblioteca
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
