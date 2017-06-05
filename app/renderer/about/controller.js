const electron = require("electron");
const ipc = electron.ipcRenderer;
const $ = window.jQuery = require('../jquery-2.2.3.min.js');

ipc.on("set-about-data", (event, data) => {
    console.log("Receiving");
    $("body").text(JSON.stringify(data));
});