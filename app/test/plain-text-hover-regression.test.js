"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "renderer/main.css"), "utf8");
const player = fs.readFileSync(path.join(root, "renderer/playerView.js"), "utf8");
const safe = fs.readFileSync(path.join(root, "renderer/safeHtml.js"), "utf8");

// The former rule was active on *every* keydown, not just Alt, which explains
// why hovering would sometimes underline seemingly arbitrary story words.
assert(!css.includes("#player.altKey .innerText p span:hover"), "No word hover underline rule");
assert(!player.includes('$("#player").addClass("altKey")'), "No keydown style toggling");
assert(!player.includes('$("#player").removeClass("altKey")'), "No keyup style toggling");
assert(!css.match(/#player\.altKey\s*\{/), "No global altKey styling");

// Do not break author navigation: holding Alt and clicking a word should still
// find its source, but *without* a fake hyperlink visual treatment.
assert(!player.includes("SafeHtml.wrapWords($paragraph[0])"), "Preview uses contiguous text nodes for stable rendering");
assert(player.includes("SafeHtml.wordSourceOffset"), "Preserves Alt-click source navigation without spans");
assert(player.includes('if( !e.altKey ) return;'), "Preserves Alt-click to source");
assert(player.includes("events.jumpToSource(previousContentLength + sourceOffset)"), "Preserves source navigation");
assert(safe.includes('span.className = "inky-word"'), "Word mapping still exists");

// Reader's true interactive controls must keep their hover feedback.
assert(css.includes(".choice-button:hover"), "Choice hover preserved");
console.log("PASS: normal story reading has no underline-on-hover; Alt-click navigation and choice feedback preserved.");
