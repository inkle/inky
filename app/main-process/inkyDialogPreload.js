"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("inkyDialog", {
    onInit: callback => ipcRenderer.on("inky-branded-dialog-init", (_event, data) => callback(data)),
    respond: response => ipcRenderer.send("inky-branded-dialog-response", response)
});
