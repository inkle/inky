const assert = require("assert");
const { JSDOM } = require("jsdom");
const { loadExportHelpers } = require("./helpers/export-player.js");
const { attach, lastSentenceEnd } = require("../renderer/pager.js");

describe("pager cutting", function () {
    it("finds the end of the last sentence among the nodes", function () {
        assert.strictEqual(lastSentenceEnd(["One", " ", "two.", " ", "three"], 5), 3);
        assert.strictEqual(lastSentenceEnd(["He", " ", "said", " ", "\u201cgo!\u201d", " ", "and"], 7), 5);
        assert.strictEqual(lastSentenceEnd(["no", " ", "end"], 3), 0);
    });
});

// jsdom has no layout: every paragraph is 20px per 30 characters and everything else is 20px.
describe("pager in a frame", function () {
    let dom, window, frame, passage, nav, choices, pager;

    function layout(win) {
        const proto = win.HTMLElement.prototype;
        const visible = el => !el.classList.contains("page-out");
        const height = el => {
            if( !visible(el) ) return 0;
            if( el.tagName === "P" ) return Math.max(1, Math.ceil(el.textContent.length / 30)) * 20;
            return 20;
        };
        Object.defineProperty(proto, "offsetHeight", { configurable: true, get() { return height(this); } });
        Object.defineProperty(proto, "offsetTop", {
            configurable: true,
            get() {
                let top = 0;
                for( let sibling = this.previousElementSibling; sibling; sibling = sibling.previousElementSibling ) top += height(sibling);
                return top;
            }
        });
    }

    function build(paragraphs, clientHeight) {
        dom = new JSDOM('<div id="frame"><div class="story-passage"></div><div class="story-pager" hidden></div><div class="story-choices"></div></div>', { pretendToBeVisual: true });
        window = dom.window;
        layout(window);
        frame = window.document.getElementById("frame");
        passage = frame.querySelector(".story-passage");
        nav = frame.querySelector(".story-pager");
        choices = frame.querySelector(".story-choices");
        Object.defineProperty(passage, "clientHeight", { configurable: true, get: () => clientHeight });
        paragraphs.forEach(text => {
            const p = window.document.createElement("p");
            p.className = "storyText";
            p.textContent = text;
            passage.appendChild(p);
        });
        const choice = window.document.createElement("button");
        choice.textContent = "Open the door";
        choices.appendChild(choice);
        pager = attach({ frame, passage, nav, getChoices: () => choices });
        return pager;
    }

    afterEach(function () { window.close(); });

    const line = n => "x".repeat(30 * n);
    const visibleText = () => Array.from(passage.children).filter(c => !c.classList.contains("page-out")).map(c => c.textContent);

    it("does nothing to a passage that fits", function () {
        build([line(1), line(1)], 200);
        pager.refresh();
        assert.strictEqual(nav.hidden, true);
        assert.ok(!frame.classList.contains("is-paged"));
        assert.deepStrictEqual(pager.getState(), { index: 0, count: 1 });
        assert.strictEqual(choices.querySelector("button").disabled, false);
    });

    it("divides a long passage between paragraphs, by height", function () {
        build([line(3), line(3), line(3), line(1)], 130);
        pager.refresh();
        const state = pager.getState();
        assert.ok(state.count >= 2);
        assert.strictEqual(nav.hidden, false);
        assert.ok(frame.classList.contains("is-paged"));
        // Every page holds whole paragraphs and fits the room.
        for( let i = 0; i < state.count; ++i ) {
            pager.goTo(i);
            assert.ok(visibleText().length >= 1);
        }
    });

    it("measures a many-paragraph passage with a linear number of layout reads", function () {
        const paragraphs = Array.from({ length: 80 }, (_, i) => String(i).padStart(30, "x"));
        build(paragraphs, 100);
        const proto = window.HTMLElement.prototype;
        let reads = 0;
        for( const name of ["offsetTop", "offsetHeight"] ) {
            const descriptor = Object.getOwnPropertyDescriptor(proto, name);
            Object.defineProperty(proto, name, {
                configurable: true,
                get() { reads++; return descriptor.get.call(this); }
            });
        }
        pager.refresh();
        assert.strictEqual(Array.from(passage.children, p => p.textContent).join(""), paragraphs.join(""));
        for( let i = 0; i < pager.getState().count; i++ ) {
            pager.goTo(i);
            assert.ok(visibleText().length > 0, "page must not be empty");
        }
        assert.ok(reads <= 8 * paragraphs.length + 10, `${reads} layout reads for ${paragraphs.length} paragraphs`);
    });

    it("fills each page as far as it goes, cutting the next paragraph at a sentence", function () {
        // Room for 5 lines (100px). The first paragraph takes 2 lines; the second has two sentences
        // of 2 lines each: the first one fits in what is left (3 lines), the second goes on.
        const first = "a".repeat(55);
        const sentenceA = "First sentence of the second one that has some length to it.";
        const sentenceB = "Then a second sentence that fills another couple of lines ok.";
        build([first, sentenceA + " " + sentenceB], 100);
        pager.refresh();
        assert.strictEqual(pager.getState().count, 2);
        pager.goTo(0);
        const shown = visibleText();
        assert.strictEqual(shown.length, 2);
        assert.strictEqual(shown[0], first);
        assert.strictEqual(shown[1].trim(), sentenceA);
        pager.goTo(1);
        assert.strictEqual(visibleText().join("").trim(), sentenceB);
    });

    it("does not leave a page with a big blank when only a sentence-less paragraph is next", function () {
        // The next paragraph is one long sentence; most of the page is empty, so it is cut at a word.
        build(["a".repeat(30), Array.from({ length: 30 }, (_, i) => "word" + i).join(" ") + "."], 200);
        pager.refresh();
        pager.goTo(0);
        assert.strictEqual(visibleText().length, 2, "the first page also holds the start of the long sentence");
    });

    it("never ends a page with a scene title", function () {
        build([line(3), line(2)], 130);
        const title = window.document.createElement("h2");
        title.className = "scene-title";
        title.textContent = "Title";
        passage.insertBefore(title, passage.children[1]);
        pager.refresh();
        for( let i = 0; i < pager.getState().count; ++i ) {
            pager.goTo(i);
            const shown = Array.from(passage.children).filter(c => !c.classList.contains("page-out"));
            assert.notStrictEqual(shown[shown.length - 1], title);
        }
    });

    it("keeps the choices visible but locked until the last page", function () {
        build([line(3), line(3), line(3)], 130);
        pager.refresh();
        const button = choices.querySelector("button");
        assert.strictEqual(button.disabled, true);
        assert.ok(choices.classList.contains("pages-locked"));
        const last = pager.getState().count - 1;
        pager.goTo(last);
        assert.strictEqual(button.disabled, false);
        assert.ok(!choices.classList.contains("pages-locked"));
        pager.goTo(0);
        assert.strictEqual(button.disabled, true);
    });

    it("shows one dot per page and disables the arrows at the ends", function () {
        build([line(3), line(3), line(3)], 130);
        pager.refresh();
        const count = pager.getState().count;
        assert.strictEqual(nav.querySelectorAll(".pager-dot").length, count);
        assert.strictEqual(nav.querySelector(".pager-dot.current"), nav.querySelectorAll(".pager-dot")[0]);
        assert.strictEqual(nav.querySelector(".pager-prev").disabled, true);
        assert.strictEqual(nav.querySelector(".pager-next").disabled, false);
        nav.querySelector(".pager-next").click();
        assert.strictEqual(pager.getState().index, 1);
        assert.strictEqual(nav.querySelector(".pager-prev").disabled, false);
        pager.goTo(count - 1);
        assert.strictEqual(nav.querySelector(".pager-next").disabled, true);
    });

    it("cuts a paragraph taller than a page at the end of a sentence", function () {
        const sentences = Array.from({ length: 8 }, (_, i) => `Sentence number ${i + 1} is here.`);
        build([sentences.join(" ")], 100);
        pager.refresh();
        assert.ok(pager.getState().count >= 2);
        const pieces = Array.from(passage.children);
        pieces.slice(0, -1).forEach(piece => assert.match(piece.textContent.trim(), /\.$/, piece.textContent));
        assert.strictEqual(pieces.map(piece => piece.textContent).join(" ").replace(/\s+/g, " ").trim(), sentences.join(" "));
    });

    it("puts the paragraph back together when the frame changes size", function () {
        const text = Array.from({ length: 8 }, (_, i) => `Sentence number ${i + 1} is here.`).join(" ");
        build([text], 100);
        pager.refresh();
        assert.ok(passage.children.length > 1);
        Object.defineProperty(passage, "clientHeight", { configurable: true, get: () => 1000 });
        pager.refresh();
        assert.strictEqual(passage.children.length, 1);
        assert.strictEqual(passage.children[0].textContent, text);
        assert.strictEqual(nav.hidden, true);
    });

    it("keeps a scene title with the paragraph below it", function () {
        build([line(3), line(3)], 130);
        const title = window.document.createElement("h2");
        title.className = "scene-title";
        title.textContent = "Title";
        passage.insertBefore(title, passage.children[1]);
        pager.refresh();
        for( let i = 0; i < pager.getState().count; ++i ) {
            pager.goTo(i);
            const shown = Array.from(passage.children).filter(c => !c.classList.contains("page-out"));
            assert.notStrictEqual(shown[shown.length - 1], title, "a title is never the last block of a page");
        }
    });

    it("splits a paragraph with a blank-line margin without repeating the cut", function () {
        const first = "a".repeat(90);
        const second = Array.from({ length: 24 }, (_, i) => "word" + i).join(" ");
        build([first, second], 130);
        const paragraph = passage.children[1];
        paragraph.classList.add("inky-paragraph-gap");
        const style = window.document.createElement("style");
        style.textContent = ".inky-paragraph-gap { margin-top: 20px; }";
        window.document.head.appendChild(style);
        const proto = window.HTMLElement.prototype;
        const height = el => el.classList.contains("page-out") ? 0 :
            el.tagName === "P" ? Math.max(1, Math.ceil(el.textContent.length / 30)) * 20 : 20;
        const margin = el => el.classList.contains("inky-paragraph-gap") ? 20 : 0;
        let measurements = 0;
        Object.defineProperty(proto, "offsetTop", {
            configurable: true,
            get() {
                assert.ok(++measurements < 300, "pagination must make progress");
                let top = margin(this);
                for( let sibling = this.previousElementSibling; sibling; sibling = sibling.previousElementSibling )
                    top += height(sibling) + margin(sibling);
                return top;
            }
        });
        pager.refresh();
        assert.ok(pager.getState().count > 1);
        assert.strictEqual(Array.from(passage.children).map(p => p.textContent).join(""), first + second);
        assert.strictEqual(passage.querySelectorAll(".inky-paragraph-gap").length, 1);
        Object.defineProperty(passage, "clientHeight", { configurable: true, get: () => 1000 });
        pager.refresh();
        assert.strictEqual(passage.children.length, 2);
        assert.strictEqual(passage.children[1].textContent, second);
        assert.ok(passage.children[1].classList.contains("inky-paragraph-gap"));
    });

    it("does not leave an empty fragment when a cut consumes the whole paragraph", function () {
        build(["a".repeat(90), "word ".repeat(9), "last"], 130);
        passage.children[1].classList.add("inky-paragraph-gap");
        passage.children[2].classList.add("inky-paragraph-gap");
        const proto = window.HTMLElement.prototype;
        const height = el => el.classList.contains("page-out") ? 0 :
            el.tagName === "P" ? Math.max(1, Math.ceil(el.textContent.trimEnd().length / 30)) * 20 : 20;
        const margin = el => el.classList.contains("inky-paragraph-gap") ? 20 : 0;
        Object.defineProperty(proto, "offsetHeight", { configurable: true, get() { return height(this); } });
        Object.defineProperty(proto, "offsetTop", {
            configurable: true,
            get() {
                let top = margin(this);
                for( let sibling = this.previousElementSibling; sibling; sibling = sibling.previousElementSibling )
                    top += height(sibling) + margin(sibling);
                return top;
            }
        });
        pager.refresh();
        assert.ok(Array.from(passage.children).every(p => p.textContent.trim() !== ""));
    });

    it("keeps a title with an indivisible oversized paragraph without empty pages", function () {
        const text = line(6);
        build([text], 80);
        const title = window.document.createElement("h2");
        title.className = "scene-title";
        title.textContent = "Title";
        passage.insertBefore(title, passage.firstChild);
        pager.refresh();
        assert.deepStrictEqual(pager.getState(), { index: 0, count: 1 });
        assert.deepStrictEqual(visibleText(), ["Title", text]);
        assert.ok(passage.classList.contains("page-overflow"));
    });

    it("preserves order and choices with titles, margins, splits and an indivisible block", function () {
        const paragraphs = [
            "a".repeat(60),
            "First sentence fits here. Another sentence follows. Third sentence stays in order.",
            "z".repeat(180),
            "Last paragraph."
        ];
        build(paragraphs, 100);
        const title = window.document.createElement("h2");
        title.className = "scene-title";
        title.textContent = "Scene title";
        passage.insertBefore(title, passage.children[1]);
        passage.children[3].classList.add("inky-paragraph-gap");
        const proto = window.HTMLElement.prototype;
        const height = el => el.classList.contains("page-out") ? 0 :
            el.tagName === "P" ? Math.max(1, Math.ceil(el.textContent.length / 30)) * 20 : 20;
        const margin = el => el.classList.contains("inky-paragraph-gap") ? 20 : 0;
        Object.defineProperty(proto, "offsetHeight", { configurable: true, get() { return height(this); } });
        Object.defineProperty(proto, "offsetTop", {
            configurable: true,
            get() {
                let top = margin(this);
                for( let sibling = this.previousElementSibling; sibling; sibling = sibling.previousElementSibling )
                    top += height(sibling) + margin(sibling);
                return top;
            }
        });
        pager.refresh();
        const reconstructed = [];
        for( let i = 0; i < pager.getState().count; i++ ) {
            pager.goTo(i);
            const shown = Array.from(passage.children).filter(el => !el.classList.contains("page-out"));
            assert.ok(shown.length, `page ${i} is not empty`);
            assert.notStrictEqual(shown[shown.length - 1], title);
            const pageHeight = shown.reduce((sum, el) => sum + height(el) + margin(el), 0);
            if( pageHeight > 101 ) {
                assert.ok(shown.some(el => el.textContent === paragraphs[2]), "only the indivisible paragraph may overflow");
                assert.ok(passage.classList.contains("page-overflow"));
            }
            assert.strictEqual(choices.querySelector("button").disabled, i < pager.getState().count - 1);
            reconstructed.push(...shown.map(el => el.textContent));
        }
        assert.strictEqual(reconstructed.join(""), paragraphs[0] + title.textContent + paragraphs.slice(1).join(""));
    });

    it("finishes safely if a freshly split fragment no longer fits after measurement", function () {
        const text = Array.from({ length: 60 }, (_, i) => `word${i}.`).join(" ");
        build([text], 100);
        const proto = window.HTMLElement.prototype;
        const originalTop = Object.getOwnPropertyDescriptor(proto, "offsetTop").get;
        const reads = new WeakMap();
        let measurements = 0, warnings = 0;
        Object.defineProperty(proto, "offsetTop", {
            configurable: true,
            get() {
                assert.ok(++measurements < 5000, "pagination must make progress");
                const top = originalTop.call(this);
                if( !this.hasAttribute("data-page-split") ) return top;
                const count = (reads.get(this) || 0) + 1;
                reads.set(this, count);
                return count === 1 ? top : top - 1000;
            }
        });
        const warn = console.warn;
        try {
            console.warn = () => { warnings++; };
            pager.refresh();
        } finally {
            console.warn = warn;
        }
        assert.ok(warnings > 0, "unstable split must be reported");
        const seen = [];
        for( let i = 0; i < pager.getState().count; i++ ) {
            pager.goTo(i);
            const visible = visibleText();
            assert.ok(visible.length);
            seen.push(...visible);
        }
        assert.strictEqual(seen.join(""), text);
    });

    it("keeps the page when only the size changes, and starts over when the text changes", function () {
        build([line(3), line(3), line(3)], 130);
        pager.refresh();
        pager.goTo(1);
        pager.refresh();
        assert.strictEqual(pager.getState().index, 1);
        passage.firstChild.textContent += "!";
        pager.refresh();
        assert.strictEqual(pager.getState().index, 0);
    });

    it("moves with the keyboard and leaves keys of focused controls alone", function () {
        build([line(3), line(3), line(3)], 130);
        pager.refresh();
        const key = (name, target) => {
            const event = new window.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
            Object.defineProperty(event, "target", { value: target || window.document.body });
            return pager.handleKey(event);
        };
        assert.strictEqual(key("ArrowRight"), true);
        assert.strictEqual(pager.getState().index, 1);
        assert.strictEqual(key(" "), true);
        assert.strictEqual(pager.getState().index, 2 <= pager.getState().count - 1 ? 2 : 1);
        assert.strictEqual(key("ArrowLeft"), true);
        assert.strictEqual(key("Enter", choices.querySelector("button")), false, "Enter on a button is the button's");
        assert.strictEqual(key(" ", window.document.createElement("input")), false);
    });
});

describe("pagination in the Preview and in the export", function () {
    const fs = require("fs");
    const path = require("path");
    const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

    it("ships pager.js with the export, before main.js", function () {
        const html = read("export-for-web-template/index.html");
        assert.ok(html.indexOf('src="pager.js"') !== -1 && html.indexOf('src="pager.js"') < html.indexOf('src="main.js"'));
        assert.match(html, /id="story-pager"/);
        assert.match(read("renderer/webExporter.js"), /"pager\.js"/);
    });

    it("styles the navigation row and locks the choices in both stylesheets", function () {
        [read("renderer/gameChrome.css"), read("export-for-web-template/style.css")].forEach(css => {
            assert.match(css, /\.story-pager \.pager-dots/);
            assert.match(css, /\.story-choices\.pages-locked/);
            assert.match(css, /\.is-paged \.story-passage/);
        });
    });

    it("the exported page divides a long passage into pages and unlocks the choices on the last one", function () {
        const template = read("export-for-web-template/main.js");
        const pagerSource = read("renderer/pager.js");
        const dom = new JSDOM(
            '<div class="outerContainer"><div id="story" class="container"><div class="header"><h1>S</h1><h2 class="byline"></h2></div>' +
            '<div id="story-passage"></div><div id="story-pager" class="story-pager" hidden></div><div id="story-choices"></div></div></div>' +
            '<a id="rewind"></a><a id="save"></a><a id="reload"></a>',
            { url: "https://stories.example/one/index.html", runScripts: "outside-only", pretendToBeVisual: true }
        );
        const window = dom.window;
        const proto = window.HTMLElement.prototype;
        const heightOf = el => el.classList.contains("page-out") ? 0 : (el.tagName === "P" ? 60 : 20);
        Object.defineProperty(proto, "offsetHeight", { configurable: true, get() { return heightOf(this); } });
        Object.defineProperty(proto, "offsetTop", {
            configurable: true,
            get() { let top = 0; for( let s = this.previousElementSibling; s; s = s.previousElementSibling ) top += heightOf(s); return top; }
        });
        const passage = window.document.getElementById("story-passage");
        Object.defineProperty(passage, "clientHeight", { configurable: true, value: 130 });
        window.matchMedia = () => ({ matches: false });
        let turn = 0;
        const turns = [{ lines: ["One.", "Two.", "Three.", "Four."], choices: [{ index: 0, text: "Open the door" }] }];
        window.inkjs = {
            Story: function () {
                return {
                    globalTags: [], currentTags: [],
                    ResetState() {},
                    state: { toJson: () => "{}", LoadJson: () => {} },
                    get currentChoices() { return turns[turn].choices; },
                    get canContinue() { return turns[turn].lines.length > 0; },
                    Continue() { return turns[turn].lines.shift(); },
                    ChooseChoiceIndex() {}
                };
            }
        };
        window.storyContent = {};
        loadExportHelpers(window);
        window.eval(pagerSource);
        window.eval(template);
        try {
            const pager = window.document.getElementById("story-pager");
            const button = window.document.querySelector("#story-choices button");
            assert.strictEqual(pager.hidden, false, "four paragraphs do not fit in 130px");
            assert.ok(window.document.getElementById("story").classList.contains("is-paged"));
            assert.strictEqual(button.disabled, true);
            const dots = pager.querySelectorAll(".pager-dot").length;
            assert.ok(dots >= 2);
            for( let i = 1; i < dots; ++i ) pager.querySelector(".pager-next").click();
            assert.strictEqual(button.disabled, false);
            assert.strictEqual(pager.querySelector(".pager-next").disabled, true);
        } finally {
            window.close();
        }
    });
});

describe("pagination in the Preview player", function () {
    it("divides a long passage into pages when the content is ready, with the choices locked", function () {
        const dom = new JSDOM(
            '<div id="player"><div class="scrollContainer"><div class="innerText active">' +
            '<p class="storyText">One.</p><p class="storyText">Two.</p><p class="storyText">Three.</p><p class="storyText">Four.</p>' +
            "</div></div></div>",
            { pretendToBeVisual: true }
        );
        const window = dom.window;
        const proto = window.HTMLElement.prototype;
        const heightOf = el => el.classList.contains("page-out") ? 0 : (el.tagName === "P" ? 60 : 20);
        Object.defineProperty(proto, "offsetHeight", { configurable: true, get() { return heightOf(this); } });
        Object.defineProperty(proto, "offsetTop", {
            configurable: true,
            get() { let top = 0; for( let s = this.previousElementSibling; s; s = s.previousElementSibling ) top += heightOf(s); return top; }
        });
        const previous = { window: global.window, document: global.document, DOMParser: global.DOMParser };
        const playerViewPath = require.resolve("../renderer/playerView.js");
        const jqueryPath = require.resolve("../renderer/jquery-2.2.3.min.js");
        global.window = window;
        global.document = window.document;
        global.DOMParser = window.DOMParser;
        delete require.cache[jqueryPath];
        delete require.cache[playerViewPath];
        try {
            const playerView = require("../renderer/playerView.js").PlayerView;
            playerView.setAnimationEnabled(false);
            const frame = window.document.querySelector(".innerText");
            const passage = frame.querySelector(".story-passage");
            Object.defineProperty(passage, "clientHeight", { configurable: true, value: 130 });
            playerView.addChoice({ choice: { text: "Open the door", tags: [] }, index: 0 }, () => {});
            playerView.contentReady();
            assert.ok(frame.classList.contains("is-paged"));
            const pager = frame.querySelector(".story-pager");
            assert.strictEqual(pager.hidden, false);
            assert.strictEqual(pager.previousElementSibling, passage);
            const button = frame.querySelector(".story-choices button");
            assert.strictEqual(button.disabled, true);
            for( let i = 0; i < 5; ++i ) {
                const event = new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
                window.document.body.dispatchEvent(event);
            }
            assert.strictEqual(button.disabled, false, "the arrow key reached the last page");
        } finally {
            delete require.cache[playerViewPath];
            delete require.cache[jqueryPath];
            Object.entries(previous).forEach(([name, value]) => { if( value === undefined ) delete global[name]; else global[name] = value; });
            window.close();
        }
    });
});
