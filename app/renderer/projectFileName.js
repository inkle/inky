const path = require("path");

function getRenameStem(filename) {
    const name = String(filename || "");
    const extension = path.posix.extname(name);
    return extension ? name.slice(0, -extension.length) : name;
}

function withPreservedExtension(relativePath, requestedName) {
    const extension = path.posix.extname(String(relativePath || ""));
    const name = String(requestedName || "");
    const recognizedExtensions = [".yaml", ".yml"].includes(extension.toLowerCase())
        ? [".yaml", ".yml"]
        : [extension];
    const typedExtension = recognizedExtensions.find(candidate =>
        candidate && name.toLowerCase().endsWith(candidate.toLowerCase())
    );
    const stem = typedExtension
        ? name.slice(0, -typedExtension.length)
        : name;
    return { stem: stem, filename: stem + extension };
}

module.exports = { getRenameStem, withPreservedExtension };
