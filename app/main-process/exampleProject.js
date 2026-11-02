"use strict";

const fs = require("fs");
const path = require("path");

const EXAMPLE_FOLDER = "mare-de-vidro";
const EXAMPLE_STORY = path.join("short", "story.ink");

// The sample project ships beside app.asar in a package, and lives in the
// repository's examples folder when Inky runs from source.
function bundledExamplePath(resourcesPath, appRoot) {
    const candidates = [];
    if( resourcesPath ) candidates.push(path.join(resourcesPath, EXAMPLE_FOLDER, EXAMPLE_STORY));
    if( appRoot ) candidates.push(path.join(appRoot, "..", "examples", EXAMPLE_FOLDER, EXAMPLE_STORY));
    for( const candidate of candidates ) {
        try {
            if( fs.statSync(candidate).isFile() ) return path.resolve(candidate);
        } catch(error) { /* try the next location */ }
    }
    return null;
}

function isWritable(directory) {
    try {
        fs.accessSync(directory, fs.constants.W_OK);
        return true;
    } catch(error) {
        return false;
    }
}

// An installed Inky (.deb in /opt, AppImage) keeps the sample in a read-only folder, where the
// writer could not create files, rename or save. In that case the whole sample is copied once
// into destRoot and that copy is opened. A copy that already exists is left alone, so the
// writer's changes are never overwritten. Running from source (writable) opens the original.
// If the copy fails, the read-only original is still returned so Inky opens as before.
function writableExamplePath(resourcesPath, appRoot, destRoot) {
    const bundled = bundledExamplePath(resourcesPath, appRoot);
    if( !bundled || !destRoot ) return bundled;
    const storyFolder = path.dirname(bundled);
    if( isWritable(storyFolder) ) return bundled;

    const exampleRoot = path.dirname(storyFolder);
    const copiedStory = path.join(destRoot, EXAMPLE_STORY);
    try {
        if( !fs.statSync(copiedStory).isFile() ) throw new Error("not a file");
        return copiedStory;
    } catch(error) { /* not copied yet */ }
    try {
        fs.mkdirSync(destRoot, { recursive: true });
        // The copy must be writable even if the source tree is read-only (AppImage mounts, root-owned).
        fs.cpSync(exampleRoot, destRoot, { recursive: true, force: false, errorOnExist: false });
        const walk = directory => {
            fs.chmodSync(directory, 0o755);
            fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
                const entryPath = path.join(directory, entry.name);
                if( entry.isDirectory() ) walk(entryPath);
                else fs.chmodSync(entryPath, 0o644);
            });
        };
        walk(destRoot);
        if( fs.statSync(copiedStory).isFile() ) return copiedStory;
    } catch(error) {
        console.warn("Could not copy the sample project, opening it in place:", error.message);
    }
    return bundled;
}

module.exports = { bundledExamplePath, writableExamplePath };
