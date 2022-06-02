const path = require("path");
const fs = require("fs");
const assert = require("assert");

const {ipcRenderer} = require("electron")
const mkdirp = require('mkdirp');

const InkFileSymbols = require("./inkFileSymbols.js").InkFileSymbols;

const Document = ace.require('ace/document').Document;
const EditSession = ace.require('ace/edit_session').EditSession;

var fileIdCounter = 0;

// -----------------------------------------------------------------
// InkFile
// -----------------------------------------------------------------

// anyPath can be relative or absolute
function InkFile(anyPath, mainInkFile, isBrandNew, inkMode, events) {
    
    this.id = fileIdCounter++;
    this.inkMode = inkMode;

    // Default filename if creating a new file, and passed null to constructor
    anyPath = anyPath || "Untitled.ink";

    this.mainInkFile = mainInkFile;

    // Obtain relative path by looking at main ink file
    if( path.isAbsolute(anyPath) ) {
        if( this.isMain() ) {
            this.relPath = path.basename(anyPath);
            this.projectDir = path.dirname(anyPath);
        } else {
            assert(this.mainInkFile.projectDir, "Main ink needs to be saved before we start loading includes with absolute paths.");
            this.relPath = path.relative(this.mainInkFile.projectDir, anyPath);
        }
    } 

    // Already relative
    else {
        this.relPath = anyPath;
    }

    this.events = events;

    // Create new Inky files with a comment already embedded placeholder comment.
    // This is a temporary solution to prevent the "INCLUDE x" blank file destructive deletion
    // issue, where saving automatically created blank files prevented properly saving and
    // removed Included files without warning the user.
    var initialContent = "";
    if( mainInkFile == null ) {
        initialContent = "Once upon a time...\n\n"
            + " * There were two choices.\n"
            + " * There were four lines of content.\n\n"
            + "- They lived happily ever after.\n"
            + "    -> END\n"
    }
    this.aceDocument = new Document(initialContent);
    this.aceSession = null;

    this.includes = [];

    // Temporarily set after fs.readFile completes so
    // we don't get a double fileChanged callback before
    // we're ready for it.
    // TODO: Verify this is true - can we simplify?
    this.justLoadedContent = false;

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

    // Assume it's new by default. We then attempt to load below
    // to check for sure
    this.hasUnsavedChanges = isBrandNew;
    this.isLoading = !isBrandNew;

    // If it has an absolute path, we expect it to exist on disk
    this.tryLoadFromDisk(err => {
        if( err ) {
            this.hasUnsavedChanges = true;
            this.events.loadError(err);
        } else {
            this.hasUnsavedChanges = false;
            this.isLoading = false;
        }
    });
    
    this.aceDocument.on("change", () => {
        this.hasUnsavedChanges = true;
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
    return path.basename(this.relPath);
}

// 20/09/2016 - Now using relative paths internally.
InkFile.prototype.relativePath = function() {
    return this.relPath;
}

InkFile.prototype.absolutePath = function() {
    var mainInk = this.isMain() ? this : this.mainInkFile;

    // Unsaved - can't get absolute path?
    if( !mainInk.projectDir )
        return null;
    
    // Normal case: combine the project directory with the file's relative path.
    return path.join(mainInk.projectDir, this.relPath);
}

InkFile.prototype.getValue = function() {
    return this.aceDocument.getValue();
}

InkFile.prototype.setValue = function(text) {
    this.aceDocument.setValue(text);
}

InkFile.prototype.getAceSession = function() {
    if( this.aceSession == null ) {
        this.aceSession = new EditSession(this.aceDocument, this.inkMode);
        this.aceSession.setUseWrapMode(true);
        this.aceSession.setUndoManager(new ace.UndoManager());
    }

    return this.aceSession;
}

InkFile.prototype.save = function(afterSaveCallback) {

    assert(this.isMain() || this.mainInkFile.projectDir, "Main ink file must be saved before we can save include files.");

    // Need to show save path dialog?
    if( !this.absolutePath() ) {
        ipcRenderer.invoke("showSaveDialog", { filters: [
            { name: 'Ink files', extensions: ['ink'] },
            { name: 'Text files', extensions: ['txt'] }
        ]}).then((result) => {
            console.log(result);
            let savedPath = result.filePath;
            if( savedPath ) {

                // If we're showing a save dialog, assume we're in the main ink file
                assert(this.isMain());
                this.relPath = path.basename(savedPath);
                this.projectDir = path.dirname(savedPath);

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
        var fileContent = this.aceDocument.getValue() || "";
        
        // Ensure that the enclosing folder exists beforehand
        var fileAbsPath = this.absolutePath();
        var fileDirectory = path.dirname(fileAbsPath);
        mkdirp.sync(fileDirectory);

        fs.writeFile(fileAbsPath, fileContent, "utf8", (err) => {
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
    var absPath = this.absolutePath();
    if( absPath )
        fs.exists(absPath, (exists) => { if( exists ) fs.unlink(absPath) });
}

InkFile.prototype.tryLoadFromDisk = function(loadCallback) {

    // Only being told to load from disk because the InkProject detected
    // a change event that was our own save? Ignore it just this once.
    if( this.justSaved ) {
        this.justSaved = false;
        return;
    }

    // Simplify code below by using a fallback
    loadCallback = loadCallback || (err => {});

    var absPath = this.absolutePath();
    if( !absPath ) {
        loadCallback("File doesn't yet have a project directory");
        return;
    }

    fs.stat(absPath, (err, stats) => {
        if( err || !stats.isFile() ) { 
            loadCallback(err.message || "ink file not found");
            return;
        }

        fs.readFile(absPath, 'utf8', (err, data) => {
            if( err ) {
                console.error("Failed to load include at: "+absPath);
                loadCallback(err.message);
                return;
            }

            // Strip any BOM
            // https://en.wikipedia.org/wiki/Byte_order_mark
            data = data.replace(/^\uFEFF/, '');

            // Success - fire this callback before other callbacks 
            // like document change get fired
            loadCallback(null);

            // Temporarily set justLoadedContent to true so that
            // we don't get a double fileChanged callback before
            // we're ready for it.
            // TODO: Verify this is true - can we simplify?
            this.justLoadedContent = true;

            this.aceDocument.setValue(data);
            if( this.aceSession ) this.aceSession.setUndoManager(new ace.UndoManager());
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

InkFile.prototype.setInkMode = function(newInkMode)
{
    this.inkMode = newInkMode;

    // Don't force greedy construction right now by calling getAceSession(), instead
    // allowing it to be created whenever it's wanted elsewhere.
    if( this.aceSession ) {
        this.aceSession.setMode(this.inkMode);
    }
}

exports.InkFile = InkFile;
