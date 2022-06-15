const assert = require("assert");
const TokenIterator = ace.require("ace/token_iterator").TokenIterator;
const _ = require("lodash");

function InkFileSymbols(inkFile, events) {
    this.inkFile = inkFile;
    this.events = events;

    this.dirty = true;
    this.parseTimeout = null;

    this.divertTargets = new Set();
    this.variables = new Set();
    this.externals = new Set();
    this.vocabWords = new Set();

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

    const flowTypes = [
        { name: "Knot",   code: ".knot.declaration",   level: 1 },
        { name: "Stitch", code: ".stitch.declaration", level: 2 },
        { name: "Choice", code: "choice.label",        level: 3 },
        { name: "Gather", code: "gather.label",        level: 3 },
    ];
    const varTypes = [
        { name: "Variable", code: "var-decl"  },
        { name: "List",     code: "list-decl" },
        { name: "External", code: "external"},
    ];
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

    var divertTargets = new Set();
    var variables = new Set();
    var externals = new Set();
    var vocabWords = new Set();

    var it = new TokenIterator(session, 0, 0);

    // this shouldn't be necessary should it?!
    // I don't understand why sometimes the TokenIterator gives something valid
    // initially, and sometimes it doesn't?
    if( it.getCurrentToken() === undefined ) it.stepForward();
    
    var isfunc = false

    for(var tok = it.getCurrentToken(); tok; tok = it.stepForward()) {
        //Flag, if triggered, the next "name" is a function. 
        if (tok.type.endsWith("function"))
        isfunc = true
        
        // Token is some kind of name?
        if( tok.type.indexOf(".name") != -1 ) {

            var symbolName = tok.value;

            const findType = (token, typeList) =>
                typeList.find(
                    (type) => token.type.indexOf(type.code) != -1);

            const flowType = findType(tok, flowTypes);
            const varType  = findType(tok, varTypes);

            if( flowType ) {
                while( flowType.level <= symbolStack.currentElement().flowType.level )
                    symbolStack.pop();

                var symbol = {
                    name: symbolName,
                    isfunc : isfunc,
                    flowType: flowType,
                    row: it.getCurrentTokenRow(),
                    column: it.getCurrentTokenColumn(),
                    inkFile: this.inkFile
                };

                var parent = symbolStack.currentElement();
                if( parent != symbolStack )
                    symbol.parent = parent;

                if( !parent.innerSymbols ) {
                    parent.innerSymbols = {};
                    parent.rangeIndex = [];
                }
                parent.innerSymbols[symbolName] = symbol;
                parent.rangeIndex.push({
                    rowStart: symbol.row,
                    symbol: symbol
                });
                symbolStack.push(symbol);
                divertTargets.add(symbolName);
                isfunc = false
            }
            else if( varType ) {
                switch (tok.type){
                    case "external.declaration.name":
                        externals.add(symbolName)
                    default:
                        variables.add(symbolName);
                }
            }
            // Not a knot/stitch/gather/choice nor a variable. Do nothing.
        }

        // DIVERT
        else if( tok.type == "divert.target" && tok.value.trim().length > 0 ) {
            divertTargets.add(tok.value);
        }

        // LIST
        else if( tok.type == "list-decl.item" && tok.value.trim().length > 0 ) {
            // Extract the name from the line
            var potentialNames = tok.value.match(/\b\w+\b/g);
            potentialNames.forEach(potentialName => {
                // Exclude "names" that are only numbers
                if( !(/^\d*$/.test(potentialName)) ) {
                    variables.add(potentialName);
                }
            });
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

        // Prose text
        else if( tok.type == "text" ) {
            var words = tok.value.split(/\W+/);
            words.forEach(word => {
                if( word.length >= 3 ) {
                    vocabWords.add(word);
                }
            });
        }

    } // for token iterator

    this.symbols = symbolStack[0].innerSymbols;
    this.rangeIndex = symbolStack[0].rangeIndex;

    this.globalTags = globalTags;
    this.globalDictionaryStyleTags = globalDictionaryStyleTags;

    this.divertTargets = divertTargets;
    this.variables = variables;
    this.externals = externals;
    this.vocabWords = vocabWords;
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

InkFileSymbols.prototype.flowAtPos =function(pos){
    if (this.dirty) this.parse();
    return symbolsWithinIndex(this.rangeIndex, pos);
}
 
InkFileSymbols.prototype.symbolAtPos = function(pos) {

    if( this.dirty ) this.parse();
    return symbolWithinIndex(this.rangeIndex, pos);
}

// Range index is an index of all the symbols by row number,
// nested into a hierarchy. 
function symbolWithinIndex(rangeIndex, pos, includeFlows=true, includeVars=true) {
    if( !rangeIndex )
        return null;

    // Loop through range until we find the symbol,
    // then dig in to see if we can find a more accurate sub-symbol
    for(var i=0; i<rangeIndex.length; i++) {
        var nextRangeElement = null;
        var isValidSymbol = false;
        if( i < rangeIndex.length-1 ) {
            nextRangeElement = rangeIndex[i+1];
            isValidSymbol = ((nextRangeElement.symbol.flowType && includeFlows) || (nextRangeElement.symbol.varType && includeVars))
        }
        if( (!nextRangeElement || pos.row < nextRangeElement.rowStart )) {
            var symbol = rangeIndex[i].symbol;
            isValidSymbol = ((symbol.flowType && includeFlows) || (symbol.varType && includeVars))
            if (isValidSymbol){
                return symbolWithinIndex(symbol.rangeIndex, pos) || symbol;
            }
        }
    }

    // Only if it's an empty range, so impossible?
    return null;
}

//Similar to above function, but this returns an array of the possible symbols that
//a cursor could belong to. This makes it possible to select
//a chosen symbol to interact with, for example finding what knot
//a line belongs to. 
function symbolsWithinIndex(rangeIndex, pos) {
    if( !rangeIndex )
        return null;
    var symbols = {};
    var start = 0;
    var end = rangeIndex.length-1;
    //While there is a range to explore
    while (rangeIndex && start <= end) {
        //Fine next element, if there is one.
        var nextRangeElement = null;
        if( start < end ) {
            nextRangeElement = rangeIndex[start+1];
        }
        //If there is no next element, or if the next element goes too far, then
        //current element is the looked for item. 
        if( (!nextRangeElement || pos.row < nextRangeElement.rowStart )) {
            var symbol = rangeIndex[start].symbol;
            //We don't want extras, so only add a symbol if it fits!
            if (pos.row >= symbol.row){
                symbols[symbol.flowType.name] = symbol;
            }
            rangeIndex = symbol.rangeIndex;
            start = 0;
            end = (rangeIndex)? rangeIndex.length - 1 : 0; 
        }
        else{
            start += 1;
        }
    }
    return symbols;
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

InkFileSymbols.prototype.getCachedDivertTargets = function() {
    return this.divertTargets;
}

InkFileSymbols.prototype.getCachedVariables = function() {
    return this.variables;
}

InkFileSymbols.prototype.getCachedExternals = function() {
    return this.externals;
}

InkFileSymbols.prototype.getCachedVocabWords = function() {
    return this.vocabWords;
}

exports.InkFileSymbols = InkFileSymbols;
