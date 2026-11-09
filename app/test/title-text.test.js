const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { GameStyle } = require("../renderer/gameStyle.js");

describe("story title and author text", function () {
    describe("normalizeTitleText", function () {
        const n = GameStyle.normalizeTitleText;

        it("keeps single plain spaces and any other character", function () {
            assert.strictEqual(n("Glass Tide"), "Glass Tide");
            assert.strictEqual(n("Glass Tide 2: O Retorno"), "Glass Tide 2: O Retorno");
            assert.strictEqual(n("Ünï-cødé & #1 ★ (a/b)"), "Ünï-cødé & #1 ★ (a/b)");
        });

        it("trims the ends and collapses every kind of spacing into one space", function () {
            assert.strictEqual(n("  Glass Tide"), "Glass Tide");
            assert.strictEqual(n("Glass Tide  "), "Glass Tide");
            assert.strictEqual(n("Glass   Tide"), "Glass Tide");
            assert.strictEqual(n("Glass\tTide"), "Glass Tide");
            assert.strictEqual(n("Glass\nTide"), "Glass Tide");
            assert.strictEqual(n("Glass\r\n \u00A0Tide"), "Glass Tide");
            assert.strictEqual(n("Glass\u00A0Tide"), "Glass Tide");
            assert.strictEqual(n("Glass\u200BTide"), "Glass Tide");
            assert.strictEqual(n("Glass\u2003\uFEFFTide"), "Glass Tide");
        });

        it("treats blank text as empty", function () {
            assert.strictEqual(n("   "), "");
            assert.strictEqual(n(" \t\n\u00A0\u200B"), "");
            assert.strictEqual(n(""), "");
            assert.strictEqual(n(null), "");
        });

        it("can keep any number of plain spaces at each end when asked (a field being edited)", function () {
            assert.strictEqual(n("Glass   ", true), "Glass   ");
            assert.strictEqual(n("  Glass", true), "  Glass");
            assert.strictEqual(n("  Glass   Tide  ", true), "  Glass Tide  ");
            assert.strictEqual(n("  \tGlass\u00A0 ", true), "  Glass ");
            assert.strictEqual(n("   ", true), "   ");
        });
    });

    describe("reading and writing game.yaml", function () {
        it("normalizes values read from the YAML", function () {
            const parsed = GameStyle.parseText('titles:\n  story: "  Glass \\t  Tide "\n  author: "Helena\\u00A0 Marques  "\n');
            assert.strictEqual(parsed.style.titles.story, "Glass Tide");
            assert.strictEqual(parsed.style.titles.author, "Helena Marques");
            assert.strictEqual(parsed.model.titles.story, "Glass Tide");
            assert.deepStrictEqual(parsed.warnings, []);
        });

        it("never writes spaces at the start or the end", function () {
            const model = GameStyle.defaultModel();
            model.titles.story = "  Glass   Tide ";
            model.titles.author = "   ";
            const yaml = GameStyle.toYaml(model);
            assert.match(yaml, /story: "Glass Tide"/);
            assert.doesNotMatch(yaml, /author:/);
        });
    });

    describe("form fields", function () {
        const html = fs.readFileSync(path.join(__dirname, "../renderer/gameSettings/gameSettings.html"), "utf8");
        const script = fs.readFileSync(path.join(__dirname, "../renderer/gameSettings/gameSettings.js"), "utf8");
        let window;

        beforeEach(function () {
            const dom = new JSDOM(html, {
                url: "file:///gameSettings.html?virtual=1&yaml=" + encodeURIComponent('titles:\n  story: "Old"\n'),
                runScripts: "outside-only"
            });
            window = dom.window;
            window.HTMLCanvasElement.prototype.getContext = () => ({ fillStyle: "#000000" });
            window.require = name => {
                if( name === "fs" ) return fs;
                if( name === "path" ) return path;
                if( name === "url" ) return require("url");
                if( name === "../imageTypes.js" ) return require("../renderer/imageTypes.js");
                if( name === "electron" ) return { ipcRenderer: { send() {}, invoke: () => Promise.resolve([]) } };
                if( name === "../gameStyle.js" ) return { GameStyle };
                throw new Error("Unexpected module: " + name);
            };
            window.eval(script);
        });

        afterEach(function () { window.close(); });

        const field = id => window.document.getElementById(id);
        const stored = () => GameStyle.parseText(window.flushSettingsForAdvanced()).model.titles;

        function begin(id, value, caret) {
            const input = field(id);
            input.focus();
            input.value = value;
            input.setSelectionRange(caret === undefined ? value.length : caret, caret === undefined ? value.length : caret);
            return input;
        }

        // A key press: the browser asks first (beforeinput), then inserts, then reports (input).
        function type(input, text) {
            for( const character of text ) {
                const before = new window.InputEvent("beforeinput", { inputType: "insertText", data: character, bubbles: true, cancelable: true });
                if( !input.dispatchEvent(before) ) continue;
                input.setRangeText(character, input.selectionStart, input.selectionEnd, "end");
                input.dispatchEvent(new window.InputEvent("input", { inputType: "insertText", data: character, bubbles: true }));
            }
        }

        function paste(input, text) {
            const event = new window.Event("paste", { bubbles: true, cancelable: true });
            event.clipboardData = { getData: () => text };
            input.dispatchEvent(event);
        }

        function eraseRange(input, start, end) {
            input.setRangeText("", start, end, "end");
            input.dispatchEvent(new window.InputEvent("input", { inputType: "deleteContentBackward", bubbles: true }));
        }

        ["story-title", "story-author"].forEach(id => {
            const key = id === "story-title" ? "story" : "author";

            describe(id, function () {
                it("shows one trailing space while typing, but stores only the normalized value", function () {
                    const input = begin(id, "");
                    type(input, "Glass");
                    type(input, " ");
                    assert.strictEqual(input.value, "Glass ");
                    assert.strictEqual(input.selectionStart, 6, "the cursor moves after the space");
                    assert.strictEqual(stored()[key], "Glass");
                    type(input, "Tide");
                    assert.strictEqual(input.value, "Glass Tide");
                    assert.strictEqual(stored()[key], "Glass Tide");
                });

                it("allows a space at each end in the field, but never stores it, after every key", function () {
                    const input = begin(id, "");
                    for( const character of " Glass  Tide " ) {
                        type(input, character);
                        const saved = window.flushSettingsForAdvanced();
                        const yamlValue = (saved.match(new RegExp("^  " + key + ': "(.*)"$', "m")) || [])[1];
                        if( yamlValue !== undefined ) assert.strictEqual(yamlValue, yamlValue.trim(), JSON.stringify(yamlValue));
                        assert.strictEqual(stored()[key], stored()[key].trim());
                    }
                    assert.strictEqual(input.value, " Glass Tide ");
                });

                it("keeps the spaces in the field on blur and Enter, while the stored value is trimmed", function () {
                    const input = begin(id, "");
                    type(input, " Glass ");
                    input.dispatchEvent(new window.Event("blur"));
                    input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
                    assert.strictEqual(input.value, " Glass ");
                    assert.strictEqual(stored()[key], "Glass");
                });

                it("Backspace removes the visible trailing space", function () {
                    const input = begin(id, "");
                    type(input, "Glass ");
                    eraseRange(input, 5, 6);
                    assert.strictEqual(input.value, "Glass");
                    assert.strictEqual(input.selectionStart, 5);
                });

                it("an automatic save with the field focused leaves its text and cursor alone", function () {
                    const input = begin(id, "");
                    type(input, "Glass ");
                    input.setSelectionRange(2, 2);
                    window.flushSettingsForAdvanced();
                    assert.strictEqual(window.document.activeElement, input);
                    assert.strictEqual(input.value, "Glass ");
                    assert.strictEqual(input.selectionStart, 2);
                    assert.strictEqual(stored()[key], "Glass");
                });

                it("takes the space between words when it is typed in the middle", function () {
                    const input = begin(id, "GlassTide", 5);
                    type(input, " ");
                    assert.strictEqual(input.value, "Glass Tide");
                    assert.strictEqual(input.selectionStart, 6);
                    input.dispatchEvent(new window.Event("blur"));
                    assert.strictEqual(input.value, "Glass Tide");
                    assert.strictEqual(stored()[key], "Glass Tide");
                });

                it("allows any number of spaces at the end", function () {
                    const input = begin(id, "Glass ");
                    type(input, "   ");
                    assert.strictEqual(input.value, "Glass    ");
                    assert.strictEqual(input.selectionStart, 9);
                    assert.strictEqual(stored()[key], "Glass");
                });

                it("allows any number of spaces at the start", function () {
                    const input = begin(id, "");
                    type(input, " ");
                    assert.strictEqual(input.value, " ");
                    type(input, "  A");
                    assert.strictEqual(input.value, "   A");
                    assert.strictEqual(stored()[key], "A");
                });

                it("ignores a second space in a row and keeps the cursor still", function () {
                    const input = begin(id, "A B", 2);
                    type(input, " ");
                    assert.strictEqual(input.value, "A B");
                    assert.strictEqual(input.selectionStart, 2);
                    input.setSelectionRange(1, 1);
                    type(input, " ");
                    assert.strictEqual(input.value, "A B");
                    assert.strictEqual(input.selectionStart, 1);
                    type(input, "A ");
                    assert.strictEqual(input.value, "AA B");
                    type(input, " ");
                    assert.strictEqual(input.value, "AA B");
                });

                it("normalizes pasted text instead of rejecting it", function () {
                    const input = begin(id, "");
                    paste(input, "  A   B  ");
                    assert.strictEqual(input.value, "A B");
                    assert.strictEqual(stored()[key], "A B");
                    paste(begin(id, ""), "x\ty\nz\u00A0w");
                    assert.strictEqual(field(id).value, "x y z w");
                });

                it("pastes into the middle at the cursor", function () {
                    const input = begin(id, "AB", 1);
                    paste(input, " - ");
                    assert.strictEqual(input.value, "A-B");
                    assert.strictEqual(input.selectionStart, 2);
                });

                it("deleting the middle part of 'A B C' leaves 'A C'", function () {
                    const input = begin(id, "A B C");
                    eraseRange(input, 2, 3);
                    assert.strictEqual(input.value, "A C");
                    assert.strictEqual(input.selectionStart, 2, "the cursor stays where the deleted part was");
                    assert.strictEqual(stored()[key], "A C");
                });

                it("collapses spaces that arrive some other way, keeping the cursor", function () {
                    const input = begin(id, "A   B", 4);
                    input.dispatchEvent(new window.InputEvent("input", { inputType: "insertText", bubbles: true }));
                    assert.strictEqual(input.value, "A B");
                    assert.strictEqual(input.selectionStart, 2);
                });

                it("treats only spaces as empty", function () {
                    const input = begin(id, "   ");
                    input.dispatchEvent(new window.InputEvent("input", { inputType: "insertText", bubbles: true }));
                    assert.strictEqual(stored()[key], "");
                });

                it("accepts any other character", function () {
                    const input = begin(id, "");
                    type(input, "GlassTide2:ORetorno!#1★");
                    assert.strictEqual(input.value, "GlassTide2:ORetorno!#1★");
                });
            });
        });
    });
});

describe("story title and author in the Advanced tab (game.yaml text)", function () {
    const { JSDOM } = require("jsdom");
    const { YamlTitleGuard } = require("../renderer/yamlTitleGuard.js");
    const SRC = path.join(__dirname, "..", "renderer");
    let window, editor;

    const yamlWith = (story, author) => `theme: light\n\ntitles:\n  story: ${story}\n  author: ${author}\n  cover: "x.png"\n`;

    before(function () {
        const dom = new JSDOM('<!doctype html><body><div id="editor" style="width:600px;height:400px"></div></body>', { runScripts: "outside-only", pretendToBeVisual: true });
        window = dom.window;
        window.eval(fs.readFileSync(path.join(SRC, "acesrc", "ace.js"), "utf8"));
        window.eval(fs.readFileSync(path.join(SRC, "acesrc", "mode-yaml.js"), "utf8"));
        editor = window.ace.edit("editor");
        editor.session.setMode("ace/mode/yaml");
        YamlTitleGuard.install(editor);
    });

    const tick = () => new Promise(resolve => setImmediate(() => setTimeout(resolve, 10)));
    const load = async text => {
        editor.session.$fromUndo = true;
        editor.setValue(text, 1);
        editor.session.$fromUndo = false;
        editor.session.doc.$yamlTitleRows.clear();
        editor.session.getUndoManager().reset();
        await tick();
    };
    const type = async text => { for( const ch of text ) { editor.keyBinding.onTextInput(ch); await tick(); } };
    const lineOf = row => editor.session.getLine(row);
    const BACKSPACE = 8;
    const press = async keyCode => { editor.keyBinding.onCommandKey({ preventDefault() {}, stopPropagation() {} }, 0, keyCode); await tick(); };

    it("finds the text of the story and author values", function () {
        const lines = yamlWith('"Glass Tide"', "'Helena M'").split("\n");
        const found = YamlTitleGuard.titleValueRanges(lines);
        assert.deepStrictEqual(found.map(r => lines[r.row].slice(r.start, r.end)), ["Glass Tide", "Helena M"]);
        assert.deepStrictEqual(YamlTitleGuard.titleValueRanges(["story: \"A\"", "title: x"]), []);
    });

    [["story", 3], ["author", 4]].forEach(([key, row]) => {
        describe(key, function () {
            const q = text => `  ${key}: "${text}"`;
            const at = (text, column) => { editor.moveCursorTo(row, q(text).indexOf('"') + 1 + column); };

            it("allows any number of spaces at the start", async function () {
                await load(yamlWith(key === "story" ? '"Glass"' : '"x"', key === "story" ? '"x"' : '"Glass"'));
                at("Glass", 0);
                await type(" ");
                assert.strictEqual(lineOf(row), q(" Glass"));
                assert.strictEqual(editor.getCursorPosition().column, q(" Glass").indexOf('"') + 2);
                editor.moveCursorTo(row, q(" Glass").indexOf('"') + 1);
                await type(" ");
                assert.strictEqual(lineOf(row), q("  Glass"));
                assert.strictEqual(GameStyle.parseText(editor.getValue()).model.titles[key], "Glass");
            });

            it("shows one trailing space at the end of the value and the cursor moves after it", async function () {
                await load(yamlWith(key === "story" ? '"Glass"' : '"x"', key === "story" ? '"x"' : '"Glass"'));
                at("Glass", 5);
                await type(" ");
                assert.strictEqual(lineOf(row), q("Glass "));
                assert.strictEqual(editor.getCursorPosition().column, q("Glass ").lastIndexOf('"'));
                assert.strictEqual(GameStyle.parseText(editor.getValue()).model.titles[key], "Glass", "readers never get the space");
            });

            it("allows any number of trailing spaces", async function () {
                await load(yamlWith(key === "story" ? '"Glass"' : '"x"', key === "story" ? '"x"' : '"Glass"'));
                at("Glass", 5);
                await type(" ");
                await type(" ");
                assert.strictEqual(lineOf(row), q("Glass  "));
                assert.strictEqual(editor.getCursorPosition().column, q("Glass  ").lastIndexOf('"'));
            });

            it("keeps the spaces when the cursor leaves or the editor loses focus; readers ignore them", async function () {
                await load(yamlWith(key === "story" ? '"Glass"' : '"x"', key === "story" ? '"x"' : '"Glass"'));
                at("Glass", 5);
                await type(" ");
                editor.moveCursorTo(0, 0);
                editor._emit("blur");
                assert.strictEqual(lineOf(row), q("Glass "));
                assert.strictEqual(GameStyle.parseText(editor.getValue()).model.titles[key], "Glass");
            });

            it("Backspace removes the visible trailing space", async function () {
                await load(yamlWith(key === "story" ? '"Glass"' : '"x"', key === "story" ? '"x"' : '"Glass"'));
                at("Glass", 5);
                await type(" ");
                await press(BACKSPACE);
                assert.strictEqual(lineOf(row), q("Glass"));
            });

            it("refuses a second space in a row", async function () {
                await load(yamlWith(key === "story" ? '"A B"' : '"x"', key === "story" ? '"x"' : '"A B"'));
                at("A B", 2);
                await type(" ");
                at("A B", 1);
                await type(" ");
                assert.strictEqual(lineOf(row), q("A B"));
                assert.strictEqual(editor.getCursorPosition().column, q("A B").indexOf('"') + 2);
            });

            it("takes a space in the middle of a word", async function () {
                await load(yamlWith(key === "story" ? '"GlassTide"' : '"x"', key === "story" ? '"x"' : '"GlassTide"'));
                at("GlassTide", 5);
                await type(" ");
                assert.strictEqual(lineOf(row), q("Glass Tide"));
            });

            it("accepts any other character, also at the end", async function () {
                await load(yamlWith(key === "story" ? '"Glass"' : '"x"', key === "story" ? '"x"' : '"Glass"'));
                at("Glass", 5);
                await type("2:Ü!");
                assert.strictEqual(lineOf(row), q("Glass2:Ü!"));
            });

            it("normalizes pasted text", async function () {
                await load(yamlWith(key === "story" ? '"X"' : '"x"', key === "story" ? '"x"' : '"X"'));
                at("X", 1);
                editor.onPaste("  A \t\n B  ", {});
                await tick();
                assert.strictEqual(lineOf(row), q("XA B"));
                assert.strictEqual(editor.getCursorPosition().column, q("XA B").indexOf('"') + 1 + 4, "cursor ends after the pasted text");
                assert.strictEqual(editor.session.getLength(), 7, "no line was added by the pasted line break");
            });

            it("deleting the middle part of 'A B C' leaves 'A C'", async function () {
                await load(yamlWith(key === "story" ? '"A B C"' : '"x"', key === "story" ? '"x"' : '"A B C"'));
                at("A B C", 3);
                await press(BACKSPACE);
                assert.strictEqual(lineOf(row), q("A C"));
                assert.strictEqual(editor.getCursorPosition().column, q("A C").indexOf('"') + 1 + 2);
            });
        });
    });

    it("leaves a value that is out of the rule alone until it is edited", async function () {
        await load(yamlWith('"  Glass   Tide "', '"Helena"'));
        assert.strictEqual(lineOf(3), '  story: "  Glass   Tide "');
        editor.moveCursorTo(5, 5);
        await type("z");
        assert.strictEqual(lineOf(3), '  story: "  Glass   Tide "', "editing elsewhere does not touch it");
        editor.moveCursorTo(3, 17);
        await type("x");
        assert.strictEqual(lineOf(3), '  story: "  Glassx Tide "');
    });

    it("works for unquoted and single-quoted values and leaves the other keys alone", async function () {
        await load(yamlWith("Glass", "'Helena'"));
        editor.moveCursorTo(3, "  story: Glass".length);
        await type("  ");
        assert.strictEqual(lineOf(3), "  story: Glass  ");
        editor.moveCursorTo(4, "  author: 'Helena".length);
        await type(" ");
        assert.strictEqual(lineOf(4), "  author: 'Helena '");
        editor.moveCursorTo(5, '  cover: "x.png'.length);
        await type("  ");
        assert.strictEqual(lineOf(5), '  cover: "x.png  "');
        assert.strictEqual(GameStyle.parseText(editor.getValue()).model.titles.story, "Glass");
        assert.strictEqual(GameStyle.parseText(editor.getValue()).model.titles.author, "Helena");
    });

    [["story", 3], ["author", 4]].forEach(([key, row]) => {
        it(`${key}: types 'Glass Tide' in order, after every key the value read is clean`, async function () {
            await load(yamlWith('""', '""'));
            editor.moveCursorTo(row, `  ${key}: "`.length);
            const shown = [];
            for( const character of " Glass  Tide" ) {
                await type(character);
                shown.push(lineOf(row));
                const read = GameStyle.parseText(editor.getValue()).model.titles[key];
                assert.strictEqual(read, read.trim());
            }
            assert.strictEqual(shown[0], `  ${key}: " "`);
            assert.strictEqual(shown[5], `  ${key}: " Glass"`);
            assert.strictEqual(shown[6], `  ${key}: " Glass "`);
            assert.strictEqual(shown[7], `  ${key}: " Glass  "`, "spaces at the end are free");
            assert.strictEqual(shown[11], `  ${key}: " Glass Tide"`);
            assert.strictEqual(editor.getCursorPosition().column, `  ${key}: " Glass Tide`.length);
        });
    });

    it("does nothing for text that is not YAML", async function () {
        const yamlSession = editor.session;
        const session = window.ace.createEditSession("titles:\n  story: \"A\"\n", "ace/mode/text");
        editor.setSession(session);
        editor.moveCursorTo(1, 10);
        editor.keyBinding.onTextInput(" ");
        assert.strictEqual(session.getLine(1), '  story: " A"');
        editor.setSession(yamlSession);
    });
});

describe("story title and author shown in the form", function () {
    const html = fs.readFileSync(path.join(__dirname, "../renderer/gameSettings/gameSettings.html"), "utf8");
    const script = fs.readFileSync(path.join(__dirname, "../renderer/gameSettings/gameSettings.js"), "utf8");

    it("shows the text without spaces at the start or the end", async function () {
        const yaml = 'titles:\n  story: "  Glass   Tide "\n  author: " Helena  M "\n';
        const dom = new JSDOM(html, { url: "file:///gameSettings.html?virtual=1&yaml=" + encodeURIComponent(yaml), runScripts: "outside-only" });
        const window = dom.window;
        window.HTMLCanvasElement.prototype.getContext = () => ({ fillStyle: "#000000" });
        window.require = name => {
            if( name === "fs" ) return fs;
            if( name === "path" ) return path;
            if( name === "url" ) return require("url");
            if( name === "../imageTypes.js" ) return require("../renderer/imageTypes.js");
            if( name === "electron" ) return { ipcRenderer: { send() {}, invoke: () => Promise.resolve([]) } };
            if( name === "../gameStyle.js" ) return { GameStyle };
            throw new Error("Unexpected module: " + name);
        };
        window.eval(script);
        assert.strictEqual(window.document.getElementById("story-title").value, "Glass Tide");
        assert.strictEqual(window.document.getElementById("story-author").value, "Helena M");
        await new Promise(resolve => setTimeout(resolve, 20));
        window.close();
    });
});
