"use strict";

const path = require("path");

// Image files imported into a project live in "image". Backgrounds and character art have
// conventional subfolders, but writers may keep assets elsewhere and reference explicit paths.
const FAVICON_EXTENSIONS = [".ico", ".png", ".svg"];
const COVER_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"];
const IMAGE_EXTENSIONS = Array.from(new Set(FAVICON_EXTENSIONS.concat(COVER_EXTENSIONS)));
const IMAGE_FOLDER = "image";
const IMAGE_BACKGROUND_FOLDER = "image/background";
const IMAGE_CHARACTER_FOLDER = "image/character";
// Read-only fallback for projects created before the canonical singular "image" folder.
const LEGACY_IMAGE_SEARCH_FOLDERS = ["images"];
// Bigger pictures are imported as they are, but the writer is told about them.
const LARGE_IMAGE_BYTES = 5 * 1024 * 1024;

const MIME_TYPES = {
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif"
};

function imageExtension(fileName) {
    return path.extname(String(fileName || "")).toLowerCase();
}

function isImageFileName(fileName) {
    return IMAGE_EXTENSIONS.includes(imageExtension(fileName));
}

// The file that becomes the project's favicon: any .ico, and a file named favicon.<favicon format>.
// Every other picture is an ordinary image, so it can never replace the favicon.
function isFaviconFileName(fileName) {
    const name = String(fileName || "").toLowerCase();
    const extension = imageExtension(name);
    if( extension === ".ico" ) return true;
    return FAVICON_EXTENSIONS.includes(extension) && name === "favicon" + extension;
}

function imageMimeType(fileName) {
    return MIME_TYPES[imageExtension(fileName)] || null;
}

function imageLabelList() {
    return IMAGE_EXTENSIONS.map(extension => extension.slice(1).toUpperCase()).join(", ");
}

module.exports = {
    IMAGE_EXTENSIONS,
    FAVICON_EXTENSIONS,
    COVER_EXTENSIONS,
    IMAGE_FOLDER,
    IMAGE_BACKGROUND_FOLDER,
    IMAGE_CHARACTER_FOLDER,
    LEGACY_IMAGE_SEARCH_FOLDERS,
    LARGE_IMAGE_BYTES,
    isImageFileName,
    isFaviconFileName,
    imageMimeType,
    imageLabelList
};
