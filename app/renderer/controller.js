const electron = require("electron");
const ipc = electron.ipcRenderer;

const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const $ = window.jQuery = require('./jquery-2.2.3.min.js');

// Debug
//remote.getCurrentWindow().webContents.openDevTools();

// Helpers in global objects and namespace

require("./util.js");
require("./split.js");

// Set up context menu
require("./contextmenu.js");

const EditorView = require("./editorView.js").EditorView;
const PlayerView = require("./playerView.js").PlayerView;
const { GameChrome } = require("./gameChrome.js");
const ToolbarView = require("./toolbarView.js").ToolbarView;
const NavView = require("./navView.js").NavView;
const ExpressionWatchView = require("./expressionWatchView").ExpressionWatchView;
const LiveCompiler = require("./liveCompiler.js").LiveCompiler;
const InkProject = require("./inkProject.js").InkProject;
const NavHistory = require("./navHistory.js").NavHistory;
const GotoAnything = require("./goto.js").GotoAnything;
const i18n = require("./i18n.js");
const StoryAlignment = require("./storyAlignment.js").StoryAlignment;
const GameStyle = require("./gameStyle.js").GameStyle;
const AudioPreview = require("./audioPreview.js").AudioPreview;
const ProjectImport = require("./projectImport.js");
const { isImageFileName } = require("./imageTypes.js");
const { resolveImageReference } = require("./imageTags.js");
const VIRTUAL_GAME_STYLE_PATH = "inky-virtual://game.yaml";

function resolveContainedProjectPath(projectRoot, relativePath) {
    if( !projectRoot || !relativePath || path.isAbsolute(relativePath) ) return null;
    const root = path.resolve(projectRoot);
    const target = path.resolve(root, relativePath);
    return GameStyle.pathStaysInsideRoot(root, target) ? target : null;
}

// "# image: src" and "# bg: src" use the same typed project lookup as the web exporter.
// Bare #image names resolve through image/; bare #bg names through image/background/.
// Explicit relative paths remain available for custom project layouts.
function resolvePreviewImage(value, kind) {
    const source = String(value || "").trim().replace(/\\/g, "/");
    if( !source || source.startsWith("//") ) return null;
    if( /^https?:\/\//i.test(source) ) return source;
    if( /^[a-z][a-z0-9+.-]*:/i.test(source) ) return null;
    const project = InkProject.currentProject;
    const projectDir = project && project.mainInk ? project.mainInk.projectDir : null;
    // Same tag-aware lookup as the export, including the conventional image/background folder.
    const resolved = resolveImageReference(projectDir, source, kind);
    if( resolved.kind === "ambiguous" ) {
        console.warn(`Ambiguous image file name: ${source}. Use an explicit path to select one: ${resolved.candidates.join(" or ")}`);
        return null;
    }
    if( resolved.kind !== "ok" ) return null;
    const file = resolveContainedProjectPath(projectDir, resolved.relative);
    if( !file || !isImageFileName(file) ) return null;
    return pathToFileURL(file).href;
}

InkProject.setEvents({
    "audioFilesChanged": () => AudioPreview.refreshAvailability(),
    "newProject": (project) => {
        activeStyleYamlPath = null;
        activeStyleModeKey = null;
        EditorView.focus();
        LiveCompiler.setProject(project);
        // A save belongs to the story it was made in, as the exported page keeps one save per game.
        savedChoiceSequence = null;
        GameChrome.setSaveAvailable(hasSavedProgress);
        var filename = project.activeInkFile.filename();
        ToolbarView.setTitle(filename);
        NavView.setMainInkFilename(filename);
        NavHistory.reset();
        NavHistory.addStep();
        GameStyle.reload(project);
        StoryAlignment.apply(project);
    },
    "didSave": () => {
        var activeInk = InkProject.currentProject.activeInkFile;
        ToolbarView.setTitle(activeInk.filename());
        NavView.setMainInkFilename(InkProject.currentProject.mainInk.filename());
        NavView.setFiles(InkProject.currentProject.mainInk, InkProject.currentProject.files, InkProject.currentProject.mainInk.projectDir);
        NavView.highlightRelativePath(activeInk.relativePath());

        // A first save gives the story a folder and persists its game.yaml.
        const project = InkProject.currentProject;
        GameStyle.reload(project);
        StoryAlignment.apply(project);
        const styleFrame = document.getElementById("game-settings-inline");
        if( project.mainInk.projectDir && styleFrame && styleFrame.dataset.virtualMode === "1" ) {
            const savedStylePath = GameStyle.entryFilePathFor(project);
            if( savedStylePath ) {
                const virtualMode = styleModeByPath.get(styleModeKey(VIRTUAL_GAME_STYLE_PATH, project));
                if( virtualMode ) styleModeByPath.set(savedStylePath, virtualMode);
                showInlineStyleForm(savedStylePath);
            }
        }
    },
    // game.yaml was created, edited or deleted
    "gameStyleChanged": () => {
        GameStyle.reload(InkProject.currentProject);
        StoryAlignment.apply(InkProject.currentProject);
    },
    "didSwitchToInkFile": (inkFile) => {
        var filename = inkFile.filename();
        ToolbarView.setTitle(filename);
        NavView.highlightRelativePath(inkFile.relativePath());
        if( inkFile.isInkFile ) {
            activeStyleYamlPath = null;
            activeStyleModeKey = null;
            hideInlineStyleForm(false, true);
            NavView.setKnots(inkFile);
            var fileIssues = LiveCompiler.getIssuesForFilename(inkFile.relativePath());
            setImmediate(() => EditorView.setErrors(fileIssues));
            NavView.updateCurrentKnot(inkFile, EditorView.getCurrentCursorPos());
        } else if( inkFile.isYamlFile ) {
            EditorView.clearErrors();
            NavView.setKnots(null);
            const project = InkProject.currentProject;
            const absPath = inkFile.absolutePath();
            const relative = String(inkFile.relativePath() || "").replace(/\\/g, "/").toLowerCase();
            const isVirtualEntry = !project.mainInk.projectDir && relative === GameStyle.FILE_NAME.toLowerCase();
            const isActiveStyle = (absPath && GameStyle.isActiveStylePath(project, absPath)) || isVirtualEntry;
            if( isActiveStyle ) showInlineStyleForm(absPath || VIRTUAL_GAME_STYLE_PATH);
            else {
                activeStyleYamlPath = null;
                activeStyleModeKey = null;
                hideInlineStyleForm(false, true);
            }
        } else {
            activeStyleYamlPath = null;
            activeStyleModeKey = null;
            hideInlineStyleForm(false, true);
            EditorView.clearErrors();
            NavView.setKnots(null);
        }
        NavHistory.addStep();
    }
});

// Wait for DOM to be ready before kicking most stuff off
// (some of the views get confused otherwise)
$(document).ready(() => {
    if( InkProject.currentProject == null ) {
        InkProject.startNew();
        NavView.setKnots(InkProject.currentProject.mainInk);
    }
    // Show Explorer for both a brand-new project and a project restored from
    // recent files. Restoration skips the sample-story branch above, but the
    // writer should still find the project's files immediately.
    const explorer = document.getElementById("file-nav-wrapper");
    if( explorer && explorer.classList.contains("hidden") ) NavView.toggle("#file-nav-wrapper");
});

function gotoIssue(issue) {
    InkProject.currentProject.showInkFile(issue.filename);
    EditorView.gotoLine(issue.lineNumber);
    NavHistory.addStep();
}

NavHistory.setEvents({
    goto: (location) => {
        InkProject.currentProject.showInkFile(location.filePath);
        EditorView.gotoLine(location.position.row+1);
    }
})


// Sound in the preview. The slider in the story menu is the overall volume and starts at the
// game.yaml initial volume (getBaseVolume); Master and Music / SFX are fixed multipliers from the
// same file (getVolume), exactly as in the exported page.
AudioPreview.configure({
    getProjectDir: () => InkProject.currentProject && InkProject.currentProject.mainInk ? InkProject.currentProject.mainInk.projectDir : null,
    getBaseVolume: () => {
        const style = GameStyle.current();
        return style && style.audio ? style.audio.volume / 100 : 0.5;
    },
    getVolume: category => {
        const style = GameStyle.current();
        if( !style || !style.audio ) return 1;
        const categoryVolume = category === "music" ? style.audio.music : style.audio.sfx;
        return style.audio.master / 100 * categoryVolume / 100;
    }
});
AudioPreview.setControlListener(state => GameChrome.setAudioState(state));
GameStyle.setReloadListener(() => AudioPreview.refreshVolume());
// The editor's autocomplete lists the sound files of the project's audio folder.
require("./inkCompleter.js").inkCompleter.getProjectDir = () =>
    InkProject.currentProject && InkProject.currentProject.mainInk ? InkProject.currentProject.mainInk.projectDir : null;

// While the title screen is up, the story's sounds wait for "Start" (see PlayerView.startStory).
// Each held call remembers whether it was on the live turn and which player action it belongs to.
let heldSounds = [];
function playTags(tags, isLiveTurn) {
    AudioPreview.noteTags(tags);
    const actionId = LiveCompiler.getUserActionCount();
    if( PlayerView.isTitleScreenPending() ) heldSounds.push(() => AudioPreview.handleTags(tags, isLiveTurn, actionId));
    else AudioPreview.handleTags(tags, isLiveTurn, actionId);
}

LiveCompiler.setEvents({
    resetting: (sessionId) => {
        
    },
    compileComplete: (sessionId) => {
        StoryAlignment.apply(InkProject.currentProject);
        AudioPreview.beginPlaythrough();
        heldSounds = [];
        PlayerView.prepareForNewPlaythrough(sessionId);
        EditorView.clearErrors();
        ToolbarView.clearIssueSummary();
    },
    selectIssue: gotoIssue,
    textAdded: (text, sourceMap) => {
        PlayerView.addTextSection(text, sourceMap);
    },
    tagsAdded: (tags) => {
        PlayerView.addTags(tags);
        playTags(tags, LiveCompiler.isLiveTurn());
    },
    choiceAdded: (choice, isLatestTurn, isReplayChoice) => {
        AudioPreview.noteTags(choice.choice.tags || []);
        if( isLatestTurn ) {
            PlayerView.addChoice(choice, () => {
                AudioPreview.handleTags(choice.choice.tags || [], true, LiveCompiler.getUserActionCount());
                LiveCompiler.choose(choice)
            });
        } else {
            // During Save/Load replay, remember the option Ink will echo at the next screen.
            if( isReplayChoice ) PlayerView.setSelectedChoiceText(choice.choice.text);
            playTags(choice.choice.tags || [], false);
        }
    },
    errorsAdded: (errors) => {
        for(var i=0; i<errors.length; i++) {
            var error = errors[i];
            if( error.filename == InkProject.currentProject.activeInkFile.relativePath() )
                EditorView.addError(error);

            if( error.type == "RUNTIME ERROR" || error.type == "RUNTIME WARNING" )
                PlayerView.addLineError(error, () => gotoIssue(error));
        }

        ToolbarView.updateIssueSummary(errors);
    },
    playerPrompt: (replaying, doneCallback) => {

        var expressionIdx = 0;
        var tryEvaluateNextExpression = () => {

            // Finished evaluating expressions? End of this turn.
            if( expressionIdx >= ExpressionWatchView.numberOfExpressions() ) {
                if( replaying ) {
                    // The replay walks through the choices the writer already took. Each turn it
                    // rebuilds is replaced by the next one, exactly as a choice does while playing,
                    // so the session view ends up showing only the passage on screen now.
                    PlayerView.clearScene();
                } else {
                    PlayerView.contentReady();
                }
                doneCallback();
                return;
            }

            // Try to evaluate this expression
            var exprText = ExpressionWatchView.getExpression(expressionIdx);
            LiveCompiler.evaluateExpression(exprText, (result, error) => {
                PlayerView.addEvaluationResult(result, error);
                expressionIdx++;
                tryEvaluateNextExpression();
            });
        };

        tryEvaluateNextExpression();
    },
    replayComplete: (sessionId) => {
        AudioPreview.endReplay();
        PlayerView.showSessionView(sessionId);
    },
    storyCompleted: () => {
        PlayerView.addEndingMarker();
        PlayerView.contentReady();
    },
    exitDueToError: () => {
        // Commit a buffered turn even when the runtime stops before a prompt.
        PlayerView.contentReady();
    },
    unexpectedError: (error) => {
        if( error.indexOf("Unhandled Exception") != -1 ) {
            PlayerView.addTerminatingMessage(i18n._("Sorry, the ink compiler crashed ☹"), "error");
            PlayerView.addTerminatingMessage(i18n._("Here is some diagnostic information:"), "error");

            // Make it a bit less verbose and concentrate on the useful stuff
            // [0x000ea] in /Users/blah/blah/blah/blah/ink/ParsedHierarchy/FlowBase.cs:377
            // After replacement:
            // in FlowBase.cs line 377
            error = error.replace(/\[\w+\] in (?:[\w/]+?)(\w+\.cs):(\d+)/g, "in $1 line $2");

            PlayerView.addLongMessage(error, "diagnostic");
        } else {
            PlayerView.addTerminatingMessage(i18n._("Ink compiler had an unexpected error ☹"), "error");
            PlayerView.addLongMessage(error, "error");
        }
        PlayerView.contentReady();
    },
    compilerBusyChanged: (busy) => {
        ToolbarView.setBusySpinnerVisible(busy);
    }
});

ipc.on("project-stats", (event, visible) => {
    LiveCompiler.getStats((statsObj) => {
        
        let messageLines = [];
        messageLines.push(i18n._("Project statistics:"));
        messageLines.push("");
        
        messageLines.push(`${i18n._("Words")}: ${statsObj["words"]}`);
        messageLines.push("");

        messageLines.push(`${i18n._("Knots")}: ${statsObj["knots"]}`);
        messageLines.push(`${i18n._("Stitches")}: ${statsObj["stitches"]}`);
        messageLines.push(`${i18n._("Functions")}: ${statsObj["functions"]}`);
        messageLines.push("");

        messageLines.push(`${i18n._("Choices")}: ${statsObj["choices"]}`);
        messageLines.push(`${i18n._("Gathers")}: ${statsObj["gathers"]}`);
        messageLines.push(`${i18n._("Diverts")}: ${statsObj["diverts"]}`);
        messageLines.push("");

        messageLines.push(i18n._("Notes: Words should be accurate. Knots include functions. Gathers and diverts may include some implicitly added ones by the compiler, for example in weave. Diverts include END and DONE."));

        alert(messageLines.join("\n"));
    });
});

ipc.on("keyboard-shortcuts", (event, visible) => {
    let messageLines = [];
    messageLines.push(i18n._("Useful Keyboard Shortcuts"));
    messageLines.push("");
    messageLines.push(`${i18n._("Find and Replace")}: Ctrl+H ${i18n._("or")} Cmd+H`);
    messageLines.push("");
    messageLines.push(`${i18n._("Find")}: Ctrl+F ${i18n._("or")} Cmd+F`);
    messageLines.push("");
    messageLines.push(`${i18n._("Go to Anything")}: Ctrl+P ${i18n._("or")} Cmd+P`);
    messageLines.push("");
    messageLines.push(`${i18n._("Toggle Comment")}: Ctrl+/ ${i18n._("or")} Cmd+/`);
    messageLines.push("");
    messageLines.push(`${i18n._("Add Multicursor Above")}: Ctrl+Alt+Up ${i18n._("or")} Ctrl+Option+Up`);
    messageLines.push("");
    messageLines.push(`${i18n._("Add Multicursor Below")}: Ctrl+Alt+Down ${i18n._("or")} Ctrl+Option+Down`);
    messageLines.push("");
    messageLines.push(`${i18n._("Temporarily Fold/Unfold Selection")}: Alt+L ${i18n._("or")} Ctrl+Option+Down`);
    messageLines.push("");
    alert(messageLines.join("\n"));
});


EditorView.setEvents({
    "change": () => {
        const active = InkProject.currentProject && InkProject.currentProject.activeInkFile;
        if( active && active.isInkFile ) {
            LiveCompiler.setEdited();
            NavView.setKnots(active);
        }
    },
    "jumpToSymbol": (symbolName, contextPos) => {
        var foundSymbol = InkProject.currentProject.findSymbol(symbolName, contextPos);
        if( foundSymbol ) {
            InkProject.currentProject.showInkFile(foundSymbol.inkFile);
            EditorView.gotoLine(foundSymbol.row+1, foundSymbol.column);
            NavHistory.addStep();
        }
    },
    "jumpToInclude": (includePath) => {
        InkProject.currentProject.showInkFile(includePath);
        NavHistory.addStep();
    },
    "navigate": () => NavHistory.addStep(),
    "changedLine": (pos) =>{
        if (InkProject.currentProject && InkProject.currentProject.activeInkFile){
            NavView.updateCurrentKnot(InkProject.currentProject.activeInkFile, pos);
    }
}
});

PlayerView.setEvents({
    "restartStory": () => restartStory(),
    "storyStarted": () => {
        const held = heldSounds;
        heldSounds = [];
        held.forEach(play => play());
    },
    "jumpToSource": (outputTextOffset, sourceSessionId) => {
        LiveCompiler.getLocationInSource(outputTextOffset, (result) => {
            if( result && result.filename && result.lineNumber ) {
                InkProject.currentProject.showInkFile(result.filename);
                EditorView.gotoLine(result.lineNumber);
            }
        }, sourceSessionId);
    }
});

// ---- Story menu (the same one the exported page shows) ------------------------------
// The Preview rebuilds a saved turn by replaying the choices the writer made, since its
// compiler session cannot be serialized the way the exported page serializes its ink state.
let savedChoiceSequence = null;

function hasSavedProgress() {
    return !!savedChoiceSequence;
}

function restartStory() {
    AudioPreview.stopSoundEffects();
    PlayerView.resetTitleScreen();
    LiveCompiler.rewind();
}

function saveProgress() {
    if( PlayerView.isTitleScreenPending() ) return;
    savedChoiceSequence = LiveCompiler.getChoiceSequence();
    GameChrome.setSaveAvailable(hasSavedProgress);
}

function loadProgress() {
    if( !hasSavedProgress() ) return;
    AudioPreview.stopSoundEffects();
    if( PlayerView.isTitleScreenPending() ) PlayerView.startStoryFromTitle();
    LiveCompiler.loadChoiceSequence(savedChoiceSequence);
}

PlayerView.setImageResolver(resolvePreviewImage);
GameChrome.setup(document.getElementById("player"), {
    onRestart: restartStory,
    onSave: saveProgress,
    onLoad: loadProgress,
    onVolume: percent => AudioPreview.setLevel(percent),
    onToggleMute: () => AudioPreview.toggleMute(),
    onToggleTheme: () => GameStyle.togglePreviewLook()
});
GameChrome.setSaveAvailable(hasSavedProgress);
GameChrome.setAudioState(AudioPreview.getControlState());

ExpressionWatchView.setEvents({
    "change": () => {
        LiveCompiler.setEdited();
        $("#player .scrollContainer").css("top", ExpressionWatchView.totalHeight()+"px");
    }
});

ToolbarView.setEvents({
    toggleSidebar: (id, buttonId) => { NavView.toggle(id, buttonId); },
    navigateBack: () => NavHistory.back(),
    navigateForward: () => NavHistory.forward(),
    selectIssue: gotoIssue,
    stepBack: () => {
        AudioPreview.stopSoundEffects();
        LiveCompiler.stepBack();
    },
    rewind:   () => restartStory(),
    didSetTitle: (title) => {
        if( process.platform == "win32" ) {
            ipc.send("set-native-window-title", title);
        }
    }
});


// Any picture that is much bigger than a screen's worth of pixels still works,
// but the writer should know that the exported game carries all of it.
function describeImageSize(item) {
    return (item.imageBytes / (1024 * 1024)).toFixed(1) + " MB";
}

// Importing files into the project: sound files, Ink scenes, YAML files and pictures.
// paths === null opens the file chooser; folderRel is where Ink scenes go.
async function importIntoProject(paths, folderRel) {
    const project = InkProject.currentProject;
    if( !project || !project.mainInk || !project.mainInk.projectDir ) {
        NavView.showMessage("Save your story first to import files into the project.");
        return;
    }
    const root = path.resolve(project.mainInk.projectDir);

    if( paths === null || paths === undefined ) {
        const extensionsOf = list => list.map(ext => ext.replace(/^\./, ""));
        const picked = await ipc.invoke("showOpenDialog", {
            title: "Import Files",
            properties: ["openFile", "multiSelections"],
            filters: [
                { name: "Audio, Ink, YAML and Images", extensions: extensionsOf(ProjectImport.IMPORT_EXTENSIONS) },
                { name: "Audio", extensions: extensionsOf(ProjectImport.IMPORT_EXTENSIONS.filter(ext => ProjectImport.importKind("x" + ext) === "audio")) },
                { name: "Ink", extensions: ["ink"] },
                { name: "YAML", extensions: ["yaml", "yml"] },
                { name: "Images", extensions: ProjectImport.IMPORT_EXTENSIONS.filter(ext => ProjectImport.importKind("x" + ext) === "image").map(ext => ext.slice(1)) }
            ]
        });
        if( !picked || picked.canceled || !picked.filePaths || picked.filePaths.length === 0 ) return;
        paths = picked.filePaths;
    }

    const plan = ProjectImport.planImport(root, paths, folderRel);

    // Files of other types (or that cannot be imported) are refused.
    if( plan.rejected.length > 0 ) {
        const rejectedLines = plan.rejected.map(item => item.name + ": " + item.reason);
        if( plan.items.length === 0 ) {
            await NavView.showDialog({
                title: "Nothing was imported",
                message: "Only audio, .ink, .yaml and image files can be imported.",
                details: rejectedLines,
                buttons: [{ label: "OK", value: true, primary: true }]
            });
            return;
        }
        const goOn = await NavView.showDialog({
            title: "Some files will not be imported",
            message: "Only audio, .ink, .yaml and image files can be imported.",
            details: rejectedLines,
            buttons: [{ label: "Cancel", value: false }, { label: "Import the rest", value: true, primary: true }]
        });
        if( !goOn ) return;
    }

    // Files that already exist are replaced only if the writer says so.
    let replaceExisting = false;
    const existing = plan.items.filter(item => item.exists);
    if( existing.length > 0 ) {
        const answer = await NavView.showDialog({
            title: "Files already exist",
            message: "These files already exist in the project. Replace them?",
            details: existing.map(item => item.destRel),
            buttons: [
                { label: "Cancel", value: "cancel" },
                { label: "Skip existing", value: "skip" },
                { label: "Replace", value: "replace", primary: true, danger: true }
            ]
        });
        if( answer === "cancel" || !answer ) return;
        replaceExisting = answer === "replace";
    }

    const result = ProjectImport.applyImport(plan, { replaceExisting: replaceExisting });

    // Make the new files show up at once (the file watcher would also notice them).
    const audioRels = result.imported.filter(item => item.kind === "audio").map(item => item.destRel);
    if( audioRels.length ) project.noteAudioFiles(audioRels);
    const imageRels = result.imported.filter(item => item.kind === "image").map(item => item.destRel);
    if( imageRels.length ) project.noteImageFiles(imageRels);
    const largeImages = result.imported.filter(item => item.largeImage);
    if( largeImages.length )
        NavView.showMessage(`Imported, but large (${largeImages.map(item => `${item.destRel}: ${describeImageSize(item)}`).join(", ")}). The exported game carries every byte of them.`);
    result.imported.filter(item => item.kind !== "audio" && item.kind !== "image").forEach(item => project.ensureProjectFile(item.destRel));
    if( result.imported.some(item => item.kind === "yaml") ) GameStyle.reload(project);

    // New scenes only take part in the story once the main story INCLUDEs them.
    const mainRel = project.mainInk.relativePath ? String(project.mainInk.relativePath()).split(path.sep).join("/") : "";
    const newScenes = result.imported.filter(item => item.kind === "ink" && !item.exists
        && item.destRel !== mainRel && (project.mainInk.includes || []).indexOf(item.destRel) === -1);
    if( newScenes.length > 0 ) {
        const addIncludes = await NavView.showDialog({
            title: newScenes.length === 1 ? "Scene imported" : "Scenes imported",
            message: newScenes.length === 1
                ? "Add this scene's INCLUDE to the main story?"
                : "Add these scenes' INCLUDEs to the main story?",
            details: newScenes.map(item => item.destRel),
            buttons: [{ label: "Do not add", value: false }, { label: "Add INCLUDE", value: true, primary: true }]
        });
        if( addIncludes ) newScenes.forEach(item => project.mainInk.addIncludeLine(item.destRel));
    }
    project.refreshIncludes();
    NavView.refreshFolders(project.mainInk.projectDir);
    NavView.setFiles(project.mainInk, project.files, project.mainInk.projectDir);

    if( result.failed.length > 0 ) {
        await NavView.showDialog({
            title: "Could not import all files",
            message: "These files could not be copied:",
            details: result.failed.map(item => item.item.name + ": " + item.error),
            buttons: [{ label: "OK", value: true, primary: true }]
        });
    }
}

NavView.setEvents({
    importFiles: (paths, folderRel) => importIntoProject(paths, folderRel),
    // Click a sound file in the Explorer to listen to it; click again to stop.
    toggleAudioPreview: (relativePath, onChange) => {
        const project = InkProject.currentProject;
        if( !project || !project.mainInk || !project.mainInk.projectDir ) return;
        const root = path.resolve(project.mainInk.projectDir);
        const absolute = path.resolve(root, String(relativePath || "").split("/").join(path.sep));
        if( !GameStyle.pathStaysInsideRoot(root, absolute) ) return;
        AudioPreview.togglePreviewFile(absolute, onChange);
    },
    openImageFile: relativePath => {
        const project = InkProject.currentProject;
        if( !project || !project.mainInk || !project.mainInk.projectDir ) return;
        const root = path.resolve(project.mainInk.projectDir);
        const absolute = path.resolve(root, String(relativePath || "").split("/").join(path.sep));
        if( !isImageFileName(absolute) ||
            !GameStyle.pathStaysInsideRoot(root, absolute) ) {
            NavView.showMessage("This image cannot be opened from outside the story folder.");
            return;
        }
        project.openImageFile(absolute);
    },
    clickFileId: (fileId) => {
        var file = InkProject.currentProject.inkFileWithId(fileId);
        InkProject.currentProject.showInkFile(file);
        NavHistory.addStep();
    },
    createFolder: (folderName) => {
        const project = InkProject.currentProject;
        if( !project || !project.mainInk || !project.mainInk.projectDir ) {
            NavView.showMessage("Save your story first, so folders can be created next to it.");
            return false;
        }
        const root = path.resolve(project.mainInk.projectDir);
        const target = resolveContainedProjectPath(root, folderName);
        if( !target || target === root ) {
            NavView.showMessage("Choose a folder inside the story folder, not through a symlink outside it.");
            return false;
        }
        const relative = path.relative(root, target);
        try {
            if( fs.existsSync(target) ) { NavView.showMessage("That folder already exists."); return false; }
            fs.mkdirSync(target, { recursive: true });
            NavView.refreshFolders(project.mainInk.projectDir);
            NavView.selectFolder(relative.split(path.sep).join("/"));
            return true;
        } catch(err) { NavView.showMessage("Could not create folder: " + err.message); return false; }
    },
    createScene: (sceneName, addToMainInk) => {
        const project = InkProject.currentProject;
        if( !project || !project.mainInk || !project.mainInk.projectDir ) {
            NavView.showMessage("Save your story first, so scenes can be created next to it.");
            return false;
        }
        // Only the last path segment counts, so folders like "capitulo.1" are fine.
        const lastSegment = String(sceneName).split(/[\\/]/).pop();
        const sceneExt = path.extname(lastSegment).toLowerCase();
        if( (sceneExt !== "" && sceneExt !== ".ink") || /\.ya?ml\.ink$/i.test(lastSegment) ) {
            NavView.showMessage("Scenes are .ink files. game.yaml is created by the Visual tab.");
            return false;
        }
        if( sceneExt !== ".ink" ) sceneName += ".ink";
        const root = path.resolve(project.mainInk.projectDir);
        const target = resolveContainedProjectPath(root, sceneName);
        if( !target || target === root ) {
            NavView.showMessage("Scene path must stay inside the story folder, not through a symlink outside it.");
            return false;
        }
        const relative = path.relative(root, target);
        try {
            if( fs.existsSync(target) ) { NavView.showMessage("That scene file already exists."); return false; }
            fs.mkdirSync(path.dirname(target), { recursive: true });
            const heading = path.basename(sceneName, ".ink").replace(/[-_]+/g, " ");
            fs.writeFileSync(target, `=== ${heading || "New Scene"} ===\n\n-> END\n`, "utf8");
            NavView.refreshFolders(project.mainInk.projectDir);
            const rel = path.relative(root, target).split(path.sep).join("/");
            const newFile = project.ensureProjectFile(rel);
            if( addToMainInk ) project.mainInk.addIncludeLine(rel);
            project.refreshIncludes();
            if( newFile ) project.showInkFile(newFile);
            NavView.setFiles(project.mainInk, project.files, project.mainInk.projectDir);
            NavHistory.addStep();
            return true;
        } catch(err) { NavView.showMessage("Could not create scene: " + err.message); return false; }
    },
    // options.moveToFolder moves the item (any file or folder) into that project folder instead.
    renameItem: (type, relativePath, newName, options) => {
        const project = InkProject.currentProject;
        if( !project || !project.mainInk || !project.mainInk.projectDir )
            return { ok: false, error: options && options.moveToFolder !== undefined ? "Save the main story before moving project items." : "Save the main story before renaming project items." };

        const root = path.resolve(project.mainInk.projectDir);
        const sourceAbs = path.resolve(root, String(relativePath || "").replace(/\\/g, "/"));
        const frame = document.getElementById("game-settings-inline");
        const formWasVisible = !!(frame && !frame.hidden && frame.dataset.yamlPath);
        const oldFormPath = formWasVisible ? path.resolve(frame.dataset.yamlPath) : null;
        const affectedForm = !!(oldFormPath && (oldFormPath === sourceAbs ||
            (type === "folder" && oldFormPath.startsWith(sourceAbs + path.sep))));

        const runRename = () => {
            const result = project.renameProjectItem(type, relativePath, newName, options);
            if( !result || !result.ok || result.unchanged ) return result;

            if( result.renamedMain && project.mainInk.absolutePath() ) ipc.send("main-file-saved", project.mainInk.absolutePath());
            // The preview compiles a temporary copy of the project by file name; rebuild it.
            LiveCompiler.projectFilesChanged();
            ToolbarView.setTitle(project.activeInkFile.filename());
            NavView.setMainInkFilename(project.mainInk.filename());
            NavView.refreshFolders(root);
            NavView.setFiles(project.mainInk, project.files, project.mainInk.projectDir);
            if( result.type === "folder" ) NavView.selectFolder(result.newRelativePath);
            else NavView.highlightRelativePath(result.newRelativePath);
            GameStyle.reload(project);
            StoryAlignment.apply(project);

            // If a rename touched the YAML currently displayed as a form, reopen
            // that form against its new path after the pre-rename save has flushed.
            if( affectedForm && formWasVisible ) {
                const newFormPath = type === "file"
                    ? result.newAbsolutePath
                    : path.join(result.newAbsolutePath, path.relative(sourceAbs, oldFormPath));
                showInlineStyleForm(newFormPath);
            }
            return result;
        };

        if( affectedForm && frame && frame.contentWindow ) {
            const requestId = ++nextFormFlushRequestId;
            return new Promise(resolve => {
                const pending = {
                    requestId: requestId,
                    run: () => {
                        try { resolve(runRename()); }
                        catch(error) { resolve({ ok: false, error: error.message || String(error) }); }
                    },
                    resolve: resolve
                };
                pendingExplorerRenameFlush = pending;
                frame.contentWindow.postMessage({ type: "game-settings-flush", requestId: requestId, suppressReload: true }, "*");
                setTimeout(() => {
                    if( pendingExplorerRenameFlush === pending ) {
                        pendingExplorerRenameFlush = null;
                        resolve({ ok: false, error: "The Game settings form did not finish saving. Try again." });
                    }
                }, 2000);
            });
        }
        try { return runRename(); }
        catch(error) { return { ok: false, error: error.message || String(error) }; }
    },
    deleteItem: (type, relativePath) => {
        const project = InkProject.currentProject;
        if( !project || !project.mainInk || !project.mainInk.projectDir )
            return { ok: false, error: "Save the main story before deleting project items." };

        const root = path.resolve(project.mainInk.projectDir);
        const sourceAbs = path.resolve(root, String(relativePath || "").replace(/\\/g, "/"));
        const frame = document.getElementById("game-settings-inline");
        const formWasVisible = !!(frame && !frame.hidden && frame.dataset.yamlPath);
        const oldFormPath = formWasVisible ? path.resolve(frame.dataset.yamlPath) : null;
        const affectedForm = !!(oldFormPath && (oldFormPath === sourceAbs ||
            (type === "folder" && oldFormPath.startsWith(sourceAbs + path.sep))));

        const runDelete = () => {
            const result = project.deleteProjectItem(type, relativePath);
            if( !result || !result.ok ) return result;
            if( affectedForm && formWasVisible ) hideInlineStyleForm(false, true);
            GameStyle.reload(project);
            StoryAlignment.apply(project);
            return result;
        };

        if( affectedForm && frame && frame.contentWindow ) {
            const requestId = ++nextFormFlushRequestId;
            return new Promise(resolve => {
                const pending = {
                    requestId: requestId,
                    run: () => {
                        try { resolve(runDelete()); }
                        catch(error) { resolve({ ok: false, error: error.message || String(error) }); }
                    },
                    resolve: resolve
                };
                pendingExplorerRenameFlush = pending;
                frame.contentWindow.postMessage({ type: "game-settings-flush", requestId: requestId, suppressReload: true }, "*");
                setTimeout(() => {
                    if( pendingExplorerRenameFlush === pending ) {
                        pendingExplorerRenameFlush = null;
                        resolve({ ok: false, error: "The Game settings form did not finish saving. Try again." });
                    }
                }, 2000);
            });
        }
        try { return runDelete(); }
        catch(error) { return { ok: false, error: error.message || String(error) }; }
    },
    jumpToRow: (row) => {
        EditorView.gotoLine(row+1);
    }
});

GotoAnything.setEvents({
    gotoFile: (file, row) => {
        InkProject.currentProject.showInkFile(file);
        if( typeof row !== 'undefined' )
            EditorView.gotoLine(row+1);
        NavHistory.addStep();
    },
    lookupRuntimePath: (path, resultHandler) => {
        LiveCompiler.getRuntimePathInSource(path, resultHandler);
    }
});

ipc.on("set-tags-visible", (event, visible) => {
    if( visible )
        $("#main").removeClass("hideTags");
    else
        $("#main").addClass("hideTags");
});

// Story text alignment uses the # align: tag. Choice alignment lives in game.yaml.
ipc.on("set-text-alignment", (event, alignment) => {
    StoryAlignment.setTextAlignment(InkProject.currentProject, alignment);
});

// Another project window may have changed the shared Story menu
window.addEventListener("focus", () => StoryAlignment.apply(InkProject.currentProject));

// Inline Game settings and the raw YAML editor share one document/session.
// The iframe is only the form view; the underlying YAML remains a normal project file.
let pendingFormHide = null;
let pendingFormFlushAcknowledged = false;
let pendingStyleReloadCount = 0;
let nextFormFlushRequestId = 0;
let pendingHideUntilFormLoad = null;
let pendingExplorerRenameFlush = null;
let activeStyleYamlPath = null;
let activeStyleModeKey = null;
let nextStyleProjectIdentity = 0;
const styleModeByPath = new Map();

function styleProjectIdentity(project) {
    if( !project ) return "no-project";
    if( !project.__inkyStyleIdentity ) project.__inkyStyleIdentity = ++nextStyleProjectIdentity;
    return String(project.__inkyStyleIdentity);
}

function styleModeKey(yamlPath, project = InkProject.currentProject) {
    // Every unsaved project has the same virtual path. Include the project
    // identity so New Story cannot reuse another project's iframe/model/state.
    return yamlPath === VIRTUAL_GAME_STYLE_PATH
        ? VIRTUAL_GAME_STYLE_PATH + "#project-" + styleProjectIdentity(project)
        : yamlPath;
}

function rememberStyleMode(mode) {
    if( activeStyleModeKey ) styleModeByPath.set(activeStyleModeKey, mode);
}

function updateStyleModeTabs(mode, visible, disabled) {
    const bar = document.getElementById("style-mode-bar");
    const textTab = document.getElementById("style-mode-text");
    const formTab = document.getElementById("style-mode-form");
    if( bar ) bar.hidden = !visible;
    [[textTab, "text"], [formTab, "form"]].forEach(([tab, name]) => {
        if( !tab ) return;
        const active = mode === name;
        tab.hidden = !visible;
        tab.disabled = !!disabled;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
        tab.tabIndex = active ? 0 : -1;
    });
}

function showInlineStyleForm(yamlPath, requestedMode) {
    const frame = document.getElementById("game-settings-inline");
    const formTab = document.getElementById("style-mode-form");
    const editor = document.getElementById("editor");
    const main = document.getElementById("main");
    const project = InkProject.currentProject;
    if( !frame || !formTab || !editor || !yamlPath ) return;
    const virtualMode = yamlPath === VIRTUAL_GAME_STYLE_PATH;
    const virtualDocument = virtualMode && project && project.fileWithRelativePath(GameStyle.FILE_NAME);
    const validVirtualDocument = !!(virtualMode && project && project.mainInk && !project.mainInk.projectDir && virtualDocument && virtualDocument.isYamlFile);
    const validDiskPath = !!(project && project.mainInk && project.mainInk.projectDir && !virtualMode &&
        GameStyle.pathStaysInsideRoot(project.mainInk.projectDir, yamlPath));
    if( !validVirtualDocument && !validDiskPath ) {
        alert("The style file must stay inside the story folder.");
        return;
    }

    const modeKey = styleModeKey(yamlPath, project);
    const previousMode = styleModeByPath.get(modeKey) || "form";
    activeStyleYamlPath = yamlPath;
    activeStyleModeKey = modeKey;
    if( requestedMode ) styleModeByPath.set(modeKey, requestedMode);
    const desiredMode = requestedMode || styleModeByPath.get(modeKey) || "form";
    styleModeByPath.set(modeKey, desiredMode);

    // Restore the raw YAML editor immediately when this document was last
    // viewed in Advanced mode. Keep the form iframe loaded in the background.
    if( desiredMode === "text" ) {
        frame.hidden = true;
        editor.style.visibility = "visible";
        if( main ) {
            main.classList.add("style-mode-visible");
            main.classList.remove("style-form-visible");
        }
        updateStyleModeTabs("text", true, false);
        setImmediate(() => {
            try {
                if( typeof EditorView.resize === "function" ) EditorView.resize();
                else if( window.ace && typeof window.ace.edit === "function" ) window.ace.edit(editor).resize();
            } catch(e) {}
        });
        return;
    }

    // If this YAML form already exists and has loaded, reveal that same iframe
    // instead of assigning frame.src again. This preserves its controls/scroll
    // state and prevents the blink when switching back from .ink.
    const sameLoadedDocument = frame.dataset.yamlPath === yamlPath &&
        frame.dataset.styleModeKey === modeKey && frame.dataset.formReadyFor === yamlPath &&
        frame.dataset.virtualMode === (virtualMode ? "1" : "0");
    if( sameLoadedDocument ) {
        if( previousMode === "text" ) {
            const yaml = currentStyleYaml(project, yamlPath);
            if( yaml !== null && frame.contentWindow )
                frame.contentWindow.postMessage({ type: "game-settings-reload", yaml: yaml }, "*");
        }
        pendingFormHide = null;
        pendingFormFlushAcknowledged = false;
        pendingHideUntilFormLoad = null;
        frame.hidden = false;
        editor.style.visibility = "hidden";
        if( main ) main.classList.add("style-mode-visible", "style-form-visible");
        updateStyleModeTabs("form", true, false);
        return;
    }

    // A rapid switch to a different style supersedes any pending hide request.
    pendingFormHide = null;
    pendingFormFlushAcknowledged = false;
    pendingHideUntilFormLoad = null;
    const formPath = path.join(__dirname, "gameSettings", "gameSettings.html");
    const queryPath = virtualMode ? GameStyle.FILE_NAME : yamlPath;
    const formUrl = pathToFileURL(formPath).toString()
        + "?path=" + encodeURIComponent(queryPath)
        + "&parent=inline&virtual=" + (virtualMode ? "1" : "0")
        + "&session=" + encodeURIComponent(modeKey)
        + (virtualMode ? "&yaml=" + encodeURIComponent(virtualDocument.getValue()) : "");
    const samePendingDocument = frame.dataset.requestedSrc === formUrl &&
        frame.dataset.yamlPath === yamlPath && frame.dataset.styleModeKey === modeKey &&
        frame.dataset.formReadyFor !== yamlPath;
    frame.dataset.yamlPath = yamlPath;
    frame.dataset.styleModeKey = modeKey;
    frame.dataset.virtualMode = virtualMode ? "1" : "0";
    frame.dataset.formPath = queryPath;
    frame.dataset.requestedSrc = formUrl;
    if( !samePendingDocument ) frame.dataset.formReadyFor = "";
    frame.hidden = true; // Keep the old editor visible until the new form is ready.
    editor.style.visibility = "visible";
    if( main ) {
        main.classList.add("style-mode-visible");
        main.classList.remove("style-form-visible");
    }
    updateStyleModeTabs("form", true, true);
    // Don't restart a navigation that's already loading. Clicking back and
    // forth during the initial load must not trap the iframe in a reload loop.
    if( !samePendingDocument ) frame.src = formUrl;
}

function currentStyleYaml(project, yamlPath) {
    if( !project || !project.mainInk ) return null;
    const relative = project.mainInk.projectDir
        ? path.relative(project.mainInk.projectDir, yamlPath).split(path.sep).join("/")
        : GameStyle.FILE_NAME;
    const file = project.fileWithRelativePath(relative);
    return file && file.isYamlFile ? file.getValue() : null;
}

// A postMessage sent before the iframe's script runs is lost. Do not allow
// Form/Text switching (including file-navigation-triggered hides) until this
// exact YAML form has finished loading.
const styleFormFrame = document.getElementById("game-settings-inline");
if( styleFormFrame ) {
    styleFormFrame.addEventListener("load", () => {
        const frame = styleFormFrame;
        const formTab = document.getElementById("style-mode-form");
        const loadedUrl = frame.contentWindow && frame.contentWindow.location && frame.contentWindow.location.href;
        if( !frame.dataset.requestedSrc || !loadedUrl ) return;
        // Compare the decoded YAML path, not the serialized URL string: Chromium
        // may normalize file:// URLs and percent-encoding without changing the
        // document that actually loaded. Ignore about:blank and stale loads.
        let loadedPath = null;
        let loadedVirtual = "0";
        let loadedSession = null;
        try {
            const loadedParams = new URL(loadedUrl).searchParams;
            loadedPath = loadedParams.get("path");
            loadedVirtual = loadedParams.get("virtual") || "0";
            loadedSession = loadedParams.get("session");
        } catch(e) { return; }
        if( loadedPath !== frame.dataset.formPath || loadedVirtual !== (frame.dataset.virtualMode || "0") ||
            loadedSession !== frame.dataset.styleModeKey ) return;
        frame.dataset.formReadyFor = frame.dataset.yamlPath || "";
        syncStyleFormIdeTheme();
        try {
            frame.contentWindow.scrollTo(0, 0);
            const formDocument = frame.contentDocument;
            if( formDocument && formDocument.getElementById("settings-scroll") ) {
                formDocument.getElementById("settings-scroll").scrollTop = 0;
                // Force a layout pass after the iframe becomes visible; Electron can
                // otherwise retain a zero-height flex viewport when switching panes.
                void formDocument.documentElement.offsetHeight;
            }
        } catch(e) { /* Layout fix is best effort; the form still remains usable. */ }
        // Complete the load off-screen unless this exact YAML document is still
        // active and the writer selected Visual. This avoids a flash of a stale
        // form when the writer has already navigated back to an .ink file.
        const shouldReveal = activeStyleYamlPath === frame.dataset.yamlPath &&
            activeStyleModeKey === frame.dataset.styleModeKey &&
            (styleModeByPath.get(frame.dataset.styleModeKey) || "form") === "form";
        if( shouldReveal ) {
            frame.hidden = false;
            const editor = document.getElementById("editor");
            if( editor ) editor.style.visibility = "hidden";
            const main = document.getElementById("main");
            if( main ) main.classList.add("style-mode-visible", "style-form-visible");
            updateStyleModeTabs("form", true, false);
        } else {
            frame.hidden = true;
        }
        if( pendingHideUntilFormLoad !== null ) {
            const keepToggle = pendingHideUntilFormLoad;
            pendingHideUntilFormLoad = null;
            hideInlineStyleForm(keepToggle);
        }
    });
}

function applyHideInlineStyleForm(keepToggle) {
    const frame = document.getElementById("game-settings-inline");
    const bar = document.getElementById("style-mode-bar");
    const editor = document.getElementById("editor");
    const main = document.getElementById("main");
    if( frame ) frame.hidden = true;
    if( editor ) editor.style.visibility = "visible";
    if( main ) {
        main.classList.toggle("style-mode-visible", !!keepToggle);
        main.classList.remove("style-form-visible");
    }
    updateStyleModeTabs("text", !!keepToggle, false);
    // Ace caches its viewport dimensions; the mode bar changes the editor's
    // height even though the BrowserWindow itself has not been resized. Some
    // Inky base builds do not expose EditorView.resize(), so use the active
    // Ace instance as a compatible fallback instead of throwing on startup.
    setImmediate(() => {
        try {
            if( typeof EditorView.resize === "function" ) {
                EditorView.resize();
                return;
            }
            const editorElement = document.getElementById("editor");
            if( editorElement && window.ace && typeof window.ace.edit === "function" ) {
                const aceEditor = window.ace.edit(editorElement);
                if( aceEditor && typeof aceEditor.resize === "function" ) aceEditor.resize();
            }
        } catch(error) {
            console.warn("Could not resize the editor after switching style tabs", error);
        }
    });
}

function hideInlineStyleForm(keepToggle, immediateForNavigation = false) {
    const frame = document.getElementById("game-settings-inline");
    if( frame && !frame.hidden && frame.contentWindow ) {
        if( frame.dataset.formReadyFor !== frame.dataset.yamlPath ) {
            if( immediateForNavigation ) {
                pendingHideUntilFormLoad = null;
                pendingFormHide = null;
                pendingFormFlushAcknowledged = false;
                applyHideInlineStyleForm(keepToggle);
                return;
            }
            // Queue rather than posting to a not-yet-initialized form document.
            pendingHideUntilFormLoad = !!keepToggle;
            updateStyleModeTabs("form", true, true);
            return;
        }
        pendingHideUntilFormLoad = null;
        const requestId = ++nextFormFlushRequestId;
        if( immediateForNavigation ) {
            // Saving form values is synchronous inside the iframe. We don't wait
            // for the preview reload before displaying the newly selected .ink.
            frame.contentWindow.postMessage({ type: "game-settings-flush", requestId: requestId }, "*");
            pendingFormHide = null;
            pendingFormFlushAcknowledged = false;
            applyHideInlineStyleForm(keepToggle);
            return;
        }
        pendingFormHide = { requestId: requestId, hide: () => applyHideInlineStyleForm(keepToggle) };
        pendingFormFlushAcknowledged = false;
        // Keep unsaved form values and wait for any corresponding Ace reload
        // callbacks before revealing source text.
        frame.contentWindow.postMessage({ type: "game-settings-flush", requestId: requestId }, "*");
        return;
    }
    pendingHideUntilFormLoad = null;
    pendingFormHide = null;
    pendingFormFlushAcknowledged = false;
    applyHideInlineStyleForm(keepToggle);
}

function openStyleFormForCurrentFile() {
    const project = InkProject.currentProject;
    if( !project || !project.mainInk ) return;
    if( !project.mainInk.projectDir ) {
        const virtualFile = project.fileWithRelativePath(GameStyle.FILE_NAME);
        if( virtualFile && virtualFile.isYamlFile ) showInlineStyleForm(VIRTUAL_GAME_STYLE_PATH, "form");
        else alert("Save your story first, so a game.yaml can be created in the story folder.");
        return;
    }
    const yamlPath = GameStyle.entryFilePathFor(project);
    if( !yamlPath || !GameStyle.pathStaysInsideRoot(project.mainInk.projectDir, yamlPath) ) {
        alert("The game.yaml file must stay inside the story folder.");
        return;
    }
    if( !fs.existsSync(yamlPath) ) {
        try { fs.writeFileSync(yamlPath, GameStyle.templateYaml(), "utf8"); }
        catch(e) { alert("Could not create game.yaml: " + e.message); return; }
    }
    const relative = path.relative(project.mainInk.projectDir, path.resolve(yamlPath)).split(path.sep).join("/");
    const styleDoc = project.openYamlFile(relative);
    if( !styleDoc ) { alert("Could not open game.yaml."); return; }
    const openForm = () => showInlineStyleForm(yamlPath, "form");
    if( styleDoc.hasUnsavedChanges ) styleDoc.save(success => {
        if( success ) openForm();
        else alert("Could not save game.yaml before opening the form.");
    });
    else openForm();
}

// Keep the live Ace document in sync with writes from the settings form iframe.
function completePendingFormHideIfReady() {
    if( pendingFormHide && pendingFormFlushAcknowledged && pendingStyleReloadCount === 0 ) {
        const request = pendingFormHide;
        pendingFormHide = null;
        pendingFormFlushAcknowledged = false;
        request.hide();
    }
}

window.addEventListener("message", event => {
    const data = event.data;
    if( !data || typeof data.type !== "string" ) return;
    if( data.type === "game-settings-flushed" ) {
        if( pendingExplorerRenameFlush && data.requestId === pendingExplorerRenameFlush.requestId ) {
            const pending = pendingExplorerRenameFlush;
            pendingExplorerRenameFlush = null;
            // Reopening the same iframe from inside a message posted by that
            // iframe can freeze Electron's renderer. Defer the rename (and any
            // iframe navigation it causes) until this message event has ended.
            setImmediate(() => {
                try { pending.run(); }
                catch(error) { pending.resolve({ ok: false, error: error.message || String(error) }); }
            });
            return;
        }
        if( !pendingFormHide || data.requestId !== pendingFormHide.requestId ) return;
        pendingFormFlushAcknowledged = true;
        completePendingFormHideIfReady();
        return;
    }
    if( data.type === "game-settings-preview-theme" && ["light", "dark"].includes(data.theme) ) {
        if( event.source === styleFormFrame.contentWindow ) GameStyle.setPreviewTheme(data.theme);
        return;
    }
    if( data.type === "game-style-virtual-update" && typeof data.yaml === "string" ) {
        const project = InkProject.currentProject;
        const file = project && project.fileWithRelativePath(GameStyle.FILE_NAME);
        if( file && file.isYamlFile && file.getValue() !== data.yaml ) file.setValue(data.yaml);
        if( ["light", "dark"].includes(data.previewTheme) ) GameStyle.setPreviewTheme(data.previewTheme);
        return;
    }
    if( data.type !== "game-style-reload" || typeof data.path !== "string" ) return;
    const project = InkProject.currentProject;
    if( !project || !project.mainInk.projectDir ) return;
    const target = path.resolve(data.path);
    const relative = path.relative(project.mainInk.projectDir, target).split(path.sep).join("/");
    if( relative === ".." || relative.startsWith("../") || path.isAbsolute(relative) ) return;
    let file = project.fileWithRelativePath(relative);
    const reloadStyleAndFinish = countedReload => {
        GameStyle.reload(project);
        if( ["light", "dark"].includes(data.previewTheme) ) GameStyle.setPreviewTheme(data.previewTheme);
        StoryAlignment.apply(project);
        if( countedReload && pendingStyleReloadCount > 0 ) pendingStyleReloadCount--;
        completePendingFormHideIfReady();
    };
    if( file && file.isYamlFile ) {
        pendingStyleReloadCount++;
        file.tryLoadFromDisk(err => {
            if( err ) console.warn("Could not reload style document", err);
        }, true, () => reloadStyleAndFinish(true));
    } else {
        project.ensureProjectFile(relative);
        reloadStyleAndFinish(false);
    }
});

// Separate YAML/Form tabs for the same game.yaml document.
document.addEventListener("DOMContentLoaded", () => {
    const textTab = document.getElementById("style-mode-text");
    const formTab = document.getElementById("style-mode-form");
    if( !textTab || !formTab ) return;
    textTab.addEventListener("click", () => {
        const frame = document.getElementById("game-settings-inline");
        rememberStyleMode("text");
        if( frame && !frame.hidden ) {
            const project = InkProject.currentProject;
            let yamlText = null;
            try {
                // The form's save is synchronous. Flush it before swapping views,
                // then mirror the same bytes into the existing Ace document. This
                // avoids relying on an iframe postMessage/reload race for Advanced.
                if( frame.contentWindow && typeof frame.contentWindow.flushSettingsForAdvanced === "function" )
                    yamlText = frame.contentWindow.flushSettingsForAdvanced();
            } catch(error) {
                console.warn("Could not flush game.yaml before opening Advanced", error);
            }
            if( typeof yamlText === "string" && project && project.mainInk ) {
                const virtualMode = frame.dataset.virtualMode === "1";
                const relative = virtualMode
                    ? GameStyle.FILE_NAME
                    : path.relative(project.mainInk.projectDir, path.resolve(frame.dataset.yamlPath)).split(path.sep).join("/");
                const styleDoc = project.fileWithRelativePath(relative);
                if( styleDoc && styleDoc.isYamlFile && styleDoc.getValue() !== yamlText ) {
                    styleDoc.justLoadedContent = true;
                    try { styleDoc.aceDocument.setValue(yamlText); }
                    finally { styleDoc.justLoadedContent = false; }
                    // The same contents were synchronously persisted by the form
                    // when this is a saved project; virtual projects remain in-memory.
                    styleDoc.hasUnsavedChanges = virtualMode ? true : false;
                    styleDoc.compilerVersionDirty = false;
                    NavView.setFiles(project.mainInk, project.files, project.mainInk.projectDir);
                }
                GameStyle.reload(project);
                StoryAlignment.apply(project);
            }
            pendingFormHide = null;
            pendingFormFlushAcknowledged = false;
            pendingHideUntilFormLoad = null;
            applyHideInlineStyleForm(true);
        } else {
            updateStyleModeTabs("text", true, false);
        }
    });
    formTab.addEventListener("click", () => {
        const frame = document.getElementById("game-settings-inline");
        if( frame && !frame.hidden ) return;
        openStyleFormForCurrentFile();
    });
});

// The settings form also works as a separate window; this is the fallback path
// for that older entry point.
ipc.on("game-style-reload", () => {
    const project = InkProject.currentProject;
    if( project ) {
        const active = project.activeInkFile;
        if( active && active.isYamlFile && !active.hasUnsavedChanges ) active.tryLoadFromDisk(() => {}, true);
        GameStyle.reload(project);
        StoryAlignment.apply(project);
    }
});

ipc.on("set-animation-enabled", (event, animationEnabled) => {
    PlayerView.setAnimationEnabled(animationEnabled)
});
ipc.on("set-autocomplete-disabled", (event, autoCompleteDisabled) => {
    EditorView.setAutoCompleteDisabled(autoCompleteDisabled)
});



// The settings document is editor UI, not the story's game.yaml palette.
// Apply its IDE-only class both on load and when the menu theme changes.
function syncStyleFormIdeTheme() {
    const frame = document.getElementById("game-settings-inline");
    const formDocument = frame && frame.contentDocument;
    if( formDocument ) formDocument.documentElement.classList.toggle(
        "inky-graphite", document.documentElement.classList.contains("dark"));
    if( formDocument ) formDocument.documentElement.classList.toggle(
        "inky-high-clarity", document.documentElement.classList.contains("contrast"));
    if( formDocument ) formDocument.documentElement.classList.toggle(
        "inky-quiet-writing", document.documentElement.classList.contains("focus"));
}

function updateTheme(event, newTheme) {
    // Only the IDE theme changes: the reader remains controlled by game.yaml.
    const theme = ["dark", "contrast", "focus"].includes(String(newTheme || "").toLowerCase())
        ? String(newTheme).toLowerCase() : "light";
    $(".window").removeClass("dark contrast focus");
    if( theme !== "light" ) $(".window").addClass(theme);

    // Each dark IDE palette uses a bundled native Ace theme.
    const editorThemes = {
        dark: "ace/theme/tomorrow_night",
        contrast: "ace/theme/tomorrow_night_bright",
        focus: "ace/theme/twilight"
    };
    EditorView.setEditorTheme(editorThemes[theme] || "ace/theme/textmate");

    // Ace autocomplete and jsTree context menus live outside .window. Also
    // enables the already-existing html.dark styling on the Visual/Advanced tabs.
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("contrast", theme === "contrast");
    document.documentElement.classList.toggle("focus", theme === "focus");
    syncStyleFormIdeTheme();
}

updateTheme(null, window.localStorage.getItem("theme"));
ipc.on("change-theme", (event, newTheme) => {
		updateTheme(event, newTheme);
    window.localStorage.setItem("theme", newTheme);
});



ipc.on("zoom", (event, amount) => {

    // Search manually for element by ID
    // (jQuery wrapping mutates attributes!)
    let editorEl = document.getElementById("editor");
    let playerEl = document.getElementById("player");

    let currentSize = editorEl.style.fontSize;
    
    // The story's font size comes from game.yaml. The IDE zoom scales it
    // (via --player-zoom, see main.css) instead of replacing it.
    playerEl.style.fontSize = "";

    if(amount > 2) {
        editorEl.style.fontSize = 12 * amount / 100 + "px";
        playerEl.style.setProperty("--player-zoom", String(amount / 100));
    } else {

        if(currentSize == "") {

            if(amount > 0) {
                currentSize = "14";
            } else {
                currentSize = "10";
            }

        } else {

            currentSize = currentSize.substring(0, currentSize.length - 2);
            currentSize = parseInt(currentSize);
            currentSize += amount;
        }
        
        editorEl.style.fontSize = currentSize + "px";
        playerEl.style.setProperty("--player-zoom", String(currentSize / 14));
    }

});

ipc.on("insertSnippet", (event, snippetContent) => {
    EditorView.insert(snippetContent);
});
