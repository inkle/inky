const $ = window.jQuery = require('./jquery-2.2.3.min.js');
const escapeHtml = require('./safeHtml.js').SafeHtml.escapeHtml;
const path = require("path");
const fs = require("fs");
const _ = require("lodash");
const i18n = require("./i18n.js");
const InkFile = require("./inkFile.js").InkFile;
const { getRenameStem } = require("./projectFileName.js");
const { range, toInteger } = require('lodash');
const ExplorerTree = require("./explorerTree.js");

const slideAnimDuration = 200;
// Fixed Explorer geometry: wide enough for normal scene names and inline rename,
// without consuming the editor/player area excessively. The legacy knot/stitch
// navigator keeps its narrower 200 px column when opened alongside Explorer.
const EXPLORER_SIDEBAR_WIDTH = 300;
const KNOT_STITCH_SIDEBAR_WIDTH = 200;


var $sidebar = null;
var $fileNavWrapper = null;
var $knotStichNavWrapper = null;
var $twoPane = null;
var selectedFolder = "";
var folderOpenState = {};
var folderTreeCache = Object.create(null);
var lastMainInk = null;
var lastFiles = [];
var lastProjectDir = null;
var pendingCreation = null;       // { type, folder }: the new file/folder whose name is being typed
var selectedExplorerTarget = null;
var deletingExplorerItem = false;
var audioFileList = [];         // sound files in the project (relative paths)
var imageFileList = [];         // supported image files in the project (relative paths)
var playingAudioPath = null;    // the sound file being listened to from the Explorer

// The tree itself is jsTree; see explorerTree.js for the data it is given.
var tree = null;                // the jsTree instance, once the Explorer has been drawn
var currentNodes = [];          // what the tree loads (and reloads) from
var treeEditing = false;        // a name is being typed in the tree: do not redraw under it
var refreshing = false;
var refreshQueued = false;

var $currentNavWrapper = null

var visible = false;
var hasBeenShown = false;
var events = {};

// jsTree is a UMD script that would require("jquery"); give it this page's jQuery directly.
function loadJsTree() {
    if( $.fn.jstree ) return;
    const source = fs.readFileSync(path.join(__dirname, "jstree", "jstree.min.js"), "utf8");
    new Function("jQuery", "module", "exports", "define", source)($, undefined, undefined, undefined);
}


$(document).ready(() => {
    //Assign each variable to the allocated class/id.
    $sidebar = $(".sidebar");
    $fileNavWrapper = $sidebar.find("#file-nav-wrapper");
    $knotStichNavWrapper = $sidebar.find("#knot-stitch-wrapper")
    $twoPane = $(".twopane");
    $sidebarSplit = $("#main").children(".split");
    $sidebarSplit.hide();
    $sidebarSplit.css("left", 0);

    $knotStichNavWrapper.on("click", ".nav-group-item", function(event) {
        // Any clicked navigation item should become highlighted
        event.preventDefault();
        var $targetNavGroupItem = $(event.currentTarget);
        var row = $targetNavGroupItem.attr("row");
        events.jumpToRow(parseInt(row))
    });

    // Files dragged in from the file manager are imported (dropping on a folder, or on a file
    // inside it, puts Ink scenes in that folder; nothing else may navigate the window). Moving
    // the Explorer's own items is jsTree's drag and drop (see createTree).
    const dragHasFiles = event => Array.from((event.originalEvent.dataTransfer && event.originalEvent.dataTransfer.types) || []).indexOf("Files") !== -1;
    const folderUnderPointer = event => {
        const $node = $(event.target).closest("li.jstree-node").first();
        return $node.length && tree ? ExplorerTree.dropFolderOf(tree.get_node($node.attr("id"))) : "";
    };
    $(document).on("dragover drop", event => { event.preventDefault(); });
    $fileNavWrapper.on("dragover", function(event) {
        if( !dragHasFiles(event) ) return;
        event.preventDefault();
        event.originalEvent.dataTransfer.dropEffect = "copy";
        $fileNavWrapper.addClass("drop-active");
        markDropTarget(folderUnderPointer(event));
    });
    $fileNavWrapper.on("dragleave", function(event) {
        const related = event.originalEvent.relatedTarget;
        if( !related || !$fileNavWrapper[0].contains(related) ) {
            $fileNavWrapper.removeClass("drop-active");
            markDropTarget(null);
        }
    });
    $fileNavWrapper.on("drop", function(event) {
        $fileNavWrapper.removeClass("drop-active");
        markDropTarget(null);
        if( !dragHasFiles(event) ) return;
        event.preventDefault();
        event.stopPropagation();
        const paths = Array.from(event.originalEvent.dataTransfer.files || []).map(file => file.path).filter(Boolean);
        if( paths.length && events.importFiles ) events.importFiles(paths, folderUnderPointer(event));
    });

    $fileNavWrapper.on("click", ".explorer-header-action", function(event) {
        event.preventDefault();
        event.stopPropagation();
        closeExplorerContextMenu();
        if( $(this).attr("data-action") === "import" ) { startImport(); return; }
        startInlineCreation($(this).attr("data-create-type"));
    });

    // The right-click menu is jsTree's contextmenu plugin (see contextItems). A right-click on rows
    // is its own; here, the empty space under the rows gets the project folder's menu, and nothing
    // in the Explorer may reach Electron's generic Cut/Copy/Paste menu (except a name being typed).
    $fileNavWrapper.on("contextmenu", function(event) {
        const $target = $(event.target);
        if( $target.closest(".jstree-rename-input").length ) return;
        event.stopPropagation();
        if( $target.closest("li.jstree-node").length ) return;
        event.preventDefault();
        if( treeEditing || !tree || $target.closest(".file-explorer-header, .explorer-create-options").length ) return;
        tree.show_contextmenu(ExplorerTree.ROOT_ID, event.pageX, event.pageY, event);
    });

    // Include directives can be edited directly in Ink source. New Scene keeps
    // the optional "Add INCLUDE to main story" checkbox beside the Explorer's header.

    $(document).on("keyup", function(e) {
        if( e.keyCode !== 27 ) return;
        if( !treeEditing && tree && $(".vakata-context:visible").length === 0 && tree.get_selected().length > 1
            && !$(e.target).closest("input, textarea, .ace_text-input").length ) tree.deselect_all();
        closeExplorerContextMenu();
    });
    $(document).on("keydown", function(event) {
        // Alt+N (New File...) and Alt+P (New Folder...) work from anywhere in the window,
        // except while a name is being typed in the Explorer.
        if( event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.originalEvent.repeat
            && (event.originalEvent.code === "KeyN" || event.originalEvent.code === "KeyP" || event.originalEvent.code === "KeyM")
            && !$(event.target).closest(".jstree-rename-input").length
            && $fileNavWrapper.is(":visible") ) {
            event.preventDefault();
            closeExplorerContextMenu();
            if( event.originalEvent.code === "KeyM" ) startImport();
            else startInlineCreation(event.originalEvent.code === "KeyN" ? "scene" : "folder");
            return;
        }
        if( $(event.target).closest("input, textarea, select, [contenteditable='true'], .ace_text-input").length ) return;
        if( $(".explorer-dialog-backdrop").length ) return;
        const picked = selectedTargets();
        const chosen = picked.length > 0 ? picked : (selectedExplorerTarget ? [selectedExplorerTarget] : []);
        if( chosen.length === 0 ) return;
        if( event.key === "F2" ) {
            event.preventDefault();
            if( chosen.length === 1 && !chosen[0].audio ) startInlineRename(chosen[0]);
            return;
        }
        if( event.key !== "Delete" ) return;
        event.preventDefault();
        confirmDeleteItems(chosen.slice());
    });

    // Clicking the empty part of the Explorer drops a multiple selection.
    $fileNavWrapper.on("click", function(event) {
        if( tree && tree.get_selected().length > 1 && !$(event.target).closest("li.jstree-node, .vakata-context, .file-explorer-header, .explorer-create-options").length )
            tree.deselect_all();
    });
});


// Importing: a file chooser (or dropped files). Ink scenes go to the selected folder.
// Importing: a file chooser (or dropped files). Ink scenes go to the selected folder.
function startImport() {
    if( events.importFiles ) events.importFiles(null, selectedFolder || "");
}


// ---- The tree (jsTree)

function selectionKey(target) {
    return target.type + "|" + target.path;
}

// The items currently selected in the tree (Ctrl+click and Shift+click select several).
function selectedTargets() {
    if( !tree ) return [];
    return tree.get_selected(true).map(ExplorerTree.nodeTarget).filter(Boolean);
}

function parentFolderOf(itemPath) {
    const parent = path.posix.dirname(String(itemPath || "."));
    return parent === "." ? "" : parent;
}

function anchorOf(nodeId) {
    return tree ? tree.get_node(nodeId, true).children(".jstree-anchor") : $();
}

function markActive(nodeId) {
    if( !tree ) return;
    $fileNavWrapper.find(".jstree-anchor.ex-active").removeClass("ex-active");
    anchorOf(nodeId).addClass("ex-active");
}

function markDropTarget(folder) {
    if( !$fileNavWrapper ) return;
    $fileNavWrapper.find(".explorer-drop-target").removeClass("explorer-drop-target");
    if( folder === null || folder === undefined || !tree ) return;
    anchorOf(ExplorerTree.folderId(folder)).addClass("explorer-drop-target");
}

function toggleAudioListening(relativePath) {
    if( !events.toggleAudioPreview ) return;
    events.toggleAudioPreview(relativePath, playing => {
        if( playing ) playingAudioPath = relativePath;
        else if( playingAudioPath === relativePath ) playingAudioPath = null;
        applyPlayingAudio();
    });
}

function applyPlayingAudio() {
    if( !$fileNavWrapper ) return;
    $fileNavWrapper.find(".jstree-anchor.ex-audio").each(function() {
        $(this).toggleClass("ex-playing", !!playingAudioPath && $(this).attr("data-relative-path") === playingAudioPath);
    });
}

// The header, the "add INCLUDE" choice for new scenes and the tree's own container are drawn once.
function ensureExplorerDom() {
    if( $fileNavWrapper.children(".file-explorer-header").length ) return;
    const svg = inner => '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
    const action = (attributes, title, inner) => '<button type="button" class="explorer-header-action" ' + attributes + ' title="' + title + '" aria-label="' + title + '">' + svg(inner) + '</button>';
    $fileNavWrapper.empty().append(
        $('<div class="file-explorer-header">' +
            '<span class="explorer-title">EXPLORER</span>' +
            '<div class="explorer-header-actions">' +
              action('data-create-type="scene"', "New File...", '<path d="M9.5 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5z"/><path d="M9.5 1.5v4h4"/><path d="M8 7.5v4M6 9.5h4"/>') +
              action('data-create-type="folder"', "New Folder...", '<path d="M1.5 3.5a1 1 0 0 1 1-1h3.2l1.3 1.5h6.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/><path d="M8 6.5v4M6 8.5h4"/>') +
              action('data-action="import"', "Import Files...", '<path d="M8 2v7.2M5.1 6.5L8 9.4l2.9-2.9"/><path d="M2.5 10v2.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10"/>') +
            '</div>' +
          '</div>'),
        $('<label class="explorer-create-options" hidden><input type="checkbox" class="explorer-create-include" checked> Add INCLUDE to main story</label>'),
        $('<div id="explorer-tree"></div>')
    );
    // Clicking the checkbox must not take the focus from the name being typed (that would save it).
    $fileNavWrapper.find(".explorer-create-options").on("mousedown", event => { event.stopPropagation(); event.preventDefault(); });
}

function treeIsDraggable(nodes) {
    return nodes.every(node => !!ExplorerTree.nodeTarget(node));
}

// What jsTree may do. Moving is allowed into any folder (a file hands the item to its own folder);
// the rules of the project, and the actual move, are done by the project once the item is dropped.
function treeCheck(operation, node, parent) {
    if( operation === "move_node" ) {
        if( !node || !node.data || node.data.root || node.data.pending ) return false;
        return ExplorerTree.canMoveInto([{ type: node.data.type, path: node.data.path }], ExplorerTree.dropFolderOf(parent));
    }
    return operation !== "copy_node";
}

function createTree() {
    loadJsTree();
    const $host = $fileNavWrapper.find("#explorer-tree");
    $host.jstree({
        core: {
            data: function(node, callback) { callback.call(this, currentNodes); },
            themes: { name: "default", dots: false, icons: false, responsive: false, url: false },
            multiple: true,
            animation: 0,
            worker: false,
            dblclick_toggle: false,
            check_callback: treeCheck,
            // F2 and Delete are handled by the Explorer itself (they work wherever the focus is).
            keyboard: { f2: function(event) { event.preventDefault(); } }
        },
        plugins: ["wholerow", "dnd", "contextmenu"],
        contextmenu: { items: contextItems, select_node: false, show_at_node: false },
        dnd: { copy: false, large_drop_target: true, inside_pos: "last", blank_space_drop: true, is_draggable: treeIsDraggable }
    });
    tree = $host.jstree(true);

    // A click (or Enter) on a row: the row's own action. Ctrl+click and Shift+click only select.
    $host.on("activate_node.jstree", (event, data) => {
        const click = data.event || {};
        if( click.type === "contextmenu" ) return;
        if( treeEditing || click.ctrlKey || click.metaKey || click.shiftKey ) return;
        const node = data.node;
        const info = node.data || {};
        if( info.pending ) return;
        if( info.type === "folder" ) {
            selectedFolder = info.path;
            selectedExplorerTarget = { type: "folder", path: info.path, name: info.path.split("/").pop() };
            tree.toggle_node(node);
            return;
        }
        selectedExplorerTarget = ExplorerTree.nodeTarget(node);
        selectedFolder = parentFolderOf(info.path);
        if( info.kind === "audio" ) {
            toggleAudioListening(info.path);
        } else if( info.kind === "image" ) {
            markActive(node.id);
            events.openImageFile(info.path);
        } else {
            markActive(node.id);
            events.clickFileId(info.fileId);
        }
    });
    $host.on("open_node.jstree close_node.jstree", (event, data) => {
        if( data.node && data.node.data && data.node.data.type === "folder" ) folderOpenState[data.node.data.path] = event.type === "open_node";
    });
    $host.on("move_node.jstree", (event, data) => collectMove(data));
    $host.on("refresh.jstree ready.jstree", () => {
        refreshing = false;
        applyPlayingAudio();
        if( refreshQueued ) { refreshQueued = false; applyTreeData(); }
    });
}

// Redraws the tree from the nodes just built. Open folders and the selection come with the nodes.
function applyTreeData() {
    if( !tree ) { createTree(); return; }
    if( refreshing ) { refreshQueued = true; return; }
    refreshing = true;
    const scroll = $fileNavWrapper.scrollTop();
    tree.refresh(false, true);
    $fileNavWrapper.scrollTop(scroll);
}

function setFiles(mainInk, allFiles, projectDir) {
    renderFiles(mainInk, allFiles, projectDir);
}

function renderFiles(mainInk, allFiles, projectDir) {
    if( !$fileNavWrapper || !mainInk ) return;
    projectDir = projectDir || mainInk.projectDir;
    if( lastProjectDir && projectDir && path.resolve(lastProjectDir) !== path.resolve(projectDir) ) {
        selectedFolder = "";
        folderOpenState = {};
    }
    lastMainInk = mainInk;
    lastFiles = allFiles || [];
    lastProjectDir = projectDir || null;
    ensureExplorerDom();
    // A name being typed must survive: it is redrawn (with whatever changed) once it is done.
    if( treeEditing ) return;

    let folders = [];
    if( projectDir ) {
        const cacheKey = path.resolve(projectDir);
        if( !folderTreeCache[cacheKey] ) folderTreeCache[cacheKey] = ExplorerTree.scanFolders(projectDir);
        folders = folderTreeCache[cacheKey];
    }
    currentNodes = ExplorerTree.buildExplorerNodes({
        mainInk: mainInk,
        allFiles: allFiles,
        projectDir: projectDir,
        folders: folders,
        audioFiles: audioFileList,
        imageFiles: imageFileList,
        openState: folderOpenState,
        selectedIds: new Set(tree ? tree.get_selected() : []),
        playingAudioPath: playingAudioPath,
        escapeHtml: escapeHtml
    });
    applyTreeData();
}

// ---- Moving items by dragging them inside the project (jsTree reports each dropped node)
let moveBatch = { items: [], folder: "", timer: null };
let movingExplorerItems = false;

function collectMove(data) {
    const target = ExplorerTree.nodeTarget(data.node);
    if( !target ) return;
    moveBatch.items.push(target);
    moveBatch.folder = ExplorerTree.dropFolderOf(tree.get_node(data.parent));
    if( !moveBatch.timer ) moveBatch.timer = setTimeout(() => {
        const batch = moveBatch;
        moveBatch = { items: [], folder: "", timer: null };
        moveExplorerItems(withoutNestedTargets(batch.items), batch.folder);
    }, 0);
}

// Moves one by one through the project's own rename (INCLUDEs, open documents and the sound and
// picture lists follow); what cannot move is reported together at the end.
async function moveExplorerItems(items, folder) {
    if( movingExplorerItems || !events.renameItem ) return;
    movingExplorerItems = true;
    const failures = [];
    try {
        for( const item of items ) {
            if( parentFolderOf(item.path) === folder ) continue;
            let result;
            try { result = await events.renameItem(item.type, item.path, null, { moveToFolder: folder }); }
            catch(error) { result = { ok: false, error: error.message || String(error) }; }
            if( result && result.ok && !result.unchanged ) {
                const moved = result.newRelativePath;
                if( selectedExplorerTarget && selectedExplorerTarget.path === item.path )
                    selectedExplorerTarget = Object.assign({}, selectedExplorerTarget, { path: moved });
                // A folder that was collapsed or open stays so at its new place.
                Object.keys(folderOpenState).forEach(key => {
                    if( key === item.path || key.startsWith(item.path + "/") ) {
                        folderOpenState[moved + key.substring(item.path.length)] = folderOpenState[key];
                        delete folderOpenState[key];
                    }
                });
            } else {
                failures.push((item.name || path.posix.basename(item.path)) + ": " + ((result && result.error) || "it could not be moved"));
            }
        }
    } finally {
        movingExplorerItems = false;
    }
    folderOpenState[folder] = true;
    if( tree ) tree.deselect_all(true);
    // jsTree already moved the nodes on screen; draw what the project really looks like now.
    if( lastMainInk ) setFiles(lastMainInk, lastFiles, lastProjectDir);
    if( failures.length ) await showExplorerDialog({
        title: items.length === 1 ? "Could not move item" : "Could not move all items",
        message: items.length === 1 ? "The item could not be moved." : "These items could not be moved:",
        details: failures,
        buttons: [{ label: "OK", value: true, primary: true }]
    });
}

// ---- Creating and renaming in place (jsTree's inline editor)

const INVALID_NAME_CHARS = /[<>:"|?*\x00-\x1f]/;

function redrawExplorer() {
    if( lastMainInk ) setFiles(lastMainInk, lastFiles, lastProjectDir);
}

function startInlineCreation(type) {
    if( !["folder", "scene"].includes(type) ) return;
    if( !lastMainInk || !lastMainInk.projectDir ) {
        showExplorerDialog({ title: "Save your story", message: "Save your story first to create files and folders in the project.", buttons: [{ label: "OK", value: true, primary: true }] });
        return;
    }
    if( !tree || treeEditing ) return;
    const folder = String(selectedFolder || "").replace(/\\/g, "/").replace(/^\.\//, "");
    let parentId = ExplorerTree.folderId(folder);
    if( !tree.get_node(parentId) ) parentId = ExplorerTree.ROOT_ID;
    pendingCreation = { type: type, folder: tree.get_node(parentId).data.path };
    folderOpenState[pendingCreation.folder] = true;
    treeEditing = true;
    $fileNavWrapper.find(".explorer-create-options").prop("hidden", type !== "scene");
    tree.open_node(parentId);
    const nodeId = tree.create_node(parentId, {
        id: "pending-create",
        text: "",
        a_attr: { "class": "ex-row ex-file" },
        data: { type: "file", pending: true }
    }, "first");
    if( !nodeId ) { treeEditing = false; pendingCreation = null; return; }
    tree.edit(nodeId, "", (node, ok, cancelled, value) => finishCreation(cancelled, value));
}

function finishCreation(cancelled, value) {
    const request = pendingCreation;
    const includeInMain = $fileNavWrapper.find(".explorer-create-include").prop("checked");
    pendingCreation = null;
    treeEditing = false;
    $fileNavWrapper.find(".explorer-create-options").prop("hidden", true);
    const name = String(value || "").trim();
    if( cancelled || !request || !name ) { redrawExplorer(); return; }
    if( name === "." || name === ".." || /[\\/]/.test(name) || INVALID_NAME_CHARS.test(name) ) {
        redrawExplorer();
        showExplorerDialog({ title: "Invalid name", message: "Use a valid name without path separators.", buttons: [{ label: "OK", value: true, primary: true }] });
        return;
    }
    const relative = request.folder ? path.posix.join(request.folder, name) : name;
    let succeeded = false;
    try {
        succeeded = request.type === "folder"
            ? events.createFolder(relative) === true
            : events.createScene(relative, includeInMain) === true;
    } catch(error) {
        succeeded = false;
    }
    redrawExplorer();
    if( !succeeded && !$(".explorer-dialog-backdrop").length )
        showExplorerDialog({ title: "Could not create this item", message: "Check the name and try again.", buttons: [{ label: "OK", value: true, primary: true }] });
}

function startInlineRename(target) {
    if( !target || !target.path ) return;
    if( !lastMainInk || !lastMainInk.projectDir ) {
        showExplorerDialog({ title: "Save your story", message: "Save the main story before renaming project items.", buttons: [{ label: "OK", value: true, primary: true }] });
        return;
    }
    if( !tree || treeEditing ) return;
    closeExplorerContextMenu();
    const nodeId = ExplorerTree.targetNodeId(target);
    if( !tree.get_node(nodeId) ) return;
    const originalName = target.name || path.posix.basename(target.path);
    // A file is renamed without its extension (it is kept), a folder by its whole name.
    const stem = target.type === "file" ? getRenameStem(originalName) : originalName;
    if( target.type === "folder" ) {
        selectedFolder = target.path;
        folderOpenState[target.path] = true;
    }
    treeEditing = true;
    tree.edit(nodeId, stem, (node, ok, cancelled, value) => finishRename(target, stem, cancelled, value));
}

function finishRename(target, stem, cancelled, value) {
    treeEditing = false;
    const newName = String(value || "").trim();
    if( cancelled || !newName || newName === stem ) { redrawExplorer(); return; }
    const fail = message => {
        redrawExplorer();
        showExplorerDialog({ title: "Could not rename", message: message, buttons: [{ label: "OK", value: true, primary: true }] });
    };
    if( newName === "." || newName === ".." || /[\\/]/.test(newName) || INVALID_NAME_CHARS.test(newName) || /[ .]$/.test(newName) )
        return fail("Use a valid name without path separators or reserved characters.");
    let outcome;
    try { outcome = events.renameItem(target.type, target.path, newName); }
    catch(error) { outcome = { ok: false, error: error.message || String(error) }; }
    Promise.resolve(outcome).then(result => {
        if( result && (result.ok || result.unchanged) ) {
            selectedExplorerTarget = {
                type: target.type,
                path: result.newRelativePath || target.path,
                name: path.posix.basename(result.newRelativePath || target.path),
                fileId: target.fileId
            };
            redrawExplorer();
            return;
        }
        fail(result && result.error ? result.error : "Could not rename this item. Check the name and try again.");
    }).catch(error => fail(error && error.message ? error.message : "Could not rename this item."));
}

// The main story's name changed (it is saved under a new name): say so on its row.
function setMainInkFilename(name) {
    if( !tree || !lastMainInk ) return;
    const fileIdValue = lastMainInk.id;
    const node = currentNodes.find(candidate => candidate.data && candidate.data.type === "file" && candidate.data.fileId === fileIdValue);
    if( !node || !tree.get_node(node.id) ) return;
    const named = { filename: () => String(name || ""), relativePath: () => String(name || "story.ink"), isInkFile: true };
    const html = ExplorerTree.buildExplorerNodes({ mainInk: named, allFiles: [], projectDir: null, folders: [], escapeHtml: escapeHtml })
        .find(candidate => candidate.data.type === "file").text;
    tree.set_text(node.id, html);
}

function highlightRelativePath(relativePath) {
    if( !tree ) return;
    const normalized = ExplorerTree.normalizePath(relativePath);
    const node = currentNodes.find(candidate => candidate.data && candidate.data.type === "file" && candidate.data.path === normalized);
    $fileNavWrapper.find(".jstree-anchor.ex-active").removeClass("ex-active");
    if( !node || !tree.get_node(node.id) ) return;
    // Reveal the folders above it, and keep them open across the next redraw.
    tree.get_path(node.id, false, true).slice(0, -1).forEach(ancestorId => {
        const ancestor = tree.get_node(ancestorId);
        if( ancestor && ancestor.data && ancestor.data.type === "folder" ) folderOpenState[ancestor.data.path] = true;
        tree.open_node(ancestorId, null, 0);
    });
    markActive(node.id);
}


// What the right-click menu holds. jsTree's contextmenu plugin draws it and handles the mouse, the
// keyboard (arrows, Enter, Esc) and its position; each item runs the Explorer's own action. A
// right-click on a selected row acts on the whole selection, on any other row only on that row.
function contextItems(node) {
    const target = ExplorerTree.nodeTarget(node);
    // A right-click selects the row (without "clicking" it: that would open it or toggle the folder).
    if( target && !tree.is_selected(node) ) {
        tree.deselect_all(true);
        tree.select_node(node, true);
    }
    const chosen = selectedTargets();
    const targets = target && chosen.length > 1 && chosen.some(item => selectionKey(item) === selectionKey(target))
        ? chosen
        : (target ? [target] : []);
    // New items go inside the clicked folder, or next to the clicked file; the menu closes first.
    const run = action => () => setTimeout(() => {
        selectedFolder = ExplorerTree.dropFolderOf(node);
        selectedExplorerTarget = target;
        action();
    }, 0);
    return {
        newFile: { label: "New File...", shortcut: 78, shortcut_label: "Alt+N", action: run(() => startInlineCreation("scene")) },
        newFolder: { label: "New Folder...", shortcut: 80, shortcut_label: "Alt+P", action: run(() => startInlineCreation("folder")) },
        importFiles: { label: "Import Files...", shortcut: 77, shortcut_label: "Alt+M", action: run(() => startImport()) },
        rename: {
            separator_before: true,
            label: "Rename",
            shortcut: 113,
            shortcut_label: "F2",
            _disabled: targets.length !== 1 || targets[0].audio,
            action: run(() => startInlineRename(targets[0]))
        },
        remove: {
            label: "Delete",
            shortcut: 46,
            shortcut_label: "Delete",
            _disabled: targets.length === 0,
            action: run(() => confirmDeleteItems(targets.slice()))
        }
    };
}

function confirmDeleteItem(target) {
    return confirmDeleteItems(target ? [target] : []);
}

// Items inside a folder that is also being deleted go away with it; do not delete them twice.
function withoutNestedTargets(targets) {
    const seen = new Set();
    const unique = targets.filter(target => {
        if( !target || !target.path ) return false;
        const key = selectionKey(target);
        if( seen.has(key) ) return false;
        seen.add(key);
        return true;
    });
    const folders = unique.filter(target => target.type === "folder").map(target => target.path);
    return unique.filter(target => !folders.some(folder => target.path !== folder && target.path.startsWith(folder + "/")));
}

async function confirmDeleteItems(rawTargets) {
    closeExplorerContextMenu();
    if( deletingExplorerItem ) return;
    const targets = withoutNestedTargets(rawTargets || []);
    if( targets.length === 0 ) return;
    const nameOf = target => target.name || path.posix.basename(target.path);
    const hasFolder = targets.some(target => target.type === "folder");
    let title, message;
    if( targets.length === 1 ) {
        title = targets[0].type === "folder" ? "Delete folder" : "Delete file";
        message = "Are you sure you want to delete \"" + nameOf(targets[0]) + "\"?" + (hasFolder ? " The folder and everything inside it will be deleted." : "");
    } else {
        title = "Delete " + targets.length + " items";
        message = "Are you sure you want to delete these " + targets.length + " items?" + (hasFolder ? " The folders and everything inside them will be deleted." : "");
    }
    const names = targets.map(nameOf);
    const answer = await showExplorerDialog({
        title: title,
        message: message,
        details: targets.length > 1 ? (names.length > 8 ? names.slice(0, 8).concat(["... e mais " + (names.length - 8)]) : names) : null,
        note: "Unsaved changes will be lost. This action cannot be undone.",
        buttons: [{ label: "Cancel", value: false }, { label: "Delete", value: true, primary: true, danger: true }]
    });
    if( !answer ) return;
    deletingExplorerItem = true;
    const failures = [];
    for( const target of targets ) {
        try {
            const result = await Promise.resolve(events.deleteItem(target.type, target.path));
            if( !result || !result.ok ) failures.push(nameOf(target) + ": " + (result && result.error ? result.error : "could not be deleted."));
        } catch(error) {
            failures.push(nameOf(target) + ": " + (error.message || String(error)));
        }
    }
    deletingExplorerItem = false;
    selectedExplorerTarget = null;
    if( tree ) tree.deselect_all(true);
    if( failures.length ) {
        await showExplorerDialog({
            title: failures.length === targets.length ? "Could not delete items" : "Some items could not be deleted",
            message: failures.length === targets.length ? "Nothing was deleted:" : "These items remain in the project:",
            details: failures,
            buttons: [{ label: "OK", value: true, primary: true }]
        });
    }
}

// A dialog drawn on the page. Native alert()/confirm() boxes can leave Electron on Linux with a
// window that no longer gives keyboard focus to text fields, so the Explorer never uses them.
function showExplorerDialog(options) {
    return new Promise(resolve => {
        const previousFocus = document.activeElement;
        const $backdrop = $('<div class="explorer-dialog-backdrop"></div>');
        const $dialog = $('<div class="explorer-dialog" role="dialog" aria-modal="true"></div>');
        $dialog.append($('<div class="explorer-dialog-title"></div>').text(options.title || "Inky"));
        if( options.message ) $dialog.append($('<div class="explorer-dialog-message"></div>').text(options.message));
        if( options.details && options.details.length ) {
            const $list = $('<ul class="explorer-dialog-details"></ul>');
            options.details.forEach(line => $list.append($("<li></li>").text(line)));
            $dialog.append($list);
        }
        if( options.note ) $dialog.append($('<div class="explorer-dialog-note"></div>').text(options.note));
        const $buttons = $('<div class="explorer-dialog-buttons"></div>');
        const buttons = options.buttons && options.buttons.length ? options.buttons : [{ label: "OK", value: true, primary: true }];
        const cancelValue = buttons[0].value;
        let finished = false;
        const finish = (value, viaEscape) => {
            if( finished ) return;
            finished = true;
            document.removeEventListener("keydown", onKeyDown, true);
            document.removeEventListener("keyup", swallowKeyUp, true);
            if( viaEscape ) {
                // The Escape key-up must not reach the Explorer and cancel what was being typed.
                document.addEventListener("keyup", function once(e) { e.stopPropagation(); document.removeEventListener("keyup", once, true); }, true);
            }
            $backdrop.remove();
            setTimeout(() => {
                if( previousFocus && previousFocus.focus && document.body.contains(previousFocus) ) { try { previousFocus.focus(); } catch(e) { /* gone */ } }
            }, 0);
            resolve(value);
        };
        buttons.forEach(button => {
            const $button = $('<button type="button" class="explorer-dialog-button"></button>').text(button.label);
            if( button.primary ) $button.addClass("primary");
            if( button.danger ) $button.addClass("danger");
            $button.on("click", event => { event.preventDefault(); event.stopPropagation(); finish(button.value, false); });
            $buttons.append($button);
        });
        $dialog.append($buttons);
        $backdrop.append($dialog);
        const onKeyDown = event => {
            if( event.key === "Escape" ) {
                event.preventDefault(); event.stopPropagation();
                finish(cancelValue, true);
            } else if( event.key === "Tab" ) {
                event.preventDefault(); event.stopPropagation();
                const nodes = $buttons.find("button").toArray();
                const index = nodes.indexOf(document.activeElement);
                const next = event.shiftKey ? (index <= 0 ? nodes.length - 1 : index - 1) : (index + 1) % nodes.length;
                nodes[next].focus();
            } else if( event.key === "Enter" || event.key === " " ) {
                // Activate the focused button ourselves, so the key press does not carry on to
                // whatever gets focus once the dialog closes (the name field, for instance).
                event.preventDefault(); event.stopPropagation();
                const nodes = $buttons.find("button").toArray();
                const focused = nodes.find(node => node === document.activeElement)
                    || $buttons.find("button.primary").get(0) || nodes[0];
                if( focused ) focused.click();
            } else {
                event.stopPropagation();
            }
        };
        const swallowKeyUp = event => { if( event.key === "Escape" ) event.stopPropagation(); };
        document.addEventListener("keydown", onKeyDown, true);
        document.addEventListener("keyup", swallowKeyUp, true);
        $backdrop.on("mousedown", event => { if( event.target === $backdrop[0] ) event.preventDefault(); });
        $(document.body).append($backdrop);
        const $primary = $buttons.find("button.primary").first();
        ($primary.length ? $primary : $buttons.find("button").first())[0].focus();
    });
}

function closeExplorerContextMenu() {
    if( $.vakata && $.vakata.context ) $.vakata.context.hide();
}

function visibleSidebarPanels() {
    const panels = [
        { $element: $fileNavWrapper, width: EXPLORER_SIDEBAR_WIDTH },
        { $element: $knotStichNavWrapper, width: KNOT_STITCH_SIDEBAR_WIDTH }
    ];
    return panels.filter(panel => panel.$element && panel.$element.length && !panel.$element.hasClass("hidden"));
}

function setKnots(mainInk){
    if( !mainInk || !mainInk.isInkFile ) {
        if( $knotStichNavWrapper ) $knotStichNavWrapper.empty();
        return;
    }
//Parse the symbols before setting the knots
//TODO: Improved implementation of symbols/when they parse
//may make this unneeded. This may improve performance, 
//as currently it parses whenever the user types
//anything! 
    mainInk.symbols.parse();
    var ranges = mainInk.symbols.rangeIndex;

    $knotStichNavWrapper.empty();

    if (ranges.length == 0) {
        var contentLoc = i18n._('Content');
        var descriptionLoc = i18n._('Knots, stitches and functions are indexed here')

        var $content = $(
          `<nav class="nav-group"><h5 class="nav-group-title">${contentLoc}</h5></nav>` +
            `<nav class="nav-group"><span class="nav-group-item nav-tooltip">${descriptionLoc}</span></nav>`
        );
        
        $knotStichNavWrapper.append($content);

        return;
    }
    
    var extraClass = ""

    var externalsList = getExternals(mainInk);
    
    var $content = $(`<nav class="nav-group"><h5 class="nav-group-title">Content</h5></nav>`);
    var $functions = $(`<nav class="nav-group"><h5 class="nav-group-title">Functions</h5></nav>`);
    var $externals = $(`<nav class="nav-group"><h5 class="nav-group-title">Externals</h5></nav>`);

    var foundContent = false; 
    var foundFunctions = false;

    // $knotStichNavWrapper.append($main);
    //For every knots (Ranges is knot and functions)
    ranges.forEach(range => {
        var symbol = range.symbol;
        var extraClass = "knot"
        if (symbol.isfunc) foundFunctions = true; else foundContent = true;
        var icon = symbol.isfunc ? "ink-icon icon-function-scaled" : "ink-icon icon-knot-scaled"
        var items = `<span class="nav-group-item ${extraClass}" row = "${symbol.row}">
        <span class="icon ${icon}"></span>
                <span class="filename">${escapeHtml(symbol.name)}</span>
            </span>`;
        //If the knot has any symbols inside of it.
        if (symbol.innerSymbols){
            //For every stitch inside the knot
            Object.keys(symbol.innerSymbols).forEach((innerSymbolName) => {
                var innerSymbol = symbol.innerSymbols[innerSymbolName]
                if (innerSymbol.flowType.name == "Stitch"){
                    var extraClass = "stitch";
                    items += 
                    `<span class="nav-group-item ${extraClass}" row = "${innerSymbol.row}">
                    <span class="icon ink-icon icon-stitch-scaled"></span>
                            <span class="filename">${escapeHtml(innerSymbol.name)}</span>
                        </span>`;
                }
            });

        }

        extraClass = "";
        var $group = $(`<nav class="nav-group ${extraClass}"> ${items} </nav>`);

        if (symbol.isfunc) {
            if (externalsList.has(symbol.name)) 
                $externals.append($group);
            else
                $functions.append($group);
        }
        else 
            $content.append($group);
    });

    if (foundContent)
        $knotStichNavWrapper.append($content);
    if (foundFunctions)
        $knotStichNavWrapper.append($functions);
    if (externalsList.size > 0) 
        $knotStichNavWrapper.append($externals);
}

function updateCurrentKnot(mainInk, cursorPos){
    if( !mainInk || !mainInk.isInkFile ) return;
    var symbols = mainInk.symbols.flowAtPos(cursorPos);
    if (!symbols) return;

    let $currentKnot = null;
    if ("Knot" in symbols){
        $currentKnot = $(`[row=${symbols["Knot"].row}]`);
        if (symbols["Knot"].isfunc){
            $currentKnot.addClass("function")
        }
    }

    let $currentStitch = null;
    if ("Stitch" in symbols){
        $currentStitch = $(`[row=${symbols["Stitch"].row}]`);
    }

    if (($currentKnot && $currentKnot.hasClass("active"))&&($currentStitch && $currentStitch.hasClass("active")))
        return;

    $knotStichNavWrapper.find(".nav-group-item.active").removeClass("active");
    if ($currentKnot && $currentKnot.length !== 0){
        $currentKnot.addClass("active");
        $currentKnot[0].scrollIntoViewIfNeeded();


    }
    if ($currentStitch && $currentStitch.length !== 0){
        $currentStitch.addClass("active");
        $currentStitch[0].scrollIntoViewIfNeeded();
    }
}

function hideSidebar() {
    if( !visible )
        return;
    
    animateSidebar(0);

    visible = false;
}

function showSidebar(columns) {
    if (!columns) columns = 1;    
    if( ! visible )
    {
    
        hasBeenShown = true;

        // hidden class only exists in initial state
        $sidebar.removeClass("hidden");
        $sidebarSplit.removeClass("hidden");

        $sidebar.show();
        $sidebarSplit.show();
    }
    animateSidebar(columns);
    visible = true;
}

function animateSidebar(columns) {
    $sidebar.stop(true, false);
    $twoPane.stop(true, false);
    $sidebarSplit.stop(true, false);

    const panels = columns > 0 ? visibleSidebarPanels() : [];
    const totalWidth = panels.reduce((total, panel) => total + panel.width, 0);
    const sidebarOuterWidth = Math.max(0, totalWidth - 1);

    $sidebar.animate({ width: sidebarOuterWidth }, slideAnimDuration, () => {
        if( columns === 0 ) $sidebar.hide();
    });
    $twoPane.animate({ left: totalWidth }, slideAnimDuration);
    $sidebarSplit.animate({ left: totalWidth }, slideAnimDuration);

    // Give each navigation panel its own fixed width. Explorer is 300 px;
    // the existing knot/stitch navigator remains 200 px. Neither column can
    // be resized by dragging, and opening both does not make them share width.
    let left = 0;
    const panelByElement = new Map(panels.map(panel => [panel.$element[0], panel]));
    $(".nav-wrapper").each((index, element) => {
        const $element = $(element);
        const panel = panelByElement.get(element);
        if( !panel ) {
            $element.css({ width: "0px", left: "0px" });
            return;
        }
        $element.css({ width: (panel.width - 1) + "px", left: left + "px" });
        left += panel.width;
    });
}

function toggle(id, buttonId){

    var $button = $("#toolbar " + buttonId);
    var $thisPanel = $(id);

    var columns =  2 - $(".nav-wrapper.hidden").length;

    if ($thisPanel.hasClass("hidden")) {
        columns++;
        $thisPanel.removeClass("hidden");
        $button.addClass("selected");
    } else {
        columns--;
        $thisPanel.addClass("hidden");
        $button.removeClass("selected");     
    }

   
    if (columns == 0) {
        hideSidebar();
    } else { 
        showSidebar(columns);
   
    }

 
}

// Helper function that gets all the external function names from a list of InkFiles
function getExternals(file) {
    return file.symbols.getCachedExternals();
}

exports.NavView = {
    setMainInkFilename: setMainInkFilename,
    setFiles: setFiles,
    setKnots: setKnots,
    updateCurrentKnot: updateCurrentKnot,
    highlightRelativePath: highlightRelativePath,
    showDialog: options => showExplorerDialog(options),
    setAudioFiles: list => { audioFileList = Array.isArray(list) ? list.slice() : []; },
    setImageFiles: list => { imageFileList = Array.isArray(list) ? list.slice() : []; },
    showMessage: message => showExplorerDialog({ title: "Inky", message: String(message), buttons: [{ label: "OK", value: true, primary: true }] }),
    setEvents: e => events = e,
    hide: hideSidebar,
    show: showSidebar,
    initialShow: () => { if( !hasBeenShown ) 
        toggle("#file-nav-wrapper");
    },
    toggle: toggle,
    selectedFolder: () => selectedFolder,
    refreshFolders: (projectDir) => { if( projectDir ) delete folderTreeCache[path.resolve(projectDir)]; },
    selectFolder: (folderPath) => {
        selectedFolder = String(folderPath || "").replace(/\\/g, "/").replace(/^\.\//, "");
        let parent = selectedFolder;
        while( parent ) {
            folderOpenState[parent] = true;
            const slash = parent.lastIndexOf("/");
            parent = slash === -1 ? "" : parent.substring(0, slash);
        }
        if( lastMainInk ) setFiles(lastMainInk, lastFiles, lastProjectDir);
    }
};
