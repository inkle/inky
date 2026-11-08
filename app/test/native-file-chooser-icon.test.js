"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { EventEmitter } = require("events");

function setup() {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "inky-async-chooser-test-"));
    const calls = [];
    const windows = [];
    let focusedWindow = null;
    let nextResult = { canceled: false, filePaths: [path.join(userData, "example.ink")] };
    let deferred = null;
    class FakeBrowserWindow extends EventEmitter {
        constructor(options) {
            super();
            this.options = options;
            this.webContents = new EventEmitter();
            this.webContents.send = () => {};
            windows.push(this);
        }
        static getFocusedWindow() { return focusedWindow; }
        loadURL() {}
        setSheetOffset() {}
        isDestroyed() { return false; }
        isVisible() { return true; }
    }
    const electron = {
        ipcMain: { on() {} },
        BrowserWindow: FakeBrowserWindow,
        Menu: { getApplicationMenu() { return { items: [] }; } },
        app: { getPath() { return userData; } }
    };
    const file = path.join(__dirname, "../main-process/projectWindow.js");
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(file, "utf8"), {
        require(id) {
            if (id === "electron") return electron;
            if (id === "./inklecate.js") return { Inklecate: { killSessions() {} } };
            if (id === "./inkyFileDialog.js") return {
                showOpenDialog(parent, options) {
                    calls.push(parent ? [parent, options] : [options]);
                    return deferred || Promise.resolve(nextResult);
                },
                showOpenDialogSync() {
                    throw new Error("regression: Open must never use a synchronous picker");
                }
            };
            if (id === "./i18n/i18n.js") return { _: x => x };
            return require(id);
        },
        __dirname: path.dirname(file), module, exports: module.exports,
        process, console
    }, { filename: file });
    return {
        ProjectWindow: module.exports.ProjectWindow, windows, calls,
        setFocus(win) { focusedWindow = win; },
        setResult(value) { nextResult = value; },
        defer() {
            let resolve;
            deferred = new Promise(r => { resolve = r; });
            return resolve;
        },
        close() { fs.rmSync(userData, { recursive: true, force: true }); }
    };
}

describe("Linux GTK File > Open stays responsive", () => {
    it("attaches the chooser to the focused Inky window and preserves the .ink filter", async () => {
        const m = setup();
        try {
            const owner = m.ProjectWindow.createEmpty().browserWindow;
            m.setFocus(owner);
            await m.ProjectWindow.open();
            assert.strictEqual(m.calls.length, 1);
            assert.strictEqual(m.calls[0].length, 2);
            assert.strictEqual(m.calls[0][0], owner);
            assert.strictEqual(m.calls[0][1].title, "Open main ink file");
            assert.strictEqual(m.calls[0][1].properties[0], "openFile");
            assert.strictEqual(m.calls[0][1].filters[0].extensions[0], "ink");
            assert.ok(fs.existsSync(owner.options.icon), "parent must use the real Inky icon");
            assert.strictEqual(m.windows.length, 2, "selected file should open as a new project");
        } finally { m.close(); }
    });
    it("uses a visible Inky window when focus was lost", async () => {
        const m = setup();
        try {
            const owner = m.ProjectWindow.createEmpty().browserWindow;
            m.setFocus(null);
            await m.ProjectWindow.open();
            assert.strictEqual(m.calls[0][0], owner);
        } finally { m.close(); }
    });
    it("opens a parentless chooser if no project exists", async () => {
        const m = setup();
        try {
            await m.ProjectWindow.open();
            assert.strictEqual(m.calls[0].length, 1);
            assert.strictEqual(m.windows.length, 1);
        } finally { m.close(); }
    });
    it("does not create a project when canceled", async () => {
        const m = setup();
        try {
            m.ProjectWindow.createEmpty();
            m.setResult({ canceled: true, filePaths: [] });
            await m.ProjectWindow.open();
            assert.strictEqual(m.windows.length, 1);
        } finally { m.close(); }
    });
    it("does not block Electron while a GTK chooser is waiting; prevents duplicate dialogs", async () => {
        const m = setup();
        try {
            const owner = m.ProjectWindow.createEmpty().browserWindow;
            m.setFocus(owner);
            const finish = m.defer();
            const opening = m.ProjectWindow.open();
            assert.ok(opening && typeof opening.then === "function");
            assert.strictEqual(m.windows.length, 1, "no file opened before user selection");
            // This event-loop turn must run while the chooser remains open.
            await new Promise(resolve => setImmediate(resolve));
            await m.ProjectWindow.open();
            assert.strictEqual(m.calls.length, 1, "only one chooser while pending");
            finish({ canceled: false, filePaths: [path.join(os.tmpdir(), "chosen.ink")] });
            await opening;
            assert.strictEqual(m.windows.length, 2);
        } finally { m.close(); }
    });
    it("preserves direct-path opens from recent files/CLI", () => {
        const m = setup();
        try {
            const project = m.ProjectWindow.open(path.join(os.tmpdir(), "other.ink"));
            assert.strictEqual(typeof project, "object");
            assert.strictEqual(m.windows.length, 1);
            assert.strictEqual(m.calls.length, 0);
        } finally { m.close(); }
    });
    it("keeps save and renderer-side open pickers asynchronous", () => {
        const main = fs.readFileSync(path.join(__dirname, "../main-process/main.js"), "utf8");
        assert.match(main, /const parent = BrowserWindow\.fromWebContents\(event\.sender\);\s*return inkyFileDialog\.showSaveDialog\(parent, saveOptions\)/);
        assert.match(main, /inkyFileDialog\.showOpenDialog\(BrowserWindow\.fromWebContents\(event\.sender\), openOptions\)/);
    });
});
