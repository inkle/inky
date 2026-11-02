"use strict";

const path = require("path");

// The picture formats a project may hold. A favicon is a picture too, but only in
// these three formats; a cover accepts the usual photo formats, but never .ico.
const FAVICON_EXTENSIONS = [".ico", ".png", ".svg"];
const COVER_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"];
const IMAGE_EXTENSIONS = Array.from(new Set(FAVICON_EXTENSIONS.concat(COVER_EXTENSIONS)));
// Imported pictures that are not the project's favicon live here, as audio lives in "audio".
const IMAGE_FOLDER = "images";
// Where a bare "# image: hero.png" is looked for when it is not at the project root: "images", then "image".
const IMAGE_SEARCH_FOLDERS = [IMAGE_FOLDER, "image"];
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
    IMAGE_SEARCH_FOLDERS,
    LARGE_IMAGE_BYTES,
    isImageFileName,
    isFaviconFileName,
    imageMimeType,
    imageLabelList
};
