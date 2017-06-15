const electron = require("electron");
const ipc = electron.ipcRenderer;
const _ = require("lodash");
const {filter, wrap} = require("fuzzaldrin-plus");

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

    if( !searchStr ) return;

    var toQuery = _.map(InkProject.currentProject.files, file => ({
        name: file.filename(),
        orginal: file
    }));

    var results = filter(toQuery, searchStr, {key: "name"});

    _.each(results, result => {
        var wrappedResult = wrap(result.name, searchStr, { wrap: {
            tagOpen: "<span class='goto-highlight'>",
            tagClose: "</span>"
        }});
        var $result = $(`<li>${wrappedResult}</li>`);
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