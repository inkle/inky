"use strict";

// Sound tags in a story:
//   # music: forest.mp3   loops until another music tag; "# music: stop" ends it
//   # sound: branch.mp3   plays once
// Bare file names are searched in the standard sound folders; explicit paths can name other files.

const fs = require("fs");
const path = require("path");

const AUDIO_EXTENSIONS = [".mp3", ".ogg", ".oga", ".wav", ".m4a", ".aac", ".flac", ".opus", ".webm"];
const AUDIO_FOLDER = "audio";
// The standard sound folders, in search order: "audio" (where imports go) and "audios". A bare name
// is looked for in each of them and in their "music", "musics" and "sfx" subfolders.
const AUDIO_FOLDERS = [AUDIO_FOLDER, "audios"];
const AUDIO_SUBFOLDERS = ["music", "musics", "sfx"];
const MUSIC_FOLDERS = ["music", "musics"];

// A plain file name from the audio folder, or null (paths, "..", other file types).
function safeAudioFile(value) {
    const name = String(value == null ? "" : value).trim().replace(/^["']|["']$/g, "");
    if( !name || /[\\/\x00-\x1f]/.test(name) || name === "." || name === ".." ) return null;
    const dot = name.lastIndexOf(".");
    if( dot <= 0 || AUDIO_EXTENSIONS.indexOf(name.slice(dot).toLowerCase()) === -1 ) return null;
    return name;
}

function safeAudioReference(value) {
    const reference = String(value == null ? "" : value).trim().replace(/^["']|["']$/g, "");
    if( !reference || /[\x00-\x1f]/.test(reference) || /^[a-z][a-z0-9+.-]*:\/\//i.test(reference) ) return null;
    const extension = path.extname(reference.replace(/\\/g, "/")).toLowerCase();
    if( AUDIO_EXTENSIONS.indexOf(extension) === -1 ) return null;
    return reference;
}

// "music: x.mp3" -> { kind: "music", file: "x.mp3" }; "music: stop" -> { kind: "music", file: null };
// "sound: x.mp3" -> { kind: "sound", file: "x.mp3" }. Anything else -> null.
// A name that is not a safe audio file name comes back as { kind, invalid: "name" }.
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

// True for any sound tag: music and sound. These tags drive the sound player and are never shown
// to the writer or the player as text.
function isSoundTag(tag) {
    return /^\s*#?\s*(music|sound)\s*:/i.test(String(tag == null ? "" : tag));
}

// Every music/sound file named in a compiled story (the JSON that inklecate writes), and whether
// the story uses sound at all.
function collectAudioFromStory(storyJson) {
    const files = new Set();
    const musicFiles = new Set();
    const soundFiles = new Set();
    let usesAudio = false;
    // In compiled ink a tag is "#", its text pieces (each starting with "^"), then "/#".
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

// True for a file name with a sound extension (any letter case): song.mp3, Song.MP3, step.wav...
function isAudioFileName(name) {
    return AUDIO_EXTENSIONS.indexOf(path.extname(String(name || "")).toLowerCase()) !== -1;
}

// Bare names use the standard folder order; explicit paths are resolved directly from the project
// directory (or from the filesystem root when absolute).
function resolveAudioFile(projectDir, name) {
    const file = safeAudioReference(name);
    if( !projectDir || !file ) return null;
    const platformPath = file.replace(/[\\/]/g, path.sep);
    if( path.isAbsolute(platformPath) || /[\\/]/.test(file) ) {
        const candidate = path.isAbsolute(platformPath) ? platformPath : path.resolve(projectDir, platformPath);
        try { if( fs.statSync(candidate).isFile() ) return candidate; }
        catch(e) { /* not there */ }
        return null;
    }
    const candidates = [];
    AUDIO_FOLDERS.forEach(folder => {
        candidates.push(path.join(projectDir, folder, file));
        AUDIO_SUBFOLDERS.forEach(sub => candidates.push(path.join(projectDir, folder, sub, file)));
    });
    AUDIO_SUBFOLDERS.forEach(sub => candidates.push(path.join(projectDir, sub, file)));
    candidates.push(path.join(projectDir, file));
    for( const candidate of candidates ) {
        try { if( fs.statSync(candidate).isFile() ) return candidate; }
        catch(e) { /* not there */ }
    }
    return null;
}

// A music/musics folder is a music location only when it sits inside audio or audios
// (audio/music, audios/musics...). The same folder at the project root is not offered as music.
function isMusicFolderAllowed(relativeDir) {
    const segments = relativeDir.split(path.sep).filter(Boolean);
    const musicIndex = segments.findIndex(segment => MUSIC_FOLDERS.indexOf(segment) !== -1);
    if( musicIndex === -1 ) return true;
    return segments.slice(0, musicIndex).some(segment => AUDIO_FOLDERS.indexOf(segment) !== -1);
}

// The sound files the editor's list offers: only those inside the "audio" and "audios" folders and
// their subfolders. Bare names are offered for the standard places (the folder itself and its
// music, musics and sfx subfolders); any other subfolder is offered with its project-relative path.
// A sound anywhere else in the project still works when its path is written by hand, it is just
// not listed. A "music" list leaves out music/musics folders that are not inside audio or audios.
function listUsableAudioFiles(projectDir, kind) {
    const names = new Set();
    if( !projectDir ) return [];
    const standardDirectories = new Set(AUDIO_FOLDERS.concat(
        ...AUDIO_FOLDERS.map(folder => AUDIO_SUBFOLDERS.map(sub => path.join(folder, sub)))
    ));
    const scan = (absoluteDir, relativeDir) => {
        let entries;
        try { entries = fs.readdirSync(absoluteDir, { withFileTypes: true }); }
        catch(e) { return; }
        entries.forEach(entry => {
            if( entry.name === ".git" || entry.name === "node_modules" || entry.name === ".DS_Store" || entry.isSymbolicLink() ) return;
            const relativePath = path.join(relativeDir, entry.name);
            if( entry.isDirectory() ) {
                scan(path.join(absoluteDir, entry.name), relativePath);
            } else if( entry.isFile() && isAudioFileName(entry.name) ) {
                if( kind === "music" && !isMusicFolderAllowed(relativeDir) ) return;
                names.add(standardDirectories.has(relativeDir) ? entry.name : relativePath.split(path.sep).join("/"));
            }
        });
    };
    AUDIO_FOLDERS.forEach(folder => scan(path.join(projectDir, folder), folder));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
}

module.exports = {
    isSoundTag,
    isAudioFileName,
    resolveAudioFile,
    listUsableAudioFiles, AUDIO_EXTENSIONS, AUDIO_FOLDER, AUDIO_FOLDERS, safeAudioFile, safeAudioReference, parseAudioTag, collectAudioFromStory };
