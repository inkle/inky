const $ = window.jQuery = require('./jquery-2.2.3.min.js');

const Document = ace.require('ace/document').Document;
const EditSession = ace.require('ace/edit_session').EditSession;
const InkMode = require("./ace-ink-mode/ace-ink.js").InkMode;

function ExpressionWatchView() {
    this.$expression = $(`<tr><td class="expressionLabel">Every turn:</td><td class="expressionInput"></td></tr>`);
    $(".expressionWatch tbody").append(this.$expression);

    // Create input field as an ace editor so we get full syntax highlighting etc
    this.editor = ace.edit(this.$expression.children(".expressionInput").get(0));

    // Set up as single line editor
    this.editor.setOptions({
        maxLines: 1,
        autoScrollEditorIntoView: true,
        highlightActiveLine: false,
        printMargin: false,
        showGutter: false
    });

    // Prevent newlines from being entered
    this.editor.on("paste", function(e) {
        e.text = e.text.replace(/[\r\n]+/g, " ");
    });

    // disable Enter Shift-Enter keys
    this.editor.commands.bindKey("Enter|Shift-Enter", "null")

    // make mouse position clipping nicer
    this.editor.renderer.screenToTextCoordinates = function(x, y) {
        var pos = this.pixelToScreenCoordinates(x, y);
        return this.session.screenToDocumentPosition(
            Math.min(this.session.getScreenLength() - 1, Math.max(pos.row, 0)),
            Math.max(pos.column, 0)
        );
    };

    // TODO: Is there not a way to set the mode to "new InkMode()" without starting a new session?!
    var aceDocument = new Document("hello world isn't this great yes it is {x}");
    var aceSession = new EditSession(aceDocument, new InkMode());
    aceSession.setUseWrapMode(false);
    aceSession.setUndoManager(new ace.UndoManager());
    this.editor.setSession(aceSession);

    // This works, but I'd rather set it using CSS... haven't found
    // a way to do it robustly though.
    this.editor.container.style.lineHeight = 2;
}

ExpressionWatchView.prototype.getValue = function() {
    return this.editor.getValue();
}

exports.ExpressionWatchView = ExpressionWatchView;