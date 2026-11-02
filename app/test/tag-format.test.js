const assert = require("assert");
const { TagFormat } = require("../renderer/tagFormat.js");

const fix = text => TagFormat.normalizeText(text);

describe("tag format", function () {
    it("removes the space between # and the tag name", function () {
        assert.strictEqual(fix("# title: Title"), "#title: Title");
        assert.strictEqual(fix("#       title: Title"), "#title: Title");
    });

    it("keeps the colon glued to the name and one space before the value", function () {
        assert.strictEqual(fix("#title   :    Title"), "#title: Title");
        assert.strictEqual(fix("#align:center"), "#align: center");
    });

    it("never lets a tag alone on its line move sideways", function () {
        assert.strictEqual(fix("text\n                  #title: x"), "text\n#title: x");
        assert.strictEqual(fix("\t#align: left"), "#align: left");
    });

    it("fixes tags that follow text without moving them", function () {
        assert.strictEqual(fix("* [Go] #  image :a.png"), "* [Go] #image: a.png");
        assert.strictEqual(fix("Some text #  a : 1 #b:2"), "Some text #a: 1 #b: 2");
    });

    it("leaves comments, escapes and non-story lines alone", function () {
        const text = "// #  a : 1\n/*\n   # b : 2\n*/\nVAR s = \"# c : 3\"\n   ~ x = \"# d : 4\"\nescaped \\# e : 5";
        assert.strictEqual(fix(text), text);
    });

    it("keeps line breaks and is idempotent", function () {
        const once = fix("a\r\n  # t :1\r\n\r\n   #  u:2\n");
        assert.strictEqual(once, "a\r\n#t: 1\r\n\r\n#u: 2\n");
        assert.strictEqual(fix(once), once);
    });

    it("allows an empty value without trailing spaces piling up", function () {
        assert.strictEqual(fix("#tag :"), "#tag:");
        assert.strictEqual(fix("#tag:    "), "#tag: ");
    });

    it("allows one single space between the words of a scene title", function () {
        assert.strictEqual(fix("#title: A Floresta Escura"), "#title: A Floresta Escura");
        assert.strictEqual(fix("#title: A Floresta                         Escura"), "#title: A Floresta Escura");
        assert.strictEqual(fix("#title:   A      Floresta \t  Escura  "), "#title: A Floresta Escura ");
        assert.strictEqual(fix("# title : A   B   #align:   left"), "#title: A B #align: left");
        assert.strictEqual(fix("#image: a   b.png"), "#image: a   b.png");
    });

    it("knows where a # can be a tag (story code only)", function () {
        const lines = ["text #", "// #", "/* a", "#", "*/ #", "VAR x = \"#", "~ y = \"#"];
        const at = (row) => TagFormat.isCodeAt(lines, row, lines[row].length);
        assert.deepStrictEqual([0, 1, 3, 4, 5, 6].map(at), [true, false, false, true, false, false]);
    });

    it("fixes an editor document with minimal edits", function () {
        const lines = ["text", "     # title : A"];
        const doc = {
            getAllLines: () => lines.slice(),
            remove: r => { lines[r.start.row] = lines[r.start.row].slice(0, r.start.column) + lines[r.end.row].slice(r.end.column); },
            insert: (p, t) => { lines[p.row] = lines[p.row].slice(0, p.column) + t + lines[p.row].slice(p.column); },
            replace: (r, t) => { lines[r.start.row] = lines[r.start.row].slice(0, r.start.column) + t + lines[r.end.row].slice(r.end.column); }
        };
        assert.ok(TagFormat.fixDocument(doc) > 0);
        assert.deepStrictEqual(lines, ["text", "#title: A"]);
        assert.strictEqual(TagFormat.fixDocument(doc), 0);
    });
});
