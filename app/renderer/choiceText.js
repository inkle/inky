(function(root, factory) {
    var api = factory();
    if( typeof module === "object" && module.exports ) module.exports = api;
    if( root ) root.InkyChoiceText = api;
})(typeof window !== "undefined" ? window : null, function() {
    "use strict";

    // A replayed choice is the choice at the current replay index, not every choice
    // encountered while the compiler rebuilds the path to the saved turn.
    function isReplayChoice(replaying, sequence, turnIndex, choiceNumber) {
        if( !replaying || !Array.isArray(sequence) || turnIndex < 0 || turnIndex >= sequence.length )
            return false;
        return Number(sequence[turnIndex]) === Number(choiceNumber);
    }

    // Ink includes the selected choice text at the beginning of the next generated
    // passage. It is navigation, so remove that prefix once and only once.
    function stripSelectedChoiceText(text, selectedChoiceText) {
        var value = String(text == null ? "" : text);
        if( selectedChoiceText === null || selectedChoiceText === undefined )
            return { text: value, consumed: false };

        var prefix = String(selectedChoiceText);
        // Ink can emit a tag-only/blank chunk before the first narrative text. Do not
        // consume the pending choice marker until there is actual text to inspect.
        if( value.trim().length === 0 )
            return { text: value, consumed: false };

        if( prefix && value.indexOf(prefix) === 0 )
            value = value.substring(prefix.length).replace(/^\s+/, "");

        // A non-empty first chunk consumes the marker even when it doesn't match: that
        // keeps an ordinary later sentence beginning with the same words from vanishing.
        return { text: value, consumed: true };
    }

    function saveSelectedChoiceText(storage, key, text) {
        storage.setItem(key + ":choice", text == null ? "" : String(text));
    }

    function loadSelectedChoiceText(storage, key) {
        var value = storage.getItem(key + ":choice");
        return value === null || value === "" ? null : value;
    }

    function removeSelectedChoiceText(storage, key) {
        storage.removeItem(key + ":choice");
    }

    return {
        isReplayChoice: isReplayChoice,
        stripSelectedChoiceText: stripSelectedChoiceText,
        saveSelectedChoiceText: saveSelectedChoiceText,
        loadSelectedChoiceText: loadSelectedChoiceText,
        removeSelectedChoiceText: removeSelectedChoiceText
    };
});
