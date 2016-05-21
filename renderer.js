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
const LiveCompiler = require("./liveCompiler.js").LiveCompiler;


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

    ToolbarView.setTitle(baseFilename);

    $(".sidebar .nav-group.main-ink .nav-group-item .filename").text(baseFilename)
});

LiveCompiler.setInkProvider(() => {
    return EditorView.getValue();
})

LiveCompiler.setEvents({
    resetting: () => {
        EditorView.clearErrors();
        ToolbarView.clearIssueSummary();
        PlayerView.prepareForNextContent();
    },
    selectIssue: () => {
        EditorView.gotoLine(issue.lineNumber);
    },
    textAdded: (text, replaying) => {
        var animated = !replaying;
        PlayerView.addTextSection(text, animated);
    },
    choiceAdded: (choice, replaying) => {
        var animated = !replaying;
        if( !replaying ) {
            PlayerView.addChoice(choice, animated, () => {
                LiveCompiler.choose(choice);
            });
        }
    },
    errorAdded: (error) => {
        EditorView.addError(error);
        if( error.type == "RUNTIME ERROR" ) {
            PlayerView.addLineError(error, () => {
                EditorView.gotoLine(error.lineNumber);
            });
        }
        ToolbarView.updateIssueSummary(LiveCompiler.getIssues());
    },
    playerPrompt: (replaying, isLast) => {
        if( replaying )
            PlayerView.addHorizontalDivider();
        else
            PlayerView.scrollToBottom();
    },
    storyCompleted: () => {
        PlayerView.addTerminatingMessage("End of story", "end");
    },
    unexpectedExit: () => {
        PlayerView.addTerminatingMessage("Story exited unexpectedly", "error");
    }
});


EditorView.onChange(() => {
    LiveCompiler.setEdited();
    DocumentManager.setEdited(true);
});

ToolbarView.setEvents({
    rewind:   () => { LiveCompiler.rewind(); },
    stepBack: () => { LiveCompiler.stepBack(); },
    selectIssue: (issue) => { EditorView.gotoLine(issue.lineNumber); }
})


