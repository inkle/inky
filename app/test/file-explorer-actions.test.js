const assert = require("assert");
const fs = require("fs");
const path = require("path");

describe("project Explorer file actions", function () {
    const rendererDir = path.join(__dirname, "../renderer");
    const navView = fs.readFileSync(path.join(rendererDir, "navView.js"), "utf8");
    const project = fs.readFileSync(path.join(rendererDir, "inkProject.js"), "utf8");
    const controller = fs.readFileSync(path.join(rendererDir, "controller.js"), "utf8");

    it("uses jsTree's context menu, with the Explorer's own items and actions", function () {
        assert.match(navView, /plugins: \["wholerow", "dnd", "contextmenu"\]/);
        assert.match(navView, /contextmenu: \{ items: contextItems, select_node: false/);
        // the items: new file / folder, import, rename (F2) and delete (Delete key), with their shortcuts
        assert.match(navView, /label: "New File\.\.\.", shortcut: 78, shortcut_label: "Alt\+N"/);
        assert.match(navView, /label: "New Folder\.\.\.", shortcut: 80, shortcut_label: "Alt\+P"/);
        assert.match(navView, /label: "Import Files\.\.\.", shortcut: 77, shortcut_label: "Alt\+M"/);
        assert.match(navView, /label: "Rename",[\s\S]*?shortcut: 113,[\s\S]*?_disabled: targets\.length !== 1 \|\| targets\[0\]\.audio/);
        assert.match(navView, /label: "Delete",[\s\S]*?shortcut: 46,[\s\S]*?_disabled: targets\.length === 0/);
        // a right-click selects the row without "clicking" it (that would open it or toggle the folder)
        assert.match(navView, /tree\.select_node\(node, true\)/);
        assert.match(navView, /click\.type === "contextmenu"/);
        // the old hand-made menu is gone
        assert.doesNotMatch(navView, /explorer-context-|showExplorerContextMenu/);
        assert.doesNotMatch(fs.readFileSync(path.join(rendererDir, "main.css"), "utf8"), /explorer-context|\.tree-file|\.folder-row/);
        assert.match(navView, /event\.key !== "Delete"/);
        // Confirmation is an in-page dialog, never a native confirm()/alert() box.
        assert.match(navView, /showExplorerDialog\(/);
        assert.doesNotMatch(navView.replace(/\/\/.*$/gm, ""), /window\.confirm\(|\balert\(/);
        assert.match(navView, /confirmDeleteItems\(/);
        assert.match(navView, /events\.deleteItem\(target\.type, target\.path\)/);
    });

    it("preserves file extensions and prevents deleting the main story", function () {
        assert.match(project, /withPreservedExtension\(oldRel, name\)/);
        assert.match(project, /InkProject\.prototype\.deleteProjectItem/);
        assert.match(project, /mainRelative === relative/);
        assert.match(project, /fs\.rmSync\(absolute, \{ recursive: type === "folder"/);
        assert.match(controller, /deleteItem: \(type, relativePath\) =>/);
    });

    it("draws the tree with jsTree and moves any file or folder, one or several, by dragging", function () {
        // jsTree does the tree, the selection, the keyboard, the inline editor and the dragging
        assert.match(navView, /\$host\.jstree\(\{/);
        assert.match(navView, /plugins: \["wholerow", "dnd", "contextmenu"\]/);
        assert.match(navView, /multiple: true/);
        assert.match(navView, /dnd: \{ copy: false, large_drop_target: true/);
        assert.match(navView, /tree\.edit\(nodeId, stem,/);
        // what the project does with a drop is still the project's own move
        assert.match(navView, /events\.renameItem\(item\.type, item\.path, null, \{ moveToFolder: folder \}\)/);
        assert.match(navView, /\$host\.on\("move_node\.jstree"/);
        assert.match(navView, /ExplorerTree\.canMoveInto\(/);
        assert.doesNotMatch(navView, /dragstart|text\/plain|\.attr\("draggable"/);
        assert.match(controller, /renameItem: \(type, relativePath, newName, options\) =>/);
        assert.match(controller, /project\.renameProjectItem\(type, relativePath, newName, options\)/);
        assert.match(project, /options && typeof options\.moveToFolder === "string"/);
    });

    it("ships jsTree with its licence and loads it without a bundler", function () {
        const jstreeDir = path.join(rendererDir, "jstree");
        assert.ok(fs.statSync(path.join(jstreeDir, "jstree.min.js")).size > 100000);
        assert.ok(fs.existsSync(path.join(jstreeDir, "LICENSE-MIT")));
        ["style.min.css", "32px.png", "40px.png", "throbber.gif"].forEach(file =>
            assert.ok(fs.existsSync(path.join(jstreeDir, "themes", "default", file)), file));
        assert.match(navView, /new Function\("jQuery", "module", "exports", "define", source\)/);
        const html = fs.readFileSync(path.join(rendererDir, "index.html"), "utf8");
        assert.match(html, /jstree\/themes\/default\/style\.min\.css/);
        assert.match(html, /explorerTree\.css/);
    });

    it("uses distinct inline folder icons for open and closed folders", function () {
        const builder = fs.readFileSync(path.join(rendererDir, "explorerTree.js"), "utf8");
        assert.match(builder, /folder-icon-closed/);
        assert.match(builder, /folder-icon-open/);
        const styles = fs.readFileSync(path.join(rendererDir, "explorerTree.css"), "utf8");
        assert.match(styles, /\.jstree-open > \.jstree-anchor \.folder-icon-open/);
        assert.match(styles, /\.jstree-open > \.jstree-anchor \.folder-icon-closed/);
    });

    it("lists and opens every project picture through the one shared image list", function () {
        const { IMAGE_EXTENSIONS, IMAGE_FOLDER } = require("../renderer/imageTypes.js");
        assert.match(project, /trackImageFile\(absPath, true\)/);
        assert.match(project, /NavView\.setImageFiles/);
        assert.match(project, /isImageFileName/);
        assert.match(controller, /openImageFile: relativePath =>/);
        assert.match(controller, /project\.openImageFile\(absolute\)/);
        // the Explorer and the viewer never carry their own extension list
        const viewer = fs.readFileSync(path.join(rendererDir, "imageViewer.js"), "utf8");
        assert.match(viewer, /require\(".\/imageTypes.js"\)/);
        assert.doesNotMatch(navView + fs.readFileSync(path.join(rendererDir, "explorerTree.js"), "utf8"), /\.png|\.svg|\.jpg/);
        assert.doesNotMatch(viewer, /"\.png"|"\.svg"|"\.jpg"/);
        assert.ok(IMAGE_EXTENSIONS.includes(".jpg") && IMAGE_EXTENSIONS.includes(".webp") && IMAGE_EXTENSIONS.includes(".gif"));
        assert.strictEqual(IMAGE_FOLDER, "images");
    });

    it("imports pictures into images, and the favicon into the project root", function () {
        assert.match(controller, /name: "Images"/);
        assert.match(controller, /project\.noteImageFiles\(imageRels\)/);
        assert.match(controller, /largeImages/);
        assert.match(fs.readFileSync(path.join(rendererDir, "projectImport.js"), "utf8"),
            /const destName = isFavicon \? "favicon" \+ path\.extname\(name\)\.toLowerCase\(\) : name/);
    });
    it("styles jsTree's menu without the theme's icon column, its divider line and its white separator box", function () {
        const styles = fs.readFileSync(path.join(rendererDir, "explorerTree.css"), "utf8");
        // no icons here: the empty icon column and the divider after it are hidden
        assert.match(styles, /li > a > i,\s*\.vakata-context\.jstree-default-contextmenu li > a \.vakata-contextmenu-sep \{ display: none; \}/);
        // the separator is a thin line; the items' own padding must not reach it
        assert.match(styles, /\.vakata-context-separator > a,[\s\S]*?\{ display: block; height: 1px;[^}]*padding: 0;[^}]*border-top: 1px solid/);
        assert.doesNotMatch(styles, /li > a \{ padding: 3px 28px/);
        // shortcuts the theme hides are shown, right-aligned; the dark theme has its own colours
        assert.match(styles, /vakata-contextmenu-shortcut \{ display: inline-block; margin-left: auto;/);
        assert.match(styles, /\.window\.dark \.vakata-context\.jstree-default-contextmenu \{ background: #2b2b2b;/);
    });
});
