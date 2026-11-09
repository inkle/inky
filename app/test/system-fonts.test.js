const assert = require("assert");
const { parseFontOutput } = require("../main-process/systemFonts.js");

describe("installed system fonts", function () {
    it("splits aliases, filters invalid names, removes duplicates, and sorts Linux families", function () {
        const fonts = parseFontOutput("linux", "Zebra Sans, Zebra Display\nArial\nArial\n<script>\n");

        assert.deepStrictEqual(fonts, ["Arial", "Zebra Display", "Zebra Sans"]);
    });

    it("reads font family names from macOS system-profiler JSON", function () {
        const fonts = parseFontOutput("darwin", JSON.stringify({
            SPFontsDataType: [{ family: "Avenir Next" }, { family: ["Arial", "Georgia"] }]
        }));

        assert.deepStrictEqual(fonts, ["Arial", "Avenir Next", "Georgia"]);
    });
});
