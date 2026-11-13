"use strict";

const path = require("path");

// Keep the icon bundled with the app, so the dialog works without Internet
// access or the desktop environment's optional icon themes.
const EXPORT_SUCCESS_ICON = path.join(__dirname, "icons", "export-success.png");

function exportSuccessDialogOptions(details) {
    return {
        type: "info",
        title: "Inky — Web export",
        message: "Web export completed successfully.",
        detail: typeof details === "string" ? details : "",
        icon: EXPORT_SUCCESS_ICON,
        buttons: ["OK"],
        defaultId: 0,
        noLink: true
    };
}

module.exports = { exportSuccessDialogOptions, EXPORT_SUCCESS_ICON };
