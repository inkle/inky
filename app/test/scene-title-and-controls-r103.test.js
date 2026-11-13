"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { GameStyle } = require("../renderer/gameStyle.js");

describe("R103 cumulative fixes", function() {
  it("uses 33.3 px for the default scene title and keeps explicit override", function() {
    const model = GameStyle.parseText("").model;
    assert.strictEqual(model.titles.sceneStyle.size, 33.3);
    const specific = GameStyle.parseText("titles:\n  scene_style:\n    size: 25\n").model;
    assert.strictEqual(specific.titles.sceneStyle.size, 25);
  });
  it("keeps Exported Page controls label scoped to restart and save", function() {
    const html = fs.readFileSync(path.join(__dirname,"../renderer/gameSettings/gameSettings.html"),"utf8");
    assert.match(html, /Show the restart and save buttons/);
    assert.doesNotMatch(html, /Show the restart, save and load buttons/);
  });
  it("has the atomic Backspace handler for flag tags", function() {
    const js = fs.readFileSync(path.join(__dirname,"../renderer/tagPicker.js"),"utf8");
    assert.match(js, /removeFlagTagName/);
    assert.match(js, /TAG_REGISTRY\[tag.name\]\.kind === "flag"/);
  });
});
