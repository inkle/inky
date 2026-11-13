const assert = require("assert");
const Module = require("module");

describe("live compiler source maps", function () {
    let compiler, sent, handlers, events;

    beforeEach(function () {
        sent = [];
        handlers = {};
        events = [];
        const path = require.resolve("../renderer/liveCompiler.js");
        delete require.cache[path];
        const load = Module._load;
        const interval = global.setInterval;
        Module._load = function (request, parent, main) {
            if (request === "electron") return { ipcRenderer: {
                send: (...args) => sent.push(args),
                on: (name, callback) => { handlers[name] = callback; }
            } };
            if (request === "./i18n.js") return {};
            return load.call(this, request, parent, main);
        };
        global.setInterval = () => ({ unref() {} });
        try { compiler = require(path).LiveCompiler; }
        finally { Module._load = load; global.setInterval = interval; }
        const main = { isInkFile: true, compilerVersionDirty: true, filename: () => "main.ink", relativePath: () => "main.ink", getValue: () => "Text" };
        compiler.setEvents({
            resetting() {}, compilerBusyChanged() {},
            textAdded: (text, map) => events.push({ text, map })
        });
        compiler.setProject({ mainInk: main, files: [main], ready: true });
        compiler.reload();
    });

    it("keeps text and maps together and ignores old sessions after recompilation", function () {
        const first = sent.find(item => item[0] === "compile")[1].sessionId;
        const map = { version: 1, unit: "utf16", offsets: [17] };
        handlers["play-generated-text"](null, "x", first, map);
        assert.deepStrictEqual(events, [{ text: "x", map }]);
        compiler.reload();
        const second = sent.filter(item => item[0] === "compile").pop()[1].sessionId;
        handlers["play-generated-text"](null, "old", first, map);
        handlers["play-generated-text"](null, "y", second, map);
        assert.deepStrictEqual(events.map(event => event.text), ["x", "y"]);
        compiler.getLocationInSource(17, () => assert.fail("stale click"), first);
        assert.strictEqual(sent.filter(item => item[0] === "get-location-in-source").length, 0);
    });

    it("serializes lookups so rapid clicks cannot receive another click's result", function () {
        const session = sent.find(item => item[0] === "compile")[1].sessionId;
        const results = [];
        compiler.getLocationInSource(17, result => results.push(result.lineNumber), session);
        compiler.getLocationInSource(18, result => results.push(result.lineNumber), session);
        assert.deepStrictEqual(sent.filter(item => item[0] === "get-location-in-source").map(item => item[1]), [17]);
        handlers["return-location-from-source"](null, session, { lineNumber: 1 });
        assert.deepStrictEqual(sent.filter(item => item[0] === "get-location-in-source").map(item => item[1]), [17, 18]);
        handlers["return-location-from-source"](null, session, { lineNumber: 2 });
        assert.deepStrictEqual(results, [1, 2]);
    });

    it("discards lookups when the editor changes before recompilation", function () {
        const session = sent.find(item => item[0] === "compile")[1].sessionId;
        compiler.getLocationInSource(17, () => assert.fail("stale result"), session);
        compiler.setEdited();
        handlers["return-location-from-source"](null, session, { lineNumber: 1 });
        compiler.getLocationInSource(18, () => assert.fail("stale click"), session);
        assert.deepStrictEqual(sent.filter(item => item[0] === "get-location-in-source").map(item => item[1]), [17]);
    });
});
