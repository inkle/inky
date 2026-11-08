"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { RichTextFormatting } = require("../renderer/richTextFormatting.js");
const { RichTextToolbar } = require("../renderer/richTextToolbar.js");

describe("floating bold and italic toolbar", function () {
    describe("placement", function () {
        const bounds = { left: 100, top: 50, right: 900, bottom: 650 };
        const size = { width: 80, height: 38 };

        it("goes above the selection, centered on it", function () {
            const spot = RichTextToolbar.place({ centerX: 400, topY: 300, bottomY: 320 }, size, bounds);
            assert.deepStrictEqual(spot, { left: 360, top: 254, placement: "above" });
        });

        it("goes below the selection when there is no room above", function () {
            const spot = RichTextToolbar.place({ centerX: 400, topY: 60, bottomY: 80 }, size, bounds);
            assert.deepStrictEqual(spot, { left: 360, top: 88, placement: "below" });
        });

        it("stays inside the editor at both sides", function () {
            assert.strictEqual(RichTextToolbar.place({ centerX: 100, topY: 300, bottomY: 320 }, size, bounds).left, 106);
            assert.strictEqual(RichTextToolbar.place({ centerX: 900, topY: 300, bottomY: 320 }, size, bounds).left, 814);
        });

        it("hides when there is no room anywhere", function () {
            assert.strictEqual(RichTextToolbar.place({ centerX: 400, topY: 60, bottomY: 640 }, size, bounds), null);
        });
    });

    describe("in the editor", function () {
        let window, editor, Range, toolbar;

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
            // jsdom has no layout: give the editor a size so the toolbar has room
            editor.container.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 });
            const richText = RichTextFormatting.install(editor, Range);
            toolbar = RichTextToolbar.install(editor, richText);
        });

        after(function () {
            window.close();
        });

        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const tick = () => wait(25);
        const settle = () => wait(130);
        const setText = async text => {
            editor.setValue(text, 1);
            editor.clearSelection();
            editor.focus();
            await tick();
            editor.session.getUndoManager().reset();
            toolbar.hide();
        };
        const button = format => toolbar.element.querySelector('[data-format="' + format + '"]');
        const visible = () => !toolbar.element.hidden;

        it("has a bold and an italic button, named for screen readers, with their shortcuts", function () {
            assert.strictEqual(toolbar.element.getAttribute("role"), "toolbar");
            assert.deepStrictEqual(Array.from(toolbar.element.querySelectorAll("button"), b => b.getAttribute("aria-label")), ["Bold", "Italic"]);
            assert.strictEqual(button("b").title, "Bold (Ctrl+B)");
            assert.strictEqual(button("i").title, "Italic (Ctrl+I)");
            assert.strictEqual(toolbar.element.hidden, true);
            assert.strictEqual(button("b").tabIndex, -1);
        });

        it("appears over selected story text and goes away when the selection does", async function () {
            await setText("A tide rises before sunrise.");
            editor.selection.setRange(new Range(0, 2, 0, 6));
            await settle();
            assert.ok(visible());
            assert.strictEqual(button("b").getAttribute("aria-pressed"), "false");
            editor.selection.clearSelection();
            assert.ok(!visible());
        });

        it("does not appear over choices, gathers, tags or logic", async function () {
            const lines = ["* choice [text]", "- gather", "#music: dark.mp3", "~ x = 1"];
            for( const line of lines ) {
                await setText(line);
                editor.selection.setRange(new Range(0, 2, 0, line.length));
                await settle();
                assert.ok(!visible(), line);
            }
            await setText("A tide rises.");
            editor.selection.setRange(new Range(0, 2, 0, 6));
            await settle();
            assert.ok(visible());
            editor.selection.setRange(new Range(0, 0, 0, 0));
        });

        it("formats the selection with one click, keeps it selected and shows what is applied", async function () {
            await setText("A tide rises before sunrise.");
            editor.selection.setRange(new Range(0, 2, 0, 6));
            await settle();

            button("b").click();
            await tick();
            assert.strictEqual(editor.getValue(), "A ⟦b⟧tide⟦/b⟧ rises before sunrise.");
            assert.strictEqual(editor.getSelectedText(), "tide");
            assert.ok(visible(), "the toolbar stays for the next click");
            assert.strictEqual(button("b").getAttribute("aria-pressed"), "true");
            assert.ok(button("b").classList.contains("is-active"));
            assert.strictEqual(button("i").getAttribute("aria-pressed"), "false");

            button("i").click();
            await tick();
            assert.strictEqual(editor.getValue(), "A ⟦b⟧⟦i⟧tide⟦/i⟧⟦/b⟧ rises before sunrise.");
            assert.strictEqual(button("i").getAttribute("aria-pressed"), "true");

            button("b").click();
            await tick();
            assert.strictEqual(editor.getValue(), "A ⟦i⟧tide⟦/i⟧ rises before sunrise.");
            assert.strictEqual(button("b").getAttribute("aria-pressed"), "false");
            assert.strictEqual(button("i").getAttribute("aria-pressed"), "true");

            button("i").click();
            await tick();
            assert.strictEqual(editor.getValue(), "A tide rises before sunrise.");
            assert.strictEqual(editor.getSelectedText(), "tide");
        });

        it("makes each click one step of Undo", async function () {
            await setText("A tide rises.");
            editor.selection.setRange(new Range(0, 2, 0, 6));
            await settle();
            button("b").click();
            await tick();
            button("i").click();
            await tick();
            editor.undo();
            await tick();
            assert.strictEqual(editor.getValue(), "A ⟦b⟧tide⟦/b⟧ rises.");
            editor.undo();
            await tick();
            assert.strictEqual(editor.getValue(), "A tide rises.");
        });

        it("formats a selection over several lines, line by line", async function () {
            await setText("Opening line\nAnother line");
            editor.selection.setRange(new Range(0, 0, 1, 7));
            await settle();
            assert.ok(visible());
            button("i").click();
            await tick();
            assert.strictEqual(editor.getValue(), "⟦i⟧Opening line⟦/i⟧\n⟦i⟧Another⟦/i⟧ line");
            assert.strictEqual(button("i").getAttribute("aria-pressed"), "true");
        });

        it("does not take the focus or the selection away from the editor", async function () {
            await setText("A tide rises.");
            editor.selection.setRange(new Range(0, 2, 0, 6));
            await settle();
            const down = new window.MouseEvent("mousedown", { bubbles: true, cancelable: true });
            button("b").dispatchEvent(down);
            assert.strictEqual(down.defaultPrevented, true);
            button("b").click();
            await tick();
            assert.ok(editor.isFocused());
            assert.strictEqual(editor.getSelectedText(), "tide");
        });

        it("waits for the mouse button to be released before it appears", async function () {
            await setText("A tide rises.");
            editor.container.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
            editor.selection.setRange(new Range(0, 2, 0, 6));
            await settle();
            assert.ok(!visible(), "still dragging");
            window.document.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true }));
            await settle();
            assert.ok(visible());
        });

        it("goes away when the editor loses the focus", async function () {
            await setText("A tide rises.");
            editor.selection.setRange(new Range(0, 2, 0, 6));
            await settle();
            assert.ok(visible());
            editor.blur();
            await settle();
            assert.ok(!visible());
            editor.focus();
        });

        it("sits above the line, or below it when the selection is at the top of the editor", async function () {
            await setText("A tide rises.");
            editor.renderer.textToScreenCoordinates = () => ({ pageX: 300, pageY: 300 });
            editor.selection.setRange(new Range(0, 2, 0, 6));
            await settle();
            assert.strictEqual(toolbar.element.dataset.placement, "above");
            editor.renderer.textToScreenCoordinates = () => ({ pageX: 300, pageY: 2 });
            editor.selection.setRange(new Range(0, 3, 0, 6));
            await settle();
            assert.strictEqual(toolbar.element.dataset.placement, "below");
            delete editor.renderer.textToScreenCoordinates;
        });
    });
});
