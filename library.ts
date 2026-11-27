import { useEffect, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { emulator } from "@/lib/emulator";
import {
  attachGamepadListeners,
  createGamepadLoop,
  gamepadLabel,
  getConnectedGamepads,
  NO_PADS,
  subscribeGamepads,
} from "@/lib/gamepad";

/** Controles físicos conectados agora (vazio no servidor e antes de o navegador detectar algum). */
export function useConnectedGamepads() {
  return useSyncExternalStore(subscribeGamepads, getConnectedGamepads, () => NO_PADS);
}

/** Escuta conexão e desconexão em qualquer tela e avisa com um toast. Use uma vez, no root. */
export function useGamepadNotifications() {
  useEffect(
    () =>
      attachGamepadListeners(({ type, pad }) => {
        const name = gamepadLabel(pad.id);
        if (type === "connected") toast.success(`Controle conectado: ${name}`);
        else toast.info(`Controle desconectado: ${name}`);
      }),
    [],
  );
}

/**
 * Enquanto `enabled` e houver um controle conectado, lê botões e analógicos a cada quadro
 * e repassa para o emulador. A zona morta é lida ao vivo, então o slider vale na hora.
 */
export function useGamepadInput(enabled: boolean, deadzone: number) {
  const pads = useConnectedGamepads();
  const deadzoneRef = useRef(deadzone);
  deadzoneRef.current = deadzone;
  const active = enabled && pads.length > 0;

  useEffect(() => {
    if (!active) return;
    const loop = createGamepadLoop({
      sink: {
        setButton: (button, pressed) => emulator.setButton(button, pressed),
        setAnalog: (stick, x, y) => emulator.setAnalog(stick, x, y),
      },
      getDeadzone: () => deadzoneRef.current,
    });
    loop.start();
    return () => loop.stop();
  }, [active]);
}
