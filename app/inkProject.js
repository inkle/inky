const path = require("path");
const fs = require("fs");

const dialog = require('electron').remote.dialog;

const Document = ace.require('ace/document').Document;
const EditSession = ace.require('ace/edit_session').EditSession;
const InkMode = require("./ace-ink-mode/ace-ink.js").InkMode;
const EditorView = require("./editorView.js").EditorView;

function InkFile(filePath) {

    this.path = filePath;

    this.aceDocument = new Document("");
    this.aceSession = null;

    if( this.path ) {
        this.filename = path.basename(this.path);
        fs.readFile(this.path, 'utf8', (err, data) => {
            this.aceDocument.setValue(data);
        });
    } else {
        this.filename = "Untitled.ink";
    }

    this.hasUnsavedChanges = false;
    this.aceDocument.on("change", () => {
        this.hasUnsavedChanges = true;
    });

    // Knots, stitches etc
    this.symbols = {};
}

InkFile.prototype.getAceSession = function() {
    if( this.aceSession == null ) {
        this.aceSession = new EditSession(this.aceDocument, new InkMode());
        this.aceSession.setUseWrapMode(true);
    }

    return this.aceSession;
}

InkFile.prototype.save = function() {
    if( !this.path ) {
        dialog.showSaveDialog((savedPath) => {
            if( savedPath ) {
                this.path = savedPath;
                this.save();
            }
        });
    } else {
        fs.writeFile(this.path, this.aceDocument.getValue(), "utf8", function() {

            // WARNING: If the async operation took a while, this will be incorrect...
            this.hasUnsavedChanges = false;
        })
    }
}

function InkProject(mainInkFilePath) {
    this.files = [];
    this.mainInk = new InkFile(mainInkFilePath || null);
    this.files.push(this.mainInk);
    this.openInkFile(this.mainInk);
}

InkProject.prototype.openInkFile = function(inkFile) {
    this.activeInkFile = this.mainInk;
    EditorView.openInkFile(this.mainInk);
}

InkProject.prototype.save = function() {
    this.activeInkFile.save();
}

exports.InkProject = InkProject;