const editor = ace.edit("editor");
const Range = ace.require("ace/range").Range;
const TokenIterator = ace.require("ace/token_iterator").TokenIterator;
const InkMode = require("./ace-ink-mode/ace-ink.js").InkMode;

var editorMarkers = [];
var editorAnnotations = [];

editor.setShowPrintMargin(false);
editor.setOptions({
    enableLiveAutocompletion: true
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

    // Have to hold down modifier key to jump
    if( !e.domEvent.altKey )
        return;

    var editor = e.editor;
    var pos = editor.getCursorPosition();
    var searchToken = editor.session.getTokenAt(pos.row, pos.column);

    if( searchToken && searchToken.type == "include.filepath" ) {
        alert("Jumping to INCLUDEs not yet supported!")
        return;
    }

    // Approximate search:
    //  - Split the search token up into its components: x.y.z
    //  - POS = clicked token
    //  - for each component:
    //       - find the *nearest* matching token to POS
    //       - POS = that matching component's pos
    //       - next component
    // Effectively it drills into the path, except that it's not
    // 100% accurate since it just tried to find the nearest, rather
    // than searching through the structure correctly.
    if( searchToken && searchToken.type == "divert.target" ) {

        e.preventDefault();

        var targetPath = searchToken.value;

        var pathComponents = targetPath.split(".");
        var foundSomeOfPath = false;

        for(var pathIdx=0; pathIdx<pathComponents.length; ++pathIdx) {

            // Remove parameters from target name
            var pathElementName = pathComponents[pathIdx];
            pathElementName = pathElementName.replace(/\([^\)]*\)/g, "");
            pathElementName = pathElementName.trim();

            function searchForName(forward) {
                var it = new TokenIterator(editor.session, pos.row, pos.column);
                for(var tok = it.getCurrentToken(); tok; forward ? tok = it.stepForward() : tok = it.stepBackward()) {
                    if( tok.type.indexOf("name") != -1 && tok.value == pathElementName ) {
                        return {
                            row: it.getCurrentTokenRow(),
                            column: it.getCurrentTokenColumn(),
                            found: true
                        };
                    }
                }
                return {
                    found: false
                };
            }

            var forwardSearchResult = searchForName(true);
            var backwardSearchResult = searchForName(false);
            var target = null;

            if( forwardSearchResult.found && backwardSearchResult.found ) {
                if( Math.abs(forwardSearchResult.row - pos.row) < Math.abs(backwardSearchResult.row - pos.row) ) {
                    target = forwardSearchResult;
                } else {
                    target = backwardSearchResult;
                }
            } else if( forwardSearchResult.found ) {
                target = forwardSearchResult;
            } else if( backwardSearchResult.found ) {
                target = backwardSearchResult;
            }

            if( target ) {
                pos = target;
                foundSomeOfPath = true;
            } else {
                break;
            }

        } // path component iteration

        if( foundSomeOfPath )
            editor.gotoLine(pos.row+1, pos.column);
    }
});

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
    onChange: (callback) => {
        editor.on("change", callback);
    },
    getValue: () => { return editor.getValue(); },
    setValue: (v) => { editor.setValue(v); },
    gotoLine: (line) => { editor.gotoLine(line); },
    addError: addError,
    openInkFile: (inkFile) => {
        editor.setSession(inkFile.getAceSession());
    }
};