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


function ProjectWindow(filePath) {
    this.browserWindow = new BrowserWindow(electronWindowOptions);
    this.browserWindow.loadURL("file://" + __dirname + "/index.html");

    if( filePath ) {
        this.browserWindow.webContents.on('dom-ready', () => {
            this.browserWindow.setRepresentedFilename(filePath);
            this.browserWindow.webContents.send('set-project-main-ink-filepath', filePath);
        });
    }
}

ProjectWindow.prototype.openDevTools = function() {
    this.browserWindow.webContents.openDevTools();
}

ProjectWindow.createEmpty = function() {
    var newEmpty = new ProjectWindow();
    windows.push(newEmpty);
    return newEmpty;
}

ProjectWindow.open = function(filePath) {
    var w = new ProjectWindow(filePath);
    windows.push(w);
    return w;
}


exports.ProjectWindow = ProjectWindow;