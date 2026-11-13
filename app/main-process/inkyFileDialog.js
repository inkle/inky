"use strict";

// Linux/X11: show a real GTK file-chooser WINDOW with Inky's own window icon.
// Electron 30's default portal chooser belongs to xdg-desktop-portal-gtk,
// which has no Inky icon in WM_HINTS on XFCE. We intentionally use
// GtkFileChooserDialog, not GtkFileChooserNative (which can use the portal).
// On unsupported systems or any helper error, return to Electron's picker.
const { dialog } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { INKY_DIALOG_ICON } = require("./inkyDialog");

const SCRIPT = path.join(__dirname, "inkyGtkChooser.py");
const MAX_OUTPUT = 256 * 1024;

function supported() {
    return process.platform === "linux" && !!process.env.DISPLAY &&
        process.env.INKY_DISABLE_GTK_CHOOSER !== "1" && fs.existsSync(SCRIPT);
}

function parentXid(parent) {
    if (!parent || typeof parent.isDestroyed === "function" && parent.isDestroyed() ||
        typeof parent.getNativeWindowHandle !== "function" ||
        process.env.XDG_SESSION_TYPE === "wayland") return null;
    try {
        const native = parent.getNativeWindowHandle();
        if (!Buffer.isBuffer(native) || native.length < 4) return null;
        const xid = native.readUInt32LE(0);
        return xid > 0 ? xid : null;
    } catch (_) { return null; }
}

function requestFor(mode, parent, options) {
    return JSON.stringify({
        mode,
        icon: INKY_DIALOG_ICON,
        parentXid: parentXid(parent),
        options: options || {}
    });
}

function parseResult(value, mode) {
    try {
        const data = JSON.parse(value);
        if (!data || typeof data !== "object" || typeof data.canceled !== "boolean") return null;
        if (mode === "open") {
            if (!Array.isArray(data.filePaths) || data.filePaths.some(p => typeof p !== "string")) return null;
            return { canceled: data.canceled, filePaths: data.filePaths };
        }
        if (typeof data.filePath !== "string") return null;
        return { canceled: data.canceled, filePath: data.filePath };
    } catch (_) { return null; }
}

function nativeOpen(parent, options) {
    return parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options);
}
function nativeSave(parent, options) {
    return parent ? dialog.showSaveDialog(parent, options) : dialog.showSaveDialog(options);
}

// Non-blocking chooser: used by renderer IPC operations, especially Web Export.
function runGtkAsync(mode, parent, options) {
    return new Promise(resolve => {
        let child, settled = false, output = "";
        function finish(result) { if (!settled) { settled = true; resolve(result); } }
        try {
            child = spawn("python3", [SCRIPT], { stdio: ["pipe", "pipe", "pipe"] });
            child.stdout.setEncoding("utf8");
            child.stdout.on("data", chunk => {
                output += chunk;
                if (output.length > MAX_OUTPUT) child.kill();
            });
            child.stderr.on("data", () => {}); // GTK may log harmless theme warnings.
            child.on("error", () => finish(null));
            child.on("close", code => finish(code === 0 ? parseResult(output, mode) : null));
            child.stdin.on("error", () => {});
            child.stdin.end(requestFor(mode, parent, options), "utf8");
        } catch (_) { if (child) child.kill(); finish(null); }
    });
}

async function showOpenDialog(parent, options) {
    if (supported()) {
        const result = await runGtkAsync("open", parent, options);
        if (result !== null) return result;
    }
    return nativeOpen(parent, options);
}

async function showSaveDialog(parent, options) {
    if (supported()) {
        const result = await runGtkAsync("save", parent, options);
        if (result !== null) return result;
    }
    return nativeSave(parent, options);
}

// Legacy synchronous callers get Electron's native chooser, never a blocking
// GTK helper. File > Open itself now uses the async showOpenDialog() above.
// Keeping this shim avoids breaking other callers on Windows/macOS or forks.
function showOpenDialogSync(parent, options) {
    return parent ? dialog.showOpenDialogSync(parent, options) : dialog.showOpenDialogSync(options);
}

module.exports = { showOpenDialog, showSaveDialog, showOpenDialogSync, parentXid, parseResult };
