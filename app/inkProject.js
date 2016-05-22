const Document = ace.require('ace/document').Document;
const EditSession = ace.require('ace/edit_session').EditSession;
const InkMode = require("./ace-ink-mode/ace-ink.js").InkMode;
const EditorView = require("./editorView.js").EditorView;

function InkProject() {
    this.documents = [];
    var doc1 = new Document("Hello world this is ink file 1");
    var doc2 = new Document("== knot ==\nA knot\n-> DONE");

    this.documents.push(doc1);
    this.documents.push(doc2);
}

InkProject.prototype.testEdit = function(docIndex) {
    var doc = this.documents[docIndex];
    
    var session = new EditSession(doc, new InkMode());
    session.setUseWrapMode(true);

    var token = session.getTokenAt(0, 0);
    console.log("First token: ");
    console.log(token);

    EditorView.setAceSession(session);
}



exports.InkProject = InkProject;