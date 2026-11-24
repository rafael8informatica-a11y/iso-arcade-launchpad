# Núcleo do emulador (ARMSX2)

O APK já vem com o núcleo do **ARMSX2 2.9.5** (emulador de PS2 para Android, baseado no
PCSX2). Você não precisa colocar nenhum arquivo: na hora de montar o APK, o GitHub roda
`scripts/fetch-armsx2-core.sh`, que baixa o APK oficial do ARMSX2, confere a assinatura
(SHA-256) e copia de dentro dele:

- `lib/arm64-v8a/libemucore_4k.so` e `libemucore_16k.so` (o núcleo; o app escolhe o certo
  para o celular) e as bibliotecas que ele carrega;
- `assets/resources/` (banco de jogos, shaders, fontes).

## Como as partes se ligam

```
Tela (React)  →  src/lib/emulator.ts  →  plugin "Ps2Core" (Ps2CorePlugin.java)
                                          →  NativeApp.java  →  libemucore_*.so
```

- `android/.../kr/co/iefriends/pcsx2/NativeApp.java` — a ponte que o núcleo exige. O nome do
  pacote e da classe **não pode mudar**: o `.so` procura exatamente esse endereço.
- `android/.../org/libsdl/app/` — classes do SDL que o núcleo registra ao carregar (controles).
- `android/.../com/armsx2/BiosInfo.java` — o núcleo cria esse objeto ao conferir a BIOS.
- `android/.../com/nebula2/emulador/Ps2CorePlugin.java` — escolhe ISO/BIOS pelo Android,
  coloca a tela do jogo por trás da página, repassa botões, pausa e saves.

No navegador (preview e site) continua o núcleo de demonstração.

## Trocar a versão do ARMSX2

A ponte foi conferida contra a 2.9.5. Para trocar, mude `VERSION` e `SHA256` no script e
confira se as funções nativas usadas em `NativeApp.java` ainda existem na nova versão.

## Licença

O ARMSX2 é GPL-3.0. Ao distribuir o APK com o núcleo, o código do app também precisa ficar
disponível sob GPL-3.0 (por exemplo, deixando o repositório público).
