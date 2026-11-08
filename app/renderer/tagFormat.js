"use strict";

// The one and only accepted shape of an Ink tag:
//
//   #tag: value
//
// - no space between "#" and the tag name   ("# tag: x"      -> "#tag: x")
// - no space between the name and the ":"   ("#tag : x"      -> "#tag: x")
// - exactly one space after the ":"         ("#tag:x"        -> "#tag: x")
// - a tag that sits alone on its line always starts in column 0
//   (no indentation: "     #tag: x" -> "#tag: x"). Only vertical moves are possible.
// - a scene title has one single space between its words
//   ("#title: The   Dark    Forest" -> "#title: The Dark Forest").
//
// Everything here is a pure function over text, shared by the editor, the file
// loader, the save step and the compiler, so all of them agree on the same rule.
// Comments, escaped "\#" and non-story lines (VAR, CONST, LIST, EXTERNAL, INCLUDE,
// TODO and "~" logic lines) are never touched.

const SKIPPED_LINE = /^[^\S\r\n]*(?:VAR\b|CONST\b|LIST\b|EXTERNAL\b|INCLUDE\b|TODO\b|~)/;
const TAG_HEAD = /(\\[\s\S])|#[^\S\r\n]*(?:([\w.-]+)[^\S\r\n]*:([^\S\r\n]*))?/g;

// Smallest edit that turns oldStr into newStr, placed at `offset` in the line.
function minimalEdit(offset, oldStr, newStr) {
    if( oldStr === newStr ) return null;
    var start = 0;
    while( start < oldStr.length && start < newStr.length && oldStr[start] === newStr[start] ) start++;
    var endOld = oldStr.length, endNew = newStr.length;
    while( endOld > start && endNew > start && oldStr[endOld - 1] === newStr[endNew - 1] ) { endOld--; endNew--; }
    return { from: offset + start, to: offset + endOld, text: newStr.slice(start, endNew) };
}

// Splits a line in the parts that are real story code (not inside a comment).
// Returns the parts and whether a block comment is still open at the end of the line.
function codeSegments(line, inBlock) {
    var segments = [];
    var segStart = inBlock ? -1 : 0;
    var i = 0;
    while( i < line.length ) {
        var two = line.substr(i, 2);
        if( inBlock ) {
            if( two === "*/" ) { inBlock = false; i += 2; segStart = i; continue; }
            i++;
        } else {
            if( line[i] === "\\" ) { i += 2; continue; }
            if( two === "//" ) { segments.push({ from: segStart, to: i }); segStart = -1; i = line.length; break; }
            if( two === "/*" ) { segments.push({ from: segStart, to: i }); segStart = -1; inBlock = true; i += 2; continue; }
            i++;
        }
    }
    if( segStart !== -1 ) segments.push({ from: segStart, to: line.length });
    return { segments: segments, inBlock: inBlock };
}

// Edits ({from, to, text}, columns of the original line) that make the line canonical.
function lineEdits(line, startsInBlock) {
    var edits = [];
    var scan = codeSegments(line, startsInBlock);
    if( SKIPPED_LINE.test(line) && !startsInBlock ) return { edits: edits, inBlock: scan.inBlock };

    scan.segments.forEach(function(seg) {
        var text = line.slice(seg.from, seg.to);

        // A tag alone on its line cannot be indented.
        if( seg.from === 0 && !startsInBlock ) {
            var indent = text.match(/^[^\S\r\n]+(?=#)/);
            if( indent ) edits.push({ from: 0, to: indent[0].length, text: "" });
        }

        TAG_HEAD.lastIndex = 0;
        var m;
        while( (m = TAG_HEAD.exec(text)) !== null ) {
            if( m[1] ) continue; // escaped character, e.g. \#
            var replacement;
            if( m[2] === undefined ) {
                replacement = "#";
            } else {
                var rest = text.slice(m.index + m[0].length);
                if( /^\S/.test(rest) ) replacement = "#" + m[2] + ": ";
                else replacement = "#" + m[2] + ":" + (m[3] ? " " : "");
            }
            var edit = minimalEdit(seg.from + m.index, m[0], replacement);
            if( edit ) edits.push(edit);

            // Scene title: any run of blanks inside the title becomes one single space.
            if( m[2] !== undefined && m[2].toLowerCase() === "title" ) {
                var valueStart = m.index + m[0].length;
                var valueEnd = text.length;
                for( var k = valueStart; k < text.length; k++ ) {
                    if( text[k] === "\\" ) { k++; continue; }
                    if( text[k] === "#" ) { valueEnd = k; break; }
                }
                var blanks = /[^\S\r\n]+/g, b;
                var value = text.slice(valueStart, valueEnd);
                while( (b = blanks.exec(value)) !== null ) {
                    if( b[0] !== " " ) edits.push({ from: seg.from + valueStart + b.index, to: seg.from + valueStart + b.index + b[0].length, text: " " });
                }
            }
            if( m[0].length === 0 ) TAG_HEAD.lastIndex++;
        }
    });

    return { edits: edits, inBlock: scan.inBlock };
}

function applyEdits(line, edits) {
    var out = line;
    edits.slice().sort(function(a, b) { return b.from - a.from; }).forEach(function(e) {
        out = out.slice(0, e.from) + e.text + out.slice(e.to);
    });
    return out;
}

// All edits needed for a list of lines: [{row, from, to, text}]
function documentEdits(lines) {
    var result = [];
    var inBlock = false;
    for( var row = 0; row < lines.length; row++ ) {
        var r = lineEdits(lines[row], inBlock);
        inBlock = r.inBlock;
        r.edits.forEach(function(e) { result.push({ row: row, from: e.from, to: e.to, text: e.text }); });
    }
    return result;
}

function normalizeText(text) {
    text = String(text === undefined || text === null ? "" : text);
    var parts = text.split(/(\r\n|\r|\n)/); // keep each line break exactly as it was
    var inBlock = false;
    for( var i = 0; i < parts.length; i += 2 ) {
        var r = lineEdits(parts[i], inBlock);
        inBlock = r.inBlock;
        if( r.edits.length ) parts[i] = applyEdits(parts[i], r.edits);
    }
    return parts.join("");
}

// Fixes an Ace document in place with the smallest possible edits, so the cursor stays
// where the writer left it. Returns the number of edits made.
function fixDocument(doc) {
    var edits = documentEdits(doc.getAllLines());
    for( var i = edits.length - 1; i >= 0; i-- ) {
        var e = edits[i];
        var range = { start: { row: e.row, column: e.from }, end: { row: e.row, column: e.to } };
        if( e.text === "" ) doc.remove(range);
        else if( e.from === e.to ) doc.insert(range.start, e.text);
        else doc.replace(range, e.text);
    }
    return edits.length;
}

// True when (row, column) is story code: not inside a comment and not on a VAR/CONST/...
// or "~" line, where "#" is not a tag.
function isCodeAt(lines, row, column) {
    var inBlock = false;
    for( var r = 0; r <= row && r < lines.length; r++ ) {
        var scan = codeSegments(lines[r], inBlock);
        if( r === row ) {
            if( !inBlock && SKIPPED_LINE.test(lines[r]) ) return false;
            return scan.segments.some(function(seg) { return seg.from >= 0 && column >= seg.from && column <= seg.to; });
        }
        inBlock = scan.inBlock;
    }
    return false;
}

// Every named tag of the story code ("#name: value"), up to `lastRow` (all rows when omitted):
// [{row, name, start, end, rawEnd}]. `start` is the column where the value begins (after the
// blanks that follow the colon), `rawEnd` where it stops (next "#", comment or end of line) and
// `end` is `rawEnd` without trailing blanks. A tag without a value has start === end.
function tagValues(lines, lastRow) {
    var result = [];
    var inBlock = false;
    var last = lastRow === undefined ? lines.length - 1 : Math.min(lastRow, lines.length - 1);
    for( var row = 0; row <= last; row++ ) {
        var line = lines[row];
        var startsInBlock = inBlock;
        var scan = codeSegments(line, inBlock);
        inBlock = scan.inBlock;
        if( SKIPPED_LINE.test(line) && !startsInBlock ) continue;
        scan.segments.forEach(function(seg) {
            var text = line.slice(seg.from, seg.to);
            TAG_HEAD.lastIndex = 0;
            var m;
            while( (m = TAG_HEAD.exec(text)) !== null ) {
                if( m[0].length === 0 ) { TAG_HEAD.lastIndex++; continue; }
                if( m[1] || m[2] === undefined ) continue;
                var valueStart = m.index + m[0].length;
                var valueEnd = text.length;
                for( var k = valueStart; k < text.length; k++ ) {
                    if( text[k] === "\\" ) { k++; continue; }
                    if( text[k] === "#" ) { valueEnd = k; break; }
                }
                var trimmed = valueEnd;
                while( trimmed > valueStart && /[^\S\r\n]/.test(text[trimmed - 1]) ) trimmed--;
                result.push({ row: row, name: m[2], start: seg.from + valueStart, end: seg.from + trimmed, rawEnd: seg.from + valueEnd });
            }
        });
    }
    return result;
}

exports.TagFormat = {
    tagValues: tagValues,
    isCodeAt: isCodeAt,
    normalizeText: normalizeText,
    documentEdits: documentEdits,
    fixDocument: fixDocument
};
