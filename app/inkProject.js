const Document = ace.require('ace/document').Document;
const EditSession = ace.require('ace/edit_session').EditSession;
const InkMode = require("./ace-ink-mode/ace-ink.js").InkMode;
const EditorView = require("./editorView.js").EditorView;

function InkFile() {
    this.aceDocument = new Document("");
    this.path = null;

    this.hasUnsavedChanges = false;
    this.aceDocument.on("change", () => {
        this.hasUnsavedChanges = true;
    });

    // Knots, stitches etc
    this.symbols = {};
}

function InkProject() {
    this.files = [];
    this.mainInk = new InkFile();
    this.files.push(this.mainInk);
}

InkProject.prototype.testEdit = function(inkFile) {

    var session = new EditSession(inkFile.aceDocument, new InkMode());
    session.setUseWrapMode(true);

    var token = session.getTokenAt(0, 0);
    console.log("First token: ");
    console.log(token);

    EditorView.setAceSession(session);
}

exports.InkProject = InkProject;