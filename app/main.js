const electron = require('electron')
const app = electron.app
const dialog = electron.dialog;
const ProjectWindow = require("./projectWindow.js").ProjectWindow;
const appmenus = require('./appmenus.js');


// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', function() {

    appmenus.setupMenus({
        new: () => {
            ProjectWindow.createEmpty();
        },
        open: () => {
            var multiSelectPaths = dialog.showOpenDialog({
                properties: ['openFile']
            });
            if( multiSelectPaths && multiSelectPaths.length > 0 ) {
                ProjectWindow.open(multiSelectPaths[0]);
            }
        },
        save: () => {
            ProjectWindow.saveFocused();
        },
        saveAs: () => {
            ProjectWindow.saveAsFocused();
        },
        close: () => {
            //windows = _.without(windows, null); //get rid of null windows
            ProjectWindow.closeFocused();
        },
        nextIssue: (item, focusedWindow) => {
            focusedWindow.webContents.send("next-issue");
        }
    });

    var w = ProjectWindow.createEmpty();

    // Debug
    //w.openDevTools();
});

app.on('window-all-closed', function() {
    if (process.platform != 'darwin') {
        app.quit();
    }
});
