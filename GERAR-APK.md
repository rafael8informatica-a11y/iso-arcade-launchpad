# Como gerar o APK pelo GitHub (sem Android Studio)

O projeto já tem tudo para virar APK. Quem compila é o próprio GitHub, de graça.

1. No Lovable, conecte o projeto ao GitHub (Configurações do projeto → Git → Connect).
   Isso cria um repositório com todo o código.
2. No GitHub, abra o repositório → aba **Actions**.
   - Se aparecer um aviso pedindo para ativar os workflows, clique em ativar.
3. Clique em **Gerar APK Android** → **Run workflow** (ou só espere: ele roda sozinho a
   cada mudança salva no Lovable).
4. Leva uns 5–8 minutos. Quando ficar verde, abra a execução e baixe **nebula2-apk** em
   *Artifacts*. É um .zip com o `app-debug.apk` dentro.
5. No celular: abra o APK e permita "instalar apps desconhecidos" quando o Android pedir.

O APK funciona 100% offline: a interface fica dentro do app, não precisa de internet.

## O que tem no projeto para isso

- `capacitor.config.ts` — nome e identificador do app (`com.nebula2.emulador`).
- `android/` — projeto Android, já com a ponte para o núcleo ARMSX2.
- `scripts/fetch-armsx2-core.sh` — baixa o núcleo oficial do ARMSX2 durante a montagem.
- `.github/workflows/android-apk.yml` — o passo a passo que o GitHub executa.

## Observações

- O APK é assinado com a chave de teste do Android ("debug"). Instala normalmente no
  celular, mas não serve para a Play Store. Para publicar na loja, é preciso uma chave
  própria (release).
- Cada execução gera uma chave de teste nova. Se o Android recusar atualizar por cima,
  desinstale a versão antiga antes de instalar a nova.
- O APK só roda em celulares Android 8 ou mais novos, com processador de 64 bits (ARM).
- Use o APK da execução **Gerar APK Android** que roda `android-apk.yml`: é ela que baixa
  o núcleo (veja `COMO-LIGAR-O-NUCLEO.md`).
