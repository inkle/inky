'use strict';

const electron = require('electron');
const app = electron.app;  // Module to control application life.
const BrowserWindow = electron.BrowserWindow;
const menuManager = require('./menuManager');
const fileManager = require('./fileManager');
const windowManager = require('./windowManager');

var initialize = function(options) {

  windowManager.initializeWithEntryPoint(options.entryPoint, options.windowOptions);

  // Quit when all windows are closed.
  app.on('window-all-closed', function() {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform != 'darwin') {
      app.quit();
    } else {
      menuManager.updateMenu();
    }
  });

  app.on('open-file', function(e, path) {
    app.addRecentDocument(path);
  });

  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  app.on('ready', function() {
    //set up menu
    menuManager.setMenu({
      newMethod: function(item, focusedWindow) {
        windowManager.createWindow({ focusedWindow: focusedWindow });
      },
      openMethod: function(item, focusedWindow) {
        fileManager.openFile(function(err, filepath, currentFileContent, openFileContent) {
          var isEdited = fileManager.fileIsEdited(filepath, currentFileContent);
          if(BrowserWindow.getFocusedWindow() && !isEdited && currentFileContent === "") {
            //open in current window
            BrowserWindow.getFocusedWindow().webContents.send('set-content', openFileContent);
            BrowserWindow.getFocusedWindow().webContents.send('set-filepath', filepath);
            BrowserWindow.getFocusedWindow().setRepresentedFilename(filepath);
          } else {
            //open in different window
            windowManager.createWindow({
              focusedWindow: focusedWindow,
              fileContent: openFileContent,
              filepath: filepath
            });
          }
        });
      },
      saveMethod: function(item, focusedWindow) {
        fileManager.saveFile();
      },
      saveAsMethod: function(item, focusedWindow) {
        fileManager.saveFileAs();
      },
      renameMethod: function(item, focusedWindow) {
        //fileManager.renameFile();
        //to implement later
      },
      closeMethod: function(item, focusedWindow) {
        fileManager.closeFile();
      }
    });

    //set up window menu updates - to be run on focus, blur, and window create
    windowManager.setFocusUpdateHandler(menuManager.updateMenu);

    //create first window
    windowManager.createWindow();
  });
}

module.exports = {
  getRendererModule: function() {
    return require('./rendererModule');
  },
  main: initialize
}
