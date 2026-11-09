"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { EventEmitter } = require("events");

function load(dialogOutput, settings = {}) {
    const file = path.join(__dirname, "../main-process/inkyFileDialog.js");
    const calls = [];
    const native = {
        showOpenDialog(...args) { calls.push(["native-open", ...args]); return Promise.resolve({ canceled: true, filePaths: [] }); },
        showSaveDialog(...args) { calls.push(["native-save", ...args]); return Promise.resolve({ canceled: true, filePath: "" }); },
        showOpenDialogSync(...args) { calls.push(["native-sync", ...args]); return undefined; }
    };
    const fakeSpawn = () => {
        const proc = new EventEmitter();
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.stdout.setEncoding = () => {};
        proc.stdin = new EventEmitter();
        proc.stdin.end = data => {
            calls.push(["gtk-request", JSON.parse(data)]);
            process.nextTick(() => {
                proc.stdout.emit("data", dialogOutput);
                proc.emit("close", settings.exitCode || 0);
            });
        };
        proc.kill = () => {};
        return proc;
    };
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(file, "utf8"), {
        module, exports: module.exports, __dirname: path.dirname(file), Buffer,
        process: { platform: "linux", env: { DISPLAY: ":10", ...settings.env } },
        require(name) {
            if (name === "electron") return { dialog: native };
            if (name === "child_process") return { spawn: fakeSpawn };
            if (name === "./inkyDialog") return { INKY_DIALOG_ICON: "/tmp/inky-icon.png" };
            return require(name);
        }
    }, { filename: file });
    return { chooser: module.exports, calls };
}

describe("Branded GTK file chooser and native fallback", () => {
    it("uses a NON-BLOCKING GTK picker for File > Open and preserves .ink filters", async () => {
        const m = load('{"canceled":false,"filePaths":["/tmp/story.ink"]}');
        const result = await m.chooser.showOpenDialog(null, { filters: [{ name: "Ink", extensions: ["ink"] }] });
        assert.deepStrictEqual(Array.from(result.filePaths), ["/tmp/story.ink"]);
        assert.strictEqual(m.calls[0][0], "gtk-request");
        assert.strictEqual(m.calls[0][1].options.filters[0].extensions[0], "ink");
    });
    it("returns a cancel result without opening another chooser", async () => {
        const m = load('{"canceled":true,"filePaths":[]}');
        const result = await m.chooser.showOpenDialog(null, {});
        assert.strictEqual(result.canceled, true);
        assert.strictEqual(m.calls.length, 1);
    });
    it("preserves the export directory name", async () => {
        const m = load('{"canceled":false,"filePath":"/tmp/my-web-export"}');
        const result = await m.chooser.showSaveDialog(null, { defaultPath: "/tmp/my-web-export" });
        assert.strictEqual(result.filePath, "/tmp/my-web-export");
        assert.strictEqual(m.calls[0][1].mode, "save");
    });
    it("falls back to Electron if GTK fails", async () => {
        const m = load("", { exitCode: 2 });
        const result = await m.chooser.showOpenDialog(null, {});
        assert.strictEqual(result.canceled, true);
        assert.strictEqual(m.calls[1][0], "native-open");
    });
    it("allows opting out of the helper", async () => {
        const m = load('{"canceled":false,"filePaths":["/tmp/story.ink"]}', { env: { INKY_DISABLE_GTK_CHOOSER: "1" } });
        await m.chooser.showOpenDialog(null, {});
        assert.strictEqual(m.calls[0][0], "native-open");
    });
    it("passes the parent X11 window id when supported", async () => {
        const m = load('{"canceled":true,"filePaths":[]}');
        const win = { isDestroyed: () => false, getNativeWindowHandle: () => Buffer.from([1, 2, 3, 4, 0, 0, 0, 0]) };
        await m.chooser.showOpenDialog(win, {});
        assert.strictEqual(m.calls[0][1].parentXid, 0x04030201);
    });
    it("never launches the GTK helper via a blocking synchronous process", () => {
        const source = fs.readFileSync(path.join(__dirname, "../main-process/inkyFileDialog.js"), "utf8");
        assert.doesNotMatch(source, /\bspawnSync\s*\(/);
        const m = load("{}");
        m.chooser.showOpenDialogSync(null, {});
        assert.strictEqual(m.calls[0][0], "native-sync");
    });
});
