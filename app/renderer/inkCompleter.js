const TagPicker = require("./tagPicker.js").TagPicker;
const TAG_NAMES = TagPicker.TAG_NAMES;

function union(sets) {
    const u = new Set();
    for (const set of sets) {
        for (const elem of set) {
            u.add(elem);
        }
    }
    return u;
}

// Helper function that gets all the divert targets from a list of InkFiles
function getAllDivertTargets(files) {
    return union(files.map((file) => file.symbols.getCachedDivertTargets()));
}

// Helper function that gets all the variable names from a list of InkFiles
function getAllVariables(files) {
    return union(files.map((file) => file.symbols.getCachedVariables()));
}

// Helper function that gets all the vocabulary words from a list of InkFiles
function getAllVocabWords(files) {
    return union(files.map((file) => file.symbols.getCachedVocabWords()));
}

// Helper function that generates suggestions for all the divert targets
function getAllDivertTargetSuggestions(inkFiles) {
    const targets = getAllDivertTargets(inkFiles);
    const suggestions = [];
    for (const target of targets) {
        suggestions.push({
            caption: target,
            value: target,
            meta: "Divert Target",
        });
    }
    return suggestions;
}

// Helper function that generates suggestions for all the variables
function getAllVariableSuggestions(inkFiles) {
    const variables = getAllVariables(inkFiles);
    const suggestions = [];
    for (const variable of variables) {
        suggestions.push({
            caption: variable,
            value: variable,
            meta: "Variable",
        });
    }
    return suggestions;
}

// Helper function that generates suggestions for all the vocabulary
function getAllVocabSuggestions(inkFiles) {
    const vocabWords = getAllVocabWords(inkFiles);
    const suggestions = [];
    for (const vocabWord of vocabWords) {
        suggestions.push({
            caption: vocabWord,
            value: vocabWord,
            meta: "Vocabulary",
        });
    }
    return suggestions;
}

exports.inkCompleter = {
    inkFiles: [],
    getProjectDir: () => null,
    tagPicking: false,

    getCompletions(editor, session, pos, prefix, callback) {
        // There are three possible ways we may want to suggest completions:
        //
        // 1) If we are in a divert or divert target, we should only suggest
        //    target names.
        // 2) If we are in a logic section, we should suggest variables,
        //    targets, (because they can be used as variables) and vocab words.
        //    (because logic can output text)
        // 3) If we are not in either, we should only suggest vocab words.

        // Offer built-in control and alignment tags only while editing a tag.
        const lineToCursor = session.getLine(pos.row).slice(0, pos.column);
        const tagContext = lineToCursor.match(/(?:^|\s)#\s*([^\n]*)$/);
        if( tagContext ) {
            const tagText = tagContext[1];
            // "#" + Tab: only the tag names, in alphabetical order.
            const valueTag = tagText.match(/^([\w-]+)\s*:\s*(.*)$/i);
            if( valueTag && TagPicker.TAG_REGISTRY[valueTag[1].toLowerCase()] ) {
                const name = valueTag[1].toLowerCase();
                const definition = TagPicker.TAG_REGISTRY[name];
                callback(null, TagPicker.valuesForTag(name, this.getProjectDir()).map(value => ({
                    caption: value,
                    value,
                    meta: definition.kind === "audio" && value === "stop" ? definition.label : undefined
                })));
                return;
            }
            if( this.tagPicking || /^[\w-]*$/.test(tagText) ) {
                const suggestions = [];
                TAG_NAMES.forEach(name => {
                    const definition = TagPicker.TAG_REGISTRY[name];
                    suggestions.push({caption: "#" + name, value: name + (definition.kind === "flag" ? "" : ": "), meta: "Ink Tag"});
                    TagPicker.valuesForTag(name, this.getProjectDir()).forEach(value => suggestions.push({
                        caption: "#" + name + ": " + value,
                        value: name + ": " + value,
                        meta: definition.kind === "audio" && value === "stop" ? definition.label : "Ink Tag"
                    }));
                });
                callback(null, suggestions.sort((a, b) => a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
                return;
            }
            callback(null, TAG_NAMES.map(name => ({caption: "#" + name, value: name + (definition.kind === "flag" ? "" : ": "), meta: "Ink Tag"})));
            return;
        }

        // Ace returns null at the beginning of an empty line (Ctrl+Space).
        const cursorToken = session.getTokenAt(pos.row, pos.column) || { type: "" };
        const isCursorInDivert = (cursorToken.type.indexOf("divert") != -1);
        const isCursorInFlow = (cursorToken.type.indexOf("flow") != -1);
        const isCursorInLabel = (cursorToken.type.indexOf(".label") != -1);
        const isCursorInLogic = (cursorToken.type.indexOf("logic") != -1);

        // Ignore the prefix. ACE will find the most likely words in the list
        // for the prefix automatically.

        var suggestions;
        if( isCursorInDivert || isCursorInFlow || isCursorInLabel ) {
            suggestions = getAllDivertTargetSuggestions(this.inkFiles);
        } else if( isCursorInLogic ) {
            const divertTargetSuggestions = getAllDivertTargetSuggestions(this.inkFiles);
            const variableSuggestions = getAllVariableSuggestions(this.inkFiles);
            const vocabSuggestions = getAllVocabSuggestions(this.inkFiles);
            suggestions = divertTargetSuggestions.concat(variableSuggestions).
                    concat(vocabSuggestions);
        } else {
            suggestions = getAllVocabSuggestions(this.inkFiles);
        }

        callback(null, suggestions);
    }
};
