const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

describe("English interface defaults", function () {
    it("keeps application menu labels in English regardless of the system locale", function () {
        let onReady;
        let onTranslate;
        const electron = {
            app: {
                on: (event, callback) => { onReady = callback; },
                getLocale: () => "pt-BR"
            },
            ipcMain: {
                on: (event, callback) => { onTranslate = callback; }
            }
        };
        const module = { exports: {} };
        const source = fs.readFileSync(path.join(__dirname, "../main-process/i18n/i18n.js"), "utf8");

        vm.runInNewContext(source, {
            require: name => name === "electron" ? electron : require(name),
            module,
            exports: module.exports
        });
        onReady();

        const event = {};
        onTranslate(event, "Open...");
        assert.strictEqual(event.returnValue, "Open...");
        assert.strictEqual(module.exports.currentLocale, "en");
    });

    it("keeps the Explorer, import dialogs and settings tabs in English", function () {
        const rendererDir = path.join(__dirname, "../renderer");
        const navView = fs.readFileSync(path.join(rendererDir, "navView.js"), "utf8");
        const controller = fs.readFileSync(path.join(rendererDir, "controller.js"), "utf8");
        const index = fs.readFileSync(path.join(rendererDir, "index.html"), "utf8");

        ["New File...", "New Folder...", "Import Files...", "Rename", "Delete"].forEach(label => {
            assert.ok(navView.includes(label), label);
        });
        ["Save your story", "Import the rest", "Files already exist"].forEach(label => {
            assert.ok(controller.includes(label), label);
        });
        assert.match(index, />Advanced<\/button>/);
        assert.doesNotMatch(index, />Avançado<\/button>/);
    });
});
