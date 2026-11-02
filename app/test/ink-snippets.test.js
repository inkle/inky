const assert = require("assert");
const fs = require("fs");
const path = require("path");

describe("Ink full-story snippets", function () {
    it("does not include The Last Light", function () {
        const appDir = path.join(__dirname, "..");
        const snippets = fs.readFileSync(path.join(appDir, "main-process/inkSnippets.js"), "utf8");
        const storyPath = path.join(appDir, "main-process/ink/longer-ink-snippets/the_last_light.ink");

        assert.doesNotMatch(snippets, /The Last Light|the_last_light\.ink/);
        assert.strictEqual(fs.existsSync(storyPath), false);
    });
});
