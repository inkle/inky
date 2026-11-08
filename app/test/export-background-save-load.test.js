const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
    path.join(__dirname, "../export-for-web-template/main.js"),
    "utf8"
);

function extractFunction(sourceText, functionName) {
    const start = sourceText.indexOf("function " + functionName + "(");
    assert.ok(start >= 0, functionName + " should exist");
    const nextFunction = sourceText.indexOf("\n    function ", start + 1);
    const end = nextFunction < 0 ? sourceText.length : nextFunction;
    return sourceText.slice(start, end);
}

describe("export saved-scene visual restoration", function () {
    it("restores the saved passage from the title screen without inheriting scene backgrounds", function () {
        const start = extractFunction(source, "startStory");
        assert.match(start, /if\( loadFromSave === true \)/);
        assert.match(start, /story\.state\.LoadJson\(state\)/);
        assert.match(start, /restoreSavedMusic\(\)/);
        assert.match(start, /continueStory\(\)/);
        const rewind = source.slice(source.indexOf('let rewindEl ='));
        assert.match(rewind, /returnToTitleScreen\(\)/);
        const restart = extractFunction(source, "returnToTitleScreen");
        assert.match(restart, /clearStoryImage\(\)/);
        assert.match(restart, /story\.ResetState\(\)/);
        assert.match(restart, /showTitleScreen\(\)/);
        assert.doesNotMatch(source, /getElementById\("reload"\)/);
    });

    it("includes the scene background in the canonical cleanup", function () {
        const clearScene = extractFunction(source, "clearScene");
        assert.match(clearScene, /clearChoices\(\)/);
        assert.match(clearScene, /clearStoryImage\(\)/);
        assert.match(clearScene, /clearStoryBackground\(\)/);
    });

    it("clears a background image and its active-frame class", function () {
        const clearBackground = extractFunction(source, "clearStoryBackground");
        assert.match(clearBackground, /style\.backgroundImage\s*=\s*""/);
        assert.match(clearBackground, /classList\.remove\("has-background"\)/);
    });
});
