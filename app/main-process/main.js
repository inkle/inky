const electron = require('electron')
const app = electron.app
const ipc = electron.ipcMain;
const dialog = electron.dialog;
const ProjectWindow = require("./projectWindow.js").ProjectWindow;
const DocumentationWindow = require("./documentationWindow.js").DocumentationWindow;
const AboutWindow = require("./aboutWindow.js").AboutWindow;
const appmenus = require('./appmenus.js');
const forceQuitDetect = require('./forceQuitDetect');
const Inklecate = require("./inklecate.js").Inklecate;
const i18n = require('./i18n/i18n.js');

function inkJSNeedsUpdating() {
    return false;
    // dialog.showMessageBox({
    //   type: 'error',
    //   buttons: ['Okay'],
    //   title: 'Export for web unavailable',
    //   message: "Sorry, export for web is currently disabled, until inkjs is updated to support the latest version of ink. You can download a previous version of Inky that supports inkjs and use that instead, although some of the latest features of ink may be missing."
    // });
    // return true;
}

app.on('will-finish-launching', function () {
    app.on("open-file", function (event, path) {
        ProjectWindow.open(path);
        event.preventDefault();
    });

});

let isQuitting = false;
let theme = ProjectWindow.getViewSettings().theme;
let zoom = ProjectWindow.getViewSettings().zoom;

app.on('before-quit', function () {
    // We need this to differentiate between pressing quit (which should quit) or closing all windows
    // (which leaves the app open)
    isQuitting = true;
});

ipc.on("project-cancelled-close", (event) => {
    isQuitting = false;
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', function () {

    app.on('window-all-closed', function () {
        if (process.platform != 'darwin' || isQuitting) {
            app.quit();
        }
    });

    appmenus.setupMenus({
        new: () => {
            ProjectWindow.createEmpty();
        },
        newInclude: () => {
            var win = ProjectWindow.focused();
            if (win) win.newInclude();
        },
        open: () => {
            ProjectWindow.open();
        },
        save: () => {
            var win = ProjectWindow.focused();
            if (win) win.save();
        },
        exportJson: () => {
            var win = ProjectWindow.focused();
            if (win) win.exportJson();
        },
        exportForWeb: () => {
            if( inkJSNeedsUpdating() ) return;
            var win = ProjectWindow.focused();
            if (win) win.exportForWeb();
        },
        exportJSOnly: () => {
            if( inkJSNeedsUpdating() ) return;
            var win = ProjectWindow.focused();
            if (win) win.exportJSOnly();
        },
        toggleTags: (item, focusedWindow, event) => {
            focusedWindow.webContents.send("set-tags-visible", item.checked);
        },
        nextIssue: (item, focusedWindow) => {
            focusedWindow.webContents.send("next-issue");
        },
        gotoAnything: (item, focusedWindow) => {
            focusedWindow.webContents.send("goto-anything");
        },
        addWatchExpression: (item, focusedWindow) => {
            focusedWindow.webContents.send("add-watch-expression");
        },
        showDocs: () => {
            DocumentationWindow.openDocumentation(theme);
        },
        showAbout: () => {
            AboutWindow.showAboutWindow(theme);
        },
        keyboardShortcuts: () => {
            var win = ProjectWindow.focused();
            if (win) win.keyboardShortcuts();
        },
        stats: () => {
            var win = ProjectWindow.focused();
            if (win) win.stats();
        },
        zoomIn: () => {
          var win = ProjectWindow.focused();
          if (win != null) {
            win.zoom(2);
            //Convert change from font size to zoom percentage
            zoom = (parseInt(zoom) + Math.floor(2*100/12)).toString();
            ProjectWindow.addOrChangeViewSetting('zoom', zoom);
          }
        },
        zoomOut: () => {
          var win = ProjectWindow.focused();
          if (win != null) {
            win.zoom(-2);
            //Convert change from font size to zoom percentage
            zoom = (parseInt(zoom) - Math.floor(2*100/12)).toString();
            ProjectWindow.addOrChangeViewSetting('zoom', zoom);
          }
        },
        zoom: (zoom_percent) => {
          var win = ProjectWindow.focused();
          if (win != null) {
            win.zoom(zoom_percent);
            zoom = zoom_percent.toString();
            ProjectWindow.addOrChangeViewSetting('zoom', zoom)
          }
        },
        insertSnippet: (focussedWindow, snippet) => {
            if( focussedWindow )
                focussedWindow.webContents.send('insertSnippet', snippet);
        },
        changeTheme: (newTheme) => {
          theme = newTheme;
          AboutWindow.changeTheme(newTheme);
          DocumentationWindow.changeTheme(newTheme);
          ProjectWindow.addOrChangeViewSetting('theme', newTheme)
        }
    });

    let openedSpecificFile = false;
    if (process.platform == "win32" && process.argv.length > 1) {
        for (let i = 1; i < process.argv.length; i++) {
            var arg = process.argv[i].toLowerCase();
            if (arg.endsWith(".ink")) {
                var fileToOpen = process.argv[1];
                var w = ProjectWindow.open(fileToOpen);
                openedSpecificFile = true;
                //Setup last stored zoom
                if(w) {
                    w.browserWindow.webContents.once('dom-ready', () => {
                        ProjectWindow.focused().zoom(zoom);
                    });
                }
                break;
            }
        }
    }
    if (!openedSpecificFile) {
        var w = ProjectWindow.createEmpty();
        //Setup last stored zoom
        w.browserWindow.webContents.once('dom-ready', () => {
            ProjectWindow.focused().zoom(zoom);
        });
    }

    //Setup last stored theme
    AboutWindow.changeTheme(theme);
    DocumentationWindow.changeTheme(theme);

    // Debug
    //w.openDevTools();

    i18n.switch("zh_CN")

});

function finalQuit() {
    Inklecate.killSessions();
}

forceQuitDetect.onForceQuit(finalQuit);
electron.app.on("will-quit", finalQuit);
