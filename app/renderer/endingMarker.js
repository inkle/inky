// The same ending ornament in the IDE Preview and the exported player.
// Build nodes via textContent, never HTML, because game.yaml is author input.
(function(root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.InkyEndingMarker = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
    "use strict";
    const DEFAULT_TEXT = "The End";
    function create(doc, label) {
        const container = doc.createElement("div");
        container.className = "story-ending";
        container.setAttribute("role", "status");
        // Real SVG strokes keep both rules visible. The previous CSS flex
        // pseudo-elements could collapse, leaving the diamond alone.
        const SVG_NS = "http://www.w3.org/2000/svg";
        const ornament = doc.createElementNS(SVG_NS, "svg");
        ornament.setAttribute("class", "story-ending-ornament");
        ornament.setAttribute("viewBox", "0 0 240 24");
        ornament.setAttribute("aria-hidden", "true");
        ornament.setAttribute("focusable", "false");
        for (const d of ["M0 12 H104", "M136 12 H240"]) {
            const line = doc.createElementNS(SVG_NS, "path");
            line.setAttribute("class", "story-ending-line");
            line.setAttribute("d", d);
            ornament.appendChild(line);
        }
        const diamond = doc.createElementNS(SVG_NS, "path");
        diamond.setAttribute("class", "story-ending-diamond");
        diamond.setAttribute("d", "M120 3 L129 12 L120 21 L111 12 Z");
        ornament.appendChild(diamond);
        const caption = doc.createElement("span");
        caption.className = "story-ending-label";
        caption.textContent = typeof label === "string" && label.trim() ? label : DEFAULT_TEXT;
        container.appendChild(ornament);
        container.appendChild(caption);
        return container;
    }
    function update(element, visible, label) {
        if (!element) return;
        element.hidden = !visible;
        const caption = element.querySelector(".story-ending-label");
        if (caption) caption.textContent = typeof label === "string" && label.trim() ? label : DEFAULT_TEXT;
    }
    const REPLAY_LABEL = "Play Again";
    function createReplayChoice(doc, label) {
        const choice = doc.createElement("p");
        choice.className = "choice story-replay-choice";
        const button = doc.createElement("button");
        button.type = "button";
        button.className = "choice-button";
        button.textContent = typeof label === "string" && label.trim() ? label : REPLAY_LABEL;
        choice.appendChild(button);
        return choice;
    }
    return { DEFAULT_TEXT, REPLAY_LABEL, create, update, createReplayChoice };
});
