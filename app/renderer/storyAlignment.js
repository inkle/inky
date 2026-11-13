// Only story-text alignment is stored as an Ink tag (#align: left|center|right).
// Choice alignment is a game-level setting and comes exclusively from game.yaml.
const {ipcRenderer} = require("electron");
const { GameStyle } = require("./gameStyle.js");

const TEXT_VALUES = ["left", "center", "right"];

function scanHeader(lines) {
    var tags = {};
    var lastTagRow = -1;
    var inBlockComment = false;

    for(var row=0; row<lines.length; row++) {
        var t = lines[row].trim();
        if( inBlockComment ) {
            if( t.indexOf("*/") !== -1 ) inBlockComment = false;
            continue;
        }
        if( t === "" || t.indexOf("//") === 0 ) continue;
        if( t.indexOf("/*") === 0 ) {
            if( t.indexOf("*/", 2) === -1 ) inBlockComment = true;
            continue;
        }
        if( /^(VAR|CONST|LIST|EXTERNAL|INCLUDE)\b/.test(t) ) continue;
        if( t.charAt(0) === "#" ) {
            lastTagRow = row;
            var m = t.match(/^#\s*([\w-]+)\s*:\s*(.*?)\s*$/);
            if( m && m[1].toLowerCase() === "align" )
                tags.align = { row: row, value: m[2].toLowerCase() };
            continue;
        }
        break;
    }
    return { tags: tags, lastTagRow: lastTagRow };
}

function readTags(text) {
    var tag = scanHeader(String(text || "").split(/\r\n|\r|\n/)).tags.align;
    return { text: tag && TEXT_VALUES.indexOf(tag.value) !== -1 ? tag.value : null };
}

function effectiveAlignment(text) {
    var tags = readTags(text);
    var layout = GameStyle.current().layout;
    return {
        text: tags.text || layout.align,
        choice: layout.choiceAlign
    };
}

function readAlignment(text) {
    return effectiveAlignment(text);
}

function writeTextTag(inkFile, value, defaultValue) {
    var doc = inkFile.aceDocument;
    var lines = doc.getAllLines();
    var header = scanHeader(lines);
    var existing = header.tags.align;
    if( value === defaultValue ) {
        if( existing ) doc.removeFullLines(existing.row, existing.row);
        return;
    }
    var newLine = "#align: " + value;
    if( existing ) {
        doc.replace({
            start: { row: existing.row, column: 0 },
            end:   { row: existing.row, column: lines[existing.row].length }
        }, newLine);
    } else {
        doc.insertFullLines(header.lastTagRow + 1, [newLine]);
    }
}

function apply(project) {
    if( !project || !project.mainInk ) return;
    var alignment = effectiveAlignment(project.mainInk.getValue());
    var $main = window.jQuery("#main");
    $main.removeClass("textLeft textCenter textRight choicesLeft choicesCenter choicesRight");
    if( alignment.text === "left" )   $main.addClass("textLeft");
    if( alignment.text === "center" ) $main.addClass("textCenter");
    if( alignment.text === "right" )  $main.addClass("textRight");
    if( alignment.choice === "left" )   $main.addClass("choicesLeft");
    if( alignment.choice === "center" ) $main.addClass("choicesCenter");
    if( alignment.choice === "right" )  $main.addClass("choicesRight");
    ipcRenderer.send("alignment-state", alignment);
}

function setTextAlignment(project, value) {
    if( !project || !project.mainInk || TEXT_VALUES.indexOf(value) === -1 ) return;
    writeTextTag(project.mainInk, value, GameStyle.current().layout.align);
    apply(project);
}

exports.StoryAlignment = {
    readAlignment: readAlignment,
    readTags: readTags,
    effectiveAlignment: effectiveAlignment,
    apply: apply,
    setTextAlignment: setTextAlignment
};
