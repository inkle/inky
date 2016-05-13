// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
var $ = window.jQuery = require('./jquery-2.2.3.min.js');
var ipc = require("electron").ipcRenderer;
var util = require('util');

var editor = ace.edit("editor");
editor.getSession().setUseWrapMode(true);

$(document).ready(function() {

    $

    ipc.on("play", () => {
        console.log("Received play instruction. Will play the following:");
        console.log(editor.getValue());
        ipc.send("play-ink", editor.getValue());

        // Reset text
        $("#player .innerText").text("");
    });

    ipc.on("play-generated-text", (event, result) => {
        console.log("Received play text: "+result);

        var $paragraph = $("<p></p>");
        $paragraph.text(result);
        $("#player .innerText").append($paragraph);
    });

    ipc.on("play-generated-choice", (event, choice) => {
        var $choice = $("<a href='"+choice.number+"'>"+choice.text+"</a>");
        $choice.on("click", (event) => {
            ipc.send("play-continue-with-choice-number", choice.number);
            event.preventDefault();
        });
        var $choicePara = $("<p></p>");
        $choicePara.append($choice);
        $("#player .innerText").append($choicePara);
    });

    ipc.on("compile", () => {
        console.log("Received compile instruction. Will compile the following:");
        console.log(editor.getValue());
        ipc.send("compile-ink", editor.getValue());
    });

    ipc.on("did-compile", (event, result) => {
        console.log("Renderer got result back from inklecate. Will place it in #player...");
        console.log("Placing: "+result);
        $("#player .innerText").text(result);
    });
});