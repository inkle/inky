const Range = ace.require('ace/range').Range;
const preferences = require("./preferences.js");
const checkableTypes = require("./spellChecker.js").checkableTypes;

// TODO: support non en-US quotes?

exports.smarten = function (e) {
    // only continue if enabled and exactly one character or newline was added
    if (!preferences.smartQuotesAndDashes ||
        e.action !== 'insert' ||
        e.lines.length > 2 ||
        (e.lines.length === 2 && e.lines[0].length !== 0 && e.lines[1].length !== 0) ||
        (e.lines.length === 1 && e.lines[0].length !== 1)) {
        return;
    }

    // ...and only continue if we're editing text
    const session = ace.edit("editor").getSession();
    const cursorToken = session.getTokenAt(e.end.row, e.end.column);
    if (cursorToken && checkableTypes.indexOf(cursorToken.type) === -1) {
        return;
    }

    const document = session.getDocument();
    var range = new Range(e.start.row, e.start.column, e.end.row, e.end.column);
    const prevRange = new Range(e.start.row, e.start.column - 1, e.start.row, e.start.column);
    const char = document.getTextRange(range);
    const prevChar = prevRange.start.column < 0 ? '' : document.getTextRange(prevRange);

    if (prevChar === '-' && char !== '-') {
        document.replace(prevRange, '–'); // en dash
    } else if (prevChar === '.' && prevRange.start.column > 1) {
        const ellipsisRange = range.extend(prevRange.start.row, prevRange.start.column - 2);
        if (document.getTextRange(ellipsisRange) === '...' + char) {
            document.replace(ellipsisRange, '…' + char);
            range = new Range(ellipsisRange.start.row, ellipsisRange.start.column + 1, ellipsisRange.start.row, ellipsisRange.start.column + 2);
        }
    }

    switch (char) {
        case "'":
            if (prevChar === ' ' || prevChar === '') {
                document.replace(range, '‘');
            } else {
                document.replace(range, '’');
            }
            break;
        case '"':
            if (prevChar === ' ' || prevChar === '') {
                document.replace(range, '“');
            } else {
                document.replace(range, '”');
            }
            break;
        case '-':
            if (prevChar === '-') {
                range = range.extend(range.start.row, prevRange.start.column);
                document.replace(range, '—'); // em dash
            }
            break;
    }
}

function replace(document, range, replacement) {
    document.replace(suggestion.where, suggestion.word)
}