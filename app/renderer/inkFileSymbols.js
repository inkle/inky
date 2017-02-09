const assert = require("assert");
const TokenIterator = ace.require("ace/token_iterator").TokenIterator;
const _ = require("lodash");

function InkFileSymbols(inkFile, events) {
    this.inkFile = inkFile;
    this.events = events;

    this.dirty = true;
    this.parseTimeout = null;

    this.inkFile.aceDocument.on("change", () => {
        this.dirty = true;
        this.scheduleParse();
    });
}

InkFileSymbols.prototype.scheduleParse = function() {
    if( this.parseTimeout ) 
        clearTimeout(this.parseTimeout);

    this.parseTimeout = setTimeout(() => {
        this.parseTimeout = null;
        this.parse();
    }, 200);
}

InkFileSymbols.prototype.parse = function() {

    var includes = [];
    var lastIncludeRow = -1;

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
        innerSymbols: {},
        rangeIndex: []
    }];
    symbolStack.currentElement = function() {
        var currElement = this[this.length-1];
        return currElement;
    }

    var globalTags = [];
    var globalDictionaryStyleTags = {};

    var it = new TokenIterator(session, 0, 0);

    // this shouldn't be necessary should it?!
    // I don't understand why sometimes the TokenIterator gives something valid
    // initially, and sometimes it doesn't?
    if( it.getCurrentToken() === undefined ) it.stepForward();
    
    for(var tok = it.getCurrentToken(); tok; tok = it.stepForward()) {

        // Token is some kind of name?
        if( tok.type.indexOf(".name") != -1 ) {

            var symbolName = tok.value;

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
                inkFile: this.inkFile
            };
            
            var parent = symbolStack.currentElement();
            if( parent != symbolStack )
                symbol.parent = parent;

            if( !parent.innerSymbols ) {
                parent.innerSymbols = [];
                parent.rangeIndex = [];
            }

            parent.innerSymbols[symbolName] = symbol;
            parent.rangeIndex.push({
                rowStart: symbol.row,
                symbol: symbol
            });

            symbolStack.push(symbol);
        }

        // INCLUDE
        else if( tok.type.indexOf("include.filepath") != -1 && tok.value.trim().length > 0 ) {
            includes.push(tok.value);
            lastIncludeRow = it.getCurrentTokenRow();
        }

        // Global tags
        else if( tok.type == "tag" && symbolStack.currentElement().flowType.level == 0 ) {
            // Skip leading #
            var tagContent = tok.value.substring(1).trim();
            globalTags.push(tagContent);

            var dictStyleMatches = tagContent.match(/\s*(\w+)\s*:\s*(.+)/);
            if( dictStyleMatches ) {
                var dictKey = dictStyleMatches[1];
                var dictContent = dictStyleMatches[2];
                globalDictionaryStyleTags[dictKey] = dictContent;
            }
        }

    } // for token iterator

    this.symbols = symbolStack[0].innerSymbols;
    this.rangeIndex = symbolStack[0].rangeIndex;

    this.globalTags = globalTags;
    this.globalDictionaryStyleTags = globalDictionaryStyleTags;

    // Detect whether the includes actually changed at all
    var oldIncludes = this.includes || [];
    this.includes = includes;
    this.lastIncludeRow = lastIncludeRow;

    var includesChanged = false;
    if( includes.length != oldIncludes.length ) {
        includesChanged = true;
    } else {
        var beforeAndAfter = _.union(includes, oldIncludes);
        includesChanged = beforeAndAfter.length != includes.length;
    }

    if( includesChanged )
        this.events.includesChanged(this.includes);

    this.dirty = false;
}

InkFileSymbols.prototype.symbolAtPos = function(pos) {

    if( this.dirty ) this.parse();

    // Range index is an index of all the symbols by row number,
    // nested into a hierarchy. 
    function symbolWithinIndex(rangeIndex) {

        if( !rangeIndex )
            return null;

        // Loop through range until we find the symbol,
        // then dig in to see if we can find a more accurate sub-symbol
        for(var i=0; i<rangeIndex.length; i++) {

            var nextRangeElement = null;
            if( i < rangeIndex.length-1 )
                nextRangeElement = rangeIndex[i+1];

            if( !nextRangeElement || pos.row < nextRangeElement.rowStart ) {
                var symbol = rangeIndex[i].symbol;
                return symbolWithinIndex(symbol.rangeIndex) || symbol;
            }
        }

        // Only if it's an empty range, so impossible?
        return null;
    }

    return symbolWithinIndex(this.rangeIndex);
}

InkFileSymbols.prototype.getSymbols = function() {
    if( this.dirty ) this.parse();
    return this.symbols;
}

InkFileSymbols.prototype.getIncludes = function() {
    if( this.dirty ) this.parse();
    return this.includes;
}

InkFileSymbols.prototype.getLastIncludeRow = function() {
    if( this.dirty ) this.parse();
    return this.lastIncludeRow;
}

exports.InkFileSymbols = InkFileSymbols;