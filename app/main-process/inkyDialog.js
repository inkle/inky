"use strict";

const { BrowserWindow, ipcMain } = require("electron");
const path = require("path");

// Native GTK message boxes can show the generic icon in their window decoration.
// A real, framed BrowserWindow lets the Linux window manager use Inky's icon.
const INKY_DIALOG_ICON = path.join(__dirname, "icons", "inky-dialog.png");
const INIT_EVENT = "inky-branded-dialog-init";
const RESPONSE_EVENT = "inky-branded-dialog-response";

function dialogSpec(type, opts = {}) {
    const buttons = Array.isArray(opts.buttons) && opts.buttons.length ? opts.buttons.map(String) : ["OK"];
    const cancelId = Number.isInteger(opts.cancelId) && opts.cancelId >= 0 && opts.cancelId < buttons.length
        ? opts.cancelId : buttons.length - 1;
    const defaultId = Number.isInteger(opts.defaultId) && opts.defaultId >= 0 && opts.defaultId < buttons.length
        ? opts.defaultId : 0;
    return {
        kind: type === "save" ? "save" : "export",
        title: String(opts.title || "Inky"),
        message: String(opts.message || ""),
        detail: String(opts.detail || ""),
        buttons, cancelId, defaultId
    };
}

function showInkyDialog(parent, type, options) {
    const spec = dialogSpec(type, options);
    return new Promise((resolve, reject) => {
        let window;
        let settled = false;
        function finish(response) {
            if (settled) return;
            settled = true;
            ipcMain.removeListener(RESPONSE_EVENT, onResponse);
            resolve({ response, checkboxChecked: false });
            if (window && !window.isDestroyed()) window.close();
        }
        function onResponse(event, response) {
            if (!window || event.sender !== window.webContents || !Number.isInteger(response)
                || response < 0 || response >= spec.buttons.length) return;
            finish(response);
        }
        try {
            window = new BrowserWindow({
                parent: parent && !parent.isDestroyed() ? parent : undefined,
                modal: !!(parent && !parent.isDestroyed()),
                width: spec.kind === "save" ? 440 : 500,
                height: spec.kind === "save" ? 158 : 190,
                minWidth: 400,
                minHeight: 145,
                maxWidth: 760,
                maxHeight: 650,
                resizable: spec.kind === "export",
                maximizable: false,
                minimizable: false,
                autoHideMenuBar: true,
                show: false,
                backgroundColor: "#303030",
                icon: INKY_DIALOG_ICON,
                title: spec.title,
                webPreferences: {
                    preload: path.join(__dirname, "inkyDialogPreload.js"),
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: false
                }
            });
            window.setMenu(null);
            // Explicitly set the Linux window icon on the actual dialog window.
            if (process.platform === "linux") window.setIcon(INKY_DIALOG_ICON);
            ipcMain.on(RESPONSE_EVENT, onResponse);
            window.once("closed", () => finish(spec.cancelId));
            window.webContents.once("did-finish-load", () => {
                if (!window.isDestroyed()) window.webContents.send(INIT_EVENT, spec);
            });
            window.once("ready-to-show", () => {
                if (!window.isDestroyed()) window.show();
            });
            window.loadFile(path.join(__dirname, "inkyDialog.html")).catch(error => {
                if (!settled) {
                    settled = true;
                    ipcMain.removeListener(RESPONSE_EVENT, onResponse);
                    if (!window.isDestroyed()) window.destroy();
                    reject(error);
                }
            });
        } catch (error) {
            ipcMain.removeListener(RESPONSE_EVENT, onResponse);
            if (window && !window.isDestroyed()) window.destroy();
            reject(error);
        }
    });
}

module.exports = { showInkyDialog, dialogSpec, INKY_DIALOG_ICON };
