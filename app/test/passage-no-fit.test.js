const assert = require("assert");
const fs = require("fs");
const path = require("path");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

// As in the original Inky, a long passage keeps its size and the frame scrolls: nothing shrinks
// the text and no note is shown.
describe("long passages", function () {
    ["renderer/playerView.js", "export-for-web-template/main.js", "renderer/gameChrome.css", "export-for-web-template/style.css", "renderer/webExporter.js"].forEach(file => {
        it(`${file} does not shrink the text or warn about long passages`, function () {
            const source = read(file);
            assert.doesNotMatch(source, /--story-fit/);
            assert.doesNotMatch(source, /MIN_READABLE_FONT_PX/);
            assert.doesNotMatch(source, /longa demais|passage-too-long/i);
        });
    });
});
