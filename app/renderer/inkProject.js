const remote = require('electron').remote;
const dialog = remote.dialog;
const ipc = require("electron").ipcRenderer;
const path = require("path");
const _ = require("lodash");
const chokidar = require('chokidar');

const EditorView = require("./editorView.js").EditorView;
const NavView = require("./navView.js").NavView;

const InkFile = require("./inkFile.js").InkFile;
const LiveCompiler = require("./liveCompiler.js").LiveCompiler;

// -----------------------------------------------------------------
// InkProject
// -----------------------------------------------------------------

InkProject.events = {};
InkProject.currentProject = null;

function InkProject(mainInkFilePath) {
    this.files = [];
    this.hasUnsavedChanges = false;
    this.unsavedFiles = [];

    this.mainInk = null;
    this.mainInk = this.createInkFile(mainInkFilePath || null);

    this.showInkFile(this.mainInk);

    this.startFileWatching();
}

InkProject.prototype.createInkFile = function(path) {
    var inkFile = new InkFile(path || null, this.mainInk, {
        fileChanged: () => { 
            if( inkFile.hasUnsavedChanges && !this.unsavedFiles.contains(inkFile) ) {
                this.unsavedFiles.push(inkFile);
                this.refreshUnsavedChanges();
            }

            // When a file is changed, its state may change to have unsaved changes,
            // which should be reflected in the sidebar (unsaved files are bold)
            this.refreshIncludes();
        },

        // Called when InkFile finds an INCUDE line in the contents of the file
        includesChanged: () => {         
            this.refreshIncludes();
            if( inkFile.includes.length > 0  )
                NavView.initialShow();
        }
    });

    this.files.push(inkFile);

    return inkFile;
}

InkProject.prototype.addNewInclude = function(newIncludePath, addToMainInk) {

    var newIncludeFile = this.createInkFile(newIncludePath || null);

    if( addToMainInk )
        this.mainInk.addIncludeLine(newIncludeFile.relativePath());

    NavView.setFiles(this.mainInk, this.files);
    return newIncludeFile;
}

// - Mark old includes as spare if they're no longer included
// - Load any newly discovered includes
// - Refresh nav hierarchy in sidebar
InkProject.prototype.refreshIncludes = function() {

    var allIncludes = [];
    var rootDirectory = path.dirname(this.mainInk.path);

    var existingFilePaths = _.map(_.without(this.files, this.mainInk), (f) => f.path);

    var pathsFromINCLUDEs = [];
    var addIncludePathsFromFile = (inkFile) => {
        if( !inkFile.includes )
            return;

        inkFile.includes.forEach(incPath => {
            var absPath = path.join(rootDirectory, incPath);
            pathsFromINCLUDEs.push(absPath);

            var recurseInkFile = this.inkFileWithRelativePath(incPath);
            if( recurseInkFile )
                addIncludePathsFromFile(recurseInkFile);
        });
    }
    addIncludePathsFromFile(this.mainInk);

    // Includes that we don't have in this.files yet that are mentioned in other files
    var includesToLoad = _.difference(pathsFromINCLUDEs, existingFilePaths)

    // Files that are in this.files that aren't actually mentioned anywhere
    var spareFilePaths = _.difference(existingFilePaths,  pathsFromINCLUDEs);

    // Mark files that are spare, and remove those that aren't needed at all
    var filesToRemove = [];
    this.files.forEach(f => {
        f.isSpare = spareFilePaths.indexOf(f.path) != -1;

        // Remove brand new files that aren't included anywhere - otherwise they're spare
        if( f.isSpare && f.brandNewEmpty )
            filesToRemove.push(f);
    });
    this.files = _.difference(this.files, filesToRemove);

    includesToLoad.forEach(newIncludePath => this.createInkFile(newIncludePath));

    NavView.setFiles(this.mainInk, this.files);
}

InkProject.prototype.refreshUnsavedChanges = function() {

    this.hasUnsavedChanges = this.unsavedFiles.length > 0;

    // Update NavView for whether files are bold or not
    // TODO: This could be faster if it simply refreshes the state rather than
    // rebuilding the entire nav view hierarchy
    NavView.setFiles(this.mainInk, this.files);

    // Overall, are there *any* unsaved changes, and has the state changed?
    // Change the dot in the Mac close window button
    remote.getCurrentWindow().setDocumentEdited(this.hasUnsavedChanges);
}

InkProject.prototype.startFileWatching = function() {
    if( !this.mainInk.path || !path.isAbsolute(this.mainInk.path) )
        return;

    if( this.fileWatcher )
        this.fileWatcher.close();

    var rootDir = path.dirname(this.mainInk.path);
    var watchPath = path.join(rootDir, "**/*.ink");
    this.fileWatcher = chokidar.watch(watchPath);

    this.fileWatcher.on("add", newlyFoundFilePath => {
        var relPath = path.relative(rootDir, newlyFoundFilePath);
        var existingFile = _.find(this.files, f => f.relativePath() == relPath);
        if( !existingFile ) {
            console.log("Watch found new file - creating it: "+relPath);
            this.createInkFile(newlyFoundFilePath);

            // TODO: Find a way to refresh includes without spamming it
            this.refreshIncludes();
        } else {
            console.log("Watch found file but it already existed: "+relPath);
        }
    });

    this.fileWatcher.on("change", updatedFilePath => {
        var relPath = path.relative(rootDir, updatedFilePath);
        var inkFile = _.find(this.files, f => f.relativePath() == relPath);
        if( inkFile ) {
            // TODO: maybe ask user if they want to overwrite? not sure I want to though
            if( !inkFile.hasUnsavedChanges )
                inkFile.tryLoadFromDisk();
        }
    });
    this.fileWatcher.on("unlink", removedFilePath => {
        var relPath = path.relative(rootDir, removedFilePath);
        var inkFile = _.find(this.files, f => f.relativePath() == relPath);
        if( inkFile ) {
            if( !inkFile.hasUnsavedChanges && inkFile != this.mainInk ) {
                this.deleteInkFile(inkFile);
            }
        }
    });
}

InkProject.prototype.showInkFile = function(inkFile) {

    if( _.isString(inkFile) )
        inkFile = this.inkFileWithRelativePath(inkFile);

    if( inkFile && inkFile != this.activeInkFile ) {
        this.activeInkFile = inkFile;
        EditorView.showInkFile(inkFile);
        InkProject.events.didSwitchToInkFile(this.activeInkFile);
    }
}

InkProject.prototype.save = function() {

    var wasUnsaved = !this.mainInk.path;

    var filesRemaining = this.files.length;
    var includeFiles = _.filter(this.files, f => f != this.mainInk);

    var allSuccess = true;

    var singleFileSaveComplete = (file, success) => {
        allSuccess = allSuccess && success;
        if( success ) this.unsavedFiles.remove(file);

        filesRemaining--;
        if( filesRemaining == 0 ) {
            this.refreshUnsavedChanges();

            if( allSuccess )
                InkProject.events.didSave();
        }
    }

    // Save main ink to ensure the other files have a base directory path
    this.mainInk.save(success => {
        singleFileSaveComplete(this.mainInk, success);

        // May not be a success if cancelled, in which case we stop early
        if( success ) {

            if( wasUnsaved ) this.startFileWatching();

            includeFiles.forEach(f => f.save(success => singleFileSaveComplete(f, success)));
        }
    });
}

InkProject.prototype.exportJson = function() {

    if( !this.defaultExportPath && this.mainInk.path && path.isAbsolute(this.mainInk.path) ) {
        var pathObj = path.parse(this.mainInk.path);
        pathObj.ext = ".json";
        this.defaultExportPath = path.format(pathObj);
    }

    dialog.showSaveDialog(remote.getCurrentWindow(), { 
        filters: [
            { name: 'JSON files', extensions: ['json'] }
        ],
        defaultPath: this.defaultExportPath
    }, (jsonPath) => {
        if( jsonPath ) { 
            LiveCompiler.exportJson(jsonPath);
            this.defaultExportPath = jsonPath;
        }
    });
}

InkProject.prototype.tryClose = function() {
    if( this.hasUnsavedChanges ) {
        dialog.showMessageBox(remote.getCurrentWindow(), {
            type: "warning",
            message: "Would you like to save changes before exiting?",
            detail: "Your changes will be lost if you don't save.",
            buttons: [
                "Save",
                "Don't save",
                "Cancel"
            ],
            defaultId: 0
        }, (response) => {
            // Save
            if( response == 0 ) {
                this.save(false, () => {
                    this.closeImmediate();
                });
            }

            // Don't save
            else if( response == 1 ) {
                this.closeImmediate();
            }

            // Cancel
            else { 
                ipc.send("project-cancelled-close");
            }
        });
    } 

    // Nothing to save, just exit
    else {
        this.closeImmediate();
    }
}

InkProject.prototype.closeImmediate = function() {
    ipc.send("project-final-close");
}

InkProject.prototype.inkFileWithRelativePath = function(relativePath) {
    return _.find(this.files, f => f.relativePath() == relativePath);
}

InkProject.prototype.inkFileWithId = function(id) {
    return _.find(this.files, f => f.id == id);
}

InkProject.prototype.deleteInkFile = function(inkFile) {

    if( this.activeInkFile == inkFile )
        this.showInkFile(this.mainInk);

    inkFile.deleteFromDisk();

    this.files.remove(inkFile);

    NavView.setFiles(this.mainInk, this.files);
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

ipc.on("set-project-main-ink-filepath", (event, filePath) => {
    InkProject.loadProject(filePath);
});

ipc.on("project-new-include", () => {
    if( InkProject.currentProject ) {
        NavView.show();
        NavView.showAddIncludeForm();
    }
});

ipc.on("project-save", (event) => {
    if( InkProject.currentProject ) {
        InkProject.currentProject.save();
    }
});

ipc.on("project-export", (event) => {
    if( InkProject.currentProject ) {
        InkProject.currentProject.exportJson();
    }
});

ipc.on("project-tryClose", (event) => {
    if( InkProject.currentProject ) {
        InkProject.currentProject.tryClose();
    }
});


exports.InkProject = InkProject;