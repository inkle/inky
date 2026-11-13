"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {JSDOM} = require("jsdom");
const renderer = name => fs.readFileSync(path.join(__dirname, "../renderer", name), "utf8");

function withThemes(check, frame = true) {
    const dom = new JSDOM('<html><body><div class="window"></div><div id="player" style="color: #abcdef; --game-bg: #123456">Story</div>' +
        (frame ? '<iframe id="game-settings-inline"></iframe>' : '') + '</body></html>', {runScripts: "outside-only"});
    try {
        dom.window.eval(renderer("jquery-2.2.3.min.js"));
        const source = renderer("controller.js");
        const start = source.indexOf("function syncStyleFormIdeTheme()");
        const end = source.indexOf("updateTheme(null,", start);
        const chosen = [];
        const context = {document: dom.window.document, $: dom.window.jQuery,
            EditorView: {setEditorTheme: name => chosen.push(name)},
            LiveCompiler: {setEdited() {throw Error("Theme selection must not recompile");}}};
        vm.createContext(context);
        vm.runInContext(source.slice(start, end), context);
        check(context, dom.window.document, chosen);
    } finally { dom.window.close(); }
}

describe("Contrast / High Clarity", function() {
    it("uses an existing dark Ace theme", function() {
        const theme = renderer("acesrc/theme-tomorrow_night_bright.js");
        assert.match(theme, /exports\.isDark = true/);
        withThemes((context, document, chosen) => {
            context.updateTheme(null, "contrast");
            assert.strictEqual(chosen.at(-1), "ace/theme/tomorrow_night_bright");
            assert(document.querySelector(".window").classList.contains("contrast"));
            assert(document.documentElement.classList.contains("contrast"));
            assert(!document.documentElement.classList.contains("dark"));
        });
    });
    it("retains the exact Ace choices for Light, Graphite and Focus", function() {
        withThemes((context, document, chosen) => {
            for(const [name, ace] of Object.entries({light: "textmate", dark: "tomorrow_night", focus: "twilight"})) {
                context.updateTheme(null, "contrast");
                context.updateTheme(null, name);
                assert.strictEqual(chosen.at(-1), "ace/theme/" + ace);
                assert(!document.documentElement.classList.contains("contrast"));
                assert.strictEqual(document.documentElement.classList.contains("dark"), name === "dark");
            }
        });
    });
    it("switches only IDE state and never alters the reader", function() {
        withThemes((context, document) => {
            const before = document.querySelector("#player").outerHTML;
            for(const name of ["contrast", "dark", "light", "focus", "contrast"]) {
                context.updateTheme(null, name);
                assert.strictEqual(document.querySelector("#player").outerHTML, before);
            }
        });
    });
    it("synchronizes a settings iframe that loads after theme selection", function() {
        withThemes((context, document) => {
            context.updateTheme(null, "contrast");
            const iframe = document.createElement("iframe");
            iframe.id = "game-settings-inline";
            document.body.appendChild(iframe);
            context.syncStyleFormIdeTheme();
            assert(iframe.contentDocument.documentElement.classList.contains("inky-high-clarity"));
            assert(!iframe.contentDocument.documentElement.classList.contains("inky-graphite"));
            context.updateTheme(null, "dark");
            assert(!iframe.contentDocument.documentElement.classList.contains("inky-high-clarity"));
            assert(iframe.contentDocument.documentElement.classList.contains("inky-graphite"));
            context.updateTheme(null, "light");
            assert(!iframe.contentDocument.documentElement.classList.contains("inky-high-clarity"));
            assert(!iframe.contentDocument.documentElement.classList.contains("inky-graphite"));
        }, false);
    });
    it("clears floating popup classes on invalid or mixed-case selections", function() {
        withThemes((context, document, chosen) => {
            context.updateTheme(null, "CONTRAST");
            assert(document.documentElement.classList.contains("contrast"));
            context.updateTheme(null, "unknown");
            assert(!document.documentElement.classList.contains("contrast"));
            assert(!document.documentElement.classList.contains("dark"));
            assert.strictEqual(chosen.at(-1), "ace/theme/textmate");
        });
    });
    it("keeps Contrast CSS away from Preview and story scrollbars", function() {
        const css = renderer("contrast.css");
        assert.doesNotMatch(css, /#player|--game-|\.window\.contrast\s+::-webkit-scrollbar/);
        assert.match(css, /html\.contrast \.ace_autocomplete/);
        assert.match(css, /html\.contrast \.vakata-context/);
        assert.match(renderer("gameSettings/gameSettings.css"), /:root\.inky-high-clarity/);
    });
    it("themes Explorer dialogs appended directly to body without leaking into other themes", function() {
        const dom = new JSDOM('<html class="contrast"><body><div class="window contrast"></div><div class="explorer-dialog">Message</div></body></html>');
        try {
            const document = dom.window.document;
            const style = document.createElement("style");
            style.textContent = renderer("contrast.css");
            document.head.appendChild(style);
            const dialog = document.querySelector(".explorer-dialog");
            assert.strictEqual(dialog.closest(".window"), null);
            const backgrounds = () => [...style.sheet.cssRules].filter(rule =>
                rule.selectorText && dialog.matches(rule.selectorText) && rule.style.getPropertyValue("background"));
            assert(backgrounds().length > 0, "the dialog must match a Contrast surface rule");
            assert(dom.window.getComputedStyle(document.documentElement).getPropertyValue("--hc-panel").trim(),
                "body-level overlays must inherit the private IDE palette");
            for(const theme of ["light", "dark", "focus"]) {
                document.documentElement.className = theme;
                document.querySelector(".window").className = "window " + theme;
                assert.strictEqual(backgrounds().length, 0);
            }
        } finally { dom.window.close(); }
    });

});
