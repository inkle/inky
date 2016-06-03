const path = require("path");
const fs = require("fs");

const remote = require('electron').remote;
const dialog = remote.dialog;

const InkFileSymbols = require("./inkFileSymbols.js").InkFileSymbols;

const Document = ace.require('ace/document').Document;
const EditSession = ace.require('ace/edit_session').EditSession;
const InkMode = require("./ace-ink-mode/ace-ink.js").InkMode;

var fileIdCounter = 0;

// -----------------------------------------------------------------
// InkFile
// -----------------------------------------------------------------

function InkFile(filePath, mainInkFile, events) {
    
    this.id = fileIdCounter++;

    this.path = filePath;
    this.events = events;

    this.mainInkFile = mainInkFile;

    this.aceDocument = new Document("");
    this.aceSession = null;

    this.includes = [];
    this.newlyLoaded = true;
    this.brandNew = true;
    this.compilerVersionDirty = true;

    this.symbols = new InkFileSymbols(this, {
        includesChanged: (includes) => {
            this.includes = includes.slice();
            this.events.includesChanged(this.includes, this.newlyLoaded);
        }
    });

    if( this.path && path.isAbsolute(this.path) ) {

        fs.readFile(this.path, 'utf8', (err, data) => {
            if( err ) {
                console.error("Failed to load include at: "+this.path);
                return;
            }

            this.newlyLoaded = true;
            this.brandNew = false;

            this.aceDocument.setValue(data);
            this.hasUnsavedChanges = false;
            this.events.fileChanged(this);

            // Force immediate symbol re-parse (rather than the lazy scheduling)
            // in the newly loaded state so that we gather the includes and
            // project structure ASAP.
            this.symbols.parse();

            this.newlyLoaded = false;
        });
    } else {
        this.newlyLoaded = false;
    }

    this.hasUnsavedChanges = false;
    this.aceDocument.on("change", () => {
        this.hasUnsavedChanges = true;
        this.brandNew = false;
        this.compilerVersionDirty = true;
        
        if( !this.newlyLoaded ) 
            this.events.fileChanged(this);
    });
}

InkFile.prototype.isMain = function() {
    return this.mainInkFile == null;
}

InkFile.prototype.filename = function() {
    return this.path ? path.basename(this.path) : "Untitled.ink";
}

InkFile.prototype.relativePath = function() {

    // Path will be relative for unsaved files
    if( this.path && !path.isAbsolute(this.path) )
        return this.path;

    // This file is the main ink
    if( this.isMain() ) {
        return this.filename();
    }

    // This file is an include
    else {
        var mainDir = path.dirname(this.mainInkFile.path);
        return path.relative(mainDir, this.path);
    }
}

InkFile.prototype.getValue = function() {
    return this.aceDocument.getValue();
}

InkFile.prototype.setValue = function(text) {
    this.aceDocument.setValue(text);
}

InkFile.prototype.getAceSession = function() {
    if( this.aceSession == null ) {
        this.aceSession = new EditSession(this.aceDocument, new InkMode());
        this.aceSession.setUseWrapMode(true);
        this.aceSession.setUndoManager(new ace.UndoManager());
    }

    return this.aceSession;
}

InkFile.prototype.save = function(afterSaveCallback) {

    // Resolve temporary relative paths in include files
    if( (!this.path || !path.isAbsolute(this.path)) && !this.isMain() ) {
        var mainInkPath = this.mainInkFile.path;
        if( !mainInkPath || !path.isAbsolute(mainInkPath) ) {
            alert("Please save the main ink before saving this include file.")
            return;
        }
        var projectDir = path.dirname(mainInkPath);
        if( !this.path )
            this.path = this.filename();

        this.path = path.join(projectDir, this.path);
    }

    // Need to show save path dialog?
    if( !this.path ) {
        dialog.showSaveDialog(remote.getCurrentWindow(), { filters: [
            { name: 'Ink files', extensions: ['ink'] },
            { name: 'Text files', extensions: ['txt'] }
        ]}, (savedPath) => {
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
        fs.writeFile(this.path, this.aceDocument.getValue(), "utf8", (err) => {
            if( err ) 
                afterSaveCallback(false);
            else {
                this.hasUnsavedChanges = false;
                afterSaveCallback(true);
            }
        })
    }
}

InkFile.prototype.addIncludeLine = function(relativePath) {

    // Normally we allow the InkFileSymbols class to do this,
    // but by the time it gets round to doing parsing, it'll be too late.
    this.includes.push(relativePath);
    this.events.includesChanged(this.includes, this.newlyLoaded);

    // Insert the include text itself
    var includeText = "INCLUDE "+relativePath+"\n";
    var lastIncludeRow = this.symbols.getLastIncludeRow();
    if( lastIncludeRow == -1 ) {
        this.aceDocument.insert({row: 0, column: 0}, includeText);
    } else {
        var lastIncludeRowContent = this.aceDocument.getLine(lastIncludeRow);
        this.aceDocument.insert({row: lastIncludeRow, column: lastIncludeRowContent.length}, "\n" + includeText);
    }
}

exports.InkFile = InkFile;
