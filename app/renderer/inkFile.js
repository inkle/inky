const path = require("path");
const fs = require("fs");

const remote = require('electron').remote;
const dialog = remote.dialog;

const InkFileSymbols = require("./inkFileSymbols.js").InkFileSymbols;

const Document = ace.require('ace/document').Document;
const EditSession = ace.require('ace/edit_session').EditSession;
const InkMode = require("./ace-ink-mode/ace-ink.js").InkMode;

// -----------------------------------------------------------------
// InkFile
// -----------------------------------------------------------------

function InkFile(filePath, events) {

    this.path = filePath;
    this.events = events;

    this.aceDocument = new Document("");
    this.aceSession = null;

    this.includes = [];
    this.newlyLoaded = true;

    this.symbols = new InkFileSymbols(this, {
        includesChanged: (includes) => {
            this.includes = includes.slice();
            this.events.includesChanged(this.includes, this.newlyLoaded);
        }
    });

    if( this.path ) {
        fs.readFile(this.path, 'utf8', (err, data) => {

            this.newlyLoaded = true;

            this.aceDocument.setValue(data);
            this.hasUnsavedChanges = false;
            this.events.fileChanged();

            // Force immediate symbol re-parse (rather than the lazy scheduling)
            // in the newly loaded state so that we gather the includes and
            // project structure ASAP.
            this.symbols.parse();

            this.newlyLoaded = false;
        });
    }

    this.hasUnsavedChanges = false;
    this.aceDocument.on("change", () => {
        this.hasUnsavedChanges = true;
        this.events.fileChanged();
    });
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
        fs.writeFile(this.path, this.aceDocument.getValue(), "utf8", () => {
            this.hasUnsavedChanges = false;
            this.events.fileChanged();
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

exports.InkFile = InkFile;
