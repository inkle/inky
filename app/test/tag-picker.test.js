const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { TagPicker } = require("../renderer/tagPicker.js");
const { inkCompleter } = require("../renderer/inkCompleter.js");

describe("tag picker (# + Tab)", function () {
    it("lists the working tags in alphabetical order", function () {
        assert.deepStrictEqual(TagPicker.TAG_NAMES, ["align", "bg", "choice-align", "image", "music", "screen", "sound", "title"]);
    });

    it("only offers tag names while picking, each inserting 'name: ', plus the two stop lines", function () {
        const session = { getLine: () => "#", getTokenAt: () => ({ type: "text" }) };
        let results;
        inkCompleter.tagPicking = true;
        try {
            inkCompleter.getCompletions(null, session, { row: 0, column: 1 }, "", (e, r) => { results = r; });
        } finally {
            inkCompleter.tagPicking = false;
        }
        assert.ok(results.some(r => r.value === "choice-align: "));
        assert.ok(results.some(r => r.value === "bg: "));
        assert.ok(results.some(r => r.value === "align: left"));
        assert.ok(results.some(r => r.value === "music: stop"));
        assert.ok(results.some(r => r.value === "sound: stop"));
        assert.ok(results.some(r => r.value === "title: "));
        assert.ok(results.some(r => r.value === "screen"));
        assert.ok(!results.some(r => r.value === "screen: "));
        const label = value => results.find(r => r.value === value).meta;
        assert.strictEqual(label("music: stop"), "stop music");
        assert.strictEqual(label("sound: stop"), "parar efeitos");
        assert.strictEqual(label("music: "), "Ink Tag");
    });

    it("offers project images as values for #bg", function () {
        const project = fs.mkdtempSync(path.join(os.tmpdir(), "inky-bg-picker-"));
        try {
            fs.mkdirSync(path.join(project, "image", "background"), { recursive: true });
            fs.writeFileSync(path.join(project, "image", "background", "forest.jpg"), "image");
            fs.writeFileSync(path.join(project, "image", "background", "night.png"), "image");
            fs.writeFileSync(path.join(project, "image", "hero.png"), "image");
            fs.writeFileSync(path.join(project, "image", "background", "notes.txt"), "not an image");
            assert.deepStrictEqual(TagPicker.valuesForTag("bg", project), ["forest.jpg", "night.png"]);
            assert.deepStrictEqual(TagPicker.valuesForTag("image", project), ["hero.png", "image/background/forest.jpg", "image/background/night.png"]);
            assert.strictEqual(TagPicker.isAtomicValue("bg", "forest.jpg", project), true);
        } finally {
            fs.rmSync(project, { recursive: true, force: true });
        }
    });

    it("only reacts right after a tag's #", function () {
        assert.strictEqual(TagPicker.typedAfterHash("#", 1), "");
        assert.strictEqual(TagPicker.typedAfterHash("text #mu", 8), "mu");
        assert.strictEqual(TagPicker.typedAfterHash("text", 4), null);
        assert.strictEqual(TagPicker.typedAfterHash("\\#", 2), null);
        assert.strictEqual(TagPicker.typedAfterHash("// #", 4), null);
        assert.strictEqual(TagPicker.typedAfterHash("#music: x", 9), null);
    });
});

describe("file tags open their whole list (#bg, #image, #music, #sound)", function () {
    const wait = () => new Promise(resolve => setImmediate(resolve));

    function editorWith(line, column, options) {
        const settings = Object.assign({ autoComplete: true, popupOpen: false }, options);
        const editor = {
            lines: [line],
            completers: [{ id: "keywords" }, { id: "snippets" }, { id: "inkCompleter" }],
            gatherers: [],
            commands: [],
            changeListeners: [],
            selection: { isEmpty: () => true },
            getOption: name => name === "enableBasicAutocompletion" && settings.autoComplete,
            getCursorPosition: () => ({ row: 0, column: column }),
            on: (event, listener) => { if (event === "change") editor.changeListeners.push(listener); },
            keyBinding: { addKeyboardHandler: () => {} },
            session: {
                getLine: row => editor.lines[row],
                doc: { getAllLines: () => editor.lines }
            },
            execCommand(name) {
                editor.commands.push(name);
                if (name === "startAutocomplete") editor.gatherers.push(editor.completers.map(c => c.id));
            }
        };
        if (settings.popupOpen) editor.completer = { activated: true };
        TagPicker.install(editor, editor.completers[2]);
        return editor;
    }

    async function type(editor) {
        editor.changeListeners.forEach(listener => listener());
        await wait();
    }

    it("knows the tag whose file list is wanted at the cursor", function () {
        TagPicker.FILE_VALUE_TAGS.forEach(tag => {
            assert.strictEqual(TagPicker.fileTagAwaitingValue("#" + tag + ": ", tag.length + 3), tag);
        });
        assert.strictEqual(TagPicker.fileTagAwaitingValue("#title: ", 8), null, "a scene title is not a file");
        assert.strictEqual(TagPicker.fileTagAwaitingValue("#align: ", 8), null);
        assert.strictEqual(TagPicker.fileTagAwaitingValue("#music:", 7), null, "the space of the canonical form is needed");
        assert.strictEqual(TagPicker.fileTagAwaitingValue("#music: forest.mp3", 20), null, "a file is already being written");
        assert.strictEqual(TagPicker.fileTagAwaitingValue("Texto #image: ", 14), "image");
        assert.strictEqual(TagPicker.fileTagAwaitingValue("Texto #bg: ", 11), "bg");
        assert.strictEqual(TagPicker.fileTagAwaitingValue("Musica#music: ", 14), null, "a tag starts a line or follows a space");
    });

    it("opens the list by itself, with the story completer only", async function () {
        const editor = editorWith("#music: ", 8);
        await type(editor);
        assert.deepStrictEqual(editor.commands, ["startAutocomplete"]);
        assert.deepStrictEqual(editor.gatherers, [["inkCompleter"]], "no keywords and no snippets in the file list");
        assert.deepStrictEqual(editor.completers.map(c => c.id), ["keywords", "snippets", "inkCompleter"], "the other completers come back");
    });

    it("opens it for every file tag", async function () {
        for (const tag of TagPicker.FILE_VALUE_TAGS) {
            const line = "#" + tag + ": ";
            const editor = editorWith(line, line.length);
            await type(editor);
            assert.deepStrictEqual(editor.commands, ["startAutocomplete"], line);
        }
    });

    it("stays quiet when no file is expected, autocomplete is off, or a list is already open", async function () {
        const notATag = editorWith("#title: ", 8);
        await type(notATag);
        assert.deepStrictEqual(notATag.commands, []);

        const commented = editorWith("// #music: ", 11);
        await type(commented);
        assert.deepStrictEqual(commented.commands, [], "a comment is not story code");

        const off = editorWith("#image: ", 8, { autoComplete: false });
        await type(off);
        assert.deepStrictEqual(off.commands, []);

        const alreadyOpen = editorWith("#sound: ", 8, { popupOpen: true });
        await type(alreadyOpen);
        assert.deepStrictEqual(alreadyOpen.commands, []);
    });
});

describe("Tab after a file tag written by hand (#bg:, #image:, #music:, #sound:)", function () {
    function editorWith(line, column, options) {
        const settings = Object.assign({ autoComplete: true, popupOpen: false }, options);
        const editor = {
            lines: [line],
            commands: [],
            inserted: [],
            completers: [{ id: "keywords" }, { id: "inkCompleter" }],
            selection: { isEmpty: () => true },
            getOption: name => name === "enableBasicAutocompletion" && settings.autoComplete,
            getCursorPosition: () => ({ row: 0, column: column }),
            on: () => {},
            keyBinding: { addKeyboardHandler: () => {} },
            session: { getLine: row => editor.lines[row], doc: { getAllLines: () => editor.lines } },
            insert: text => editor.inserted.push(text),
            execCommand: name => editor.commands.push(name)
        };
        if (settings.popupOpen) editor.completer = { activated: true };
        editor.handler = TagPicker.install(editor, editor.completers[1]);
        return editor;
    }

    function pressTab(editor) {
        const result = editor.handler.handleKeyboard({}, 0, "tab");
        if (result && result.command && result.command.exec) result.command.exec();
        return result;
    }

    it("knows when the cursor sits right after a file tag, with or without the space", function () {
        assert.deepStrictEqual(TagPicker.fileTagBeforeTab("#music:", 7), { tag: "music", hasSpace: false });
        assert.deepStrictEqual(TagPicker.fileTagBeforeTab("#image: ", 8), { tag: "image", hasSpace: true });
        assert.deepStrictEqual(TagPicker.fileTagBeforeTab("#bg:", 4), { tag: "bg", hasSpace: false });
        assert.deepStrictEqual(TagPicker.fileTagBeforeTab("Texto #sound:", 13), { tag: "sound", hasSpace: false });
        assert.strictEqual(TagPicker.fileTagBeforeTab("#title:", 7), null);
        assert.strictEqual(TagPicker.fileTagBeforeTab("#music: forest.mp3", 20), null);
        assert.strictEqual(TagPicker.fileTagBeforeTab("Musica#music:", 13), null);
    });

    it("opens the file list when Tab is pressed right after the tag with its space", function () {
        const editor = editorWith("#music: ", 8);
        assert.ok(pressTab(editor));
        assert.deepStrictEqual(editor.inserted, []);
        assert.deepStrictEqual(editor.commands, ["startAutocomplete"]);
    });

    it("adds the missing space before opening the list", function () {
        const editor = editorWith("#image:", 7);
        assert.ok(pressTab(editor));
        assert.deepStrictEqual(editor.inserted, [" "]);
        assert.deepStrictEqual(editor.commands, ["startAutocomplete"]);
    });

    it("leaves Tab alone elsewhere: other tags, comments, autocomplete off, list already open", function () {
        const others = [
            editorWith("#title: ", 8),
            editorWith("// #music: ", 11),
            editorWith("Texto", 5),
            editorWith("#music: ", 8, { autoComplete: false }),
            editorWith("#music: ", 8, { popupOpen: true })
        ];
        others.forEach(editor => {
            assert.ok(!pressTab(editor));
            assert.deepStrictEqual(editor.commands, []);
            assert.deepStrictEqual(editor.inserted, []);
        });
    });
});
