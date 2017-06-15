const electron = require("electron");
const ipc = electron.ipcRenderer;
const $ = window.jQuery = require('./jquery-2.2.3.min.js');

var $goto = null

$(document).ready(() => {
    $goto = $("#goto-anything");
});

function show() {
    $goto.removeClass("hidden");

    $goto.children("input").focus();
}

function hide() {
    $goto.addClass("hidden");
}

function toggle() {
    if( $goto.hasClass("hidden") )
        show();
    else
        hide();
}

ipc.on("goto-anything", (event) => {
    toggle();
});

// TESTING
setTimeout(show, 800);