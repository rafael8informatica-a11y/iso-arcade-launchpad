import type { Settings } from "./library";

/**
 * Traduz o erro do núcleo PS2 (texto livre vindo do Java/ARMSX2) em uma causa provável
 * e em ações rápidas. Não depende de React nem do núcleo, então dá para testar à parte.
 */

export type BootFailureKind =
  | "bios-missing"
  | "bios-invalid"
  | "gpu-driver"
  | "game-corrupt"
  | "core-unavailable"
  | "boot-failed";

export type Renderer = Settings["renderer"];

export type DiagnosticAction =
  | { type: "renderer"; renderer: Renderer; label: string }
  | { type: "bios"; label: string }
  | { type: "retry"; label: string }
  | { type: "library"; label: string };

export type BootDiagnosis = {
  kind: BootFailureKind;
  title: string;
  /** Causa provável, em uma ou duas frases. */
  cause: string;
  tips: string[];
  /** Texto original do erro, para quem quiser ver (ou mandar para suporte). */
  detail: string | null;
  actions: DiagnosticAction[];
};

export type DiagnosisContext = {
  renderer: Renderer;
  /** Existe uma BIOS selecionada (arquivo da sessão ou nome salvo no APK). */
  hasBios: boolean;
};

const RENDERER_NAME: Record<Renderer, string> = {
  vulkan: "Vulkan",
  opengl: "OpenGL",
  software: "Software",
};

/** Mensagem genérica do plugin Android quando o núcleo não diz o motivo. */
const GENERIC_BOOT_MESSAGE = /verifique a bios e a iso/;
const CORE_UNAVAILABLE = /n[uú]cleo nativo|unsatisfiedlinkerror|dlopen|bibliotecas? .*ausente|\blib[a-z0-9_]+\.so\b/;
const OPENGL_PROBLEM = /opengl|\begl\b|gles|glsl/;
const GPU_PROBLEM = /vulkan|vk_error|vkcreate|swapchain|\bgpu\b|driver gr[aá]fico|graphics device|shader/;
const BIOS_PROBLEM = /bios/;
const BIOS_BAD = /not found|missing|invalid|inv[aá]lid|ausente|falta|n[aã]o (encontr|reconhec|foi)|no bios|unsupported|corrupt|checksum|unrecognized/;
const GAME_PROBLEM = /corrupt|corromp|\biso\b|\bchd\b|\bcso\b|cdvd|\bdisc\b|disc image|read error|failed to (open|read|mount)|unsupported format|formato n[aã]o/;

/** Próximo renderizador que vale tentar quando o atual falhou. */
export function fallbackRenderer(current: Renderer): Renderer {
  return current === "vulkan" ? "opengl" : current === "opengl" ? "vulkan" : "opengl";
}

function rendererAction(current: Renderer): DiagnosticAction {
  const next = fallbackRenderer(current);
  return { type: "renderer", renderer: next, label: `Alternar para renderizador ${RENDERER_NAME[next]}` };
}

const LIBRARY: DiagnosticAction = { type: "library", label: "Voltar à biblioteca" };
const RETRY: DiagnosticAction = { type: "retry", label: "Tentar de novo" };
const PICK_BIOS = (label: string): DiagnosticAction => ({ type: "bios", label });

export function diagnoseBootFailure(message: string | null | undefined, ctx: DiagnosisContext): BootDiagnosis {
  const raw = (message ?? "").trim();
  const m = raw.toLowerCase();
  const detail = raw ? raw.slice(0, 400) : null;

  if (CORE_UNAVAILABLE.test(m)) {
    return {
      kind: "core-unavailable",
      title: "Núcleo do PS2 indisponível",
      cause: "O núcleo ARMSX2 não foi carregado neste app, então o jogo não tem como iniciar.",
      tips: ["Reinstale o APK mais recente.", "Se o erro continuar, o APK foi gerado sem as bibliotecas do núcleo."],
      detail,
      actions: [LIBRARY],
    };
  }

  if (OPENGL_PROBLEM.test(m) || GPU_PROBLEM.test(m)) {
    // Qual renderizador falhou: o que a mensagem cita; se ela só fala de "GPU", o que estava configurado.
    const mentionsVulkan = /vulkan|vk_error|vkcreate|swapchain/.test(m);
    const failing: Renderer = mentionsVulkan ? "vulkan" : OPENGL_PROBLEM.test(m) ? "opengl" : ctx.renderer;
    return {
      kind: "gpu-driver",
      title: failing === "vulkan" ? "Driver Vulkan não suportado nesta GPU" : `${RENDERER_NAME[failing]} não funcionou nesta GPU`,
      cause:
        failing === "vulkan"
          ? "A placa de vídeo ou o driver deste aparelho não deu conta do Vulkan."
          : `A placa de vídeo recusou o renderizador ${RENDERER_NAME[failing]}.`,
      tips: [
        "Troque o renderizador só para este jogo e tente de novo.",
        "Se você instalou um driver Vulkan personalizado, remova-o em Configurações → Driver da GPU.",
      ],
      detail,
      actions: [rendererAction(failing), LIBRARY],
    };
  }

  // Sem BIOS escolhida, ela é sempre a suspeita número um — inclusive na mensagem genérica.
  if (!ctx.hasBios && (raw === "" || GENERIC_BOOT_MESSAGE.test(m) || BIOS_PROBLEM.test(m))) {
    return {
      kind: "bios-missing",
      title: "BIOS não configurada",
      cause: "O PS2 precisa de um arquivo de BIOS para ligar, e nenhuma foi selecionada.",
      tips: ["Use o arquivo .bin extraído do seu próprio console."],
      detail,
      actions: [PICK_BIOS("Selecionar BIOS"), LIBRARY],
    };
  }

  if (BIOS_PROBLEM.test(m) && BIOS_BAD.test(m) && !GENERIC_BOOT_MESSAGE.test(m)) {
    return {
      kind: "bios-invalid",
      title: "BIOS inválida ou não reconhecida",
      cause: "O arquivo de BIOS selecionado não foi aceito pelo núcleo.",
      tips: ["Escolha uma BIOS completa de PS2 (arquivo .bin), de preferência da mesma região do jogo."],
      detail,
      actions: [PICK_BIOS("Trocar BIOS"), LIBRARY],
    };
  }

  if (GENERIC_BOOT_MESSAGE.test(m) || raw === "") {
    return {
      kind: "boot-failed",
      title: "O jogo não iniciou",
      cause: "O núcleo não informou o motivo. Os suspeitos mais comuns são a BIOS e o arquivo do jogo.",
      tips: [
        "Confira se a BIOS selecionada é de PS2 e está completa.",
        "Escolha o arquivo do jogo de novo; a ISO pode estar corrompida ou incompleta.",
      ],
      detail,
      actions: [RETRY, PICK_BIOS("Trocar BIOS"), LIBRARY],
    };
  }

  if (GAME_PROBLEM.test(m)) {
    return {
      kind: "game-corrupt",
      title: "Arquivo de jogo corrompido ou incompatível",
      cause: "O núcleo não conseguiu ler a imagem do jogo.",
      tips: [
        "Copie a ISO de novo; downloads interrompidos deixam o arquivo incompleto.",
        "Formatos aceitos: ISO, BIN, CHD, CSO, IMG e GZ.",
      ],
      detail,
      actions: [RETRY, LIBRARY],
    };
  }

  return {
    kind: "boot-failed",
    title: "O jogo não iniciou",
    cause: "O núcleo devolveu um erro que o app não reconhece.",
    tips: ["Tentar de novo ou trocar o renderizador resolve em vários casos."],
    detail,
    actions: [RETRY, rendererAction(ctx.renderer), LIBRARY],
  };
}
