#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 INK_GIT_REPOSITORY NEW_OUTPUT_DIRECTORY" >&2
    exit 2
fi

ROOT=$(cd -- "$(dirname -- "$0")" && pwd)
INK_REPO=$(cd -- "$1" && pwd)
OUT=$2
PACKAGER="$ROOT/app/node_modules/.bin/electron-packager"
test -x "$PACKAGER" || { echo "Install the project's locked app dependencies first." >&2; exit 1; }
for tool in git dotnet node dpkg-deb python3 zip; do
    command -v "$tool" >/dev/null || { echo "Required tool not found: $tool" >&2; exit 1; }
done
mkdir -- "$OUT"
OUT=$(cd -- "$OUT" && pwd)

git -C "$ROOT" rev-parse HEAD > "$OUT/source-head.txt"
git -C "$ROOT" status --short --untracked-files=all > "$OUT/source-status.txt"
git -C "$ROOT" diff HEAD --binary > "$OUT/source-tracked.patch"
(
    cd "$ROOT"
    git ls-files -z --cached --others --exclude-standard | sort -z | xargs -0 sha256sum
) > "$OUT/source-sha256.txt"

"$ROOT/compiler/build-linux-v1.sh" "$INK_REPO" "$OUT/compiler"
mkdir "$OUT/stage"
cp -a --reflink=auto "$ROOT/app" "$ROOT/build" "$ROOT/resources" "$ROOT/BUILD_DEB.sh" "$OUT/stage/"
cp "$OUT/compiler/linux-x64/inklecate" "$OUT/stage/app/main-process/ink/inklecate_linux"
(
    cd "$OUT/stage"
    ./app/node_modules/.bin/electron-packager app Inky --platform=linux --arch=x64 \
        --out="$OUT/packaged" --prune --ignore=inklecate_mac
)
APP="$OUT/packaged/Inky-linux-x64"
cmp "$OUT/compiler/linux-x64/inklecate" "$APP/resources/app/main-process/ink/inklecate_linux"
mkdir -p "$OUT/AppDir/opt/inky" "$OUT/AppDir/usr/share/pixmaps" "$OUT/ReleaseUpload"
install -m 755 "$ROOT/resources/AppRun" "$OUT/AppDir/AppRun"
cp "$ROOT/resources/com.inkle.inky.desktop" "$OUT/AppDir/"
cp "$ROOT/app/renderer/about/icon-round.png" "$OUT/AppDir/inky.png"
cp "$ROOT/app/renderer/about/icon-round.png" "$OUT/AppDir/usr/share/pixmaps/inky.png"
cp -a --reflink=auto "$APP/." "$OUT/AppDir/opt/inky/"
ARCH=x86_64 "$ROOT/build/appimagetool-x86_64.AppImage" --appimage-extract-and-run \
    -n "$OUT/AppDir" "$OUT/ReleaseUpload/Inky.AppImage"
INKY_LINUX_APP_DIR="$APP" INKY_DEB_REVISION="${INKY_DEB_REVISION:-117}" \
    "$OUT/stage/BUILD_DEB.sh"
mv "$OUT/stage/ReleaseUpload/"*.deb "$OUT/ReleaseUpload/"
(
    cd "$OUT/packaged"
    zip -qr "$OUT/ReleaseUpload/Inky_linux.zip" Inky-linux-x64
)
sha256sum "$OUT/ReleaseUpload/"* | tee "$OUT/package-sha256.txt"
echo "Linux packages created in $OUT/ReleaseUpload"
