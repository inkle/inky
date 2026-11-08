"use strict";

// "#" + Tab opens the list of the tags that really do something, in alphabetical order.
//   - Up / Down move through the list (it starts on the first tag).
//   - A letter keeps only the tags that start with what was typed.
//   - A letter that starts no tag is not typed at all; if it is the first one, the list closes.
//   - Enter writes the selected tag ("#music: ").
// "#" is reserved for these tags: after it, a character that cannot lead to one of them is never
// typed, with or without the list (so "#aaa" cannot be written).
// A tag whose value is a file of the project (#bg, #image, #music, #sound) shows the matching
// category list as soon as the writer stops after "#tag: "; no first letter is needed to see the files.
// Tab right after "#bg:", "#image:", "#music:" or "#sound:" (the space is optional) opens that same list,
// for a tag written by hand.
// The Ace autocomplete draws the list; this module only decides when it opens and which keys count.

const TagFormat = require("./tagFormat.js").TagFormat;
const path = require("path");
const { listUsableAudioFiles, AUDIO_EXTENSIONS } = require("./audioTags.js");
const { listUsableImageFiles } = require("./imageTags.js");
const { IMAGE_EXTENSIONS } = require("./imageTypes.js");

const TAG_REGISTRY = {
    align: { kind: "fixed", values: ["left", "center", "right"] },
    "choice-align": { kind: "fixed", values: ["left", "center", "right"] },
    bg: { kind: "image", values: [] },
    image: { kind: "image", values: [] },
    music: { kind: "audio", values: ["stop"], label: "stop music" },
    sound: { kind: "audio", values: ["stop"], label: "parar efeitos" },
    screen: { kind: "flag", values: [] },
    title: { kind: "text", values: [] }
};
const TAG_NAMES = Object.keys(TAG_REGISTRY).sort();
const FILE_VALUE_TAGS = TAG_NAMES.filter(name => TAG_REGISTRY[name].kind === "image" || TAG_REGISTRY[name].kind === "audio");

function valuesForTag(tag, projectDir) {
    const definition = TAG_REGISTRY[String(tag || "").toLowerCase()];
    if( !definition ) return [];
    if( definition.kind === "fixed" ) return definition.values.slice();
    if( definition.kind === "image" ) return projectDir ? listUsableImageFiles(projectDir, tag === "bg" ? "background" : "image") : [];
    if( definition.kind === "audio" ) {
        const files = projectDir ? listUsableAudioFiles(projectDir, tag === "music" ? "music" : "sound") : [];
        return definition.values.concat(files);
    }
    return [];
}

function isAtomicValue(tag, value, projectDir) {
    const name = String(tag || "").toLowerCase();
    const definition = TAG_REGISTRY[name];
    if( !definition ) return false;
    value = String(value == null ? "" : value).trim();
    if( !value ) return false;
    if( valuesForTag(name, projectDir).indexOf(value) !== -1 ) return true;
    if( definition.kind === "image" )
        return IMAGE_EXTENSIONS.indexOf(path.extname(value).toLowerCase()) !== -1;
    if( definition.kind === "audio" )
        return AUDIO_EXTENSIONS.indexOf(path.extname(value.replace(/\\/g, "/")).toLowerCase()) !== -1;
    return false;
}

function lineTagAt(lines, row, column) {
    const line = lines[row] || "";
    let hash = column > 0 ? line.lastIndexOf("#", column - 1) : -1;
    while( hash !== -1 ) {
        if( (hash === 0 || /\s/.test(line[hash - 1])) &&
            !(hash > 0 && line[hash - 1] === "\\") &&
            TagFormat.isCodeAt(lines, row, hash) ) {
            const afterHash = line.slice(hash);
            const nameMatch = /^#\s*([\w-]*)/.exec(afterHash);
            const name = nameMatch[1].toLowerCase();
            const exact = Object.prototype.hasOwnProperty.call(TAG_REGISTRY, name);
            const partial = !name || TAG_NAMES.some(tag => tag.indexOf(name) === 0);
            if( exact || partial ) {
                const colonMatch = exact
                    ? new RegExp("^#\\s*" + name.replace("-", "\\-") + "[ \\t]*:[ \\t]*", "i").exec(afterHash)
                    : null;
                let rawEnd = line.length;
                for( let i = hash + (nameMatch[0].length || 1); i < line.length; i++ ) {
                    if( line[i] === "\\" ) { i++; continue; }
                    if( line[i] === "#" || line.slice(i, i + 2) === "//" || line.slice(i, i + 2) === "/*" ) {
                        rawEnd = i;
                        break;
                    }
                }
                let end = rawEnd;
                while( end > hash && /\s/.test(line[end - 1]) ) end--;
                if( column >= hash && column <= rawEnd ) {
                    const valueStart = colonMatch ? hash + colonMatch[0].length : null;
                    const colonEnd = colonMatch ? hash + colonMatch[0].lastIndexOf(":") + 1 : null;
                    const value = valueStart === null ? "" : line.slice(valueStart, end);
                    return {
                        row, hash, name, exact, partial: !exact, hasColon: !!colonMatch,
                        valueStart, colonEnd, valueEnd: end, rawEnd, value,
                        state: !name ? "E2" : !exact || !colonMatch ? "E4"
                            : !value.trim() ? "E1"
                            : isAtomicValue(name, value, null) ? "E0" : "E4"
                    };
                }
            }
        }
        hash = line.lastIndexOf("#", hash - 1);
    }
    return null;
}

// What follows "#" on this line, when the cursor is right after a tag's "#"; otherwise null.
function typedAfterHash(line, column) {
    const before = line.slice(0, column);
    const hash = before.lastIndexOf("#");
    if( hash === -1 || before[hash - 1] === "\\" ) return null;
    if( before.slice(0, hash).indexOf("//") !== -1 ) return null;
    const typed = before.slice(hash + 1);
    return /^[\w-]*$/.test(typed) ? typed : null;
}

function startsSomeTag(text) {
    return TAG_NAMES.some(name => name.indexOf(text) === 0);
}

// The tags whose value is a file of the project: as soon as one of them is written, the whole
// list of the files that can be used opens.
const FILE_TAG_AT_CARET = new RegExp("(?:^|\\s)#(" + FILE_VALUE_TAGS.join("|") + "): $", "i");

// The file tag waiting for its value at (line, column), when the cursor sits right after the
// canonical "#tag: "; otherwise null.
function fileTagAwaitingValue(line, column) {
    const match = FILE_TAG_AT_CARET.exec(line.slice(0, column));
    return match ? match[1].toLowerCase() : null;
}

// The same, for Tab: the cursor sits right after "#tag:" with or without the space that follows it.
const FILE_TAG_BEFORE_TAB = new RegExp("(?:^|\\s)#(" + FILE_VALUE_TAGS.join("|") + "):( ?)$", "i");

// "bg", "image", "music" or "sound" (and whether the space is already there) when the cursor sits right
// after such a tag; otherwise null.
function fileTagBeforeTab(line, column) {
    const match = FILE_TAG_BEFORE_TAB.exec(line.slice(0, column));
    return match ? { tag: match[1].toLowerCase(), hasSpace: match[2] === " " } : null;
}

function install(editor, completer) {
    let isolated = false;
    let savedCompleters = null;
    let listaOculta = false;

    // While a tag is being written, nothing but the story tags may feed the list (no keywords
    // such as CONST, INCLUDE, END...). The other completers come back when the tag is over.
    function isolate() {
        if( isolated ) return;
        isolated = true;
        completer.tagPicking = true;
        savedCompleters = editor.completers;
        editor.completers = [completer];
    }
    function release() {
        if( !isolated ) return;
        isolated = false;
        completer.tagPicking = false;
        if( savedCompleters ) { editor.completers = savedCompleters; savedCompleters = null; }
    }
    const popupOpen = () => !!(editor.completer && editor.completer.activated);
    const closeList = () => { if( popupOpen() ) editor.completer.detach(); };

    function open() {
        isolate();
        editor.execCommand("startAutocomplete");
    }

    // The files of the project, and nothing else: the ink keywords and the snippets that live
    // completion would mix in are kept out while the list is gathered (the story completer
    // answers at once, so the other completers come back as soon as the list is on the screen).
    function openFileList() {
        if( popupOpen() ) return;
        release();
        const allCompleters = editor.completers;
        editor.completers = [completer];
        try { editor.execCommand("startAutocomplete"); }
        finally { editor.completers = allCompleters; }
    }

    function currentTag() {
        if( !editor.selection.isEmpty() ) return false;
        const cursor = editor.getCursorPosition();
        return lineTagAt(editor.session.doc.getAllLines(), cursor.row, cursor.column);
    }

    function canPickValues(tag) {
        const definition = tag && TAG_REGISTRY[tag.name];
        return !!(tag && tag.exact && tag.hasColon && definition && definition.kind !== "text");
    }

    function openValueList(refresh) {
        listaOculta = false;
        if( popupOpen() && !refresh ) return;
        closeList();
        release();
        const allCompleters = editor.completers;
        editor.completers = [completer];
        try { editor.execCommand("startAutocomplete"); }
        finally { editor.completers = allCompleters; }
    }

    function openTagList() {
        listaOculta = false;
        closeList();
        open();
    }

    function markUndoBoundary() {
        if( editor.session.markUndoGroup ) editor.session.markUndoGroup();
    }

    function removeRange(row, start, end) {
        if( start >= end ) return;
        markUndoBoundary();
        editor.session.doc.remove({ start: { row, column: start }, end: { row, column: end } });
    }

    // Wait until the edit finishes, then derive the tag state from the current line.
    editor.on("change", change => {
        setImmediate(() => {
            if( !editor.getOption("enableBasicAutocompletion") ) return;
            if( listaOculta || editor.inMultiSelectMode ) return;
            const tag = currentTag();
            if( !canPickValues(tag) || tag.state === "E0" ) return;
            if( change && change.action === "remove" ) {
                const removed = (change.lines || []).join("\n");
                if( removed.length !== 1 ) return;
            }
            openValueList();
        });
    });

    // What follows the "#" at the cursor, when the cursor is right after a tag's "#" in story code.
    function tagContext() {
        const cursor = editor.getCursorPosition();
        const typed = typedAfterHash(editor.session.getLine(cursor.row), cursor.column);
        if( typed === null ) return null;
        if( !TagFormat.isCodeAt(editor.session.doc.getAllLines(), cursor.row, cursor.column) ) return null;
        return typed;
    }

    // Tab after a file tag written by hand: add the missing space, then show the whole list.
    function fileTagUnderTab() {
        if( !editor.selection.isEmpty() ) return null;
        const cursor = editor.getCursorPosition();
        const found = fileTagBeforeTab(editor.session.getLine(cursor.row), cursor.column);
        if( !found ) return null;
        if( !TagFormat.isCodeAt(editor.session.doc.getAllLines(), cursor.row, cursor.column) ) return null;
        return found;
    }

    const handler = {
        handleKeyboard: function(data, hashId, keyString, keyCode, event) {
            if( editor.inMultiSelectMode || !editor.selection.isEmpty() || (event && event.isComposing) ) return null;

            const tag = currentTag();
            const isTagContext = !!tag;

            if( hashId === 0 && keyString === "esc" && isTagContext && popupOpen() ) {
                listaOculta = true;
                closeList();
                return { command: "null" };
            }

            if( hashId === 1 && keyString === "backspace" && isTagContext ) {
                return { command: { name: "removeWholeTag", exec: () => {
                    const line = editor.session.getLine(tag.row);
                    const previousTag = lineTagAt(editor.session.doc.getAllLines(), tag.row, tag.hash - 1);
                    const start = tag.hash > 0 && /\s/.test(line[tag.hash - 1]) &&
                        !(previousTag && previousTag.hash < tag.hash) ? tag.hash - 1 : tag.hash;
                    removeRange(tag.row, start, tag.state === "E1" ? tag.valueStart : tag.valueEnd);
                    closeList();
                    release();
                    listaOculta = false;
                } } };
            }

            if( hashId === 0 && (keyString === "backspace" || keyString === "delete") && isTagContext ) {
                if( keyString === "backspace" ) listaOculta = false;
                if( tag.state === "E0" ) {
                    return { command: { name: keyString === "backspace" ? "removeTagValue" : "deleteTagValue", exec: () => {
                        removeRange(tag.row, tag.valueStart, tag.valueEnd);
                        if( keyString === "backspace" && canPickValues(tag) ) openValueList(true);
                    } } };
                }
                if( keyString === "backspace" && tag.state === "E1" ) {
                    return { command: { name: "removeTagName", exec: () => {
                        removeRange(tag.row, tag.hash + 1, tag.valueStart);
                        openTagList();
                    } } };
                }
                if( keyString === "backspace" && tag.state === "E2" ) {
                    closeList();
                    release();
                    return null;
                }
                // Flag tags (such as #screen) have no colon or value. Treat the whole
                // name as atomic just like a completed "#tag: " name, retaining "#"
                // and reopening tag-name completion after one Backspace.
                if( keyString === "backspace" && tag.exact && !tag.hasColon &&
                    TAG_REGISTRY[tag.name].kind === "flag" ) {
                    const cursor = editor.getCursorPosition();
                    const line = editor.session.getLine(tag.row);
                    const flagEnd = tag.hash + /^#\s*[\w-]*/.exec(line.slice(tag.hash))[0].length;
                    if( cursor.column > tag.hash + 1 && cursor.column <= flagEnd ) {
                        return { command: { name: "removeFlagTagName", exec: () => {
                            removeRange(tag.row, tag.hash + 1, flagEnd);
                            openTagList();
                        } } };
                    }
                }
            }

            if( hashId === 0 && keyString === "tab" && !popupOpen() && editor.getOption("enableBasicAutocompletion") ) {
                listaOculta = false;
                if( canPickValues(tag) && tag.state !== "E0" ) {
                    return { command: { name: "openTagValueList", exec: () => {
                        if( tag.valueStart === tag.colonEnd ) editor.insert(" ");
                        openValueList();
                    } } };
                }
                const found = fileTagUnderTab();
                if( found ) {
                    return { command: { name: "openFileList", exec: () => {
                        if( !found.hasSpace ) editor.insert(" ");
                        openValueList();
                    } } };
                }
            }

            if( hashId === -1 && isTagContext ) listaOculta = false;

            if( hashId === -1 && keyString === " " && canPickValues(tag) &&
                tag.state === "E1" && tag.valueStart === tag.colonEnd ) {
                return { command: { name: "openTagValueList", exec: () => {
                    editor.insert(" ");
                    openValueList(true);
                } } };
            }

            const typed = tagContext();
            if( typed === null ) { release(); return null; }

            // "#" then Tab: open the list
            if( hashId === 0 && keyString === "tab" && !popupOpen() && editor.selection.isEmpty()
                && typed === "" && editor.getOption("enableBasicAutocompletion") ) {
                return { command: { name: "openTagList", exec: openTagList } };
            }

            // Backspace over the "#" ends the choice
            if( hashId === 0 && keyString === "backspace" && typed === "" ) {
                closeList();
                return null;
            }

            // "#" is reserved for tags: after it only the name of a story tag can be typed.
            if( hashId === -1 && keyString.length === 1 ) {
                const lower = keyString.toLowerCase();
                // the name is complete: ":" starts its value
                if( keyString === ":" && TAG_NAMES.indexOf(typed) !== -1 ) { closeList(); return null; }
                if( startsSomeTag(typed + lower) ) {
                    isolate();
                    if( lower === keyString ) return null;
                    return { command: { name: "typeLowerCase", exec: () => editor.execCommand("insertstring", lower) } };
                }
                if( typed === "" ) closeList();
                return { command: "null" }; // swallowed: nothing is printed after the "#"
            }
            return null;
        }
    };

    editor.keyBinding.addKeyboardHandler(handler);
    return handler;
}

exports.TagPicker = {
    TAG_REGISTRY, TAG_NAMES, FILE_VALUE_TAGS, valuesForTag, isAtomicValue, lineTagAt,
    install, typedAfterHash, fileTagAwaitingValue, fileTagBeforeTab
};
