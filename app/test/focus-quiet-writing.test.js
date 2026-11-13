"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {JSDOM} = require("jsdom");
const renderer = name => fs.readFileSync(path.join(__dirname, "../renderer", name), "utf8");

function withThemes(check, withFrame = true) {
    const dom = new JSDOM('<html><body><div class="window"></div><div id="player" style="--game-bg: #112233; color: #abcdef"><p>Story</p></div>' +
        (withFrame ? '<iframe id="game-settings-inline"></iframe>' : '') + '</body></html>', {runScripts: "outside-only"});
    try {
        dom.window.eval(renderer("jquery-2.2.3.min.js"));
        const source = renderer("controller.js"), themes = [];
        const context = {document: dom.window.document, $: dom.window.jQuery,
            EditorView: {setEditorTheme: name => themes.push(name)},
            LiveCompiler: {setEdited() {throw Error("IDE themes must not recompile");}},
            GameStyle: {apply() {throw Error("IDE themes must not apply story styles");}}};
        vm.createContext(context);
        vm.runInContext(source.slice(source.indexOf("function syncStyleFormIdeTheme()"), source.indexOf("updateTheme(null,")), context);
        check(context, dom.window.document, themes);
    } finally {dom.window.close();}
}

describe("Focus / Quiet Writing", function() {
    it("selects a bundled dark Ace theme instead of the old light editor", function() {
        assert.match(renderer("acesrc/theme-twilight.js"), /exports\.isDark = true/);
        withThemes((context, document, themes) => {
            context.updateTheme(null, "focus");
            assert.strictEqual(themes.at(-1), "ace/theme/twilight");
            assert(document.documentElement.classList.contains("focus"));
            assert(document.querySelector(".window").classList.contains("focus"));
            assert(document.querySelector("iframe").contentDocument.documentElement.classList.contains("inky-quiet-writing"));
        });
    });
    it("loads native Ace CSS whose selectors cannot change any other theme", function() {
        const theme = {}, dom = new JSDOM('<html><head></head><body></body></html>');
        try {
            vm.runInNewContext(renderer("acesrc/theme-twilight.js"), {define(_name, _dependencies, factory) {
                factory(() => ({importCssString(css) {
                    const style = dom.window.document.createElement("style");
                    style.textContent = css;
                    dom.window.document.head.appendChild(style);
                    assert(style.sheet.cssRules.length > 0);
                    for(const rule of style.sheet.cssRules)
                        assert(rule.selectorText.split(",").every(selector => selector.trim().startsWith(".ace-twilight")),
                            "Native Focus CSS must stay inside its own Ace class");
                }}), theme, {});
            }});
        } finally {dom.window.close();}
    });
    it("retains Light, Graphite and Contrast and clears floating Focus UI when leaving", function() {
        withThemes((context, document, themes) => {
            for(const [name, ace] of Object.entries({light: "textmate", dark: "tomorrow_night", contrast: "tomorrow_night_bright"})) {
                context.updateTheme(null, "focus");
                context.updateTheme(null, name);
                assert.strictEqual(themes.at(-1), "ace/theme/" + ace);
                assert(!document.documentElement.classList.contains("focus"));
                assert(!document.querySelector(".window").classList.contains("focus"));
                assert(!document.querySelector("iframe").contentDocument.documentElement.classList.contains("inky-quiet-writing"));
            }
        });
    });
    it("never changes the reader, story palette or compilation when switching themes", function() {
        withThemes((context, document) => {
            const before = document.querySelector("#player").outerHTML;
            for(const theme of ["focus", "dark", "contrast", "light", "focus"]) {
                context.updateTheme(null, theme);
                assert.strictEqual(document.querySelector("#player").outerHTML, before);
            }
        });
    });
    it("synchronizes a late settings iframe and removes every stale IDE form class", function() {
        withThemes((context, document) => {
            context.updateTheme(null, "focus");
            const frame = document.createElement("iframe"); frame.id = "game-settings-inline";
            document.body.appendChild(frame);
            context.syncStyleFormIdeTheme();
            const root = frame.contentDocument.documentElement;
            assert(root.classList.contains("inky-quiet-writing"));
            for(const [theme, selected] of Object.entries({dark: "inky-graphite", contrast: "inky-high-clarity", focus: "inky-quiet-writing", light: ""})) {
                context.updateTheme(null, theme);
                for(const name of ["inky-quiet-writing", "inky-graphite", "inky-high-clarity"])
                    assert.strictEqual(root.classList.contains(name), name === selected);
            }
        }, false);
    });
    it("normalizes mixed-case Focus and cleans its document flag on fallback", function() {
        withThemes((context, document, themes) => {
            context.updateTheme(null, "FOCUS");
            assert(document.documentElement.classList.contains("focus"));
            context.updateTheme(null, "unknown");
            for(const name of ["focus", "dark", "contrast"])
                assert(!document.documentElement.classList.contains(name));
            assert.strictEqual(themes.at(-1), "ace/theme/textmate");
        });
    });
    it("themes body-level menus and dialogs without matching them in other themes", function() {
        const dom = new JSDOM('<html class="focus"><body><div class="window focus"></div><div class="explorer-dialog">Dialog</div><ul class="vakata-context jstree-default-contextmenu"></ul><div class="ace_autocomplete"></div></body></html>');
        try {
            const document = dom.window.document, style = document.createElement("style");
            style.textContent = renderer("focus.css"); document.head.appendChild(style);
            const hasSurface = element => [...style.sheet.cssRules].some(rule =>
                rule.selectorText && element.matches(rule.selectorText) && rule.style.getPropertyValue("background"));
            const overlays = [...document.querySelectorAll(".explorer-dialog,.vakata-context,.ace_autocomplete")];
            assert(overlays.every(hasSurface));
            assert(dom.window.getComputedStyle(document.documentElement).getPropertyValue("--qw-panel").trim());
            for(const theme of ["light", "dark", "contrast"]) {
                document.documentElement.className = theme;
                document.querySelector(".window").className = "window " + theme;
                assert(overlays.every(element => !hasSurface(element)));
            }
        } finally {dom.window.close();}
    });
    it("removes all legacy reader overrides and keeps controls and information visible", function() {
        const css = renderer("focus.css");
        assert.doesNotMatch(css, /#player|--game-|\.window\.focus\s+::-webkit-scrollbar/);
        assert.doesNotMatch(css, /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\D|$)/);
        assert.match(renderer("gameSettings/gameSettings.css"), /:root\.inky-quiet-writing/);
    });
});
