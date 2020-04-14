const electron = require('electron');
const BrowserWindow = electron.BrowserWindow;
const path = require("path");

const electronWindowOptions = {
  width: 1000,
  height: 650,
  minWidth: 700,
  minHeight: 300,
  title: "Documentation",
  autoHideMenuBar: true
};

var documentationWindow = null;

function DocumentationWindow(theme) {
	electronWindowOptions.theme = theme;
  var w = new BrowserWindow(electronWindowOptions);
  w.loadURL("file://" + __dirname + "/../renderer/documentation/window.html");

  // w.webContents.openDevTools();
	
  w.webContents.on("did-finish-load", () => {
    w.webContents.send("change-theme", theme);
    w.setMenu(null);
    w.show();
  });

  this.browserWindow = w;

  w.on("close", () => {
    documentationWindow = null;
  });
}

DocumentationWindow.openDocumentation = function (theme) {

  if( documentationWindow == null ) {
    documentationWindow = new DocumentationWindow(theme);
  }
  return documentationWindow;
}


DocumentationWindow.changeTheme = function (theme) {
  if( documentationWindow != null ) {
    documentationWindow.browserWindow.webContents.send("change-theme", theme);
  }
}

exports.DocumentationWindow = DocumentationWindow;
