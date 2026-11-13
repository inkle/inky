const fs = require("fs");
const path = require("path");

function loadExportHelpers(window) {
    for (const file of ["choiceText.js", "screenMode.js", "endingMarker.js"]) {
        window.eval(fs.readFileSync(path.join(__dirname, "../../renderer", file), "utf8"));
    }
}

module.exports = { loadExportHelpers };
