const electron = require('electron');
const ipc = electron.ipcMain;
const BrowserWindow = electron.BrowserWindow;
const path = require("path");
const Inklecate = require("./inklecate.js").Inklecate;

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
            windows.splice(idx);
    });
}

ProjectWindow.prototype.save = function() {
    this.browserWindow.webContents.send('project-save');
}

ProjectWindow.prototype.saveCurrentFile = function() {
    this.browserWindow.webContents.send('project-saveCurrentFile');
}

ProjectWindow.prototype.saveCurrentFileAs = function() {
    this.browserWindow.webContents.send('project-saveCurrentFileAs');
}

ProjectWindow.prototype.tryClose = function() {
    this.browserWindow.webContents.send('project-tryClose');
}

ProjectWindow.prototype.finalClose = function() {
    this.safeToClose = true;
    Inklecate.killSessions(this.browserWindow);
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

ProjectWindow.tryClose = function() {
    var win = focusedWindow();
    if( win ) {
        win.tryClose();
    }
    return true;
}

ProjectWindow.save = function() {
    var win = focusedWindow();
    if( win ) {
        win.save();
    }
}


ProjectWindow.saveCurrentFile = function() {
    var win = focusedWindow();
    if( win ) {
        win.saveCurrentFile();
    }
}

ProjectWindow.saveCurrentFileAs = function() {
    var win = focusedWindow();
    if( win ) {
        win.saveCurrentFileAs();
    }
}

ipc.on("project-final-close", (event) => {
    var win = windowWithWebContents(event.sender);
    win.finalClose();
});

exports.ProjectWindow = ProjectWindow;