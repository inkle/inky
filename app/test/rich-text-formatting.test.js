"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { RichTextFormatting } = require("../renderer/richTextFormatting.js");

describe("rich text formatting in the Ink editor", function () {
    let window, editor, Range, primarySession, richText;

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
        richText = RichTextFormatting.install(editor, Range);
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
        await setText("An ⟦b⟧boldest⟦/b⟧ and ⟦i⟧italic⟦/i⟧.\n⟦/b⟧ unpaired");
        assert.strictEqual(editor.session.getDisplayLine(0), "An boldest and italic.");
        assert.strictEqual(editor.session.getDisplayLine(1), "⟦/b⟧ unpaired");
        assert.strictEqual(editor.session.getAllFolds().length, 4);

        editor.insert("!");
        await tick();
        assert.strictEqual(editor.session.getDisplayLine(1), "⟦/b⟧ unpaired!");
        editor.undo();
        await tick();
        assert.strictEqual(editor.session.getDisplayLine(1), "⟦/b⟧ unpaired");
        editor.redo();
        await tick();
        assert.strictEqual(editor.session.getDisplayLine(1), "⟦/b⟧ unpaired!");
    });

    it("wraps long formatted lines at spaces, never inside a word", async function () {
        const words = ["metal", "scorched", "smells", "unusual", "during", "rains", "brave"];
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
        await setText("a⟦b⟧brave⟦/b⟧z");
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
        await setText("words selected");
        editor.moveCursorTo(0, 0);
        editor.selection.selectTo(0, 5);
        editor.execCommand("toggleRichTextBold");
        await tick();
        assert.strictEqual(editor.getValue(), "⟦b⟧words⟦/b⟧ selected");
        editor.undo();
        await tick();
        assert.strictEqual(editor.getValue(), "words selected");
    });

    it("formats each selected line separately and removes formatting when fully selected", async function () {
        await setText("original\nanother");
        editor.moveCursorTo(0, 0);
        editor.selection.selectTo(1, 7);
        editor.execCommand("toggleRichTextItalic");
        await tick();
        assert.strictEqual(editor.getValue(), "⟦i⟧original⟦/i⟧\n⟦i⟧another⟦/i⟧");

        editor.selection.setRange(new Range(0, 3, 0, 12));
        editor.execCommand("toggleRichTextItalic");
        await tick();
        assert.strictEqual(editor.getValue(), "original\n⟦i⟧another⟦/i⟧");
    });

    it("formats and removes visible selections that cross existing hidden markers", async function () {
        await setText("prior ⟦b⟧brave⟦/b⟧ later");
        editor.selection.setRange(new Range(0, 0, 0, editor.session.getLine(0).length));
        editor.execCommand("toggleRichTextBold");
        await tick();
        assert.strictEqual(editor.session.getDisplayLine(0), "prior brave later");
        assert.strictEqual(editor.getValue(), "⟦b⟧prior ⟦b⟧brave⟦/b⟧ later⟦/b⟧");

        editor.selection.setRange(new Range(0, 0, 0, editor.session.getLine(0).length));
        editor.execCommand("toggleRichTextBold");
        await tick();
        assert.strictEqual(editor.getValue(), "prior brave later");
    });

    it("starts and stops formatting at the caret and safely deletes formatted text", async function () {
        await setText("words");
        editor.moveCursorTo(0, 5);
        editor.execCommand("toggleRichTextBold");
        editor.insert("brave");
        await tick();
        assert.strictEqual(editor.session.getDisplayLine(0), "wordsbrave");

        editor.execCommand("toggleRichTextBold");
        editor.insert(" normal");
        await tick();
        assert.strictEqual(editor.session.getDisplayLine(0), "wordsbrave normal");
        assert.strictEqual(editor.session.getAllFolds().length, 2);

        editor.moveCursorTo(0, 13);
        for( let i = 0; i < 5; i++ ) editor.remove("left");
        await tick();
        assert.ok(!editor.getValue().includes("⟦/b⟧"));
        assert.strictEqual(editor.session.getDisplayLine(0), "words normal");
    });

    it("toggles an empty format off without leaving hidden markers", async function () {
        await setText("words");
        editor.moveCursorTo(0, 5);
        editor.execCommand("toggleRichTextBold");
        editor.execCommand("toggleRichTextBold");
        await tick();
        assert.strictEqual(editor.getValue(), "words");
        editor.undo();
        await tick();
        assert.strictEqual(editor.getValue(), "words");
    });

    it("keeps no-selection formatting pending until text is entered", async function () {
        await setText("words");
        editor.moveCursorTo(0, 5);
        editor.execCommand("toggleRichTextBold");
        assert.strictEqual(editor.getValue(), "words");
        editor.insert("a");
        editor.insert("b");
        await tick();
        assert.strictEqual(editor.getValue(), "words⟦b⟧ab⟦/b⟧");
        editor.execCommand("toggleRichTextBold");
        editor.insert(" normal");
        await tick();
        assert.strictEqual(editor.getValue(), "words⟦b⟧ab⟦/b⟧ normal");
    });

    it("cancels pending formatting with Escape or cursor movement", async function () {
        await setText("words");
        editor.moveCursorTo(0, 5);
        editor.execCommand("toggleRichTextBold");
        editor.execCommand("cancelRichTextPendingFormat");
        editor.insert("!");
        await tick();
        assert.strictEqual(editor.getValue(), "words!");

        await setText("words");
        editor.moveCursorTo(0, 5);
        editor.execCommand("toggleRichTextBold");
        editor.moveCursorTo(0, 0);
        editor.insert("!");
        await tick();
        assert.strictEqual(editor.getValue(), "!words");
    });

    it("cleans empty pairs when text is entered or the cursor leaves them", async function () {
        await setText("words ⟦b⟧⟦/b⟧");
        editor.moveCursorTo(0, 0);
        await tick();
        assert.strictEqual(editor.getValue(), "words ");

        await setText("words ⟦i⟧⟦/i⟧");
        editor.moveCursorTo(0, 0);
        editor.insert("!");
        await tick();
        assert.strictEqual(editor.getValue(), "!words ");
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
        await setText("words");
        editor.moveCursorTo(0, 5);
        editor.execCommand("toggleRichTextItalic");
        editor.insert("one\ntwo");
        await tick();
        assert.strictEqual(editor.getValue(), "words⟦i⟧one⟦/i⟧\n⟦i⟧two⟦/i⟧");
        assert.strictEqual(editor.session.getDisplayLine(0), "wordsone");
        assert.strictEqual(editor.session.getDisplayLine(1), "two");
        editor.undo();
        await tick();
        assert.strictEqual(editor.getValue(), "words");
    });

    it("protects markers on Delete and removes empty pairs after word deletion", async function () {
        await setText("⟦b⟧brave⟦/b⟧ forward");
        editor.moveCursorTo(0, 3);
        editor.remove("right");
        await tick();
        assert.strictEqual(editor.getValue(), "⟦b⟧rave⟦/b⟧ forward");

        await setText("⟦b⟧rave⟦/b⟧ forward");
        editor.moveCursorTo(0, 7);
        editor.session.markUndoGroup();
        editor.removeWordLeft();
        await tick();
        assert.strictEqual(editor.getValue(), " forward");
        editor.undo();
        await tick();
        assert.strictEqual(editor.getValue(), "⟦b⟧rave⟦/b⟧ forward");
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
        const lines = ["* choice [words] response", "+ choice fixa [words]", "* * choice aninhada", "   + indented [words]"];
        for( const line of lines ) {
            await setText(line);
            editor.selection.setRange(new Range(0, 0, 0, line.length));
            ["toggleRichTextBold", "toggleRichTextItalic"].forEach(command => editor.execCommand(command));
            await tick();
            assert.strictEqual(editor.getValue(), line, line);
        }
        // Without a selection nothing is left pending either
        await setText("* choice");
        editor.selection.moveCursorTo(0, 9);
        editor.execCommand("toggleRichTextBold");
        editor.insert(" x");
        await tick();
        assert.strictEqual(editor.getValue(), "* choice x");
    });

    it("leaves markers already written in a choice visible, so the writer can remove them", async function () {
        await setText("* ⟦b⟧Open⟦/b⟧ the door [⟦i⟧or not⟦/i⟧]");
        assert.strictEqual(editor.session.getDisplayLine(0), "* ⟦b⟧Open⟦/b⟧ the door [⟦i⟧or not⟦/i⟧]");
        assert.strictEqual(editor.session.getAllFolds().length, 0);
    });

    it("keeps gathers plain too: only the plain story text is formatted", async function () {
        for( const line of ["- Gather text", "- (label) words", "   - - nested gather"] ) {
            await setText(line);
            editor.selection.setRange(new Range(0, 0, 0, line.length));
            editor.execCommand("toggleRichTextBold");
            await tick();
            assert.strictEqual(editor.getValue(), line, line);
        }
        // A divert starts with "-" but it is not a gather; it is not story text either
        await setText("-> end");
        editor.selection.setRange(new Range(0, 0, 0, 6));
        editor.execCommand("toggleRichTextBold");
        await tick();
        assert.strictEqual(editor.getValue(), "-> end");
        await setText("Normal text -> end");
        editor.selection.setRange(new Range(0, 0, 0, 5));
        editor.execCommand("toggleRichTextBold");
        await tick();
        assert.strictEqual(editor.getValue(), "⟦b⟧Norma⟦/b⟧l text -> end");
    });

    it("keeps the selection on the same text after formatting, so bold and italic can be combined", async function () {
        await setText("A tide rises");
        editor.selection.setRange(new Range(0, 2, 0, 6));
        editor.execCommand("toggleRichTextBold");
        await tick();
        assert.strictEqual(editor.getValue(), "A ⟦b⟧tide⟦/b⟧ rises");
        assert.strictEqual(editor.getSelectedText(), "tide");
        editor.execCommand("toggleRichTextItalic");
        await tick();
        assert.strictEqual(editor.getValue(), "A ⟦b⟧⟦i⟧tide⟦/i⟧⟦/b⟧ rises");
        assert.strictEqual(editor.getSelectedText(), "tide");
        editor.execCommand("toggleRichTextBold");
        await tick();
        assert.strictEqual(editor.getValue(), "A ⟦i⟧tide⟦/i⟧ rises");
        assert.strictEqual(editor.getSelectedText(), "tide");
    });

    it("keeps a selection that covers several lines", async function () {
        await setText("Original line\nAnother line");
        editor.selection.setRange(new Range(0, 0, 1, 7));
        editor.execCommand("toggleRichTextItalic");
        await tick();
        assert.strictEqual(editor.getValue(), "⟦i⟧Original line⟦/i⟧\n⟦i⟧Another⟦/i⟧ line");
        // The visible text stays selected, from its first letter to the end of "Another"
        const kept = editor.getSelectionRange();
        assert.deepStrictEqual([kept.start.row, kept.start.column, kept.end.row, kept.end.column], [0, 3, 1, 10]);
    });

    it("tells the toolbar what the selection allows and what it already has", async function () {
        const state = () => richText.selectionState(editor);
        await setText("A tide rises\n* choice\n#tag: x\n- gather");
        assert.deepStrictEqual(state(), { enabled: false, bold: false, italic: false }, "empty selection");
        editor.selection.setRange(new Range(0, 2, 0, 6));
        assert.deepStrictEqual(state(), { enabled: true, bold: false, italic: false });
        editor.execCommand("toggleRichTextBold");
        await tick();
        assert.deepStrictEqual(state(), { enabled: true, bold: true, italic: false });
        editor.selection.setRange(new Range(0, 0, 0, 12));
        assert.deepStrictEqual(state(), { enabled: true, bold: false, italic: false }, "only part is bold");
        editor.selection.setRange(new Range(1, 0, 1, 5));
        assert.strictEqual(state().enabled, false, "a choice");
        editor.selection.setRange(new Range(3, 0, 3, 5));
        assert.strictEqual(state().enabled, false, "a gather");
        editor.selection.setRange(new Range(2, 0, 2, 4));
        assert.strictEqual(state().enabled, false, "a tag");
        editor.selection.setRange(new Range(0, 11, 1, 0));
        assert.strictEqual(state().enabled, true, "text up to the line break");
        await setText("A   B");
        editor.selection.setRange(new Range(0, 1, 0, 4));
        assert.strictEqual(state().enabled, false, "only spaces");
    });

    it("reapplies marker folds when a story session is loaded", async function () {
        const EditSession = window.ace.require("ace/edit_session").EditSession;
        const loadedSession = new EditSession(
            "Words⟦b⟧⟦i⟧⟦/i⟧⟦/b⟧ ⟦b⟧new⟦/b⟧⟦b⟧⟦/b⟧"
        );
        loadedSession.setMode(new window.exports.InkMode());
        editor.setSession(loadedSession);
        await tick();
        assert.strictEqual(editor.session.getDisplayLine(0), "Words new");
        assert.strictEqual(editor.session.getAllFolds().length, 2);
        assert.strictEqual(editor.getValue(), "Words ⟦b⟧new⟦/b⟧");
        editor.setSession(primarySession);
        await tick();
    });
});
