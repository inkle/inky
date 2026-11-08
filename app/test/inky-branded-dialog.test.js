"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { EventEmitter } = require("events");

function setup() {
    const ipcMain = new EventEmitter();
    const windows = [];
    class FakeWindow extends EventEmitter {
        constructor(options) {
            super(); this.options = options; this.dead = false; this.webContents = new EventEmitter();
            this.webContents.send = (channel, payload) => { this.channel = channel; this.payload = payload; };
            windows.push(this);
        }
        isDestroyed() { return this.dead; }
        setMenu(menu) { this.menu = menu; }
        setIcon(icon) { this.icon = icon; }
        show() { this.shown = true; }
        close() { if (!this.dead) { this.dead = true; this.emit("closed"); } }
        destroy() { this.close(); }
        loadFile(file) { this.file = file; return Promise.resolve(); }
    }
    const filename = path.join(__dirname, "../main-process/inkyDialog.js");
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
        require: id => id === "electron" ? { BrowserWindow: FakeWindow, ipcMain } : require(id),
        __dirname: path.dirname(filename), module, exports: module.exports, process,
        Promise
    }, { filename });
    return { ipcMain, windows, ...module.exports };
}

describe("Inky branded dialogs", () => {
    it("uses a real bundled Inky icon for its Linux window frame", () => {
        const { INKY_DIALOG_ICON, dialogSpec } = setup();
        assert.ok(fs.existsSync(INKY_DIALOG_ICON));
        assert.strictEqual(fs.readFileSync(INKY_DIALOG_ICON).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
        assert.strictEqual(dialogSpec("save", { buttons: ["Save", "Don't save", "Cancel"], cancelId: 2 }).cancelId, 2);
    });
    it("retains all three save choices and returns the selected index", async () => {
        const m = setup();
        const result = m.showInkyDialog(null, "save", { buttons: ["Save", "Don't save", "Cancel"], defaultId: 0, cancelId: 2 });
        const win = m.windows[0];
        assert.strictEqual(win.options.icon, m.INKY_DIALOG_ICON);
        assert.strictEqual(win.options.width, 440);
        assert.strictEqual(win.options.height, 158);
        assert.ok(win.options.minHeight <= win.options.height);

        assert.strictEqual(win.icon, m.INKY_DIALOG_ICON);
        assert.strictEqual(win.options.webPreferences.nodeIntegration, false);
        win.webContents.emit("did-finish-load");
        assert.strictEqual(win.payload.buttons.length, 3);
        m.ipcMain.emit("inky-branded-dialog-response", { sender: win.webContents }, 1);
        assert.strictEqual((await result).response, 1);
        assert.strictEqual(win.dead, true);
    });
    it("treats closing the titlebar X as Cancel, never as Don't save", async () => {
        const m = setup();
        const result = m.showInkyDialog(null, "save", { buttons: ["Save", "Don't save", "Cancel"], cancelId: 2 });
        m.windows[0].close();
        assert.strictEqual((await result).response, 2);
    });
    it("ignores forged IPC replies from other windows", async () => {
        const m = setup();
        const result = m.showInkyDialog(null, "export", { buttons: ["OK"] });
        const win = m.windows[0];
        assert.strictEqual(win.options.width, 500);
        assert.strictEqual(win.options.height, 190);
        m.ipcMain.emit("inky-branded-dialog-response", { sender: {} }, 0);
        assert.strictEqual(win.dead, false);
        m.ipcMain.emit("inky-branded-dialog-response", { sender: win.webContents }, 0);
        assert.strictEqual((await result).response, 0);
    });
    it("does not preselect a button on opening, but preserves keyboard focus styles", () => {
        const renderer = fs.readFileSync(path.join(__dirname, "../main-process/inkyDialogRenderer.js"), "utf8");
        const html = fs.readFileSync(path.join(__dirname, "../main-process/inkyDialog.html"), "utf8");
        assert.doesNotMatch(renderer, /button\.focus\(/);
        assert.match(renderer, /document\.body\.focus\(/);
        assert.match(html, /button:focus-visible/);
    });
    it("renders dialog details as text instead of injected HTML", () => {
        const renderer = fs.readFileSync(path.join(__dirname,"../main-process/inkyDialogRenderer.js"),"utf8");
        assert.match(renderer, /textContent = spec\.detail/);
        assert.doesNotMatch(renderer, /innerHTML/);
    });
});
