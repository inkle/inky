const electron = require("electron");
const ipc = electron.ipcRenderer;
const _ = require("lodash");
const {filter, wrap} = require("fuzzaldrin-plus");

const $ = window.jQuery = require('./jquery-2.2.3.min.js');

const InkProject = require("./inkProject.js").InkProject;

var $goto = null;
var $input = null;
var $results = null;

var events = {
    gotoFile: () => {}
};

function show() {
    $goto.removeClass("hidden");
    $input.val("");
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
        file: file
    }));

    var results = filter(toQuery, searchStr, {key: "name"});

    var selectHandler = (event) => {
        var result = event.data;
        if( result.file )
            events.gotoFile(result.file);

        // done!
        hide();
    };

    _.each(results, result => {
        var wrappedResult = wrap(result.name, searchStr, { wrap: {
            tagOpen: "<span class='goto-highlight'>",
            tagClose: "</span>"
        }});
        var $result = $(`<li>${wrappedResult}</li>`);
        $result.on("click keypress", result, selectHandler);
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

exports.GotoAnything = {
    setEvents: e => events = e,
}