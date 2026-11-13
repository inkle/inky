"use strict";

// The Advanced tab edits game.yaml as text. The story title and the author (titles.story and
// titles.author) follow the same rule as the Visual form (GameStyle.normalizeTitleText): only
// single plain spaces between the words. Any number of plain spaces at the start and at the end of
// the text is allowed in the editor; readers of game.yaml (preview, export) ignore them.
//
// - a second space between words, or any other spacing character, is refused as it is typed, and
//   the cursor does not move;
// - pasted text is normalized, not refused;
// - anything else that leaves a value out of the rule (deleting the middle part, for example) is
//   collapsed before the operation ends, in the same undo step.
//
// Only the text of those two values is looked at; the rest of the file is edited freely.

const { GameStyle } = require("./gameStyle.js");

const normalize = GameStyle.normalizeTitleText;

// Text made only of spacing characters (space, tab, line break, U+00A0, invisibles...).
function isSpacing(text) {
    return text !== "" && normalize("a" + text + "b") === "a b";
}

// The text of each story/author value of the "titles:" block, as [{row, start, end}] where
// start/end are columns of the text itself: inside the quotes for a quoted value.
function titleValueRanges(lines) {
    const ranges = [];
    const first = lines.findIndex(line => /^titles\s*:\s*(#.*)?$/.test(line));
    if( first === -1 ) return ranges;
    let indent = null;
    for( let row = first + 1; row < lines.length; row++ ) {
        const line = lines[row];
        if( /^\s*(#.*)?$/.test(line) ) continue;
        const lead = line.match(/^ */)[0].length;
        if( lead === 0 ) break;
        if( indent === null ) indent = lead;
        if( lead !== indent ) continue;
        const found = line.match(/^( *)(story|author)( *: *)(.*)$/);
        if( !found ) continue;
        const valueStart = found[1].length + found[2].length + found[3].length;
        const rest = found[4];
        if( rest === "" ) continue;
        if( rest[0] === '"' || rest[0] === "'" ) {
            let close = -1;
            for( let i = 1; i < rest.length; i++ ) {
                if( rest[0] === '"' && rest[i] === "\\" ) { i++; continue; }
                if( rest[i] === rest[0] ) {
                    if( rest[0] === "'" && rest[i + 1] === "'" ) { i++; continue; }
                    close = i;
                    break;
                }
            }
            if( close === -1 ) continue;
            ranges.push({ row: row, start: valueStart + 1, end: valueStart + close });
        } else {
            const comment = rest.search(/\s+#/);
            ranges.push({ row: row, start: valueStart, end: valueStart + (comment === -1 ? rest.length : comment) });
        }
    }
    return ranges;
}

function rangeAt(lines, row, column) {
    return titleValueRanges(lines).find(range => range.row === row && column >= range.start && column <= range.end) || null;
}

// What an insertion into a value becomes: spacing alone is one space, refused ("") where it would
// make two spaces between words; other pasted text is normalized and trimmed. "" means nothing is
// inserted (a refused key).
function fitInsertion(left, text, right) {
    const valid = value => value === normalize(value, true);
    if( isSpacing(text) ) return valid(left + " " + right) ? " " : "";
    return normalize(text);
}

// null: let the change through as it is. Otherwise the insertion to make instead ("" refuses it).
function insertionFor(lines, delta) {
    if( delta.action !== "insert" ) return null;
    const text = delta.lines.join("\n");
    const range = rangeAt(lines, delta.start.row, delta.start.column);
    if( !range ) return null;
    const line = lines[range.row];
    const fitted = fitInsertion(line.slice(range.start, delta.start.column), text, line.slice(delta.start.column, range.end));
    return fitted === text ? null : fitted;
}

// Collapses the values of `rows` that are out of the rule, removing as little as possible so
// the cursor stays where it is.
function fixRows(doc, rows) {
    rows.forEach(row => {
        const ranges = titleValueRanges(doc.getAllLines()).filter(range => range.row === row);
        ranges.forEach(range => {
            const inner = doc.getLine(row).slice(range.start, range.end);
            const runs = [];
            const pattern = /[\s\u0000-\u001F\u007F-\u009F\u180E\u200B-\u200F\u2060-\u2064\u206A-\u206F\u3164\uFEFF]+/g;
            let match;
            while( (match = pattern.exec(inner)) ) runs.push({ at: match.index, text: match[0] });
            runs.reverse().forEach(run => {
                const from = range.start + run.at;
                const atEdge = run.at === 0 || run.at + run.text.length === inner.length;
                if( atEdge ) {
                    // at the ends only plain spaces stay; anything else is removed, one character at a time
                    for( let i = run.text.length - 1; i >= 0; i-- ) {
                        if( run.text[i] !== " " ) doc.remove({ start: { row: row, column: from + i }, end: { row: row, column: from + i + 1 } });
                    }
                    return;
                }
                if( run.text === " " ) return;
                const keepFirst = run.text[0] === " ";
                doc.remove({ start: { row: row, column: from + (keepFirst ? 1 : 0) }, end: { row: row, column: from + run.text.length } });
                if( !keepFirst ) doc.insert({ row: row, column: from }, " ");
            });
        });
    });
}

function isYaml(session) {
    const mode = session && session.getMode && session.getMode();
    return !!mode && mode.$id === "ace/mode/yaml";
}

function install(editor) {
    function guard(session) {
        const doc = session && session.doc;
        if( !doc || doc.$yamlTitleGuard ) return;
        doc.$yamlTitleGuard = true;
        doc.$yamlTitleRows = new Set();
        const applyDelta = doc.applyDelta;
        doc.applyDelta = function(delta, doNotValidate) {
            if( this.$yamlTitleFixing || session.$fromUndo || !isYaml(session) ) return applyDelta.call(this, delta, doNotValidate);
            const lines = this.getAllLines();
            const insertion = insertionFor(lines, delta);
            if( insertion === "" ) return;
            if( insertion !== null ) {
                delta = {
                    action: "insert",
                    start: delta.start,
                    end: { row: delta.start.row, column: delta.start.column + insertion.length },
                    lines: [insertion]
                };
            }
            for( let row = delta.start.row; row <= delta.end.row; row++ ) this.$yamlTitleRows.add(row);
            return applyDelta.call(this, delta, doNotValidate);
        };
    }

    guard(editor.session);
    editor.on("changeSession", event => guard(event.session));
    editor.on("beforeEndOperation", () => {
        const session = editor.session;
        const doc = session.doc;
        if( !doc.$yamlTitleRows || !doc.$yamlTitleRows.size ) return;
        const rows = Array.from(doc.$yamlTitleRows);
        doc.$yamlTitleRows.clear();
        if( session.$fromUndo || !isYaml(session) || !editor.curOp || !editor.curOp.docChanged ) return;
        doc.$yamlTitleFixing = true;
        try { fixRows(doc, rows); }
        finally { doc.$yamlTitleFixing = false; }
    });
}

exports.YamlTitleGuard = { titleValueRanges, fitInsertion, insertionFor, fixRows, install };
