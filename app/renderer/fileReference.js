"use strict";

// A file reference is the value of a tag that names a file: "#image: capa.jpg",
// "#music: dark.mp3", "#sound: porta.wav". The writer either has the reference or does not:
//
// - it is never edited piece by piece: nothing can be typed, pasted or deleted inside it, and
//   nothing can be typed right before it or glued to its end;
// - Backspace anywhere in its value removes all of it (see tagPicker.js), opening the file list again;
// - a reference can only be created by picking a file the list offers;
// - removing a whole reference, or a whole line or tag that holds it, is always allowed, and so
//   are undo and redo.
//
// Any value of these tags counts, "stop" included: it is picked from the tag list as one piece.

const { TagFormat } = require("./tagFormat.js");
const { TagPicker } = require("./tagPicker.js");
const FILE_TAGS = TagPicker.FILE_VALUE_TAGS;

// The file tags of the story code, up to `lastRow`:
// [{row, tag, start, end, rawEnd, kind}] where kind is "reference" (the tag has a value)
// or "empty" (the tag waits for its file).
function fileTags(lines, lastRow) {
    const result = [];
    TagFormat.tagValues(lines, lastRow).forEach(item => {
        const tag = item.name.toLowerCase();
        if( FILE_TAGS.indexOf(tag) === -1 ) return;
        const value = item.end === item.start ? "" : lines[item.row].slice(item.start, item.end);
        const kind = !value ? "empty" : TagPicker.isAtomicValue(tag, value) ? "reference" : "incomplete";
        result.push({ row: item.row, tag: tag, start: item.start, end: item.end, rawEnd: item.rawEnd, value: value, kind: kind });
    });
    return result;
}

// The reference that ends exactly at (row, column), or null.
function referenceEndingAt(lines, row, column) {
    const found = fileTags(lines, row).filter(item => item.row === row && item.kind === "reference" && item.end === column);
    return found.length ? found[0] : null;
}

function isBefore(a, b) {
    return a.row < b.row || (a.row === b.row && a.column < b.column);
}

// May this change (an Ace delta, applied to `lines` as they are now) go through?
// isOffered(tag, name) tells whether the file list of that tag offers that name.
function allowsDelta(lines, delta, isOffered, allowPartialReferenceDelete) {
    const first = delta.start.row;
    const last = delta.action === "insert" ? delta.start.row : delta.end.row;
    let hasHash = false;
    for( let row = first; row <= last && row < lines.length; row++ ) {
        if( lines[row].indexOf("#") !== -1 ) { hasHash = true; break; }
    }
    if( !hasHash ) return true;

    const tags = fileTags(lines, last);

    if( delta.action === "insert" ) {
        const row = delta.start.row;
        const column = delta.start.column;
        const text = delta.lines;
        const firstLine = text[0];
        const multiline = text.length > 1;
        const onlyBlanks = text.every(line => /^\s*$/.test(line));
        for( let i = 0; i < tags.length; i++ ) {
            const item = tags[i];
            if( item.row !== row ) continue;
            if( item.kind === "reference" ) {
                if( column > item.start && column < item.end ) return false;
                if( column === item.start && !(onlyBlanks && !multiline) ) return false;
                if( column === item.end && !(/^[\s#]/.test(firstLine) || (multiline && firstLine === "")) ) return false;
            } else if( (item.kind === "empty" || item.kind === "incomplete") && column >= item.start && column <= item.rawEnd ) {
                if( onlyBlanks ) continue;
                if( !multiline ) continue;
                return false;
            }
        }
        return true;
    }

    for( let i = 0; i < tags.length; i++ ) {
        const item = tags[i];
        if( item.kind !== "reference" ) continue;
        const from = { row: item.row, column: item.start };
        const to = { row: item.row, column: item.end };
        if( !isBefore(from, delta.end) || !isBefore(delta.start, to) ) continue; // does not touch it
        if( allowPartialReferenceDelete && delta.action === "remove" ) continue;
        const coversIt = !isBefore(from, delta.start) && !isBefore(delta.end, to);
        if( !coversIt ) return false;
    }
    return true;
}

// Guards every document the editor shows: a change that would edit a reference is dropped
// before it reaches the text. Undo and redo are never held back.
function install(editor, completer) {
    let blocked = false;

    function guard(session) {
        const doc = session && session.doc;
        if( !doc || doc.$fileReferenceGuard ) return;
        doc.$fileReferenceGuard = true;
        const applyDelta = doc.applyDelta;
        doc.applyDelta = function(delta, doNotValidate) {
            const hasSelection = editor.selection && !editor.selection.isEmpty();
            if( !session.$fromUndo && !allowsDelta(this.getAllLines(), delta, null, hasSelection) ) {
                blocked = true;
                return;
            }
            return applyDelta.call(this, delta, doNotValidate);
        };
    }

    guard(editor.session);
    editor.on("changeSession", event => guard(event.session));

    // The live autocomplete opens on a typed letter even when the change was dropped; it only
    // stays when the cursor waits for a file.
    editor.commands.on("afterExec", () => {
        if( !blocked ) return;
        blocked = false;
        if( !editor.completer || !editor.completer.activated ) return;
        const cursor = editor.getCursorPosition();
        const waiting = fileTags(editor.session.doc.getAllLines(), cursor.row).some(item =>
            item.row === cursor.row && item.kind === "empty" && cursor.column >= item.start && cursor.column <= item.rawEnd);
        if( !waiting ) editor.completer.detach();
    });
}

exports.FileReference = {
    FILE_TAGS: FILE_TAGS,
    fileTags: fileTags,
    referenceEndingAt: referenceEndingAt,
    allowsDelta: allowsDelta,
    install: install
};
