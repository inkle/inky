"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { JSDOM } = require("jsdom");

const { FileReference } = require("../renderer/fileReference.js");

const offered = (tag, name) => ["dark.mp3", "capa.jpg", "vento forte.mp3"].indexOf(name) !== -1;
const insert = (row, column, text) => ({ action: "insert", start: { row, column }, end: { row, column: column + text.length }, lines: text.split("\n") });
const remove = (start, end) => ({ action: "remove", start, end, lines: [] });
const at = (row, column) => ({ row, column });
const allows = (lines, delta) => FileReference.allowsDelta(lines, delta, offered);

describe("file references (#image:, #music:, #sound:)", function () {
    describe("what counts as a reference", function () {
        it("finds the value of file tags, spaces included, up to the next tag", function () {
            const tags = FileReference.fileTags(["Texto #music: vento forte.mp3 #align: left", "#image: capa.jpg", "#sound: "]);
            assert.deepStrictEqual(tags.map(t => [t.row, t.tag, t.kind, t.start, t.end]), [
                [0, "music", "reference", 14, 29],
                [1, "image", "reference", 8, 16],
                [2, "sound", "empty", 8, 8]
            ]);
        });

        it("ignores other tags, comments and non-story lines", function () {
            assert.deepStrictEqual(FileReference.fileTags(["#title: Capa", "// #music: dark.mp3", "/* #image: capa.jpg */", "VAR x = 1 # image: capa.jpg"]), []);
        });

        it("counts stop as a reference too", function () {
            const tags = FileReference.fileTags(["#music: stop"]);
            assert.strictEqual(tags[0].kind, "reference");
        });

        it("finds the reference that ends at the cursor", function () {
            const lines = ["#music: dark.mp3 #align: left"];
            assert.strictEqual(FileReference.referenceEndingAt(lines, 0, 16).start, 8);
            assert.strictEqual(FileReference.referenceEndingAt(lines, 0, 15), null);
            assert.strictEqual(FileReference.referenceEndingAt(lines, 0, 17), null);
        });
    });

    describe("changes that are held back", function () {
        const lines = ["Texto", "#music: dark.mp3 #align: left"];

        it("never lets anything be typed, pasted or deleted inside a reference", function () {
            assert.strictEqual(allows(lines, insert(1, 12, "x")), false);
            assert.strictEqual(allows(lines, insert(1, 12, "dark.mp3")), false);
            assert.strictEqual(allows(lines, remove(at(1, 12), at(1, 13))), false);
            assert.strictEqual(allows(lines, remove(at(1, 15), at(1, 16))), false);
            assert.strictEqual(allows(lines, remove(at(1, 8), at(1, 9))), false);
            assert.strictEqual(allows(lines, remove(at(0, 3), at(1, 10))), false);
            assert.strictEqual(allows(lines, remove(at(1, 12), at(1, 24))), false);
        });

        it("does not let a reference grow at either end, but lets a space, a tag or a new line follow it", function () {
            assert.strictEqual(allows(lines, insert(1, 16, "x")), false);
            assert.strictEqual(allows(lines, insert(1, 8, "x")), false);
            assert.strictEqual(allows(lines, insert(1, 8, "\n")), false);
            assert.strictEqual(allows(lines, insert(1, 8, " ")), true);
            assert.strictEqual(allows(lines, insert(1, 16, " ")), true);
            assert.strictEqual(allows(lines, insert(1, 16, "#")), true);
            assert.strictEqual(allows(lines, insert(1, 16, "\nOutro")), true);
        });

        it("lets a whole reference, tag or line go, however it is selected", function () {
            assert.strictEqual(allows(lines, remove(at(1, 8), at(1, 16))), true);
            assert.strictEqual(allows(lines, remove(at(1, 0), at(1, 16))), true);
            assert.strictEqual(allows(lines, remove(at(0, 5), at(1, 16))), true);
            assert.strictEqual(allows(lines, remove(at(0, 0), at(2, 0))), true);
            assert.strictEqual(allows(lines, remove(at(1, 1), at(1, 7))), true, "the tag name is not part of the reference");
            assert.strictEqual(allows(lines, remove(at(1, 16), at(1, 17))), true, "the space after the reference");
        });

        it("allows incomplete file values to be edited and keeps supported file references atomic", function () {
            const waiting = ["#music: ", "#image: #align: left"];
            assert.strictEqual(allows(waiting, insert(0, 8, "d")), true);
            assert.strictEqual(allows(waiting, insert(0, 8, "dark")), true);
            assert.strictEqual(allows(waiting, insert(0, 8, "dark.mp3")), true);
            assert.strictEqual(allows(waiting, insert(0, 8, "vento forte.mp3")), true);
            assert.strictEqual(allows(waiting, insert(0, 8, "dark.mp3\nmais")), false);
            assert.strictEqual(allows(waiting, insert(0, 8, " ")), true);
            assert.strictEqual(allows(waiting, insert(1, 8, "capa.jpg")), true);
            assert.strictEqual(allows(waiting, insert(1, 8, "x")), true);
            assert.strictEqual(allows(["#music: removed.mp3"], insert(0, 11, "x")), false);
        });

        it("leaves every other change alone", function () {
            assert.strictEqual(allows(["Texto livre", "# title: Capa"], insert(0, 3, "x")), true);
            assert.strictEqual(allows(["#title: Capa"], insert(0, 8, "x")), true);
            assert.strictEqual(allows(["#music: dark.mp3", "Linha"], insert(1, 2, "x")), true);
            assert.strictEqual(allows(["// #music: dark.mp3"], insert(0, 14, "x")), true);
            assert.strictEqual(allows(["#music: dark.mp3"], insert(0, 0, "x")), true, "before the tag itself");
            assert.strictEqual(allows(["Texto"], insert(0, 5, "#music: ")), true);
        });
    });

    describe("in the editor", function () {
        const SRC = path.join(__dirname, "..", "renderer");
        let projectDir, window, editor, TagPicker, inkCompleter, TagFormat;

        before(function () {
            projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "inky-reference-"));
            fs.mkdirSync(path.join(projectDir, "audio"));
            fs.mkdirSync(path.join(projectDir, "images"));
            fs.writeFileSync(path.join(projectDir, "audio", "dark.mp3"), "");
            fs.writeFileSync(path.join(projectDir, "audio", "tema.mp3"), "");
            fs.writeFileSync(path.join(projectDir, "audio", "vento forte.mp3"), "");
            fs.writeFileSync(path.join(projectDir, "audio", "porta.wav"), "");
            fs.writeFileSync(path.join(projectDir, "images", "capa.jpg"), "");

            const dom = new JSDOM('<!doctype html><body><div id="editor" style="width:600px;height:400px"></div></body>', { runScripts: "outside-only", pretendToBeVisual: true });
            window = dom.window;
            window.eval(fs.readFileSync(path.join(SRC, "acesrc", "ace.js"), "utf8"));
            window.eval(fs.readFileSync(path.join(SRC, "acesrc", "ext-language_tools.js"), "utf8"));
            editor = window.ace.edit("editor");
            editor.$blockScrolling = Infinity;
            editor.setOptions({ enableBasicAutocompletion: true, enableLiveAutocompletion: true });
            inkCompleter = require("../renderer/inkCompleter.js").inkCompleter;
            TagPicker = require("../renderer/tagPicker.js").TagPicker;
            TagFormat = require("../renderer/tagFormat.js").TagFormat;
            inkCompleter.getProjectDir = () => projectDir;
            editor.completers.push(inkCompleter);
            TagPicker.install(editor, inkCompleter);
            FileReference.install(editor, inkCompleter);
            editor.on("beforeEndOperation", () => {
                if( editor.curOp && editor.curOp.docChanged && !editor.session.$fromUndo ) TagFormat.fixDocument(editor.session.doc);
            });
        });

        after(function () {
            fs.rmSync(projectDir, { recursive: true, force: true });
        });

        const tick = () => new Promise(resolve => setImmediate(() => setTimeout(resolve, 25)));
        const type = async text => { for( const ch of text ) { editor.keyBinding.onTextInput(ch); await tick(); } };
        const press = async (keyCode, hashId) => { editor.keyBinding.onCommandKey({ preventDefault() {}, stopPropagation() {} }, hashId || 0, keyCode); await tick(); };
        const BACKSPACE = 8, TAB = 9, DELETE = 46, ESC = 27;
        const listOpen = () => !!(editor.completer && editor.completer.activated);
        const listValues = () => Array.from(editor.completer.completions.filtered, item => item.value);
        const pick = async value => {
            const completer = editor.completer;
            completer.popup.setRow(completer.completions.filtered.findIndex(item => item.value === value));
            completer.insertMatch();
            await tick();
        };
        const start = async text => {
            if( editor.completer && editor.completer.activated ) editor.completer.detach();
            editor.session.$fromUndo = true;
            editor.setValue(text, 1);
            editor.session.$fromUndo = false;
            editor.session.getUndoManager().reset();
            editor.navigateFileEnd();
            await tick();
            if( editor.completer && editor.completer.activated ) editor.completer.detach();
        };

        it("opens filtered file values while an incomplete reference is edited", async function () {
            await start("Texto\n");
            await type("#music: ");
            assert.ok(listOpen());
            assert.ok(listValues().includes("dark.mp3"));
            await type("d");
            assert.strictEqual(editor.getValue(), "Texto\n#music: d");
            assert.ok(listOpen(), "the list filters while the value is being typed");
            await pick("dark.mp3");
            assert.strictEqual(editor.getValue(), "Texto\n#music: dark.mp3");
            assert.ok(!listOpen());
        });

        it("keeps a completed file reference atomic", async function () {
            await start("Texto\n#music: dark.mp3");
            editor.moveCursorTo(1, 12);
            await type("Z");
            assert.strictEqual(editor.getValue(), "Texto\n#music: dark.mp3");
            await press(BACKSPACE);
            assert.strictEqual(editor.getValue(), "Texto\n#music: ");
            assert.ok(listOpen());
            await start("Texto\n#music: dark.mp3");
            editor.moveCursorTo(1, 12);
            await press(DELETE);
            assert.strictEqual(editor.getValue(), "Texto\n#music: ");
            assert.ok(!listOpen(), "no list pops up for a change that did not happen");
        });

        it("Backspace removes the whole reference and shows the list again", async function () {
            await start("Texto\n#music: dark.mp3");
            await press(BACKSPACE);
            assert.strictEqual(editor.getValue(), "Texto\n#music: ");
            assert.ok(listOpen());
            assert.deepStrictEqual(listValues(), ["stop", "dark.mp3", "porta.wav", "tema.mp3", "vento forte.mp3"]);
            await pick("tema.mp3");
            assert.strictEqual(editor.getValue(), "Texto\n#music: tema.mp3");
        });

        it("works with another tag after the reference, and with #image:", async function () {
            await start("#music: dark.mp3 #align: left\n#image: capa.jpg");
            editor.moveCursorTo(0, 16);
            await press(BACKSPACE);
            assert.strictEqual(editor.getValue(), "#music: #align: left\n#image: capa.jpg");
            assert.ok(listOpen());
            editor.completer.detach();
            editor.moveCursorTo(1, 16);
            await press(BACKSPACE);
            assert.strictEqual(editor.getValue(), "#music: #align: left\n#image: ");
            assert.deepStrictEqual(listValues(), ["images/capa.jpg"]);
        });

        it("still lets whole lines and selections that cover a reference be deleted, and undo and redo work", async function () {
            await start("A\n#image: capa.jpg\n#sound: dark.mp3\nFim");
            editor.moveCursorTo(1, 0);
            editor.selection.selectTo(2, 0);
            await press(BACKSPACE);
            assert.strictEqual(editor.getValue(), "A\n#sound: dark.mp3\nFim");

            editor.selectAll();
            await press(BACKSPACE);
            assert.strictEqual(editor.getValue(), "");
            editor.undo();
            await tick();
            assert.strictEqual(editor.getValue(), "A\n#sound: dark.mp3\nFim");
            editor.redo();
            await tick();
            assert.strictEqual(editor.getValue(), "");
        });

        it("lets a selection delete part of a reference using normal editor behavior", async function () {
            await start("A\n#image: capa.jpg\nFim");
            editor.moveCursorTo(1, 10);
            editor.selection.selectTo(1, 14);
            await type("x");
            await press(BACKSPACE);
            assert.strictEqual(editor.getValue(), "A\n#image: capg\nFim");
        });

        it("deletes closed values and tags atomically through E0, E1, E2 and E3", async function () {
            await start("#music: vento forte.mp3");
            editor.moveCursorTo(0, 13);
            await press(BACKSPACE);
            assert.strictEqual(editor.getValue(), "#music: ");
            assert.ok(listOpen());
            assert.ok(listValues().includes("vento forte.mp3"));
            await press(BACKSPACE);
            assert.strictEqual(editor.getValue(), "#");
            assert.ok(listOpen());
            assert.ok(listValues().some(value => value.startsWith("music: ")));
            await press(BACKSPACE);
            assert.strictEqual(editor.getValue(), "");
            assert.ok(!listOpen());

            await start("#music: arquivo-removido.mp3");
            editor.moveCursorTo(0, 12);
            await press(BACKSPACE);
            assert.strictEqual(editor.getValue(), "#music: ");
            assert.ok(listOpen());

            await start("#align: center");
            editor.moveCursorTo(0, 11);
            await press(BACKSPACE);
            assert.strictEqual(editor.getValue(), "#align: ");
            assert.deepStrictEqual(listValues(), ["left", "center", "right"]);
            await press(BACKSPACE);
            assert.strictEqual(editor.getValue(), "#");
            await press(BACKSPACE);
            assert.strictEqual(editor.getValue(), "");
        });

        it("keeps invalid values editable and reopens their filtered list after Esc", async function () {
            await start("#align: cen");
            editor.moveCursorTo(0, 11);
            await press(TAB);
            assert.ok(listOpen());
            await press(ESC);
            assert.ok(!listOpen());
            assert.strictEqual(editor.getValue(), "#align: cen");
            await press(BACKSPACE);
            assert.strictEqual(editor.getValue(), "#align: ce");
            assert.ok(listOpen());
        });

        it("Tab opens value lists after handwritten tags missing the space", async function () {
            await start("#align:");
            await press(TAB);
            assert.strictEqual(editor.getValue(), "#align: ");
            assert.deepStrictEqual(listValues(), ["left", "center", "right"]);

            await start("#music:");
            await press(TAB);
            assert.strictEqual(editor.getValue(), "#music: ");
            assert.ok(listValues().includes("dark.mp3"));
        });

        it("Esc hides value and tag lists without changing text in each tag state", async function () {
            const cases = [
                { text: "#align: center", open: () => {
                    editor.moveCursorTo(0, 8);
                    editor.execCommand("startAutocomplete");
                } },
                { text: "#align: ", open: () => press(TAB) },
                { text: "#", open: () => press(TAB) },
                { text: "#align: ce", open: () => press(TAB) }
            ];
            for( const item of cases ) {
                await start(item.text);
                await item.open();
                await tick();
                assert.ok(listOpen(), item.text + " opens a list");
                await press(ESC);
                assert.ok(!listOpen(), item.text + " list is hidden");
                assert.strictEqual(editor.getValue(), item.text);
            }
            await start("words normal");
            await press(ESC);
            assert.strictEqual(editor.getValue(), "words normal");
            assert.ok(!listOpen());
        });

        it("removes complete and partial tags with Ctrl+Backspace and preserves surrounding text", async function () {
            await start("Texto #align: justify");
            await press(BACKSPACE, 1);
            assert.strictEqual(editor.getValue(), "Texto");
            assert.strictEqual(editor.getCursorPosition().row, 0);
            assert.strictEqual(editor.getCursorPosition().column, 5);
            assert.ok(!listOpen());

            await start("#mus");
            await press(BACKSPACE, 1);
            assert.strictEqual(editor.getValue(), "");

            await start("#");
            await press(BACKSPACE, 1);
            assert.strictEqual(editor.getValue(), "");
        });

        it("removes complete tags from every state with Ctrl+Backspace", async function () {
            for( const text of ["#align: center", "#align: ", "#", "#align: just", "#mus"] ) {
                await start(text);
                await press(BACKSPACE, 1);
                assert.strictEqual(editor.getValue(), "", text);
                assert.ok(!listOpen(), text + " closes the list");
            }
        });

        it("undoes each atomic transition in one step", async function () {
            await start("#music: dark.mp3");
            await press(BACKSPACE);
            editor.undo();
            await tick();
            assert.strictEqual(editor.getValue(), "#music: dark.mp3");

            await start("#music: ");
            await press(BACKSPACE);
            assert.strictEqual(editor.getValue(), "#");
            editor.undo();
            await tick();
            assert.strictEqual(editor.getValue(), "#music: ");

            await start("#");
            await press(BACKSPACE);
            assert.strictEqual(editor.getValue(), "");
            editor.undo();
            await tick();
            assert.strictEqual(editor.getValue(), "#");

            await start("#align: center");
            await press(BACKSPACE, 1);
            editor.undo();
            await tick();
            assert.strictEqual(editor.getValue(), "#align: center");
        });

        it("only edits the tag under the cursor and keeps the separator between tags", async function () {
            await start("#music: vento forte.mp3 #sound: porta.wav");
            editor.moveCursorTo(0, 14);
            await press(BACKSPACE);
            assert.strictEqual(editor.getValue(), "#music: #sound: porta.wav");
            editor.moveCursorTo(0, 38);
            await press(BACKSPACE, 1);
            assert.strictEqual(editor.getValue(), "#music: ");
        });

        it("deletes a valid tag value with Delete without opening a list", async function () {
            await start("#align: center");
            editor.moveCursorTo(0, 9);
            await press(DELETE);
            assert.strictEqual(editor.getValue(), "#align: ");
            assert.ok(!listOpen());
        });

        it("keeps selection, non-tag hashes and line breaks on normal editor behavior", async function () {
            await start("#align: center");
            editor.moveCursorTo(0, 10);
            editor.selection.selectTo(0, 12);
            await press(BACKSPACE);
            assert.strictEqual(editor.getValue(), "#align: ceer");

            await start("#align: center");
            editor.moveCursorTo(0, 10);
            editor.selection.selectTo(0, 12);
            await press(BACKSPACE, 1);
            assert.strictEqual(editor.getValue(), "#align: ceer");

            await start("Chapter #1");
            await press(BACKSPACE);
            assert.strictEqual(editor.getValue(), "Chapter #");

            await start("words phrase");
            await press(BACKSPACE, 1);
            assert.strictEqual(editor.getValue(), "words ");

            await start("#\nNext line");
            editor.moveCursorTo(0, 1);
            await press(BACKSPACE);
            assert.strictEqual(editor.getValue(), "\nNext line");
        });
    });
});
