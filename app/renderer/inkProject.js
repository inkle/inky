const remote = require('electron').remote;
const dialog = remote.dialog;
const ipc = require("electron").ipcRenderer;

const EditorView = require("./editorView.js").EditorView;

const InkFile = require("./inkFile.js").InkFile;

// -----------------------------------------------------------------
// InkProject
// -----------------------------------------------------------------

function InkProject(mainInkFilePath) {
    this.files = [];
    this.hasUnsavedChanges = false;

    var self = this;
    this.mainInk = new InkFile(mainInkFilePath || null, function() {
        self.refreshUnsavedChanges();
    });

    this.files.push(this.mainInk);
    this.openInkFile(this.mainInk);
}

InkProject.events = {};
InkProject.currentProject = null;

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
    var allSymbols = {};
    for(var i=0; i<this.files.length; i++) {
        var file = this.files[i];
        var fileSymbols = file.symbols.getSymbols();
        
        allSymbols = Object.assign(allSymbols, fileSymbols);
    }

    var currentScope = allSymbols;
    var nameComps = name.split(".");
    for(var i=0; i<nameComps.length; i++) {
        var comp = nameComps[i];
        var found = allSymbols[comp];
        if( found )
            currentScope = found;
        else
            break;
    }

    if( currentScope != allSymbols ){
        console.log("Found "+JSON.stringify(currentScope));
        return currentScope;
    } else {
        console.log("Failed to find symbol");
    }
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