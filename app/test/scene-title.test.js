const assert = require("assert");
const { JSDOM } = require("jsdom");
const { inkCompleter } = require("../renderer/inkCompleter.js");

describe("scene titles", function () {
    it("suggests the title tag while completing Ink tags", function () {
        const session = {
            getLine: () => "# scene",
            getTokenAt: () => ({ type: "text" })
        };
        let suggestions;

        inkCompleter.getCompletions(null, session, { row: 0, column: 7 }, "scene", (error, results) => {
            assert.ifError(error);
            suggestions = results;
        });

        assert.deepStrictEqual(
            suggestions.find(suggestion => suggestion.caption === "#title"),
            {
                caption: "#title",
                value: "title: ",
                meta: "Ink Tag"
            }
        );
    });

    it("renders title tags without treating other tags as titles", function () {
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
            playerView.addTextSection("At the station.");
            playerView.addTags(["title: Platform"]);
            playerView.addTextSection("The train arrives.");
            playerView.addTags(["titulo: The last train"]);

            assert.deepStrictEqual(
                Array.from(document.querySelectorAll(".sceneTitle"), element => element.textContent),
                ["Platform"]
            );
            assert.strictEqual(document.querySelector(".tags").textContent, "# titulo: The last train");
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
    });

    it("aligns the scene title with the paragraph below it", function () {
        const dom = new JSDOM(
            '<div id="player"><div class="innerText active"></div></div>'
        );
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
            playerView.addTextSection("First");
            playerView.addTags(["align: center", "title: One"]);
            playerView.addTextSection("Second");
            playerView.addTags(["title: Two"]);
            playerView.addTextSection("Third");
            playerView.addTags(["align: right", "title: Three"]);

            // Each scene title follows its own paragraph, not the first text of the story.
            const sceneTitles = Array.from(document.querySelectorAll(".sceneTitle"));
            assert.deepStrictEqual(
                sceneTitles.map(element => ["alignLeft", "alignCenter", "alignRight"].filter(name => element.classList.contains(name))),
                [["alignCenter"], [], ["alignRight"]]
            );

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
    });

    it("applies an align tag on a scene start to the whole scene, and other align tags to one paragraph", function () {
        const dom = new JSDOM(
            '<div id="player"><div class="innerText active"></div></div>'
        );
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
            const alignOf = element => ["alignLeft", "alignCenter", "alignRight"].filter(name => element.classList.contains(name));
            const paragraphs = () => Array.from(document.querySelectorAll("p.storyText"));
            playerView.addTextSection("A1");
            playerView.addTags(["title: One", "align: center"]);
            playerView.addTextSection("A2");
            playerView.addTextSection("B1");
            playerView.addTags(["title: Two"]);
            playerView.addTextSection("B2");
            playerView.addTextSection("C1");
            playerView.addTags(["align: right"]);
            playerView.addTextSection("C2");

            // Scene One is centered as a whole; scene Two goes back to the story alignment;
            // a plain align tag only affects its own paragraph.
            assert.deepStrictEqual(
                paragraphs().map(alignOf),
                [["alignCenter"], ["alignCenter"], [], [], ["alignRight"], []]
            );

            // A scene title can carry its own alignment, and the next scene resets it.
            playerView.addTextSection("D1");
            playerView.addTags(["title: Four", "align: center"]);
            playerView.addTextSection("D2");
            playerView.addTextSection("E1");
            playerView.addTags(["title: Five"]);
            playerView.addTextSection("E2");
            assert.deepStrictEqual(
                paragraphs().slice(-4).map(alignOf),
                [["alignCenter"], ["alignCenter"], [], []]
            );
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
    });
});
