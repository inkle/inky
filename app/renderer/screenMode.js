// Explicit screen boundaries for Inky's optional Screen Mode.
// This module does not alter Ink state, tags, flow, choices, or variables.
(function(root, factory) {
    if( typeof module === "object" && module.exports ) module.exports = factory();
    else root.InkyScreenMode = factory();
})(typeof window !== "undefined" ? window : this, function() {
    "use strict";
    function isScreenTag(tag) {
        return /^#?\s*screen\s*$/i.test(String(tag == null ? "" : tag).trim());
    }
    function isScreenMode(mode) { return mode === "screen"; }
    function startsScreen(mode, tags) {
        return isScreenMode(mode) && Array.isArray(tags) && tags.some(isScreenTag);
    }
    return { isScreenTag: isScreenTag, isScreenMode: isScreenMode, startsScreen: startsScreen };
});
