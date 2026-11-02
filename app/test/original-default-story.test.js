const assert = require("assert");
const fs = require("fs");
const path = require("path");

describe("Starter story of a new project", function () {
    const rendererDir = path.join(__dirname, "../renderer");
    const inkFile = fs.readFileSync(path.join(rendererDir, "inkFile.js"), "utf8");

    it("is Glass Tide without music, sound or image tags", function () {
        const start = inkFile.indexOf("initialContent = [");
        const end = inkFile.indexOf('].join("\\n");', start);
        assert.ok(start !== -1 && end !== -1);
        const lines = new Function("return " + inkFile.slice(start + "initialContent = ".length, end + 1))();
        const story = lines.join("\n");
        assert.match(story, /=== start ===/);
        assert.match(story, /=== ending ===/);
        assert.doesNotMatch(story, /[áàâãéêíóôõúç]/i);
        assert.doesNotMatch(story, /#\s*(music|sound|image)\b/i);
        assert.doesNotMatch(story, /\.(mp3|ogg|wav|jpe?g|png)\b/i);
    });

    it("opens as a new untitled project instead of a copy of the sample", function () {
        const main = fs.readFileSync(path.join(__dirname, "../main-process/main.js"), "utf8");
        assert.match(main, /ProjectWindow\.createEmpty\(\)/);
        assert.doesNotMatch(main, /writableExamplePath|bundledExamplePath/);
        assert.match(fs.readFileSync(path.join(rendererDir, "controller.js"), "utf8"), /InkProject\.startNew\(\)/);
    });
});

describe("Starter project title screen", function () {
    it("has a story title and an author in its game.yaml, shown as 'by Author'", function () {
        const { GameStyle } = require("../renderer/gameStyle.js");
        const project = fs.readFileSync(path.join(__dirname, "../renderer/inkProject.js"), "utf8");
        assert.match(project, /story: "Glass Tide"/);
        assert.match(project, /author: "Helena Marques"/);
        const yaml = GameStyle.templateYaml() + 'titles:\n  story: "Glass Tide"\n  author: "Helena Marques"\n';
        const parsed = GameStyle.parseText(yaml);
        assert.deepStrictEqual(parsed.warnings, []);
        assert.strictEqual(parsed.style.titles.story, "Glass Tide");
        assert.strictEqual(parsed.style.titles.author, "Helena Marques");
        const { TitleScreen } = require("../renderer/titleScreen.js");
        assert.match(TitleScreen.html({ title: "T", author: "A" }), /by A/);
    });
});
