const InkProject = require("./inkProject.js").InkProject;
const editor = ace.edit("editor");

var history = [];
var currentHistoryIdx = -1;
var events = {};
var navigating = false;

function go(steps) {
    var newHistoryIdx = currentHistoryIdx + steps;
    if( newHistoryIdx < 0 )
        newHistoryIdx = 0;
    if( newHistoryIdx >= history.length )
        newHistoryIdx = history.length-1;

    if( newHistoryIdx != currentHistoryIdx ) {
        currentHistoryIdx = newHistoryIdx;

        navigating = true;
        events.goto(history[currentHistoryIdx]);
        navigating = false;
    }
}

function addStep() {
    if( !InkProject.currentProject || navigating )
        return;

    var file = InkProject.currentProject.activeInkFile;

    // Don't store a reference to the file itself so that
    // the reference is weak and doesn't keep old files around
    var step = {
        filePath: file.relativePath(),
        position: editor.getCursorPosition()
    };

    currentHistoryIdx++;

    // Re-writing history? remove future steps
    if( history.length > currentHistoryIdx )
        history.splice(currentHistoryIdx);

    history.push(step);
}

function reset() {
    history = [];
    currentHistoryIdx = -1;
}

exports.NavHistory = {
    setEvents: (e) => { events = e; },
    back: () => go(-1),
    forward: () => go(+1),
    addStep: addStep,
    reset: reset
}