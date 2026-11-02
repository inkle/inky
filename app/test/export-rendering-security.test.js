const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

describe("export story rendering", function () {
    it("renders story markup as plain text and replaces the passage on every choice", function () {
        const template = fs.readFileSync(
            path.join(__dirname, "../export-for-web-template/main.js"),
            "utf8"
        );
        const dom = new JSDOM(
            '<div class="outerContainer"><div id="story" class="container">' +
            '<div class="header"><h1>Story</h1><h2 class="byline"></h2></div><div id="story-passage"></div></div></div>' +
            '<a id="rewind"></a><a id="save"></a><a id="reload"></a>',
            { url: "https://stories.example/one/index.html", runScripts: "outside-only" }
        );
        const window = dom.window;
        const firstLineText = 'First <script>window.compromised = true</script> safe <img src="x" onerror="window.compromised = true">';
        const storyLines = [
            {
                text: firstLineText,
                tags: ["title: Platform", "titulo: legacy title", "align: center", "subtitle: hidden title", "author: hidden author", "mood: quiet", "LINK: javascript:window.compromised=true"]
            }
        ];
        const choiceText = '<svg onload="window.compromised=true"></svg>Choose this path';
        let phase = 0;
        const story = {
            globalTags: ["title: Global title", "author: <img src=x onerror=window.compromised=true>"],
            state: { toJson: () => "{}", LoadJson: () => {} },
            currentTags: [],
            currentChoices: [],
            get canContinue() { return storyLines.length > 0; },
            Continue() {
                const line = storyLines.shift();
                this.currentTags = line.tags;
                return line.text;
            },
            ChooseChoiceIndex() {
                if( phase === 0 ) {
                    phase = 1;
                    storyLines.push({ text: choiceText + "; then continue.", tags: [] });
                    storyLines.push({ text: "Second paragraph in the new turn.", tags: [] });
                    this.currentChoices = [{ index: 1, text: "Continue" }];
                } else {
                    storyLines.push({ text: "Third paragraph in the new turn.", tags: [] });
                    storyLines.push({ text: "Fourth paragraph in the new turn.", tags: [] });
                    this.currentChoices = [];
                }
            }
        };
        story.currentChoices = [{ index: 0, text: choiceText }];
        window.inkjs = { Story: function () { return story; } };
        window.storyContent = {};
        window.matchMedia = () => ({ matches: false });

        try {
            window.eval(template);
            const storyView = window.document.getElementById("story");
            const firstParagraph = storyView.querySelector("p:not(.tags)");

            assert.strictEqual(window.compromised, undefined);
            assert.strictEqual(window.document.querySelector(".byline").textContent, "");
            assert.strictEqual(storyView.querySelector(".scene-title").textContent, "Platform");
            assert.strictEqual(firstParagraph.classList.contains("alignCenter"), true);
            // Markup in the story is shown as written, never interpreted.
            assert.strictEqual(firstParagraph.textContent, firstLineText);
            assert.match(storyView.querySelector("p.tags").textContent, /subtitle: hidden title/);
            assert.match(storyView.querySelector("p.tags").textContent, /author: hidden author/);
            assert.match(storyView.querySelector("p.tags").textContent, /mood: quiet/);
            assert.match(storyView.querySelector("p.tags").textContent, /titulo: legacy title/);
            assert.doesNotMatch(storyView.querySelector("p.tags").textContent, /Global title|<img src=x/);
            assert.strictEqual(storyView.querySelector("script, img, svg"), null);

            const choice = storyView.querySelector(".choice button");
            assert.strictEqual(choice.type, "button");
            assert.strictEqual(choice.textContent, choiceText);
            choice.click();

            let renderedLines = Array.from(storyView.querySelectorAll("p:not(.choice):not(.tags)"), paragraph => paragraph.textContent);
            // The chosen passage replaced the one before it, with the echoed choice text removed.
            assert.deepStrictEqual(renderedLines, ["; then continue.", "Second paragraph in the new turn."]);
            assert.doesNotMatch(storyView.textContent, /First\s+.*safe/);
            assert.strictEqual(storyView.querySelector("script, img, svg"), null);

            storyView.querySelector(".choice button").click();
            renderedLines = Array.from(storyView.querySelectorAll("p:not(.choice):not(.tags)"), paragraph => paragraph.textContent);
            assert.deepStrictEqual(renderedLines, ["Third paragraph in the new turn.", "Fourth paragraph in the new turn."]);
            assert.strictEqual(storyView.querySelector("script, img, svg"), null);
        } finally {
            dom.window.close();
        }
    });
});
