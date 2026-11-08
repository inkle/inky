const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { JSDOM } = require("jsdom");
const ink = require("inkjs");
const { buildWebExport } = require("../renderer/webExporter.js");

describe("web export bundle", function () {
    it("lists every exported file and plays a story through its ending", async function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-web-bundle-"));
        let dom;
        try {
            const compiled = path.join(root, "compiled.json");
            const output = path.join(root, "web");
            const story = new ink.Compiler("Hello, reader.\n* [Continue]\n  Farewell, reader.\n  -> END\n").Compile();
            fs.writeFileSync(compiled, story.ToJson());
            const result = await buildWebExport({
                compiledJsonPath: compiled,
                targetDirectory: output,
                templateDirectory: path.join(__dirname, "../export-for-web-template"),
                inkRuntimePath: require.resolve("inkjs/dist/ink.js")
            });

            const endingPath = path.join(output, "ending-marker.js");
            assert.deepStrictEqual(fs.readFileSync(endingPath), fs.readFileSync(path.join(__dirname, "../renderer/endingMarker.js")));
            assert.ok(result.files.includes("ending-marker.js"));
            assert.deepStrictEqual([...result.files].sort(), fs.readdirSync(output).sort());

            const html = fs.readFileSync(path.join(output, "index.html"), "utf8");
            dom = new JSDOM(html, { url: "https://story.test/", runScripts: "outside-only" });
            dom.window.matchMedia = () => ({ matches: false });
            for (const script of dom.window.document.querySelectorAll("script[src]")) {
                dom.window.eval(fs.readFileSync(path.join(output, script.getAttribute("src")), "utf8"));
            }
            const document = dom.window.document;
            document.querySelector("#title-screen .choice-button").click();
            assert.match(document.querySelector("#story-passage").textContent, /Hello, reader/);
            const choice = document.querySelector("#story-choices .choice-button");
            assert.ok(choice);
            choice.click();
            assert.match(document.querySelector("#story-passage").textContent, /Farewell, reader/);
            assert.ok(document.querySelector(".story-ending"));
        } finally {
            if (dom) dom.window.close();
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
