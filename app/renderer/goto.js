const electron = require("electron");
const ipc = electron.ipcRenderer;
const _ = require("lodash");
const $ = window.jQuery = require('./jquery-2.2.3.min.js');

const InkProject = require("./inkProject.js").InkProject;

var $goto = null;
var $input = null;
var $results = null;


function show() {
    $goto.removeClass("hidden");

    setTimeout(() => $input.focus(), 200);
    
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

function refresh() {

    var searchStr = $input.val();

    $results.empty();

    var files = _.filter(InkProject.currentProject.files, f => f.relPath.indexOf(searchStr) != -1);
    _.each(files, f => {
        var $result = $(`<li>${f.relPath}</li>`);
        $results.append($result);
    });
}

$(document).ready(() => {
    $goto = $("#goto-anything");
    $input = $goto.children("input");
    $results = $goto.children(".results");
    $input.on("input", refresh);
});

ipc.on("goto-anything", (event) => {
    toggle();
});

// TESTING
setTimeout(show, 1000);