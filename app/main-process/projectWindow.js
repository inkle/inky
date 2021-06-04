const electron = require('electron');
const ipc = electron.ipcMain;
const dialog = electron.dialog;
const BrowserWindow = electron.BrowserWindow;
const path = require("path");
const fs = require("fs");
const Inklecate = require("./inklecate.js").Inklecate;
const Menu = electron.Menu;
const i18n = require("./i18n/i18n.js");

const electronWindowOptions = {
  width: 1300,
  height: 730,
  minWidth: 350,
  minHeight: 250,
  titleBarStyle: 'hidden',
  webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'preload.js')
  }
};

var windows = [];

const recentFilesPath = path.join(electron.app.getPath("userData"), "recent-files.json");

let onRecentFilesChanged = null;

const veiwSettingsPath = path.join(electron.app.getPath("userData"), "view-settings.json");

let onViewSettingsChanged = null;

function ProjectWindow(filePath) {
    const getThemeFromMenu = () => Menu.getApplicationMenu().items.find(
        e => e.label.toLowerCase() === 'view'
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

    if( filePath ) {
        this.browserWindow.webContents.on('dom-ready', () => {
            this.browserWindow.setRepresentedFilename(filePath);
            this.browserWindow.webContents.send('set-project-main-ink-filepath', filePath);
        });
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

    this.browserWindow.webContents.on('dom-ready', () => {
        this.browserWindow.send("change-theme", getThemeFromMenu());
    });
}

ProjectWindow.prototype.newInclude = function() {
    this.browserWindow.webContents.send('project-new-include');
}

ProjectWindow.prototype.save = function() {
    this.browserWindow.webContents.send('project-save');
}

ProjectWindow.prototype.exportJson = function() {
    this.browserWindow.webContents.send('project-export');
}

ProjectWindow.prototype.exportForWeb = function() {
    this.browserWindow.webContents.send('project-export-for-web');
}

ProjectWindow.prototype.exportJSOnly = function() {
    this.browserWindow.webContents.send('project-export-js-only');
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

ProjectWindow.all = () => windows;

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

ProjectWindow.setRecentFilesChanged = function(f) {
    onRecentFilesChanged = f;
}

ProjectWindow.getRecentFiles = function() {
    if(!fs.existsSync(recentFilesPath)) {
        return [];
    }
    const json = fs.readFileSync(recentFilesPath, "utf-8");
    try {
        return JSON.parse(json);
    } catch(e) {
        console.error("Error in recent files JSON parsing:", e);
        return [];
    }
}

function addRecentFile(filePath) {
    const resolvedFilePath = path.resolve(filePath);
    const recentFiles = ProjectWindow.getRecentFiles();
    const newRecentFiles = recentFiles.indexOf(resolvedFilePath) >= 0 ?
        recentFiles :
        [resolvedFilePath].concat(recentFiles).slice(0, 5);
    fs.writeFileSync(recentFilesPath, JSON.stringify(newRecentFiles), {
        encoding: "utf-8"
    });
    if(onRecentFilesChanged) {
        onRecentFilesChanged(newRecentFiles);
    }
}

ProjectWindow.open = function(filePath) {
    if( !filePath ) {
        var multiSelectPaths = dialog.showOpenDialog({
            title: i18n._("Open main ink file"),
            properties: ['openFile'],
            filters: [
                { name: i18n._('Ink files'), extensions: ['ink'] }
            ]
        });

        if( multiSelectPaths && multiSelectPaths.length > 0 )
            filePath = multiSelectPaths[0];
    }

    // TODO: Could check whether the filepath is relative to any of our
    // existing open projects, and switch to that window?

    if( filePath) {
        addRecentFile(filePath);
        return new ProjectWindow(filePath);
    }
}

ProjectWindow.setViewSettingsChanged = function(f) {
    onViewSettingsChanged = f;
}

ProjectWindow.getViewSettings = function() {
    if(!fs.existsSync(veiwSettingsPath)) {
        return { theme:'light', zoom:'100' };
    }
    const json = fs.readFileSync(veiwSettingsPath, "utf-8");
    try {
        return JSON.parse(json);
    } catch(e) {
        console.error('Error in view settings JSON parsing:', e);
        return { theme:'light', zoom:'100' };
    }
}

ProjectWindow.addOrChangeViewSetting = function(name, data){
    const viewSettings = ProjectWindow.getViewSettings();
    viewSettings[name] = data;
    fs.writeFileSync(veiwSettingsPath, JSON.stringify(viewSettings), {
        encoding: "utf-8"
    });
    if(onViewSettingsChanged) {
        onViewSettingsChanged(viewSettings);
    }
}


ipc.on("main-file-saved", (_, filePath) => {
    addRecentFile(filePath);
});

ipc.on("project-final-close", (event) => {
    var win = ProjectWindow.withWebContents(event.sender);
    win.finalClose();
});

exports.ProjectWindow = ProjectWindow;
