const ipc = require("electron").ipcRenderer;
const _ = require("lodash");
var randomstring = require("randomstring");

var namespace = null;
var sessionIdx = 0;

var currentPlaySessionId = null;
var currentExportSessionId = null;
var exportCompleteCallback = null;

var lastEditorChange = null;

var choiceSequence = [];
var currentTurnIdx = -1;
var replaying = false;

var issues = [];
var selectedIssueIdx = -1;

var locationInSourceCallbackObj = null;
var expressionEvaluationObj = null;

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

    sessionIdx += 1;

    // Construct instruction object to send to inklecate.js
    var compileInstruction = {
        mainName: project.mainInk.filename(),
        updatedFiles: {},
        sessionId: `${namespace}_${sessionIdx}`,
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

    if( currentPlaySessionId  )
        stopInklecateSession(currentPlaySessionId);

    replaying = true;
    currentTurnIdx = 0;

    var instr = buildCompileInstruction();
    instr.play = true;

    events.resetting(instr.sessionId);

    resetErrors();

    currentPlaySessionId = instr.sessionId;

    console.log("This window sending session "+instr.sessionId);
    ipc.send("compile", instr);
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
    currentTurnIdx++;
}

function rewind() {
    choiceSequence = [];
    currentTurnIdx = -1;
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

function evaluateExpression(expressionText, callback) {
    ipc.send("evaluate-expression", expressionText, currentPlaySessionId);
    expressionEvaluationObj = { callback: callback,  sessionId: currentPlaySessionId };
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

    events.textAdded(result);
});

ipc.on("play-generated-errors", (event, errors, fromSessionId) => {

    if( !sessionIsCurrent(fromSessionId) ) return;

    issues = errors;
    events.errorsAdded(errors);
});

ipc.on("play-generated-tags", (event, tags, fromSessionId) => {

    if( fromSessionId != currentPlaySessionId ) return;

    events.tagsAdded(tags);
});

ipc.on("play-generated-choice", (event, choice, fromSessionId) => {

    if( fromSessionId != currentPlaySessionId ) return;

    choice.sourceSessionId = fromSessionId;

    // If there's one choice, that means there are two turns/chunks
    var turnCount = choiceSequence.length+1;
    var isLatestTurn = currentTurnIdx >= turnCount-1;
    events.choiceAdded(choice, isLatestTurn);
});

ipc.on("play-requires-input", (event, fromSessionId) => {

    if( fromSessionId != currentPlaySessionId )
        return;

    var justCompletedReplay = false;
    if( replaying && currentTurnIdx >= choiceSequence.length ) {
        replaying = false;
        justCompletedReplay = true;
    }

    events.playerPrompt(replaying, () => {
        if( replaying ) {
            var replayChoiceNumber = choiceSequence[currentTurnIdx];
            currentTurnIdx++;
            ipc.send("play-continue-with-choice-number", replayChoiceNumber, fromSessionId);
        } 

        if( justCompletedReplay ) 
            events.replayComplete(currentPlaySessionId);
    });
});

ipc.on("inklecate-complete", (event, fromSessionId, exportJsonPath) => {

    if( fromSessionId == currentPlaySessionId )
        events.storyCompleted();

        if( replaying ) {
            replaying = false;
            events.replayComplete(currentPlaySessionId);
        }
    else if( fromSessionId == currentExportSessionId ) {
        completeExport(null, exportJsonPath);
    }
});

ipc.on("play-exit-due-to-error", (event, exitCode, fromSessionId) => {

    if( !sessionIsCurrent(fromSessionId) ) return;

    if( fromSessionId == currentExportSessionId ) {
        completeExport({message: "Ink has errors - please fix them before exporting."});
    } else {
        if( replaying ) {
            replaying = false;
            events.replayComplete();
        }

        events.exitDueToError();
    }
});

ipc.on("play-story-unexpected-error", (event, error, fromSessionId) => {

    if( !sessionIsCurrent(fromSessionId) ) return;

    if( fromSessionId == currentExportSessionId ) {
        completeExport({message: "Unexpected error"});
    } else {
        if( replaying ) {
            replaying = false;
            events.replayComplete(fromSessionId);
        }

        events.unexpectedError(error);
    }
});

ipc.on("play-story-stopped", (event, fromSessionId) => {

});

ipc.on("return-location-from-source", (event, fromSessionId, locationInfo) => {
    if( fromSessionId == locationInSourceCallbackObj.sessionId ) {
        var callback = locationInSourceCallbackObj.callback;
        locationInSourceCallbackObj = null;
        callback(locationInfo);
    }
});

ipc.on("play-evaluated-expression", (event, textResult, fromSessionId) => {
    if( fromSessionId == expressionEvaluationObj.sessionId && expressionEvaluationObj ) {
        var callback = expressionEvaluationObj.callback;
        expressionEvaluationObj = null;
        callback(textResult);
    }
});

ipc.on("play-evaluated-expression-error", (event, errorMessage, fromSessionId) => {
    if( fromSessionId == expressionEvaluationObj.sessionId && expressionEvaluationObj ) {
        var callback = expressionEvaluationObj.callback;
        expressionEvaluationObj = null;
        callback(null, errorMessage);
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
    getLocationInSource: getLocationInSource,
    evaluateExpression: evaluateExpression
}
