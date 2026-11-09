const assert = require("assert");
const Module = require("module");

function inkFile(relPath, text) {
    return {
        isInkFile: true,
        relPath: relPath,
        relativePath() { return this.relPath; },
        filename() { return this.relPath.split("/").pop(); },
        getValue() { return text; },
        compilerVersionDirty: true
    };
}

function loadLiveCompiler() {
    const sent = [];
    const originalLoad = Module._load;
    const compilerPath = require.resolve("../renderer/liveCompiler.js");
    delete require.cache[compilerPath];
    Module._load = function (request, parent, isMain) {
        if( request === "electron" ) return { ipcRenderer: { send: (...args) => sent.push(args), on: () => {} } };
        if( request === "./i18n.js" ) return { _: text => text };
        return originalLoad.call(this, request, parent, isMain);
    };
    const originalSetInterval = global.setInterval;
    global.setInterval = () => ({ unref() {} });
    try {
        return { LiveCompiler: require(compilerPath).LiveCompiler, sent: sent };
    } finally {
        Module._load = originalLoad;
        global.setInterval = originalSetInterval;
    }
}

describe("stories with more than four choices", function () {
    it("sends the story to inklecate without creating a choice-limit error", function () {
        const { LiveCompiler, sent } = loadLiveCompiler();
        const main = inkFile("story.ink", "START\n* a\n* b\n* c\n* d\n* e\n* f\n  -> END");
        const events = [];
        LiveCompiler.setEvents({
            resetting: () => events.push("resetting"),
            compilerBusyChanged: () => {},
            compileComplete: () => events.push("compileComplete"),
            errorsAdded: errors => events.push("errorsAdded:" + errors.length),
            replayComplete: () => events.push("replayComplete")
        });
        LiveCompiler.setProject({ ready: true, mainInk: main, files: [main] });

        LiveCompiler.reload();

        const compile = sent.find(args => args[0] === "compile");
        assert.ok(compile);
        assert.strictEqual(compile[1].play, true);
        assert.deepStrictEqual(events, ["resetting"]);
        assert.deepStrictEqual(LiveCompiler.getIssues(), []);
        assert.strictEqual(main.compilerVersionDirty, false);
    });

    it("starts web export without a choice-limit error", function () {
        const { LiveCompiler, sent } = loadLiveCompiler();
        const main = inkFile("story.ink", "START\n* a\n* b\n* c\n* d\n* e\n* f\n  -> END");
        let exportError = null;
        LiveCompiler.setEvents({
            resetting: () => {},
            compilerBusyChanged: () => {},
            compileComplete: () => {},
            errorsAdded: () => {},
            replayComplete: () => {}
        });
        LiveCompiler.setProject({ ready: true, mainInk: main, files: [main] });

        LiveCompiler.compileForWeb(error => { exportError = error; });

        const compile = sent.find(args => args[0] === "compile");
        assert.ok(compile);
        assert.strictEqual(compile[1].export, true);
        assert.strictEqual(exportError, null);
    });
});
