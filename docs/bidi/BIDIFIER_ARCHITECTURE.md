# bidify.js — Bidi Preprocessor for Inky

> **bidify** /ˈbɪd.ɪ.faɪ/ *v.* — beautify bidi by injecting invisible
> Unicode directional isolate markers (LRI U+2066, RLI U+2067, PDI U+2069).
> The characters exist in the standard. The keyboard doesn't have them.
> The editor doesn't add them. `bidify()` does.

> **Fixes:** [inkle/inky#122 — Cannot use Right-to-Left languages (Arabic, Persian) with Inky properly](https://github.com/inkle/inky/issues/122)
> Open since **2017**. No Ace fork. No Ink syntax change. One preprocessor.

## Architecture (Current Implementation)

The bidi support is implemented as a **single file** — `app/renderer/bidify.js` (156 lines, zero dependencies).

### Module Structure

```
app/renderer/bidify.js    # All bidi logic in one file
├── isRTL(cp)             # Unicode range check for RTL scripts
├── isLTR(cp)             # Unicode range check for LTR scripts
├── stripBidi(text)       # Remove LRI/RLI/PDI markers
├── getScriptRuns(line)   # Group codepoints by direction (rtl/ltr/neutral)
├── bidifyLine(line)      # Wrap runs with directional isolates
├── bidify(text)          # Strip + split lines + bidifyLine each
├── bidifyJson(jsonStr)   # Find ^text in compiled ink JSON, bidify each
└── bidifyJsonNode(node)  # Recursive helper for bidifyJson
```

**Exports:** `bidify`, `stripBidi`, `bidifyJson`, `LRI`, `RLI`, `PDI`

### Integration Points

| File | Integration | What it does |
|------|-------------|-------------|
| `app/renderer/playerView.js` | `require('./bidify.js')` | Calls `bidify()` on story text before DOM insertion. Toggled via `setBidifyEnabled()` |
| `app/renderer/inkFile.js` | `require('./bidify.js')` | Calls `stripBidi()` before saving .ink files to disk (when `stripBidiOnSave` is enabled) |
| `app/main-process/inklecate.js` | `require('../renderer/bidify.js')` | Calls `bidifyJson()` when exporting compiled ink JSON (when `bidifyExportEnabled` is set) |
| `app/main-process/appmenus.js` | Menu definition | View > Bidify (RTL) submenu with 4 toggles: editor, player, strip-on-save, export JSON |
| `app/renderer/controller.js` | IPC handlers | Handles `set-bidify-editor-enabled`, `set-bidify-player-enabled`, strip-on-save, export toggles |

**Note:** In this branch, `editorView.js` does NOT have bidify integration. The bidify toggle for the editor exists in the menu but the editor integration is not yet wired up.

### Key Principle

> **The bidifier is a lens, not a patch.**
> It doesn't change the text. It doesn't change the editor.
> It adds invisible markers that tell the rendering engine
> what it should have been able to figure out on its own.
> `getScriptRuns()` provides direction identity. LRI/RLI/PDI express it.

### RTL Script Coverage

The `isRTL()` function covers these Unicode ranges:
- **Hebrew:** U+0590–U+05FF, U+FB1D–U+FB4F
- **Arabic:** U+0600–U+06FF, U+0750–U+077F, U+08A0–U+08FF, U+FB50–U+FDFF, U+FE70–U+FEFF
- **Syriac:** U+0700–U+074F, U+0860–U+086F
- **Thaana:** U+0780–U+07BF
- **NKo:** U+07C0–U+07FF
- **Samaritan:** U+0800–U+083F
- **Mandaic:** U+0840–U+085F

### How bidify() Works

1. Strip existing markers (idempotency via `stripBidi()`)
2. Split text into lines
3. For each line, call `getScriptRuns()` to group codepoints by direction
4. If no RTL runs found, return line as-is
5. Wrap RTL runs with `RLI...PDI`, LTR runs with `LRI...PDI`, leave neutral runs unwrapped
6. Rejoin lines

### Test Suite

| Suite | Runner | Tests | What it tests |
|-------|--------|-------|--------------|
| Unit (`test/bidify.test.js`) | Node.js | 29 | Pure function tests: `getScriptRuns()`, `bidify()`, `stripBidi()`, `bidifyJson()`, 10 RTL script coverage tests |
| App E2E (`test/test.js`) | Mocha + Playwright or Spectron | 7 | Window launch, title, sidebar, hello world compile, choices, TODOs |
| Bidi E2E (`test/bidi-e2e.test.js`) | Mocha + Playwright | 15 | Hebrew/Arabic typing, compilation, story playthrough, bidify toggle, JSON export |
| **Total** | | **58** | |

Tests use a launcher abstraction (`test/launchers/index.js`) — `TEST_LAUNCHER=playwright` (default) or `TEST_LAUNCHER=spectron` selects the framework.

## Ace Editor

**Ace is NOT modified.** No fork, no plugin, no config changes. The bidify preprocessing happens at the integration layer (playerView, inkFile, inklecate) — not inside Ace itself.
