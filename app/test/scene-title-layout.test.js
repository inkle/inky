const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const previewCss = fs.readFileSync(path.join(root, "renderer/gameChrome.css"), "utf8");
const exportCss = fs.readFileSync(path.join(root, "export-for-web-template/style.css"), "utf8");

describe("scene title and body layout", function () {
    it("starts every passage with an image 15px below the image, with or without a title", function () {
        assert.match(previewCss, /#main #player \.innerText\.has-visual \.story-passage \{[\s\S]*?padding-top:\s*15px;[\s\S]*?justify-content:\s*flex-start;/);
        assert.match(exportCss, /\.container\.has-visual \.story-passage \{[\s\S]*?padding-top:\s*15px;[\s\S]*?justify-content:\s*flex-start;/);
    });

    it("uses the standard top spacing when there is no image", function () {
        assert.match(previewCss, /#main #player \.innerText:not\(\.has-visual\) \.story-passage \{[\s\S]*?padding-top:\s*clamp\(52px,\s*8cqmin,\s*76px\);[\s\S]*?justify-content:\s*flex-start;/);
        assert.match(exportCss, /\.container:not\(\.has-visual\) \.story-passage \{[\s\S]*?padding-top:\s*clamp\(52px,\s*8vmin,\s*76px\);[\s\S]*?justify-content:\s*flex-start;/);
    });

    it("does not use the presence of a scene title to position the passage", function () {
        assert.doesNotMatch(previewCss, /has-visual \.story-passage:has\(> \.scene-title\)/);
        assert.doesNotMatch(exportCss, /has-visual \.story-passage:has\(> \.scene-title\)/);
    });
});
