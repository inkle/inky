const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ChoiceText = require("../renderer/choiceText.js");

const app = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(app, file), "utf8");

describe("choice-text Save/Load regression protections", function () {
    it("removes only the selected option prefix and preserves the following narrative", function () {
        assert.deepStrictEqual(
            ChoiceText.stripSelectedChoiceText("Continue\nYou enter an enchanted forest.", "Continue"),
            { text: "You enter an enchanted forest.", consumed: true }
        );
    });

    it("does not remove ordinary narrative that does not begin with the selected option", function () {
        assert.deepStrictEqual(
            ChoiceText.stripSelectedChoiceText("You enter an enchanted forest.", "Continue"),
            { text: "You enter an enchanted forest.", consumed: true }
        );
    });

    it("keeps the pending prefix through empty/tag-only chunks", function () {
        assert.deepStrictEqual(
            ChoiceText.stripSelectedChoiceText("  \n", "Continue"),
            { text: "  \n", consumed: false }
        );
        assert.deepStrictEqual(
            ChoiceText.stripSelectedChoiceText("Continue\nThe clearing is quiet.", "Continue"),
            { text: "The clearing is quiet.", consumed: true }
        );
    });

    it("persists and restores the pending prefix with a save point", function () {
        const values = new Map();
        const storage = {
            setItem: (key, value) => values.set(key, String(value)),
            getItem: key => values.has(key) ? values.get(key) : null,
            removeItem: key => values.delete(key)
        };
        const key = "save-state:/forest/:fingerprint";
        ChoiceText.saveSelectedChoiceText(storage, key, "Continue");
        assert.strictEqual(ChoiceText.loadSelectedChoiceText(storage, key), "Continue");
        ChoiceText.removeSelectedChoiceText(storage, key);
        assert.strictEqual(ChoiceText.loadSelectedChoiceText(storage, key), null);
    });

    it("imports ChoiceText in Preview before using it to render narrative", function () {
        const player = read("renderer/playerView.js");
        assert.match(player, /const ChoiceText = require\(["']\.\/choiceText\.js["']\)/);
        assert.match(player, /ChoiceText\.stripSelectedChoiceText\(text, selectedChoiceText\)/);
        assert.match(player, /setSelectedChoiceText:/);
    });

    it("wires replayed choices to the Preview without replacing the newer image resolver", function () {
        const liveCompiler = read("renderer/liveCompiler.js");
        const controller = read("renderer/controller.js");
        assert.match(liveCompiler, /ChoiceText\.isReplayChoice\(replaying, choiceSequence, currentTurnIdx, choice\.number\)/);
        assert.match(liveCompiler, /events\.choiceAdded\(choice, isLatestTurn, isReplayChoice\)/);
        assert.match(controller, /choiceAdded: \(choice, isLatestTurn, isReplayChoice\)/);
        assert.match(controller, /PlayerView\.setSelectedChoiceText\(choice\.choice\.text\)/);
        assert.match(controller, /function resolvePreviewImage\(value, kind\)/);
        assert.match(controller, /resolveImageReference\(projectDir, source, kind\)/);
    });

    it("loads the shared helper before the exported player and copies it without replacing the newer exporter", function () {
        const html = read("export-for-web-template/index.html");
        const exporter = read("renderer/webExporter.js");
        const helperIndex = html.indexOf('src="choice-text.js"');
        const mainIndex = html.indexOf('src="main.js"');
        assert.ok(helperIndex >= 0 && helperIndex < mainIndex);
        assert.match(exporter, /copyFile\(choiceTextHelper, path\.join\(targetDirectory, "choice-text\.js"\)\)/);
        assert.match(exporter, /resolveImageReference\(projectRoot, reference, picture\.kind\)/);
        assert.match(exporter, /audioTagKey/);
    });

    it("supports #bg in web export and does not print it as a visible tag", function () {
        const main = read("export-for-web-template/main.js");
        assert.match(main, /splitTag\.property == "BG"/);
        assert.match(main, /property !== "BG"/);
        assert.match(main, /clearStoryBackground\(\);[\s\S]*?function clearChoices/);
    });

    it("keeps the Save/Load choice metadata in the exported game", function () {
        const main = read("export-for-web-template/main.js");
        assert.match(main, /savePointChoiceText = selectedChoiceText/);
        assert.match(main, /ChoiceText\.saveSelectedChoiceText\(window\.localStorage, saveKey, savePointChoiceText\)/);
        assert.match(main, /selectedChoiceText = ChoiceText\.loadSelectedChoiceText\(window\.localStorage, saveKey\)/);
        assert.match(main, /ChoiceText\.removeSelectedChoiceText\(window\.localStorage, saveKey\)/);
    });
});
