const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { GameStyle } = require("../renderer/gameStyle.js");
const ScreenMode = require("../renderer/screenMode.js");
const { TagFormat } = require("../renderer/tagFormat.js");
const { TagPicker } = require("../renderer/tagPicker.js");

describe("Screen Mode (opt-in Ink presentation)", function () {
    it("defaults old game.yaml files to traditional without changing theme settings", function () {
        const style = GameStyle.parseText('theme: dark\nlayout:\n  line_height: 1.8\n');
        assert.deepStrictEqual(style.warnings, []);
        assert.strictEqual(style.model.presentation, "traditional");
        assert.strictEqual(style.style.presentation, "traditional");
        assert.strictEqual(style.model.theme, "dark");
    });

    it("round-trips screen presentation through Advanced YAML", function () {
        const source = 'theme: light\npresentation: screen\nlayout:\n  width: 46\n';
        const parsed = GameStyle.parseText(source);
        assert.deepStrictEqual(parsed.warnings, []);
        assert.strictEqual(parsed.model.presentation, "screen");
        assert.strictEqual(parsed.style.presentation, "screen");
        const serialized = GameStyle.toYaml(parsed.model);
        assert.match(serialized, /^presentation: screen$/m);
        assert.strictEqual(GameStyle.parseText(serialized).model.presentation, "screen");
        assert.strictEqual(GameStyle.parseText(GameStyle.toYaml(GameStyle.defaultModel())).model.presentation, "traditional");
    });

    it("rejects unknown presentation modes instead of guessing", function () {
        const parsed = GameStyle.parseText('presentation: cinema\n');
        assert.strictEqual(parsed.model.presentation, "traditional");
        assert.ok(parsed.warnings.some(w => /presentation/.test(w)));
    });

    it("recognizes only explicit # screen tags, leaving Ink semantics alone", function () {
        assert.strictEqual(ScreenMode.isScreenTag("screen"), true);
        assert.strictEqual(ScreenMode.isScreenTag("# screen"), true);
        assert.strictEqual(ScreenMode.isScreenTag("SCREEN"), true);
        assert.strictEqual(ScreenMode.isScreenTag("screen: a"), false);
        assert.strictEqual(ScreenMode.startsScreen("screen", ["title: The Last Star", "screen"]), true);
        assert.strictEqual(ScreenMode.startsScreen("traditional", ["screen"]), false);
        assert.strictEqual(ScreenMode.startsScreen("screen", ["title: The Last Star"]), false);
        assert.strictEqual(TagFormat.normalizeText("# screen"), "#screen");
        assert.ok(TagPicker.TAG_NAMES.includes("screen"));
    });

    it("keeps Preview, export, and the Visual form wired to the same setting", function () {
        const files = {
            preview: fs.readFileSync(path.join(__dirname, "../renderer/playerView.js"), "utf8"),
            runtime: fs.readFileSync(path.join(__dirname, "../export-for-web-template/main.js"), "utf8"),
            exporter: fs.readFileSync(path.join(__dirname, "../renderer/webExporter.js"), "utf8"),
            visual: fs.readFileSync(path.join(__dirname, "../renderer/gameSettings/gameSettings.js"), "utf8"),
            markup: fs.readFileSync(path.join(__dirname, "../renderer/gameSettings/gameSettings.html"), "utf8")
        };
        assert.match(files.preview, /ScreenMode\.startsScreen\(presentation, tags\)/);
        assert.match(files.preview, /pendingStoryText/);
        assert.match(files.runtime, /ScreenMode\.startsScreen\(presentation, tags\)/);
        assert.match(files.exporter, /##PRESENTATION##/);
        assert.match(files.visual, /model\.presentation = r\.value/);
        assert.match(files.markup, /value="screen"/);
    });
});
