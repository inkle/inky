const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

describe("Export audio mixer", function () {
    it("isolates browser saves by exported story content", function () {
        const source = fs.readFileSync(path.join(__dirname, "../export-for-web-template/main.js"), "utf8");
        const start = source.indexOf("    function storyFingerprint(content) {");
        const end = source.indexOf("    // Story text is plain text:", start);
        assert.ok(start !== -1 && end > start, "story save fingerprint should be defined before the player helpers");
        const saveKeyCode = source.slice(start, end);
        const dom = new JSDOM("", { url: "https://story.test/export/index.html", runScripts: "outside-only" });
        const window = dom.window;

        try {
            const legacySaveKey = "save-state:/export/";
            window.localStorage.setItem(legacySaveKey, JSON.stringify({ stale: true }));
            window.storyContent = { inkVersion: 21, root: ["first story"] };
            window.eval(saveKeyCode + "\nwindow.saveKeyForTest = saveKey;");
            const firstKey = window.saveKeyForTest;
            window.storyContent = { inkVersion: 21, root: ["second story"] };
            window.eval(saveKeyCode + "\nwindow.saveKeyForTest = saveKey;");

            assert.notStrictEqual(firstKey, window.saveKeyForTest);
            assert.match(firstKey, /^save-state:\/export\/:[0-9a-f]{16}$/);
            assert.strictEqual(window.localStorage.getItem(legacySaveKey), JSON.stringify({ stale: true }));
            assert.strictEqual(window.localStorage.getItem(window.saveKeyForTest), null);
        } finally {
            window.close();
        }
    });

    function audioEngineCode(source) {
        const start = source.indexOf("    var audioEngine = (function() {");
        const close = "\n    })();";
        const end = source.indexOf(close, start);
        assert.ok(start !== -1 && end !== -1, "audio engine IIFE should be present");
        return source.slice(start, end + close.length).replace("var audioEngine =", "window.audioEngineForTest =");
    }

    it("opens and dismisses the exported story menu accessibly", function () {
        const source = fs.readFileSync(path.join(__dirname, "../export-for-web-template/main.js"), "utf8");
        const start = source.indexOf("    function setupButtons(hasSave) {");
        const close = "\n    }\n\n})(storyContent);";
        const end = source.indexOf(close, start);
        assert.ok(start !== -1 && end !== -1, "story controls should be initialized inside setupButtons");
        const setupButtons = source.slice(start, end + "\n    }".length)
            .replace("function setupButtons(hasSave)", "window.setupButtonsForTest = function(hasSave)");
        const template = fs.readFileSync(path.join(__dirname, "../export-for-web-template/index.html"), "utf8")
            .replace(/##[^#]+##/g, "");
        const dom = new JSDOM(template, { url: "https://story.test/", runScripts: "outside-only" });
        const window = dom.window;

        try {
            window.eval("var audioEngine = {};\n" + setupButtons);
            window.setupButtonsForTest(true);
            const toggle = window.document.getElementById("menu-toggle");
            const menu = window.document.getElementById("story-menu");
            const audioToggle = window.document.getElementById("audio-toggle");

            toggle.click();
            assert.strictEqual(menu.hidden, false);
            assert.strictEqual(toggle.getAttribute("aria-expanded"), "true");

            // The volume control lives inside the menu and does not close it.
            audioToggle.click();
            assert.strictEqual(menu.hidden, false);
            assert.strictEqual(toggle.getAttribute("aria-expanded"), "true");

            window.document.body.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
            assert.strictEqual(menu.hidden, true);
            assert.strictEqual(toggle.getAttribute("aria-expanded"), "false");

            toggle.click();
            window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            assert.strictEqual(menu.hidden, true);
            assert.strictEqual(window.document.activeElement, toggle);
        } finally {
            window.close();
        }
    });

    it("ignores incomplete sound references while preserving active effects", function () {
        const source = fs.readFileSync(path.join(__dirname, "../export-for-web-template/main.js"), "utf8");
        const start = source.indexOf("    function processAudioTag(tag) {");
        const end = source.indexOf("\n    // What the saved game remembers", start);
        assert.ok(start !== -1 && end > start, "audio tag handler should be defined before save-state helpers");
        const handler = source.slice(start, end).replace(
            "function processAudioTag(tag)",
            "window.processAudioTagForTest = function(tag)"
        );
        const dom = new JSDOM("", { url: "https://story.test/", runScripts: "outside-only" });
        const window = dom.window;
        let stopCount = 0;
        let playCount = 0;
        let musicCount = 0;

        try {
            window.audioEngineForTest = {
                stopSoundEffects() { stopCount++; },
                playSoundUrl() { playCount++; },
                setMusicUrl() { musicCount++; }
            };
            window.eval(
                "var audioEngine = window.audioEngineForTest;" +
                "function splitPropertyTag(tag) { var i = tag.indexOf(':'); return i < 0 ? null : { property: tag.slice(0, i), val: tag.slice(i + 1).trim() }; }" +
                "function audioUrlForFile() { return null; }" +
                handler
            );

            window.processAudioTagForTest("sound: fire.mp");
            window.processAudioTagForTest("sound:");
            assert.strictEqual(stopCount, 0);
            window.processAudioTagForTest("sound: stop");
            assert.strictEqual(stopCount, 1);

            // The retired audio and audioloop tags are plain, unknown tags now.
            assert.strictEqual(window.processAudioTagForTest("audio: effects/branch.ogg"), false);
            assert.strictEqual(window.processAudioTagForTest("audioloop: audio/music.mp3"), false);
            assert.strictEqual(window.processAudioTagForTest("audioloop: stop"), false);
            assert.strictEqual(playCount, 0);
            assert.strictEqual(musicCount, 0);
            assert.strictEqual(stopCount, 1);
        } finally {
            window.close();
        }
    });

    it("multiplies reader and author levels, updates active players, and stops only effects", async function () {
        const source = fs.readFileSync(path.join(__dirname, "../export-for-web-template/main.js"), "utf8");

        const dom = new JSDOM(
            '<!doctype html><body data-audio="on" data-volume="50" data-master-volume="50" data-music-volume="11" data-sfx-volume="18">' +
            '<div id="controls"><div id="audio-settings-anchor" hidden><span id="audio-control" hidden><button id="audio-toggle"></button><input id="audio-volume" value="50"></span></div></div></body>',
            { url: "https://story.test/", runScripts: "outside-only" }
        );
        const window = dom.window;
        const players = [];
        class MockAudio {
            constructor(src) {
                this.src = src;
                this.volume = 1;
                this.paused = true;
                this.listeners = {};
                this.playCount = 0;
                players.push(this);
            }
            addEventListener(name, callback) { this.listeners[name] = callback; }
            play() { this.paused = false; this.playCount++; return Promise.resolve(); }
            pause() { this.paused = true; }
            removeAttribute(name) { if( name === "src" ) this.src = ""; }
            load() {}
        }
        window.Audio = MockAudio;

        try {
            window.eval(audioEngineCode(source));
            const engine = window.audioEngineForTest;
            assert.strictEqual(window.document.getElementById("audio-settings-anchor").hidden, true);
            assert.strictEqual(window.document.getElementById("audio-control").hidden, true);
            engine.playSoundUrl("fx.ogg");
            assert.strictEqual(window.document.getElementById("audio-settings-anchor").hidden, false);
            assert.strictEqual(window.document.getElementById("audio-control").hidden, false);
            engine.setMusicUrl("music.mp3");
            const effect = players[0];
            const music = players[1];

            assert.strictEqual(effect.volume, 0.045);
            await new Promise(resolve => setTimeout(resolve, 750));
            assert.ok(Math.abs(music.volume - 0.0275) < 0.003);

            const volumeControl = window.document.getElementById("audio-volume");
            volumeControl.value = "40";
            volumeControl.dispatchEvent(new window.Event("input"));
            assert.strictEqual(window.localStorage.getItem("inky-audio-volume"), "40");
            assert.strictEqual(effect.volume, 0.036);
            assert.ok(Math.abs(music.volume - 0.022) < 0.003);
            assert.strictEqual(music.playCount, 1);

            engine.stopSoundEffects();
            assert.strictEqual(effect.paused, true);
            assert.strictEqual(effect.src, "");
            assert.strictEqual(music.paused, false);

            engine.setMusicUrl(null);
            await new Promise(resolve => setTimeout(resolve, 750));
            assert.strictEqual(music.paused, true);
        } finally {
            window.close();
        }
    });

    it("uses a saved reader volume instead of replacing it with the configured initial volume", function () {
        const source = fs.readFileSync(path.join(__dirname, "../export-for-web-template/main.js"), "utf8");
        const dom = new JSDOM(
            '<!doctype html><body data-audio="on" data-volume="50" data-master-volume="50" data-music-volume="11" data-sfx-volume="18">' +
            '<div id="controls"><span id="audio-control"><button id="audio-toggle"></button><input id="audio-volume" value="50"></span></div></body>',
            { url: "https://story.test/", runScripts: "outside-only" }
        );
        const window = dom.window;
        const players = [];
        class MockAudio {
            constructor() { this.volume = 1; players.push(this); }
            addEventListener() {}
            play() { return Promise.resolve(); }
        }
        window.Audio = MockAudio;

        try {
            window.localStorage.setItem("inky-audio-volume", "80");
            window.eval(audioEngineCode(source));
            window.audioEngineForTest.playSoundUrl("fx.ogg");
            assert.strictEqual(window.document.getElementById("audio-volume").value, "80");
            assert.strictEqual(window.localStorage.getItem("inky-audio-volume"), "80");
            assert.strictEqual(players[0].volume, 0.072);
        } finally {
            window.close();
        }
    });
});
