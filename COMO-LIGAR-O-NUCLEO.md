# Como ligar o núcleo do emulador

A interface inteira já está pronta e **não precisa de nenhuma mudança**. Tudo que executa
jogos passa por um único arquivo:

```
src/lib/emulator.ts
```

Hoje esse arquivo contém um núcleo de demonstração (`createStubCore`): ele desenha uma tela
de espera com o aviso "Conecte o núcleo do emulador". Para o app virar um emulador de
verdade, troque **só** a implementação de `createStubCore`, mantendo o mesmo contrato.

## O contrato que o núcleo precisa cumprir

```ts
export interface EmulatorCore {
  boot(opts: BootOptions): Promise<void>;   // abre o ISO e começa a rodar
  pause(): void;                            // congela a emulação
  resume(): void;                           // volta de onde parou
  stop(): void;                             // fecha o jogo e libera tudo
  setButton(button: PadButton, pressed: boolean): void;
  setAnalog(stick: Stick, x: number, y: number): void;   // -1 a 1 em cada eixo
  saveState(slot: number): Promise<void>;   // slots 1 a 5
  loadState(slot: number): Promise<void>;
}
```

`boot` recebe:

| campo      | o que é                                                              |
| ---------- | -------------------------------------------------------------------- |
| `canvas`   | onde desenhar o jogo. Já vem com o tamanho certo (`640 × 480 × resolução`) |
| `iso`      | o arquivo do jogo (`.iso`, `.bin`, `.chd`, `.cso`, `.img`, `.gz`)    |
| `bios`     | o arquivo da BIOS, ou `null` se o jogador ainda não escolheu         |
| `settings` | as preferências da tela de configurações (lista abaixo)              |
| `onStatus` | texto curto que aparece na barra superior ("Iniciando...", "Rodando") |
| `onFps`    | número de quadros por segundo, chamado ~1 vez por segundo            |

Nomes dos botões (`PadButton`): `up`, `down`, `left`, `right`, `triangle`, `circle`,
`cross`, `square`, `l1`, `l2`, `l3`, `r1`, `r2`, `r3`, `start`, `select`.
Analógicos (`Stick`): `left` e `right`.

## Onde cada parte da interface chama o núcleo

- `src/routes/jogar.$gameId.tsx` — chama `boot` ao entrar no jogo e `stop` ao sair;
  `pause`/`resume` no botão de pausa; `saveState`/`loadState` nos slots 1 a 5.
- `src/components/emu/VirtualPad.tsx` — chama `setButton` e `setAnalog` em cada toque.
- `src/lib/library.ts` — guarda a lista de jogos e as preferências; nada de emulação aqui.

Nenhuma tela conhece o núcleo de verdade: todas só falam com o objeto `emulator`.

## Preferências que chegam em `settings`

`renderer` (`vulkan`/`opengl`/`software`), `resolution` (`1`–`4`), `aspect`
(`4:3`/`16:9`/`stretch`), `frameSkip` (0–3), `volume` (0–100), `eeCycleRate` (`-2`–`2`),
`speedHacks` (ligado/desligado), `showFps`, `padOpacity`, `padScale`, `vibration`,
`biosName`.

Os três últimos são só da tela (controle na tela e indicador de FPS) — o núcleo pode
ignorar. O `volume` precisa ser aplicado pelo núcleo, porque o áudio é dele.

## Dois pontos que valem atenção

1. **`settings` só chega no `boot`.** Se o jogador mudar uma preferência no meio do jogo,
   o núcleo não é avisado. Se quiser ajuste ao vivo, adicione um método tipo
   `setSettings(s)` no contrato e chame-o na tela de jogo.
2. **`stop` precisa limpar de verdade.** Ele roda quando o jogador sai do jogo, então
   despeça áudio, threads/WASM e `requestAnimationFrame` aí, senão o som continua tocando.

## Como testar sem um núcleo real

O núcleo de demonstração já serve de teste de integração: os botões na tela aparecem no
centro da tela de jogo, o contador de FPS sobe, a pausa congela a animação e os slots de
salvar mostram o aviso no console. Se tudo isso funcionar com o seu núcleo no lugar do
stub, a interface está coberta.

## Para um APK de verdade

O caminho mais curto é um núcleo nativo do Android (o Play! é de código aberto e tem
versão Android) enrolado no app com Capacitor, e o plugin chamando esse núcleo a partir
de `src/lib/emulator.ts`. Os arquivos ISO/BIOS ficam só na memória de cada sessão no
navegador; num app nativo dá para guardá-los em disco e resolver esse ponto.
