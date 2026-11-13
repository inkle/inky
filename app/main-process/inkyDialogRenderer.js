"use strict";
const $ = id => document.getElementById(id);
window.inkyDialog.onInit(spec => {
    document.title = spec.title;
    document.body.classList.toggle("export", spec.kind === "export");
    $("message").textContent = spec.message;
    $("detail").textContent = spec.detail;
    $("buttons").replaceChildren();
    spec.buttons.forEach((label, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", () => window.inkyDialog.respond(index));
        $("buttons").appendChild(button);
    });
    // Keep the initial focus on a non-interactive element. Tab still reaches the buttons,
    // and :focus-visible remains available for keyboard accessibility.
    document.body.tabIndex = -1;
    document.body.focus({ preventScroll: true });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") { event.preventDefault(); window.inkyDialog.respond(spec.cancelId); }
    });
});
