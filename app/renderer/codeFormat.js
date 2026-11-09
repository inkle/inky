"use strict";

const { TagFormat } = require("./tagFormat.js");

// Track multiline constructs only to protect their contents. Weave indentation
// is determined by Ink's explicit *, + and - markers, never by existing spaces.
function scanLine(line, state) {
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const pair = line.slice(i, i + 2);
        if (state.comment) {
            if (pair === "*/") { state.comment = false; i++; }
            continue;
        }
        if (line[i] === "\\") { i++; continue; }
        if (line[i] === '"') { quoted = !quoted; continue; }
        if (quoted) continue;
        if (pair === "//") break;
        if (pair === "/*") { state.comment = true; i++; continue; }
        if (line[i] === "{") state.braces++;
        if (line[i] === "}") state.braces = Math.max(0, state.braces - 1);
    }
}

function formatText(text, tabSize) {
    tabSize = Number.isInteger(tabSize) && tabSize > 0 ? tabSize : 4;
    const state = { comment: false, braces: 0 };
    let depth = 0;
    return TagFormat.normalizeText(text).split(/(\r\n|\r|\n)/).map((line, index) => {
        if (index % 2) return line;
        const body = line.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
        const protectedLine = state.comment || state.braces > 0 || /^(?:\/\/|\/\*)/.test(body);
        scanLine(body, state);
        // Conditional/sequence blocks and comments retain their own layout.
        if (protectedLine || state.braces > 0) return line;
        if (!body) return "";
        if (/^#/.test(body)) return body; // Tags are deliberately locked left.
        if (/^(?:=|VAR\b|CONST\b|LIST\b|EXTERNAL\b|INCLUDE\b)/.test(body)) {
            depth = 0;
            return body;
        }
        const choice = body.match(/^(?:[+*][ \t]*)+/);
        const gather = body.match(/^(?:-[ \t]*)+(?!>)/);
        if (choice) {
            depth = (choice[0].match(/[+*]/g) || []).length;
            return " ".repeat((depth - 1) * tabSize) + body;
        }
        // A divert (-> or ->->) is content, never a gather.
        if (gather && !body.startsWith("->")) {
            depth = (gather[0].match(/-/g) || []).length - 1;
        }
        return " ".repeat(depth * tabSize) + body;
    }).join("");
}

function formatEditor(editor, Range) {
    if (editor.getReadOnly()) return false;
    const session = editor.getSession();
    const before = session.getValue();
    const after = formatText(before, session.getTabSize());
    if (before === after) return false;
    const selection = editor.selection.toJSON();
    const top = session.getScrollTop();
    const left = session.getScrollLeft();
    // Replace through Ace's session so dirty tracking and the undo history survive.
    session.markUndoGroup();
    const last = session.getLength() - 1;
    session.replace(new Range(0, 0, last, session.getLine(last).length), after);
    session.markUndoGroup();
    editor.selection.fromJSON(selection);
    session.setScrollTop(top);
    session.setScrollLeft(left);
    editor.focus();
    return true;
}

module.exports = { formatText, formatEditor };
