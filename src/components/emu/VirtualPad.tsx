import { useRef, useState, type ReactNode } from "react";

import { emulator, type PadButton, type Stick } from "@/lib/emulator";
import { cn } from "@/lib/utils";

type PadProps = { opacity: number; scale: number; vibration: boolean };

function useVibrate(enabled: boolean) {
  return () => {
    if (enabled && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(12);
  };
}

function PadKey({
  button,
  children,
  className,
  vibrate,
  label,
}: {
  button: PadButton;
  children: ReactNode;
  className?: string;
  vibrate: () => void;
  label: string;
}) {
  const [down, setDown] = useState(false);
  const release = () => {
    if (!down) return;
    setDown(false);
    emulator.setButton(button, false);
  };
  return (
    <button
      type="button"
      aria-label={label}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDown(true);
        vibrate();
        emulator.setButton(button, true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      className={cn(
        "pad-surface grid place-items-center font-display transition-transform duration-75",
        down && "pad-pressed",
        className,
      )}
    >
      {children}
    </button>
  );
}

function AnalogStick({ stick, label }: { stick: Stick; label: string }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const update = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const radius = r.width / 2;
    let dx = clientX - (r.left + radius);
    let dy = clientY - (r.top + radius);
    const dist = Math.hypot(dx, dy);
    const max = radius * 0.6;
    if (dist > max) {
      dx = (dx / dist) * max;
      dy = (dy / dist) * max;
    }
    setPos({ x: dx, y: dy });
    emulator.setAnalog(stick, dx / max, dy / max);
  };

  const reset = () => {
    setActive(false);
    setPos({ x: 0, y: 0 });
    emulator.setAnalog(stick, 0, 0);
  };

  return (
    <div
      ref={baseRef}
      role="slider"
      aria-label={label}
      aria-valuenow={0}
      className={cn("pad-surface relative size-28 rounded-full", active && "border-primary/70")}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setActive(true);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => active && update(e.clientX, e.clientY)}
      onPointerUp={reset}
      onPointerCancel={reset}
    >
      <div
        className={cn(
          "pad-surface absolute left-1/2 top-1/2 size-12 -translate-x-1/2 -translate-y-1/2 rounded-full",
          active && "pad-pressed",
        )}
        style={{ marginLeft: pos.x, marginTop: pos.y }}
      />
    </div>
  );
}

export function VirtualPad({ opacity, scale, vibration }: PadProps) {
  const vibrate = useVibrate(vibration);
  const s = scale / 100;

  return (
    <div className="pointer-events-none absolute inset-0 select-none" style={{ opacity: opacity / 100 }}>
      {/* Gatilhos */}
      <div
        className="pointer-events-auto absolute left-4 top-16 flex flex-col gap-2"
        style={{ transform: `scale(${s})`, transformOrigin: "top left" }}
      >
        <PadKey button="l2" label="L2" vibrate={vibrate} className="h-10 w-24 rounded-t-2xl rounded-b-md text-sm">L2</PadKey>
        <PadKey button="l1" label="L1" vibrate={vibrate} className="h-10 w-24 rounded-md text-sm">L1</PadKey>
      </div>
      <div
        className="pointer-events-auto absolute right-4 top-16 flex flex-col items-end gap-2"
        style={{ transform: `scale(${s})`, transformOrigin: "top right" }}
      >
        <PadKey button="r2" label="R2" vibrate={vibrate} className="h-10 w-24 rounded-t-2xl rounded-b-md text-sm">R2</PadKey>
        <PadKey button="r1" label="R1" vibrate={vibrate} className="h-10 w-24 rounded-md text-sm">R1</PadKey>
      </div>

      {/* Lado esquerdo: D-pad + analógico */}
      <div
        className="pointer-events-auto absolute bottom-4 left-4 flex items-end gap-6"
        style={{ transform: `scale(${s})`, transformOrigin: "bottom left" }}
      >
        <div className="grid grid-cols-3 grid-rows-3 gap-0.5">
          <span />
          <PadKey button="up" label="Cima" vibrate={vibrate} className="size-12 rounded-t-lg">▲</PadKey>
          <span />
          <PadKey button="left" label="Esquerda" vibrate={vibrate} className="size-12 rounded-l-lg">◀</PadKey>
          <span className="pad-surface size-12" />
          <PadKey button="right" label="Direita" vibrate={vibrate} className="size-12 rounded-r-lg">▶</PadKey>
          <span />
          <PadKey button="down" label="Baixo" vibrate={vibrate} className="size-12 rounded-b-lg">▼</PadKey>
          <span />
        </div>
        <AnalogStick stick="left" label="Analógico esquerdo" />
      </div>

      {/* Centro: select / start */}
      <div
        className="pointer-events-auto absolute top-4 left-1/2 flex -translate-x-1/2 gap-3"
        style={{ transform: `translateX(-50%) scale(${s})`, transformOrigin: "top center" }}
      >
        <PadKey button="select" label="Select" vibrate={vibrate} className="h-7 w-16 rounded-full text-[9px] tracking-widest">SELECT</PadKey>
        <PadKey button="start" label="Start" vibrate={vibrate} className="h-7 w-16 rounded-full text-[9px] tracking-widest">START</PadKey>
      </div>

      {/* Lado direito: analógico + botões de ação */}
      <div
        className="pointer-events-auto absolute bottom-4 right-4 flex items-end gap-6"
        style={{ transform: `scale(${s})`, transformOrigin: "bottom right" }}
      >
        <AnalogStick stick="right" label="Analógico direito" />
        <div className="grid grid-cols-3 grid-rows-3 gap-1">
          <span />
          <PadKey button="triangle" label="Triângulo" vibrate={vibrate} className="size-14 rounded-full text-2xl text-btn-triangle">△</PadKey>
          <span />
          <PadKey button="square" label="Quadrado" vibrate={vibrate} className="size-14 rounded-full text-2xl text-btn-square">□</PadKey>
          <span />
          <PadKey button="circle" label="Círculo" vibrate={vibrate} className="size-14 rounded-full text-2xl text-btn-circle">○</PadKey>
          <span />
          <PadKey button="cross" label="Xis" vibrate={vibrate} className="size-14 rounded-full text-2xl text-btn-cross">✕</PadKey>
          <span />
        </div>
      </div>
    </div>
  );
}
