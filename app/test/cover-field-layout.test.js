"use strict";
const { test } = global.it ? { test: global.it } : require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "../renderer");

test("Cover occupies Title/Author input column without a thumbnail in both settings panels", () => {
    for(const folder of ["", "gameSettings/"]) {
        const html = fs.readFileSync(path.join(root, folder + "gameSettings.html"), "utf8");
        const css = fs.readFileSync(path.join(root, folder + "gameSettings.css"), "utf8");
        const js = fs.readFileSync(path.join(root, folder + "gameSettings.js"), "utf8");
        const from = html.indexOf('<label for="story-cover">Cover</label>');
        const to = html.indexOf('</div></div>', from);
        const cover = html.slice(from, to + '</div></div>'.length);
        assert.match(cover, /class="cover-input-field"/);
        assert.match(cover, /id="story-cover"/);
        assert.match(cover, /id="choose-story-cover"/);
        assert.match(cover, /id="clear-story-cover"/);
        assert.doesNotMatch(html, /cover-thumb|No cover yet/);
        assert.doesNotMatch(css, /\.cover-thumb/);
        assert.match(css, /\.row > \.cover-input-field/);
        assert.match(css, /\.cover-input-field > input\[type="text"\]/);
        assert.match(css, /#choose-story-cover/);
        assert.match(css, /\.row > \.cover-input-field\s*\{[^}]*display: flex;[^}]*gap: 12px;/);
        assert.match(css, /\.cover-input-field > #choose-story-cover\s*\{[^}]*flex: 0 0 auto;/);
        assert.doesNotMatch(css, /#choose-story-cover\s*\{[^}]*position: absolute/);
        assert.doesNotMatch(css, /#choose-story-cover\s*\{[^}]*transform: translate/);
        assert.doesNotMatch(css, /padding-right: 98px/);
        const pathInput = cover.indexOf('id="story-cover"');
        const choose = cover.indexOf('id="choose-story-cover"');
        const clear = cover.indexOf('id="clear-story-cover"');
        assert(pathInput !== -1 && pathInput < choose && choose < clear);
        assert.doesNotMatch(js, /updateCoverThumb|story-cover-thumb/);
        // Keep selection, clearing, persistence and preview wiring untouched.
        assert.match(js, /\$\("choose-story-cover"\)\.addEventListener\("click"/);
        assert.match(js, /\$\("clear-story-cover"\)\.addEventListener\("click"/);
        assert.match(js, /model\.titles\.cover = reference/);
    }
});
