// Ink story content is plain text: anything that looks like HTML is shown as written, never as markup.

function escapeHtml(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Splits a plain-text passage into word spans, so words can be underlined with Alt held down and
// clicked to jump to the source. Only text nodes are touched.
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

exports.SafeHtml = { escapeHtml, wrapWords };
