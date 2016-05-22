const ipc = require("electron").ipcRenderer;
const path = require("path");

const EditorView = require("./editorView.js").EditorView;
const PlayerView = require("./playerView.js").PlayerView;
const ToolbarView = require("./toolbarView.js").ToolbarView;
const NavView = require("./navView.js").NavView;
const LiveCompiler = require("./liveCompiler.js").LiveCompiler;
const InkProject = require("./inkProject.js").InkProject;

var project = new InkProject();

ipc.on("set-project-main-ink-filepath", (event, filePath) => {

    project = new InkProject(filePath);

    ToolbarView.setTitle(project.mainInk.filename());
    NavView.setCurrentFilename(project.mainInk.filename());
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
    selectIssue: (issue) => {
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
    //DocumentManager.setEdited(true);
});

ToolbarView.setEvents({
    rewind:   () => { LiveCompiler.rewind(); },
    stepBack: () => { LiveCompiler.stepBack(); },
    selectIssue: (issue) => { EditorView.gotoLine(issue.lineNumber); }
})


