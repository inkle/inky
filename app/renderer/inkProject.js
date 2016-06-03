const remote = require('electron').remote;
const dialog = remote.dialog;
const ipc = require("electron").ipcRenderer;
const path = require("path");
const _ = require("lodash");

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

    this.mainInk = new InkFile(mainInkFilePath || null, null, inkFileEvents);
    this.files.push(this.mainInk);

    this.openInkFile(this.mainInk);
}

const inkFileEvents = {
    fileChanged: file => { 
        var proj = InkProject.currentProject;
        if( file.hasUnsavedChanges && !proj.unsavedFiles.contains(file) ) {
            proj.unsavedFiles.push(file);
            proj.refreshUnsavedChanges();
        }

        // When a file is changed, its state may change to have unsaved changes,
        // which should be reflected in the sidebar (unsaved files are bold)
        proj.refreshIncludes();
    },
    includesChanged: (includes, newlyLoaded) => {         
        InkProject.currentProject.refreshIncludes();
        if( newlyLoaded && includes.length > 0 )
            NavView.show();
    }
}

InkProject.prototype.addNewInclude = function(newIncludePath, addToMainInk) {
    var newIncludeFile = new InkFile(newIncludePath || null, this.mainInk, inkFileEvents);
    this.files.push(newIncludeFile);

    if( addToMainInk )
        this.mainInk.addIncludeLine(newIncludeFile.relativePath());

    NavView.setFiles(this.mainInk, this.files);
    return newIncludeFile;
}

InkProject.prototype.refreshIncludes = function() {

    var allIncludes = [];
    var rootDirectory = path.dirname(this.mainInk.path);

    // TODO: Make it recursive
    var existingIncludePaths = _.map(_.without(this.files, this.mainInk), (f) => f.path);

    var latestIncludePaths = [];
    var addIncludesFromFile = (inkFile) => {
        if( !inkFile.includes )
            return;

        inkFile.includes.forEach(incPath => {
            var absPath = path.join(rootDirectory, incPath);
            latestIncludePaths.push(absPath);

            var recurseInkFile = this.inkFileWithRelativePath(incPath);
            if( recurseInkFile )
                addIncludesFromFile(recurseInkFile);
        });
    }
    addIncludesFromFile(this.mainInk);

    var includesToAdd    = _.difference(latestIncludePaths,   existingIncludePaths)
    var includesToRemove = _.difference(existingIncludePaths, latestIncludePaths);

    // Reset spare flag
    this.files.forEach(f => f.isSpare = false);

    var filesToRemove = _.filter(this.files, f => includesToRemove.indexOf(f.path) != -1 );

    // Don't remove files that have unsaved changes
    filesToRemove = _.filter(filesToRemove, f => { 
        if( f.hasUnsavedChanges ) 
            f.isSpare = true;
        return !f.hasUnsavedChanges;
    });

    // TODO: Could iterate on the above array to process them before removal?
    this.files = _.difference(this.files, filesToRemove);

    includesToAdd.forEach((newIncludePath) => {
        var newIncludeFile = new InkFile(newIncludePath || null, this.mainInk, inkFileEvents);
        this.files.push(newIncludeFile);
    });

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

InkProject.prototype.openInkFile = function(inkFile) {

    if( _.isString(inkFile) )
        inkFile = this.inkFileWithRelativePath(inkFile);

    if( inkFile && inkFile != this.activeInkFile ) {
        this.activeInkFile = inkFile;
        EditorView.openInkFile(inkFile);
        InkProject.events.changeOpenInkFile(this.activeInkFile);
    }
}

InkProject.prototype.save = function() {
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
        if( success )
            includeFiles.forEach(f => f.save(success => singleFileSaveComplete(f, success)));
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