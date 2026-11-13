const assert = require("assert");
const fs = require("fs");
const path = require("path");

describe("Starter story of a new project", function () {
    const rendererDir = path.join(__dirname, "../renderer");
    const inkFile = fs.readFileSync(path.join(rendererDir, "inkFile.js"), "utf8");

    it("is The Borrowed Star without music, sound or image tags", function () {
        const start = inkFile.indexOf("initialContent = [");
        const end = inkFile.indexOf('].join("\\n");', start);
        assert.ok(start !== -1 && end !== -1);
        const lines = new Function("return " + inkFile.slice(start + "initialContent = ".length, end + 1))();
        const story = lines.join("\n");
        assert.match(story, /=== start ===/);
        assert.match(story, /#title: The Borrowed Star/);
        assert.doesNotMatch(story, /#title: Before Dawn/);
        assert.match(story, /=== home ===/);
        assert.doesNotMatch(story, /[áàâãéêíóôõúç]/i);
        assert.doesNotMatch(story, /#\s*(music|sound|image)\b/i);
        assert.doesNotMatch(story, /\.(mp3|ogg|wav|jpe?g|png)\b/i);
    });

    it("keeps the starter for first launch and new untitled projects", function () {
        const main = fs.readFileSync(path.join(__dirname, "../main-process/main.js"), "utf8");
        assert.match(main, /ProjectWindow\.createEmpty\(\)/);
        assert.doesNotMatch(main, /writableExamplePath|bundledExamplePath/);
        assert.match(fs.readFileSync(path.join(rendererDir, "controller.js"), "utf8"), /InkProject\.startNew\(\)/);
    });
});

describe("Starter project title screen", function () {
    it("has a story title and an author in its game.yaml, shown as 'Written by Author'", function () {
        const { GameStyle } = require("../renderer/gameStyle.js");
        const project = fs.readFileSync(path.join(__dirname, "../renderer/inkProject.js"), "utf8");
        assert.match(project, /story: "The Borrowed Star"/);
        assert.match(project, /author: "Elias Wren"/);
        const yaml = GameStyle.templateYaml() + 'titles:\n  story: "The Borrowed Star"\n  author: "Elias Wren"\n';
        const parsed = GameStyle.parseText(yaml);
        assert.deepStrictEqual(parsed.warnings, []);
        assert.strictEqual(parsed.style.titles.story, "The Borrowed Star");
        assert.strictEqual(parsed.style.titles.author, "Elias Wren");
        const { TitleScreen } = require("../renderer/titleScreen.js");
        assert.match(TitleScreen.html({ title: "T", author: "A" }), /by A/);
    });
});

describe("The Borrowed Star paths", function () {
    const ink = require('inkjs');
    const code = fs.readFileSync(path.join(__dirname, '../renderer/inkFile.js'), 'utf8');
    const start = code.indexOf('initialContent = [');
    const end = code.indexOf('].join("\\n");', start);
    const source = new Function('return ' + code.slice(start + 'initialContent = '.length, end + 1))().join('\n');
    const compiled = new ink.Compiler(source).Compile().ToJson();
    for (const choice of [0, 1]) {
        it('reaches the approved ending and updates variables for choice ' + choice, function () {
            const story = new ink.Story(compiled);
            let intro = '', tags = [];
            while (story.canContinue) { intro += story.Continue(); tags.push(...story.currentTags); }
            assert.match(intro, /It cannot do both/);
            assert.ok(tags.includes('align: left'));
            assert.deepStrictEqual(story.currentChoices.map(c => c.text), ['Keep its warmth. Save the village.', 'Return its light. Guide the travelers.']);
            story.ChooseChoiceIndex(choice);
            let ending = ''; tags = [];
            while (story.canContinue) { ending += story.Continue(); tags.push(...story.currentTags); }
            assert.ok(tags.includes('align: left'));
            assert.match(ending, choice === 0 ? /your sister never returns/ : /keep the key to your door/);
            assert.strictEqual(story.variablesState['village_warmth'], choice === 0);
            assert.strictEqual(story.variablesState['guiding_star'], choice === 1);
            assert.strictEqual(story.currentChoices.length, 0);
        });
    }
});
