#!/usr/bin/env bash
# Baixa o núcleo oficial do ARMSX2 (GPL-3.0) e coloca dentro do projeto Android.
# Roda no GitHub antes de montar o APK. Pode rodar no seu PC também (precisa de curl e unzip).
set -euo pipefail

VERSION="2.9.5"
APK_NAME="ARMSX2-${VERSION}-legacy-armv8.0-sdk26.apk"
SHA256="2a77a6d43790798e5a273c5f5ea3d267b145b591158d12a510d7531473ea61ae"
URL="https://github.com/ARMSX2/ARMSX2/releases/download/${VERSION}/${APK_NAME}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIBS="$ROOT/android/app/src/main/jniLibs/arm64-v8a"
ASSETS="$ROOT/android/app/src/main/assets"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Baixando ARMSX2 ${VERSION}…"
curl -fsSL -o "$TMP/armsx2.apk" "$URL"
echo "${SHA256}  $TMP/armsx2.apk" | sha256sum -c -

unzip -q "$TMP/armsx2.apk" 'lib/arm64-v8a/*' 'assets/resources/*' 'assets/licenses/*' -d "$TMP/x"

rm -rf "$LIBS" "$ASSETS/resources" "$ASSETS/licenses"
mkdir -p "$LIBS" "$ASSETS"
# O núcleo e o que ele carrega. Discord, Remote Play e protetores de tela ficam de fora.
for lib in libemucore_4k libemucore_16k liblibrashader_capi libc++_shared libshaderc_shared \
           libSPIRV-Tools-shared libhook_impl libmain_hook libfile_redirect_hook libgsl_alloc_hook; do
  cp "$TMP/x/lib/arm64-v8a/${lib}.so" "$LIBS/"
done
cp -R "$TMP/x/assets/resources" "$ASSETS/resources"
cp -R "$TMP/x/assets/licenses" "$ASSETS/licenses"

echo "Núcleo pronto:"
ls -la "$LIBS"
