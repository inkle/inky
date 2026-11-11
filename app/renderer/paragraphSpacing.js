"use strict";

// Preserve blank source lines as a private Ink tag in the temporary compiler
// copy. The author's source remains untouched. Replacing a blank physical line
// keeps diagnostics and source navigation aligned with the original file.
const MARKER = "__inky_paragraph_gap__";
const MARKER_LINE = "# " + MARKER;
const NOT_NARRATIVE = /^(?:\/\/|\/\*|\*\/|\*|\+|\-|->|<-|=|#|~|\{|\}|\[|<>|VAR\b|CONST\b|LIST\b|EXTERNAL\b|INCLUDE\b|TODO\b|END\b|DONE\b)/i;

function narrative(line, inComment) {
    if( inComment || !line.trim() ) return false;
    const trimmed = line.trim();
    if( NOT_NARRATIVE.test(trimmed) || trimmed.includes("/*") || trimmed.includes("*/") ) return false;
    // Ink glue joins physical lines and should never be interrupted by a tag.
    if( trimmed.startsWith("<>") || trimmed.endsWith("<>") ) return false;
    return true;
}

function commentStates(lines) {
    let inComment = false;
    return lines.map(line => {
        const startsInComment = inComment;
        for( let i = 0; i < line.length - 1; i++ ) {
            if( !inComment && line.slice(i, i + 2) === "//" ) break;
            if( !inComment && line.slice(i, i + 2) === "/*" ) { inComment = true; i++; }
            else if( inComment && line.slice(i, i + 2) === "*/" ) { inComment = false; i++; }
        }
        return startsInComment || inComment;
    });
}

function annotate(text) {
    if( typeof text !== "string" || !text ) return text;
    const parts = text.split(/(\r\n|\n|\r)/);
    const lines = parts.filter((_, i) => i % 2 === 0);
    const comments = commentStates(lines);

    for( let i = 1; i < lines.length - 1; i++ ) {
        if( lines[i].trim() ) continue;
        const firstBlank = i;
        while( i + 1 < lines.length && !lines[i + 1].trim() ) i++;
        const next = i + 1;
        if( next >= lines.length || firstBlank === 0 ) continue;
        const previous = firstBlank - 1;
        if( !narrative(lines[previous], comments[previous]) ||
            !narrative(lines[next], comments[next]) ||
            comments.slice(firstBlank, next).some(Boolean) ) continue;
        const indentation = line => (line.match(/^[ \t]*/) || [""])[0];
        if( indentation(lines[previous]) !== indentation(lines[next]) ) continue;
        parts[i * 2] = indentation(lines[next]) + MARKER_LINE;
    }
    return parts.join("");
}

module.exports = { MARKER, annotate };
