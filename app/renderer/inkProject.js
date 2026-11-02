const {ipcRenderer} = require("electron");
const path = require("path");
const fs = require("fs");
const _ = require("lodash");
const chokidar = require('chokidar');
const { isAudioFileName } = require("./audioTags.js");
const { isImageFileName, imageLabelList } = require("./imageTypes.js");
const mkdirp = require('mkdirp');
const i18n = require('./i18n.js');
const { InkMode } = require('./ace-ink-mode/ace-ink.js');
const { PlayerView } = require('./playerView.js');
const { GameStyle } = require('./gameStyle.js');
const { buildWebExport } = require("./webExporter.js");
const { withPreservedExtension } = require("./projectFileName.js");

const EditorView = require("./editorView.js").EditorView;
const ImageViewer = require("./imageViewer.js").ImageViewer;
const NavView = require("./navView.js").NavView;

const InkFile = require("./inkFile.js").InkFile;
const LiveCompiler = require("./liveCompiler.js").LiveCompiler;

// -----------------------------------------------------------------
// InkProject
// -----------------------------------------------------------------

InkProject.events = {};
InkProject.currentProject = null;

// mainInkFilePath is optional, if creating a brand new untitled project
// Can also be absolute, if loading a project.
function InkProject(mainInkFilePath) {
    this.files = [];
    this.hasUnsavedChanges = false;
    this.unsavedFiles = [];
    this.saveCompletionCallbacks = [];

    // Default ink mode for syntax highlighting. This may be replace if
    // the user has a project settings file that customises the instructionPrefix
    this.inkMode = new InkMode("");

    this.mainInk = null;
    const isBrandNewProject = mainInkFilePath === undefined;
    this.mainInk = this.createInkFile(mainInkFilePath || null, isBrandNew = isBrandNewProject);

    // Untitled projects keep visual settings in memory until the first save.
    // Existing projects load game.yaml when present and otherwise use defaults
    // without writing to the project folder during startup.
    if( isBrandNewProject ) {
        const styleFile = this.createInkFile(GameStyle.FILE_NAME, true);
        // The starter story (see InkFile) ships with its own title and author.
        styleFile.setValue(GameStyle.templateYaml() + [
            "titles:",
            '  story: "Glass Tide"',
            '  author: "Helena Marques"',
            ""
        ].join("\n"));
    } else if( this.mainInk.projectDir ) {
        const stylePath = GameStyle.entryFilePathFor(this);
        try {
            if( stylePath && GameStyle.pathStaysInsideRoot(this.mainInk.projectDir, stylePath) ) {
                if( fs.existsSync(stylePath) && fs.statSync(stylePath).isFile() ) {
                    this.createInkFile(stylePath, false, err => {
                        console.warn("Could not load game.yaml", err);
                    });
                } else if( fs.existsSync(stylePath) ) {
                    console.warn("The project's game.yaml path exists but is not a regular file.");
                }
            } else if( stylePath ) {
                console.warn("Refusing to create or load game.yaml outside the project folder.");
            }
        } catch(error) {
            console.warn("Could not initialize game.yaml for this project", error);
        }
    }

    EditorView.setFiles(this.files.filter(f => f.isInkFile));
    this.showInkFile(this.mainInk);

    // Wait for all project files to be found before starting first compilation
    this.ready = false;

    // Make sure a project save is atomic   
    this.saveActive = false;

    this.startFileWatching();
}

InkProject.prototype.createInkFile = function(anyPath, isBrandNew, loadErrorCallback) {
    var inkFile = new InkFile(anyPath || null, this.mainInk, isBrandNew, this.inkMode, {
        fileChanged: () => { 
            if( inkFile.hasUnsavedChanges && !this.unsavedFiles.contains(inkFile) ) {
                this.unsavedFiles.push(inkFile);
                this.refreshUnsavedChanges();
            }

            // When a file is changed its state may change to have unsaved changes,
            // which should be reflected in the sidebar (unsaved files are bold).
            // Ink documents participate in INCLUDE resolution/compiler sync;
            // YAML files are resources and must never be sent to inklecate.
            if( inkFile.isInkFile ) {
                this.refreshIncludes();
            } else {
                NavView.setFiles(this.mainInk, this.files, this.mainInk && this.mainInk.projectDir);
                const relative = String(inkFile.relativePath() || "").replace(/\\/g, "/").toLowerCase();
                // The style file is game.yaml unless the writer renamed it.
                const isVirtualStyle = !(this.mainInk && this.mainInk.projectDir) && relative === GameStyle.FILE_NAME.toLowerCase();
                const absolutePath = this.mainInk && this.mainInk.projectDir ? inkFile.absolutePath() : null;
                if( inkFile.isYamlFile && (isVirtualStyle || (absolutePath && GameStyle.isActiveStylePath(this, absolutePath))) ) {
                    if( InkProject.events.gameStyleChanged ) InkProject.events.gameStyleChanged();
                }
            }
        },

        // Called when InkFile finds an INCLUDE line in the contents of the file
        includesChanged: () => {
            if( inkFile.isInkFile ) this.refreshIncludes();
            if( inkFile.isInkFile && inkFile.includes.length > 0 ) NavView.initialShow();
        },

        loadError: err => {
            if( loadErrorCallback )
                loadErrorCallback(err);
        }


    });

    // Classify documents explicitly: the YAML editor and Explorer depend on
    // these flags to keep configuration files out of the Ink compiler.
    const ext = path.extname(inkFile.relativePath()).toLowerCase();
    inkFile.isInkFile = ext === ".ink";
    inkFile.isYamlFile = ext === ".yaml" || ext === ".yml";

    this.files.push(inkFile);

    this.sortFileList();
    
    return inkFile;
}

InkProject.prototype.addNewInclude = function(newIncludePath, addToMainInk) {

    // Convert new include path to relative if it's not already
    if( path.isAbsolute(newIncludePath) ) {
        assert(this.mainInk.projectDir, "Main ink needs to be saved before we start loading includes with absolute paths.");
        newIncludePath = path.relative(this.mainInk.projectDir, newIncludePath);
    }

    // Make sure it doesn't already exist
    var alreadyExists = _.some(this.files, (f) => f.relativePath() == newIncludePath);
    if( alreadyExists ) {
        alert(`${i18n._("Could not create new include file at")} ${newIncludePath} ${i18n._("because it already exists!")}`);
        return null;
    }

    if( this.mainInk.projectDir ) {
        const target = path.resolve(this.mainInk.projectDir, newIncludePath);
        if( !GameStyle.pathStaysInsideRoot(this.mainInk.projectDir, target) ) {
            alert("Include path must stay inside the story folder and cannot pass through a symlink outside it.");
            return null;
        }
        mkdirp.sync(path.dirname(target));
        if( NavView.refreshFolders ) NavView.refreshFolders(this.mainInk.projectDir);
    }
    var newIncludeFile = this.createInkFile(newIncludePath || null, isBrandNew = true);

    if( addToMainInk )
        this.mainInk.addIncludeLine(newIncludeFile.relativePath());

    NavView.setFiles(this.mainInk, this.files, this.mainInk.projectDir);
    EditorView.setFiles(this.files.filter(f => f.isInkFile));
    return newIncludeFile;
}

// - Load any newly discovered includes
// - Refresh nav hierarchy in sidebar
InkProject.prototype.refreshIncludes = function() {

    var inkFiles = this.files.filter(f => f.isInkFile);
    var existingRelFilePaths = _.map(_.without(inkFiles, this.mainInk), f => f.relativePath());

    var relPathsFromINCLUDEs = [];
    var addIncludePathsFromFile = (inkFile) => {
        if( inkFile.includes.length == 0 )
            return;

        inkFile.includes.forEach(incPath => {
            
            // fix include relative path on windows
            // on windows path should be either always stored using the same folder separator (\\ or /).
            // mixing them can create unexpected behaviours.
            incPath = path.format(path.parse(incPath));

            let alreadyDone = relPathsFromINCLUDEs.contains(incPath);

            relPathsFromINCLUDEs.push(incPath);

            var recurseInkFile = this.inkFileWithRelativePath(incPath);
            if( recurseInkFile && !alreadyDone )
                addIncludePathsFromFile(recurseInkFile);
        });
    }
    addIncludePathsFromFile(this.mainInk);

    // Includes that we don't have in this.files yet that are mentioned in other files
    var includeRelPathsToLoad = _.difference(relPathsFromINCLUDEs, existingRelFilePaths)

    // Files that are in this.files that aren't actually mentioned anywhere
    var spareRelFilePaths = _.difference(existingRelFilePaths,  relPathsFromINCLUDEs);

    // Mark files that are spare, so they go in a special category at the bottom
    this.files.forEach(f => {
        f.isSpare = f.isInkFile && spareRelFilePaths.indexOf(f.relativePath()) != -1;
    });

    // Load up newly mentioned include files, if they exist
    if( this.mainInk.projectDir ) {
        includeRelPathsToLoad.forEach(newIncludeRelPath => {
            let absPath = path.join(this.mainInk.projectDir, newIncludeRelPath);
            fs.stat(absPath, (err, stats) => {
                // If it exists, and double check that it hasn't already been created during the async fs.stat
                if( !!stats && stats.isFile() &&  !_.some(this.files, f => f.relativePath() == newIncludeRelPath) ) {
                    let newFile = this.createInkFile(newIncludeRelPath, isBrandNew = false, err => {
                        alert(`${i18n._("Failed to load ink file:")} ${err}`);
                        this.files.remove(newFile);
                        this.refreshIncludes();
                    });
                }
            });
            
        });

        this.sortFileList();
    }

    NavView.setFiles(this.mainInk, this.files, this.mainInk.projectDir);
    EditorView.setFiles(this.files.filter(f => f.isInkFile));
    LiveCompiler.setEdited();
}

InkProject.prototype.sortFileList = function() {
    var mainInkFile = this.mainInk;
    this.files.sort(function(a,b) {
        return mainInkFile.includes.indexOf(a.relPath) - mainInkFile.includes.indexOf(b.relPath) 
    } );
}

InkProject.prototype.refreshUnsavedChanges = function() {

    this.hasUnsavedChanges = this.unsavedFiles.length > 0;

    // Update NavView for whether files are bold or not
    // TODO: This could be faster if it simply refreshes the state rather than
    // rebuilding the entire nav view hierarchy
    NavView.setFiles(this.mainInk, this.files, this.mainInk.projectDir);

    // Overall, are there *any* unsaved changes, and has the state changed?
    // Change the dot in the Mac close window button
    ipcRenderer.send("change-mac-dot", this.hasUnsavedChanges);
}

InkProject.prototype.startFileWatching = function() {
    if( !this.mainInk.projectDir ) {
        this.ready = true;
        return;
    }

    if( this.fileWatcher ) this.fileWatcher.close();

    const projectRoot = this.mainInk.projectDir;
    this.fileWatcher = chokidar.watch(projectRoot, {
        disableGlobbing: true,
        ignored: filePath => path.relative(projectRoot, filePath).split(path.sep)
            .some(segment => [".git", "node_modules", ".DS_Store"].indexOf(segment) !== -1)
    });
    let folderRefreshTimer = null;
    const refreshFolderTree = () => {
        clearTimeout(folderRefreshTimer);
        folderRefreshTimer = setTimeout(() => {
            folderRefreshTimer = null;
            NavView.refreshFolders(this.mainInk.projectDir);
            NavView.setFiles(this.mainInk, this.files, this.mainInk.projectDir);
        }, 100);
    };

    const isSupportedDocument = fileAbsPath => {
        const ext = path.extname(fileAbsPath).toLowerCase();
        return ext === ".ink" || ext === ".yaml" || ext === ".yml";
    };
    const isInsideProject = fileAbsPath => {
        return GameStyle.pathStaysInsideRoot(this.mainInk.projectDir, path.resolve(fileAbsPath));
    };
    const tryUpdateSettingsFile = fileAbsPath => {
        const mainInkPath = this.mainInk.absolutePath();
        let basePath = mainInkPath;
        if( path.extname(basePath) === ".ink" ) basePath = basePath.substring(0, basePath.length - 4);
        const expectedSettingsPath = basePath + ".settings.json";
        if( expectedSettingsPath !== fileAbsPath ) return false;
        ipcRenderer.send("project-settings-needs-reload", mainInkPath);
        return true;
    };
    const notifyStyleIfRelevant = fileAbsPath => {
        const resolved = path.resolve(fileAbsPath);
        const entryPath = GameStyle.entryFilePathFor(this);
        const activePath = GameStyle.filePathFor(this);
        if( (entryPath && resolved === path.resolve(entryPath)) ||
            (activePath && resolved === path.resolve(activePath)) ) {
            if( InkProject.events.gameStyleChanged ) InkProject.events.gameStyleChanged();
        }
    };
    const relativePath = absPath => path.relative(this.mainInk.projectDir, absPath).split(path.sep).join("/");
    const findDocument = relPath => this.files.find(f => f.relativePath().replace(/\\/g, "/") === relPath);
    const addDocument = absPath => {
        if( !isSupportedDocument(absPath) || !isInsideProject(absPath) ) return;
        const relPath = relativePath(absPath);
        if( findDocument(relPath) ) return;
        let newFile = null;
        newFile = this.createInkFile(absPath, isBrandNew = false, err => {
            alert(`${i18n._("Failed to load project file:")} ${err}`);
            if( newFile ) this.files.remove(newFile);
            this.refreshIncludes();
        });
        if( newFile.isYamlFile ) notifyStyleIfRelevant(absPath);
        if( newFile.isInkFile ) this.refreshIncludes();
        else NavView.setFiles(this.mainInk, this.files, this.mainInk.projectDir);
    };

    // Sound files (mp3, wav, ogg...) are not documents, but the Explorer lists them.
    this.audioFiles = new Set();
    const trackAudioFile = (absPath, present) => {
        if( !isAudioFileName(absPath) || !isInsideProject(absPath) ) return false;
        const relPath = relativePath(absPath);
        if( present ) this.audioFiles.add(relPath);
        else this.audioFiles.delete(relPath);
        NavView.setAudioFiles(Array.from(this.audioFiles).sort((a, b) => a.localeCompare(b)));
        refreshFolderTree();
        if( InkProject.events.audioFilesChanged ) InkProject.events.audioFilesChanged();
        return true;
    };
    this.imageFiles = new Set();
    const trackImageFile = (absPath, present) => {
        if( !isImageFileName(absPath) || !isInsideProject(absPath) ) return false;
        const relPath = relativePath(absPath);
        if( present ) this.imageFiles.add(relPath);
        else this.imageFiles.delete(relPath);
        NavView.setImageFiles(Array.from(this.imageFiles).sort((a, b) => a.localeCompare(b)));
        refreshFolderTree();
        return true;
    };
    this.noteImageFiles = relativePaths => {
        relativePaths.forEach(relPath => {
            const absolute = path.resolve(this.mainInk.projectDir, String(relPath).split("/").join(path.sep));
            trackImageFile(absolute, true);
        });
    };

    this.fileWatcher.on("add", absPath => {
        if( trackAudioFile(absPath, true) ) return;
        if( trackImageFile(absPath, true) ) return;
        if( this.saveActive || tryUpdateSettingsFile(absPath) ) return;
        if( !isSupportedDocument(absPath) ) return;
        addDocument(absPath);
    });

    this.fileWatcher.on("change", absPath => {
        if( trackImageFile(absPath, true) ) return;
        if( this.saveActive || tryUpdateSettingsFile(absPath) || !isSupportedDocument(absPath) ) return;
        const relPath = relativePath(absPath);
        const document = findDocument(relPath);
        if( document ) {
            if( !document.hasUnsavedChanges ) {
                if( this.activeInkFile === document ) EditorView.saveCursorPos();
                document.tryLoadFromDisk(err => {
                    if( err ) console.warn("Could not reload project file", absPath, err);
                    else if( this.activeInkFile === document ) setImmediate(() => EditorView.restoreCursorPos());
                });
            }
        } else {
            addDocument(absPath);
        }
        if( path.extname(absPath).toLowerCase() === ".yaml" || path.extname(absPath).toLowerCase() === ".yml" )
            notifyStyleIfRelevant(absPath);
    });

    this.fileWatcher.on("unlink", absPath => {
        if( trackAudioFile(absPath, false) ) return;
        if( trackImageFile(absPath, false) ) return;
        if( this.saveActive || tryUpdateSettingsFile(absPath) || !isSupportedDocument(absPath) ) return;
        const document = findDocument(relativePath(absPath));
        if( document && !document.hasUnsavedChanges && document !== this.mainInk ) this.deleteInkFile(document);
        notifyStyleIfRelevant(absPath);
        NavView.setFiles(this.mainInk, this.files, this.mainInk.projectDir);
    });

    this.fileWatcher.on("addDir", refreshFolderTree);
    this.fileWatcher.on("unlinkDir", refreshFolderTree);
    this.fileWatcher.on("ready", () => {
        this.ready = true;
        refreshFolderTree();
    });
};

InkProject.prototype.showInkFile = function(inkFile) {
    ImageViewer.hide();
    // Retain the public name used by older navigation/compiler code, while
    // allowing it to open any supported project document, including YAML.
    if( _.isString(inkFile) ) inkFile = this.fileWithRelativePath(inkFile);

    if( inkFile && inkFile !== this.activeInkFile ) {
        if( this.activeInkFile ) this.activeInkFile.isActive = false;
        this.activeInkFile = inkFile;
        inkFile.isActive = true;
        EditorView.showInkFile(inkFile);
        InkProject.events.didSwitchToInkFile(inkFile);
    }
};

InkProject.prototype.openImageFile = function(absolutePath) {
    if( !this.mainInk.projectDir || !isImageFileName(absolutePath) ||
        !GameStyle.pathStaysInsideRoot(this.mainInk.projectDir, absolutePath) ) {
        NavView.showMessage(`Only ${imageLabelList()} images inside the project folder can be previewed.`);
        return;
    }
    try {
        if( !fs.statSync(absolutePath).isFile() ) {
            NavView.showMessage("The selected image is not a regular file.");
            return;
        }
    } catch(error) {
        console.error("Could not inspect project image", absolutePath, error);
        NavView.showMessage(`Could not open image: ${error.message || error}`);
        return;
    }
    ImageViewer.show(absolutePath);
};

InkProject.prototype.save = function(onComplete) {

    // Make saving atomic, don't save again if we're already saving
    if( this.saveActive ) {
        if( onComplete ) this.saveCompletionCallbacks.push(onComplete);
        return;
    }
    this.saveActive = true;
    this.saveCompletionCallbacks = onComplete ? [onComplete] : [];

    var wasUnsaved = !this.mainInk.projectDir;

    var filesRemaining = this.files.length;
    var includeFiles = _.filter(this.files, f => f != this.mainInk);

    var allSuccess = true;
    var finished = false;

    const finishSave = success => {
        if( finished ) return;
        finished = true;
        this.saveActive = false;
        if( wasUnsaved && this.mainInk.projectDir ) LiveCompiler.projectFilesChanged();
        const callbacks = this.saveCompletionCallbacks.splice(0);
        callbacks.forEach(callback => callback(success));
    };

    var singleFileSaveComplete = (file, success) => {
        allSuccess = allSuccess && success;
        if( success ) this.unsavedFiles.remove(file);

        filesRemaining--;
        if( filesRemaining == 0 ) {
            this.refreshUnsavedChanges();

            if( allSuccess )
                InkProject.events.didSave();

            finishSave(allSuccess);
        }
    }

    // Save main ink to ensure the other files have a base directory path.
    // Electron's Linux Save dialog may return a path without the filtered
    // extension, so normalize that result before InkFile adopts the path or
    // writes the file. Existing paths that already end in .ink are unchanged.
    const originalInvoke = ipcRenderer.invoke;
    let awaitingMainInkSaveDialog = wasUnsaved;
    const guardedInvoke = function(channel, ...args) {
        const result = originalInvoke.call(ipcRenderer, channel, ...args);
        // Only intercept the first Save dialog triggered by this unsaved main story.
        if( channel !== "showSaveDialog" || !awaitingMainInkSaveDialog || !result || typeof result.then !== "function" ) return result;
        awaitingMainInkSaveDialog = false;
        return result.then(dialogResult => {
            if( dialogResult && !dialogResult.canceled && typeof dialogResult.filePath === "string" &&
                dialogResult.filePath.length > 0 && !/\.ink$/i.test(dialogResult.filePath) ) {
                return Object.assign({}, dialogResult, { filePath: dialogResult.filePath + ".ink" });
            }
            return dialogResult;
        });
    };
    if( wasUnsaved ) ipcRenderer.invoke = guardedInvoke;
    const restoreInvoke = () => {
        if( wasUnsaved && ipcRenderer.invoke === guardedInvoke ) ipcRenderer.invoke = originalInvoke;
    };
    try {
        this.mainInk.save(success => {
            restoreInvoke();

            // May not be a success if cancelled, in which case we stop early.
            if( success ) {
                if( this.mainInk.absolutePath() )
                    ipcRenderer.send("main-file-saved", this.mainInk.absolutePath());
                if( wasUnsaved ) this.startFileWatching();
                includeFiles.forEach(f => f.save(success => singleFileSaveComplete(f, success)));
            }
            singleFileSaveComplete(this.mainInk, success);
            if( !success ) finishSave(false);
        });
    } catch(error) {
        restoreInvoke();
        finishSave(false);
        throw error;
    }
}

InkProject.prototype.exportForWeb = function() {
    if( !this.ready ) {
        alert(i18n._("Project not quite fully loaded! Please try exporting again in a couple of seconds..."));
        return;
    }

    // The compiled JSON is an internal input to the Web player, not an export artifact.
    LiveCompiler.compileForWeb((err, compiledJsonTempPath) => {
        if( err ) {
            alert(`${i18n._("Could not export:")} ${err}`);
            return;
        }

        if( !this.defaultExportPath && this.mainInk.absolutePath() ) {
            this.defaultExportPath = this.mainInk.absolutePath();
        }

        if( this.defaultExportPath ) {
            var pathObj = path.parse(this.defaultExportPath);
            pathObj.base = path.basename(pathObj.base, pathObj.ext);
            pathObj.ext = "";
            this.defaultExportPath = path.format(pathObj);
        }

        ipcRenderer.invoke('showSaveDialog', {
            defaultPath: this.defaultExportPath
        }).then((result) => {
            if( !result || result.canceled || !result.filePath ) return;
            this.defaultExportPath = result.filePath;
            this.buildForWeb(compiledJsonTempPath, result.filePath);
        }).catch(error => {
            console.error("Could not open export dialog", error);
            alert(`Could not export: ${error.message || error}`);
        });

    });
}

InkProject.prototype.jsFilename = function() {
    // Derive story content js file from root ink filename
    // Remove .ink extension if it's ".ink"
    var mainInkRootName = this.mainInk.filename();
    if( path.extname(mainInkRootName) == ".ink" )
        mainInkRootName = path.basename(mainInkRootName, ".ink");
    var jsContentFilename = mainInkRootName+".js";

    // These names belong to the exported player and runtime. Avoid overwriting
    // them when the story itself is named "main.ink" or "ink.ink".
    if( ["main.js", "ink.js"].includes(jsContentFilename.toLowerCase()) ) {
        jsContentFilename = "story.js";
    }

    return jsContentFilename;
}

InkProject.prototype.buildForWeb = function(jsonFilePath, targetDirectory) {

    var templateDir = path.join(__dirname, "../export-for-web-template");

    var gameStyle;
    try {
        gameStyle = GameStyle.loadFromProject(this);
        gameStyle.warnings.forEach(w => console.warn("game.yaml: " + w));
    } catch(error) {
        console.error("Could not load game style for web export", error);
        alert(`Could not export for web: failed to load game settings.\n\n${error.message || error}`);
        return;
    }

    var storyTitle = gameStyle.style.titles.story;

    // A cover that is set but cannot be used (missing, outside the project) is reported, not guessed
    var coverReference = gameStyle.style.titles.cover;
    var coverFilePath = GameStyle.resolveCoverFile(this.mainInk.projectDir, coverReference);

    var options = {
        compiledJsonPath: jsonFilePath,
        targetDirectory: targetDirectory,
        templateDirectory: templateDir,
        inkRuntimePath: path.join(__dirname, "../node_modules/inkjs/dist/ink.js"),
        javascriptFilename: this.jsFilename(),
        storyTitle: storyTitle,
        storyAuthor: gameStyle.style.titles.author,
        projectDirectory: this.mainInk.projectDir || null,
        coverFilePath: coverFilePath,
        audioVolume: gameStyle.style.audio.volume,
        audioMix: {
            master: gameStyle.style.audio.master,
            music: gameStyle.style.audio.music,
            sfx: gameStyle.style.audio.sfx
        },
        themeToggle: !!gameStyle.style.alternate,
        themeInitial: gameStyle.style.theme,
        themeAlternate: gameStyle.style.alternate ? gameStyle.style.alternate.theme : "",
        cssAddition: GameStyle.exportCss(gameStyle.style)
    };

    buildWebExport(options).then(result => {
        console.log("Web export completed:", result.targetDirectory, result.files);
        let message = `Web export completed successfully.\n\nOpen this file in your browser:\n${path.join(result.targetDirectory, "index.html")}`;
        const audio = result.audio || { copied: [], missing: [], invalid: [] };
        if( audio.copied.length ) message += `\n\nSound files copied (${audio.copied.length}): ${audio.copied.join(", ")}`;
        if( audio.missing.length ) message += `\n\nNOT FOUND in the "audio" or "audios" folder or next to your main story, so the game will be silent there: ${audio.missing.join(", ")}`;
        if( audio.invalid.length ) message += `\n\nNot valid sound file names (use a plain file name such as forest.mp3): ${audio.invalid.join(", ")}`;
        if( coverReference && !coverFilePath ) message += `\n\nThe cover image "${coverReference}" was not found in the project folder, so the title screen has no cover.`;
        alert(message);
    }).catch(error => {
        console.error("Web export failed", error);
        alert(`Could not export for web.\n\n${error.message || error}`);
    });
}

InkProject.prototype.tryClose = function() {
    if( this.hasUnsavedChanges ) {
        ipcRenderer.invoke("try-close").then((responseObject) => {
            var response = responseObject.response;
            if( response == 0 ) {
                this.save(success => {
                    if( success ) this.closeImmediate();
                    else ipcRenderer.send("project-cancelled-close");
                });
            }
            
            // Don't save
            else if( response == 1 ) {
                this.closeImmediate();
            }
            
            // Cancel
            else { 
                ipcRenderer.send("project-cancelled-close");
            }
            })
    }
    // Nothing to save, just exit
    else {
        this.closeImmediate();
    }
}

// Response from the close menu


// Sound files that were just copied into the project show up in the Explorer without waiting for the file watcher.
InkProject.prototype.noteAudioFiles = function(relativePaths) {
    if( !this.audioFiles ) this.audioFiles = new Set();
    relativePaths.forEach(relPath => this.audioFiles.add(relPath));
    NavView.setAudioFiles(Array.from(this.audioFiles).sort((a, b) => a.localeCompare(b)));
    if( InkProject.events.audioFilesChanged ) InkProject.events.audioFilesChanged();
};

InkProject.prototype.closeImmediate = function() {
    ipcRenderer.send("project-final-close");
}


// Rename a project file or directory without breaking the in-memory editor model.
// Only supported project documents are renamed from the Explorer; folder rename
// also updates every loaded document below that directory and all matching Ink INCLUDEs.
// With options.moveToFolder (a folder path relative to the project, "" for the project folder) the
// item keeps its name and goes into that folder instead: any file or folder of the project can
// move, and every INCLUDE, loaded document and sound/picture list follows it, or nothing changes.
InkProject.prototype.renameProjectItem = function(type, relativePath, requestedName, options) {
    const fail = error => ({ ok: false, error: error });
    const moving = !!(options && typeof options.moveToFolder === "string");
    if( !this.mainInk || !this.mainInk.projectDir ) return fail("Save the main story before renaming project items.");
    if( this.saveActive ) return fail("Wait for the project to finish saving, then try again.");
    if( type !== "file" && type !== "folder" ) return fail("Unknown item type.");

    const root = path.resolve(this.mainInk.projectDir);
    const normalize = value => String(value || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
    const oldRel = normalize(relativePath);
    const name = moving ? path.posix.basename(oldRel) : String(requestedName || "").trim();
    if( !oldRel || oldRel === "." || oldRel === ".." || oldRel.startsWith("../") || path.isAbsolute(oldRel) )
        return fail(moving ? "The project root itself cannot be moved." : "The project root itself cannot be renamed.");
    if( !moving ) {
        if( !name ) return fail("Enter a name.");
        if( name === "." || name === ".." || /[\\/]/.test(name) || /[<>:"|?*\x00-\x1f]/.test(name) || /[ .]$/.test(name) )
            return fail("Use a valid name without path separators or reserved characters.");
    }

    const oldAbs = path.resolve(root, oldRel.split("/").join(path.sep));
    if( !GameStyle.pathStaysInsideRoot(root, oldAbs) || oldAbs === root )
        return fail("The item must stay inside the project folder and cannot pass through a symlink outside it.");
    let sourceStat;
    try { sourceStat = fs.lstatSync(oldAbs); }
    catch(e) { return fail("The item no longer exists on disk."); }
    if( sourceStat.isSymbolicLink() ) return fail("Symbolic links cannot be renamed from the Explorer.");
    if( type === "folder" && !sourceStat.isDirectory() ) return fail("The selected item is not a folder.");
    if( type === "file" && !sourceStat.isFile() ) return fail("The selected item is not a file.");

    if( moving ) {
        const destinationFolder = normalize(options.moveToFolder);
        if( destinationFolder === ".." || destinationFolder.startsWith("../") || path.isAbsolute(destinationFolder) )
            return fail("The destination must be inside the project folder.");
        const mainRelativePath = normalize(this.mainInk.relativePath());
        if( mainRelativePath === oldRel || (type === "folder" && mainRelativePath.startsWith(oldRel + "/")) )
            return fail("The main story cannot be moved: the project folder is where it lives.");
        if( type === "file" && GameStyle.isActiveStylePath(this, oldAbs) )
            return fail(path.basename(oldAbs) + " is the project's style file and must stay in the project folder.");
        if( type === "folder" && (destinationFolder === oldRel || destinationFolder.startsWith(oldRel + "/")) )
            return fail("A folder cannot be moved into itself.");
        const destinationAbs = destinationFolder ? path.resolve(root, destinationFolder.split("/").join(path.sep)) : root;
        if( destinationFolder && !GameStyle.pathStaysInsideRoot(root, destinationAbs) )
            return fail("The destination must stay inside the project folder and cannot pass through a symlink outside it.");
        let destinationStat;
        try { destinationStat = fs.lstatSync(destinationAbs); }
        catch(e) { return fail("The destination folder no longer exists."); }
        if( !destinationStat.isDirectory() || destinationStat.isSymbolicLink() ) return fail("The destination is not a regular folder.");
        var newRel = destinationFolder ? destinationFolder + "/" + name : name;
    } else if( type === "file" ) {
        const document = this.fileWithRelativePath(oldRel);
        if( !isImageFileName(oldRel) && (!document || (!document.isInkFile && !document.isYamlFile)) )
            return fail("Only Ink scenes, YAML style files and images can be renamed here.");
        const { stem: finalStem, filename: finalName } = withPreservedExtension(oldRel, name);
        if( !finalStem ) return fail("Enter a name.");
        const parent = path.posix.dirname(oldRel);
        var newRel = parent === "." ? finalName : parent + "/" + finalName;
    } else {
        var newRel = path.posix.dirname(oldRel) === "."
            ? name
            : path.posix.dirname(oldRel) + "/" + name;
    }
    newRel = normalize(newRel);
    if( newRel === oldRel ) return { ok: true, unchanged: true, oldRelativePath: oldRel, newRelativePath: newRel };
    const newAbs = path.resolve(root, newRel.split("/").join(path.sep));
    if( !GameStyle.pathStaysInsideRoot(root, newAbs) || newAbs === root )
        return fail("The destination must stay inside the project folder and cannot pass through a symlink outside it.");
    if( fs.existsSync(newAbs) ) {
        // On a case-insensitive filesystem a case-only rename ("Scene.ink" ->
        // "scene.ink") "already exists" because it is the very same file.
        let sameFile = false;
        if( oldAbs.toLowerCase() === newAbs.toLowerCase() ) {
            try {
                const destinationStat = fs.statSync(newAbs);
                sameFile = destinationStat.ino !== 0 && destinationStat.ino === sourceStat.ino && destinationStat.dev === sourceStat.dev;
            } catch(e) { sameFile = false; }
        }
        if( !sameFile ) return fail(moving ? "An item named \"" + name + "\" already exists in the destination folder." : "An item with that name already exists.");
    }

    const isAffectedPath = rel => type === "file"
        ? normalize(rel) === oldRel
        : normalize(rel) === oldRel || normalize(rel).startsWith(oldRel + "/");
    const mapRelative = rel => {
        const current = normalize(rel);
        if( !isAffectedPath(current) ) return current;
        return type === "file" ? newRel : newRel + current.substring(oldRel.length);
    };

    // Everything below is undone if any step fails: the disk move, the documents'
    // paths, rewritten INCLUDE text and files already written.
    let diskRenamed = false;
    // The project's style file (game.yaml unless renamed before) may be renamed too: the new
    // name is remembered so the preview and the export keep using it.
    const renamesStyleFile = type === "file" && GameStyle.isActiveStylePath(this, oldAbs);
    const previousStylePointer = renamesStyleFile ? GameStyle.readEntryPointer(root) : null;
    let stylePointerChanged = false;
    const previousRelPaths = new Map();
    const previousTexts = new Map();
    const writtenDocuments = [];
    const previousAudioFiles = this.audioFiles ? new Set(this.audioFiles) : null;
    const previousImageFiles = this.imageFiles ? new Set(this.imageFiles) : null;
    const remapList = list => {
        if( !list ) return;
        Array.from(list).forEach(item => {
            if( !isAffectedPath(item) ) return;
            list.delete(item);
            list.add(mapRelative(item));
        });
    };
    const publishLists = () => {
        if( this.audioFiles ) NavView.setAudioFiles(Array.from(this.audioFiles).sort((a, b) => a.localeCompare(b)));
        if( this.imageFiles ) NavView.setImageFiles(Array.from(this.imageFiles).sort((a, b) => a.localeCompare(b)));
    };

    try {
        fs.renameSync(oldAbs, newAbs);
        diskRenamed = true;
        // Sound and picture files are not documents: the Explorer knows them from these lists.
        remapList(this.audioFiles);
        remapList(this.imageFiles);
        publishLists();
        if( renamesStyleFile ) {
            GameStyle.setEntryFileName(root, path.basename(newAbs));
            stylePointerChanged = true;
        }

        // Keep existing document/undo/session objects alive; only their relative path changes.
        const movedDocuments = [];
        this.files.forEach(document => {
            const oldDocumentRel = normalize(document.relativePath());
            if( isAffectedPath(oldDocumentRel) ) {
                previousRelPaths.set(document, document.relPath);
                document.relPath = mapRelative(oldDocumentRel).split("/").join(path.sep);
                movedDocuments.push(document);
            }
        });

        // Rewrite exact INCLUDE targets, including all paths below a renamed folder.
        const changedIncludeDocuments = [];
        // Ink reads the whole rest of the line as the path, so it may contain
        // spaces. A trailing "// comment" and trailing blanks are kept as they are.
        const includeRegex = /^([ \t]*INCLUDE[ \t]+)(.*?)([ \t]*(?:\/\/.*)?)$/gim;
        this.files.filter(document => document.isInkFile).forEach(document => {
            const oldText = document.getValue();
            let changed = false;
            const newText = oldText.replace(includeRegex, (line, prefix, target, suffix) => {
                const normalizedTarget = normalize(target);
                const targetAffected = type === "file"
                    ? normalizedTarget === oldRel
                    : normalizedTarget === oldRel || normalizedTarget.startsWith(oldRel + "/");
                if( !targetAffected ) return line;
                const nextTarget = type === "file"
                    ? newRel
                    : newRel + normalizedTarget.substring(oldRel.length);
                const separator = target.indexOf("\\") !== -1 ? "\\" : "/";
                const formattedTarget = nextTarget.split("/").join(separator);
                changed = true;
                return prefix + formattedTarget + suffix;
            });
            if( changed ) {
                previousTexts.set(document, { text: oldText, unsaved: document.hasUnsavedChanges });
                document.setValue(newText);
                changedIncludeDocuments.push(document);
            }
        });

        // The rename itself is also a save operation for any unsaved documents moved with it.
        const documentsToWrite = new Set(movedDocuments.concat(changedIncludeDocuments));
        documentsToWrite.forEach(document => {
            const abs = document.absolutePath();
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            document.justSaved = true;
            fs.writeFileSync(abs, document.getValue(), "utf8");
            writtenDocuments.push(document);
            document.hasUnsavedChanges = false;
            if( document.symbols && document.isInkFile && document.symbols.parse ) document.symbols.parse();
        });
        this.unsavedFiles = (this.unsavedFiles || []).filter(document => !documentsToWrite.has(document));
        this.hasUnsavedChanges = this.unsavedFiles.length > 0;


        this.sortFileList();
        this.refreshIncludes();
        NavView.refreshFolders(this.mainInk.projectDir);
        NavView.setFiles(this.mainInk, this.files, this.mainInk.projectDir);
        EditorView.setFiles(this.files.filter(document => document.isInkFile));
        if( this.audioFiles && InkProject.events && InkProject.events.audioFilesChanged ) InkProject.events.audioFilesChanged();

        return {
            ok: true,
            moved: moving,
            type: type,
            oldRelativePath: oldRel,
            newRelativePath: newRel,
            oldAbsolutePath: oldAbs,
            newAbsolutePath: newAbs,
            renamedMain: this.mainInk.relativePath().replace(/\\/g, "/") === newRel && oldRel !== newRel,
            affectedDocuments: documentsToWrite.size
        };
    } catch(error) {
        // Best effort rollback, in the reverse order of the steps above.
        previousRelPaths.forEach((relPath, document) => { document.relPath = relPath; });
        try {
            if( diskRenamed ) fs.renameSync(newAbs, oldAbs);
        } catch(rollbackError) { console.error("Rename rollback failed", rollbackError); }
        try {
            if( stylePointerChanged ) GameStyle.restoreEntryPointer(root, previousStylePointer);
        } catch(rollbackError) { console.error("Rename rollback failed", rollbackError); }
        if( previousAudioFiles ) this.audioFiles = previousAudioFiles;
        if( previousImageFiles ) this.imageFiles = previousImageFiles;
        try { publishLists(); } catch(rollbackError) { console.error("Rename rollback failed", rollbackError); }
        previousTexts.forEach((state, document) => {
            document.setValue(state.text);
            document.hasUnsavedChanges = state.unsaved;
        });
        // Files already written with the new INCLUDE text go back to their old content.
        writtenDocuments.forEach(document => {
            try {
                document.justSaved = true;
                fs.writeFileSync(document.absolutePath(), document.getValue(), "utf8");
            } catch(rollbackError) { console.error("Rename rollback failed", rollbackError); }
        });
        try {
            this.sortFileList();
            NavView.setFiles(this.mainInk, this.files, this.mainInk.projectDir);
            EditorView.setFiles(this.files.filter(document => document.isInkFile));
        } catch(refreshError) { console.error(refreshError); }
        return fail("Rename failed: " + error.message);
    }
};

InkProject.prototype.deleteProjectItem = function(type, relativePath) {
    const fail = error => ({ ok: false, error: error });
    if( !this.mainInk || !this.mainInk.projectDir ) return fail("Save the main story before deleting project items.");
    if( this.saveActive ) return fail("Wait for the project to finish saving, then try again.");
    if( type !== "file" && type !== "folder" ) return fail("Unknown item type.");

    const root = path.resolve(this.mainInk.projectDir);
    const normalize = value => String(value || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
    const relative = normalize(relativePath);
    if( !relative || relative === "." || relative === ".." || relative.startsWith("../") || path.isAbsolute(relative) )
        return fail("The project root itself cannot be deleted.");

    const absolute = path.resolve(root, relative.split("/").join(path.sep));
    if( !GameStyle.pathStaysInsideRoot(root, absolute) || absolute === root )
        return fail("The item must stay inside the project folder and cannot pass through a symlink outside it.");

    let itemStat;
    try { itemStat = fs.lstatSync(absolute); }
    catch(error) { return fail("The item no longer exists on disk."); }
    if( itemStat.isSymbolicLink() ) return fail("Symbolic links cannot be deleted from the Explorer.");
    if( type === "folder" && !itemStat.isDirectory() ) return fail("The selected item is not a folder.");
    if( type === "file" && !itemStat.isFile() ) return fail("The selected item is not a file.");

    const mainRelative = normalize(this.mainInk.relativePath());
    if( mainRelative === relative || (type === "folder" && mainRelative.startsWith(relative + "/")) )
        return fail("The main story cannot be deleted from the Explorer.");
    if( type === "file" && GameStyle.isActiveStylePath(this, absolute) )
        return fail(path.basename(absolute) + " is the project's style file and cannot be deleted from the Explorer.");

    const isInsideItem = document => {
        const documentRelative = normalize(document.relativePath());
        return documentRelative === relative || (type === "folder" && documentRelative.startsWith(relative + "/"));
    };
    const removedDocuments = this.files.filter(isInsideItem);

    try {
        fs.rmSync(absolute, { recursive: type === "folder", force: false });
    } catch(error) {
        return fail("Delete failed: " + error.message);
    }

    if( this.audioFiles ) {
        Array.from(this.audioFiles).forEach(audioPath => {
            if( audioPath === relative || (type === "folder" && audioPath.startsWith(relative + "/")) ) this.audioFiles.delete(audioPath);
        });
        NavView.setAudioFiles(Array.from(this.audioFiles).sort((a, b) => a.localeCompare(b)));
        if( InkProject.events.audioFilesChanged ) InkProject.events.audioFilesChanged();
    }
    if(removedDocuments.indexOf(this.activeInkFile) !== -1) this.showInkFile(this.mainInk);
    this.files = this.files.filter(document => !isInsideItem(document));
    this.unsavedFiles = (this.unsavedFiles || []).filter(document => !isInsideItem(document));
    this.refreshUnsavedChanges();
    this.refreshIncludes();
    NavView.refreshFolders(this.mainInk.projectDir);
    NavView.setFiles(this.mainInk, this.files, this.mainInk.projectDir);
    EditorView.setFiles(this.files.filter(document => document.isInkFile));

    return { ok: true, type: type, relativePath: relative, deletedDocuments: removedDocuments.length };
};

InkProject.prototype.fileWithRelativePath = function(relativePath) {
    const normalized = String(relativePath || "").replace(/\\/g, "/");
    return _.find(this.files, f => f.relativePath().replace(/\\/g, "/") === normalized);
}

InkProject.prototype.inkFileWithRelativePath = function(relativePath) {
    const file = this.fileWithRelativePath(relativePath);
    return file && file.isInkFile ? file : null;
}

InkProject.prototype.inkFileWithId = function(id) {
    return _.find(this.files, f => f.id == id);
}

InkProject.prototype.ensureProjectFile = function(relativePath) {
    const normalized = String(relativePath || "").replace(/\\/g, "/");
    const existing = this.fileWithRelativePath(normalized);
    if( existing ) return existing;
    if( !this.mainInk.projectDir ) return null;
    const target = path.resolve(this.mainInk.projectDir, normalized);
    if( !GameStyle.pathStaysInsideRoot(this.mainInk.projectDir, target) ) return null;
    try {
        if( !fs.existsSync(target) || !fs.statSync(target).isFile() ) return null;
    } catch(e) { return null; }
    const doc = this.createInkFile(target, isBrandNew = false, err => {
        alert(`${i18n._("Failed to load project file:")} ${err}`);
    });
    return doc;
}

InkProject.prototype.openYamlFile = function(relativePath) {
    const ext = path.extname(relativePath).toLowerCase();
    if( ext !== ".yaml" && ext !== ".yml" ) return null;
    const document = this.ensureProjectFile(relativePath);
    if( document ) {
        this.showInkFile(document);
        NavView.setFiles(this.mainInk, this.files, this.mainInk.projectDir);
        return document;
    }
    return null;
}

InkProject.prototype.deleteInkFile = function(inkFile) {

    if( this.activeInkFile == inkFile )
        this.showInkFile(this.mainInk);

    inkFile.deleteFromDisk();

    this.files.remove(inkFile);

    NavView.setFiles(this.mainInk, this.files, this.mainInk.projectDir);
    EditorView.setFiles(this.files.filter(f => f.isInkFile));
}

InkProject.prototype.findSymbol = function(name, posContext) {

    // Name components
    var nameComps = name.split(".");
    var baseName = nameComps[0];
    var tailNameComps = nameComps.slice(1);

    // Find starting symbol based on the context
    var symbolContext = this.activeInkFile.symbols.symbolAtPos(posContext);

    // Helper function to search downward into a symbol to find a single name
    function findWithinSymbolDeep(withinSymbol, targetName) {
        if( withinSymbol.innerSymbols ) {
            var foundSym = withinSymbol.innerSymbols[targetName];
            if( foundSym ) {
                return foundSym;
            } else {
                for(var innerSymName in withinSymbol.innerSymbols) {
                    foundSym = findWithinSymbolDeep(withinSymbol.innerSymbols[innerSymName])
                    if( foundSym )
                        return foundSym;
                }
            }
        }
    }

    // Try searching towards leaves first
    var baseSymbol = findWithinSymbolDeep(symbolContext, baseName);

    // Otherwise, work our way up to a broader and broader scope to
    // find the a symbol that contains the base name we're looking for
    if( !baseSymbol ) {
        while(symbolContext) {
            if( symbolContext.innerSymbols ) {
                var found = symbolContext.innerSymbols[baseName];
                if( found ) {
                    baseSymbol = found;
                    break;
                }
            }
            symbolContext = symbolContext.parent;
        }
    }

    // Finally, try to search within all files scope
    if( !baseSymbol ) {

        // Collect all symbols
        var allSymbols = {};
        for(var i=0; i<this.files.length; i++) {
            var file = this.files[i];
            var fileSymbols = file.symbols.getSymbols();
            var found = fileSymbols[baseName];
            if( found ) {
                baseSymbol = found;
                break;
            }
        }
    }
    
    if( !baseSymbol ) {
        console.log("Failed to find base symbol: "+baseName);
        return null;
    }

    // Resolve the rest of the path
    var symbol = baseSymbol;
    for(var i=0; i<tailNameComps.length; i++) {
        var tailComp = tailNameComps[i];
        var tailSymbol = findWithinSymbolDeep(symbol, tailComp);
        if( !tailSymbol ) {
            console.log("Failed to find complete path due to not finding: "+tailComp);
            return symbol;
        }
        
        symbol = tailSymbol;
    }

    console.log("Found "+symbol.name);
    return symbol;
}


InkProject.prototype.refreshProjectSettings = function(newProjectSettings) {
    if( this.instructionPrefix != newProjectSettings.instructionPrefix ) {
        this.instructionPrefix = newProjectSettings.instructionPrefix;

        PlayerView.setInstructionPrefix(this.instructionPrefix);
        
        // Refresh the InkMode, which affects syntax highlighting.
        // This allows users to customise the "instructionPrefix", which
        // is the game-specific convension to use something like ">>> CAMERA: Wide angle"
        this.inkMode = new InkMode(this.instructionPrefix);

        for(let inkFile of this.files) {
            if( inkFile.isInkFile ) inkFile.setInkMode(this.inkMode);
        }
    }
}


InkProject.setEvents = function(e) {
    InkProject.events = e;
}

InkProject.startNew = function() {
    InkProject.setProject(new InkProject());
}

InkProject.loadProject = function(mainInkPath) {
    InkProject.setProject(new InkProject(mainInkPath));
}

InkProject.setProject = function(project) {
    InkProject.currentProject = project;
    InkProject.events.newProject(project);
}

ipcRenderer.on("set-project-main-ink-filepath", (event, filePath) => {
    InkProject.loadProject(filePath);
});

ipcRenderer.on("open-main-ink", (event) => {
    if( InkProject.currentProject ) {
        InkProject.currentProject.showInkFile(InkProject.currentProject.mainInk);
    }
});

ipcRenderer.on("project-new-include", () => {
    if( InkProject.currentProject ) {
        NavView.show();
        NavView.showAddIncludeForm();
    }
});

ipcRenderer.on("project-save", (event) => {
    if( InkProject.currentProject ) {
        InkProject.currentProject.save();
    }
});

ipcRenderer.on("project-export-for-web", (event) => {
    if( InkProject.currentProject ) {
        InkProject.currentProject.exportForWeb();
    }
});

ipcRenderer.on("project-tryClose", (event) => {
    if( InkProject.currentProject ) {
        InkProject.currentProject.tryClose();
    }
});

ipcRenderer.on("project-settings-changed", (event, settings) => {
    if( InkProject.currentProject ) {
        InkProject.currentProject.refreshProjectSettings(settings);
    }
});


exports.InkProject = InkProject;
