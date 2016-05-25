const path = require("path");
const fs = require("fs");

const remote = require('electron').remote;
const dialog = remote.dialog;
const ipc = require("electron").ipcRenderer;

const Document = ace.require('ace/document').Document;
const EditSession = ace.require('ace/edit_session').EditSession;
const InkMode = require("./ace-ink-mode/ace-ink.js").InkMode;
const EditorView = require("./editorView.js").EditorView;

// -----------------------------------------------------------------
// InkFile
// -----------------------------------------------------------------

function InkFile(filePath, changeCallback) {

    this.path = filePath;
    this.fileChangesCallback = changeCallback;

    this.aceDocument = new Document("");
    this.aceSession = null;

    if( this.path ) {
        fs.readFile(this.path, 'utf8', (err, data) => {
            this.aceDocument.setValue(data);
            this.hasUnsavedChanges = false;
            this.fileChangesCallback();
        });
    }

    this.hasUnsavedChanges = false;
    this.aceDocument.on("change", () => {
        this.hasUnsavedChanges = true;
        this.fileChangesCallback();
    });

    // Knots, stitches etc
    this.symbols = {};
}

InkFile.prototype.filename = function() {
    return this.path ? path.basename(this.path) : "Untitled.ink";
}

InkFile.prototype.getAceSession = function() {
    if( this.aceSession == null ) {
        this.aceSession = new EditSession(this.aceDocument, new InkMode());
        this.aceSession.setUseWrapMode(true);
    }

    return this.aceSession;
}

InkFile.prototype.saveGeneral = function(saveAs, afterSaveCallback) {
    
    // Need to show save path dialog?
    if( !this.path || saveAs ) {
        var opts = {};
        if( saveAs && this.path )
            opts.defaultPath = this.path;


        dialog.showSaveDialog(remote.getCurrentWindow(), opts, (savedPath) => {
            if( savedPath ) {
                this.path = savedPath;

                // Loop back round for a quick save now we have the path
                this.save(afterSaveCallback);
            } else {
                if( afterSaveCallback )
                    afterSaveCallback(false);
            }
        });
    } 

    // Quick save to existing path
    else {
        var self = this;
        fs.writeFile(this.path, this.aceDocument.getValue(), "utf8", function() {
            self.hasUnsavedChanges = false;
            self.fileChangesCallback();
            if( afterSaveCallback )
                afterSaveCallback(true);
        })
    }
}
InkFile.prototype.save = function(callback) { 
    this.saveGeneral(false, callback); 
}
InkFile.prototype.saveAs = function(callback) { 
    this.saveGeneral(true,  callback);  
}

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