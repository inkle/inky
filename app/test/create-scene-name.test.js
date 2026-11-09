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

    ["game.yaml", "x.txt", "x.json", "game.yaml.ink", "another.yml.ink", "GAME.YAML.INK", "folder/game.yaml"].forEach(name => {
        it(`refuses "${name}" without touching disk or story.ink`, function () {
            assert.strictEqual(create(name, true), false);
            assert.deepStrictEqual(messages, [REFUSAL]);
            assert.deepStrictEqual(listing(), []);
            assert.deepStrictEqual(includes, []);
        });
    });

    it('turns "scene" into scene.ink', function () {
        assert.strictEqual(create("scene", true), true);
        assert.deepStrictEqual(listing(), ["scene.ink"]);
        assert.deepStrictEqual(includes, ["scene.ink"]);
    });

    ["scene.ink", "SCENE.INK"].forEach(name => {
        it(`accepts "${name}"`, function () {
            assert.strictEqual(create(name, false), true);
            assert.deepStrictEqual(listing(), [name]);
            assert.deepStrictEqual(messages, []);
        });
    });

    it('accepts a dotted folder name: "chapter.1/scene"', function () {
        assert.strictEqual(create("chapter.1/scene", true), true);
        assert.ok(fs.existsSync(path.join(root, "chapter.1", "scene.ink")));
        assert.deepStrictEqual(includes, ["chapter.1/scene.ink"]);
        assert.deepStrictEqual(messages, []);
    });
});
