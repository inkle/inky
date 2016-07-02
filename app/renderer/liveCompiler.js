const ipc = require("electron").ipcRenderer;
const _ = require("lodash");
var randomstring = require("randomstring");

var namespace = null;
var sessionId = 0;

var currentPlaySessionId = -1;
var currentExportSessionId = -1;
var exportCompleteCallback = null;

var lastEditorChange = null;

var choiceSequence = [];
var currentReplayTurnIdx = -1;

var issues = [];
var selectedIssueIdx = -1;

var locationInSourceCallbackObj = null;

var project = null;
var events = {};

function setProject(p) {
    project = p;

    // Generate the namespace just once so it stays constant all the while the project/app is open
    // otherwise when the name changes, the temp folder could go out of sync
    var namespaceCode = randomstring.generate(7);
    namespace = project.mainInk.filename().replace(/\./g, "_") + "_" + namespaceCode;
}

function resetErrors() {
    issues = [];
    selectedIssueIdx = -1;
}

function buildCompileInstruction() {

    sessionId += 1;

    // Construct instruction object to send to inklecate.js
    var compileInstruction = {
        mainName: project.mainInk.filename(),
        updatedFiles: {},
        sessionId: sessionId,
        namespace: namespace
    };

    project.files.forEach((inkFile) => {
        // Add Ink Files with changes to be saved before the next compile
        // If we're running for the first time, add all because non of the files has been saved to tempInkPath
        if( inkFile.compilerVersionDirty ) {
            compileInstruction.updatedFiles[inkFile.relativePath()] = inkFile.getValue();
            inkFile.compilerVersionDirty = false;
        }
    });

    return compileInstruction;
}

function sessionIsCurrent(id) {
    return id == currentPlaySessionId || id == currentExportSessionId;
}

function reloadInklecateSession() {

    lastEditorChange = null;

    if( currentPlaySessionId >= 0 )
        stopInklecateSession(currentPlaySessionId);

    if( choiceSequence.length > 0 )
        currentReplayTurnIdx = 0;

    events.resetting();

    resetErrors();

    var instr = buildCompileInstruction();
    instr.play = true;

    currentPlaySessionId = instr.sessionId;

    ipc.send("compile", instr, sessionId);
}

function exportJson(callback) {
    exportCompleteCallback = callback;

    var instr = buildCompileInstruction();
    instr.export = true;
    currentExportSessionId = instr.sessionId;

    ipc.send("compile", instr);
}

function completeExport(error, path) {
    var callback = exportCompleteCallback;
    exportCompleteCallback = null;
    if( error )
        callback(error.message);
    else
        callback(null, path);
}

function stopInklecateSession(idToStop) {
    ipc.send("play-stop-ink", idToStop);
}

function choose(choice) {
    ipc.send("play-continue-with-choice-number", choice.number, choice.sourceSessionId);
    choiceSequence.push(choice.number);
}

function rewind() {
    choiceSequence = [];
    currentReplayTurnIdx = -1;
    reloadInklecateSession();
}

function stepBack() {
    if( choiceSequence.length > 0 )
        choiceSequence.splice(-1, 1);
    reloadInklecateSession();
}

function getLocationInSource(offset, callback) {
    ipc.send("get-location-in-source", offset, currentPlaySessionId);
    locationInSourceCallbackObj = { callback: callback, sessionId: currentPlaySessionId };
}

// --------------------------------------------------------
// Live re-compile loop
// --------------------------------------------------------

// Do first compile
// Really just for debug when loading ink immediately
// other actions will cause editor changes
setTimeout(reloadInklecateSession, 1000);

// compile loop - detect changes every 0.25 and make sure
// user has paused before actually compiling
setInterval(() => {
    if( lastEditorChange != null && Date.now() - lastEditorChange > 500 ) {
        lastEditorChange = null;
        reloadInklecateSession();
    }
}, 250);

// --------------------------------------------------------
// IPC event from the native menu option to cycle issues
// --------------------------------------------------------

ipc.on("next-issue", () => {
    if( issues.length > 0 ) {
        selectedIssueIdx++;
        if( selectedIssueIdx >= issues.length )
            selectedIssueIdx = 0;

        events.selectIssue(issues[selectedIssueIdx]);
    }
});

// --------------------------------------------------------
// IPC Events from inklecate.js
// --------------------------------------------------------

ipc.on("play-generated-text", (event, result, fromSessionId) => {

    if( fromSessionId != currentPlaySessionId ) return;

    var replaying = currentReplayTurnIdx != -1;
    events.textAdded(result, replaying);
});

ipc.on("play-generated-errors", (event, errors, fromSessionId) => {

    if( !sessionIsCurrent(fromSessionId) ) return;

    issues = errors;
    events.errorsAdded(errors);
});

ipc.on("play-generated-choice", (event, choice, fromSessionId) => {

    if( fromSessionId != currentPlaySessionId ) return;

    choice.sourceSessionId = fromSessionId;

    var replaying = currentReplayTurnIdx >= 0 && currentReplayTurnIdx < choiceSequence.length;
    events.choiceAdded(choice, replaying);
});

ipc.on("play-requires-input", (event, fromSessionId) => {

    if( fromSessionId != currentPlaySessionId )
        return;

    var replaying = currentReplayTurnIdx >= 0;
    events.playerPrompt(replaying);

    // Replay?
    if( replaying ) {
        var replayChoiceNumber = choiceSequence[currentReplayTurnIdx];
        currentReplayTurnIdx++;
        if( currentReplayTurnIdx >= choiceSequence.length )
            currentReplayTurnIdx = -1;
        ipc.send("play-continue-with-choice-number", replayChoiceNumber, fromSessionId);
    }
});

ipc.on("inklecate-complete", (event, fromSessionId, exportJsonPath) => {

    if( fromSessionId == currentPlaySessionId )
        events.storyCompleted();
    else if( fromSessionId == currentExportSessionId ) {
        completeExport(null, exportJsonPath);
    }
});

ipc.on("play-exit-due-to-error", (event, exitCode, fromSessionId) => {

    if( !sessionIsCurrent(fromSessionId) ) return;

    if( fromSessionId == currentExportSessionId ) {
        completeExport({message: "Ink has errors - please fix them before exporting."});
    } else {
        events.exitDueToError();
    }
});

ipc.on("play-story-unexpected-error", (event, error, fromSessionId) => {

    if( !sessionIsCurrent(fromSessionId) ) return;

    if( fromSessionId == currentExportSessionId ) {
        completeExport({message: "Unexpected error"});
    } else {
        events.unexpectedError(error);
    }
});

ipc.on("play-story-stopped", (event, fromSessionId) => {

});

ipc.on("return-location-from-source", (event, fromSessionId, locationInfo) => {
    if( fromSessionId == locationInSourceCallbackObj.sessionId ) {
        locationInSourceCallbackObj.callback(locationInfo);
        locationInSourceCallbackObj = null;
    }
});

exports.LiveCompiler = {
    setProject: setProject,
    reload: reloadInklecateSession,
    exportJson: exportJson,
    setEdited: () => { lastEditorChange = Date.now(); },
    setEvents: (e) => { events = e; },
    getIssues: () => { return issues; },
    getIssuesForFilename: (filename) => _.filter(issues, i => i.filename == filename),
    choose: choose,
    rewind: rewind,
    stepBack: stepBack,
    getLocationInSource: getLocationInSource
}
