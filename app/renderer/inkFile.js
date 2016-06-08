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

    // Temporarily set after fs.readFile completes so
    // we don't get a double fileChanged callback before
    // we're ready for it.
    // TODO: Verify this is true - can we simplify?
    this.justLoadedContent = false;

    // New empty file only just created by user. Used to detect
    // when unsaved, unedited files can be safely removed by the project.
    // We can't know at time of creation whether it's going to be new and empty,
    // since it might be due to the user typing "INCLUDE x". x may be a brand
    // new file, or it could be an existing file - we just have to try and load it.
    // We initially set this to false so that the project doesn't immediately
    // remove it from the project before the include link has been set up.
    this.brandNewEmpty = false;

    // Flag to detect files that have data that hasn't been saved 
    // out into the compiler's temporary directory that needs to stay
    // in sync with the (potentially unsaved) editor version.
    this.compilerVersionDirty = true;

    // Flag used to ignore a file system watch event that causes the project
    // to attempt to reload data that has just changed on disk. When the
    // save was our own, we can safely ignore it.
    this.justSaved = false;

    this.symbols = new InkFileSymbols(this, {
        includesChanged: (includes) => {
            this.includes = includes.slice();
            this.events.includesChanged();
        }
    });

    this.tryLoadFromDisk(success => {
        this.brandNewEmpty = !success;
    });

    this.hasUnsavedChanges = false;
    this.aceDocument.on("change", () => {
        this.hasUnsavedChanges = true;
        this.brandNewEmpty = false;        
        this.compilerVersionDirty = true;
        this.justSaved = false;
        
        if( !this.justLoadedContent ) 
            this.events.fileChanged();
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
        this.justSaved = true;
        fs.writeFile(this.path, this.aceDocument.getValue(), "utf8", (err) => {
            this.brandNewEmpty = false;
            if( err ) 
                afterSaveCallback(false);
            else {
                this.hasUnsavedChanges = false;
                afterSaveCallback(true);
            }
        })
    }
}

InkFile.prototype.deleteFromDisk = function() {
    if( this.path && path.isAbsolute(this.path) )
        fs.exists(this.path, (exists) => { if( exists ) fs.unlink(this.path) });
}

InkFile.prototype.tryLoadFromDisk = function(loadCallback) {

    // Only being told to load from disk because the InkProject detected
    // a change event that was our own save? Ignore it just this once.
    if( this.justSaved ) {
        this.justSaved = false;
        return;
    }

    // Simplify code below by using a fallback
    loadCallback = loadCallback || (() => {});

    if( !this.path || !path.isAbsolute(this.path) ) {
        loadCallback(false);
        return;
    }

    fs.stat(this.path, (err, stats) => {
        if( err || !stats.isFile() ) { 
            loadCallback(false);
            return;
        }

        fs.readFile(this.path, 'utf8', (err, data) => {
            if( err ) {
                console.error("Failed to load include at: "+this.path);
                loadCallback(false);
                return;
            }

            // Success - fire this callback before other callbacks 
            // like document change get fired
            loadCallback(true);

            // Temporarily set justLoadedContent to true so that
            // we don't get a double fileChanged callback before
            // we're ready for it.
            // TODO: Verify this is true - can we simplify?
            this.justLoadedContent = true;

            this.aceDocument.setValue(data);
            this.hasUnsavedChanges = false;
            this.events.fileChanged();

            // Force immediate symbol re-parse (rather than the lazy scheduling)
            // in the newly loaded state so that we gather the includes and
            // project structure ASAP.
            this.symbols.parse();

            this.justLoadedContent = false;
        });

    });
}

InkFile.prototype.addIncludeLine = function(relativePath) {

    // Normally we allow the InkFileSymbols class to do this,
    // but by the time it gets round to doing parsing, it'll be too late.
    this.includes.push(relativePath);
    this.events.includesChanged();

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
