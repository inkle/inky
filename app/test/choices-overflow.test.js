const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { attach } = require("../renderer/pager.js");

const css = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

describe("adaptive choices footer (Preview and Web Export)", function () {
    it("grows only to the same height ceiling and shows a thin scrollbar on overflow", function () {
        for( const file of ["renderer/gameChrome.css", "export-for-web-template/style.css"] ) {
            const style = css(file);
            assert.match(style, /\.story-choices\s*\{[^}]*max-height:\s*52%;/);
            assert.match(style, /\.story-choices\s*\{[^}]*overflow-y:\s*auto;/);
            assert.match(style, /\.story-choices\s*\{[^}]*scrollbar-width:\s*thin;/);
            assert.match(style, /\.choices-more-below::before/);
            assert.doesNotMatch(style, /\.story-choices::-webkit-scrollbar\s*\{\s*display:\s*none;/);
        }
    });

    it("makes only overflowing choices keyboard-accessible, and removes the cue at the end", function () {
        const dom = new JSDOM(
            '<div class="container" id="frame"><div class="story-passage"></div>' +
            '<div class="story-pager" hidden></div><div class="story-choices"></div></div>',
            { pretendToBeVisual: true }
        );
        try {
            const doc = dom.window.document;
            const frame = doc.querySelector("#frame");
            const passage = frame.querySelector(".story-passage");
            const choices = frame.querySelector(".story-choices");
            const nav = frame.querySelector(".story-pager");
            let contentHeight = 180, viewHeight = 180;
            Object.defineProperty(passage, "clientHeight", { value: 220 });
            Object.defineProperty(choices, "clientHeight", { get: () => viewHeight });
            Object.defineProperty(choices, "scrollHeight", { get: () => contentHeight });
            const pager = attach({ frame, passage, nav, getChoices: () => choices });
            pager.refresh();

            assert.strictEqual(choices.hasAttribute("tabindex"), false);
            assert.strictEqual(frame.classList.contains("choices-more-below"), false);

            contentHeight = 720;
            choices.dispatchEvent(new dom.window.Event("scroll"));
            assert.strictEqual(choices.tabIndex, 0);
            assert.strictEqual(choices.getAttribute("role"), "region");
            assert.ok(frame.classList.contains("choices-more-below"));
            assert.ok(choices.classList.contains("choices-scrollable"));

            choices.scrollTop = 540;
            choices.dispatchEvent(new dom.window.Event("scroll"));
            assert.ok(!frame.classList.contains("choices-more-below"));
            assert.ok(choices.classList.contains("choices-scrollable"));

            choices.scrollTop = 0;
            contentHeight = 180;
            choices.dispatchEvent(new dom.window.Event("scroll"));
            assert.ok(!choices.classList.contains("choices-scrollable"));
            assert.ok(!choices.hasAttribute("tabindex"));
            assert.ok(!choices.hasAttribute("role"));

            contentHeight = 720;
            choices.hidden = true;
            choices.dispatchEvent(new dom.window.Event("scroll"));
            assert.ok(!frame.classList.contains("choices-more-below"));
        } finally {
            dom.window.close();
        }
    });

    it("resets choice scroll position when changing scenes on both renderers", function () {
        assert.match(css("renderer/playerView.js"), /\$choices\[0\]\.scrollTop\s*=\s*0;/);
        assert.match(css("export-for-web-template/main.js"), /choicesContainer\.scrollTop\s*=\s*0;/);
    });
});
