// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
var $ = require('./jquery-2.2.3.min.js');
window.Split = require("split.js");
var ipc = require("electron").ipcRenderer;
var util = require('util');

var editor = ace.edit("editor");
editor.getSession().setUseWrapMode(true);

$(document).ready(function() {

    $(".compile_button").click(() => {
        ipc.send("compile-ink", editor.getValue());
    });

    ipc.on("compile", () => {
        console.log("Received compile instruction. Will compile the following:");
        console.log(editor.getValue());
        ipc.send("compile-ink", editor.getValue());
    });

    ipc.on("did-compile", (event, result) => {
        console.log("Renderer got result back from inklecate. Will place it in #player...");
        console.log("Placing: "+result);
        $("#player").text(result);
    });

    Split(['#editor', '#player'], {
        sizes: [25, 75],
        minSize: 200
    });
});