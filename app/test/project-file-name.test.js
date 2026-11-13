const assert = require("assert");
const { getRenameStem, withPreservedExtension } = require("../renderer/projectFileName.js");

describe("project file rename names", function () {
    it("selects only the basename portion for Ink and YAML files", function () {
        assert.strictEqual(getRenameStem("scene.ink"), "scene");
        assert.strictEqual(getRenameStem("game.yaml"), "game");
        assert.strictEqual(getRenameStem("scene.v2.ink"), "scene.v2");
    });

    it("preserves the existing extension when a new basename is provided", function () {
        assert.deepStrictEqual(withPreservedExtension("scene.ink", "new scene"), {
            stem: "new scene",
            filename: "new scene.ink"
        });
        assert.deepStrictEqual(withPreservedExtension("settings.yml", "settings.yaml"), {
            stem: "settings",
            filename: "settings.yml"
        });
    });
});
