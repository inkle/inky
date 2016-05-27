const assert = require("assert");
const TokenIterator = ace.require("ace/token_iterator").TokenIterator;

function InkFileSymbols(inkFile) {
    this.inkFile = inkFile;

    this.dirty = true;
    this.inkFile.aceDocument.on("change", () => {
        this.dirty = true;
    });
}

InkFileSymbols.prototype.parse = function() {

    var includes = [];

    var session = this.inkFile.getAceSession();

    const flowTypes = {
        knot:   { code: ".knot.declaration",   level: 1 },
        stitch: { code: ".stitch.declaration", level: 2 },
        choice: { code: "choice.label",        level: 3 },
        gather: { code: "gather.label",        level: 3 }
    };
    const topLevelInkFlow = { level: 0 };

    var symbolStack = [{
        flowType: topLevelInkFlow,
        innerSymbols: {}
    }];
    symbolStack.currentElement = function() {
        var currElement = this[this.length-1];
        return currElement;
    }

    var it = new TokenIterator(session, 0, 0);
    it.stepForward(); // this shouldn't be necessary should it?!
    for(var tok = it.getCurrentToken(); tok; tok = it.stepForward()) {

        // Token is some kind of name?
        if( tok.type.indexOf(".name") != -1 ) {

            var symbolName = tok.value;

            // DEBUG
            if( tok.type.indexOf("var-decl") != -1 )
                continue;

            var flowType = null;
            for(var flowTypeName in flowTypes) {
                var flowTypeObj = flowTypes[flowTypeName];
                if( tok.type.indexOf(flowTypeObj.code) != -1 ) {
                    flowType = flowTypeObj;
                    break;
                }
            }

            // Not a knot/stitch/gather/choice (e.g. might be a variable name)
            if( !flowType )
                continue;
            
            while( flowType.level <= symbolStack.currentElement().flowType.level )
                symbolStack.pop();

            var symbol = {
                name: symbolName,
                flowType: flowType,
                row: it.getCurrentTokenRow(),
                column: it.getCurrentTokenColumn(),
                innerSymbols: {}
            };
            
            symbolStack.currentElement().innerSymbols[symbolName] = symbol;
            symbolStack.push(symbol);
        }

        // INCLUDE
        else if( tok.type.indexOf("include.filepath") != -1 ) {
            includes.push(tok.value);
        }

    } // for token iterator

    this.symbols = symbolStack[0].innerSymbols;
    this.includes = includes;

    this.dirty = false;
}

InkFileSymbols.prototype.getSymbols = function() {
    if( this.dirty ) this.parse();
    return this.symbols;
}

InkFileSymbols.prototype.getIncludes = function() {
    if( this.dirty ) this.parse();
    return this.includes;
}

exports.InkFileSymbols = InkFileSymbols;