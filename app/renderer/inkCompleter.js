exports.inkCompleter = {
    inkFiles: [],

    getCompletions(editor, session, pos, prefix, callback) {
        const wordsPerInclude = this.inkFiles.map((inkFile) => {
            const knots = inkFile.symbols.getSymbols();
            return Object.keys(knots);
        });
        const words = [].concat.apply([], wordsPerInclude);

        // Ignore pos and prefix. ACE will find the most likely words in the
        // list for the prefix automatically.
        callback(null, words.map((word) => ({
            caption: word,
            value: word,
            meta: "Knot"
        })));
    }
};
