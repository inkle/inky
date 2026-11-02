const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

// Minimal stand-in for the editor document. The real InkFile needs the Ace
// editor, which only exists in the Electron window; this keeps the path and
// project wiring the constructor relies on.
class FakeInkFile {
    constructor(anyPath, mainInkFile, isBrandNew, inkMode, events) {
        anyPath = anyPath || "Untitled.ink";
        this.events = events;
        this.inkMode = inkMode;
        this.includes = [];
        this.text = "";
        this.isInkFile = false;
        this.isYamlFile = false;
        if( path.isAbsolute(anyPath) ) {
            if( mainInkFile ) {
                this.relPath = path.relative(mainInkFile.projectDir, anyPath);
            } else {
                this.relPath = path.basename(anyPath);
                this.projectDir = path.dirname(anyPath);
            }
        } else {
            this.relPath = anyPath;
        }
    }
    relativePath() { return this.relPath; }
    absolutePath() { return this.projectDir ? path.join(this.projectDir, this.relPath) : this.relPath; }
    setValue(text) { this.text = text; }
    getValue() { return this.text; }
}

// chokidar is replaced by this: the project registers its handlers, the test
// fires the events it wants to exercise.
function makeWatcher() {
    const handlers = {};
    return {
        on(event, callback) {
            (handlers[event] = handlers[event] || []).push(callback);
            return this;
        },
        close() {},
        emit(event, ...args) {
            (handlers[event] || []).forEach(callback => callback(...args));
        }
    };
}

// Runs the real InkProject.renameProjectItem / deleteProjectItem against a
// temporary folder, with the editor, compiler and Electron pieces stubbed out.
describe("project Explorer rename and delete", function () {
    const rendererDir = path.join(__dirname, "../renderer");
    const inkProjectPath = path.join(rendererDir, "inkProject.js");
    const realLoad = Module._load;
    let InkProject;
    const folders = [];
    const compilerUpdates = [];
    let watcher = null;

    before(function () {
        const stub = new Proxy(function () {}, {
            get: (target, key) => key === "__esModule" ? false : stub,
            apply: () => stub,
            construct: () => stub
        });
        Module._load = function (request, parent, ...rest) {
            if( parent && parent.filename === inkProjectPath ) {
                if( request === "fs" || request === "path" ) return realLoad.call(this, request, parent, ...rest);
                if( request === "./gameStyle.js" || request === "./projectFileName.js"
                    || request === "./imageTypes.js" || request === "./audioTags.js" )
                    return realLoad.call(this, path.join(rendererDir, request), parent, ...rest);
                if( request === "lodash" ) return {
                    find: (list, test) => list.find(test),
                    filter: (list, test) => list.filter(test),
                    isString: value => typeof value === "string"
                };
                if( request === "./liveCompiler.js" )
                    return { LiveCompiler: { projectFilesChanged: () => compilerUpdates.push(true) } };
                if( request === "./inkFile.js" ) return { InkFile: FakeInkFile };
                if( request === "chokidar" ) return { watch: () => (watcher = makeWatcher()) };
                return { ipcRenderer: stub, EditorView: stub, NavView: stub, InkFile: stub, LiveCompiler: stub,
                    PlayerView: stub, InkMode: stub, buildWebExport: stub, ImageViewer: stub };
            }
            return realLoad.call(this, request, parent, ...rest);
        };
        delete require.cache[inkProjectPath];
        InkProject = require(inkProjectPath).InkProject;
    });

    after(function () {
        Module._load = realLoad;
        delete require.cache[inkProjectPath];
        folders.forEach(folder => fs.rmSync(folder, { recursive: true, force: true }));
    });

    function makeProject(files) {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-rename-"));
        folders.push(root);
        const project = Object.create(InkProject.prototype);
        Object.assign(project, { files: [], unsavedFiles: [], hasUnsavedChanges: false, saveActive: false });
        project.refreshIncludes = project.refreshUnsavedChanges = project.showInkFile = project.sortFileList = () => {};
        Object.keys(files).forEach(rel => {
            fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
            fs.writeFileSync(path.join(root, rel), files[rel]);
            project.files.push({
                relPath: rel.split("/").join(path.sep), text: files[rel],
                isInkFile: rel.endsWith(".ink"), isYamlFile: /\.ya?ml$/.test(rel),
                hasUnsavedChanges: false, justSaved: false, symbols: null,
                getValue() { return this.text; },
                setValue(text) { this.text = text; this.hasUnsavedChanges = true; },
                relativePath() { return this.relPath; },
                absolutePath() { return path.join(root, this.relPath); }
            });
        });
        project.mainInk = project.files[0];
        project.mainInk.projectDir = root;
        project.activeInkFile = project.mainInk;
        return { project, root };
    }
    const documentAt = (project, rel) => project.files.find(file => file.relPath === rel.split("/").join(path.sep));

    it("builds a project from its folder and tracks the sound and picture files", function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-construct-"));
        folders.push(root);
        fs.writeFileSync(path.join(root, "main.ink"), "Hi\n");
        fs.writeFileSync(path.join(root, "game.yaml"), "title: x\n");
        InkProject.events.didSwitchToInkFile = () => {};

        const project = new InkProject(path.join(root, "main.ink"));

        assert.strictEqual(project.mainInk.projectDir, root);
        assert.deepStrictEqual(project.files.map(file => file.relPath), ["main.ink", "game.yaml"]);

        project.noteImageFiles(["images/hero.png", "notas.txt"]);
        assert.deepStrictEqual(Array.from(project.imageFiles), ["images/hero.png"]);

        watcher.emit("add", path.join(root, "audio", "tema.mp3"));
        assert.deepStrictEqual(Array.from(project.audioFiles), ["audio/tema.mp3"]);
        watcher.emit("unlink", path.join(root, "audio", "tema.mp3"));
        assert.deepStrictEqual(Array.from(project.audioFiles), []);
    });

    it("refreshes the live compiler when the first save assigns a project folder", function () {
        const mainInk = {
            projectDir: null,
            save(callback) { this.projectDir = "/tmp/inky-first-save"; callback(true); },
            absolutePath() { return this.projectDir ? path.join(this.projectDir, "story.ink") : null; }
        };
        const unsavedFiles = [];
        unsavedFiles.remove = file => {
            const index = unsavedFiles.indexOf(file);
            if( index !== -1 ) unsavedFiles.splice(index, 1);
        };
        const project = Object.create(InkProject.prototype);
        Object.assign(project, {
            mainInk,
            files: [mainInk],
            unsavedFiles,
            saveCompletionCallbacks: [],
            saveActive: false,
            refreshUnsavedChanges() {},
            startFileWatching() {}
        });
        InkProject.events.didSave = () => {};
        const updatesBeforeSave = compilerUpdates.length;

        project.save(success => assert.strictEqual(success, true));

        assert.strictEqual(compilerUpdates.length, updatesBeforeSave + 1);
    });

    it("rewrites INCLUDE lines whose path contains spaces", function () {
        const { project } = makeProject({ "main.ink": "INCLUDE cena do lago.ink\nHi\n", "cena do lago.ink": "x\n" });
        assert.strictEqual(project.renameProjectItem("file", "cena do lago.ink", "final").ok, true);
        assert.strictEqual(project.mainInk.text, "INCLUDE final.ink\nHi\n");

        const spaced = makeProject({ "main.ink": "INCLUDE a.ink\n", "a.ink": "x\n" });
        spaced.project.renameProjectItem("file", "a.ink", "minha cena");
        assert.strictEqual(spaced.project.mainInk.text, "INCLUDE minha cena.ink\n");
        spaced.project.renameProjectItem("file", "minha cena.ink", "outra");
        assert.strictEqual(spaced.project.mainInk.text, "INCLUDE outra.ink\n");

        const folder = makeProject({ "main.ink": "INCLUDE meus capitulos/c1.ink\n", "meus capitulos/c1.ink": "x\n" });
        assert.strictEqual(folder.project.renameProjectItem("folder", "meus capitulos", "caps").ok, true);
        assert.strictEqual(folder.project.mainInk.text, "INCLUDE caps/c1.ink\n");
    });

    it("keeps trailing comments, CRLF line endings and unrelated INCLUDE lines", function () {
        const { project } = makeProject({
            "main.ink": "INCLUDE a.ink // old\r\nINCLUDE  a.ink\t\r\nINCLUDE ab.ink\r\nINCLUDE a.ink.bak\r\n",
            "a.ink": "x\n", "ab.ink": "y\n"
        });
        project.renameProjectItem("file", "a.ink", "b");
        assert.strictEqual(project.mainInk.text,
            "INCLUDE b.ink // old\r\nINCLUDE  b.ink\t\r\nINCLUDE ab.ink\r\nINCLUDE a.ink.bak\r\n");
    });

    it("undoes the whole rename when a write fails halfway", function () {
        const { project, root } = makeProject({ "main.ink": "INCLUDE a.ink\n", "a.ink": "x\n" });
        const realWrite = fs.writeFileSync;
        fs.writeFileSync = function (file, ...rest) {
            if( String(file).endsWith("main.ink") ) throw new Error("disk full");
            return realWrite.call(this, file, ...rest);
        };
        let result;
        try { result = project.renameProjectItem("file", "a.ink", "b"); }
        finally { fs.writeFileSync = realWrite; }
        assert.strictEqual(result.ok, false);
        assert.ok(fs.existsSync(path.join(root, "a.ink")));
        assert.ok(!fs.existsSync(path.join(root, "b.ink")));
        assert.ok(documentAt(project, "a.ink"), "the document must point at its original path again");
        assert.strictEqual(project.mainInk.text, "INCLUDE a.ink\n");
    });

    it("refuses unsafe or conflicting renames and keeps the typed extension", function () {
        const { project, root } = makeProject({ "main.ink": "x\n", "a.ink": "1\n", "b.ink": "2\n", "game.yaml": "k: 1\n" });
        assert.strictEqual(project.renameProjectItem("file", "a.ink", "b").ok, false);
        assert.strictEqual(project.renameProjectItem("file", "a.ink", "x/y").ok, false);
        assert.strictEqual(project.renameProjectItem("file", "a.ink", "bad?").ok, false);
        assert.strictEqual(project.renameProjectItem("file", "a.ink", "novo.INK").ok, true);
        assert.ok(fs.existsSync(path.join(root, "novo.ink")));
    });

    it("lets the writer rename game.yaml and remembers the new name", function () {
        const GameStyle = require(path.join(rendererDir, "gameStyle.js")).GameStyle;
        const { project, root } = makeProject({ "main.ink": "x\n", "game.yaml": "theme: dark\n" });
        assert.strictEqual(path.basename(GameStyle.entryFilePathFor(project)), "game.yaml");

        const result = project.renameProjectItem("file", "game.yaml", "floresta");
        assert.strictEqual(result.ok, true);
        assert.ok(fs.existsSync(path.join(root, "floresta.yaml")));
        assert.ok(!fs.existsSync(path.join(root, "game.yaml")));
        assert.strictEqual(path.basename(GameStyle.entryFilePathFor(project)), "floresta.yaml");
        assert.ok(GameStyle.isActiveStylePath(project, path.join(root, "floresta.yaml")));

        // Another YAML file in the folder does not take over, even without a pointer to follow.
        fs.writeFileSync(path.join(root, "notas.yaml"), "a: 1\n");
        assert.strictEqual(path.basename(GameStyle.entryFilePathFor(project)), "floresta.yaml");

        // Back to the default name: no pointer is needed any more.
        assert.strictEqual(project.renameProjectItem("file", "floresta.yaml", "game").ok, true);
        assert.strictEqual(path.basename(GameStyle.entryFilePathFor(project)), "game.yaml");
        assert.ok(!fs.existsSync(path.join(root, GameStyle.POINTER_FILE)));
    });

    it("undoes a style file rename, pointer included, when a write fails", function () {
        const GameStyle = require(path.join(rendererDir, "gameStyle.js")).GameStyle;
        const { project, root } = makeProject({ "main.ink": "x\n", "game.yaml": "theme: dark\n" });
        const realWrite = fs.writeFileSync;
        fs.writeFileSync = function (file, ...rest) {
            if( String(file).endsWith("estilo.yaml") ) throw new Error("disk full");
            return realWrite.call(this, file, ...rest);
        };
        let result;
        try { result = project.renameProjectItem("file", "game.yaml", "estilo"); }
        finally { fs.writeFileSync = realWrite; }
        assert.strictEqual(result.ok, false);
        assert.ok(fs.existsSync(path.join(root, "game.yaml")));
        assert.ok(!fs.existsSync(path.join(root, "estilo.yaml")));
        assert.ok(!fs.existsSync(path.join(root, GameStyle.POINTER_FILE)));
        assert.strictEqual(path.basename(GameStyle.entryFilePathFor(project)), "game.yaml");
    });

    it("finds a renamed style file again when the pointer file is missing", function () {
        const GameStyle = require(path.join(rendererDir, "gameStyle.js")).GameStyle;
        const { project, root } = makeProject({ "main.ink": "x\n", "meu-jogo.yaml": "theme: dark\nfont:\n  size: 20\n" });
        assert.strictEqual(path.basename(GameStyle.entryFilePathFor(project)), "meu-jogo.yaml");
        // A YAML file that is not a style file is never taken for one.
        const other = makeProject({ "main.ink": "x\n", "notas.yaml": "autor: eu\n" });
        assert.strictEqual(path.basename(GameStyle.entryFilePathFor(other.project)), "game.yaml");
    });

    it("never deletes the main story, game.yaml or anything outside the project", function () {
        const { project, root } = makeProject({ "main.ink": "x\n", "game.yaml": "a: 1\n", "sub/s.ink": "y\n" });
        assert.strictEqual(project.deleteProjectItem("file", "main.ink").ok, false);
        assert.strictEqual(project.deleteProjectItem("file", "game.yaml").ok, false);
        // A renamed style file is protected too.
        assert.strictEqual(project.renameProjectItem("file", "game.yaml", "estilo").ok, true);
        assert.strictEqual(project.deleteProjectItem("file", "estilo.yaml").ok, false);
        assert.strictEqual(project.deleteProjectItem("file", "../x").ok, false);
        assert.strictEqual(project.deleteProjectItem("folder", "sub").ok, true);
        assert.ok(!fs.existsSync(path.join(root, "sub")));
        assert.ok(!documentAt(project, "sub/s.ink"));
    });

    it("drops deleted documents from the unsaved list and leaves symlink targets alone", function () {
        const { project } = makeProject({ "main.ink": "x\n", "a.ink": "y\n" });
        const unsaved = documentAt(project, "a.ink");
        unsaved.hasUnsavedChanges = true;
        project.unsavedFiles = [unsaved];
        project.activeInkFile = unsaved;
        let shown = null;
        project.showInkFile = file => { shown = file; };
        assert.strictEqual(project.deleteProjectItem("file", "a.ink").ok, true);
        assert.strictEqual(project.unsavedFiles.length, 0);
        assert.strictEqual(shown, project.mainInk);

        const outside = fs.mkdtempSync(path.join(os.tmpdir(), "inky-outside-"));
        folders.push(outside);
        fs.writeFileSync(path.join(outside, "precious.txt"), "keep");
        const withLink = makeProject({ "main.ink": "x\n", "box/b.ink": "y\n" });
        fs.symlinkSync(outside, path.join(withLink.root, "box", "link"));
        assert.strictEqual(withLink.project.deleteProjectItem("folder", "box/link").ok, false);
        withLink.project.deleteProjectItem("folder", "box");
        assert.ok(fs.existsSync(path.join(outside, "precious.txt")));
    });
    describe("moving items into another folder", function () {
        function makeMoveProject(extra) {
            const files = Object.assign({
                "main.ink": "INCLUDE scenes/a.ink\nINCLUDE scenes/sub/b.ink\n-> a",
                "scenes/a.ink": "=== a ===\n-> b",
                "scenes/sub/b.ink": "=== b ===\n-> END",
                "game.yaml": "title: x",
                "other/keep.ink": "// keep"
            }, extra || {});
            const made = makeProject(files);
            made.project.audioFiles = new Set(["audio/dark.mp3", "audio/sub/x.ogg"]);
            made.project.imageFiles = new Set(["hero.jpg"]);
            ["audio/dark.mp3", "audio/sub/x.ogg", "hero.jpg", "notes.txt"].forEach(rel => {
                fs.mkdirSync(path.dirname(path.join(made.root, rel)), { recursive: true });
                fs.writeFileSync(path.join(made.root, rel), Buffer.from([0, 255, 1, 254]));
            });
            fs.mkdirSync(path.join(made.root, "empty"), { recursive: true });
            return made;
        }
        const move = (project, type, rel, folder) => project.renameProjectItem(type, rel, null, { moveToFolder: folder });

        it("moves an Ink scene and rewrites the INCLUDE that points at it", function () {
            const { project, root } = makeMoveProject();
            const result = move(project, "file", "scenes/a.ink", "other");
            assert.strictEqual(result.ok, true, result.error);
            assert.strictEqual(result.newRelativePath, "other/a.ink");
            assert.ok(fs.existsSync(path.join(root, "other", "a.ink")));
            assert.ok(!fs.existsSync(path.join(root, "scenes", "a.ink")));
            assert.match(fs.readFileSync(path.join(root, "main.ink"), "utf8"), /INCLUDE other\/a\.ink\nINCLUDE scenes\/sub\/b\.ink/);
            assert.strictEqual(documentAt(project, "other/a.ink").relativePath(), "other/a.ink".split("/").join(path.sep));
        });

        it("moves a whole folder and every INCLUDE below it, to the project folder too", function () {
            const { project, root } = makeMoveProject();
            const result = move(project, "folder", "scenes/sub", "");
            assert.strictEqual(result.ok, true, result.error);
            assert.strictEqual(result.newRelativePath, "sub");
            assert.ok(fs.existsSync(path.join(root, "sub", "b.ink")));
            assert.match(fs.readFileSync(path.join(root, "main.ink"), "utf8"), /INCLUDE sub\/b\.ink/);
            assert.strictEqual(documentAt(project, "sub/b.ink") !== undefined, true);
        });

        it("moves sound, picture and other files without touching their bytes, and follows the lists", function () {
            const { project, root } = makeMoveProject();
            assert.strictEqual(move(project, "file", "audio/dark.mp3", "other").ok, true);
            assert.strictEqual(move(project, "file", "hero.jpg", "empty").ok, true);
            assert.strictEqual(move(project, "file", "notes.txt", "other").ok, true);
            assert.deepStrictEqual(Array.from(fs.readFileSync(path.join(root, "other", "dark.mp3"))), [0, 255, 1, 254]);
            assert.deepStrictEqual(Array.from(fs.readFileSync(path.join(root, "empty", "hero.jpg"))), [0, 255, 1, 254]);
            assert.ok(fs.existsSync(path.join(root, "other", "notes.txt")));
            assert.deepStrictEqual(Array.from(project.audioFiles).sort(), ["audio/sub/x.ogg", "other/dark.mp3"]);
            assert.deepStrictEqual(Array.from(project.imageFiles), ["empty/hero.jpg"]);

            const folderResult = move(project, "folder", "audio", "other");
            assert.strictEqual(folderResult.ok, true, folderResult.error);
            assert.deepStrictEqual(Array.from(project.audioFiles).sort(), ["other/audio/sub/x.ogg", "other/dark.mp3"]);
        });

        it("refuses what must not move and changes nothing", function () {
            const { project, root } = makeMoveProject();
            const before = fs.readFileSync(path.join(root, "main.ink"), "utf8");
            assert.match(move(project, "file", "main.ink", "other").error, /main story/);
            assert.match(move(project, "file", "game.yaml", "other").error, /style file/);
            assert.match(move(project, "folder", "scenes", "scenes/sub").error, /into itself/);
            assert.match(move(project, "folder", "scenes", "scenes").error, /into itself/);
            assert.match(move(project, "file", "scenes/a.ink", "nowhere").error, /no longer exists/);
            assert.match(move(project, "file", "scenes/a.ink", "../outside").error, /inside the project/);
            assert.strictEqual(fs.readFileSync(path.join(root, "main.ink"), "utf8"), before);
            assert.strictEqual(move(project, "file", "scenes/a.ink", "scenes/sub").ok, true);
            assert.ok(fs.existsSync(path.join(root, "scenes", "sub", "a.ink")));
        });

        it("will not overwrite an item with the same name in the destination", function () {
            const { project, root } = makeMoveProject({ "other/a.ink": "// already here" });
            const result = move(project, "file", "scenes/a.ink", "other");
            assert.strictEqual(result.ok, false);
            assert.match(result.error, /already exists in the destination/);
            assert.strictEqual(fs.readFileSync(path.join(root, "other", "a.ink"), "utf8"), "// already here");
            assert.ok(fs.existsSync(path.join(root, "scenes", "a.ink")));
        });

        it("reports a move to the same place as unchanged", function () {
            const { project } = makeMoveProject();
            const result = move(project, "file", "scenes/a.ink", "scenes");
            assert.strictEqual(result.ok, true);
            assert.strictEqual(result.unchanged, true);
        });

        it("undoes the move, lists included, when a write fails halfway", function () {
            const { project, root } = makeMoveProject();
            const mainDocument = documentAt(project, "main.ink");
            const realSetValue = mainDocument.setValue;
            let failures = 1;   // the rewrite fails once; the undo that follows must still work
            mainDocument.setValue = function(text) {
                if( failures-- > 0 ) throw new Error("disk full");
                return realSetValue.call(this, text);
            };
            const result = move(project, "file", "scenes/a.ink", "other");
            mainDocument.setValue = realSetValue;
            assert.strictEqual(result.ok, false);
            assert.ok(fs.existsSync(path.join(root, "scenes", "a.ink")));
            assert.ok(!fs.existsSync(path.join(root, "other", "a.ink")));
            assert.deepStrictEqual(Array.from(project.audioFiles).sort(), ["audio/dark.mp3", "audio/sub/x.ogg"]);
        });
    });
});
