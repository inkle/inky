const $ = window.jQuery = require('./jquery-2.2.3.min.js');
const ipc = require("electron").ipcRenderer;
require("./util.js");

const Document = ace.require('ace/document').Document;
const EditSession = ace.require('ace/edit_session').EditSession;
const Range = ace.require("ace/range").Range;
const InkMode = require("./ace-ink-mode/ace-ink.js").InkMode;

var expressionViews = [];
var events = {};

function ExpressionWatchView() {
    this.$expression = $(`
        <tr>
            <td class="expressionLabel">Every turn:</td>
            <td class="expressionInput">
                <div class="expressionEditor"></div>
                <div class="removeButton"><span class="icon icon-cancel-circled"></span></div>
            </td>
        </tr>`);
    $(".expressionWatch tbody").append(this.$expression);

    // Create input field as an ace editor so we get full syntax highlighting etc
    this.editor = ace.edit(this.$expression.find(".expressionEditor").get(0));

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

    // TODO: Find a way to set the InkMode without creating a new document and session
    const defaultContent = "x is {x}";
    var aceDocument = new Document(defaultContent);
    var aceSession = new EditSession(aceDocument, new InkMode());
    aceSession.setUseWrapMode(false);
    aceSession.setUndoManager(new ace.UndoManager());
    this.editor.setSession(aceSession);

    // Select both 'x's, ready for replacing with a different variable name
    var x1Pos = defaultContent.indexOf("x");
    var x2Pos = defaultContent.indexOf("x", 1);
    this.editor.focus();
    var selection = aceSession.getSelection();
    selection.clearSelection();
    selection.addRange(new Range(0, x1Pos, 0, x1Pos+1));
    selection.addRange(new Range(0, x2Pos, 0, x2Pos+1));

    // This works, but I'd rather set it using CSS... haven't found
    // a way to do it robustly though.
    this.editor.container.style.lineHeight = 2; // em? 2x? or what?

    this.editor.on("change", () => {
        events.change();
    });

    // Hook up remove button
    this.$expression.find(".removeButton").on("click", (event) => {
        this.$expression.remove();
        expressionViews.remove(this);
        event.preventDefault();
        events.change();
    });
}

ExpressionWatchView.prototype.getValue = function() {
    return this.editor.getValue();
}

ExpressionWatchView.prototype.focus = function() {
    return this.editor.focus();
}

ExpressionWatchView.setEvents = (e) => {
    events = e;
}

ExpressionWatchView.numberOfExpressions = () => expressionViews.length;
ExpressionWatchView.getExpression = (i) => expressionViews[i].editor.getValue();

ExpressionWatchView.totalHeight = () => $(".expressionWatch").height();

ipc.on("add-watch-expression", () => {
    var expressionWatchView = new ExpressionWatchView();
    expressionViews.push(expressionWatchView);
    events.change();
});

exports.ExpressionWatchView = ExpressionWatchView;