const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

describe("Explorer createScene name rules", function () {
    const source = fs.readFileSync(path.join(__dirname, "../renderer/controller.js"), "utf8");
    const start = source.indexOf("createScene: (sceneName, addToMainInk) => {");
    const end = source.indexOf("// options.moveToFolder moves the item", start);
    const body = source.slice(start + "createScene: ".length, end).trim().replace(/,$/, "");
    const REFUSAL = "Scenes are .ink files. game.yaml is created by the Visual tab.";

    let root, messages, includes, create;

    beforeEach(function () {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-scene-"));
        messages = [];
        includes = [];
        const project = {
            mainInk: { projectDir: root, addIncludeLine: rel => includes.push(rel) },
            files: [],
            ensureProjectFile: () => null,
            refreshIncludes: () => {},
            showInkFile: () => {}
        };
        const NavView = {
            showMessage: m => messages.push(m),
            refreshFolders: () => {},
            setFiles: () => {}
        };
        create = new Function("InkProject", "NavView", "NavHistory", "fs", "path", "resolveContainedProjectPath",
            "return (" + body + ");")(
            { currentProject: project }, NavView, { addStep: () => {} }, fs, path,
            (r, name) => path.resolve(r, name));
    });

    afterEach(function () { fs.rmSync(root, { recursive: true, force: true }); });

    function listing() { return fs.readdirSync(root, { recursive: true }).sort(); }

    ["game.yaml", "x.txt", "x.json", "game.yaml.ink", "outro.yml.ink", "GAME.YAML.INK", "pasta/game.yaml"].forEach(name => {
        it(`refuses "${name}" without touching disk or story.ink`, function () {
            assert.strictEqual(create(name, true), false);
            assert.deepStrictEqual(messages, [REFUSAL]);
            assert.deepStrictEqual(listing(), []);
            assert.deepStrictEqual(includes, []);
        });
    });

    it('turns "cena" into cena.ink', function () {
        assert.strictEqual(create("cena", true), true);
        assert.deepStrictEqual(listing(), ["cena.ink"]);
        assert.deepStrictEqual(includes, ["cena.ink"]);
    });

    ["cena.ink", "CENA.INK"].forEach(name => {
        it(`accepts "${name}"`, function () {
            assert.strictEqual(create(name, false), true);
            assert.deepStrictEqual(listing(), [name]);
            assert.deepStrictEqual(messages, []);
        });
    });

    it('accepts a dotted folder name: "capitulo.1/cena"', function () {
        assert.strictEqual(create("capitulo.1/cena", true), true);
        assert.ok(fs.existsSync(path.join(root, "capitulo.1", "cena.ink")));
        assert.deepStrictEqual(includes, ["capitulo.1/cena.ink"]);
        assert.deepStrictEqual(messages, []);
    });
});
