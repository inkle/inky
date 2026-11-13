"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {JSDOM} = require("jsdom");
const renderer = name => fs.readFileSync(path.join(__dirname, "../renderer", name), "utf8");
const names = ["light", "dark", "contrast", "focus"];
const forms = {light: "inky-pearl", dark: "inky-graphite", contrast: "inky-high-clarity", focus: "inky-quiet-writing"};
function withThemes(check, frame = true) {
    const dom = new JSDOM('<html><body><div class="window"></div><div id="player" style="--game-bg: #123456; color: #abcdef"><p>Story</p></div>' +
        (frame ? '<iframe id="game-settings-inline"></iframe>' : '') + '</body></html>', {runScripts: "outside-only"});
    try {
        dom.window.eval(renderer("jquery-2.2.3.min.js"));
        const source = renderer("controller.js"), chosen = [];
        const context = {document: dom.window.document, $: dom.window.jQuery,
            EditorView: {setEditorTheme: name => chosen.push(name)},
            LiveCompiler: {setEdited() {throw Error("IDE theme changes must not recompile");}},
            GameStyle: {apply() {throw Error("IDE themes must not change story styling");}}};
        vm.createContext(context);
        vm.runInContext(source.slice(source.indexOf("function syncStyleFormIdeTheme()"), source.indexOf("updateTheme(null,")), context);
        check(context, dom.window.document, chosen);
    } finally {dom.window.close();}
}
describe("Light / Pearl", function() {
    it("uses explicit Light identifiers and native Textmate on first-use fallback", function() {
        assert.match(renderer("acesrc/theme-textmate.js"), /exports\.isDark = false/);
        withThemes((context, document, chosen) => {
            context.updateTheme(null, null);
            assert(document.documentElement.classList.contains("light"));
            assert(document.querySelector(".window").classList.contains("light"));
            assert.strictEqual(chosen.at(-1), "ace/theme/textmate");
            assert(document.querySelector("iframe").contentDocument.documentElement.classList.contains("inky-pearl"));
        });
    });
    it("cycles all four themes without stale window, popup or settings identifiers", function() {
        const themes = {light: "textmate", dark: "tomorrow_night", contrast: "tomorrow_night_bright", focus: "twilight"};
        withThemes((context, document, chosen) => {
            for(const theme of [...names, "light"]) {
                context.updateTheme(null, theme);
                assert.strictEqual(chosen.at(-1), "ace/theme/" + themes[theme]);
                for(const name of names) {
                    assert.strictEqual(document.documentElement.classList.contains(name), name === theme);
                    assert.strictEqual(document.querySelector(".window").classList.contains(name), name === theme);
                    assert.strictEqual(document.querySelector("iframe").contentDocument.documentElement.classList.contains(forms[name]), name === theme);
                }
            }
        });
    });
    it("normalizes Light and returns unknown selections to a fully identified Light", function() {
        withThemes((context, document, chosen) => {
            for(const theme of ["LIGHT", "unrecognized", undefined]) {
                context.updateTheme(null, "focus");
                context.updateTheme(null, theme);
                assert(document.documentElement.classList.contains("light"));
                assert(!document.documentElement.classList.contains("focus"));
                assert.strictEqual(chosen.at(-1), "ace/theme/textmate");
            }
        });
    });
    it("applies Pearl when the Visual form loads after selecting Light", function() {
        withThemes((context, document) => {
            context.updateTheme(null, "light");
            const frame = document.createElement("iframe"); frame.id = "game-settings-inline";
            document.body.appendChild(frame);context.syncStyleFormIdeTheme();
            assert(frame.contentDocument.documentElement.classList.contains("inky-pearl"));
            context.updateTheme(null, "dark");
            assert(!frame.contentDocument.documentElement.classList.contains("inky-pearl"));
            context.updateTheme(null, "light");
            assert(frame.contentDocument.documentElement.classList.contains("inky-pearl"));
        }, false);
    });
    it("preserves the reader DOM and palette without compilation or story-style calls", function() {
        withThemes((context, document) => {
            const before = document.querySelector("#player").outerHTML;
            for(const theme of [...names, "light"]) {
                context.updateTheme(null, theme);
                assert.strictEqual(document.querySelector("#player").outerHTML, before);
            }
        });
    });
    it("themes body-level UI only while Light is selected", function() {
        const dom = new JSDOM('<html class="light"><body><div class="window light"></div><div class="explorer-dialog"></div><div class="ace_autocomplete"></div><div class="rich-toolbar"></div><ul class="vakata-context jstree-default-contextmenu"></ul></body></html>');
        try {
            const document = dom.window.document, style = document.createElement("style");style.textContent = renderer("light.css");document.head.appendChild(style);
            const elements = [...document.querySelectorAll(".explorer-dialog,.ace_autocomplete,.rich-toolbar,.vakata-context")];
            const painted = element => [...style.sheet.cssRules].some(rule => rule.selectorText && element.matches(rule.selectorText) && rule.style.getPropertyValue("background"));
            assert(elements.every(painted));
            for(const theme of names.filter(name => name !== "light")) {
                document.documentElement.className = theme;document.querySelector(".window").className = "window " + theme;
                assert(elements.every(element => !painted(element)));
            }
        } finally {dom.window.close();}
    });
    it("loads the scoped stylesheet without reader, scrollbar or hidden-control overrides", function() {
        assert.match(renderer("index.html"), /href="light\.css"/);
        const css = renderer("light.css");
        assert.doesNotMatch(css, /#player|--game-|\.window\.light\s+::-webkit-scrollbar/);
        assert.doesNotMatch(css, /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\D|$)/);
    });
    it("forces a light native scheme inside the form but never on the document root", function() {
        withThemes((context, document) => {
            context.updateTheme(null, "light");
            const form = document.querySelector("iframe").contentDocument, style = form.createElement("style");
            style.textContent = renderer("gameSettings/gameSettings.css");form.head.appendChild(style);
            assert.strictEqual(form.defaultView.getComputedStyle(form.documentElement).getPropertyValue("color-scheme"), "light");
            assert.strictEqual(form.defaultView.getComputedStyle(form.documentElement).getPropertyValue("--bg").trim(), "#f7f9fc");
            const ideStyle = document.createElement("style");ideStyle.textContent = renderer("light.css");document.head.appendChild(ideStyle);
            assert(![...ideStyle.sheet.cssRules].some(rule => rule.selectorText && document.documentElement.matches(rule.selectorText) && rule.style.getPropertyValue("color-scheme")),
                "The IDE must not force native story controls into a different scheme");
        });
    });
});
