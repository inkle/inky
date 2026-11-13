const electron = require('electron');
const ipc = electron.ipcMain;
const dialog = electron.dialog;
const inkyFileDialog = require("./inkyFileDialog.js");
const BrowserWindow = electron.BrowserWindow;
const path = require("path");
const fs = require("fs");
const Inklecate = require("./inklecate.js").Inklecate;
const Menu = electron.Menu;
const i18n = require("./i18n/i18n.js");

var electronWindowOptions = {
  width: 1300,
  height: 730,
  minWidth: 350,
  minHeight: 250,
  icon: path.join(__dirname, '..', 'renderer', 'about', 'icon-round.png'),
  webPreferences: {
    preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
    nodeIntegration: true,
    nodeIntegrationInSubFrames: true,
    contextIsolation: false
  },
  
};


if( process.platform == "darwin" ) {
    electronWindowOptions.titleBarStyle = 'hidden';
    electronWindowOptions.titleBarOverlay = true;
}

var windows = [];

const recentFilesPath = path.join(electron.app.getPath("userData"), "recent-files.json");

const viewSettingsPath = path.join(electron.app.getPath("userData"), "view-settings.json");


// Overriden by main.js
var events = {
    onRecentFilesChanged:    (files) => {},
    onProjectSettingsChanged: (settings) => {},
    onViewSettingsChanged:   (settings) => {}
};


function ProjectWindow(filePath) {
    const getThemeFromMenu = () => Menu.getApplicationMenu().items.find(
        e => e.label.toLowerCase() === '&view'
    ).submenu.items.find(
        e => e.label.toLowerCase() === 'theme'
    ).submenu.items.find(
        e => e.checked
    ).label.toLowerCase();

    electronWindowOptions.title = i18n._("Inky");
    this.browserWindow = new BrowserWindow(electronWindowOptions);
    this.browserWindow.loadURL("file://" + __dirname + "/../renderer/index.html");
    this.browserWindow.setSheetOffset(49);

    this.safeToClose = false;
    this.mainInkAbsPath = filePath;

    // Existing project at specific path
    if( filePath ) {
        this.browserWindow.webContents.on('dom-ready', () => {
            this.browserWindow.setRepresentedFilename(filePath);
            this.browserWindow.webContents.send('set-project-main-ink-filepath', filePath);

            // Try to load settings 
            this.refreshProjectSettings(filePath);
        });
    }
    
    // New project, new settings
    else {
        this.settings = {};
        if( events.onProjectSettingsChanged )
            events.onProjectSettingsChanged({});
    }

    windows.push(this);

    this.browserWindow.on("close", (event) => {
        if( !this.safeToClose ) {
            event.preventDefault();
            this.tryClose();
        }
    })

    this.browserWindow.on("closed", () => {
        var idx = windows.indexOf(this);
        if( idx != -1 )
            windows.splice(idx, 1);
    });

    // Set up theme/zoom from settings
    this.browserWindow.webContents.on('dom-ready', () => {
        this.browserWindow.send("change-theme", getThemeFromMenu());

        let settings = ProjectWindow.getViewSettings();
        this.zoom(settings.zoom);
        this.browserWindow.webContents.send('set-animation-enabled', settings.animationEnabled);
        this.browserWindow.webContents.send('set-autocomplete-disabled', !!settings.autoCompleteDisabled);
    });

    // Project settings may affect menus etc, so we refresh that
    // when changing focus between different windows
    this.browserWindow.on("focus", () => {
        if( this.mainInkAbsPath ) addRecentFile(this.mainInkAbsPath);
        if( events.onProjectSettingsChanged )
            events.onProjectSettingsChanged(this.settings);
    });
}

ProjectWindow.prototype.newInclude = function() {
    this.browserWindow.webContents.send('project-new-include');
}

ProjectWindow.prototype.save = function() {
    this.browserWindow.webContents.send('project-save');
}

ProjectWindow.prototype.exportForWeb = function() {
    this.browserWindow.webContents.send('project-export-for-web');
}

ProjectWindow.prototype.tryClose = function() {
    this.browserWindow.webContents.send('project-tryClose');
}

ProjectWindow.prototype.stats = function() {
    this.browserWindow.webContents.send('project-stats');
}

ProjectWindow.prototype.keyboardShortcuts = function() {
    this.browserWindow.webContents.send('keyboard-shortcuts');
}

ProjectWindow.prototype.finalClose = function() {
    this.safeToClose = true;
    Inklecate.killSessions(this.browserWindow);
    this.browserWindow.close();
}

ProjectWindow.prototype.openDevTools = function() {
    this.browserWindow.webContents.openDevTools();
}

ProjectWindow.prototype.zoom = function(amount) {
    this.browserWindow.webContents.send('zoom', amount);
}

// Try to load up an optional <ink_root_file_name>.settings.json file
ProjectWindow.prototype.refreshProjectSettings = function(rootInkFilePath) {
    
    let self = this;


    const resolvedRootPath = path.resolve(rootInkFilePath);
    let basePath = rootInkFilePath;
    if( path.extname(resolvedRootPath) == ".ink" ) {
        basePath = rootInkFilePath.substring(0, resolvedRootPath.length-4)
    }
    const settingsPath = basePath + ".settings.json";


    function completeSettings(settings, err) {
        if( events.onProjectSettingsChanged ) {
            events.onProjectSettingsChanged(settings);
        }

        self.browserWindow.send("project-settings-changed", self.settings);

        if( err ) {
            dialog.showErrorBox("Project Settings Error", err);
        }
    }

    fs.stat(settingsPath, (err, stats) => {
        if( err || !stats.isFile() ) { 
            events.onProjectSettingsChanged({});
            return;
        }

        fs.readFile(settingsPath, "utf8", (err, fileContent) => {

            if( err ) {
                completeSettings({}, "File read error - failed to load project settings file at: "+settingsPath);
                return;
            }
            if( !fileContent ) {
                completeSettings({}, "Project settings file appeared to be empty: "+settingsPath);
                return;
            }

            let settings = {};
            try {
                settings = JSON.parse(fileContent);
            } catch(error) {
                completeSettings({}, "Project settings file appeared to be invalid JSON: "+settingsPath+": "+error);
                return;
            }

            self.settings = settings;

            completeSettings(settings);
        });

    });
}


ProjectWindow.all = () => windows;

ProjectWindow.setEvents = function(newEvents) {
    events = newEvents
}


ProjectWindow.createEmpty = function() {
    return new ProjectWindow();
}

ProjectWindow.focused = function() {
    var browWin = BrowserWindow.getFocusedWindow();
    if( browWin )
        return ProjectWindow.withWebContents(browWin.webContents);
    else
        return null;
}


ProjectWindow.withWebContents = function(webContents) {
    if( !webContents )
        return null;

    for(var i=0; i<windows.length; i++) {
        if( windows[i].browserWindow.webContents === webContents )
            return windows[i];
    }
    return null;
}


ProjectWindow.withMainkInkPath = function(absPath) {
    if( !absPath ) return null;

    for(var i=0; i<windows.length; i++) {
        if( windows[i].mainInkAbsPath == absPath )
            return windows[i];
    }
    return null;
}


ProjectWindow.getRecentFiles = function() {
    try {
        const recentFiles = JSON.parse(fs.readFileSync(recentFilesPath, "utf-8"));
        return Array.isArray(recentFiles) ? recentFiles.filter(file =>
            typeof file === "string" && file.trim().length > 0) : [];
    } catch(e) {
        if( e.code !== "ENOENT" ) console.error("Could not read recent projects:", e);
        return [];
    }
}

ProjectWindow.getStartupPath = function(requestedPath, args = [], baseDir = process.cwd()) {
    const availableProject = candidate => {
        if( typeof candidate !== "string" || !candidate.trim() ) return null;
        const absolutePath = path.resolve(baseDir, candidate);
        if( path.extname(absolutePath).toLowerCase() !== ".ink" ) return null;
        try {
            if( !fs.statSync(absolutePath).isFile() ) return null;
            fs.accessSync(absolutePath, fs.constants.R_OK);
            return absolutePath;
        } catch(error) {
            return null;
        }
    };
    const requested = availableProject(requestedPath);
    if( requested ) return requested;
    for( const arg of args ) {
        if( typeof arg !== "string" || arg.startsWith("-") ) continue;
        const explicit = availableProject(arg);
        if( explicit ) return explicit;
    }
    for( const recent of ProjectWindow.getRecentFiles() ) {
        const saved = availableProject(recent);
        if( saved ) return saved;
    }
    return null;
}

ProjectWindow.clearRecentFiles = function() {
    if(fs.existsSync(recentFilesPath)) {
        fs.unlinkSync(recentFilesPath);
    }
}

function addRecentFile(filePath) {
    const resolvedFilePath = path.resolve(filePath);
    const recentFiles = ProjectWindow.getRecentFiles();
    const newRecentFiles = [resolvedFilePath].concat(
        recentFiles.filter(recentPath =>
            typeof recentPath === "string" && path.resolve(recentPath) !== resolvedFilePath
        )
    ).slice(0, 5);
    try {
        fs.writeFileSync(recentFilesPath, JSON.stringify(newRecentFiles), {
            encoding: "utf-8"
        });
    } catch(error) {
        console.error("Could not remember recent project:", error);
        return;
    }

    if( events.onRecentFilesChanged ) {
        events.onRecentFilesChanged(newRecentFiles);
    }
}

// Opening a GTK file chooser must never block the Electron main process.
// The previous synchronous spawnSync() call prevented X11/GTK from processing
// its parent window while the chooser was open. Use the same non-blocking path
// that already works for Export for Web. Direct-path opens remain synchronous.
let openMainInkDialogPending = false;
ProjectWindow.open = function(filePath) {
    if (!filePath) {
        // Prevent two overlapping dialogs if File > Open is triggered twice.
        if (openMainInkDialogPending) return Promise.resolve();
        const openOptions = {
            title: i18n._("Open main ink file"),
            properties: ['openFile'],
            filters: [
                { name: i18n._('Ink files'), extensions: ['ink'] }
            ]
        };
        const focusedProject = ProjectWindow.focused();
        const parent = (focusedProject && focusedProject.browserWindow) ||
            windows.map(project => project.browserWindow).find(win =>
                win && !win.isDestroyed() && win.isVisible());
        openMainInkDialogPending = true;
        return inkyFileDialog.showOpenDialog(parent, openOptions)
            .then(result => {
                if (result && !result.canceled && Array.isArray(result.filePaths) &&
                    typeof result.filePaths[0] === "string" && result.filePaths[0]) {
                    return ProjectWindow.open(result.filePaths[0]);
                }
                return undefined;
            })
            .catch(error => {
                console.error("Could not open main Ink file:", error);
                return undefined;
            })
            .finally(() => { openMainInkDialogPending = false; });
    }

    // Direct paths from Recent Files, the CLI and drag-and-drop still open
    // without waiting on a dialog or changing their return behavior.
    addRecentFile(filePath);
    return new ProjectWindow(filePath);
}

ProjectWindow.getViewSettings = function() {
    let viewSettingDefaults = { theme:'light', zoom:'100', animationEnabled:true };

    if(!fs.existsSync(viewSettingsPath)) {
        return viewSettingDefaults;
    }
    
    const json = fs.readFileSync(viewSettingsPath, "utf-8");
    try {
        let loadedSettings = JSON.parse(json);

        // if we've added a new setting or one is missing, make sure they all exist
        for(requiredKey in viewSettingDefaults) {
            if(loadedSettings[requiredKey] === undefined) {
                loadedSettings[requiredKey] = viewSettingDefaults[requiredKey];
            }
        }

        return loadedSettings;
    } catch(e) {
        console.error('Error in view settings JSON parsing:', e);
        return viewSettingDefaults;
    }
}

ProjectWindow.addOrChangeViewSetting = function(name, data){
    const viewSettings = ProjectWindow.getViewSettings();
    viewSettings[name] = data;
    fs.writeFileSync(viewSettingsPath, JSON.stringify(viewSettings), {
        encoding: "utf-8"
    });
    if(events.onViewSettingsChanged) {
        events.onViewSettingsChanged(viewSettings);
    }
}


ipc.on("main-file-saved", (event, absFilePath) => {
    if( typeof absFilePath !== "string" || absFilePath.length === 0 ) return;
    addRecentFile(absFilePath);

    var win = ProjectWindow.withWebContents(event.sender);
    if( !win ) return;
    win.mainInkAbsPath = absFilePath;
    win.refreshProjectSettings(absFilePath);
});

ipc.on("project-final-close", (event) => {
    var win = ProjectWindow.withWebContents(event.sender);
    win.finalClose();
});

ipc.on("project-settings-needs-reload", (event, rootInkFilePath) => {
    var win = ProjectWindow.withWebContents(event.sender);
    win.refreshProjectSettings(rootInkFilePath);
});

ipc.on("set-native-window-title", (event, newWindowTitle) => {
    var win = ProjectWindow.withWebContents(event.sender);
    win.browserWindow.title = newWindowTitle;
});

exports.ProjectWindow = ProjectWindow;
