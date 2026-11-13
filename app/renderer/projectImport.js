"use strict";

// Importing files into a story's project. Only sound files, Ink scenes (.ink),
// YAML files (.yaml, .yml) and pictures are supported.
//   sound files -> the project's "audio" folder
//   .ink scenes -> the chosen folder (the project folder by default)
//   .yaml files -> the project folder (where the style file lives)
//   the favicon -> the project root as favicon.<extension>
//   other pictures -> the project's "image" folder, with their own name
const fs = require("fs");
const path = require("path");
const { AUDIO_EXTENSIONS, AUDIO_FOLDER } = require("./audioTags.js");
const { IMAGE_EXTENSIONS, FAVICON_EXTENSIONS, IMAGE_FOLDER, LARGE_IMAGE_BYTES, isFaviconFileName } = require("./imageTypes.js");
const GameStyle = require("./gameStyle.js").GameStyle;

const IMPORT_EXTENSIONS = AUDIO_EXTENSIONS.concat([".ink", ".yaml", ".yml"], IMAGE_EXTENSIONS);

function importKind(fileName) {
    const ext = path.extname(String(fileName || "")).toLowerCase();
    if( AUDIO_EXTENSIONS.indexOf(ext) !== -1 ) return "audio";
    if( ext === ".ink" ) return "ink";
    if( ext === ".yaml" || ext === ".yml" ) return "yaml";
    if( IMAGE_EXTENSIONS.indexOf(ext) !== -1 ) return "image";
    return null;
}

// Decide what would happen, without touching the disk.
// Returns { items: [{ source, name, kind, isFavicon, largeImage, imageBytes, destRel, destAbs, exists }], rejected: [{ name, reason }] }
function planImport(projectRoot, sourcePaths, folderRel) {
    const root = path.resolve(projectRoot);
    const plan = { items: [], rejected: [] };
    const taken = new Set();
    const folder = String(folderRel || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    let faviconSelected = false;

    (sourcePaths || []).forEach(source => {
        const name = path.basename(String(source || ""));
        const reject = reason => plan.rejected.push({ name: name || String(source), reason: reason });

        let stat;
        try { stat = fs.statSync(source); }
        catch(e) { return reject("file was not found"); }
        if( stat.isDirectory() ) return reject("folders cannot be imported");
        if( !stat.isFile() ) return reject("not a regular file");

        const kind = importKind(name);
        if( !kind ) return reject("unsupported file type (only audio, .ink, .yaml and images are allowed)");
        if( /[\x00-\x1f\\/]/.test(name) || name === "." || name === ".." ) return reject("invalid file name");

        const isFavicon = kind === "image" && isFaviconFileName(name);
        if( isFavicon && faviconSelected ) return reject("only one favicon image can be imported at a time");

        const destName = isFavicon ? "favicon" + path.extname(name).toLowerCase() : name;
        const destFolder = kind === "audio" ? AUDIO_FOLDER
            : (kind === "yaml" || isFavicon ? "" : (kind === "image" ? IMAGE_FOLDER : folder));
        const destAbs = path.resolve(root, destFolder, destName);
        if( !GameStyle.pathStaysInsideRoot(root, destAbs) ) return reject("destination is outside the story folder");

        let sameFile = false;
        try { sameFile = fs.existsSync(destAbs) && fs.realpathSync(destAbs) === fs.realpathSync(source); } catch(e) { sameFile = false; }
        if( sameFile ) return reject("already in the project at this location");

        const replacedFavicons = isFavicon
            ? FAVICON_EXTENSIONS
                .filter(extension => extension !== path.extname(destName).toLowerCase())
                .map(extension => path.join(root, "favicon" + extension))
                .filter(filePath => fs.existsSync(filePath))
            : [];
        const key = destAbs.toLowerCase();
        if( taken.has(key) ) return reject("another selected file has the same name");
        taken.add(key);
        if( isFavicon ) faviconSelected = true;

        plan.items.push({
            source: source,
            name: name,
            kind: kind,
            isFavicon: isFavicon,
            largeImage: kind === "image" && stat.size > LARGE_IMAGE_BYTES,
            imageBytes: kind === "image" ? stat.size : 0,
            destRel: path.relative(root, destAbs).split(path.sep).join("/"),
            destAbs: destAbs,
            exists: fs.existsSync(destAbs) || replacedFavicons.length > 0,
            replacedFavicons: replacedFavicons
        });
    });
    return plan;
}

// Copy the planned files. replaceExisting decides what happens to files that already exist.
// Returns { imported: [item], skipped: [item], failed: [{ item, error }] }
function applyImport(plan, options) {
    const replaceExisting = !!(options && options.replaceExisting);
    const result = { imported: [], skipped: [], failed: [] };
    plan.items.forEach(item => {
        if( item.exists && !replaceExisting ) { result.skipped.push(item); return; }
        try {
            fs.mkdirSync(path.dirname(item.destAbs), { recursive: true });
            fs.copyFileSync(item.source, item.destAbs);
            (item.replacedFavicons || []).forEach(filePath => fs.unlinkSync(filePath));
            result.imported.push(item);
        } catch(error) {
            result.failed.push({ item: item, error: error.message || String(error) });
        }
    });
    return result;
}

module.exports = { IMPORT_EXTENSIONS, importKind, planImport, applyImport };
