"use strict";

// A small floating toolbar that appears over selected story text, with a bold and an italic button.
// It uses the same commands as Ctrl/Cmd+B and Ctrl/Cmd+I (richTextFormatting.js), so the rules are
// the same: only plain story text can be formatted, and one click is one undo step.

const BUTTONS = [
    { format: "b", command: "toggleRichTextBold", label: "Bold", glyph: "B", key: "B" },
    { format: "i", command: "toggleRichTextItalic", label: "Italic", glyph: "I", key: "I" }
];

const GAP = 8;       // space between the selection and the toolbar
const MARGIN = 6;    // minimum distance from the edges of the editor
const DELAY = 60;    // ms to let a selection settle before the toolbar follows it

// Where the toolbar goes: above the selection when there is room, below it otherwise, and always
// inside the editor. Returns null when there is no room at all. Coordinates are window pixels.
function place(anchor, size, bounds) {
    let left = anchor.centerX - size.width / 2;
    left = Math.max(bounds.left + MARGIN, Math.min(left, bounds.right - size.width - MARGIN));
    let top = anchor.topY - size.height - GAP;
    let placement = "above";
    if( top < bounds.top + MARGIN ) {
        top = anchor.bottomY + GAP;
        placement = "below";
    }
    if( top + size.height > bounds.bottom - MARGIN ) return null;
    return { left: Math.round(left), top: Math.round(top), placement };
}

function build(doc) {
    const isMac = /mac/i.test((doc.defaultView && doc.defaultView.navigator && doc.defaultView.navigator.platform) || "");
    const toolbar = doc.createElement("div");
    toolbar.className = "rich-toolbar";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Text formatting");
    toolbar.hidden = true;
    BUTTONS.forEach(item => {
        const button = doc.createElement("button");
        button.type = "button";
        button.className = "rich-toolbar-button";
        button.dataset.format = item.format;
        button.tabIndex = -1;
        button.title = item.label + " (" + (isMac ? "\u2318" + item.key : "Ctrl+" + item.key) + ")";
        button.setAttribute("aria-label", item.label);
        button.setAttribute("aria-pressed", "false");
        const glyph = doc.createElement("span");
        glyph.className = "rich-toolbar-glyph rich-toolbar-glyph-" + item.format;
        glyph.textContent = item.glyph;
        button.appendChild(glyph);
        toolbar.appendChild(button);
    });
    return toolbar;
}

function install(editor, richText) {
    const doc = editor.container.ownerDocument;
    const win = doc.defaultView;
    const element = build(doc);
    doc.body.appendChild(element);

    let timer = null;
    let mouseDown = false;

    function hide() {
        clearTimeout(timer);
        timer = null;
        element.hidden = true;
    }

    // The toolbar sits over the first line of the selection, centered on it when it is one line
    function position() {
        const range = editor.getSelectionRange();
        const renderer = editor.renderer;
        const bounds = editor.container.getBoundingClientRect();
        const lineHeight = renderer.lineHeight || 0;
        const start = renderer.textToScreenCoordinates(range.start.row, range.start.column);
        const end = renderer.textToScreenCoordinates(range.end.row, range.end.column);
        const startX = start.pageX - (win.pageXOffset || 0);
        const startY = start.pageY - (win.pageYOffset || 0);
        const endX = end.pageX - (win.pageXOffset || 0);
        const endY = end.pageY - (win.pageYOffset || 0);
        // Scrolled out of view: nothing to point at
        if( endY + lineHeight < bounds.top || startY > bounds.bottom ) return false;
        const oneLine = range.start.row === range.end.row;
        const spot = place({
            centerX: oneLine ? (startX + endX) / 2 : startX,
            topY: startY,
            bottomY: endY + lineHeight
        }, { width: element.offsetWidth, height: element.offsetHeight }, bounds);
        if( !spot ) return false;
        element.style.left = spot.left + "px";
        element.style.top = spot.top + "px";
        element.dataset.placement = spot.placement;
        return true;
    }

    function reflect(state) {
        BUTTONS.forEach(item => {
            const button = element.querySelector('[data-format="' + item.format + '"]');
            const pressed = item.format === "b" ? state.bold : state.italic;
            button.setAttribute("aria-pressed", String(pressed));
            button.classList.toggle("is-active", pressed);
        });
    }

    function update() {
        timer = null;
        if( mouseDown || !editor.isFocused() ) return hide();
        const state = richText.selectionState(editor);
        if( !state.enabled ) return hide();
        reflect(state);
        element.hidden = false;       // it has to be shown to be measured
        if( !position() ) hide();
    }

    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(update, DELAY);
    }

    // Clicking a button must not take the focus or the selection away from the editor
    element.addEventListener("mousedown", event => event.preventDefault());
    element.addEventListener("click", event => {
        const button = event.target.closest && event.target.closest("button[data-format]");
        if( !button ) return;
        const item = BUTTONS.find(candidate => candidate.format === button.dataset.format);
        editor.execCommand(item.command);
        editor.focus();
        update();
    });

    editor.on("changeSelection", () => {
        if( editor.selection.isEmpty() ) hide();
        else schedule();
    });
    editor.on("changeSession", hide);
    editor.on("blur", schedule);
    // Scrolling and wrapping move the text under the toolbar
    editor.renderer.on("afterRender", () => {
        if( !element.hidden && !position() ) hide();
    });
    // In the capture phase, so the editor cannot swallow the event before the toolbar hears it
    editor.container.addEventListener("mousedown", () => {
        mouseDown = true;
        hide();
    }, true);
    doc.addEventListener("mouseup", () => {
        if( !mouseDown ) return;
        mouseDown = false;
        schedule();
    }, true);
    win.addEventListener("resize", hide);

    return { element, update, hide };
}

exports.RichTextToolbar = { install, place, BUTTONS };
