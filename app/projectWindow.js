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

    windows.push(this);

    this.browserWindow.on("closed", () => {
        var idx = windows.indexOf(this);
        if( idx != -1 )
            windows.splice(idx);

        console.log("windows now has "+windows.length+" elements");
    });
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

ProjectWindow.closeFocussed = function() {
    var win = BrowserWindow.getFocusedWindow();
    if( win ) win.close();
}

exports.ProjectWindow = ProjectWindow;