exports.inkCompleter = {
    getCompletions: function(editor, session, pos, prefix, callback) {
        // Ignore pos and prefix. ACE will find the most likely words in the
        // list for the prefix automatically.
        var wordList = ["foo", "bar", "baz"];
        callback(null, wordList.map(function(word) {
            return {
                caption: word,
                value: word,
                meta: "static"
            };
        }));
    }
}
