"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { RichTextFormatting } = require("../renderer/richTextFormatting.js");

describe("rich text formatting in the Ink editor", function () {
    let window, editor, Range, primarySession;

    before(function () {
        const dom = new JSDOM('<!doctype html><body><div id="editor" style="width:600px;height:400px"></div></body>', {
            runScripts: "outside-only",
            pretendToBeVisual: true
        });
        window = dom.window;
        window.eval(fs.readFileSync(path.join(__dirname, "../renderer/acesrc/ace.js"), "utf8"));
        window.require = () => ({ RichTextFormatting });
        window.exports = {};
        window.eval(fs.readFileSync(path.join(__dirname, "../renderer/ace-ink-mode/ace-ink.js"), "utf8"));
        editor = window.ace.edit("editor");
        editor.$blockScrolling = Infinity;
        editor.session.setMode(new window.exports.InkMode());
        Range = window.ace.require("ace/range").Range;
        RichTextFormatting.install(editor, Range);
        primarySession = editor.session;
    });

    after(function () {
        window.close();
    });

    const tick = () => new Promise(resolve => setTimeout(resolve, 25));
    const setText = async text => {
        editor.setValue(text, 1);
        editor.clearSelection();
        await tick();
        editor.session.getUndoManager().reset();
    };

    it("styles nested formats and leaves tags, logic, and comments untouched", async function () {
        await setText("A ⟦b⟧bold ⟦i⟧both⟦/i⟧⟦/b⟧ Z\n* ⟦i⟧choice⟦/i⟧ [plain]\n{⟦b⟧logic⟦/b⟧}\n#music: ⟦b⟧tag⟦/b⟧\n// ⟦i⟧comment⟦/i⟧");
        assert.deepStrictEqual(editor.session.getTokens(0).map(token => token.type), [
            "text", "text.richBold", "text.richBold.richItalic", "text.richBold", "text"
        ]);
        // A choice line is not story text: its markers are not styled, folded or hidden
        assert.ok(!editor.session.getTokens(1).some(token => /rich(Bold|Italic)/.test(token.type)));
        assert.strictEqual(editor.session.getDisplayLine(1), "* ⟦i⟧choice⟦/i⟧ [plain]");
        assert.strictEqual(editor.session.getAllFolds().length, 4);
        assert.ok(!editor.session.getAllFolds().some(fold => fold.start.row > 0));
    });

    it("hides balanced markers and keeps malformed markers visible", async function () {
        await setText("Um ⟦b⟧negrito⟦/b⟧ e ⟦i⟧itálico⟦/i⟧.\n⟦/b⟧ sem par");
        assert.strictEqual(editor.session.getDisplayLine(0), "Um negrito e itálico.");
        assert.strictEqual(editor.session.getDisplayLine(1), "⟦/b⟧ sem par");
        assert.strictEqual(editor.session.getAllFolds().length, 4);

        editor.insert("!");
        await tick();
        assert.strictEqual(editor.session.getDisplayLine(1), "⟦/b⟧ sem par!");
        editor.undo();
        await tick();
        assert.strictEqual(editor.session.getDisplayLine(1), "⟦/b⟧ sem par");
        editor.redo();
        await tick();
        assert.strictEqual(editor.session.getDisplayLine(1), "⟦/b⟧ sem par!");
    });

    it("wraps long formatted lines at spaces, never inside a word", async function () {
        const words = ["ferro", "queimado", "cheira", "estranho", "quando", "chove", "forte"];
        const build = format => {
            let line = "";
            for (let i = 0; i < 40; i++) {
                const word = words[i % words.length];
                line += (format && i % 2 ? "⟦b⟧" + word + "⟦/b⟧" : word) + " ";
            }
            return line.trim();
        };
        const brokenWords = text => {
            const session = editor.session;
            session.setUseWrapMode(true);
            session.setWrapLimitRange(30, 30);
            session.$wrapLimit = 30;
            session.$updateWrapData(0, session.getLength() - 1);
            const broken = [];
            for (let screenRow = 1; screenRow < session.getScreenLength(); screenRow++) {
                const pos = session.screenToDocumentPosition(screenRow, 0);
                const line = session.getLine(pos.row);
                let before = line.slice(0, pos.column).replace(/⟦\/?[bi]⟧$/, "");
                if (before && !/\s$/.test(before)) broken.push(screenRow);
            }
            return broken;
        };
        try {
            await setText(build(false));
            assert.deepStrictEqual(brokenWords(), []);
            await setText(build(true));
            assert.ok(editor.session.getAllFolds().length > 10);
            assert.deepStrictEqual(brokenWords(), []);
        } finally {
            editor.session.setUseWrapMode(false);
        }
    });

    it("hides empty Ace fold placeholders with no visual styling", function () {
        const css = fs.readFileSync(path.join(__dirname, "../renderer/inkTheme.css"), "utf8");
        assert.match(css, /\.ace_fold:empty[\s\S]*?display:\s*none\s*!important/);
        assert.match(css, /\.ace_fold:empty:hover/);
        assert.match(css, /border:\s*0\s*!important/);
        assert.match(css, /padding:\s*0\s*!important/);
        assert.match(css, /width:\s*0\s*!important/);
    });

    it("keeps cursor positions outside hidden marker folds", async function () {
        await setText("a⟦b⟧forte⟦/b⟧z");
        const folds = editor.session.$richTextFolds;
        const assertOutsideFolds = () => {
            const column = editor.getCursorPosition().column;
            assert.ok(!folds.some(fold => column > fold.start.column && column < fold.end.column));
        };
        for( let column = 0; column <= editor.session.getLine(0).length; column++ ) {
            editor.moveCursorTo(0, column);
            assertOutsideFolds();
        }
        editor.moveCursorTo(0, 0);
        for( let i = 0; i < 10; i++ ) {
            editor.navigateRight();
            assertOutsideFolds();
        }
        for( let i = 0; i < 10; i++ ) {
            editor.navigateLeft();
            assertOutsideFolds();
        }
    });

    it("applies selection formatting and undoes it in one step", async function () {
        await setText("texto selecionado");
        editor.moveCursorTo(0, 0);
        editor.selection.selectTo(0, 5);
        editor.execCommand("toggleRichTextBold");
        await tick();
        assert.strictEqual(editor.getValue(), "⟦b⟧texto⟦/b⟧ selecionado");
        editor.undo();
        await tick();
        assert.strictEqual(editor.getValue(), "texto selecionado");
    });

    it("formats each selected line separately and removes formatting when fully selected", async function () {
        await setText("primeira\nsegunda");
        editor.moveCursorTo(0, 0);
        editor.selection.selectTo(1, 7);
        editor.execCommand("toggleRichTextItalic");
        await tick();
        assert.strictEqual(editor.getValue(), "⟦i⟧primeira⟦/i⟧\n⟦i⟧segunda⟦/i⟧");

        editor.selection.setRange(new Range(0, 3, 0, 12));
        editor.execCommand("toggleRichTextItalic");
        await tick();
        assert.strictEqual(editor.getValue(), "primeira\n⟦i⟧segunda⟦/i⟧");
    });

    it("formats and removes visible selections that cross existing hidden markers", async function () {
        await setText("antes ⟦b⟧forte⟦/b⟧ depois");
        editor.selection.setRange(new Range(0, 0, 0, editor.session.getLine(0).length));
        editor.execCommand("toggleRichTextBold");
        await tick();
        assert.strictEqual(editor.session.getDisplayLine(0), "antes forte depois");
        assert.strictEqual(editor.getValue(), "⟦b⟧antes ⟦b⟧forte⟦/b⟧ depois⟦/b⟧");

        editor.selection.setRange(new Range(0, 0, 0, editor.session.getLine(0).length));
        editor.execCommand("toggleRichTextBold");
        await tick();
        assert.strictEqual(editor.getValue(), "antes forte depois");
    });

    it("starts and stops formatting at the caret and safely deletes formatted text", async function () {
        await setText("texto");
        editor.moveCursorTo(0, 5);
        editor.execCommand("toggleRichTextBold");
        editor.insert("forte");
        await tick();
        assert.strictEqual(editor.session.getDisplayLine(0), "textoforte");

        editor.execCommand("toggleRichTextBold");
        editor.insert(" normal");
        await tick();
        assert.strictEqual(editor.session.getDisplayLine(0), "textoforte normal");
        assert.strictEqual(editor.session.getAllFolds().length, 2);

        editor.moveCursorTo(0, 13);
        for( let i = 0; i < 5; i++ ) editor.remove("left");
        await tick();
        assert.ok(!editor.getValue().includes("⟦/b⟧"));
        assert.strictEqual(editor.session.getDisplayLine(0), "texto normal");
    });

    it("toggles an empty format off without leaving hidden markers", async function () {
        await setText("texto");
        editor.moveCursorTo(0, 5);
        editor.execCommand("toggleRichTextBold");
        editor.execCommand("toggleRichTextBold");
        await tick();
        assert.strictEqual(editor.getValue(), "texto");
        editor.undo();
        await tick();
        assert.strictEqual(editor.getValue(), "texto");
    });

    it("keeps no-selection formatting pending until text is entered", async function () {
        await setText("texto");
        editor.moveCursorTo(0, 5);
        editor.execCommand("toggleRichTextBold");
        assert.strictEqual(editor.getValue(), "texto");
        editor.insert("a");
        editor.insert("b");
        await tick();
        assert.strictEqual(editor.getValue(), "texto⟦b⟧ab⟦/b⟧");
        editor.execCommand("toggleRichTextBold");
        editor.insert(" normal");
        await tick();
        assert.strictEqual(editor.getValue(), "texto⟦b⟧ab⟦/b⟧ normal");
    });

    it("cancels pending formatting with Escape or cursor movement", async function () {
        await setText("texto");
        editor.moveCursorTo(0, 5);
        editor.execCommand("toggleRichTextBold");
        editor.execCommand("cancelRichTextPendingFormat");
        editor.insert("!");
        await tick();
        assert.strictEqual(editor.getValue(), "texto!");

        await setText("texto");
        editor.moveCursorTo(0, 5);
        editor.execCommand("toggleRichTextBold");
        editor.moveCursorTo(0, 0);
        editor.insert("!");
        await tick();
        assert.strictEqual(editor.getValue(), "!texto");
    });

    it("cleans empty pairs when text is entered or the cursor leaves them", async function () {
        await setText("texto ⟦b⟧⟦/b⟧");
        editor.moveCursorTo(0, 0);
        await tick();
        assert.strictEqual(editor.getValue(), "texto ");

        await setText("texto ⟦i⟧⟦/i⟧");
        editor.moveCursorTo(0, 0);
        editor.insert("!");
        await tick();
        assert.strictEqual(editor.getValue(), "!texto ");
    });

    it("keeps markers intact at fold edges and removes empty formatting with one Undo", async function () {
        await setText("a⟦b⟧b⟦/b⟧c");
        editor.moveCursorTo(0, 5);
        editor.remove("left");
        await tick();
        assert.strictEqual(editor.getValue(), "ac");
        assert.strictEqual(editor.session.getDisplayLine(0), "ac");
        editor.undo();
        await tick();
        assert.strictEqual(editor.getValue(), "a⟦b⟧b⟦/b⟧c");
    });

    it("keeps active formatting paired separately on each line", async function () {
        await setText("texto");
        editor.moveCursorTo(0, 5);
        editor.execCommand("toggleRichTextItalic");
        editor.insert("um\ndois");
        await tick();
        assert.strictEqual(editor.getValue(), "texto⟦i⟧um⟦/i⟧\n⟦i⟧dois⟦/i⟧");
        assert.strictEqual(editor.session.getDisplayLine(0), "textoum");
        assert.strictEqual(editor.session.getDisplayLine(1), "dois");
        editor.undo();
        await tick();
        assert.strictEqual(editor.getValue(), "texto");
    });

    it("protects markers on Delete and removes empty pairs after word deletion", async function () {
        await setText("⟦b⟧forte⟦/b⟧ próximo");
        editor.moveCursorTo(0, 3);
        editor.remove("right");
        await tick();
        assert.strictEqual(editor.getValue(), "⟦b⟧orte⟦/b⟧ próximo");

        await setText("⟦b⟧orte⟦/b⟧ próximo");
        editor.moveCursorTo(0, 7);
        editor.session.markUndoGroup();
        editor.removeWordLeft();
        await tick();
        assert.strictEqual(editor.getValue(), " próximo");
        editor.undo();
        await tick();
        assert.strictEqual(editor.getValue(), "⟦b⟧orte⟦/b⟧ próximo");
    });

    it("does not format a tag line or logic token", async function () {
        await setText("#align: center\n~ x = 1");
        editor.moveCursorTo(0, 14);
        editor.execCommand("toggleRichTextItalic");
        editor.moveCursorTo(1, 7);
        editor.execCommand("toggleRichTextBold");
        await tick();
        assert.strictEqual(editor.getValue(), "#align: center\n~ x = 1");
    });

    it("keeps choices plain: no formatting on any kind of choice line", async function () {
        const lines = ["* escolha [texto] resposta", "+ escolha fixa [texto]", "* * escolha aninhada", "   + recuada [texto]"];
        for( const line of lines ) {
            await setText(line);
            editor.selection.setRange(new Range(0, 0, 0, line.length));
            ["toggleRichTextBold", "toggleRichTextItalic"].forEach(command => editor.execCommand(command));
            await tick();
            assert.strictEqual(editor.getValue(), line, line);
        }
        // Without a selection nothing is left pending either
        await setText("* escolha");
        editor.selection.moveCursorTo(0, 9);
        editor.execCommand("toggleRichTextBold");
        editor.insert(" x");
        await tick();
        assert.strictEqual(editor.getValue(), "* escolha x");
    });

    it("leaves markers already written in a choice visible, so the writer can remove them", async function () {
        await setText("* ⟦b⟧Abrir⟦/b⟧ a porta [⟦i⟧ou não⟦/i⟧]");
        assert.strictEqual(editor.session.getDisplayLine(0), "* ⟦b⟧Abrir⟦/b⟧ a porta [⟦i⟧ou não⟦/i⟧]");
        assert.strictEqual(editor.session.getAllFolds().length, 0);
    });

    it("still formats the story text of a gather", async function () {
        await setText("- Texto do gather");
        editor.selection.setRange(new Range(0, 2, 0, 7));
        editor.execCommand("toggleRichTextBold");
        await tick();
        assert.strictEqual(editor.getValue(), "- ⟦b⟧Texto⟦/b⟧ do gather");
    });

    it("reapplies marker folds when a story session is loaded", async function () {
        const EditSession = window.ace.require("ace/edit_session").EditSession;
        const loadedSession = new EditSession(
            "Texto⟦b⟧⟦i⟧⟦/i⟧⟦/b⟧ ⟦b⟧novo⟦/b⟧⟦b⟧⟦/b⟧"
        );
        loadedSession.setMode(new window.exports.InkMode());
        editor.setSession(loadedSession);
        await tick();
        assert.strictEqual(editor.session.getDisplayLine(0), "Texto novo");
        assert.strictEqual(editor.session.getAllFolds().length, 2);
        assert.strictEqual(editor.getValue(), "Texto ⟦b⟧novo⟦/b⟧");
        editor.setSession(primarySession);
        await tick();
    });
});
