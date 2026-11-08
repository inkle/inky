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
            });

            document.querySelector(".choice-button").click();

            assert.strictEqual(document.querySelector(".innerText.active p.storyText"), null);
        });
    });
});
