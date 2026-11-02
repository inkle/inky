"use strict";

// Pictures in a story:
//   # image: hero.png          a picture in the project's "images" (or "image") folder; no path needed
//   # image: chapter1/hero.png the same, in a subfolder of "images" (or "image")
//   # image: scenes/room.png   a picture at that path from the project folder
//   # image: https://…         a remote picture, loaded by the page and never copied
// A name is looked for at that path from the project folder first, then in "images", then in "image".
// The tag follows the paragraph it belongs to. Local pictures must stay inside the
// project folder, the same rule the Preview uses.

const fs = require("fs");
const path = require("path");
const { isImageFileName, IMAGE_SEARCH_FOLDERS } = require("./imageTypes.js");

// "image: x.jpg" -> { reference: "x.jpg" }. Case-insensitive ("IMAGE:" still works), like the exported page.
function parseImageTag(tag) {
    const match = /^\s*#?\s*image\s*:\s*(.*?)\s*$/i.exec(String(tag == null ? "" : tag));
    return match ? { reference: match[1].trim() } : null;
}

// Every picture named by an "# image:" tag in the compiled story JSON, without duplicates.
// In compiled ink a tag is "#", its text pieces (each starting with "^"), then "/#".
function collectImagesFromStory(storyJson) {
    const references = new Set();
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
        const tag = parseImageTag(text);
        if( tag && tag.reference ) references.add(tag.reference);
    };
    visit(storyJson);
    return { files: Array.from(references).sort() };
}

// How the exported page will load one reference, and where the file is on disk:
//   remote  - an http(s) picture, loaded from the web and never copied
//   invalid - a path that is not a plain picture inside the project
//   missing - a valid project path with no file there
//   ok      - source plus relative, the path the exported page loads (it differs from the tag
//             when the picture was found in "images" or "image": defaulted is then true)
function resolveImageReference(projectDir, reference) {
    const value = String(reference == null ? "" : reference).trim().replace(/\\/g, "/");
    if( !value ) return { kind: "invalid" };
    if( /^https?:\/\//i.test(value) ) return { kind: "remote" };
    if( value.startsWith("//") ) return { kind: "invalid" };
    if( /^[a-z][a-z0-9+.-]*:/i.test(value) || path.posix.isAbsolute(value) ) return { kind: "invalid" };
    if( !isImageFileName(value) ) return { kind: "invalid" };
    const relative = path.posix.normalize(value);
    if( relative === "." || relative === ".." || relative.startsWith("../") ) return { kind: "invalid" };
    if( !projectDir ) return { kind: "missing" };
    const root = path.resolve(projectDir);
    const source = path.resolve(root, relative.split("/").join(path.sep));
    const inside = path.relative(root, source);
    if( !inside || inside === ".." || inside.startsWith(".." + path.sep) || path.isAbsolute(inside) )
        return { kind: "invalid" };
    // At the path written, then in the default picture folders.
    const candidates = [relative].concat(IMAGE_SEARCH_FOLDERS.map(folder => folder + "/" + relative));
    for( const candidate of candidates ) {
        const candidateSource = path.resolve(root, candidate.split("/").join(path.sep));
        try {
            if( fs.statSync(candidateSource).isFile() )
                return { kind: "ok", source: candidateSource, relative: candidate, defaulted: candidate !== relative };
        } catch(error) { /* not there */ }
    }
    return { kind: "missing" };
}

// The pictures the editor's list offers: only those inside the "images" and "image" folders (and
// their subfolders), by the name the bare tag finds them. Pictures anywhere else in the project
// still work when their path is written by hand, they are just not listed.
function listUsableImageFiles(projectDir) {
    const names = new Set();
    if( !projectDir ) return [];
    const scan = (absoluteDir, relativeDir) => {
        let entries;
        try { entries = fs.readdirSync(absoluteDir, { withFileTypes: true }); }
        catch(e) { return; }
        entries.forEach(entry => {
            if( entry.name === ".git" || entry.name === "node_modules" || entry.name === ".DS_Store" || entry.isSymbolicLink() ) return;
            const relativePath = relativeDir ? relativeDir + "/" + entry.name : entry.name;
            if( entry.isDirectory() ) scan(path.join(absoluteDir, entry.name), relativePath);
            else if( entry.isFile() && isImageFileName(entry.name) ) names.add(relativePath);
        });
    };
    IMAGE_SEARCH_FOLDERS.forEach(folder => scan(path.join(projectDir, folder), ""));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
}

// Rewrites "# image:" tags of the compiled story so each name points at the path the exported
// page loads (replacements: Map of the name written in the tag -> the exported relative path).
function rewriteImageReferences(story, replacements) {
    const rewriteTag = text => {
        const match = /^(\s*#?\s*image\s*:\s*)(.*?)(\s*)$/i.exec(text);
        if( !match ) return text;
        const replacement = replacements.get(match[2].trim());
        return replacement ? match[1] + replacement + match[3] : text;
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
    collectImagesFromStory,
    resolveImageReference,
    listUsableImageFiles,
    rewriteImageReferences
};
