// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
const ipc = require("electron").ipcRenderer;
const util = require('util');
const assert = require('assert');
const path = require("path");

const $ = window.jQuery = require('./jquery-2.2.3.min.js');
const DocumentManager = require('./electron-document-manager').getRendererModule();

const EditorView = require("./editorView.js").EditorView;
const PlayerView = require("./playerView.js").PlayerView;
const ToolbarView = require("./toolbarView.js").ToolbarView;

var sessionId = 0;
var choiceSequence = [];
var currentReplayTurnIdx = -1;

var lastEditorChange = null;
var issues = [];
var selectedIssueIdx = -1;

DocumentManager.setContentSetter(function(content) {
    EditorView.setValue(content);
});
 
DocumentManager.setContentGetter(function() {
    return EditorView.getValue();
});

var currentFilepath = null;
ipc.on("set-filepath", (event, filename) => {
    currentFilepath = filename;
    var baseFilename = path.basename(filename);
    $("h1.title").text(path.basename(filename));

    $(".sidebar .nav-group.main-ink .nav-group-item .filename").text(baseFilename)
});

function resetErrors() {
    issues = [];
    selectedIssueIdx = -1;
    
    EditorView.clearErrors();
    ToolbarView.updateIssueSummary(issues);
}

function reloadInkForPlaying() {

    lastEditorChange = null;

    stop(sessionId);

    sessionId += 1;

    if( choiceSequence.length > 0 )
        currentReplayTurnIdx = 0;

    console.log("New session id in play(): "+sessionId);

    PlayerView.prepareForNextContent();

    resetErrors();

    ipc.send("play-ink", EditorView.getValue(), sessionId);
}

function stop(idToStop) {
    ipc.send("play-stop-ink", idToStop);
}

// Do first compile
// Really just for debug when loading ink immediately
// other actions will cause editor changes
setTimeout(reloadInkForPlaying, 1000);

// compile loop - detect changes every 0.25 and make sure
// user has paused before actually compiling
setInterval(() => {
    if( lastEditorChange != null && Date.now() - lastEditorChange > 500 ) {
        lastEditorChange = null;
        reloadInkForPlaying();
    }
}, 250);

EditorView.onChange(() => {
    lastEditorChange = Date.now();
    DocumentManager.setEdited(true);
});

ipc.on("next-issue", () => {
    if( issues.length > 0 ) {
        selectedIssueIdx++;
        if( selectedIssueIdx >= issues.length )
            selectedIssueIdx = 0;
        EditorView.gotoLine(issues[selectedIssueIdx].lineNumber);
    }
});

ipc.on("play-generated-text", (event, result, fromSessionId) => {

    if( fromSessionId != sessionId )
        return;

    var replaying = currentReplayTurnIdx != -1;
    var animated = !replaying;
    PlayerView.addTextSection(result, animated);
});

ipc.on("play-generated-error", (event, error, fromSessionId) => {
    
    if( sessionId != fromSessionId )
        return;

    EditorView.addError(error);

    if( error.type == "RUNTIME ERROR" ) {
        PlayerView.addLineError(error, () => {
            EditorView.gotoLine(error.lineNumber);
        });
    }

    issues.push(error);

    ToolbarView.updateIssueSummary(issues);
});

ipc.on("play-generated-choice", (event, choice, fromSessionId) => {

    if( fromSessionId != sessionId )
        return;

    var animated = false;
    if( currentReplayTurnIdx == choiceSequence.length )
        currentReplayTurnIdx = -1;
    else
        animated = true;

    if( currentReplayTurnIdx == -1 || currentReplayTurnIdx >= choiceSequence.length ) {
        PlayerView.addChoice(choice, animated, () => {
            ipc.send("play-continue-with-choice-number", choice.number, fromSessionId);
            choiceSequence.push(choice.number);
        });
    }
});



ipc.on("play-requires-input", (event, fromSessionId) => {

    if( fromSessionId != sessionId )
        return;

    PlayerView.scrollToBottom();

    // Replay?
    if( currentReplayTurnIdx >= 0 && currentReplayTurnIdx < choiceSequence.length ) {

        PlayerView.addHorizontalDivider();

        var replayChoiceNumber = choiceSequence[currentReplayTurnIdx];
        currentReplayTurnIdx++;
        ipc.send("play-continue-with-choice-number", replayChoiceNumber, fromSessionId);
    }
});

ipc.on("play-story-completed", (event, fromSessionId) => {

    console.log("play-story-completed from "+fromSessionId);
    if( fromSessionId != sessionId )
        return;

    PlayerView.addTerminatingMessage("End of story", "end");
});

ipc.on("play-story-unexpected-exit", (event, fromSessionId) => {

    console.log("play-story-unexpected-exit from "+fromSessionId);
    if( sessionId != fromSessionId ) 
        return;

    PlayerView.addTerminatingMessage("Error in story", "error");
});

ipc.on("play-story-stopped", (event, fromSessionId) => {
    console.log("play-story-stopped from "+fromSessionId);
});

ToolbarView.setEvents({
    rewind: () => {
        choiceSequence = [];
        currentReplayTurnIdx = -1;
        reloadInkForPlaying();
    },
    stepBack: () => {
        if( choiceSequence.length > 0 )
            choiceSequence.splice(-1, 1);
        reloadInkForPlaying();
    },
    selectIssue: (issue) => {
        EditorView.gotoLine(issue.lineNumber);
    }
})


