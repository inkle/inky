const editor = ace.edit("editor");
const Range = ace.require("ace/range").Range;
const TokenIterator = ace.require("ace/token_iterator").TokenIterator;

var editorMarkers = [];
var editorAnnotations = [];

// Used when reloading files so that cursor doesn't jump back to the top
var savedCursorPos = null;
var savedScrollRow = null;

// Overriden by controller.js
var events = {
    change:         () => {},
    jumpToInclude:  () => {},
    jumpToSymbol:   () => {}
};

editor.setShowPrintMargin(false);
editor.setOptions({
    enableLiveAutocompletion: true
});
editor.on("change", () => {
    events.change();
});

/* TODO: It's possible to complete custom keywords.
   Can do this when we have them parsed from the ink file.
var staticWordCompleter = {
    getCompletions: function(editor, session, pos, prefix, callback) {
        var wordList = ["foo", "bar", "baz"];
        callback(null, wordList.map(function(word) {
            return {
                caption: word,
                value: word,
                meta: "static"
            };
        }));

    }
}
editor.completers = [staticWordCompleter];
*/

// Unfortunately standard jquery events don't work since 
// Ace turns pointer events off
editor.on("click", function(e){

    if( e.domEvent.altKey ) {
        tryClickCodeLink(e);
    } else {
        setImmediate(() => events.navigate());
    }
});

function tryClickCodeLink(event) {
    var editor = event.editor;
    var pos = editor.getCursorPosition();
    var searchToken = editor.session.getTokenAt(pos.row, pos.column);

    if( searchToken && searchToken.type == "include.filepath" ) {
        events.jumpToInclude(searchToken.value);
        return;
    }

    if( searchToken && searchToken.type == "divert.target" ) {
        event.preventDefault();
        var targetPath = searchToken.value;
        events.jumpToSymbol(targetPath, pos);
        return;
    }
}

// Unfortunately standard CSS for hover doesn't work in the editor
// since they turn pointer events off.
editor.on("mousemove", function (e) {

    var editor = e.editor;

    // Have to hold down modifier key to jump
    if( e.domEvent.altKey ) {

        var character = editor.renderer.screenToTextCoordinates(e.x, e.y);
        var token = editor.session.getTokenAt(character.row, character.column);
        if( !token )
            return;

        var tokenStartPos = editor.renderer.textToScreenCoordinates(character.row, token.start);
        var tokenEndPos = editor.renderer.textToScreenCoordinates(character.row, token.start + token.value.length);

        const lineHeight = 12;
        if( e.x >= tokenStartPos.pageX && e.x <= tokenEndPos.pageX && e.y >= tokenStartPos.pageY && e.y <= tokenEndPos.pageY+lineHeight) {
            if( token ) {
                if( token.type == "divert.target" || token.type == "include.filepath" ) {
                    editor.renderer.setCursorStyle("pointer");
                    return;
                }
            }
        }
    }
    
    editor.renderer.setCursorStyle("default");
});

function addError(error) {

    var editorErrorType = "error";
    var editorClass = "ace-error";
    if( error.type == "WARNING" ) {
        editorErrorType = "warning";
        editorClass = "ace-warning";
    }
    else if( error.type == "TODO" ) {
        editorErrorType = "information";
        editorClass = 'ace-todo';
    }

    editorAnnotations.push({
        row: error.lineNumber-1,
        column: 0,
        text: error.message,
        type: editorErrorType
    });
    editor.getSession().setAnnotations(editorAnnotations);

    var aceClass = "ace-error";
    var markerId = editor.session.addMarker(
        new Range(error.lineNumber-1, 0, error.lineNumber, 0),
        editorClass, 
        "line",
        false
    );
    editorMarkers.push(markerId);
}

function setErrors(errors) {
    clearErrors();
    errors.forEach(addError);
}

function clearErrors() {

    var editorSession = editor.getSession();
    editorSession.clearAnnotations();
    editorAnnotations = [];

    for(var i=0; i<editorMarkers.length; i++) {
        editorSession.removeMarker(editorMarkers[i]);
    }
    editorMarkers = [];
}

exports.EditorView = {
    clearErrors: clearErrors,
    setEvents: (e) => { events = e; },
    getValue: () => { return editor.getValue(); },
    setValue: (v) => { editor.setValue(v); },
    gotoLine: (row, col) => { editor.gotoLine(row, col); },
    addError: addError,
    setErrors: setErrors,
    showInkFile: (inkFile) => {
        editor.setSession(inkFile.getAceSession());
        editor.focus();
    },
    focus: () => { editor.focus(); },
    saveCursorPos: () => { 
        savedCursorPos = editor.getCursorPosition(); 
        savedScrollRow = editor.getFirstVisibleRow(); 
    },
    restoreCursorPos: () => { 
        if( savedCursorPos ) {
            editor.moveCursorToPosition(savedCursorPos); 
            editor.scrollToRow(savedScrollRow);
        } 
    }
};