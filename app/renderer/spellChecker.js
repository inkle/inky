const SpellChecker = require("spellchecker");
const Range = ace.require('ace/range').Range;

const defaultDelay = 500;
const scrollCheckDelay = 2000;
const checkableTypes = [
    "text",
    "choice.weaveInsideBrackets",
    "todo",
    "comment.block.json",
    "comment.block.documentation.json",
    "comment.line.double-slash.js",
    "list-decl.item",
    "logic.inline.innerContent",
    "logic.sequence.innerContent",
    "logic.multiline.innerContent"
];

var range;
var previousCursor;
var previousVisibleRow;
var spellcheckTimerID;
var markers = {};

setInterval(() => {
    const firstVisibleRow = ace.edit("editor").getFirstVisibleRow();
    if (firstVisibleRow !== previousVisibleRow) {
        exports.spellCheck();
    }
    previousVisibleRow = firstVisibleRow;
}, scrollCheckDelay);

exports.spellCheck = function (scope, delay) {
    if (spellcheckTimerID) {
        clearTimeout(spellcheckTimerID);
    }

    delay = delay || defaultDelay;
    if (range) {
        delay = Math.max(delay, defaultDelay);
    }
    setRange(scope);

    spellcheckTimerID = setTimeout(doSpellCheck, delay);
}

function setRange(scope) {
    const editor = ace.edit("editor");
    const document = editor.getSession().getDocument();

    if (scope && scope.start && scope.end) {
        if (range) {
            range = range.extend(scope.start.row, scope.start.column);
            range = range.extend(scope.end.row, scope.end.column);
        } else {
            range = new Range(scope.start.row, scope.start.column, scope.end.row, scope.end.column);
        }
    } else if (!range) {
        const lastRow = document.getLength() - 1;
        const lastColumn = Math.max(0, document.getLine(lastRow).length - 1);
        range = new Range(0, 0, lastRow, lastColumn);
    }

    range = range.clipRows(editor.getFirstVisibleRow(), editor.getLastVisibleRow());

    while (range.end.row > 0 && range.end.column === 0) {
        const endRow = range.end.row - 1;
        range.setEnd(endRow, Math.max(0, document.getLine(endRow).length - 1));
    }
}

function doSpellCheck() {
    try {
        const editor = ace.edit("editor");
        const session = editor.getSession();
        const cursor = editor.getCursorPosition();
        const lines = session.getDocument().getLines(range.start.row, range.end.row);
        var promises = [];
        for (var i in lines) {
            if (isNaN(Number(i))) {
                continue;
            }

            const row = range.start.row + Number(i);

            // remove any previous markers for this row
            for (var markerID in markers) {
                if (markers[markerID].where.start.row === row) {
                    session.removeMarker(markerID);
                    delete markers[markerID];
                }
            }

            const line = lines[i];

            promises.push(SpellChecker.checkSpellingAsync(line).then(misspellings => {
                for (var j = 0; j < misspellings.length; j++) {
                    var where = new Range(row, misspellings[j].start, row, misspellings[j].end);

                    // don't mark in-progress words as misspelled
                    if (isTypingWord(cursor, where)) {
                        continue;
                    }

                    // only check text
                    const cursorToken = session.getTokenAt(where.start.row, where.start.column + 1);
                    if (!cursorToken || checkableTypes.indexOf(cursorToken.type) === -1) {
                        continue;
                    }

                    // anchor the marker in the document
                    where.start = session.doc.createAnchor(where.start);
                    where.end = session.doc.createAnchor(where.end);

                    var markerID = session.addMarker(where, "ace-misspelled", "typo", false);
                    const word = line.substring(misspellings[j].start, misspellings[j].end);
                    markers[markerID] = { where: where, word: word };
                }
            }));

            Promise.all(promises).then(_ => previousCursor = cursor);
        }
    } finally {
        range = undefined;
        spellcheckTimerID = undefined;
    }
}

function isTypingWord(cursor, where) {
    return where.isEnd(cursor.row, cursor.column) &&
        (!previousCursor ||
            (previousCursor.row === cursor.row && previousCursor.column === cursor.column - 1));
}

exports.getSuggestions = function(pos) {
    var suggestions;
    for (var markerID in markers) {
        if (markers[markerID].where.contains(pos.row, pos.column)) {
            suggestions = SpellChecker.getCorrectionsForMisspelling(markers[markerID].word);
            suggestions = suggestions.map(word => {
                return {
                    word: word,
                    where: markers[markerID].where
                }
            });
            break;
        }
    }
    return suggestions;
}