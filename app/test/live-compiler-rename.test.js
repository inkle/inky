const assert = require("assert");
const Module = require("module");

// Loads liveCompiler.js with its Electron and i18n dependencies replaced by stubs.
function loadLiveCompiler() {
    const sent = [];
    const originalLoad = Module._load;
    const compilerPath = require.resolve("../renderer/liveCompiler.js");
    delete require.cache[compilerPath];
    Module._load = function (request, parent, isMain) {
        if( request === "electron" ) return { ipcRenderer: { send: (...args) => sent.push(args), on: () => {} } };
        if( request === "./i18n.js" ) return {};
        return originalLoad.call(this, request, parent, isMain);
    };
    // The module starts a polling timer when it loads; do not let it keep the test process alive.
    const originalSetInterval = global.setInterval;
    global.setInterval = () => ({ unref() {} });
    try {
        return { LiveCompiler: require(compilerPath).LiveCompiler, sent: sent };
    } finally {
        Module._load = originalLoad;
        global.setInterval = originalSetInterval;
    }
}

function fakeInk(relPath, text) {
    return {
        isInkFile: true,
        relPath: relPath,
        compilerVersionDirty: true,
        relativePath() { return this.relPath; },
        filename() { return this.relPath.split("/").pop(); },
        getValue() { return text; }
    };
}

describe("LiveCompiler after project paths change", function () {
    it("rebuilds the temporary project when the first save assigns the main story filename", function () {
        const { LiveCompiler, sent } = loadLiveCompiler();
        const main = fakeInk("Untitled.ink", "INCLUDE scenes/a.ink\n-> a");
        const scene = fakeInk("scenes/a.ink", "=== a ===\nHello\n-> END");
        const gameSettings = { isInkFile: false, compilerVersionDirty: true };
        const project = { ready: true, mainInk: main, files: [main, scene, gameSettings] };
        LiveCompiler.setEvents({ resetting() {}, compilerBusyChanged() {} });
        LiveCompiler.setProject(project);
        LiveCompiler.reload();
        const first = sent.filter(args => args[0] === "compile").pop()[1];
        assert.strictEqual(first.mainName, "Untitled.ink");
        assert.deepStrictEqual(Object.keys(first.updatedFiles).sort(), ["Untitled.ink", "scenes/a.ink"]);

        // Nothing changed since the first compile: nothing is sent again.
        LiveCompiler.reload();
        assert.deepStrictEqual(Object.keys(sent.filter(args => args[0] === "compile").pop()[1].updatedFiles), []);

        // Saving the untitled project changes the main path without changing its text.
        main.relPath = "story.ink";
        LiveCompiler.projectFilesChanged();
        const saved = sent.filter(args => args[0] === "compile").pop()[1];
        assert.strictEqual(saved.mainName, "story.ink");
        assert.deepStrictEqual(Object.keys(saved.updatedFiles).sort(), ["scenes/a.ink", "story.ink"]);
        assert.strictEqual(gameSettings.compilerVersionDirty, true);
        assert.notStrictEqual(saved.namespace, first.namespace);

        // Later file renames also rebuild the temporary compiler copy.
        main.relPath = "story.ink";
        scene.relPath = "scenes/b.ink";
        LiveCompiler.projectFilesChanged();
        const second = sent.filter(args => args[0] === "compile").pop()[1];
        assert.strictEqual(second.mainName, "story.ink");
        assert.deepStrictEqual(Object.keys(second.updatedFiles).sort(), ["scenes/b.ink", "story.ink"]);
        assert.notStrictEqual(second.namespace, first.namespace);
    });
});
