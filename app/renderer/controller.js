const ipc = require("electron").ipcRenderer;
const path = require("path");

const EditorView = require("./editorView.js").EditorView;
const PlayerView = require("./playerView.js").PlayerView;
const ToolbarView = require("./toolbarView.js").ToolbarView;
const NavView = require("./navView.js").NavView;
const LiveCompiler = require("./liveCompiler.js").LiveCompiler;
const InkProject = require("./inkProject.js").InkProject;


function updateFilename(filename) {
    filename = filename || InkProject.currentProject.activeInkFile.filename()
    ToolbarView.setTitle(filename);
    NavView.setCurrentFilename(filename);
}

InkProject.setEvents({
    "newProject": (project) => {
        updateFilename();
        EditorView.focus();
        LiveCompiler.setProject(project);
    },
    "didSave": () => updateFilename(),
    "changeOpenInkFile": (inkFile) => updateFilename(inkFile.filename())
});
InkProject.startNew();


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

EditorView.setEvents({
    "change": () => {
        LiveCompiler.setEdited();
    },
    "jumpToSymbol": (symbolName, contextPos) => {
        var foundSymbol = InkProject.currentProject.findSymbol(symbolName, contextPos);
        if( foundSymbol ) {
            EditorView.gotoLine(foundSymbol.row+1, foundSymbol.column);
        }
    },
    "jumpToInclude": (includePath) => {
        alert("Jumping to INCLUDEs not yet supported! "+includePath);
    }
});

ToolbarView.setEvents({
    rewind:   () => { LiveCompiler.rewind(); },
    stepBack: () => { LiveCompiler.stepBack(); },
    selectIssue: (issue) => { EditorView.gotoLine(issue.lineNumber); },
    toggleNav: () => { NavView.toggle(); }
});

NavView.setEvents({
    clickFile: (relativePath) => {
        var inkFile = InkProject.currentProject.inkFileWithRelativePath(relativePath);
        InkProject.currentProject.openInkFile(inkFile);
    }
});