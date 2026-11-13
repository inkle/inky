const {app, BrowserWindow, ipcMain, dialog, ipcRenderer, Menu} = require('electron')
const path = require("path");
const i18n = require("./i18n/i18n.js")
const {ProjectWindow} = require("./projectWindow.js");
const {DocumentationWindow} = require("./documentationWindow.js");
const {AboutWindow} = require("./aboutWindow.js");
const {AppMenus} = require('./appmenus.js');
const {onForceQuit} = require('./forceQuitDetect');
const {Inklecate} = require("./inklecate.js");
const { fstat } = require('original-fs');
const {fs} = require("fs");
const { listSystemFonts } = require("./systemFonts.js");
const { exportSuccessDialogOptions } = require("./exportSuccessDialog.js");
const { showInkyDialog, INKY_DIALOG_ICON } = require("./inkyDialog.js");
const inkyFileDialog = require("./inkyFileDialog.js");

ipcMain.handle("list-system-fonts", () => listSystemFonts());

// Use the native message box rather than window.alert, so the export-success
// notification can show its own checkmark icon on desktop platforms.
ipcMain.handle("show-export-success", (event, details) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = exportSuccessDialogOptions(details);
    if (process.platform === "linux") return showInkyDialog(window, "export", options);
    return window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options);
});


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

// main
let pendingPathToOpen = null;
let hasFinishedLaunch = false;

// main
ipcMain.on('show-context-menu', (event, options) => {
    const template = [
        {
            label: 'Cut',
            role: 'cut' 
        },
        {
            label: 'Copy',
            role: 'copy' 
        },
        {
            label: 'Paste',
            role: 'paste' 
        },
      { type: 'separator' },
    ]
    if (options && options.formatCode === true) {
        template.push({
            label: 'Format Code',
            click: () => event.sender.send('format-code')
        });
    }
    const menu = Menu.buildFromTemplate(template)
    menu.popup(BrowserWindow.fromWebContents(event.sender))
})


ipcMain.handle("showOpenDialog", async (event, openOptions) => {
    return inkyFileDialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), openOptions)
})

ipcMain.handle("showSaveDialog", async (event, saveOptions) => {
    // Keep native save pickers attached to their Inky owner as well, so the
    // desktop window manager can associate them with the application's icon.
    const parent = BrowserWindow.fromWebContents(event.sender);
    return inkyFileDialog.showSaveDialog(parent, saveOptions);
})

ipcMain.handle("try-close", async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options = {
        type: "warning",
        title: "Inky — Save Changes",
        message: i18n._("Would you like to save changes before exiting?"),
        detail: i18n._("Your changes will be lost if you don't save."),
        buttons: [i18n._("Save"), i18n._("Don't save"), i18n._("Cancel")],
        defaultId: 0,
        cancelId: 2,
        icon: INKY_DIALOG_ICON
    };
    if (process.platform === "linux") return showInkyDialog(parent, "save", options);
    return parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options);
});

let isQuitting = false;

app.on("open-file", function (event, path) {

    // e.g. Drag and drop onto app to open it.
    // "open-file" seems to come before "will-finish-launching"
    if( !hasFinishedLaunch ) {
        pendingPathToOpen = path;
    }
    
    // Drag and drop onto app while it's already open
    else {

        // See if this root file is already open in an existing window
        let existingWin = ProjectWindow.withMainkInkPath(path);
        if( existingWin ) {
            existingWin.browserWindow.focus();
            existingWin.browserWindow.webContents.send('open-main-ink');
        } else {
            ProjectWindow.open(path);       
        }
    }
    
    event.preventDefault();
});

app.on('before-quit', function () {
    // We need this to differentiate between pressing quit (which should quit) or closing all windows
    // (which leaves the app open)
    isQuitting = true;
});

ipcMain.on("project-cancelled-close", (event) => {
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
    
    AppMenus.setCallbacks({
        new: () => {
            ProjectWindow.createEmpty();
        },
        newInclude: () => {
            var win = ProjectWindow.focused();
            if (win) win.newInclude();
        },
        open: () => {
            console.log("Test!")
            ProjectWindow.open();
        },
        clearRecent: () => {
            ProjectWindow.clearRecentFiles();
            AppMenus.setRecentFiles([]);
            AppMenus.refresh();
        },
        save: () => {
            var win = ProjectWindow.focused();
            if (win) win.save();
        },
        exportForWeb: () => {
            if( inkJSNeedsUpdating() ) return;
            var win = ProjectWindow.focused();
            if (win) win.exportForWeb();
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
            DocumentationWindow.openDocumentation(ProjectWindow.getViewSettings().theme);
        },
        showAbout: () => {
            AboutWindow.showAboutWindow(ProjectWindow.getViewSettings().theme);
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
                // Convert change from font size to zoom percentage
                let zoom = ProjectWindow.getViewSettings().zoom;
                zoom = (parseInt(zoom) + Math.floor(2*100/12)).toString();
                ProjectWindow.addOrChangeViewSetting('zoom', zoom);
            }
        },
        zoomOut: () => {
          var win = ProjectWindow.focused();
          if (win != null) {
              win.zoom(-2);
              // Convert change from font size to zoom percentage
              let zoom = ProjectWindow.getViewSettings().zoom
              zoom = (parseInt(zoom) - Math.floor(2*100/12)).toString();
              ProjectWindow.addOrChangeViewSetting('zoom', zoom);
            }
        },
        zoom: (zoom_percent) => {
            var win = ProjectWindow.focused();
            if (win != null) {
                win.zoom(zoom_percent);
                let zoom = zoom_percent.toString();
                ProjectWindow.addOrChangeViewSetting('zoom', zoom)
            }
        },
        toggleAnimation: () => {
            let animEnabled = !ProjectWindow.getViewSettings().animationEnabled;
            ProjectWindow.addOrChangeViewSetting('animationEnabled', animEnabled)

            for(let i=0; i<ProjectWindow.all().length; i++) {
                let eachWindow = ProjectWindow.all()[i];
                eachWindow.browserWindow.webContents.send("set-animation-enabled", animEnabled);
            }
        },
        toggleAutoComplete: () => {
            let autoCompleteDisabled = !ProjectWindow.getViewSettings().autoCompleteDisabled;
            ProjectWindow.addOrChangeViewSetting('autoCompleteDisabled', autoCompleteDisabled)

            for(let i=0; i<ProjectWindow.all().length; i++) {
                let eachWindow = ProjectWindow.all()[i];
                eachWindow.browserWindow.webContents.send("set-autocomplete-disabled", autoCompleteDisabled);
            }
        },
        openShowcaseProject: (focussedWindow) => {
            try {
                const { createShowcaseProject } = require("./showcaseProject.js");
                const entry = createShowcaseProject(path.join(app.getPath("documents"), "Inky Projects"));
                ProjectWindow.open(entry);
            } catch (error) {
                const options = { type: "error", message: "Could not create the showcase project.", detail: error.message };
                if (focussedWindow) dialog.showMessageBox(focussedWindow, options);
                else dialog.showMessageBox(options);
            }
        },
        openOriginalStoryProject: (focussedWindow, storyId) => {
            try {
                const { createOriginalStoryProject } = require("./originalStoryProject.js");
                const entry = createOriginalStoryProject(path.join(app.getPath("documents"), "Inky Projects"), storyId);
                ProjectWindow.open(entry);
            } catch (error) {
                const options = { type: "error", message: "Could not create the original Ink story project.", detail: error.message };
                if (focussedWindow) dialog.showMessageBox(focussedWindow, options);
                else dialog.showMessageBox(options);
            }
        },
        insertSnippet: (focussedWindow, snippet) => {
            if( focussedWindow )
            focussedWindow.webContents.send('insertSnippet', snippet);
        },
        changeTheme: (newTheme) => {
            AboutWindow.changeTheme(newTheme);
            DocumentationWindow.changeTheme(newTheme);
            ProjectWindow.addOrChangeViewSetting('theme', newTheme)
        }
    });
    
    console.log("Testing!")
    AppMenus.setRecentFiles(ProjectWindow.getRecentFiles());
    AppMenus.setTheme(ProjectWindow.getViewSettings().theme);
    AppMenus.setZoom(ProjectWindow.getViewSettings().zoom);
    AppMenus.setAnimationEnabled(ProjectWindow.getViewSettings().animationEnabled);
    AppMenus.setAutoCompleteDisabled(ProjectWindow.getViewSettings().autoCompleteDisabled)

    AppMenus.refresh();
    ProjectWindow.setEvents({
        onRecentFilesChanged: (recentFiles) => {
            AppMenus.setRecentFiles(recentFiles);
            AppMenus.refresh();
        },
        onProjectSettingsChanged: (settings) => {
            settings = settings || {};
            AppMenus.setCustomSnippetMenus(settings.customInkSnippets || []);
            AppMenus.refresh();
        },
        onViewSettingsChanged: (viewSettings) => {
            AppMenus.setTheme(viewSettings.theme);
            AppMenus.setZoom(viewSettings.zoom);
            AppMenus.setAnimationEnabled(viewSettings.animationEnabled);
            AppMenus.setAutoCompleteDisabled(viewSettings.autoCompleteDisabled);
            AppMenus.refresh();
        }
    });

    // Explicit file requests take priority. Otherwise resume the latest saved
    // project that is still readable; first launch keeps the starter story.
    const startupPath = ProjectWindow.getStartupPath(
        pendingPathToOpen, process.argv.slice(1), process.env.OWD || process.cwd());
    pendingPathToOpen = null;
    if( startupPath ) {
        ProjectWindow.open(startupPath);
    } else {
        ProjectWindow.createEmpty();
    }

    // Setup last stored theme
    let theme = ProjectWindow.getViewSettings().theme;
    AboutWindow.changeTheme(theme);
    DocumentationWindow.changeTheme(theme);

    hasFinishedLaunch = true;

    // Debug
    //w.openDevTools();
});

function finalQuit() {
    Inklecate.killSessions();
}

onForceQuit(finalQuit);
app.on("will-quit", finalQuit);
