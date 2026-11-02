#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_DIR=${INKY_LINUX_APP_DIR:-"$ROOT_DIR/Inky-linux-x64"}
DESKTOP_FILE="$ROOT_DIR/resources/com.inkle.inky.desktop"
ICON_FILE="$ROOT_DIR/app/renderer/about/icon-round.png"
OUTPUT_DIR="$ROOT_DIR/ReleaseUpload"
APP_VERSION=$(node -p "require('$ROOT_DIR/app/package.json').version")
DEB_REVISION=${INKY_DEB_REVISION:-67}
VERSION="${APP_VERSION}-${DEB_REVISION}"
PACKAGE_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/inky-deb.XXXXXX")
OUTPUT_FILE="$OUTPUT_DIR/inky_${VERSION}_amd64.deb"

cleanup() {
    rm -rf "$PACKAGE_ROOT"
}
trap cleanup EXIT HUP INT TERM

if [ ! -d "$APP_DIR" ]; then
    echo "Linux app bundle not found: $APP_DIR" >&2
    echo "Build Inky-linux-x64 before creating the Debian package." >&2
    exit 1
fi

if [ ! -f "$DESKTOP_FILE" ] || [ ! -f "$ICON_FILE" ]; then
    echo "Required desktop launcher or icon is missing." >&2
    exit 1
fi

if ! command -v dpkg-deb >/dev/null 2>&1; then
    echo "dpkg-deb is required to build the Debian package." >&2
    exit 1
fi

case "$DEB_REVISION" in
    ''|*[!0-9]*)
        echo "INKY_DEB_REVISION must be a positive integer." >&2
        exit 1
        ;;
esac

mkdir -p \
    "$PACKAGE_ROOT/opt/inky" \
    "$PACKAGE_ROOT/usr/bin" \
    "$PACKAGE_ROOT/usr/share/applications" \
    "$PACKAGE_ROOT/usr/share/icons/hicolor/256x256/apps" \
    "$PACKAGE_ROOT/DEBIAN" \
    "$OUTPUT_DIR"

cp -a "$APP_DIR/." "$PACKAGE_ROOT/opt/inky/"
install -m 644 "$DESKTOP_FILE" "$PACKAGE_ROOT/usr/share/applications/inky.desktop"
install -m 644 "$ICON_FILE" "$PACKAGE_ROOT/usr/share/icons/hicolor/256x256/apps/inky.png"
ln -s /opt/inky/Inky "$PACKAGE_ROOT/usr/bin/inky"

# Electron's packager can create the app root as owner-only; installed apps
# must be traversable by regular users.
chmod 755 "$PACKAGE_ROOT"
find "$PACKAGE_ROOT/usr" -type d -exec chmod 755 {} +
find "$PACKAGE_ROOT/opt/inky" -type d -exec chmod 755 {} +
chmod 755 "$PACKAGE_ROOT/opt/inky"
chmod 755 "$PACKAGE_ROOT/DEBIAN"

INSTALLED_SIZE=$(du -sk "$PACKAGE_ROOT" | cut -f1)
cat > "$PACKAGE_ROOT/DEBIAN/control" <<EOF
Package: inky
Version: $VERSION
Section: editors
Priority: optional
Architecture: amd64
Installed-Size: $INSTALLED_SIZE
Maintainer: Kernel Trace <zen.essencial@proton.me>
Homepage: https://github.com/inkle/inky
Depends: libc6 (>= 2.34), libgcc-s1 (>= 4.2), libasound2t64 (>= 1.0.17) | libasound2 (>= 1.0.17), libatk-bridge2.0-0t64 (>= 2.5.3) | libatk-bridge2.0-0 (>= 2.5.3), libatk1.0-0t64 (>= 2.2.0) | libatk1.0-0 (>= 2.2.0), libatspi2.0-0t64 (>= 2.9.90) | libatspi2.0-0 (>= 2.9.90), libcairo2 (>= 1.6.0), libcups2t64 (>= 1.7.0) | libcups2 (>= 1.7.0), libdbus-1-3 (>= 1.10), libdrm2 (>= 2.4.75), libexpat1 (>= 2.1~beta3), libgbm1 (>= 17.1.0~rc2), libglib2.0-0t64 (>= 2.38.0) | libglib2.0-0 (>= 2.38.0), libgtk-3-0t64 (>= 3.9.10) | libgtk-3-0 (>= 3.9.10), libnspr4 (>= 2:4.9-2~), libnss3 (>= 2:3.30), libpango-1.0-0 (>= 1.14.0), libx11-6 (>= 1.4.99.1), libxcb1 (>= 1.9.2), libxcomposite1 (>= 1:0.4.6), libxdamage1 (>= 1:1.1), libxext6, libxfixes3, libxkbcommon0 (>= 0.5.0), libxrandr2, libxss1, libxtst6
Description: Ink editor for interactive narrative
EOF
chmod 644 "$PACKAGE_ROOT/DEBIAN/control"

dpkg-deb --build --root-owner-group "$PACKAGE_ROOT" "$OUTPUT_FILE"
echo "Created $OUTPUT_FILE"
