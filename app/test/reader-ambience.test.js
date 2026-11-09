"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { GameStyle } = require("../renderer/gameStyle.js");

const read = rel => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
const keys = ["outer-bg", "frame-border", "shadow-deep", "shadow-soft", "shadow-halo"];

function previewVariables(style) {
    const values = new Map();
    const player = {
        style: {
            setProperty: (key, value) => values.set(key, value),
            removeProperty: key => values.delete(key)
        },
        classList: { add() {} },
        dataset: {},
        querySelectorAll: () => [],
        querySelector: () => null
    };
    const previousDocument = global.document;
    global.document = { getElementById: () => player };
    try {
        GameStyle.applyToPreview(style, null);
        return values;
    } finally {
        global.document = previousDocument;
    }
}

function exportValues(style) {
    return Object.fromEntries(Array.from(
        GameStyle.exportCss(style).matchAll(/^\s*(--reader-[\w-]+):\s*(.*);$/gm),
        match => [match[1], match[2]]
    ));
}

describe("Reader outer background and frame shadow", function() {
    it("uses exactly the same theme-derived CSS values in Preview and Export", function() {
        for (const preset of GameStyle.PRESETS) {
            const style = GameStyle.resolve({ theme: preset.theme, colors: preset.colors }).style;
            const preview = previewVariables(style);
            const exported = exportValues(style);
            for (const name of keys) {
                const key = "--reader-" + name;
                assert.strictEqual(preview.get(key), exported[key], `Mismatch for ${preset.id}: ${name}`);
                assert.ok(exported[key], `Missing ${key} in ${preset.id}`);
            }
        }
    });

    it("derives the outer surface from custom colors rather than a fixed preset", function() {
        const custom = { background: "#446078", text: "#e1d7b8", choice: "#66b2ff" };
        const look = GameStyle.readerAmbience({ theme: "dark", colors: custom });
        assert.ok(look.outer.includes(custom.background));
        assert.ok(look.border.includes(custom.text));
        assert.ok(look.halo.includes(custom.text));
        assert.ok(!look.outer.includes("#f5f3ef"));
    });

    it("updates all ambient variables when the player switches looks", function() {
        const style = GameStyle.resolve({
            theme: "light",
            theme_mode: "dual",
            themes: {
                light: { colors: { background: "#fff6df", text: "#433422", choice: "#8b4513" } },
                dark: { colors: { background: "#070e12", text: "#45ed83", choice: "#e8bb34" } }
            }
        }).style;
        const css = GameStyle.exportCss(style);
        assert.ok(css.includes(":root[data-look=\"alternate\"]"));
        assert.match(css, /--reader-outer-bg: color-mix\(in srgb, #fff6df 87%, #433422\)/);
        assert.match(css, /--reader-outer-bg: color-mix\(in srgb, #070e12 22%, #1e2a29\)/);
        assert.match(css, /--reader-shadow-halo: color-mix\(in srgb, #45ed83 20%, transparent\)/);
    });

    it("uses a clearer outer surface and a thin accent border for pure-black players", function() {
        const terminal = GameStyle.readerAmbience({ theme: "dark", colors: { background: "#000000", text: "#33ff66" } });
        const night = GameStyle.readerAmbience({ theme: "dark", colors: { background: "#282828", text: "#faf1c6" } });
        assert.match(terminal.outer, /#000000 22%, #1e2a29/);
        assert.match(night.outer, /#282828 16%, #0d131a/);
        assert.match(terminal.border, /#33ff66 30%, #000000/);
        assert.match(night.border, /#faf1c6 21%, #282828/);
        assert.match(terminal.halo, /#33ff66 20%, transparent/);
    });

    it("changes only the outer surface and frame shadow; scene backgrounds stay inside the frame", function() {
        const previewCss = read("renderer/gameChrome.css");
        const exportedCss = read("export-for-web-template/style.css");
        assert.match(previewCss, /#main #player\s*\{[^}]*var\(--reader-outer-bg/s);
        assert.match(exportedCss, /body\s*\{[^}]*var\(--reader-outer-bg/s);
        for (const css of [previewCss, exportedCss]) {
            assert.match(css, /0 26px 58px -13px var\(--reader-shadow-deep/);
            assert.match(css, /0 7px 23px -5px var\(--reader-shadow-soft/);
            assert.match(css, /0 0 34px 2px var\(--reader-shadow-halo/);
            assert.match(css, /border: 1px solid var\(--reader-frame-border/);
            assert.match(css, /\.has-background\s*\{[^}]*background-position: center/s);
        }
    });
});
