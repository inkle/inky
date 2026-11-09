const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const InkRichText = require("../renderer/richTextDom.js");

describe("rich text in the player and export", function () {
    const doc = new JSDOM("<body></body>").window.document;
    const render = text => {
        const div = doc.createElement("div");
        div.appendChild(InkRichText.toNodes(text, doc));
        return div.innerHTML;
    };

    it("turns markers into strong and em", function () {
        assert.strictEqual(render("a ⟦b⟧time⟦/b⟧ and ⟦i⟧yes⟦/i⟧"), "a <strong>time</strong> and <em>yes</em>");
    });
    it("nests and crosses formats", function () {
        assert.strictEqual(render("⟦b⟧x ⟦i⟧y⟦/i⟧⟦/b⟧"), "<strong>x <em>y</em></strong>");
        assert.strictEqual(render("⟦b⟧x⟦i⟧y⟦/b⟧z⟦/i⟧"), "<strong>x<em>y</em></strong><em>z</em>");
    });
    it("never shows stray or unknown markers", function () {
        assert.strictEqual(render("a⟦/b⟧ b ⟦i⟧c"), "a b c");
        assert.strictEqual(render("⟦x⟧t⟦/x⟧"), "t");
    });
    it("keeps writer HTML as text", function () {
        assert.strictEqual(render("⟦b⟧<img src=x onerror=1>⟦/b⟧"), "<strong>&lt;img src=x onerror=1&gt;</strong>");
    });
    it("renders the native legacy line-break marker without exposing markup", function () {
        assert.strictEqual(render("a⟦br⟧b"), "a<br>b");
        assert.strictEqual(InkRichText.plainText("a⟦br⟧b"), "a\nb");
    });
    it("plainText drops the markers", function () {
        assert.strictEqual(InkRichText.plainText("⟦b⟧a⟦/b⟧ ⟦/i⟧b"), "a b");
    });
    it("is wired into the export template, the exporter and the preview", function () {
        const root = path.join(__dirname, "..");
        const read = f => fs.readFileSync(path.join(root, f), "utf8");
        assert(read("export-for-web-template/index.html").indexOf('src="richtext.js"') < read("export-for-web-template/index.html").indexOf('src="main.js"'));
        assert(read("renderer/webExporter.js").includes('"richtext.js"'));
        assert(read("export-for-web-template/main.js").includes("InkRichText.toNodes"));
        // Only the story text is formatted: choices and scene titles go through plainText
        assert(read("export-for-web-template/main.js").includes("plainStoryText(choice.text)"));
        assert(read("export-for-web-template/main.js").includes("plainStoryText(sceneTitle)"));
        assert(read("renderer/playerView.js").includes("InkRichText.plainText(choice.choice.text)"));
        assert(read("renderer/playerView.js").includes("InkRichText.plainText(titleTag)"));
        assert(!read("renderer/playerView.js").includes("InkRichText.toNodes(choice"));
    });
});
