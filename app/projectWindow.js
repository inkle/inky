const electron = require('electron');
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
    for(var i=0; i<windows.length; i++) {
        if( windows[i].browserWindow = browWin )
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

    if( filePath ) {
        this.browserWindow.webContents.on('dom-ready', () => {
            this.browserWindow.setRepresentedFilename(filePath);
            this.browserWindow.webContents.send('set-project-main-ink-filepath', filePath);
        });
    }

    windows.push(this);

    this.browserWindow.on("closed", () => {
        var idx = windows.indexOf(this);
        if( idx != -1 )
            windows.splice(idx);
    });
}

ProjectWindow.prototype.save = function() {
    this.browserWindow.webContents.send('project-save-current');
}

ProjectWindow.prototype.openDevTools = function() {
    this.browserWindow.webContents.openDevTools();
}

ProjectWindow.createEmpty = function() {
    return new ProjectWindow(); 
}

ProjectWindow.open = function(filePath) {
    return new ProjectWindow(filePath);
}

ProjectWindow.closeFocused = function() {
    var win = BrowserWindow.getFocusedWindow();
    if( win ) win.close();
}

ProjectWindow.saveFocused = function() {
    var win = focusedWindow();
    if( win ) {
        win.save();
    }
}

exports.ProjectWindow = ProjectWindow;