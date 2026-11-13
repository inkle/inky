#!/usr/bin/env sh
set -eu
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_DIR=${INKY_LINUX_APP_DIR:-"$ROOT_DIR/Inky-linux-x64"}
REVISION=${INKY_DEB_REVISION:-117}
case "$REVISION" in ''|*[!0-9]*) echo 'Invalid Debian revision' >&2; exit 1;; esac
VERSION=$(node -p 'require(process.argv[1]).version' "$ROOT_DIR/app/package.json")-$REVISION
OUTPUT_DIR="$ROOT_DIR/ReleaseUpload"
OUTPUT_FILE="$OUTPUT_DIR/inky_${VERSION}_amd64.deb"
command -v dpkg-deb >/dev/null
command -v python3 >/dev/null
test -f "$APP_DIR/resources/app/package.json"
test ! -e "$APP_DIR/resources/app.asar"
STAGE=$(mktemp -d "${TMPDIR:-/tmp}/inky-deb.XXXXXX")
trap 'rm -rf "$STAGE"' EXIT HUP INT TERM
mkdir -p "$STAGE/opt/inky" "$STAGE/usr/bin" "$STAGE/usr/share/applications" "$STAGE/usr/share/icons/hicolor/256x256/apps" "$STAGE/DEBIAN" "$OUTPUT_DIR"
cp -a "$APP_DIR/." "$STAGE/opt/inky/"
install -m 644 "$ROOT_DIR/resources/com.inkle.inky.desktop" "$STAGE/usr/share/applications/inky.desktop"
install -m 644 "$ROOT_DIR/app/renderer/about/icon-round.png" "$STAGE/usr/share/icons/hicolor/256x256/apps/inky.png"
ln -s /opt/inky/Inky "$STAGE/usr/bin/inky"
# Include ALL parent directories, especially /opt: root-only staging permissions
# must never be propagated to a user's installation.
find "$STAGE" -type d -exec chmod 755 {} +
find "$STAGE" -type f -exec chmod a+r {} +
chmod 755 "$STAGE/opt/inky/Inky"
chmod 755 "$STAGE/opt/inky/resources/app/main-process/ink/inklecate_linux"
chmod 755 "$STAGE/opt/inky/resources/app/main-process/ink/inkjs-compatible/inklecate_linux"
chmod 4755 "$STAGE/opt/inky/chrome-sandbox"
python3 "$ROOT_DIR/build/application_manifest.py" "$STAGE/opt/inky/resources"
SIZE=$(du -sk "$STAGE" | cut -f1)
sed -e "s/@VERSION@/$VERSION/" -e "s/@SIZE@/$SIZE/" "$ROOT_DIR/build/debian-control.in" > "$STAGE/DEBIAN/control"
chmod 644 "$STAGE/DEBIAN/control"
dpkg-deb --build --root-owner-group "$STAGE" "$OUTPUT_FILE"
python3 "$ROOT_DIR/build/verify_deb.py" "$OUTPUT_FILE"
printf 'Created %s\n' "$OUTPUT_FILE"
