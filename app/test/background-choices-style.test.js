const assert = require("assert");
const fs = require("fs");
const path = require("path");

const app = path.resolve(__dirname, "..");
const previewCss = fs.readFileSync(path.join(app, "renderer/gameChrome.css"), "utf8");
const exportCss = fs.readFileSync(path.join(app, "export-for-web-template/style.css"), "utf8");

describe("background and choice visual harmony", function () {
    it("keeps the background visible behind the choice area in Preview and web export", function () {
        assert.match(previewCss, /\.innerText\.container\.has-background \.story-choices \{[\s\S]*?border:\s*0;/);
        assert.match(exportCss, /\.container\.has-background \.story-choices \{[\s\S]*?background:\s*transparent;/);
    });

    it("uses translucent, blurred choice cards only when a scene has a background", function () {
        assert.match(previewCss, /\.innerText\.container\.has-background \.story-choices \.choice \.choice-button[\s\S]*?backdrop-filter:\s*blur\(14px\)/);
        assert.match(exportCss, /\.container\.has-background \.story-choices \.choice \.choice-button[\s\S]*?backdrop-filter:\s*blur\(14px\)/);
    });

    it("preserves a separate base style for stories without a background", function () {
        assert.match(previewCss, /#main #player \.story-choices \{/);
        assert.match(exportCss, /\.story-choices \{/);
    });
});
