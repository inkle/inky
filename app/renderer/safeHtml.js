// Ink story content is plain text: anything that looks like HTML is shown as written, never as markup.

function escapeHtml(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Split a plain-text passage into word spans for the author's Alt-click jump-to-source.
// Hovering or typing does not add any visual styling to narrative text.
// Only text nodes are touched.
function wrapWords(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while( walker.nextNode() ) textNodes.push(walker.currentNode);
    textNodes.forEach(node => {
        const parts = node.nodeValue.split(/(\s+)/);
        const fragment = document.createDocumentFragment();
        parts.forEach(part => {
            if( !part ) return;
            if( /^\s+$/.test(part) ) fragment.appendChild(document.createTextNode(part));
            else {
                const span = document.createElement("span");
                span.className = "inky-word";
                span.textContent = part;
                fragment.appendChild(span);
            }
        });
        node.parentNode.replaceChild(fragment, node);
    });
}

// Return the source midpoint of a visible word hit with Alt-click. Text stays
// in contiguous DOM nodes (no per-word paint layers in the Preview).
function wordSourceOffset(sourceText, visibleText, caretOffset) {
    sourceText = String(sourceText == null ? "" : sourceText);
    visibleText = String(visibleText == null ? "" : visibleText);
    if( !Number.isFinite(caretOffset) || caretOffset < 0 ) return null;
    const re = /\S+/g;
    let match, searchFrom = 0;
    while( (match = re.exec(visibleText)) !== null ) {
        const at = sourceText.indexOf(match[0], searchFrom);
        if( at < 0 ) continue;
        const end = match.index + match[0].length;
        if( caretOffset >= match.index && caretOffset <= end )
            return at + Math.floor(match[0].length / 2);
        searchFrom = at + match[0].length;
    }
    return null;
}

exports.SafeHtml = { escapeHtml, wrapWords, wordSourceOffset };
