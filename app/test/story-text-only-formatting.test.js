const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const mainSource = fs.readFileSync(path.join(__dirname, "../export-for-web-template/main.js"), "utf8");
const richText = fs.readFileSync(path.join(__dirname, "../renderer/richTextDom.js"), "utf8");

// A story with one scripted turn, run through the real exported main.js
function run(line, choices, withRichText) {
    const story = {
        globalTags: [],
        state: { toJson: () => "{}", LoadJson: () => {} },
        currentTags: [],
        currentChoices: choices,
        get canContinue() { return line.text !== null; },
        Continue() {
            const text = line.text;
            line.text = null;
            this.currentTags = line.tags || [];
            return text;
        },
        ChooseChoiceIndex() {}
    };
    const dom = new JSDOM(
        '<div class="outerContainer"><div id="story" class="container">' +
        '<div class="header"><h1>Story</h1><h2 class="byline"></h2></div><div id="story-passage"></div></div></div>' +
        '<a id="rewind"></a><a id="save"></a><a id="reload"></a>',
        { url: "https://stories.example/one/index.html", runScripts: "outside-only" }
    );
    const window = dom.window;
    window.matchMedia = () => ({ matches: false });
    window.inkjs = { Story: function () { return story; } };
    window.storyContent = {};
    if( withRichText ) window.eval(richText);
    try {
        window.eval(mainSource);
    } catch(error) {
        window.close();
        throw error;
    }
    return { window, storyView: window.document.getElementById("story") };
}

describe("formatting is for the story text only", function () {
    [true, false].forEach(withRichText => {
        const label = withRichText ? "with richtext.js" : "without richtext.js (fallback)";

        it("formats the story text, and keeps choices and scene titles plain, " + label, function () {
            const { window, storyView } = run(
                { text: "A maré ⟦b⟧subiu⟦/b⟧ e ⟦i⟧cobriu⟦/i⟧.", tags: ["title: The ⟦b⟧Signal⟦/b⟧"] },
                [{ index: 0, text: "⟦b⟧Climb⟦/b⟧ to the ⟦i⟧lantern⟦/i⟧" }, { index: 1, text: "Go back" }],
                withRichText
            );
            try {
                const html = storyView.innerHTML;
                assert.ok(!html.includes("\u27e6") && !html.includes("\u27e7"), "no marker may reach the player");

                const paragraph = storyView.querySelector("p:not(.choice):not(.tags)");
                if( withRichText ) {
                    assert.strictEqual(paragraph.innerHTML, "A maré <strong>subiu</strong> e <em>cobriu</em>.");
                } else {
                    assert.strictEqual(paragraph.textContent, "A maré subiu e cobriu.");
                }

                const buttons = Array.from(storyView.querySelectorAll(".choice button"));
                assert.deepStrictEqual(buttons.map(b => b.textContent), ["Climb to the lantern", "Go back"]);
                buttons.forEach(b => assert.strictEqual(b.querySelector("strong, em"), null));

                const title = storyView.querySelector("h2.scene-title");
                assert.strictEqual(title.textContent, "The Signal");
                assert.strictEqual(title.querySelector("strong, em"), null);
            } finally {
                window.close();
            }
        });
    });
});
