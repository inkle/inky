"use strict";

// Story pictures:
//   # image: hero.png          looks in the project's "image" folder
//   # bg: forest.jpg           looks in "image/background"
// A path in the tag is resolved from the project folder. A bare filename is searched in
// its tag's conventional folder (and at the project root for compatibility). The old "images"
// folder is a read-only fallback for existing projects; new imports use "image".

const fs = require("fs");
const path = require("path");
const {
    isImageFileName,
    IMAGE_FOLDER,
    IMAGE_BACKGROUND_FOLDER,
    LEGACY_IMAGE_SEARCH_FOLDERS
} = require("./imageTypes.js");

function parseImageTag(tag) {
    const match = /^\s*#?\s*image\s*:\s*(.*?)\s*$/i.exec(String(tag == null ? "" : tag));
    return match ? { kind: "image", reference: match[1].trim() } : null;
}

function parseBackgroundTag(tag) {
    const match = /^\s*#?\s*bg\s*:\s*(.*?)\s*$/i.exec(String(tag == null ? "" : tag));
    return match ? { kind: "background", reference: match[1].trim() } : null;
}

function parseStoryPictureTag(tag) {
    return parseImageTag(tag) || parseBackgroundTag(tag);
}

function imageTagKey(kind, reference) {
    return String(kind || "image") + "\u0000" + String(reference || "");
}

function collectImagesFromStory(storyJson) {
    const references = new Map();
    const visit = node => {
        if( Array.isArray(node) ) {
            let tagText = null;
            node.forEach(item => {
                if( item === "#" ) { tagText = ""; return; }
                if( item === "/#" ) { if( tagText !== null ) check(tagText); tagText = null; return; }
                if( tagText !== null && typeof item === "string" && item.charAt(0) === "^" ) { tagText += item.slice(1); return; }
                visit(item);
            });
            return;
        }
        if( node && typeof node === "object" ) {
            if( typeof node["#"] === "string" ) check(node["#"]);
            Object.keys(node).forEach(key => visit(node[key]));
        }
    };
    const check = text => {
        const tag = parseStoryPictureTag(text);
        if( tag && tag.reference ) references.set(imageTagKey(tag.kind, tag.reference), tag);
    };
    visit(storyJson);
    const found = Array.from(references.values()).sort((a, b) =>
        a.kind.localeCompare(b.kind) || a.reference.localeCompare(b.reference));
    return {
        files: Array.from(new Set(found.map(item => item.reference))).sort(),
        references: found
    };
}

function insideProject(root, candidate) {
    const relative = path.relative(root, candidate);
    return !!relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}

function existingFile(candidate) {
    try { return fs.statSync(candidate).isFile(); }
    catch(error) { return false; }
}

function resolveImageReference(projectDir, reference, kind) {
    const value = String(reference == null ? "" : reference).trim().replace(/\\/g, "/");
    if( !value ) return { kind: "invalid" };
    if( /^https?:\/\//i.test(value) ) return { kind: "remote" };
    if( value.startsWith("//") ) return { kind: "invalid" };
    if( /^[a-z][a-z0-9+.-]*:/i.test(value) || path.posix.isAbsolute(value) ) return { kind: "invalid" };
    if( !isImageFileName(value) ) return { kind: "invalid" };
    const hasExplicitPrefix = /^\.\//.test(value) || /^(?:image|images)\//i.test(value);
    const relative = path.posix.normalize(value);
    if( relative === "." || relative === ".." || relative.startsWith("../") ) return { kind: "invalid" };
    if( !projectDir ) return { kind: "missing" };

    const root = path.resolve(projectDir);
    // Resolve the real project directory before trusting any image path. A symlink
    // inside image/ must not make an outside file available to Preview or export.
    let realRoot;
    try { realRoot = fs.realpathSync(root); }
    catch(error) { return { kind: "missing" }; }
    const defaultFolder = kind === "background" ? IMAGE_BACKGROUND_FOLDER : IMAGE_FOLDER;
    // A bare filename is resolved in its tag's conventional folder. Explicit image/ or ./ paths
    // are rooted at the project; other nested paths retain the older lookup behavior for existing
    // projects. The old plural "images" folder remains a read-only fallback.
    const candidates = [relative];
    if( !hasExplicitPrefix ) {
        candidates.push(defaultFolder + "/" + relative);
        if( kind === "background" ) candidates.push("images/backgrounds/" + relative);
        candidates.push("images/" + relative);
    }
    const matches = [];
    candidates.forEach(candidate => {
        const source = path.resolve(root, candidate.split("/").join(path.sep));
        if( !insideProject(root, source) || !existingFile(source) ) return;
        let realSource;
        try { realSource = fs.realpathSync(source); }
        catch(error) { return; }
        if( !insideProject(realRoot, realSource) ) return;
        if( !matches.some(match => match.source === source) ) matches.push({ source, relative: candidate });
    });

    if( matches.length > 1 ) {
        return { kind: "ambiguous", candidates: matches.map(match => match.relative) };
    }
    if( matches.length === 0 ) return { kind: "missing" };
    const match = matches[0];
    return {
        kind: "ok",
        source: match.source,
        relative: match.relative,
        defaulted: match.relative !== relative
    };
}

function walkImageFiles(projectDir, relativeRoot) {
    const absoluteRoot = path.join(projectDir, relativeRoot);
    const results = [];
    const scan = (absoluteDir, relativeDir) => {
        let entries;
        try { entries = fs.readdirSync(absoluteDir, { withFileTypes: true }); }
        catch(error) { return; }
        entries.forEach(entry => {
            if( entry.name === ".git" || entry.name === "node_modules" || entry.name === ".DS_Store" || entry.isSymbolicLink() ) return;
            const relativePath = relativeDir ? relativeDir + "/" + entry.name : entry.name;
            if( entry.isDirectory() ) scan(path.join(absoluteDir, entry.name), relativePath);
            else if( entry.isFile() && isImageFileName(entry.name) ) results.push(relativePath);
        });
    };
    scan(absoluteRoot, "");
    return results;
}

// Autocomplete values are filename-only for files directly inside the conventional folder.
// Files in nested/custom folders keep an explicit project-relative path, so the resolver never
// has to guess which subfolder the writer intended.
function listUsableImageFiles(projectDir, kind) {
    if( !projectDir ) return [];
    const names = new Set();
    if( kind === "background" ) {
        walkImageFiles(projectDir, IMAGE_BACKGROUND_FOLDER).forEach(relative => {
            names.add(relative.indexOf("/") === -1 ? relative : IMAGE_BACKGROUND_FOLDER + "/" + relative);
        });
        // Old projects may still keep backgrounds in images/backgrounds.
        walkImageFiles(projectDir, "images/backgrounds").forEach(relative => names.add("images/backgrounds/" + relative));
    } else {
        walkImageFiles(projectDir, IMAGE_FOLDER).forEach(relative => {
            names.add(relative.indexOf("/") === -1 ? relative : IMAGE_FOLDER + "/" + relative);
        });
        // Keep legacy assets discoverable without using the old folder for new imports.
        walkImageFiles(projectDir, "images").forEach(relative => names.add("images/" + relative));
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
}

function rewriteImageReferences(story, replacements) {
    const rewriteTag = text => {
        const parsed = parseStoryPictureTag(text);
        if( !parsed ) return text;
        const typedKey = imageTagKey(parsed.kind, parsed.reference);
        const replacement = replacements.has(typedKey) ? replacements.get(typedKey) : replacements.get(parsed.reference);
        // An empty replacement deliberately turns a failed reference into an inert
        // tag (image: or bg:). It must not create a broken image in the browser.
        if( replacement === undefined || replacement === null ) return text;
        return String(text).replace(/^((?:\s*#?\s*(?:image|bg)\s*:\s*))(.*?)(\s*)$/i,
            (_, prefix, value, suffix) => prefix + replacement + suffix);
    };
    const visit = node => {
        if( Array.isArray(node) ) {
            let tagTextIndexes = null;
            for( let index = 0; index < node.length; index++ ) {
                const item = node[index];
                if( item === "#" ) { tagTextIndexes = []; continue; }
                if( item === "/#" ) {
                    if( tagTextIndexes && tagTextIndexes.length ) {
                        const tagText = tagTextIndexes.map(tagIndex => node[tagIndex].slice(1)).join("");
                        const rewritten = rewriteTag(tagText);
                        if( rewritten !== tagText ) {
                            tagTextIndexes.forEach((tagIndex, part) => { node[tagIndex] = part === 0 ? "^" + rewritten : "^"; });
                        }
                    }
                    tagTextIndexes = null;
                    continue;
                }
                if( tagTextIndexes && typeof item === "string" && item.charAt(0) === "^" ) {
                    tagTextIndexes.push(index);
                    continue;
                }
                visit(item);
            }
            return;
        }
        if( node && typeof node === "object" ) {
            if( typeof node["#"] === "string" ) node["#"] = rewriteTag(node["#"]);
            Object.keys(node).forEach(key => visit(node[key]));
        }
    };
    visit(story);
}

module.exports = {
    parseImageTag,
    parseBackgroundTag,
    collectImagesFromStory,
    resolveImageReference,
    listUsableImageFiles,
    rewriteImageReferences,
    imageTagKey
};
