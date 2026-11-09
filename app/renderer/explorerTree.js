"use strict";

// The Explorer's data. jsTree draws the tree, handles selection, keyboard, inline editing and
// dragging; this module only turns the project (documents, folders, sound and picture files)
// into the node list jsTree loads, and answers the few questions the Explorer asks about nodes.
//
// Node ids are stable across redraws: "root" for the project folder, "d:<path>" for a folder and
// "f:<path>" for a file, so open folders and the selection survive a refresh.

const fs = require("fs");
const path = require("path");

const IGNORED_FOLDERS = [".git", "node_modules", ".DS_Store"];

const ROOT_ID = "root";
const folderId = folderPath => folderPath ? "d:" + folderPath : ROOT_ID;
const fileId = filePath => "f:" + filePath;

function normalizePath(value) {
    return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

// Every sub-folder of the project, as relative paths ("a", "a/b"), empty ones included.
function scanFolders(projectDir) {
    const collected = [];
    const scan = (absoluteDir, relativeDir) => {
        let entries;
        try { entries = fs.readdirSync(absoluteDir, { withFileTypes: true }); }
        catch(error) { return; }
        entries.forEach(entry => {
            if( !entry.isDirectory() || entry.isSymbolicLink() ) return;
            if( IGNORED_FOLDERS.indexOf(entry.name) !== -1 ) return;
            const relative = relativeDir ? relativeDir + "/" + entry.name : entry.name;
            collected.push(relative);
            scan(path.join(absoluteDir, entry.name), relative);
        });
    };
    if( projectDir && fs.existsSync(projectDir) ) scan(projectDir, "");
    return collected;
}

const FOLDER_ICON =
    '<span class="icon folder-icon" aria-hidden="true">' +
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">' +
        '<path class="folder-icon-closed" d="M1.5 4.5a1 1 0 0 1 1-1h3.1l1.3 1.4h6.6a1 1 0 0 1 1 1v5.6a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1z"/>' +
        '<path class="folder-icon-open" d="M1.5 5a1 1 0 0 1 1-1h3.1l1.2 1.2h6.7a1 1 0 0 1 1 1v.5H5a1 1 0 0 0-1 .7l-1.2 4.1a1 1 0 0 1-1.3-1z"/>' +
        '<path class="folder-icon-open folder-icon-open-face" d="M4.2 7.2h10.3l-1.4 4.2H3z"/>' +
      '</svg>' +
    '</span>';
const AUDIO_ICON =
    '<span class="icon icon-audio"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6h2.2L8 3.2v9.6L4.7 10H2.5z" fill="currentColor"/><path class="audio-wave" d="M10.3 5.7a3.3 3.3 0 0 1 0 4.6"/><path class="audio-wave" d="M12 4a5.6 5.6 0 0 1 0 8"/></svg></span>';
const IMAGE_ICON =
    '<span class="icon image-file-icon"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="1"/><circle cx="5" cy="6" r="1.2"/><path d="m2 11 3.5-3 2.5 2 2-2 4 3"/></svg></span>';

// What a document row says: the name, with the ".ink" kept visible even when the stem is cut short.
function documentText(file, escapeHtml) {
    const raw = String(file.filename() || "");
    const visible = file.isInkFile && !/\.ink$/i.test(raw) ? raw + ".ink" : raw;
    const icon = '<span class="icon ' + (file.isYamlFile ? "icon-doc-text" : "icon-doc") + '"></span>';
    if( file.isInkFile && /\.ink$/i.test(visible) ) {
        return icon + '<span class="filename ink-filename"><span class="filename-stem">' + escapeHtml(visible.slice(0, -4)) +
            '</span><span class="filename-extension">' + escapeHtml(visible.slice(-4)) + '</span></span>';
    }
    return icon + '<span class="filename">' + escapeHtml(visible) + '</span>';
}

// options: { mainInk, allFiles, projectDir, folders, audioFiles, imageFiles, openState,
//            selectedIds (Set), playingAudioPath, escapeHtml }
function buildExplorerNodes(options) {
    const escapeHtml = options.escapeHtml || (value => String(value));
    const openState = options.openState || {};
    const selectedIds = options.selectedIds || new Set();
    const isOpen = folderPath => openState[folderPath] !== false;

    // The main story is a document like any other; de-duplicate by relative path.
    const documents = new Map();
    [options.mainInk].concat(options.allFiles || []).forEach(file => {
        if( !file || (file !== options.mainInk && !file.isInkFile && !file.isYamlFile) ) return;
        const relative = normalizePath(file.relativePath());
        if( relative && !documents.has(relative) ) documents.set(relative, file);
    });

    // A folder tree: first the folders on disk (empty ones too), then every file's own folder.
    const rootFolder = { name: "", path: "", children: Object.create(null), files: [] };
    const ensureFolder = relativeFolder => {
        let current = rootFolder;
        let currentPath = "";
        normalizePath(relativeFolder).split("/").filter(Boolean).forEach(segment => {
            currentPath = currentPath ? currentPath + "/" + segment : segment;
            if( !current.children[segment] ) current.children[segment] = { name: segment, path: currentPath, children: Object.create(null), files: [] };
            current = current.children[segment];
        });
        return current;
    };
    (options.folders || []).forEach(folderPath => ensureFolder(folderPath));

    const entries = [];
    documents.forEach((file, relative) => {
        entries.push({ kind: file.isYamlFile ? "yaml" : "ink", relative: relative, file: file });
    });
    (options.audioFiles || []).forEach(raw => entries.push({ kind: "audio", relative: normalizePath(raw) }));
    (options.imageFiles || []).forEach(raw => entries.push({ kind: "image", relative: normalizePath(raw) }));
    entries.forEach(entry => {
        const folder = path.posix.dirname(entry.relative);
        (folder === "." ? rootFolder : ensureFolder(folder)).files.push(entry);
    });

    const nodes = [];
    const classesOf = (entry) => {
        const file = entry.file;
        const classes = ["ex-row", "ex-file", "ex-" + entry.kind];
        if( file && file.hasUnsavedChanges ) classes.push("ex-unsaved");
        if( file && file.isLoading ) classes.push("ex-loading");
        if( file && file.isActive ) classes.push("ex-active");
        if( entry.kind === "audio" && options.playingAudioPath === entry.relative ) classes.push("ex-playing");
        return classes.join(" ");
    };
    const addFile = (entry, parentId) => {
        const name = path.posix.basename(entry.relative);
        const id = fileId(entry.relative);
        let text;
        if( entry.kind === "audio" ) text = AUDIO_ICON + '<span class="filename">' + escapeHtml(name) + '</span>';
        else if( entry.kind === "image" ) text = IMAGE_ICON + '<span class="filename">' + escapeHtml(name) + '</span>';
        else text = documentText(entry.file, escapeHtml);
        const title = entry.kind === "audio" ? entry.relative + " — click to listen"
            : entry.kind === "image" ? entry.relative + " — click to preview" : entry.relative;
        const attributes = { "class": classesOf(entry), "title": title, "data-relative-path": entry.relative };
        if( entry.file && entry.file.id !== undefined && entry.file.id !== null ) attributes["data-file-id"] = String(entry.file.id);
        nodes.push({
            id: id,
            parent: parentId,
            text: text,
            state: { opened: false, selected: selectedIds.has(id) },
            a_attr: attributes,
            data: {
                type: "file",
                kind: entry.kind,
                path: entry.relative,
                name: entry.file ? String(entry.file.filename() || name) : name,
                fileId: entry.file && entry.file.id !== undefined && entry.file.id !== null ? entry.file.id : null
            }
        });
    };
    const byName = (a, b) => a.localeCompare(b);
    const addFolder = (folder, parentId) => {
        const id = folderId(folder.path);
        nodes.push({
            id: id,
            parent: parentId,
            text: FOLDER_ICON + '<span class="filename">' + escapeHtml(folder.name) + '</span>',
            state: { opened: isOpen(folder.path), selected: selectedIds.has(id) },
            a_attr: { "class": "ex-row ex-folder", "data-folder-path": folder.path },
            data: { type: "folder", kind: "folder", path: folder.path, name: folder.name }
        });
        addChildren(folder, id);
    };
    // Folders first, then files, each in alphabetical order: the default VS Code ordering.
    const addChildren = (folder, parentId) => {
        Object.keys(folder.children).sort(byName).forEach(key => addFolder(folder.children[key], parentId));
        folder.files.sort((a, b) => byName(path.posix.basename(a.relative), path.posix.basename(b.relative)))
            .forEach(entry => addFile(entry, parentId));
    };

    const projectName = options.projectDir ? path.basename(path.resolve(options.projectDir)) : "Project";
    nodes.push({
        id: ROOT_ID,
        parent: "#",
        text: FOLDER_ICON + '<span class="filename">' + escapeHtml(projectName) + '</span>',
        state: { opened: isOpen(""), selected: selectedIds.has(ROOT_ID) },
        a_attr: { "class": "ex-row ex-folder ex-root", "title": options.projectDir || projectName, "data-folder-path": "" },
        data: { type: "folder", kind: "root", root: true, path: "", name: projectName }
    });
    addChildren(rootFolder, ROOT_ID);
    return nodes;
}

// The project folder ("" for its root) a drop on this jsTree node goes to: a folder takes it, a
// file hands it to its own folder, and the tree's blank space ("#") is the project folder.
function dropFolderOf(node) {
    if( !node || node.id === "#" ) return "";
    const data = node.data || {};
    if( data.root ) return "";
    if( data.type === "folder" ) return data.path || "";
    const parent = path.posix.dirname(String(data.path || "."));
    return parent === "." ? "" : parent;
}

// A folder cannot go into itself or into one of its own sub-folders.
function canMoveInto(items, folder) {
    return items.length > 0 && items.every(item => !(item.type === "folder" && (folder === item.path || folder.startsWith(item.path + "/"))));
}

// What the rest of the app calls an item: { type, path, name, fileId, audio }, or null for the
// project folder and for the row being typed.
function nodeTarget(node) {
    const data = node && node.data;
    if( !data || data.root || data.pending ) return null;
    return { type: data.type, path: data.path, name: data.name, fileId: data.fileId || null, audio: data.kind === "audio" };
}

function targetNodeId(target) {
    return target.type === "folder" ? folderId(target.path) : fileId(target.path);
}

module.exports = {
    ROOT_ID,
    folderId,
    fileId,
    normalizePath,
    scanFolders,
    buildExplorerNodes,
    dropFolderOf,
    canMoveInto,
    nodeTarget,
    targetNodeId
};
