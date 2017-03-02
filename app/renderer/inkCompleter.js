// Helper function that takes a list of InkFiles and walks their symbol trees to
// get all the symbols in a flat list.
function getAllSymbols(files) {
    let globalSymbolList = [];

    // Helper function that walks a symbol tree to find all the symbol names in
    // it.
    function walkSymbolTree(tree) {
        for (const symbolName in tree) {
            if (tree.hasOwnProperty(symbolName)) {
                const symbol = tree[symbolName];
                globalSymbolList.push(symbol);
                if (symbol.innerSymbols) {
                    walkSymbolTree(symbol.innerSymbols);
                }
            }
        }
    }

    files.forEach((inkFile) => {
        const tree = inkFile.symbols.getSymbols();
        walkSymbolTree(tree);
    });

    return globalSymbolList;
}

exports.inkCompleter = {
    inkFiles: [],

    getCompletions(editor, session, pos, prefix, callback) {
        const symbols = getAllSymbols(this.inkFiles);
        const symbolSuggestions = symbols.map(
            (symbol) => ({
                caption: symbol.name,
                value: symbol.name,
                meta: symbol.flowType.name,
            }));

        // Ignore pos and prefix. ACE will find the most likely words in the
        // list for the prefix automatically.

        callback(null, symbolSuggestions);
    }
};
