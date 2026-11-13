# Experimental Preview source maps

The Preview accepts source-map protocol version 1 from an experimental Ink
1.2.1 compiler. The patch in this directory applies to upstream commit
`35c63e52f1d36060930dc7ed3cfba38ea224b528`. It does not change `DebugSource`.
Bundled compiler binaries remain unchanged and do not provide this protocol.
With an old or incompatible compiler, Preview displays the story but disables
Alt-click source navigation instead of guessing its location. Missing or
invalid metadata is reported in the application console.

## Wire format

Each play session begins with the handshake:

```json
{"sourceMapProtocol":{"version":1,"unit":"utf16","compiler":"ink-1.2.1"}}
```

Each narrative `text` event includes a `sourceMap` object in the same JSON
object with `version`, `unit`, `sequence`, `streamEnd`, `offsets`, and
`checksum`. Sequence starts at zero and increases for each text event;
`streamEnd` is the exclusive end of the compiler's accumulated debug stream.
The SHA-256 checksum is the lower-case hexadecimal digest of a binary payload:
`sequence`, `streamEnd`, and the UTF-16 length of the text as signed 32-bit
little-endian integers, followed by each UTF-16 code unit as an unsigned
16-bit little-endian integer and each offset as a signed 32-bit little-endian
integer. The checksum detects accidental corruption, not a malicious compiler.

`offsets[i]` is the absolute offset in the accumulating `DebugSource` stream
for UTF-16 code unit `i` of the emitted text. JavaScript string indices and
.NET string indices use UTF-16 code units, including surrogate pairs. Tags and
other invisible text count toward the compiler's offsets but are not part of
the narrative text. Space normalization is reflected in the map. Text and map
travel together, in event order, with the compiler session ID. Tags and
choices remain their existing distinct events; they are not used to estimate
offsets.

The selected-choice prefix is removed along with the corresponding map
prefix. Rich-text markers are omitted while building a map of the text nodes
actually created; no spans are added for words. Split paragraphs retain the
map on the original final fragment. The Preview reconstructs the clicked
character's index across fragments and refuses missing or unsupported maps.
Lookups are serialized and tied to the active compile session.

The uncompressed mapping is linear in output length. It is experimental; use
`compiler/test/benchmark-protocol.cjs` to measure compiler overhead for the
target environment. No guessed or legacy offset fallback is provided.
For renderer measurements, open a disposable project in an isolated Electron
profile with `--remote-debugging-port=PORT` and run
`node compiler/test/benchmark-preview.cjs PORT`. The script replaces the
editor contents without saving; do not use it on an unsaved project. It
reports elapsed time, timer delay, DOM and renderer memory for several sizes
and recompilations. Compare builds under equivalent display and window
conditions; renderer pauses include layout and are not solely protocol cost.
The main process validates the handshake, ordering, lengths, offset bounds and
checksum for each compiler session. A missing, incompatible, duplicated or
invalid event disables subsequent source maps for that session; the story
text is still displayed and a warning is logged. Maps validated before an
invalid event remain usable for the already-emitted text.

## Rebuild the Linux compiler and packages

The Linux compiler source is the upstream Ink repository at commit
`35c63e52f1d36060930dc7ed3cfba38ea224b528`, plus
`ink-1.2.1-source-map.patch` from this checkout. The reference patch SHA-256 is
`c053005a081b82d92d97a605bce37b7941f202ad485f9807e9d107710b39d354`.
The validated toolchain is .NET SDK 6.0.428, and the target is `linux-x64`,
self-contained and single-file. The build archives the exact upstream commit,
applies the patch in a new output directory and compares the resulting
compiler with the original using the source-map regression suite. It uses
`ContinuousIntegrationBuild` and `PathMap` to normalize source paths. It
records the compiler and patch hashes in `build-manifest.txt`. With identical
SDK and dependency inputs, independent builds in two directories produced
SHA-256 `50e6c932e978c04999d524191469b890f8398f4a999407f74593344e094f0900`;
builds with different inputs may differ. The previous validated compiler's SHA-256 was
`9c4a582d4c55c7ab066bdc10f29bfa4041b916810132e31b6ceee64037b5514b`.

Prepare a Git repository containing that upstream commit, and install .NET
SDK 6.0.428 and this project's locked app dependencies. Set `PATH`, `TMPDIR`
and, if needed, `NUGET_PACKAGES` for the environment. The output parent must
exist; the output directory itself must not exist and should be outside this
checkout. From the repository root:

```sh
./compiler/build-linux-v1.sh /path/to/ink-git /path/to/new-compiler-output
./BUILD_FOR_LINUX.sh /path/to/ink-git /path/to/new-linux-package-output
```

The package script builds and tests the compiler again, places it only into an
isolated application copy, and generates the AppImage, Debian package and
Linux zip from that single packaged application. It records the source HEAD,
working-tree status, diff, file hashes, compiler hashes and package hashes.
Debian revision defaults to `117`; override it with `INKY_DEB_REVISION` when
needed. Review the source status and hashes: a HEAD alone does not identify a
dirty worktree. The script does not install dependencies, clean an existing
directory, replace the checkout's compiler binaries, or publish a release.
Its required tools include `git`, `dotnet`, `node`, `dpkg-deb`, `python3` and
`zip`; the project-supplied AppImage tool is used for the AppImage.

The compiler can also be activated for development by setting
`INKY_EXPERIMENTAL_INKLECATE` to the absolute path of the new executable.
It affects Preview play sessions only; export uses the existing
`inkjs-compatible` compiler.

## Manual build and other platforms

Use the official Ink source at the revision above and .NET 6 SDK. In a separate
checkout, check and apply the patch:

```sh
git checkout --detach 35c63e52f1d36060930dc7ed3cfba38ea224b528
git apply --check /absolute/path/to/inky/compiler/ink-1.2.1-source-map.patch
git apply /absolute/path/to/inky/compiler/ink-1.2.1-source-map.patch
dotnet publish inklecate/inklecate.csproj -c Release -r linux-x64 \
  --self-contained true /p:PublishTrimmed=false /p:PublishSingleFile=true \
  -o /absolute/path/to/experimental/linux-x64
```

On Linux, compare the experimental compiler with the bundled original:

```sh
INKY_SOURCE_MAP_COMPILER=/absolute/path/to/experimental/linux-x64/inklecate \
  node --test compiler/test/source-map-regression.test.cjs
```

The upstream `build_for_inky.command` uses the same publish settings for
`win-x86`, `osx-x64` and `osx-arm64`; it combines the two macOS executables
with `lipo`. Build each into its own output directory and test on the target
OS, including signing and packaging on macOS, before replacing any distributed
binary. The separate `inkjs-compatible` export compiler is not modified by
this patch. Preserve its independently verified provenance and compatibility.
