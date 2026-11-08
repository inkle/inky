const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { JSDOM } = require("jsdom");
const { GameStyle } = require("../renderer/gameStyle.js");

describe("visual settings form", function () {
    it("loads story text, edits scene title styling and drops retired title styles", async function () {
        const html = fs.readFileSync(
            path.join(__dirname, "../renderer/gameSettings/gameSettings.html"),
            "utf8"
        );
        const script = fs.readFileSync(
            path.join(__dirname, "../renderer/gameSettings/gameSettings.js"),
            "utf8"
        );
        const initialYaml = [
            "titles:",
            '  story: "Station"',
            '  author: "A. Writer"',
            "  story_style:",
            "    size: 48",
            "    align: left",
            "  author_style:",
            "    size: 18",
            "    align: center",
            "  scene_style:",
            "    size: 24",
            "    align: right",
            "audio:",
            "  volume: 40",
            "  master: 50",
            "  music: 11",
            "  sfx: 18",
            ""
        ].join("\n");
        const dom = new JSDOM(html, {
            url: "file:///gameSettings.html?virtual=1&yaml=" + encodeURIComponent(initialYaml),
            runScripts: "outside-only"
        });
        const window = dom.window;
        window.HTMLCanvasElement.prototype.getContext = () => ({
            fillStyle: "#000000"
        });
        window.require = name => {
            if( name === "fs" ) return fs;
            if( name === "path" ) return path;
            if( name === "url" ) return require("url");
            if( name === "../imageTypes.js" ) return require("../renderer/imageTypes.js");
            if( name === "electron" ) return { ipcRenderer: {
                send() {},
                invoke: () => Promise.resolve(["Atkinson Hyperlegible", "Arial"])
            } };
            if( name === "../gameStyle.js" ) return { GameStyle };
            throw new Error("Unexpected module: " + name);
        };

        try {
            assert.strictEqual(window.document.querySelector('label[for="story-title"]').textContent, "Title");
            assert.deepStrictEqual(
                Array.from(window.document.querySelectorAll("#settings-scroll h3, #settings-scroll h4"), heading => heading.textContent),
                ["Titles", "Scene"]
            );
            assert.strictEqual(
                window.document.querySelector("header .hint").textContent,
                "Changes update the preview right away and are stored in this project’s game.yaml."
            );
            assert.strictEqual(window.document.querySelectorAll("#settings-scroll .note").length, 0);
            assert.deepStrictEqual(
                Array.from(window.document.querySelectorAll('input[name="theme-mode"]'), radio => radio.value),
                ["single", "dual"]
            );
            assert.strictEqual(window.document.getElementById("story-title").placeholder, "add a title");
            assert.strictEqual(window.document.getElementById("story-author").placeholder, "author name");
            assert.strictEqual(window.document.querySelector('input[name="story-format"]'), null);
            assert.strictEqual(window.document.querySelector("#line-height + #line-height-number + .unit").textContent, "×");
            assert.strictEqual(window.document.querySelector("#line-height").parentElement.querySelector(".unit").textContent, "×");
            const rangeInputs = Array.from(window.document.querySelectorAll('input[type="range"]'));
            assert.strictEqual(rangeInputs.length, 8);
            rangeInputs.forEach(range => {
                const number = window.document.getElementById(range.id + "-number");
                assert.strictEqual(number.type, "number");
                assert.strictEqual(number.min, range.min);
                assert.strictEqual(number.max, range.max);
                assert.strictEqual(number.step, range.step);
            });
            assert.doesNotMatch(html, /tag at the top of your story|single paragraph/);
            window.eval(script);
            await new Promise(resolve => setImmediate(resolve));
            assert.deepStrictEqual(["master", "music", "sfx"].map(category =>
                window.document.getElementById(`audio-${category}`).value
            ), ["50", "11", "18"]);
            assert.strictEqual(window.document.getElementById("audio-master-number").value, "50");
            assert.strictEqual(window.document.getElementById("audio-music-number").value, "11");
            assert.strictEqual(window.document.getElementById("audio-sfx-number").value, "18");
            assert.strictEqual(
                window.document.querySelector('#font-family option[value="Atkinson Hyperlegible"]').textContent,
                "Atkinson Hyperlegible"
            );
            assert.strictEqual(window.document.getElementById("story-author").value, "A. Writer");
            assert.strictEqual(window.document.getElementById("story-title-size").value, "56");
            assert.strictEqual(window.document.getElementById("story-title-size-number").value, "56");
            assert.strictEqual(window.document.getElementById("author-title-size"), null);
            assert.strictEqual(window.document.getElementById("scene-title-size").value, "24");
            assert.strictEqual(window.document.getElementById("scene-title-size-number").value, "24");
            assert.strictEqual(window.document.querySelector('input[name="scene-title-align"][value="right"]').checked, true);

            window.document.getElementById("clear-story-title").click();
            assert.strictEqual(window.document.getElementById("story-title").value, "");
            assert.strictEqual(window.document.activeElement.id, "story-title");
            window.document.getElementById("clear-story-author").click();
            assert.strictEqual(window.document.getElementById("story-author").value, "");
            assert.strictEqual(window.document.activeElement.id, "story-author");

            const sceneSize = window.document.getElementById("scene-title-size-number");
            sceneSize.value = "10";
            sceneSize.dispatchEvent(new window.Event("input", { bubbles: true }));
            assert.strictEqual(window.document.getElementById("scene-title-size").value, "10");
            sceneSize.value = "9";
            sceneSize.dispatchEvent(new window.Event("input", { bubbles: true }));
            assert.strictEqual(sceneSize.classList.contains("invalid"), true);
            sceneSize.dispatchEvent(new window.Event("blur"));
            assert.strictEqual(sceneSize.value, "10");

            sceneSize.value = "100";
            sceneSize.dispatchEvent(new window.Event("input", { bubbles: true }));
            assert.strictEqual(window.document.getElementById("scene-title-size").value, "100");
            sceneSize.value = "101";
            sceneSize.dispatchEvent(new window.Event("input", { bubbles: true }));
            assert.strictEqual(sceneSize.classList.contains("invalid"), true);
            sceneSize.dispatchEvent(new window.Event("blur"));
            assert.strictEqual(sceneSize.value, "100");
            sceneSize.value = "not a number";
            sceneSize.dispatchEvent(new window.Event("input", { bubbles: true }));
            assert.strictEqual(sceneSize.classList.contains("invalid"), true);
            sceneSize.dispatchEvent(new window.Event("blur"));
            assert.strictEqual(sceneSize.value, "100");

            const sceneAlignment = window.document.querySelector('input[name="scene-title-align"][value="center"]');
            sceneAlignment.checked = true;
            sceneAlignment.dispatchEvent(new window.Event("change", { bubbles: true }));
            const master = window.document.getElementById("audio-master");
            master.value = "70";
            master.dispatchEvent(new window.Event("input", { bubbles: true }));
            assert.strictEqual(window.document.getElementById("audio-master-number").value, "70");
            const music = window.document.getElementById("audio-music-number");
            music.value = "33";
            music.dispatchEvent(new window.Event("input", { bubbles: true }));
            assert.strictEqual(window.document.getElementById("audio-music").value, "33");
            const sfx = window.document.getElementById("audio-sfx");
            sfx.value = "44";
            sfx.dispatchEvent(new window.Event("input", { bubbles: true }));
            assert.strictEqual(window.document.getElementById("audio-sfx-number").value, "44");

            const savedYaml = window.flushSettingsForAdvanced();
            const saved = GameStyle.parseText(savedYaml);
            assert.strictEqual(saved.model.titles.story, "");
            assert.strictEqual(saved.model.titles.author, "");
            assert.strictEqual(saved.model.titles.storyStyle, undefined);
            assert.strictEqual(saved.model.titles.authorStyle, undefined);
            assert.strictEqual(saved.model.titles.sceneStyle.size, 100);
            assert.strictEqual(saved.model.titles.sceneStyle.align, "center");
            assert.doesNotMatch(savedYaml, /story_style|author_style/);
            assert.match(savedYaml, /scene_style:/);
            assert.doesNotMatch(savedYaml, /story_format|custom_aspect_ratio/);
            assert.strictEqual(saved.model.layout.storyFormat, undefined);
            assert.strictEqual(saved.model.layout.customAspectRatio, undefined);
            assert.deepStrictEqual(saved.model.audio, { volume: 40, master: 70, music: 33, sfx: 44 });

            window.dispatchEvent(new window.MessageEvent("message", {
                data: {
                    type: "game-settings-reload",
                    yaml: "audio:\n  volume: 25\n  master: 60\n  music: 30\n  sfx: 15\nlayout:\n  story_format: landscape\n"
                }
            }));
            assert.deepStrictEqual(["master", "music", "sfx"].map(category =>
                window.document.getElementById(`audio-${category}`).value
            ), ["60", "30", "15"]);
            assert.deepStrictEqual(
                GameStyle.parseText(window.flushSettingsForAdvanced()).model.audio,
                { volume: 25, master: 60, music: 30, sfx: 15 }
            );
            window.document.getElementById("reset").click();
            assert.strictEqual(
                GameStyle.parseText(window.flushSettingsForAdvanced()).model.layout.storyFormat,
                undefined
            );
            assert.doesNotMatch(window.flushSettingsForAdvanced(), /story_format|custom_aspect_ratio/);
        } finally {
            window.close();
        }
    });

    describe("cover", function () {
        function openSettings(url, invoke) {
            const html = fs.readFileSync(path.join(__dirname, "../renderer/gameSettings/gameSettings.html"), "utf8");
            const script = fs.readFileSync(path.join(__dirname, "../renderer/gameSettings/gameSettings.js"), "utf8");
            const dom = new JSDOM(html, { url, runScripts: "outside-only" });
            const window = dom.window;
            window.alert = message => { window.alerted = message; };
            window.HTMLCanvasElement.prototype.getContext = () => ({ fillStyle: "#000000" });
            window.require = name => {
                if( name === "fs" ) return fs;
                if( name === "path" ) return path;
                if( name === "url" ) return require("url");
                if( name === "../imageTypes.js" ) return require("../renderer/imageTypes.js");
                if( name === "electron" ) return { ipcRenderer: { send() {}, invoke } };
                if( name === "../gameStyle.js" ) return { GameStyle };
                throw new Error("Unexpected module: " + name);
            };
            window.eval(script);
            return window;
        }
        const change = (window, id, value) => {
            const input = window.document.getElementById(id);
            input.value = value;
            input.dispatchEvent(new window.Event("change", { bubbles: true }));
        };

        it("is edited in the form and in the YAML, always the same value", async function () {
            const yaml = 'titles:\n  story: "O Farol"\n  cover: "images/cover.png"\n';
            const window = openSettings("file:///gameSettings.html?virtual=1&yaml=" + encodeURIComponent(yaml), () => Promise.resolve([]));
            try {
                const $ = id => window.document.getElementById(id);
                assert.strictEqual($("story-cover").value, "images/cover.png");
                assert.strictEqual($("choose-story-cover").disabled, true, "no folder yet, nothing to choose from");

                change(window, "story-cover", "capas\\nova.JPG");
                assert.strictEqual($("story-cover").value, "capas/nova.JPG");
                assert.strictEqual(GameStyle.parseText(window.flushSettingsForAdvanced()).model.titles.cover, "capas/nova.JPG");

                change(window, "story-cover", "../fora.png");
                assert.strictEqual($("story-cover").classList.contains("invalid"), true);
                assert.strictEqual(GameStyle.parseText(window.flushSettingsForAdvanced()).model.titles.cover, "capas/nova.JPG");

                // the YAML (Advanced) editor changes it: the form follows
                window.dispatchEvent(new window.MessageEvent("message", { data: { type: "game-settings-reload", yaml: 'titles:\n  cover: "x/y.webp"\n' } }));
                assert.strictEqual($("story-cover").value, "x/y.webp");
                assert.strictEqual($("story-cover").classList.contains("invalid"), false);

                $("clear-story-cover").click();
                assert.strictEqual($("story-cover").value, "");
                const cleared = window.flushSettingsForAdvanced();
                assert.doesNotMatch(cleared, /cover/);
                await new Promise(resolve => setImmediate(resolve));
            } finally {
                window.close();
            }
        });

        it("is chosen from a dialog and stored relative to the project folder", async function () {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-cover-settings-"));
            const outside = fs.mkdtempSync(path.join(os.tmpdir(), "inky-cover-outside-"));
            try {
                fs.mkdirSync(path.join(root, "image"));
                const yamlPath = path.join(root, "game.yaml");
                fs.writeFileSync(yamlPath, 'titles:\n  story: "O Farol"\n');
                fs.writeFileSync(path.join(outside, "capa.jpg"), "jpg-bytes");
                let picked = path.join(root, "image", "capa.png");
                let confirmed = true;
                const requests = [];
                const window = openSettings("file:///gameSettings.html?path=" + encodeURIComponent(yamlPath), (channel, options) => {
                    if( channel === "showOpenDialog" ) { requests.push(options); return Promise.resolve({ canceled: false, filePaths: [picked] }); }
                    return Promise.resolve([]);
                });
                window.confirm = message => { window.confirmed = message; return confirmed; };
                try {
                    const $ = id => window.document.getElementById(id);
                    assert.strictEqual($("choose-story-cover").disabled, false);
                    $("choose-story-cover").click();
                    await new Promise(resolve => setImmediate(resolve));
                    assert.strictEqual(requests[0].defaultPath, root);
                    assert.strictEqual(requests[0].filters[0].extensions.join(","), "jpg,jpeg,png,webp,gif,svg");
                    assert.strictEqual($("story-cover").value, "image/capa.png");
                    assert.strictEqual(GameStyle.parseText(window.flushSettingsForAdvanced()).model.titles.cover, "image/capa.png");
                    assert.match(fs.readFileSync(yamlPath, "utf8"), /cover: "image\/capa\.png"/);

                    // outside the project: copied into the project's images folder, not refused
                    picked = path.join(outside, "capa.jpg");
                    $("choose-story-cover").click();
                    await new Promise(resolve => setImmediate(resolve));
                    assert.strictEqual($("story-cover").value, "image/capa.jpg");
                    assert.strictEqual(fs.readFileSync(path.join(root, "image", "capa.jpg"), "utf8"), "jpg-bytes");
                    assert.strictEqual(window.alerted, undefined, "a picture from outside is imported, not refused");

                    // a name that already exists asks first; refusing keeps the current cover
                    confirmed = false;
                    $("choose-story-cover").click();
                    await new Promise(resolve => setImmediate(resolve));
                    assert.match(window.confirmed, /image\/capa\.jpg already exists/);
                    assert.strictEqual($("story-cover").value, "image/capa.jpg");
                    confirmed = true;
                    $("choose-story-cover").click();
                    await new Promise(resolve => setImmediate(resolve));
                    assert.strictEqual(fs.readFileSync(path.join(root, "image", "capa.jpg"), "utf8"), "jpg-bytes");

                    // not a picture at all: refused, with the reason
                    fs.writeFileSync(path.join(outside, "notes.txt"), "x");
                    picked = path.join(outside, "notes.txt");
                    $("choose-story-cover").click();
                    await new Promise(resolve => setImmediate(resolve));
                    assert.match(window.alerted, /cover image/);
                    assert.strictEqual(fs.existsSync(path.join(root, "image", "notes.txt")), false);
                    assert.strictEqual($("story-cover").value, "image/capa.jpg");
                } finally {
                    window.close();
                }
            } finally {
                fs.rmSync(root, { recursive: true, force: true });
                fs.rmSync(outside, { recursive: true, force: true });
            }
        });

        it("keeps the cover in the field without a thumbnail", async function () {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-cover-thumb-"));
            try {
                fs.mkdirSync(path.join(root, "image"));
                fs.writeFileSync(path.join(root, "image", "capa.png"), "png");
                const yamlPath = path.join(root, "game.yaml");
                fs.writeFileSync(yamlPath, 'titles:\n  story: "O Farol"\n  cover: "image/capa.png"\n');
                const window = openSettings("file:///gameSettings.html?path=" + encodeURIComponent(yamlPath), () => Promise.resolve([]));
                const $ = id => window.document.getElementById(id);
                const settingsCss = fs.readFileSync(path.join(__dirname, "../renderer/gameSettings/gameSettings.css"), "utf8");
                try {
                    assert.doesNotMatch(settingsCss, /\.cover-thumb/);
                    assert.strictEqual($("story-cover-thumb"), null);
                    assert.strictEqual($("story-cover").value, "image/capa.png");
                    $("story-cover").value = "image/outra.png";
                    $("story-cover").dispatchEvent(new window.Event("change", { bubbles: true }));
                    assert.strictEqual(GameStyle.parseText(window.flushSettingsForAdvanced()).model.titles.cover, "image/outra.png");
                    $("story-cover").value = "image/capa.png";
                    $("story-cover").dispatchEvent(new window.Event("change", { bubbles: true }));
                    assert.strictEqual(GameStyle.parseText(window.flushSettingsForAdvanced()).model.titles.cover, "image/capa.png");
                    await new Promise(resolve => setImmediate(resolve));
                } finally {
                    window.close();
                }
            } finally {
                fs.rmSync(root, { recursive: true, force: true });
            }
        });
    });
});
