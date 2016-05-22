const electron = require('electron')
const app = electron.app
const dialog = electron.dialog;
const Window = require("./window.js").Window;
const appmenus = require('./appmenus.js');
const inklecate = require('./inklecate.js');
const DocumentManager = require('./electron-document-manager/main.js').main;
const BrowserWindow = electron.BrowserWindow;


// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', function() {

    appmenus.setupMenus({
        new: () => {},
        open: () => {
            var multiSelectPaths = dialog.showOpenDialog({
                properties: ['openFile']
            });
            if( multiSelectPaths && multiSelectPaths.length > 0 ) {
                Window.open(multiSelectPaths[0]);
            }
        },
        save: () => {},
        saveAs: () => {},
        rename: () => {},
        close: () => {},
        nextIssue: (item, focusedWindow) => {
            focusedWindow.webContents.send("next-issue");
        }
    });

    Window.createEmpty();

    // Debug
    w.openDevTools();
});
