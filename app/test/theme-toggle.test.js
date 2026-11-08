const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { JSDOM } = require("jsdom");
const { GameStyle } = require("../renderer/gameStyle.js");
const { buildWebExport } = require("../renderer/webExporter.js");

function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

// Runs a test with a document of its own, because the Preview code reads the global document.
function withDocument(html, run) {
    const dom = new JSDOM(html);
    const previous = { window: global.window, document: global.document };
    const modules = ["../renderer/gameChrome.js", "../renderer/gameStyle.js", "../renderer/titleScreen.js"].map(m => require.resolve(m));
    global.window = dom.window;
    global.document = dom.window.document;
    modules.forEach(m => delete require.cache[m]);
    try {
        return run({
            GameChrome: require("../renderer/gameChrome.js").GameChrome,
            GameStyle: require("../renderer/gameStyle.js").GameStyle,
            window: dom.window
        });
    } finally {
        modules.forEach(m => delete require.cache[m]);
        Object.keys(previous).forEach(key => {
            if( previous[key] === undefined ) delete global[key];
            else global[key] = previous[key];
        });
        dom.window.close();
    }
}

const PLAYER = (theme, target) => '<div id="player" data-theme-toggle="' + theme + '" data-theme-target="' + target + '">' +
    '<div class="scrollContainer"><div class="innerText active"><p class="storyText">The train arrives.</p></div></div></div>';


// The Visual settings form, loaded the way the author test loads it
async function openForm(initialYaml) {
    const html = fs.readFileSync(path.join(__dirname, "../renderer/gameSettings/gameSettings.html"), "utf8");
    const script = fs.readFileSync(path.join(__dirname, "../renderer/gameSettings/gameSettings.js"), "utf8");
    const dom = new JSDOM(html, {
        url: "file:///gameSettings.html?virtual=1&yaml=" + encodeURIComponent(initialYaml),
        runScripts: "outside-only"
    });
    const window = dom.window;
    window.HTMLCanvasElement.prototype.getContext = () => ({ fillStyle: "#000000" });
    window.require = name => {
        if( name === "fs" ) return fs;
        if( name === "path" ) return path;
        if( name === "url" ) return require("url");
        if( name === "../imageTypes.js" ) return require("../renderer/imageTypes.js");
        if( name === "electron" ) return { ipcRenderer: { send() {}, invoke: () => Promise.resolve(["Arial"]) } };
        if( name === "../gameStyle.js" ) return { GameStyle };
        throw new Error("Unexpected module: " + name);
    };
    window.eval(script);
    await new Promise(resolve => setImmediate(resolve));
    return window;
}

function change(window, id, checked) {
    const box = window.document.getElementById(id);
    box.checked = checked;
    box.dispatchEvent(new window.Event("change", { bubbles: true }));
}

describe("light and dark theme switch", function () {
    describe("presets and families", function () {
        it("has four presets in two families, each pairing a light preset with a dark one", function () {
            assert.deepStrictEqual(GameStyle.PRESETS.map(p => p.id), ["classic", "night", "sepia", "terminal"]);
            assert.deepStrictEqual(GameStyle.FAMILIES, {
                "classic-night":  { light: "classic", dark: "night" },
                "sepia-terminal": { light: "sepia",   dark: "terminal" }
            });
            Object.keys(GameStyle.FAMILIES).forEach(name => {
                ["light", "dark"].forEach(mode => {
                    const preset = GameStyle.PRESETS.find(p => p.id === GameStyle.FAMILIES[name][mode]);
                    assert.ok(preset, name + " " + mode);
                    assert.strictEqual(preset.theme, mode);
                    assert.strictEqual(preset.family, name);
                });
            });
        });

        it("keeps the text and the choices readable in every preset", function () {
            GameStyle.PRESETS.forEach(p => {
                assert.ok(contrast(p.colors.text, p.colors.background) >= 4.5, p.id + " text");
                assert.ok(contrast(p.colors.choice, p.colors.background) >= 4.5, p.id + " choices");
            });
        });

        it("remembers the family when a preset is picked", function () {
            const night = GameStyle.applyPreset(GameStyle.defaultModel(), "night");
            assert.strictEqual(night.themeFamily, "classic-night");
            assert.strictEqual(night.theme, "dark");
            const terminal = GameStyle.applyPreset(GameStyle.defaultModel(), "terminal");
            assert.strictEqual(terminal.themeFamily, "sepia-terminal");
            assert.strictEqual(GameStyle.alternateLook(terminal).colors.background, "#f4ecd8");
        });
    });

    describe("model", function () {
        it("is off by default and leaves existing files exactly as they were", function () {
            const r = GameStyle.parseText("theme: dark\ncolors:\n  background: \"#101010\"\n");
            assert.deepStrictEqual(r.warnings, []);
            assert.strictEqual(r.model.controls.themeToggle, false);
            assert.strictEqual(r.model.themeFamily, "");
            assert.strictEqual(r.style.alternate, null);
            assert.strictEqual(r.style.controls.themeToggle, false);
            assert.doesNotMatch(GameStyle.exportCss(r.style), /data-look/);
        });

        it("leads to the other preset of the chosen family", function () {
            const text = (theme, family) => `theme: ${theme}\ntheme_family: ${family}\ncontrols:\n  show: true\n  theme_toggle: true\n`;
            const cases = [
                ["light", "classic-night", "dark", "#282828"],
                ["dark", "classic-night", "light", "#ffffff"],
                ["light", "sepia-terminal", "dark", "#000000"],
                ["dark", "sepia-terminal", "light", "#f4ecd8"]
            ];
            cases.forEach(([theme, family, other, background]) => {
                const r = GameStyle.parseText(text(theme, family));
                assert.deepStrictEqual(r.warnings, [], theme + " " + family);
                assert.strictEqual(r.style.alternate.theme, other, theme + " " + family);
                assert.strictEqual(r.style.alternate.colors.background, background, theme + " " + family);
            });
            // The preset brings its own font along
            const terminal = GameStyle.parseText(text("light", "sepia-terminal"));
            assert.match(terminal.style.alternate.font.family, /monospace/);
        });

        it("applies colors the writer customized to the current look only", function () {
            const r = GameStyle.parseText("theme: light\ntheme_family: sepia-terminal\ncolors:\n  background: \"#eeeeee\"\ncontrols:\n  theme_toggle: true\n");
            assert.strictEqual(r.style.colors.background, "#eeeeee");
            assert.strictEqual(r.style.alternate.colors.background, "#000000");
        });

        it("uses the plain palette of the other theme, in the same font, when there is no family", function () {
            const r = GameStyle.parseText("theme: light\nfont:\n  family: serif\ncontrols:\n  theme_toggle: true\n");
            assert.strictEqual(r.style.alternate.theme, "dark");
            assert.strictEqual(r.style.alternate.colors.background, GameStyle.PALETTES.dark.background);
            assert.strictEqual(r.style.alternate.font.family, GameStyle.FONT_STACKS.serif);
            const dark = GameStyle.parseText("theme: dark\nfont:\n  family: mono\ncontrols:\n  theme_toggle: true\n");
            assert.strictEqual(dark.style.alternate.theme, "light");
            assert.strictEqual(dark.style.alternate.font.family, GameStyle.FONT_STACKS.mono);
            const explicit = GameStyle.parseText("theme_mode: dual\nfont:\n  family: serif\nthemes:\n  dark:\n    font: mono\n");
            assert.strictEqual(explicit.style.alternate.font.family, GameStyle.FONT_STACKS.mono);
        });

        it("needs the story menu, so it is off while the buttons are hidden", function () {
            const r = GameStyle.parseText("controls:\n  show: false\n  theme_toggle: true\n");
            assert.strictEqual(r.style.alternate, null);
            assert.strictEqual(r.style.controls.themeToggle, false);
            // The choice is kept in the file for when the buttons come back
            assert.strictEqual(r.model.controls.themeToggle, true);
        });

        it("reports wrong values and falls back", function () {
            const family = GameStyle.parseText("theme_family: purple\n");
            assert.strictEqual(family.model.themeFamily, "");
            assert.ok(family.warnings.some(w => /theme_family/.test(w)));
            const toggle = GameStyle.parseText("controls:\n  theme_toggle: yes please\n");
            assert.strictEqual(toggle.model.controls.themeToggle, false);
            assert.ok(toggle.warnings.some(w => /controls\.theme_toggle/.test(w)));
        });

        it("round-trips through the YAML the form writes", function () {
            const model = GameStyle.applyPreset(GameStyle.defaultModel(), "sepia");
            model.controls.themeToggle = true;
            const text = GameStyle.toYaml(model);
            assert.match(text, /^theme_family: sepia-terminal$/m);
            assert.match(text, /^  theme_toggle: true$/m);
            const back = GameStyle.parseText(text);
            assert.deepStrictEqual(back.warnings, []);
            assert.strictEqual(back.model.themeFamily, "sepia-terminal");
            assert.strictEqual(back.model.controls.themeToggle, true);
            assert.strictEqual(back.style.alternate.theme, "dark");
            // A file without a family does not get a family line
            assert.doesNotMatch(GameStyle.toYaml(GameStyle.defaultModel()), /theme_family/);
        });
    });

    describe("exported CSS", function () {
        it("adds the alternate look under :root[data-look=\"alternate\"] only when the switch is on", function () {
            const on = GameStyle.parseText("theme: light\ntheme_family: classic-night\ncontrols:\n  theme_toggle: true\n");
            const css = GameStyle.exportCss(on.style);
            assert.match(css, /:root \{[^}]*--bg: #ffffff;[^}]*--link: #0066CC;/);
            const block = css.match(/:root\[data-look="alternate"\] \{([^}]*)\}/);
            assert.ok(block, "the alternate look should be a block of its own");
            ["--font: ", "--bg: #282828;", "--text: #faf1c6;", "--link: #66B2FF;", "--link-hover: #66B2FF;"].forEach(part =>
                assert.ok(block[1].includes(part), part));
            const off = GameStyle.parseText("theme: light\ntheme_family: classic-night\n");
            assert.doesNotMatch(GameStyle.exportCss(off.style), /data-look/);
        });
    });

    describe("story menu", function () {
        it("shows the switch only when allowed, names the theme it leads to and tells the host", function () {
            withDocument(PLAYER("1", "dark"), ({ GameChrome, window }) => {
                let clicks = 0;
                const player = window.document.getElementById("player");
                GameChrome.setup(player, { onToggleTheme: () => { clicks++; } });
                GameChrome.sync(player);
                const button = player.querySelector("#story-menu #theme-toggle");
                assert.ok(button);
                assert.strictEqual(button.hidden, false);
                assert.strictEqual(button.querySelector("span").textContent, "Dark theme");

                player.dataset.themeTarget = "light";
                GameChrome.sync(player);
                assert.strictEqual(button.querySelector("span").textContent, "Light theme");

                button.click();
                assert.strictEqual(clicks, 1);
                assert.strictEqual(player.querySelector("#story-menu").hidden, true);

                player.dataset.themeToggle = "0";
                GameChrome.sync(player);
                assert.strictEqual(button.hidden, true);
            });
        });
    });

    describe("Preview", function () {
        it("switches between the two looks and back, and drops the switch when it is turned off", function () {
            withDocument(PLAYER("0", ""), ({ GameStyle: Style, window }) => {
                const player = window.document.getElementById("player");
                const on = Style.parseText("theme: light\ntheme_family: classic-night\ncontrols:\n  theme_toggle: true\n");
                Style.applyToPreview(on.style, null);
                assert.strictEqual(player.style.getPropertyValue("--game-bg"), "#ffffff");
                assert.strictEqual(player.dataset.themeToggle, "1");
                assert.strictEqual(player.dataset.themeTarget, "dark");

                Style.togglePreviewLook();
                assert.strictEqual(player.style.getPropertyValue("--game-bg"), "#282828");
                assert.strictEqual(player.style.getPropertyValue("--game-text"), "#faf1c6");
                assert.strictEqual(player.dataset.themeTarget, "light");

                Style.togglePreviewLook();
                assert.strictEqual(player.style.getPropertyValue("--game-bg"), "#ffffff");

                // A style change keeps the look being tried; turning the switch off brings the base look back
                Style.togglePreviewLook();
                const off = Style.parseText("theme: light\ntheme_family: classic-night\n");
                Style.applyToPreview(off.style, null);
                assert.strictEqual(player.style.getPropertyValue("--game-bg"), "#ffffff");
                assert.strictEqual(player.dataset.themeToggle, "0");
                assert.strictEqual(player.dataset.themeTarget, "");
            });
        });
    });

    describe("exported page", function () {
        let root;
        let output;

        before(async function () {
            root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-theme-toggle-"));
            fs.writeFileSync(path.join(root, "compiled.json"), JSON.stringify({ inkVersion: 21, root: ["hello"] }));
            fs.writeFileSync(path.join(root, "ink.js"), "ink runtime");
            const style = GameStyle.parseText("theme: light\ntheme_family: classic-night\ncontrols:\n  theme_toggle: true\n").style;
            output = path.join(root, "web");
            await buildWebExport({
                compiledJsonPath: path.join(root, "compiled.json"),
                targetDirectory: output,
                templateDirectory: path.join(__dirname, "../export-for-web-template"),
                inkRuntimePath: path.join(root, "ink.js"),
                javascriptFilename: "story.js",
                storyTitle: "A Web Story",
                storyAuthor: "",
                themeToggle: !!style.alternate,
                themeInitial: style.theme,
                themeAlternate: style.alternate.theme,
                cssAddition: GameStyle.exportCss(style)
            });
        });

        after(function () {
            fs.rmSync(root, { recursive: true, force: true });
        });

        function mainSource() {
            return fs.readFileSync(path.join(__dirname, "../export-for-web-template/main.js"), "utf8");
        }

        function toggleCode() {
            const source = mainSource();
            const start = source.indexOf("    function setupLookToggle() {");
            const end = source.indexOf("    // Used to hook up the functionality for global functionality buttons", start);
            assert.ok(start !== -1 && end > start, "the switch should be set up in setupLookToggle");
            return source.slice(start, end).replace("function setupLookToggle()", "window.setupLookToggleForTest = function()");
        }

        function page(storage) {
            const html = fs.readFileSync(path.join(output, "index.html"), "utf8");
            return new JSDOM(html, {
                url: "https://story.test/game/index.html",
                runScripts: "dangerously",
                beforeParse(window) {
                    Object.keys(storage || {}).forEach(k => window.localStorage.setItem(k, storage[k]));
                }
            }).window;
        }

        it("carries the switch's settings and the alternate look", function () {
            const html = fs.readFileSync(path.join(output, "index.html"), "utf8");
            const css = fs.readFileSync(path.join(output, "style.css"), "utf8");
            assert.match(html, /data-theme-toggle="on" data-theme-initial="light" data-theme-alternate="dark"/);
            assert.match(html, /<button type="button" id="theme-toggle"[^>]*hidden>/);
            assert.match(css, /:root\[data-look="alternate"\] \{[^}]*--bg: #282828;/);
        });

        it("switches the look, names the next theme and remembers the choice", function () {
            const window = page();
            try {
                window.eval(toggleCode());
                window.setupLookToggleForTest();
                const button = window.document.getElementById("theme-toggle");
                const root = window.document.documentElement;
                assert.strictEqual(button.hidden, false);
                assert.strictEqual(button.querySelector("span").textContent, "Dark theme");
                assert.strictEqual(root.getAttribute("data-look"), null);

                button.click();
                assert.strictEqual(root.getAttribute("data-look"), "alternate");
                assert.strictEqual(button.querySelector("span").textContent, "Light theme");
                assert.strictEqual(window.localStorage.getItem("inky-look:/game/index.html"), "alternate");

                button.click();
                assert.strictEqual(root.getAttribute("data-look"), null);
                assert.strictEqual(button.querySelector("span").textContent, "Dark theme");
                assert.strictEqual(window.localStorage.getItem("inky-look:/game/index.html"), "base");
            } finally {
                window.close();
            }
        });

        it("opens in the look the player chose last time, before the story runs", function () {
            const window = page({ "inky-look:/game/index.html": "alternate" });
            try {
                // The small script in <head> already set the look
                assert.strictEqual(window.document.documentElement.getAttribute("data-look"), "alternate");
                window.eval(toggleCode());
                window.setupLookToggleForTest();
                assert.strictEqual(window.document.getElementById("theme-toggle").querySelector("span").textContent, "Light theme");
            } finally {
                window.close();
            }
        });

        it("keeps working when the browser refuses to store the choice", function () {
            const window = page();
            try {
                window.eval(toggleCode());
                Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } });
                window.setupLookToggleForTest();
                const button = window.document.getElementById("theme-toggle");
                button.click();
                assert.strictEqual(window.document.documentElement.getAttribute("data-look"), "alternate");
            } finally {
                window.close();
            }
        });

        it("keeps the switch hidden when the writer did not allow it", function () {
            const html = fs.readFileSync(path.join(output, "index.html"), "utf8")
                .replace('data-theme-toggle="on"', 'data-theme-toggle="off"');
            const window = new JSDOM(html, { url: "https://story.test/game/index.html", runScripts: "outside-only" }).window;
            try {
                window.eval(toggleCode());
                window.setupLookToggleForTest();
                assert.strictEqual(window.document.getElementById("theme-toggle").hidden, true);
            } finally {
                window.close();
            }
        });
    });
    describe("settings form", function () {
        it("offers single and dual mode without a hidden export checkbox", async function () {
            const window = await openForm("theme: light\n");
            try {
                const chips = Array.from(window.document.querySelectorAll("#presets .chip"), chip => chip.dataset.preset);
                assert.deepStrictEqual(chips, ["classic", "night", "sepia", "terminal"]);
                assert.strictEqual(window.document.querySelector('input[name="theme-mode"][value="single"]').checked, true);
                assert.strictEqual(window.document.getElementById("controls-theme-toggle"), null);
                assert.strictEqual(window.document.getElementById("dual-appearance").hidden, true);
            } finally { window.close(); }
        });

        it("saves independently selected themes and makes the switch automatic", async function () {
            const window = await openForm("theme: light\n");
            try {
                window.document.querySelector('#presets .chip[data-preset="sepia"]').click();
                const dual = window.document.querySelector('input[name="theme-mode"][value="dual"]');
                dual.checked = true;
                dual.dispatchEvent(new window.Event("change", { bubbles: true }));
                assert.strictEqual(window.document.getElementById("dual-appearance").hidden, false);
                assert.strictEqual(window.document.getElementById("light-preset").value, "sepia");
                assert.strictEqual(window.document.getElementById("dark-preset").value, "terminal");
                let yaml = window.flushSettingsForAdvanced();
                assert.match(yaml, /^theme_mode: dual$/m);
                assert.match(yaml, /^  dark:$/m);
                assert.doesNotMatch(yaml, /^  theme_toggle: true$/m);
                const select = window.document.getElementById("dark-preset");
                select.value = "night";
                select.dispatchEvent(new window.Event("change", { bubbles: true }));
                yaml = window.flushSettingsForAdvanced();
                assert.match(yaml, /^  dark:$/m);
                const parsed = GameStyle.parseText(yaml);
                assert.strictEqual(parsed.model.themes.dark.colors.background, "#282828");
                assert.strictEqual(parsed.model.themes.light.colors.background, "#f4ecd8");
                assert.strictEqual(parsed.style.controls.themeToggle, true);
            } finally { window.close(); }
        });

        it("retains the theme switch even when save and restart buttons are disabled", async function () {
            const window = await openForm("controls:\n  show: false\n");
            try {
                const dual = window.document.querySelector('input[name="theme-mode"][value="dual"]');
                dual.checked = true;
                dual.dispatchEvent(new window.Event("change", { bubbles: true }));
                const parsed = GameStyle.parseText(window.flushSettingsForAdvanced());
                assert.strictEqual(parsed.style.controls.show, false);
                assert.strictEqual(parsed.style.controls.themeToggle, true);
            } finally { window.close(); }
        });

        it("migrates existing theme-toggle YAML to the two-theme editor", async function () {
            const window = await openForm("theme: dark\ntheme_family: classic-night\ncontrols:\n  show: true\n  theme_toggle: true\n");
            try {
                assert.strictEqual(window.document.querySelector('input[name="theme-mode"][value="dual"]').checked, true);
                assert.strictEqual(window.document.getElementById("dark-preset").value, "night");
                assert.strictEqual(window.document.getElementById("light-preset").value, "classic");
            } finally { window.close(); }
        });
    });
});
