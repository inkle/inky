const assert = require("assert");
const { JSDOM } = require("jsdom");
const { attach } = require("../renderer/pager.js");

describe("pagination integrity for many blocks", function () {
    this.timeout(120000);

    for (const count of [10, 100, 500, 2100]) {
        it(`exposes all ${count} paragraphs once, in order, within page capacity`, function () {
            const dom = new JSDOM('<div id="frame"><div class="story-passage"></div><div class="story-pager"></div><div class="story-choices"><button>Continue</button></div></div>', { pretendToBeVisual: true });
            try {
                const window = dom.window;
                const proto = window.HTMLElement.prototype;
                Object.defineProperty(proto, "offsetHeight", {
                    configurable: true, get() { return this.classList.contains("page-out") ? 0 : 20; }
                });
                Object.defineProperty(proto, "offsetTop", {
                    configurable: true, get() { return Number(this.dataset.position || 0) * 20; }
                });
                const frame = window.document.querySelector("#frame");
                const passage = frame.querySelector(".story-passage");
                const nav = frame.querySelector(".story-pager");
                const choices = frame.querySelector(".story-choices");
                const choice = choices.querySelector("button");
                Object.defineProperty(passage, "clientHeight", { configurable: true, value: 100 });
                const expected = [];
                for (let i = 0; i < count; i++) {
                    const block = window.document.createElement("p");
                    block.dataset.position = i;
                    block.textContent = `paragraph-${i}|`;
                    expected.push(block.textContent);
                    passage.appendChild(block);
                }
                const blocks = Array.from(passage.children);
                const pager = attach({ frame, passage, nav, getChoices: () => choices });
                pager.refresh();
                const pages = pager.getState().count;
                const visited = [];
                const pageSizes = [];
                for (let page = 0; page < pages; page++) {
                    pager.goTo(page);
                    const visible = blocks.filter(block => !block.classList.contains("page-out"));
                    pageSizes.push(visible.length);
                    assert.strictEqual(choice.disabled, page < pages - 1);
                    visited.push(...visible.map(block => block.textContent));
                }
                assert.strictEqual(pages, Math.ceil(count / 5), JSON.stringify({
                    pages, expectedPages: Math.ceil(count / 5), firstPage: pageSizes[0],
                    totalVisibleOccurrences: visited.length, distinctVisible: new Set(visited).size
                }));
                pageSizes.forEach((size, page) => assert.ok(size > 0 && size <= 5, `page ${page} has ${size} blocks`));
                assert.deepStrictEqual(visited, expected);
                assert.strictEqual(visited.join(""), expected.join(""));
            } finally {
                dom.window.close();
            }
        });
    }
});
