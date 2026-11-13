const ipc = require("electron").ipcRenderer;
const _ = require("lodash");
const randomstring = require("randomstring");
const i18n = require('./i18n.js');
const ChoiceText = require('./choiceText.js');

var namespace = null;
var sessionIdx = 0;

var currentPlaySessionId = null;
var currentWebExportSessionId = null;
var currentStatsSessionId = null;
var webExportCompleteCallback = null;
var webExportIssues = [];
var webExportStderr = [];

var lastEditorChange = null;
var reloadPending = false;

var choiceSequence = [];
var currentTurnIdx = -1;
var replaying = false;
var userActionCount = 0;   // grows when the player chooses, restarts or steps back (not when the writer edits)

var issues = [];
var selectedIssueIdx = -1;

var locationInSourceCallbackObj = null;
var locationInSourceQueue = [];
var expressionEvaluationObj = null;

var project = null;
var events = {};

var compilerBusy = false;

function setProject(p) {
    project = p;

    // Generate the namespace just once so it stays constant all the while the project/app is open
    // otherwise when the name changes, the temp folder could go out of sync
    var namespaceCode = randomstring.generate(7);
    namespace = project.mainInk.filename().replace(/\./g, "_") + "_" + namespaceCode;

    reloadPending = true;
}

function resetErrors() {
    issues = [];
    selectedIssueIdx = -1;
}

function nextSessionId() {
    sessionIdx += 1;
    return `${namespace}_${sessionIdx}`;
}

function buildCompileInstruction() {

    // Construct instruction object to send to inklecate.js
    var compileInstruction = {
        mainName: project.mainInk.filename(),
        updatedFiles: {},
        sessionId: nextSessionId(),
        namespace: namespace
    };

    project.files.forEach((inkFile) => {
        // game.yaml and other project resources are visible/editable in Inky,
        // but only .ink documents may be sent to the Ink compiler.
        if( !inkFile.isInkFile ) return;

        // Add Ink Files with changes to be saved before the next compile
        // If we're running for the first time, add all because non of the files has been saved to tempInkPath
        if( inkFile.compilerVersionDirty ) {
            compileInstruction.updatedFiles[inkFile.relativePath()] = inkFile.getValue();
            inkFile.compilerVersionDirty = false;
        }
    });

    return compileInstruction;
}

// Call after project files were renamed or moved. The compiler works on a temporary copy of the
// project, written by relative path, so after a rename that copy still holds the old file names
// and the new ones are missing: the compile then fails and the preview stays empty. A fresh
// namespace gives a clean temporary folder, and every Ink file is written to it again.
function projectFilesChanged() {
    if( project == null || !project.mainInk ) return;
    namespace = project.mainInk.filename().replace(/\./g, "_") + "_" + randomstring.generate(7);
    project.files.forEach(inkFile => {
        if( inkFile.isInkFile ) inkFile.compilerVersionDirty = true;
    });
    reloadInklecateSession();
}

function sessionIsCurrent(id) {
    return id == currentPlaySessionId || id == currentWebExportSessionId;
}

function updateCompilerIsBusy(isBusy) {
    if( isBusy != compilerBusy ) {
        compilerBusy = isBusy;
        events.compilerBusyChanged(compilerBusy);
    }
}

function reloadInklecateSession() {

    if( project == null || !project.ready ) {
        reloadPending = true;
        updateCompilerIsBusy(true);
        return;
    }

    lastEditorChange = null;
    reloadPending = false;
    locationInSourceCallbackObj = null;
    locationInSourceQueue = [];

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

    updateCompilerIsBusy(true);
}

function compileForWeb(callback) {
    webExportCompleteCallback = callback;
    webExportIssues = [];
    webExportStderr = [];

    var instr = buildCompileInstruction();
    instr.export = true;
    instr.inkJsCompatible = true;
    currentWebExportSessionId = instr.sessionId;

    ipc.send("compile", instr);

    updateCompilerIsBusy(true);
}

function getStats(callback) {
    statsCompleteCallback = callback;

    var instr = buildCompileInstruction();
    instr.stats = true;
    instr.inkJsCompatible = false;
    currentStatsSessionId = instr.sessionId;

    ipc.send("compile", instr);

    updateCompilerIsBusy(true);
}

function completeWebExport(error, path) {
    var callback = webExportCompleteCallback;
    webExportCompleteCallback = null;
    webExportIssues = [];
    webExportStderr = [];
    if( error )
        callback(error.message);
    else
        callback(null, path);

    updateCompilerIsBusy(false);
}

function stopInklecateSession(idToStop) {
    ipc.send("play-stop-ink", idToStop);

    updateCompilerIsBusy(false);
}

function choose(choice) {
    ipc.send("play-continue-with-choice-number", choice.number, choice.sourceSessionId);
    choiceSequence.push(choice.number);
    currentTurnIdx++;
    userActionCount++;
}

function rewind() {
    userActionCount++;
    choiceSequence = [];
    currentTurnIdx = -1;
    reloadInklecateSession();
}

function stepBack() {
    userActionCount++;
    if( choiceSequence.length > 0 )
        choiceSequence.splice(-1, 1);
    reloadInklecateSession();
}

// The Preview cannot serialize the ink state, so a saved game is the sequence of choices made.
// Replaying them from the start rebuilds the same turn, as the exported page does with its save.
function getChoiceSequence() {
    return choiceSequence.slice();
}

function loadChoiceSequence(sequence) {
    userActionCount++;
    choiceSequence = Array.isArray(sequence) ? sequence.map(number => Number(number)) : [];
    currentTurnIdx = -1;
    reloadInklecateSession();
}

function getLocationInSource(offset, callback, sourceSessionId) {
    if( sourceSessionId !== currentPlaySessionId || lastEditorChange !== null || reloadPending ) {
        console.warn("Ignoring Alt-click until the Preview matches the current source.");
        return;
    }
    queueSourceLookup("get-location-in-source", offset, callback);
}

function getRuntimePathInSource(runtimePath, callback) {
    queueSourceLookup("get-runtime-path-in-source", runtimePath, callback);
}

function queueSourceLookup(channel, value, callback) {
    locationInSourceQueue.push({ channel, value, callback, sessionId: currentPlaySessionId });
    sendNextSourceLookup();
}

function sendNextSourceLookup() {
    if( locationInSourceCallbackObj || locationInSourceQueue.length === 0 ) return;
    locationInSourceCallbackObj = locationInSourceQueue.shift();
    ipc.send(locationInSourceCallbackObj.channel, locationInSourceCallbackObj.value, locationInSourceCallbackObj.sessionId);
}

function evaluateExpression(expressionText, callback) {
    ipc.send("evaluate-expression", expressionText, currentPlaySessionId);
    expressionEvaluationObj = { callback: callback,  sessionId: currentPlaySessionId };
}

// --------------------------------------------------------
// Live re-compile loop
// --------------------------------------------------------

// Compile pending project loads and editor changes once the project is ready
// and the user has paused before compiling.
setInterval(() => {
    if( lastEditorChange !== null && Date.now() - lastEditorChange > 500 ||
        reloadPending && lastEditorChange === null ) {
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

ipc.on("compile-complete", (event, fromSessionId) => {
    if( fromSessionId != currentPlaySessionId ) return;

    updateCompilerIsBusy(false);

    events.compileComplete(fromSessionId);
});


ipc.on("play-generated-text", (event, result, fromSessionId, sourceMap) => {

    if( fromSessionId != currentPlaySessionId ) return;

    // May have just finished compiling, have text
    updateCompilerIsBusy(false);

    events.textAdded(result, sourceMap);
});

ipc.on("play-generated-errors", (event, errors, fromSessionId) => {

    if( !sessionIsCurrent(fromSessionId) ) return;

    // Finished compiling for sure
    updateCompilerIsBusy(false);

    if( fromSessionId == currentWebExportSessionId && errors )
        webExportIssues = webExportIssues.concat(errors);
    issues = errors;
    events.errorsAdded(errors);
});

ipc.on("play-generated-tags", (event, tags, fromSessionId) => {

    if( fromSessionId != currentPlaySessionId ) return;

    // May have finished compiling
    updateCompilerIsBusy(false);

    events.tagsAdded(tags);
});

ipc.on("play-generated-choice", (event, choice, fromSessionId) => {

    if( fromSessionId != currentPlaySessionId ) return;

    choice.sourceSessionId = fromSessionId;

    // May have finished compiling
    updateCompilerIsBusy(false);

    // If there's one choice, that means there are two turns/chunks
    var turnCount = choiceSequence.length+1;
    var isLatestTurn = currentTurnIdx >= turnCount-1;
    var isReplayChoice = ChoiceText.isReplayChoice(replaying, choiceSequence, currentTurnIdx, choice.number);
    events.choiceAdded(choice, isLatestTurn, isReplayChoice);
});

ipc.on("play-requires-input", (event, fromSessionId) => {

    if( fromSessionId != currentPlaySessionId )
        return;

    // May have finished compiling
    updateCompilerIsBusy(false);

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

ipc.on("inklecate-complete", (event, fromSessionId, compiledStoryJsonPath) => {

    if( fromSessionId == currentPlaySessionId ) {
        events.storyCompleted();

        updateCompilerIsBusy(false);

        if( replaying ) {
            replaying = false;
            events.replayComplete(currentPlaySessionId);
        }
    }
    else if( fromSessionId == currentWebExportSessionId ) {
        completeWebExport(null, compiledStoryJsonPath);
    }
});

ipc.on("play-exit-due-to-error", (event, exitCode, fromSessionId) => {

    if( !sessionIsCurrent(fromSessionId) ) return;

    if( fromSessionId == currentWebExportSessionId ) {
        var details = webExportIssues.map(issue => {
            var location = issue.filename ? issue.filename : "";
            if( issue.lineNumber ) location += (location ? ":" : "line ") + issue.lineNumber;
            return (location ? location + ": " : "") + issue.message;
        }).filter(message => message && message.trim());
        details = details.concat(webExportStderr).filter(message => message && message.trim());
        var message = i18n._("Ink has errors - please fix them before exporting.");
        if( details.length ) message += "\n\n" + details.join("\n");
        else message += "\n\n" + i18n._("Compiler exit code: ") + exitCode;
        completeWebExport({message: message});
    } else {
        if( replaying ) {
            replaying = false;
            events.replayComplete();
        }

        events.exitDueToError();

        updateCompilerIsBusy(false);
    }
});

ipc.on("play-story-unexpected-error", (event, error, fromSessionId) => {

    if( !sessionIsCurrent(fromSessionId) ) return;

    if( fromSessionId == currentWebExportSessionId ) {
        webExportStderr.push(String(error).trim());
    } else {
        if( replaying ) {
            replaying = false;
            events.replayComplete(fromSessionId);
        }

        events.unexpectedError(error);

        updateCompilerIsBusy(false);
    }
});

ipc.on("play-story-stopped", (event, fromSessionId) => {
    // Commented out since we get a play-story-stopped immediately after pressing the
    // reset button, which causes the busy-spinner to hide even though it's just started
    // recompiling the ink.
    // updateCompilerIsBusy(false);
});

ipc.on("return-location-from-source", (event, fromSessionId, locationInfo) => {
    if( locationInSourceCallbackObj && fromSessionId == currentPlaySessionId && fromSessionId == locationInSourceCallbackObj.sessionId ) {
        var callback = locationInSourceCallbackObj.callback;
        locationInSourceCallbackObj = null;
        callback(locationInfo);
        sendNextSourceLookup();
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

ipc.on("return-stats", (event, statsObj, fromSessionId) => {

    if( fromSessionId != currentStatsSessionId ) return;
    
    var callback = statsCompleteCallback;
    statsCompleteCallback = null;
    callback(statsObj);

    updateCompilerIsBusy(false);

    currentStatsSessionId = null
});


exports.LiveCompiler = {
    setProject: setProject,
    reload: reloadInklecateSession,
    projectFilesChanged: projectFilesChanged,
    compileForWeb: compileForWeb,
    setEdited: () => {
        lastEditorChange = Date.now();
        locationInSourceCallbackObj = null;
        locationInSourceQueue = [];
    },
    setEvents: (e) => { events = e; },
    getIssues: () => { return issues; },
    getIssuesForFilename: (filename) => _.filter(issues, i => i.filename == filename),
    choose: choose,
    rewind: rewind,
    stepBack: stepBack,
    getChoiceSequence: getChoiceSequence,
    loadChoiceSequence: loadChoiceSequence,
    // True while the story is on the turn the writer is playing now (not replaying earlier ones).
    isLiveTurn: () => currentTurnIdx >= choiceSequence.length,
    getUserActionCount: () => userActionCount,
    getLocationInSource: getLocationInSource,
    getRuntimePathInSource: getRuntimePathInSource,
    evaluateExpression: evaluateExpression,
    getStats: getStats
}
