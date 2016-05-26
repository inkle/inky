const electron = require('electron');
const ipc = electron.ipcMain;
const BrowserWindow = electron.BrowserWindow;
const path = require("path");

const electronWindowOptions = {
  width: 1300, 
  height: 730, 
  minWidth: 350,
  minHeight: 250,
  titleBarStyle: 'hidden'
};

var windows = [];

function windowWithBrowserWindow(browWin) {
    return browWin ? windowWithWebContents(browWin.webContents) : null;
}

function windowWithWebContents(webContents) {
    if( !webContents )
        return null;

    for(var i=0; i<windows.length; i++) {
        if( windows[i].browserWindow.webContents === webContents )
            return windows[i];
    }
    return null;
}

function focusedWindow() {
    var browWin = BrowserWindow.getFocusedWindow();
    if( browWin )
        return windowWithBrowserWindow(browWin);
    else
        return null;
}

function ProjectWindow(filePath) {
    this.browserWindow = new BrowserWindow(electronWindowOptions);
    this.browserWindow.loadURL("file://" + __dirname + "/index.html");
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
            windows.splice(idx);
    });
}

ProjectWindow.prototype.save = function() {
    this.browserWindow.webContents.send('project-save-current');
}

ProjectWindow.prototype.saveAs = function() {
    this.browserWindow.webContents.send('project-saveAs-current');
}

ProjectWindow.prototype.saveAs = function() {
    this.browserWindow.webContents.send('project-saveAs-current');
}

ProjectWindow.prototype.tryClose = function() {
    this.browserWindow.webContents.send('project-tryClose');
}

ProjectWindow.prototype.finalClose = function() {
    this.safeToClose = true;
    this.browserWindow.close();
}

ProjectWindow.prototype.openDevTools = function() {
    this.browserWindow.webContents.openDevTools();
}

ProjectWindow.createEmpty = function() {
    return new ProjectWindow(); 
}

ProjectWindow.open = function(filePath) {
    // TODO: Could check whether the filepath is relative to any of our
    // existing open projects, and switch to that window?
    return new ProjectWindow(filePath);
}

ProjectWindow.tryCloseFocused = function() {
    var win = focusedWindow();
    if( win ) {
        win.tryClose();
    }
    return true;
}

ProjectWindow.saveFocused = function() {
    var win = focusedWindow();
    if( win ) {
        win.save();
    }
}

ProjectWindow.saveAsFocused = function() {
    var win = focusedWindow();
    if( win ) {
        win.saveAs();
    }
}

ipc.on("project-final-close", (event) => {
    var win = windowWithWebContents(event.sender);
    win.finalClose();
});

exports.ProjectWindow = ProjectWindow;