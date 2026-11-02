const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const template = fs.readFileSync(
    path.join(__dirname, "../export-for-web-template/main.js"),
    "utf8"
);

// A story whose turns are plain lists: [0] is the opening, each choice advances one turn.
function makeStory(turns) {
    let current = 0;
    const turn = () => turns[current];
    const story = {
        globalTags: [],
        state: { toJson: () => "{}", LoadJson: () => {} },
        currentTags: [],
        currentChoices: turn().choices,
        get canContinue() { return turn().lines.length > 0; },
        Continue() {
            const line = turn().lines.shift();
            this.currentTags = line.tags || [];
            return line.text;
        },
        ChooseChoiceIndex() {
            current++;
            this.currentChoices = turn().choices;
        }
    };
    return story;
}

// Runs the export template in jsdom. Geometry stubs stand in for the layout jsdom lacks.
function render(story, geometry) {
    const dom = new JSDOM(
        '<div class="outerContainer"><div id="story" class="container">' +
        '<div class="header"><h1>Story</h1><h2 class="byline"></h2></div><div id="story-passage"></div></div></div>' +
        '<a id="rewind"></a><a id="save"></a><a id="reload"></a>',
        { url: "https://stories.example/one/index.html", runScripts: "outside-only" }
    );
    const window = dom.window;
    const scrollPositions = [];
    let scrollTop = 0;
    if( geometry ) {
        const passage = window.document.getElementById("story-passage");
        passage.style.paddingTop = "40px";
        Object.defineProperties(passage, {
            scrollHeight: { configurable: true, value: geometry.scrollHeight },
            clientHeight: { configurable: true, value: geometry.clientHeight },
            scrollTop: {
                configurable: true,
                get: () => scrollTop,
                set: value => { scrollTop = value; scrollPositions.push(value); }
            }
        });
        Object.defineProperty(window.HTMLElement.prototype, "offsetTop", {
            configurable: true,
            get: () => geometry.startTop
        });
        // The story's own height. The scroll room below the turn is derived from it.
        Object.defineProperty(window.HTMLElement.prototype, "offsetHeight", {
            configurable: true,
            get: () => Math.max(0, geometry.contentHeight - geometry.startTop)
        });
    }
    window.matchMedia = () => ({ matches: false });
    window.inkjs = { Story: function () { return story; } };
    window.storyContent = {};

    try {
        window.eval(template);
        return {
            window,
            dom,
            storyView: window.document.getElementById("story"),
            passage: window.document.getElementById("story-passage"),
            scrollPositions
        };
    } catch(error) {
        dom.window.close();
        throw error;
    }
}

function paragraphs(storyView) {
    return Array.from(storyView.querySelectorAll("p:not(.choice):not(.tags)"), node => node.textContent);
}

function clickChoice(storyView) {
    storyView.querySelector(".choice button").click();
}

describe("export story history", function () {
    it("replaces the previous passage when a choice is taken", function () {
        const story = makeStory([
            { lines: [{ text: "The beach is cold." }], choices: [{ index: 0, text: "Walk on" }] },
            { lines: [{ text: "The tide rises." }], choices: [] }
        ]);
        const { dom, storyView, passage } = render(story);
        try {
            assert.deepStrictEqual(paragraphs(storyView), ["The beach is cold."]);
            clickChoice(storyView);

            assert.deepStrictEqual(paragraphs(storyView), ["The tide rises."]);
            assert.strictEqual(storyView.querySelectorAll(".choice").length, 0);
            assert.strictEqual(storyView.querySelector("hr"), null);
            assert.strictEqual(passage.lastElementChild.textContent, "The tide rises.");
        } finally {
            dom.window.close();
        }
    });
});

describe("export choices footer", function () {
    it("keeps the choices in a footer below the scrolling passage", function () {
        const story = makeStory([
            { lines: [{ text: "A room." }], choices: [{ index: 0, text: "One" }, { index: 1, text: "Two" }] },
            { lines: [{ text: "Out." }], choices: [] }
        ]);
        const { dom, storyView, passage } = render(story);
        try {
            const footer = storyView.querySelector(".story-choices");
            assert.ok(footer);
            assert.strictEqual(passage.nextElementSibling, footer);
            assert.strictEqual(passage.querySelectorAll(".choice").length, 0);
            assert.strictEqual(footer.querySelectorAll(".choice").length, 2);
            assert.strictEqual(footer.hidden, false);
            assert.strictEqual(storyView.classList.contains("has-choices"), true);

            storyView.querySelector(".choice button").click();
            assert.strictEqual(footer.hidden, true);
            assert.strictEqual(footer.querySelectorAll(".choice").length, 0);
            assert.strictEqual(storyView.classList.contains("has-choices"), false);
        } finally {
            dom.window.close();
        }
    });

    it("exports every choice without a choice-limit warning", function () {
        const choices = ["One", "Two", "Three", "Four", "Five", "Six"]
            .map((text, index) => ({ index: index, text: text }));
        const story = makeStory([{ lines: [{ text: "A room." }], choices: choices }]);
        const { dom, storyView } = render(story);
        try {
            const footer = storyView.querySelector(".story-choices");
            assert.strictEqual(footer.querySelectorAll(".choice").length, 6);
            assert.strictEqual(footer.querySelector(".choice-limit"), null);
        } finally {
            dom.window.close();
        }
    });
});

describe("export frame scrolling", function () {
    function takeTurn(geometry) {
        const story = makeStory([
            { lines: [{ text: "Old text." }], choices: [{ index: 0, text: "Next" }] },
            { lines: [{ text: "New text." }], choices: [] }
        ]);
        const result = render(story, geometry);
        clickChoice(result.storyView);
        result.dom.window.close();
        return {
            positions: result.scrollPositions,
            fill: result.passage.style.getPropertyValue("--story-scroll-fill"),
            cover: result.passage.style.getPropertyValue("--story-top-cover")
        };
    }

    it("starts the replacement passage at the top of the frame", function () {
        const result = takeTurn({ startTop: 500, contentHeight: 2000, scrollHeight: 2000, clientHeight: 600 });
        // The opening turn, the clear on the click and the new turn all land at the top.
        assert.deepStrictEqual(result.positions, [0, 0, 0]);
        assert.strictEqual(result.fill, "0px");
        assert.strictEqual(result.cover, "40px");
    });

    it("hides the turn divider in the exported stylesheet", function () {
        const css = fs.readFileSync(
            path.join(__dirname, "../export-for-web-template/style.css"),
            "utf8"
        );
        assert.match(css, /\.story-passage hr\s*\{\s*display:\s*none;/);
    });
});
