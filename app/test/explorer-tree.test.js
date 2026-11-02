const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ExplorerTree = require("../renderer/explorerTree.js");

const document = (relative, extra) => Object.assign({
    id: relative.length,
    isInkFile: relative.endsWith(".ink"),
    isYamlFile: relative.endsWith(".yaml"),
    relativePath: () => relative,
    filename: () => path.posix.basename(relative),
    hasUnsavedChanges: false,
    isLoading: false,
    isActive: false
}, extra || {});

const escapeHtml = value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

describe("Explorer tree data", function () {
    function build(overrides) {
        const main = document("main.ink");
        return ExplorerTree.buildExplorerNodes(Object.assign({
            mainInk: main,
            allFiles: [main, document("scenes/a.ink"), document("scenes/sub/b.ink"), document("game.yaml")],
            projectDir: "/work/Maré de Vidro",
            folders: ["audio", "empty", "scenes", "scenes/sub"],
            audioFiles: ["audio/dark.mp3"],
            imageFiles: ["hero.jpg"],
            openState: {},
            selectedIds: new Set(),
            playingAudioPath: null,
            escapeHtml: escapeHtml
        }, overrides || {}));
    }
    const byId = nodes => new Map(nodes.map(node => [node.id, node]));

    it("puts the project folder at the top and lists folders first, then files, alphabetically", function () {
        const nodes = build();
        assert.deepStrictEqual(nodes.map(node => node.id), [
            "root",
            "d:audio", "f:audio/dark.mp3",
            "d:empty",
            "d:scenes", "d:scenes/sub", "f:scenes/sub/b.ink", "f:scenes/a.ink",
            "f:game.yaml", "f:hero.jpg", "f:main.ink"
        ]);
        const nodesById = byId(nodes);
        assert.strictEqual(nodesById.get("root").parent, "#");
        assert.strictEqual(nodesById.get("root").data.root, true);
        assert.match(nodesById.get("root").text, />Maré de Vidro</);
        assert.strictEqual(nodesById.get("d:scenes/sub").parent, "d:scenes");
        assert.strictEqual(nodesById.get("f:scenes/a.ink").parent, "d:scenes");
        assert.strictEqual(nodesById.get("f:main.ink").parent, "root");
    });

    it("tells apart documents, styles, sounds and pictures, and keeps the main story once", function () {
        const nodesById = byId(build());
        assert.deepStrictEqual(["f:main.ink", "f:game.yaml", "f:audio/dark.mp3", "f:hero.jpg"].map(id => nodesById.get(id).data.kind),
            ["ink", "yaml", "audio", "image"]);
        assert.strictEqual(build().filter(node => node.id === "f:main.ink").length, 1);
        assert.strictEqual(nodesById.get("f:main.ink").data.fileId, "main.ink".length);
        assert.strictEqual(nodesById.get("f:audio/dark.mp3").data.fileId, null);
        assert.match(nodesById.get("f:audio/dark.mp3").a_attr.title, /click to listen/);
        assert.match(nodesById.get("f:hero.jpg").a_attr.title, /click to preview/);
        assert.strictEqual(nodesById.get("f:scenes/a.ink").a_attr["data-relative-path"], "scenes/a.ink");
    });

    it("carries open folders, the selection, unsaved/active/loading files and the sound being played", function () {
        const main = document("main.ink", { hasUnsavedChanges: true, isActive: true });
        const loading = document("scenes/a.ink", { isLoading: true });
        const nodesById = byId(build({
            mainInk: main,
            allFiles: [main, loading],
            openState: { "scenes": false, "": true },
            selectedIds: new Set(["f:scenes/a.ink", "d:audio"]),
            playingAudioPath: "audio/dark.mp3"
        }));
        assert.strictEqual(nodesById.get("d:scenes").state.opened, false);
        assert.strictEqual(nodesById.get("d:audio").state.opened, true);
        assert.strictEqual(nodesById.get("root").state.opened, true);
        assert.strictEqual(nodesById.get("f:scenes/a.ink").state.selected, true);
        assert.strictEqual(nodesById.get("d:audio").state.selected, true);
        assert.strictEqual(nodesById.get("f:main.ink").state.selected, false);
        assert.match(nodesById.get("f:main.ink").a_attr.class, /ex-unsaved/);
        assert.match(nodesById.get("f:main.ink").a_attr.class, /ex-active/);
        assert.match(nodesById.get("f:scenes/a.ink").a_attr.class, /ex-loading/);
        assert.match(nodesById.get("f:audio/dark.mp3").a_attr.class, /ex-playing/);
        assert.doesNotMatch(nodesById.get("f:hero.jpg").a_attr.class, /ex-playing/);
    });

    it("keeps the .ink extension visible on its own and escapes every name", function () {
        const evil = document("scenes/<b>&x.ink");
        const nodesById = byId(build({ allFiles: [document("main.ink"), evil], folders: ["scenes", "a<i>"] }));
        const text = nodesById.get("f:scenes/<b>&x.ink").text;
        assert.match(text, /<span class="filename-stem">&lt;b&gt;&amp;x<\/span><span class="filename-extension">\.ink<\/span>/);
        assert.doesNotMatch(text, /<b>/);
        assert.doesNotMatch(nodesById.get("d:a<i>").text, /<i>/);
        assert.match(nodesById.get("f:game.yaml") ? nodesById.get("f:game.yaml").text : '<span class="filename">game.yaml</span>', /game\.yaml/);
    });

    it("lists folders that hold nothing, and the files of folders that are not on disk", function () {
        const nodesById = byId(build({ folders: ["empty"], allFiles: [document("main.ink"), document("deep/er/c.ink")] }));
        assert.ok(nodesById.has("d:empty"));
        assert.strictEqual(nodesById.get("d:deep/er").parent, "d:deep");
        assert.strictEqual(nodesById.get("f:deep/er/c.ink").parent, "d:deep/er");
    });
});

describe("Explorer tree rules", function () {
    const node = (type, itemPath, extra) => Object.assign({ id: type === "folder" ? "d:" + itemPath : "f:" + itemPath, data: { type: type, path: itemPath, name: path.posix.basename(itemPath), kind: type === "folder" ? "folder" : "ink" } }, extra || {});

    it("sends a drop to the folder under it, the folder of the file under it, or the project folder", function () {
        assert.strictEqual(ExplorerTree.dropFolderOf(node("folder", "scenes/sub")), "scenes/sub");
        assert.strictEqual(ExplorerTree.dropFolderOf(node("file", "scenes/a.ink")), "scenes");
        assert.strictEqual(ExplorerTree.dropFolderOf(node("file", "main.ink")), "");
        assert.strictEqual(ExplorerTree.dropFolderOf({ id: "root", data: { type: "folder", root: true, path: "" } }), "");
        assert.strictEqual(ExplorerTree.dropFolderOf({ id: "#" }), "");
        assert.strictEqual(ExplorerTree.dropFolderOf(null), "");
    });

    it("never lets a folder go into itself or its own sub-folders", function () {
        const scenes = { type: "folder", path: "scenes" };
        assert.strictEqual(ExplorerTree.canMoveInto([scenes], "scenes"), false);
        assert.strictEqual(ExplorerTree.canMoveInto([scenes], "scenes/sub"), false);
        assert.strictEqual(ExplorerTree.canMoveInto([scenes], "scenes-other"), true);
        assert.strictEqual(ExplorerTree.canMoveInto([scenes], ""), true);
        assert.strictEqual(ExplorerTree.canMoveInto([{ type: "file", path: "scenes/a.ink" }], "scenes"), true);
        assert.strictEqual(ExplorerTree.canMoveInto([], ""), false);
    });

    it("hands the rest of the app an item, and nothing for the project folder or a row being typed", function () {
        const item = ExplorerTree.nodeTarget({ id: "f:x.mp3", data: { type: "file", kind: "audio", path: "x.mp3", name: "x.mp3", fileId: null } });
        assert.deepStrictEqual(item, { type: "file", path: "x.mp3", name: "x.mp3", fileId: null, audio: true });
        assert.strictEqual(ExplorerTree.nodeTarget({ id: "root", data: { root: true, type: "folder", path: "" } }), null);
        assert.strictEqual(ExplorerTree.nodeTarget({ id: "pending-create", data: { pending: true, type: "file" } }), null);
        assert.strictEqual(ExplorerTree.nodeTarget(null), null);
        assert.strictEqual(ExplorerTree.targetNodeId({ type: "folder", path: "a/b" }), "d:a/b");
        assert.strictEqual(ExplorerTree.targetNodeId({ type: "file", path: "a/b.ink" }), "f:a/b.ink");
    });
});

describe("Explorer folder scan", function () {
    it("finds nested and empty folders, and skips .git, node_modules and links", function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-explorer-scan-"));
        try {
            ["a/b", "empty", ".git/objects", "node_modules/x", "c"].forEach(dir => fs.mkdirSync(path.join(root, ...dir.split("/")), { recursive: true }));
            fs.writeFileSync(path.join(root, "a", "file.txt"), "x");
            try { fs.symlinkSync(path.join(root, "c"), path.join(root, "link-to-c")); } catch(error) { /* no symlinks here */ }
            assert.deepStrictEqual(ExplorerTree.scanFolders(root).sort(), ["a", "a/b", "c", "empty"]);
            assert.deepStrictEqual(ExplorerTree.scanFolders(path.join(root, "missing")), []);
            assert.deepStrictEqual(ExplorerTree.scanFolders(null), []);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
