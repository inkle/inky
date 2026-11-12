const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

describe("Refresh Preview", function() {
    it("uses a native, accessible control in the existing toolbar", function() {
        const html = fs.readFileSync(path.join(__dirname, "../renderer/index.html"), "utf8");
        const dom = new JSDOM(html);
        const button = dom.window.document.querySelector("#toolbar .buttons.right button.refresh-preview");
        assert(button);
        assert.strictEqual(button.type, "button");
        assert.strictEqual(button.title, "Refresh Preview");
        assert.strictEqual(button.getAttribute("aria-label"), "Refresh Preview");
        assert(button.querySelector(".icon.icon-cw"));
        dom.window.close();
    });

    it("routes toolbar clicks only to the refresh action", async function() {
        const dom = new JSDOM('<div id="toolbar"><button class="button refresh-preview"></button></div>');
        const previousWindow = global.window;
        const previousDocument = global.document;
        const toolbarPath = require.resolve("../renderer/toolbarView.js");
        const jqueryPath = require.resolve("../renderer/jquery-2.2.3.min.js");
        global.window = dom.window;
        global.document = dom.window.document;
        delete require.cache[jqueryPath];
        delete require.cache[toolbarPath];
        try {
            let refreshes = 0;
            let restarts = 0;
            const toolbar = require(toolbarPath).ToolbarView;
            toolbar.setEvents({ refreshPreview: () => refreshes++, rewind: () => restarts++ });
            await new Promise(resolve => dom.window.setTimeout(resolve, 20));
            document.querySelector(".refresh-preview").click();
            assert.strictEqual(refreshes, 1);
            assert.strictEqual(restarts, 0);
        } finally {
            delete require.cache[toolbarPath];
            delete require.cache[jqueryPath];
            if( previousWindow === undefined ) delete global.window;
            else global.window = previousWindow;
            if( previousDocument === undefined ) delete global.document;
            else global.document = previousDocument;
            dom.window.close();
        }
    });

    it("repaints without replacing nodes, listeners, selection, or scroll state", function() {
        const dom = new JSDOM('<div id="player"><div class="scrollContainer"><div class="innerText active"><div class="story-passage"><p>Story text</p></div></div></div></div>');
        const previousWindow = global.window;
        const previousDocument = global.document;
        const playerPath = require.resolve("../renderer/playerView.js");
        const jqueryPath = require.resolve("../renderer/jquery-2.2.3.min.js");
        global.window = dom.window;
        global.document = dom.window.document;
        delete require.cache[jqueryPath];
        delete require.cache[playerPath];
        const frames = [];
        window.requestAnimationFrame = callback => frames.push(callback);
        try {
            const playerView = require(playerPath).PlayerView;
            const player = document.getElementById("player");
            const paragraph = player.querySelector("p");
            const passage = player.querySelector(".story-passage");
            const range = document.createRange();
            range.setStart(paragraph.firstChild, 0);
            range.setEnd(paragraph.firstChild, 5);
            window.getSelection().addRange(range);
            passage.scrollTop = 42;
            let clicks = 0;
            paragraph.addEventListener("click", () => clicks++);
            playerView.refreshPreview();
            playerView.refreshPreview();
            assert(player.classList.contains("preview-refreshing"));
            assert.strictEqual(frames.length, 1);
            frames.shift()();
            assert(player.classList.contains("preview-refreshing"));
            frames.shift()();
            assert(!player.classList.contains("preview-refreshing"));
            assert.strictEqual(player.querySelector("p"), paragraph);
            assert.strictEqual(window.getSelection().toString(), "Story");
            assert.strictEqual(passage.scrollTop, 42);
            paragraph.click();
            assert.strictEqual(clicks, 1);
            player.remove();
            assert.doesNotThrow(() => playerView.refreshPreview());
        } finally {
            delete require.cache[playerPath];
            delete require.cache[jqueryPath];
            if( previousWindow === undefined ) delete global.window;
            else global.window = previousWindow;
            if( previousDocument === undefined ) delete global.document;
            else global.document = previousDocument;
            dom.window.close();
        }
    });
});
