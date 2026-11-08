const {ipcRenderer} = require("electron");

window.addEventListener("contextmenu", (event) => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    const inEditor = !!(event.target.closest && event.target.closest("#editor"));
    const view = inEditor ? require("./editorView.js").EditorView : null;
    ipcRenderer.send("show-context-menu", { formatCode: !!(view && view.canFormatCode()) });
});

ipcRenderer.on("format-code", () => {
    const view = require("./editorView.js").EditorView;
    if (!view.canFormatCode()) return;
    view.formatCode();
    view.focus();
});
