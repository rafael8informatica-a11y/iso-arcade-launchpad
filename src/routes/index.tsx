import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Cpu, Disc3, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import heroImg from "@/assets/hero-towers.jpg";
import { AppHeader } from "@/components/emu/AppHeader";
import { GameCard } from "@/components/emu/GameCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isNativeCore, pickNativeIsos } from "@/lib/emulator";
import { addIsoFiles, addNativeIsos, ISO_ACCEPT, useGames, useSettings } from "@/lib/library";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NEBULA·2 — Emulador de PS2" },
      { name: "description", content: "Sua biblioteca de jogos de PS2: importe ISOs e jogue com controle na tela." },
      { property: "og:title", content: "NEBULA·2 — Emulador de PS2" },
      { property: "og:description", content: "Importe suas ISOs de PS2 e jogue com controle virtual." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const games = useGames();
  const settings = useSettings();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? games.filter((g) => g.title.toLowerCase().includes(q)) : games;
    return [...list].sort((a, b) => (b.lastPlayedAt ?? b.addedAt) - (a.lastPlayedAt ?? a.addedAt));
  }, [games, query]);

  const onFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const n = addIsoFiles(files);
    toast.success(n ? `${n} jogo(s) adicionado(s)` : "Jogo já estava na biblioteca");
  };

  // No APK os jogos vêm do seletor do Android, que guarda o acesso ao arquivo.
  const importIsos = () => {
    if (!isNativeCore) {
      inputRef.current?.click();
      return;
    }
    pickNativeIsos()
      .then((picked) => {
        if (!picked.length) return;
        const n = addNativeIsos(picked);
        toast.success(n ? `${n} jogo(s) adicionado(s)` : "Jogo já estava na biblioteca");
      })
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : String(err)));
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <input
        ref={inputRef}
        type="file"
        accept={ISO_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <section className="relative overflow-hidden border-b border-border">
        <img
          src={heroImg}
          alt=""
          width={1600}
          height={800}
          className="absolute inset-0 h-full w-full object-cover object-right"
        />
        <div className="absolute inset-0 hero-fade" />
        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <p className="font-display text-xs uppercase tracking-[0.4em] text-primary">Emulador · PlayStation 2</p>
          <h1 className="mt-3 max-w-lg text-4xl font-bold leading-tight sm:text-5xl">
            Seus clássicos, <span className="text-primary text-glow">no bolso.</span>
          </h1>
          <p className="mt-3 max-w-md text-muted-foreground">
            Importe suas ISOs e jogue com controle na tela ou um controle Bluetooth.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button variant="hero" size="xl" onClick={importIsos}>
              <Plus /> Importar ISO
            </Button>
            <Button variant="glass" size="xl" asChild>
              <Link to="/configuracoes">
                <Cpu /> {settings.biosName ? "BIOS pronta" : "Configurar BIOS"}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {!settings.biosName && (
          <Link
            to="/configuracoes"
            className="mb-6 flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
          >
            <AlertTriangle className="size-4 shrink-0 text-warning" />
            <span>
              Nenhuma BIOS selecionada. Os jogos precisam de uma BIOS do PS2 —{" "}
              <span className="font-semibold text-warning underline-offset-4 hover:underline">selecionar agora</span>
            </span>
          </Link>
        )}

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Biblioteca</h2>
            <p className="text-sm text-muted-foreground">{games.length} jogo(s)</p>
          </div>
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar jogo…"
              className="pl-9"
            />
          </div>
        </div>

        {games.length === 0 ? (
          <button
            type="button"
            onClick={importIsos}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFiles(e.dataTransfer.files);
            }}
            className="flex w-full flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-border bg-card/40 px-6 py-20 text-center bg-grid transition-colors hover:border-primary/60"
          >
            <span className="relative grid size-16 place-items-center">
              <span className="absolute inset-0 rounded-full border border-primary animate-pulse-ring" />
              <Disc3 className="size-10 text-primary" />
            </span>
            <span className="font-display text-lg">Nenhum jogo ainda</span>
            <span className="max-w-sm text-sm text-muted-foreground">
              Toque para escolher arquivos .iso, .bin, .chd ou .cso — ou arraste aqui.
            </span>
          </button>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">Nenhum jogo encontrado para “{query}”.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filtered.map((g, i) => (
              <GameCard key={g.id} game={g} index={i} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
