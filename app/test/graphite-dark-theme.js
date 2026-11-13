"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("Graphite replacement for the Dark IDE theme", function() {
    const load = filename => fs.readFileSync(path.resolve(__dirname, "..", "renderer", filename), "utf8");

    it("keeps the existing menu entries and chooses bundled Ace themes", function() {
        const menus = fs.readFileSync(path.resolve(__dirname, "..", "main-process", "appmenus.js"), "utf8");
        const controller = load("controller.js");
        const editor = load("editorView.js");
        assert.match(menus, /\['light', 'dark', 'contrast', 'focus'\]/);
        assert.match(editor, /setEditorTheme:\s*\(name\)\s*=>\s*editor\.setTheme\(name\)/);
        assert.match(controller, /ace\/theme\/tomorrow_night/);
        assert.match(controller, /ace\/theme\/textmate/);
        assert.ok(fs.existsSync(path.resolve(__dirname, "..", "renderer", "acesrc", "theme-tomorrow_night.js")));
        assert.ok(fs.existsSync(path.resolve(__dirname, "..", "renderer", "acesrc", "theme-textmate.js")));
    });

    it("keeps the story Preview theme independent of the IDE theme", function() {
        const css = load("dark.css");
        const controller = load("controller.js");
        assert.doesNotMatch(css, /\.window\.dark\s+#player(?:\s*[,\{])/);
        assert.doesNotMatch(css, /\.window\.dark\s+#main\s+#player(?:\s*[,\{])/);
        assert.match(controller, /removeClass\("light dark contrast focus"\)/);
        assert.match(controller, /document\.documentElement\.classList\.toggle\("dark", theme === "dark"\)/);
    });

    it("styles Explorer and menus outside the editor without a new dependency", function() {
        const css = load("dark.css");
        assert.match(css, /\.window\.dark #file-nav-wrapper \.jstree-default/);
        assert.match(css, /html\.dark \.vakata-context\.jstree-default-contextmenu/);
        assert.match(css, /html\.dark \.ace_autocomplete/);
    });
    it("switches IDE and settings surfaces without recompiling or touching the story", function() {
        const vm = require("node:vm");
        const { JSDOM } = require("jsdom");
        const dom = new JSDOM('<html><body><div class="window"></div><iframe id="game-settings-inline"></iframe></body></html>', {runScripts: "outside-only"});
        try {
            dom.window.eval(load("jquery-2.2.3.min.js"));
            const controller = load("controller.js");
            const start = controller.indexOf("function syncStyleFormIdeTheme()");
            const end = controller.indexOf("updateTheme(null,", start);
            const themes = [];
            const context = {document: dom.window.document, $: dom.window.jQuery,
                EditorView: {setEditorTheme: name => themes.push(name)},
                LiveCompiler: {setEdited: () => { throw Error("An IDE theme must not recompile the story"); }}};
            vm.createContext(context);
            vm.runInContext(controller.slice(start, end), context);
            for (const theme of ["dark", "light", "contrast", "focus", "dark"]) {
                context.updateTheme(null, theme);
                const dark = theme === "dark";
                assert.strictEqual(dom.window.document.documentElement.classList.contains("dark"), dark);
                assert.strictEqual(dom.window.document.querySelector(".window").classList.contains(theme), true);
                assert.strictEqual(dom.window.document.querySelector("iframe").contentDocument.documentElement.classList.contains("inky-graphite"), dark);
                assert.strictEqual(themes.at(-1), dark ? "ace/theme/tomorrow_night" :
                    theme === "contrast" ? "ace/theme/tomorrow_night_bright" :
                    theme === "focus" ? "ace/theme/twilight" : "ace/theme/textmate");
            }
        } finally { dom.window.close(); }
    });

    it("keeps Graphite scrollbar rules off the story pane", function() {
        for (const theme of ["dark", "contrast", "focus"])
            assert.doesNotMatch(load(theme + ".css"), new RegExp("\\.window\\." + theme + "\\s+::-webkit-scrollbar"));
    });

});
