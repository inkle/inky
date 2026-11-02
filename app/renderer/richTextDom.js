// Turns story text carrying the hidden bold/italic markers into DOM nodes.
// This file is shared: the Preview requires it and the web export ships it next to main.js.
// The writer's text only ever enters the page as text nodes, never as HTML.
(function (root, factory) {
    if( typeof module === "object" && module.exports ) module.exports = factory();
    else root.InkRichText = factory();
})(typeof self !== "undefined" ? self : this, function () {
    var MARKER = /\u27e6(\/?)([^\u27e6\u27e7]{0,8})\u27e7/g;
    var ELEMENTS = { b: "strong", i: "em" };

    function tokenize(text) {
        var tokens = [];
        var last = 0;
        var match;
        MARKER.lastIndex = 0;
        while( (match = MARKER.exec(text)) !== null ) {
            if( match.index > last ) tokens.push({ text: text.slice(last, match.index) });
            tokens.push({ marker: true, closing: match[1] === "/", tag: ELEMENTS[match[2]] ? match[2] : null });
            last = match.index + match[0].length;
        }
        if( last < text.length ) tokens.push({ text: text.slice(last) });
        return tokens;
    }

    // Only markers that form a pair are honoured. Stray or unknown ones are dropped, so the player
    // never sees a marker and an unbalanced file still shows all of its text.
    function pairUp(tokens) {
        var open = [];
        tokens.forEach(function (token, index) {
            if( !token.marker || !token.tag ) return;
            if( !token.closing ) { open.push(index); return; }
            for( var i = open.length - 1; i >= 0; i-- ) {
                if( tokens[open[i]].tag === token.tag ) {
                    tokens[open[i]].paired = true;
                    token.paired = true;
                    open.splice(i, 1);
                    return;
                }
            }
        });
    }

    function toNodes(text, doc) {
        doc = doc || document;
        var fragment = doc.createDocumentFragment();
        var tokens = tokenize(String(text == null ? "" : text));
        pairUp(tokens);

        var stack = [];
        var parent = fragment;
        function enter(tag) {
            var element = doc.createElement(ELEMENTS[tag]);
            parent.appendChild(element);
            stack.push({ tag: tag, element: element });
            parent = element;
        }
        function unwind(depth) {
            stack.length = depth;
            parent = depth ? stack[depth - 1].element : fragment;
        }

        tokens.forEach(function (token) {
            if( !token.marker ) {
                if( token.text ) parent.appendChild(doc.createTextNode(token.text));
                return;
            }
            if( !token.paired ) return;
            if( !token.closing ) { enter(token.tag); return; }
            var depth = -1;
            for( var i = stack.length - 1; i >= 0; i-- ) {
                if( stack[i].tag === token.tag ) { depth = i; break; }
            }
            if( depth < 0 ) return;
            // Crossing formats (b i /b /i): close what is above, then reopen it
            var reopen = stack.slice(depth + 1).map(function (entry) { return entry.tag; });
            unwind(depth);
            reopen.forEach(enter);
        });
        return fragment;
    }

    function plainText(text) {
        return String(text == null ? "" : text).replace(MARKER, "");
    }

    return { toNodes: toNodes, plainText: plainText };
});
