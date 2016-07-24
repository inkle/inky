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

function DocumentationWindow() {
  this.browserWindow = new BrowserWindow(electronWindowOptions);
  this.browserWindow.loadURL("file://" + __dirname + "/../renderer/documentation/window.html");
}
DocumentationWindow.openDocumentation = function () {
  return new DocumentationWindow();
}

exports.DocumentationWindow = DocumentationWindow;