const assert = require("assert");
const { JSDOM } = require("jsdom");

describe("Preview selected choice text", function () {
    function withPlayer(run) {
        const dom = new JSDOM('<div id="player"><div class="innerText active"></div></div>');
        const previousWindow = global.window;
        const previousDocument = global.document;
        const previousDOMParser = global.DOMParser;
        const previousNodeFilter = global.NodeFilter;
        const playerViewPath = require.resolve("../renderer/playerView.js");
        const jqueryPath = require.resolve("../renderer/jquery-2.2.3.min.js");
        const i18n = require("../renderer/i18n.js");
        const translate = i18n._;
        i18n._ = text => text;

        global.window = dom.window;
        global.document = dom.window.document;
        global.DOMParser = dom.window.DOMParser;
        global.NodeFilter = dom.window.NodeFilter;
        delete require.cache[jqueryPath];
        delete require.cache[playerViewPath];

        try {
            const playerView = require("../renderer/playerView.js").PlayerView;
            playerView.setAnimationEnabled(false);
            run(playerView, dom.window.document);
        } finally {
            i18n._ = translate;
            delete require.cache[playerViewPath];
            delete require.cache[jqueryPath];
            if( previousWindow === undefined ) delete global.window;
            else global.window = previousWindow;
            if( previousDocument === undefined ) delete global.document;
            else global.document = previousDocument;
            if( previousDOMParser === undefined ) delete global.DOMParser;
            else global.DOMParser = previousDOMParser;
            if( previousNodeFilter === undefined ) delete global.NodeFilter;
            else global.NodeFilter = previousNodeFilter;
            dom.window.close();
        }
    }

    it("removes the chosen label from the start of the next passage", function () {
        withPlayer((playerView, document) => {
            playerView.addTextSection("The previous scene.");
            playerView.addChoice({ choice: { text: "Continue", tags: [] } }, () => {
                playerView.addTextSection("Continue\nYou leave the forest behind.");
                playerView.addTags([]);
                playerView.contentReady();
            });

            document.querySelector(".choice-button").click();

            const paragraphs = document.querySelectorAll(".innerText.active p.storyText");
            assert.strictEqual(paragraphs.length, 1);
            assert.strictEqual(paragraphs[0].textContent, "You leave the forest behind.");
            assert.strictEqual(paragraphs[0].textContent.includes("Continue"), false);
        });
    });

    it("does not create an empty paragraph when the choice label is the whole output", function () {
        withPlayer((playerView, document) => {
            playerView.addChoice({ choice: { text: "Finish", tags: [] } }, () => {
                playerView.addTextSection("Finish");
                playerView.addTags([]);
                playerView.contentReady();
            });

            document.querySelector(".choice-button").click();

            assert.strictEqual(document.querySelector(".innerText.active p.storyText"), null);
        });
    });
    it("keeps the old passage while IPC messages arrive, commits once, and ignores double clicks", function () {
        withPlayer((playerView, document) => {
            playerView.setAnimationEnabled(true);
            playerView.addTextSection("Old passage.");
            playerView.addTags([]);
            let calls = 0;
            playerView.addChoice({choice: {text: "Next", tags: []}}, () => calls++);
            const button = document.querySelector(".choice-button");
            const frame = document.querySelector(".innerText.active");
            let layouts = 0;
            frame.inkyPager.refresh = () => layouts++;
            button.click();
            button.click();
            assert.strictEqual(calls, 1);
            for (let i = 0; i < 100; ++i) {
                playerView.addTextSection("New paragraph " + i);
                playerView.addTags(i === 0 ? ["title: New", "screen"] : ["__inky_paragraph_gap__: 1"]);
                assert.strictEqual(document.querySelector("p.storyText").textContent, "Old passage.");
            }
            playerView.addChoice({choice: {text: "Finish", tags: []}}, () => {});
            assert.strictEqual(layouts, 0);
            playerView.contentReady();
            assert.strictEqual(layouts, 1);
            assert.strictEqual(document.querySelectorAll("p.storyText").length, 100);
            assert.strictEqual(document.querySelector(".scene-title").textContent, "New");
            assert.strictEqual(document.querySelectorAll(".inky-paragraph-gap").length, 99);
            assert.strictEqual(document.querySelector(".choice-button").textContent, "Finish");
            assert.strictEqual(frame.hasAttribute("aria-busy"), false);
            assert.strictEqual(window.jQuery.timers.length, 0, "text and choices must not animate");
        });
    });

    it("commits errors, watched expressions and endings with the buffered turn", function () {
        withPlayer((playerView, document) => {
            playerView.addTextSection("Old.");
            playerView.addChoice({choice: {text: "Finish", tags: []}}, () => {});
            document.querySelector(".choice-button").click();
            playerView.addTextSection("Last passage.");
            playerView.addTags([]);
            playerView.addLineError({lineNumber: 7, message: "Runtime warning"}, () => {});
            playerView.addEvaluationResult("score = 7");
            playerView.addEndingMarker();
            assert.strictEqual(document.querySelector(".story-ending"), null);
            playerView.contentReady();
            assert.strictEqual(document.querySelector("p.storyText").textContent, "Last passage.");
            assert.match(document.querySelector(".error").textContent, /Runtime warning/);
            assert.strictEqual(document.querySelector(".evaluationResult").textContent, "score = 7");
            assert(document.querySelector(".story-ending"));
            assert(document.querySelector(".story-replay-choice"));
        });
    });

    it("discards an unfinished turn when a new compiler session replaces it", function () {
        withPlayer((playerView, document) => {
            document.querySelector("#player").insertAdjacentHTML("beforeend", '<div class="hiddenBuffer"><div class="innerText"></div></div>');
            playerView.addTextSection("Old.");
            playerView.addChoice({choice: {text: "Next", tags: []}}, () => {});
            document.querySelector(".choice-button").click();
            playerView.addTextSection("Stale turn.");
            playerView.addTags([]);
            playerView.prepareForNewPlaythrough("replacement");
            playerView.addTextSection("New compilation.");
            playerView.addTags([]);
            playerView.contentReady();
            playerView.showSessionView("replacement");
            assert.strictEqual(document.querySelector(".innerText.active p.storyText").textContent, "New compilation.");
            assert(!document.querySelector("#player").textContent.includes("Stale turn."));
            assert.strictEqual(document.querySelector("[aria-busy]"), null);
        });
    });

});
