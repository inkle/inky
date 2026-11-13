"use strict";

// Sound tags in a story:
//   # music: forest.mp3   loops until another music tag; "# music: stop" ends it
//   # sound: branch.mp3   plays once
// Bare names use the matching category folder. Explicit relative paths can address any file
// inside the project. Files directly in "audio" remain available as a general-purpose fallback.

const fs = require("fs");
const path = require("path");

const AUDIO_EXTENSIONS = [".mp3", ".ogg", ".oga", ".wav", ".m4a", ".aac", ".flac", ".opus", ".webm"];
const AUDIO_FOLDER = "audio";
const AUDIO_MUSIC_FOLDER = path.join(AUDIO_FOLDER, "music");
const AUDIO_SFX_FOLDER = path.join(AUDIO_FOLDER, "sfx");
// Read-only lookup fallback for older projects. New imports always use "audio".
const LEGACY_AUDIO_FOLDERS = ["audios"];
const LEGACY_MUSIC_SUBFOLDERS = ["musics"];
const AUDIO_FOLDERS = [AUDIO_FOLDER].concat(LEGACY_AUDIO_FOLDERS);
const MUSIC_FOLDERS = ["music"].concat(LEGACY_MUSIC_SUBFOLDERS);
const SFX_FOLDER = "sfx";

function safeAudioFile(value) {
    const name = String(value == null ? "" : value).trim().replace(/^['"]|['"]$/g, "");
    if( !name || /[\\/\x00-\x1f]/.test(name) || name === "." || name === ".." ) return null;
    const dot = name.lastIndexOf(".");
    if( dot <= 0 || AUDIO_EXTENSIONS.indexOf(name.slice(dot).toLowerCase()) === -1 ) return null;
    return name;
}

function safeAudioReference(value) {
    const reference = String(value == null ? "" : value).trim().replace(/^['"]|['"]$/g, "");
    if( !reference || /[\x00-\x1f]/.test(reference) || /^[a-z][a-z0-9+.-]*:\/\//i.test(reference) ) return null;
    const extension = path.extname(reference.replace(/\\/g, "/")).toLowerCase();
    if( AUDIO_EXTENSIONS.indexOf(extension) === -1 ) return null;
    return reference;
}

function parseAudioTag(tag) {
    const match = /^\s*#?\s*(music|sound)\s*:\s*(.*?)\s*$/i.exec(String(tag == null ? "" : tag));
    if( !match ) return null;
    const kind = match[1].toLowerCase();
    const value = match[2];
    if( kind === "music" && /^(stop|none|off)$/i.test(value) ) return { kind: kind, file: null };
    if( kind === "sound" && /^stop$/i.test(value) ) return { kind: kind, stop: true };
    const file = safeAudioReference(value);
    return file ? { kind: kind, file: file } : { kind: kind, invalid: value };
}

function isSoundTag(tag) {
    return /^\s*#?\s*(music|sound)\s*:/i.test(String(tag == null ? "" : tag));
}

function collectAudioFromStory(storyJson) {
    const files = new Set();
    const musicFiles = new Set();
    const soundFiles = new Set();
    let usesAudio = false;
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
        const tag = parseAudioTag(text);
        if( !tag ) return;
        usesAudio = true;
        if( tag.file ) {
            files.add(tag.file);
            (tag.kind === "music" ? musicFiles : soundFiles).add(tag.file);
        }
        else if( tag.invalid ) files.add("\u0000" + tag.invalid);
    };
    visit(storyJson);
    const names = Array.from(files).sort();
    return {
        usesAudio: usesAudio,
        files: names.filter(name => name.charAt(0) !== "\u0000"),
        musicFiles: Array.from(musicFiles).sort(),
        soundFiles: Array.from(soundFiles).sort(),
        invalid: names.filter(name => name.charAt(0) === "\u0000").map(name => name.slice(1))
    };
}

function isAudioFileName(name) {
    return AUDIO_EXTENSIONS.indexOf(path.extname(String(name || "")).toLowerCase()) !== -1;
}

function projectRelativePath(projectDir, file) {
    const platformPath = String(file).replace(/[\\/]/g, path.sep);
    const normalized = path.normalize(platformPath);
    if( normalized === ".." || normalized.startsWith(".." + path.sep) ) return null;
    const root = path.resolve(projectDir);
    const candidate = path.resolve(root, normalized);
    const relative = path.relative(root, candidate);
    if( !relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative) ) return null;
    return candidate;
}

function existingAudioFile(candidate, projectRoot) {
    try {
        if( !fs.statSync(candidate).isFile() ) return false;
        // A symlink may point outside the project even when its visible path is inside it.
        // Only files that really live within this project are eligible for playback/export.
        const root = fs.realpathSync(projectRoot);
        const target = fs.realpathSync(candidate);
        const relative = path.relative(root, target);
        return relative !== "" && relative !== ".." &&
            !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
    } catch(error) { return false; }
}

function audioTagKey(kind, reference) {
    return String(kind || "sound") + "\u0000" + String(reference || "");
}

// Return detailed status so the exporter can report ambiguous basenames rather than silently
// choosing one. A bare name checks the project root, audio/, and only the category matching the tag.
function resolveAudioReference(projectDir, name, kind) {
    const file = safeAudioReference(name);
    if( !projectDir || !file ) return { kind: "invalid" };
    const normalized = file.replace(/\\/g, "/");
    const explicit = /\//.test(normalized) || path.isAbsolute(file);
    const root = path.resolve(projectDir);
    if( explicit ) {
        const candidate = projectRelativePath(root, normalized);
        if( !candidate ) return { kind: "invalid" };
        return existingAudioFile(candidate, root)
            ? { kind: "ok", source: candidate, relative: path.relative(root, candidate).split(path.sep).join("/"), defaulted: false }
            : { kind: "missing" };
    }

    let categoryFolders;
    if( kind === "music" ) {
        categoryFolders = [AUDIO_MUSIC_FOLDER]
            .concat(LEGACY_MUSIC_SUBFOLDERS.map(folder => path.join(AUDIO_FOLDER, folder)))
            .concat(LEGACY_AUDIO_FOLDERS.flatMap(folder => [path.join(folder, "music")].concat(LEGACY_MUSIC_SUBFOLDERS.map(sub => path.join(folder, sub)))));
    } else if( kind === "sound" ) {
        categoryFolders = [AUDIO_SFX_FOLDER].concat(LEGACY_AUDIO_FOLDERS.map(folder => path.join(folder, SFX_FOLDER)));
    } else {
        categoryFolders = [AUDIO_MUSIC_FOLDER, AUDIO_SFX_FOLDER]
            .concat(LEGACY_MUSIC_SUBFOLDERS.map(folder => path.join(AUDIO_FOLDER, folder)))
            .concat(LEGACY_AUDIO_FOLDERS.flatMap(folder => [path.join(folder, "music"), path.join(folder, SFX_FOLDER)]));
    }
    const relativeCandidates = [file]
        .concat(AUDIO_FOLDERS.map(folder => path.join(folder, file)))
        .concat(categoryFolders.map(folder => path.join(folder, file)));
    const matches = [];
    relativeCandidates.forEach(relative => {
        const candidate = path.resolve(root, relative);
        if( !projectRelativePath(root, relative) || !existingAudioFile(candidate, root) ) return;
        if( !matches.some(match => match.source === candidate) )
            matches.push({ source: candidate, relative: relative.split(path.sep).join("/") });
    });
    if( matches.length > 1 ) return { kind: "ambiguous", candidates: matches.map(match => match.relative) };
    if( matches.length === 0 ) return { kind: "missing" };
    return {
        kind: "ok",
        source: matches[0].source,
        relative: matches[0].relative,
        defaulted: matches[0].relative !== file
    };
}

function resolveAudioFile(projectDir, name, kind) {
    const resolved = resolveAudioReference(projectDir, name, kind);
    return resolved.kind === "ok" ? resolved.source : null;
}

function listUsableAudioFiles(projectDir, kind) {
    if( !projectDir ) return [];
    const bareCandidates = new Map();
    const explicit = new Set();
    const allowedRoots = AUDIO_FOLDERS;

    const categoryFor = relativeDir => {
        const parts = relativeDir.split(path.sep).filter(Boolean);
        if( parts.length < 2 || allowedRoots.indexOf(parts[0]) === -1 ) return null;
        const category = parts[1];
        if( MUSIC_FOLDERS.indexOf(category) !== -1 ) return parts.length === 2 ? "music" : "music-nested";
        if( category === SFX_FOLDER ) return parts.length === 2 ? "sound" : "sound-nested";
        return "custom";
    };

    const addBare = (name, relative) => {
        if( !bareCandidates.has(name) ) bareCandidates.set(name, []);
        bareCandidates.get(name).push(relative);
    };

    const scan = (absoluteDir, relativeDir) => {
        let entries;
        try { entries = fs.readdirSync(absoluteDir, { withFileTypes: true }); }
        catch(error) { return; }
        entries.forEach(entry => {
            if( entry.name === ".git" || entry.name === "node_modules" || entry.name === ".DS_Store" || entry.isSymbolicLink() ) return;
            const relativePath = path.join(relativeDir, entry.name);
            if( entry.isDirectory() ) {
                scan(path.join(absoluteDir, entry.name), relativePath);
                return;
            }
            if( !entry.isFile() || !isAudioFileName(entry.name) ) return;
            const relativeDirPath = path.dirname(relativePath);
            const category = categoryFor(relativeDirPath === "." ? "" : relativeDirPath);
            if( (category === "music" || category === "music-nested") && kind === "sound" ) return;
            if( (category === "sound" || category === "sound-nested") && kind === "music" ) return;
            const isDirectGeneral = relativeDirPath === AUDIO_FOLDER || relativeDirPath === "audios";
            const isDirectCategory = category === "music" || category === "sound";
            if( isDirectGeneral || isDirectCategory ) addBare(entry.name, relativePath);
            else explicit.add(relativePath.split(path.sep).join("/"));
        });
    };

    allowedRoots.forEach(folder => scan(path.join(projectDir, folder), folder));

    const names = new Set(explicit);
    bareCandidates.forEach((locations, name) => {
        if( locations.length === 1 ) names.add(name);
        else locations.forEach(relative => names.add(relative.split(path.sep).join("/")));
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
}

module.exports = {
    isSoundTag,
    isAudioFileName,
    resolveAudioFile,
    resolveAudioReference,
    listUsableAudioFiles,
    AUDIO_EXTENSIONS,
    AUDIO_FOLDER,
    AUDIO_MUSIC_FOLDER,
    AUDIO_SFX_FOLDER,
    AUDIO_FOLDERS,
    LEGACY_AUDIO_FOLDERS,
    safeAudioFile,
    safeAudioReference,
    parseAudioTag,
    collectAudioFromStory,
    audioTagKey
};
