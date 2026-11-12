#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 INK_GIT_REPOSITORY NEW_OUTPUT_DIRECTORY" >&2
    exit 2
fi

ROOT=$(cd -- "$(dirname -- "$0")/.." && pwd)
INK_REPO=$(cd -- "$1" && pwd)
OUT=$2
COMMIT=35c63e52f1d36060930dc7ed3cfba38ea224b528
PATCH="$ROOT/compiler/ink-1.2.1-source-map.patch"

for tool in git dotnet node; do
    command -v "$tool" >/dev/null || { echo "Required tool not found: $tool" >&2; exit 1; }
done
if [ "$(dotnet --version)" != "6.0.428" ]; then
    echo "The validated build requires .NET SDK 6.0.428." >&2
    exit 1
fi
git -C "$INK_REPO" cat-file -e "$COMMIT^{commit}"
mkdir -- "$OUT"
OUT=$(cd -- "$OUT" && pwd)
mkdir "$OUT/source" "$OUT/linux-x64"
git -C "$INK_REPO" archive "$COMMIT" | tar -xf - -C "$OUT/source"
git -C "$OUT/source" apply --check "$PATCH"
git -C "$OUT/source" apply "$PATCH"
dotnet publish "$OUT/source/inklecate/inklecate.csproj" -c Release -r linux-x64 \
    --self-contained true /p:PublishTrimmed=false /p:PublishSingleFile=true \
    /p:ContinuousIntegrationBuild=true "/p:PathMap=$OUT/source=/src/ink" \
    -o "$OUT/linux-x64"
test -x "$OUT/linux-x64/inklecate"
INKY_SOURCE_MAP_COMPILER="$OUT/linux-x64/inklecate" \
    node --test "$ROOT/compiler/test/source-map-regression.test.cjs" \
    | tee "$OUT/source-map-regression.log"
{
    printf 'ink_commit=%s\nsdk=%s\nruntime=linux-x64\n' "$COMMIT" "$(dotnet --version)"
    sha256sum "$PATCH" "$OUT/linux-x64/inklecate"
} | tee "$OUT/build-manifest.txt"
