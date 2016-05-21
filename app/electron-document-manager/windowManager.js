'use strict';

const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const path = require('path');
const _ = require('lodash');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
var windows = [];
var untitledIndex = 1;
var indexFile;

var focusUpdateHandler = null;
var windowOptions = null;

function createWindow(options) {
  options = options || {};

  //pick a title (set as BrowserWindow.title and send with set-title)
  var title = options.filepath ? path.basename(options.filepath) : ( "Untitled " + untitledIndex++ );

  var parameters = windowOptions || {
      width: 800,
      height: 600,
      title: title
  };

  if(options.focusedWindow) {
    var bounds = options.focusedWindow.getBounds();
    parameters = _.extend(parameters, {
      x: bounds.x + 20,
      y: bounds.y + 20
    });
  }

  // Create the browser window.
  var window = new BrowserWindow(parameters);
  windows.push(window);

  // and load the index.html of the app.
  window.loadURL(indexFile);

  if(options.filename) {
    window.setRepresentedFilename(options.filename);
  }

  if(options.fileContent) {
    window.webContents.on('did-finish-load', function() {
      window.webContents.send('set-content', options.fileContent);
      window.webContents.send('set-filepath', options.filepath);
    });
  }

  // Emitted when the window is closed.
  window.on('closed', function() {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    window = null;
    windows = _.without(windows, null); //get rid of null windows
  });

  if(focusUpdateHandler) {
    focusUpdateHandler();
    window.on('focus', focusUpdateHandler);
    window.on('blur', focusUpdateHandler);
  }
}

module.exports = {
  createWindow: createWindow,
  //note: focus and blur handlers will only apply to future windows at creation
  setFocusUpdateHandler: function(func) {
    focusUpdateHandler = func;
  },
  initializeWithEntryPoint: function(entryPointArg, windowOptionsArg) {
    indexFile = entryPointArg;
    windowOptions = windowOptionsArg;
  }
};
