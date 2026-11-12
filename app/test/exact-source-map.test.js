const assert = require("assert");
const { JSDOM } = require("jsdom");

describe("exact Preview source mapping", function () {
    let dom, old, player, jumps;
    const playerPath = require.resolve("../renderer/playerView.js");
    const jqueryPath = require.resolve("../renderer/jquery-2.2.3.min.js");

    beforeEach(function () {
        dom = new JSDOM('<div id="player"><div class="innerText active"></div></div>');
        old = { window: global.window, document: global.document, DOMParser: global.DOMParser, NodeFilter: global.NodeFilter };
        Object.assign(global, { window: dom.window, document: dom.window.document, DOMParser: dom.window.DOMParser, NodeFilter: dom.window.NodeFilter });
        delete require.cache[jqueryPath];
        delete require.cache[playerPath];
        player = require(playerPath).PlayerView;
        player.setAnimationEnabled(false);
        jumps = [];
        player.setEvents({ jumpToSource: offset => jumps.push(offset) });
        window.Range.prototype.getClientRects = () => [{ left: 0, right: 10, top: 0, bottom: 10 }];
    });

    afterEach(function () {
        delete require.cache[playerPath];
        delete require.cache[jqueryPath];
        for (const [key, value] of Object.entries(old)) {
            if (value === undefined) delete global[key];
            else global[key] = value;
        }
        dom.window.close();
    });

    function click(node, offset, x = 5) {
        document.caretRangeFromPoint = () => ({ startContainer: node, startOffset: offset });
        node.parentNode.dispatchEvent(new window.MouseEvent("click", { bubbles: true, altKey: true, clientX: x, clientY: 5 }));
    }

    for (const mode of ["traditional", "screen"]) {
        it(`maps a formatted repeated word and paginated fragments in ${mode}`, function () {
            document.getElementById("player").dataset.presentation = mode;
            const text = "Re⟦b⟧pe⟦/b⟧tida Repetida fim";
            const offsets = Array.from({ length: text.length }, (_, i) => 100 + i * 2);
            player.addTextSection(text, { version: 1, unit: "utf16", offsets });
            player.addTags([]);
            const rest = document.querySelector("p.storyText");
            const head = rest.cloneNode(false);
            head.setAttribute("data-page-split", "1");
            head.appendChild(rest.firstChild);
            head.appendChild(rest.firstChild);
            rest.before(head);
            const middle = rest.cloneNode(false);
            middle.setAttribute("data-page-split", "1");
            rest.firstChild.splitText(5);
            middle.appendChild(rest.firstChild);
            rest.before(middle);
            click(head.querySelector("strong").firstChild, 1);
            click(middle.firstChild, 1);
            click(rest.firstChild, rest.firstChild.data.indexOf("Repetida") + 2);
            click(rest.firstChild, rest.firstChild.data.indexOf("fim") + 1);
            assert.deepStrictEqual(jumps, [110, 122, 134, 150]);
            click(rest.firstChild, rest.firstChild.length, 100);
            assert.strictEqual(jumps.length, 4);
        });
    }

    it("never guesses offsets when metadata is missing or incompatible", function () {
        player.addTextSection("No mapping");
        player.addTags([]);
        const node = document.querySelector("p.storyText").firstChild;
        click(node, 1);
        player.addTextSection("Wrong version", { version: 2, unit: "utf16", offsets: Array(13).fill(1) });
        player.addTags([]);
        click(document.querySelectorAll("p.storyText")[1].firstChild, 1);
        assert.deepStrictEqual(jumps, []);
    });

    it("preserves offsets after removing the selected choice prefix", function () {
        player.setSelectedChoiceText("Choice");
        const text = "Choice   Actual";
        player.addTextSection(text, { version: 1, unit: "utf16", offsets: Array.from({ length: text.length }, (_, i) => 50 + i) });
        player.addTags([]);
        const node = document.querySelector("p.storyText").firstChild;
        assert.strictEqual(node.data, "Actual");
        click(node, 2);
        assert.deepStrictEqual(jumps, [60]);
    });

    it("indexes surrogate pairs as UTF-16 code units", function () {
        const text = "😀abc";
        player.addTextSection(text, { version: 1, unit: "utf16", offsets: [30, 31, 40, 41, 42] });
        player.addTags([]);
        const node = document.querySelector("p.storyText").firstChild;
        click(node, 4);
        assert.deepStrictEqual(jumps, [41]);
    });
});
