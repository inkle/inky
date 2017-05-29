// Helper function that takes a list of InkFiles and walks their symbol trees to
// get all the symbols in a flat list.
function getAllSymbols(files) {
    let globalSymbolList = [];

    // Helper function that walks a symbol tree to find all the symbol names in
    // it.
    function walkSymbolTree(tree) {
        for(const symbolName in tree) {
            if( tree.hasOwnProperty(symbolName) ) {
                const symbol = tree[symbolName];
                globalSymbolList.push(symbol);
                if( symbol.innerSymbols ) {
                    walkSymbolTree(symbol.innerSymbols);
                }
            }
        }
    }

    files.forEach(inkFile => {
        const tree = inkFile.symbols.getSymbols();
        walkSymbolTree(tree);
    });

    return globalSymbolList;
}

// Helper function that gets all the variable names from a list of InkFiles
function getAllVariables(files) {
    return files.reduce(
        (acc, cur) => acc.concat(cur.symbols.getVariables()),
        []);
}

// Helper function that gets all the vocabulary words from a list of InkFiles
function getAllVocabWords(files) {
    return files.reduce(
        (acc, cur) => acc.concat(cur.symbols.getVocabWords()),
        []);
}

// Helper function that generates suggestions for all the symbols
function getAllSymbolSuggestions(inkFiles) {
    const symbols = getAllSymbols(inkFiles);
    return symbols.map(
        symbol => ({
            caption: symbol.name,
            value: symbol.name,
            meta: symbol.flowType.name,
        }));
}

// Helper function that generates suggestions for all the variables
function getAllVariableSuggestions(inkFiles) {
    const variables = getAllVariables(inkFiles);
    return variables.map(
        variableName => ({
            caption: variableName,
            value: variableName,
            meta: "Variable",
        }));
}

// Helper function that generates suggestions for all the vocabulary
function getAllVocabSuggestions(inkFiles) {
    const vocabWords = getAllVocabWords(inkFiles);
    return vocabWords.map(
        word => ({
            caption: word,
            value: word,
            meta: "Vocabulary",
        }));
}

exports.inkCompleter = {
    inkFiles: [],

    getCompletions(editor, session, pos, prefix, callback) {
        // There are three possible ways we may want to suggest completions:
        //
        // 1) If we are in a divert target, we should only suggest symbols.
        // 2) If we are in a logic section, we should suggest variables,
        //    symbols, (because they can be used as variables) and vocab words.
        //    (because logic can output text)
        // 3) If we are not in either, we should only suggest vocab words.

        const cursorToken = session.getTokenAt(pos.row, pos.column);
        const isCursorInDivert = (cursorToken.type.indexOf("divert") != -1);
        const isCursorInLogic = (cursorToken.type.indexOf("logic") != -1);

        // Ignore the prefix. ACE will find the most likely words in the list
        // for the prefix automatically.

        var suggestions;
        if( isCursorInDivert ) {
            suggestions = getAllSymbolSuggestions(this.inkFiles);
        } else if( isCursorInLogic ) {
            const symbolSuggestions = getAllSymbolSuggestions(this.inkFiles);
            const variableSuggestions = getAllVariableSuggestions(this.inkFiles);
            const vocabSuggstions = getAllVocabSuggestions(this.inkFiles);
            suggestions = symbolSuggestions.concat(variableSuggestions).concat(vocabSuggstions);
        } else {
            suggestions = getAllVocabSuggestions(this.inkFiles);
        }

        callback(null, suggestions);
    }
};
