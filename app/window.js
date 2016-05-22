const electron = require('electron');
const BrowserWindow = electron.BrowserWindow;

const electronWindowOptions = {
  width: 1300, 
  height: 730, 
  minWidth: 350,
  minHeight: 250,
  titleBarStyle: 'hidden'
};

var windows = [];


function Window() {
    this.browserWindow = new BrowserWindow(electronWindowOptions);
    this.browserWindow.loadURL("file://" + __dirname + "/index.html");

    //window.setRepresentedFilename();
}

Window.prototype.openDevTools = function() {
    this.browserWindow.webContents.openDevTools();
}

Window.createEmpty = function() {
    var newEmpty = new Window();
    windows.push(newEmpty);
    return newEmpty;
}


exports.Window = Window;