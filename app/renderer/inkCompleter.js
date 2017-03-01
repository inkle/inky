exports.inkCompleter = {
    inkFile: null,

    getCompletions(editor, session, pos, prefix, callback) {
        if ( this.inkFile ) {
            const knots = this.inkFile.symbols.getSymbols();
            const words = Object.keys(knots);

            // Ignore pos and prefix. ACE will find the most likely words in the
            // list for the prefix automatically.
            callback(null, words.map((word) => ({
                caption: word,
                value: word,
                meta: "Knot"
            })));
        }
    }
}
