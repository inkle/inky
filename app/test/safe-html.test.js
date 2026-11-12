const assert = require("assert");
const { JSDOM } = require("jsdom");

describe("safe story HTML", function () {
    let dom;
    let previousGlobals;
    let SafeHtml;

    before(function () {
        dom = new JSDOM("");
        previousGlobals = {
            document: global.document,
            NodeFilter: global.NodeFilter
        };
        global.document = dom.window.document;
        global.NodeFilter = dom.window.NodeFilter;
        SafeHtml = require("../renderer/safeHtml.js").SafeHtml;
    });

    after(function () {
        global.document = previousGlobals.document;
        global.NodeFilter = previousGlobals.NodeFilter;
        dom.window.close();
    });

    it("escapes values for safe HTML text contexts", function () {
        assert.strictEqual(SafeHtml.escapeHtml(`<script a="b">&'`), "&lt;script a=&quot;b&quot;&gt;&amp;&#39;");
    });

    it("maps Alt-clicks in contiguous text back to source positions", function () {
        assert.strictEqual(SafeHtml.wordSourceOffset("Primeira linha.\n", "Primeira linha.\n", 2), 4);
        assert.strictEqual(SafeHtml.wordSourceOffset("Primeira linha.\n", "Primeira linha.\n", 10), 12);
        assert.strictEqual(SafeHtml.wordSourceOffset("Quarta linha.", "Quarta linha.", 2), 3);
        assert.strictEqual(SafeHtml.wordSourceOffset("Quinta linha.", "Quinta linha.", 2), 3);
        assert.strictEqual(SafeHtml.wordSourceOffset("a a a", "a a a", 4), 4);
        assert.strictEqual(SafeHtml.wordSourceOffset("a b", "a b", -1), null);
    });

    it("wraps words without splitting them and keeps markup literal", function () {
        const root = document.createElement("div");
        root.textContent = "<em>Hello</em> world";
        SafeHtml.wrapWords(root);

        assert.deepStrictEqual(
            Array.from(root.querySelectorAll(".inky-word"), node => node.textContent),
            ["<em>Hello</em>", "world"]
        );
        assert.strictEqual(root.querySelector("em"), null);
        assert.strictEqual(root.textContent, "<em>Hello</em> world");
    });
});
