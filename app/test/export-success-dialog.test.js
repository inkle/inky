"use strict";
const assert = require("assert");
const fs = require("fs");
const { exportSuccessDialogOptions, EXPORT_SUCCESS_ICON } = require("../main-process/exportSuccessDialog.js");

describe("Web export completion notification", () => {
    it("uses an explicit bundled success icon and an informational native dialog", () => {
        const options = exportSuccessDialogOptions("Open this file in your browser:\n/tmp/game/index.html");
        assert.strictEqual(options.type, "info");
        assert.strictEqual(options.message, "Web export completed successfully.");
        assert.deepStrictEqual(options.buttons, ["OK"]);
        assert.strictEqual(options.defaultId, 0);
        assert.ok(options.detail.includes("/tmp/game/index.html"));
        assert.strictEqual(options.icon, EXPORT_SUCCESS_ICON);
        assert.ok(fs.statSync(options.icon).isFile());
        assert.strictEqual(fs.readFileSync(options.icon).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    });
    it("handles absent details without inventing paths", () => {
        assert.strictEqual(exportSuccessDialogOptions(null).detail, "");
    });
});
