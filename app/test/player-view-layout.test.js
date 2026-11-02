const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

describe("preview page layout", function () {
    it("keeps Ink text sections as paragraphs instead of turning them into br elements", function () {
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
            playerView.addTextSection("First line");
            playerView.addTextSection("Second line");

            const paragraphs = document.querySelectorAll(".innerText.active p.storyText");
            assert.strictEqual(paragraphs.length, 2);
            assert.strictEqual(document.querySelector(".innerText br"), null);
            assert.strictEqual(paragraphs[0].textContent, "First line");
            assert.strictEqual(paragraphs[1].textContent, "Second line");
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

    it("renders story markup as plain text", function () {
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
            const paragraphText = 'A <b>bold</b> <img src=x onerror="window.compromised=true"> line';
            playerView.addTextSection(paragraphText);
            playerView.addChoice({
                choice: { text: "<em>Choose</em> this path", tags: [] }
            }, () => {});

            const paragraph = document.querySelector(".innerText.active p.storyText");
            assert.strictEqual(paragraph.textContent, paragraphText);
            assert.strictEqual(document.querySelector("b, em, img"), null);
            const button = document.querySelector(".choice-button");
            assert.strictEqual(button.textContent, "<em>Choose</em> this path");
            assert.strictEqual(button.querySelector("em"), null);
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

    it("renders choices as full-width buttons and advances when clicked", function () {
        const dom = new JSDOM(
            '<div id="player"><div class="innerText active"></div></div>'
        );
        const previousWindow = global.window;
        const previousDocument = global.document;
        const previousDOMParser = global.DOMParser;
        const playerViewPath = require.resolve("../renderer/playerView.js");
        const jqueryPath = require.resolve("../renderer/jquery-2.2.3.min.js");

        global.window = dom.window;
        global.document = dom.window.document;
        global.DOMParser = dom.window.DOMParser;
        delete require.cache[jqueryPath];
        delete require.cache[playerViewPath];

        try {
            const playerView = require("../renderer/playerView.js").PlayerView;
            playerView.setAnimationEnabled(false);
            let chosen = false;
            playerView.addChoice({
                choice: { text: "Follow the light", tags: ["mood: hopeful"] }
            }, () => { chosen = true; });

            const button = document.querySelector(".choice-button");
            assert.strictEqual(button.tagName, "BUTTON");
            assert.strictEqual(button.type, "button");
            assert.strictEqual(button.textContent, "Follow the light # mood: hopeful");
            assert.strictEqual(document.querySelector(".choice a"), null);

            button.click();
            assert.strictEqual(chosen, true);
        } finally {
            delete require.cache[playerViewPath];
            delete require.cache[jqueryPath];
            if( previousWindow === undefined ) delete global.window;
            else global.window = previousWindow;
            if( previousDocument === undefined ) delete global.document;
            else global.document = previousDocument;
            if( previousDOMParser === undefined ) delete global.DOMParser;
            else global.DOMParser = previousDOMParser;
            dom.window.close();
        }
    });

    it("keeps the story inside the frame's scrolling passage and never locks the frame height", function () {
        const dom = new JSDOM(
            '<div id="player"><div class="scrollContainer">' +
            '<div class="innerText active"><p class="choice">First</p>' +
            '<p class="choice">Second</p></div></div></div>'
        );
        const previousWindow = global.window;
        const previousDocument = global.document;
        const previousDOMParser = global.DOMParser;
        const playerViewPath = require.resolve("../renderer/playerView.js");
        const jqueryPath = require.resolve("../renderer/jquery-2.2.3.min.js");

        global.window = dom.window;
        global.document = dom.window.document;
        global.DOMParser = dom.window.DOMParser;
        delete require.cache[jqueryPath];
        delete require.cache[playerViewPath];

        try {
            const $ = require("../renderer/jquery-2.2.3.min.js");
            const animations = [];
            $.fn.animate = function(properties, duration, callback) {
                const complete = Array.from(arguments).find(argument => typeof argument === "function");
                animations.push({ properties, duration });
                if( complete ) complete.call(this[0]);
                return this;
            };
            Object.defineProperty(document.querySelector(".innerText"), "scrollHeight", {
                configurable: true,
                value: 420
            });

            require("../renderer/playerView.js").PlayerView.contentReady();

            const frame = document.querySelector(".innerText");
            const passage = frame.querySelector(".story-passage");
            assert.ok(frame.classList.contains("container"));
            assert.ok(passage);
            assert.strictEqual(passage.querySelectorAll(".choice").length, 2);
            assert.strictEqual(passage.lastElementChild.textContent, "Second");
            assert.strictEqual(frame.style.height, "");
            assert.ok(animations.every(animation => !Object.prototype.hasOwnProperty.call(animation.properties, "height")));
        } finally {
            delete require.cache[playerViewPath];
            delete require.cache[jqueryPath];
            if( previousWindow === undefined ) delete global.window;
            else global.window = previousWindow;
            if( previousDocument === undefined ) delete global.document;
            else global.document = previousDocument;
            if( previousDOMParser === undefined ) delete global.DOMParser;
            else global.DOMParser = previousDOMParser;
            dom.window.close();
        }
    });

    it("does not animate the height of a fixed-ratio preview panel", function () {
        const dom = new JSDOM(
            '<div id="player"><div class="scrollContainer">' +
            '<div class="innerText active"><p class="storyText">Story text</p></div></div></div>'
        );
        const previousWindow = global.window;
        const previousDocument = global.document;
        const previousDOMParser = global.DOMParser;
        const playerViewPath = require.resolve("../renderer/playerView.js");
        const jqueryPath = require.resolve("../renderer/jquery-2.2.3.min.js");

        global.window = dom.window;
        global.document = dom.window.document;
        global.DOMParser = dom.window.DOMParser;
        delete require.cache[jqueryPath];
        delete require.cache[playerViewPath];

        try {
            const $ = require("../renderer/jquery-2.2.3.min.js");
            const animatedHeights = [];
            $.fn.animate = function(properties, duration) {
                if( Object.prototype.hasOwnProperty.call(properties, "height") )
                    animatedHeights.push({ properties, duration });
                return this;
            };
            Object.defineProperty(document.querySelector(".innerText"), "scrollHeight", {
                configurable: true,
                value: 420
            });

            require("../renderer/playerView.js").PlayerView.contentReady();

            assert.deepStrictEqual(animatedHeights, []);
            assert.strictEqual(document.querySelector(".innerText").style.height, "");
            assert.ok(document.querySelector(".innerText .story-passage p.storyText"));
        } finally {
            delete require.cache[playerViewPath];
            delete require.cache[jqueryPath];
            if( previousWindow === undefined ) delete global.window;
            else global.window = previousWindow;
            if( previousDocument === undefined ) delete global.document;
            else global.document = previousDocument;
            if( previousDOMParser === undefined ) delete global.DOMParser;
            else global.DOMParser = previousDOMParser;
            dom.window.close();
        }
    });

    describe("fixed-ratio frame scrolling", function () {
        // Runs contentReady() on a passage whose geometry is stubbed (jsdom has no layout)
        function runContentReady(options) {
            const dom = new JSDOM(
                '<div id="player"><div class="scrollContainer">' +
                '<div class="innerText active">' +
                '<p class="storyText">Old text</p>' + (options.divider === false ? "" : "<hr>") +
                '<p class="storyText" id="new">New text</p><p class="choice"><button>Go</button></p></div></div></div>'
            );
            const previousWindow = global.window;
            const previousDocument = global.document;
            const playerViewPath = require.resolve("../renderer/playerView.js");
            const jqueryPath = require.resolve("../renderer/jquery-2.2.3.min.js");
            global.window = dom.window;
            global.document = dom.window.document;
            delete require.cache[jqueryPath];
            delete require.cache[playerViewPath];
            try {
                const $ = require("../renderer/jquery-2.2.3.min.js");
                const playerView = require("../renderer/playerView.js").PlayerView;
                const animations = [];
                $.fn.animate = function(properties, duration) {
                    if( Object.prototype.hasOwnProperty.call(properties, "scrollTop") ) animations.push({ target: properties.scrollTop, duration });
                    return this;
                };
                const frame = document.querySelector(".innerText");
                const passage = frame.querySelector(".story-passage");
                // These cases are about the scroll that stays as the safety net; pages have their own tests.
                frame.inkyPager = { refresh() {}, handleKey() { return false; } };
                passage.style.paddingTop = "40px";
                const assigned = [];
                Object.defineProperties(passage, {
                    scrollHeight: { configurable: true, value: options.scrollHeight },
                    clientHeight: { configurable: true, value: 600 },
                    scrollTop: { configurable: true, get: () => 0, set: value => assigned.push(value) }
                });
                Object.defineProperty(document.getElementById("new"), "offsetTop", { configurable: true, value: options.startTop });
                // The scroll room below a turn comes from the height of its own content.
                Object.defineProperties(passage.lastElementChild, {
                    offsetTop: { configurable: true, value: 0 },
                    offsetHeight: {
                        configurable: true,
                        value: options.contentHeight === undefined ? options.scrollHeight : options.contentHeight
                    }
                });
                if( options.prefill ) passage.style.setProperty("--story-scroll-fill", options.prefill);
                if( options.reducedMotion ) dom.window.matchMedia = () => ({ matches: true });
                playerView.contentReady();
                return {
                    animations,
                    assigned,
                    moreBelow: frame.classList.contains("has-more-below"),
                    fill: passage.style.getPropertyValue("--story-scroll-fill"),
                    cover: passage.style.getPropertyValue("--story-top-cover")
                };
            } finally {
                delete require.cache[playerViewPath];
                delete require.cache[jqueryPath];
                if( previousWindow === undefined ) delete global.window;
                else global.window = previousWindow;
                if( previousDocument === undefined ) delete global.document;
                else global.document = previousDocument;
                dom.window.close();
            }
        }

        it("scrolls the frame so a long new passage starts at the top, leaving its choices below", function () {
            const result = runContentReady({ startTop: 500, scrollHeight: 2000 });
            assert.deepStrictEqual(result.animations, [{ target: 460, duration: 350 }]);
            assert.strictEqual(result.moreBelow, true);
            assert.strictEqual(result.fill, "0px");
            assert.strictEqual(result.cover, "40px");
        });

        it("starts a short new passage at the top, adding scroll room below it", function () {
            const result = runContentReady({ startTop: 500, scrollHeight: 900 });
            assert.deepStrictEqual(result.animations, [{ target: 460, duration: 350 }]);
            assert.strictEqual(result.fill, "160px");
            assert.strictEqual(result.cover, "40px");
        });

        it("ignores the scroll room it already added when the same turn is aligned again", function () {
            // scrollHeight includes the 160px of filler already added below the turn,
            // but the filler is not story: the room is recomputed from the content.
            const result = runContentReady({
                startTop: 500, scrollHeight: 1060, contentHeight: 900, prefill: "160px"
            });
            assert.deepStrictEqual(result.animations, [{ target: 460, duration: 350 }]);
            assert.strictEqual(result.fill, "160px");
            assert.strictEqual(result.cover, "40px");
        });

        it("starts at the top when there is no earlier passage", function () {
            const result = runContentReady({ divider: false, startTop: 0, scrollHeight: 2000 });
            assert.deepStrictEqual(result.animations, [{ target: 0, duration: 350 }]);
            assert.strictEqual(result.fill, "0px");
        });

        it("jumps without animation when the reader prefers reduced motion", function () {
            const result = runContentReady({ startTop: 500, scrollHeight: 2000, reducedMotion: true });
            assert.deepStrictEqual(result.animations, []);
            assert.deepStrictEqual(result.assigned, [460]);
        });
    });

    describe("story pictures", function () {
        it("puts the first picture of a turn in the frame band and keeps later ones in the text", function () {
            const dom = new JSDOM(
                '<div id="player"><div class="scrollContainer">' +
                '<div class="innerText active"></div></div></div>'
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
                playerView.setImageResolver(value => ["images/station.png", "images/train.png"].includes(value)
                    ? "file:///story/" + value.slice(7) : null);
                const warn = console.warn;
                console.warn = () => {};
                try {
                    playerView.addTextSection("At the station.");
                    playerView.addTags(["image: images/station.png"]);
                    playerView.addTags(["image: images/train.png"]);
                    playerView.addTags(["image: images/missing.png"]);
                } finally {
                    console.warn = warn;
                }

                const frame = document.querySelector(".innerText.active");
                const visual = frame.querySelector(".story-visual");
                assert.strictEqual(frame.classList.contains("has-visual"), true);
                assert.strictEqual(visual.hidden, false);
                assert.strictEqual(visual.querySelectorAll("img").length, 1);
                assert.strictEqual(visual.querySelector("img").getAttribute("src"), "file:///story/station.png");
                // The second picture, and no picture for the missing file, stay in the narrative.
                const passageImages = frame.querySelectorAll(".story-passage img");
                assert.strictEqual(passageImages.length, 1);
                assert.strictEqual(passageImages[0].getAttribute("src"), "file:///story/train.png");
                // Image tags are never printed as visible tags
                assert.strictEqual(frame.querySelector(".story-passage p.tags"), null);
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

        it("drops the picture band when a choice starts the next scene", function () {
            const dom = new JSDOM(
                '<div id="player"><div class="scrollContainer">' +
                '<div class="innerText active"></div></div></div>'
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
                playerView.setImageResolver(() => "file:///story/picture.png");
                playerView.addTextSection("A room.");
                playerView.addTags(["image: images/room.png"]);
                playerView.addChoice({ choice: { text: "Leave", tags: [] } }, () => {});

                document.querySelector(".choice-button").click();
                const frame = document.querySelector(".innerText.active");
                assert.strictEqual(frame.classList.contains("has-visual"), false);
                assert.strictEqual(frame.querySelector(".story-visual").hidden, true);
                assert.strictEqual(frame.querySelector(".story-visual img"), null);
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

    describe("choices footer", function () {
        // Adds the given choices to a fresh player, then runs the checks before the
        // window is torn down (the nodes stop being reliable afterwards).
        function withChoices(labels, check) {
            const dom = new JSDOM('<div id="player"><div class="innerText active"></div></div>');
            const previousWindow = global.window;
            const previousDocument = global.document;
            const previousDOMParser = global.DOMParser;
            const playerViewPath = require.resolve("../renderer/playerView.js");
            const jqueryPath = require.resolve("../renderer/jquery-2.2.3.min.js");
            global.window = dom.window;
            global.document = dom.window.document;
            global.DOMParser = dom.window.DOMParser;
            delete require.cache[jqueryPath];
            delete require.cache[playerViewPath];
            try {
                const playerView = require("../renderer/playerView.js").PlayerView;
                playerView.setAnimationEnabled(false);
                const choices = labels.map((text, index) => ({
                    choice: { text: text, tags: [] },
                    index: index
                }));
                choices.forEach(choice => playerView.addChoice(choice, () => {}));
                check(document.querySelector(".innerText.active"));
            } finally {
                delete require.cache[playerViewPath];
                delete require.cache[jqueryPath];
                if( previousWindow === undefined ) delete global.window;
                else global.window = previousWindow;
                if( previousDocument === undefined ) delete global.document;
                else global.document = previousDocument;
                if( previousDOMParser === undefined ) delete global.DOMParser;
                else global.DOMParser = previousDOMParser;
                dom.window.close();
            }
        }

        it("keeps the choices in a footer below the scrolling passage", function () {
            withChoices(["One", "Two"], frame => {
                const passage = frame.querySelector(".story-passage");
                const footer = frame.querySelector(".story-choices");
                assert.ok(footer);
                const pager = passage.nextElementSibling;
                assert.ok(pager.classList.contains("story-pager"));
                assert.strictEqual(pager.nextElementSibling, footer);
                assert.strictEqual(passage.querySelectorAll(".choice").length, 0);
                assert.strictEqual(footer.querySelectorAll(".choice").length, 2);
                assert.strictEqual(footer.hidden, false);
                assert.strictEqual(frame.classList.contains("has-choices"), true);
            });
        });

        it("shows every choice without a choice-limit warning", function () {
            withChoices(["One", "Two", "Three", "Four", "Five", "Six"], frame => {
                const footer = frame.querySelector(".story-choices");
                assert.strictEqual(footer.querySelectorAll(".choice").length, 6);
                assert.strictEqual(footer.querySelector(".choice-limit"), null);
            });
        });

        it("clears the footer when a choice is taken", function () {
            withChoices(["One", "Two"], frame => {
                frame.querySelector(".choice-button").click();
                const footer = frame.querySelector(".story-choices");
                assert.strictEqual(footer.hidden, true);
                assert.strictEqual(footer.querySelectorAll(".choice").length, 0);
                assert.strictEqual(frame.classList.contains("has-choices"), false);
            });
        });
    });

    describe("replayed turns", function () {
        it("shows only the passage the replay ends on", function () {
            const dom = new JSDOM(
                '<div id="player"><div class="scrollContainer">' +
                '<div class="innerText active container"><div class="story-visual" hidden></div><div class="story-passage"></div></div>' +
                '<div class="hiddenBuffer"><div class="innerText container"><div class="story-visual" hidden></div><div class="story-passage"></div></div></div>' +
                '</div></div>'
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
                playerView.prepareForNewPlaythrough("session-1");

                // The controller rebuilds every choice the writer already took, and each rebuilt
                // turn is cleared again before the next one arrives, as a choice does while playing.
                const replayTurn = (text, tags, choiceLabel) => {
                    playerView.addTextSection(text);
                    playerView.addTags(tags);
                    playerView.addChoice({ choice: { text: choiceLabel, tags: [] } }, () => {});
                    playerView.clearScene();
                };
                replayTurn("The beach is cold.", ["title: Opening"], "Walk on");
                replayTurn("The tide rises.", [], "Look up");

                // The turn the writer is on now keeps its text and its choices.
                playerView.addTextSection("The moon is out.");
                playerView.addChoice({ choice: { text: "Go home", tags: [] } }, () => {});
                playerView.showSessionView("session-1");

                const passage = document.querySelector(".innerText.active .story-passage");
                const footer = document.querySelector(".innerText.active .story-choices");
                assert.deepStrictEqual(
                    Array.from(passage.querySelectorAll("p.storyText"), element => element.textContent),
                    ["The moon is out."]
                );
                assert.strictEqual(passage.querySelectorAll(".scene-title").length, 0);
                assert.deepStrictEqual(
                    Array.from(footer.querySelectorAll(".choice-button"), element => element.textContent),
                    ["Go home"]
                );
                assert.strictEqual(footer.hidden, false);
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

    describe("session buffer swap", function () {
        it("shows the prepared turn after the title screen starts", function () {
            const dom = new JSDOM(
                '<div id="player"><div class="scrollContainer">' +
                '<div class="innerText active container"><div class="story-visual" hidden></div><div class="story-passage"></div></div>' +
                '<div class="hiddenBuffer"><div class="innerText container"><div class="story-visual" hidden></div><div class="story-passage"></div></div></div>' +
                '</div></div>'
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
                // The compiler prepares the new turn in the hidden buffer, then asks for it.
                playerView.prepareForNewPlaythrough("session-1");
                playerView.addTextSection("First line");
                playerView.showSessionView("session-1");

                const activeFrame = document.querySelector(".innerText.active");
                assert.strictEqual(activeFrame.querySelector(".story-passage p.storyText").textContent, "First line");
                assert.strictEqual(activeFrame.parentElement.className, "scrollContainer");
                assert.strictEqual(document.querySelector(".hiddenBuffer .innerText.active"), null);
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

    describe("line breaking", function () {
        const stylesheet = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
        const previewCss = () => stylesheet("renderer/gameChrome.css");
        const exportCss = () => stylesheet("export-for-web-template/style.css");
        const exporter = () => stylesheet("renderer/webExporter.js");
        const editor = () => stylesheet("renderer/inkFile.js");

        // The frame clips at its own edge, so a word that reaches it has to break there rather
        // than run past it and disappear. The rule sits on the passage, which every line inside
        // inherits: a wrapped row then always starts under the line above it.
        it("breaks a word at the edge of the passage in both the Preview and the exported page", function () {
            assert.match(
                previewCss(),
                /#main #player \.story-passage \{[^}]*overflow-wrap: anywhere;/
            );
            assert.match(
                exportCss(),
                /\.story-passage \{[^}]*overflow-wrap: anywhere;/
            );
        });

        it("breaks a long word in a choice the same way, in both", function () {
            assert.match(
                stylesheet("renderer/main.css"),
                /#main #player p\.choice \.choice-button \{[^}]*overflow-wrap: anywhere;/
            );
            assert.match(
                exporter(),
                /\.container \.choice-button \{[^}]*overflow-wrap: anywhere;/
            );
        });

        // A line of the story sits under the line above it, as it does in the editor. The gap a
        // writer wants is line-height's, because ink throws away the difference between a single
        // Enter and a blank line and no margin here could tell the two apart.
        it("stacks the narrative lines with no margin of its own, in both", function () {
            assert.match(
                previewCss(),
                /#main #player \.story-passage p\.storyText \{[^}]*margin: 0;/
            );
            assert.match(
                exportCss(),
                /\.story-passage p \{[^}]*margin: 0;/
            );
            assert.doesNotMatch([previewCss(), exportCss(), stylesheet("renderer/main.css")].join("\n"),
                                /margin: 0 0 1\.2em/);
        });

        // Ace indents a row it wrapped by a tab, which in prose reads as whitespace that was
        // never typed. The editor wraps the story lines, so it has to keep them aligned.
        it("keeps a row the editor wrapped under the line it came from", function () {
            assert.match(
                editor(),
                /setUseWrapMode\(true\);\s*(?:\/\/[^\n]*\n\s*)*this\.aceSession\.setOption\("indentedSoftWrap", false\);/
            );
        });
    });

    describe("scene title placement", function () {
        const stylesheet = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

        // A short turn under a picture is centred in the white space. A scene title is the
        // heading of the beat, so it sits right under the picture at a fixed 15px gap.
        it("keeps a titled scene close to the picture above it, in both", function () {
            assert.match(
                stylesheet("renderer/gameChrome.css"),
                /#main #player \.innerText\.has-visual \.story-passage:has\(> \.scene-title\) \{\s*padding-top: 15px;\s*justify-content: flex-start;/
            );
            assert.match(
                stylesheet("export-for-web-template/style.css"),
                /\.container\.has-visual \.story-passage:has\(> \.scene-title\) \{\s*padding-top: 15px;\s*justify-content: flex-start;/
            );
        });

        // The same 15px rhythm above and below the heading: picture, title, story.
        it("gives the story below the title the same gap as the picture above it, in both", function () {
            assert.match(
                stylesheet("renderer/main.css"),
                /#main #player \.innerText \.sceneTitle \{\s*margin: 0 0 15px;/
            );
            assert.match(
                stylesheet("export-for-web-template/style.css"),
                /\.container \.scene-title \{\s*margin: 0 0 15px;/
            );
        });
    });

    describe("story image band", function () {
        const stylesheet = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

        // The picture is a band above the story, not a page of its own: both sides keep it
        // at the same share of the frame.
        it("gives the picture the same share of the frame in the Preview and the export", function () {
            assert.match(
                stylesheet("renderer/gameChrome.css"),
                /#main #player \.story-visual \{\s*position: relative;\s*flex: 0 0 27\.169%;/
            );
            assert.match(
                stylesheet("export-for-web-template/style.css"),
                /\.story-visual \{\s*position: relative;\s*flex: 0 0 27\.169%;/
            );
        });
    });

    describe("choices footer height", function () {
        const stylesheet = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

        // The choices may grow only so far before they scroll: both sides keep the same ceiling.
        it("keeps the same ceiling on the choices footer in the Preview and the export", function () {
            assert.match(
                stylesheet("renderer/gameChrome.css"),
                /#main #player \.story-choices \{[^}]*flex: 0 0 auto;\s*max-height: 44%;/
            );
            assert.match(
                stylesheet("export-for-web-template/style.css"),
                /\.story-choices \{[^}]*flex: 0 0 auto;\s*max-height: 44%;/
            );
        });
    });
});
