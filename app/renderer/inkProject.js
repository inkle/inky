const remote = require('electron').remote;
const dialog = remote.dialog;
const ipc = require("electron").ipcRenderer;
const path = require("path");
const _ = require("lodash");

const EditorView = require("./editorView.js").EditorView;
const NavView = require("./navView.js").NavView;

const InkFile = require("./inkFile.js").InkFile;

// -----------------------------------------------------------------
// InkProject
// -----------------------------------------------------------------

InkProject.events = {};
InkProject.currentProject = null;

function InkProject(mainInkFilePath) {
    this.files = [];
    this.hasUnsavedChanges = false;

    this.mainInk = new InkFile(mainInkFilePath || null, inkFileEvents);
    this.files.push(this.mainInk);

    this.openInkFile(this.mainInk);
}

const inkFileEvents = {
    fileChanged: () => InkProject.currentProject.refreshUnsavedChanges(),
    includesChanged: (includes, newlyLoaded) => {         
        InkProject.currentProject.refreshIncludes();
        if( newlyLoaded && includes.length > 0 )
            NavView.show();
    }
}

InkProject.prototype.refreshIncludes = function() {

    var allIncludes = [];
    var rootDirectory = path.dirname(this.mainInk.path);

    // TODO: Make it recursive
    var existingIncludePaths = _.map(_.without(this.files, this.mainInk), (f) => f.path);
    var latestIncludePaths = _.map(this.mainInk.includes, (inc) => {
        return path.join(rootDirectory, inc);
    });

    var includesToAdd    = _.difference(latestIncludePaths, existingIncludePaths)
    var includesToRemove = _.difference(existingIncludePaths, latestIncludePaths);

    var filesToRemove = _.filter(this.files, (f) => includesToRemove.indexOf(f.path) != -1 );

    // TODO: Could iterate on the above array to process them before removal?
    this.files = _.difference(this.files, filesToRemove);

    includesToAdd.forEach((newIncludePath) => {
        var newIncludeFile = new InkFile(newIncludePath || null, inkFileEvents);
        this.files.push(newIncludeFile);
    });

    NavView.setFilePaths(this.mainInk.path, latestIncludePaths);
}

InkProject.prototype.refreshUnsavedChanges = function() {

    var prevUnsavedChanges = this.hasUnsavedChanges;

    this.hasUnsavedChanges = false;
    for(var i=0; i<this.files.length; i++) {
        var file = this.files[i];
        if( file.hasUnsavedChanges ) {
            this.hasUnsavedChanges = true;
            break;
        }
    }

    // Update window state
    if( this.hasUnsavedChanges != prevUnsavedChanges )
        remote.getCurrentWindow().setDocumentEdited(this.hasUnsavedChanges);
}

InkProject.prototype.openInkFile = function(inkFile) {
    this.activeInkFile = this.mainInk;
    EditorView.openInkFile(this.mainInk);
}

InkProject.prototype.save = function(saveAs, callback) {
    this.activeInkFile.save(() => {
        InkProject.events.didSave();
        if( callback )
            callback();
    });
}

InkProject.prototype.saveAs = function(saveAs) {
    this.activeInkFile.saveAs(() => this.events.didSave());
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
            else { }
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

InkProject.setProject = function(project) {
    InkProject.currentProject = project;
    InkProject.events.newProject();
}

ipc.on("set-project-main-ink-filepath", (event, filePath) => {
    InkProject.setProject(new InkProject(filePath));
});

ipc.on("project-save-current", (event) => {
    if( InkProject.currentProject ) {
        InkProject.currentProject.save();
    }
});

ipc.on("project-saveAs-current", (event) => {
    if( InkProject.currentProject ) {
        InkProject.currentProject.saveAs();
    }
});

ipc.on("project-tryClose", (event) => {
    if( InkProject.currentProject ) {
        InkProject.currentProject.tryClose();
    }
});


exports.InkProject = InkProject;