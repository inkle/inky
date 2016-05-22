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


function Window(filePath) {
    this.browserWindow = new BrowserWindow(electronWindowOptions);
    this.browserWindow.loadURL("file://" + __dirname + "/index.html");

    if( filePath ) {
        this.browserWindow.webContents.on('dom-ready', () => {
            this.browserWindow.setRepresentedFilename(filePath);
            this.browserWindow.webContents.send('set-project-main-ink-filepath', filePath);
        });
    }
}

Window.prototype.openDevTools = function() {
    this.browserWindow.webContents.openDevTools();
}

Window.createEmpty = function() {
    var newEmpty = new Window();
    windows.push(newEmpty);
    return newEmpty;
}

Window.open = function(filePath) {
    var w = new Window(filePath);
    windows.push(w);
    return w;
}


exports.Window = Window;