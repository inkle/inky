var ace = null;
var oop = null;
var TextMode = null;

function onLoad(ace_def) {
    ace = ace_def;
    oop = ace.require("ace/lib/oop");
    TextMode = ace.require("ace/mode/text").Mode;
}

function doStuff() {
    console.log(oop);
    console.log(TextMode);
}


exports.withAce = function(ace_def) {
    onLoad(ace_def);
    return {
        doStuff : doStuff
    };
};