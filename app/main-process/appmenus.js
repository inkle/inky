const electron = require('electron')
const app = electron.app
const ipc = electron.ipcMain;
const dialog = electron.dialog;
const _ = require("lodash");
const Menu = electron.Menu;
const ProjectWindow = require("./projectWindow.js").ProjectWindow;
const inkSnippets = require("./inkSnippets.js").snippets;

function setupMenus(callbacks) {
    let themes = [];
    const defaultTheme = 'light';
    for (const theme of ['light', 'dark']) {
        themes.push({
            label: theme.substring(0, 1).toUpperCase() + theme.substring(1),
            type: 'radio',
            checked: theme === defaultTheme,
            click: () => {
                ProjectWindow.all().forEach(window => {
                    window.browserWindow.webContents.send('change-theme', theme);
                    callbacks.changeTheme(theme);
                });
            }
        });
    }

    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Project',
                    accelerator: 'CmdOrCtrl+N',
                    click: callbacks.new
                },
                {
                    label: 'New Included Ink File',
                    accelerator: 'CmdOrCtrl+Alt+N',
                    click: callbacks.newInclude
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Open',
                    accelerator: 'CmdOrCtrl+O',
                    click: callbacks.open
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Save Project',
                    accelerator: 'CmdOrCtrl+S',
                    enabled: callbacks.isFocusedWindow,
                    click: callbacks.save
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Export to JSON...',
                    accelerator: 'CmdOrCtrl+Shift+S',
                    enabled: callbacks.isFocusedWindow,
                    click: callbacks.exportJson
                },
                {
                    label: 'Export for web...',
                    enabled: callbacks.isFocusedWindow,
                    click: callbacks.exportForWeb
                },
                {
                    label: 'Export story.js only...',
                    accelerator: 'CmdOrCtrl+Alt+S',
                    enabled: callbacks.isFocusedWindow,
                    click: callbacks.exportJSOnly
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Close',
                    accelerator: 'CmdOrCtrl+W',
                    role: 'close'
                }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                {
                    label: 'Undo',
                    accelerator: 'CmdOrCtrl+Z',
                    role: 'undo'
                },
                {
                    label: 'Redo',
                    accelerator: 'Shift+CmdOrCtrl+Z',
                    role: 'redo'
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Cut',
                    accelerator: 'CmdOrCtrl+X',
                    role: 'cut'
                },
                {
                    label: 'Copy',
                    accelerator: 'CmdOrCtrl+C',
                    role: 'copy'
                },
                {
                    label: 'Paste',
                    accelerator: 'CmdOrCtrl+V',
                    role: 'paste'
                },
                {
                    label: 'Select All',
                    accelerator: 'CmdOrCtrl+A',
                    role: 'selectall'
                },
            ]
        },
        {
            label: "View",
            submenu: [
                {
                    label: 'Toggle Full Screen',
                    accelerator: process.platform === 'darwin' ? 'Ctrl+Command+F' : 'F11',
                    click(item, focusedWindow) {
                        if (focusedWindow)
                            focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
                    }
                },
                {
                    label: 'Theme',
                    submenu: themes
                },
                {
                    label: "Zoom (Increase) ",
                    accelerator: 'CmdOrCtrl+K',
                    click: callbacks.zoomIn
                },
                {
                    label: "Zoom (Decrease) ",
                    accelerator: 'CmdOrCtrl+L',
                    click: callbacks.zoomOut
                }
            ]
        },
        {
            label: 'Story',
            submenu: [
                {
                    label: 'Go to anything...',
                    accelerator: 'CmdOrCtrl+P',
                    click: callbacks.gotoAnything
                },
                {
                    label: 'Next Issue',
                    accelerator: 'CmdOrCtrl+.',
                    click: callbacks.nextIssue
                },
                {
                    label: 'Add watch expression...',
                    click: callbacks.addWatchExpression
                },
                {
                    label: 'Tags visible',
                    type: "checkbox",
                    checked: true,
                    click: callbacks.toggleTags
                },
                {
                        label: 'Count words',
                        enabled: callbacks.isFocusedWindow,
                        click: callbacks.countWords
                }
            ]
        },
        {
            label: 'Ink',
            submenu: [
                // Filled in by the code at the bottom from the content in inkSnippets.js
            ]
        },
        
        {
            label: 'Window',
            role: 'window',
            submenu: [
                {
                    label: 'Minimize',
                    accelerator: 'CmdOrCtrl+M',
                    role: 'minimize'
                },
                {
                    label: 'Close',
                    accelerator: 'CmdOrCtrl+W',
                    role: 'close'
                },
                {
                    label: 'Developer',
                    submenu: [
                        {
                            label: 'Reload web view',
                            accelerator: 'CmdOrCtrl+R',
                            click(item, focusedWindow) {
                                if (!focusedWindow) return;
                                var clickedButtonIdx = dialog.showMessageBox(focusedWindow, {
                                    type: 'question',
                                    buttons: ['Yes', 'Cancel'],
                                    title: 'Reload?',
                                    message: 'Are you sure you want to reload the current window? Any unsaved changes will be lost.'
                                });
                                if( clickedButtonIdx == 0 ) {
                                    focusedWindow.reload();
                                }
                            }
                        },
                        {
                            label: 'Toggle Developer Tools',
                            accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I',
                            click(item, focusedWindow) {
                                if (focusedWindow)
                                    focusedWindow.webContents.toggleDevTools();
                            }
                        },
                    ]
                },
            ]
        },
        {
            label: 'Help',
            role: 'help',
            submenu: [
                {
                    label: 'Show Documentation',
                    click: callbacks.showDocs
                },
            ]
        },
    ];

    const name = app.getName();
    const aboutWindowLabel = 'About ' + name;
    // Mac specific menus
    if (process.platform === 'darwin') {
        template.unshift({
            label: name,
            submenu: [
                {
                    label: aboutWindowLabel,
                    click: callbacks.showAbout
                    // role: 'about'
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Services',
                    role: 'services',
                    submenu: []
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Hide ' + name,
                    accelerator: 'Command+H',
                    role: 'hide'
                },
                {
                    label: 'Hide Others',
                    accelerator: 'Command+Alt+H',
                    role: 'hideothers'
                },
                {
                    label: 'Show All',
                    role: 'unhide'
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Quit',
                    accelerator: 'Command+Q',
                    click() { app.quit(); }
                },
            ]
        });

        var windowMenu = _.find(template, menu => menu.role == "window");
        windowMenu.submenu.push(
            {
                type: 'separator'
            },
            {
                label: 'Bring All to Front',
                role: 'front'
            }
        );
    }
    else
    {
        // Windows specific menu items
        template.find(x => x.label === "Help").submenu.push(
            {
                label: aboutWindowLabel,
                click: callbacks.showAbout
            }
        );
    }

    // Generate menus for ink snippets
    var inkSubMenu = _.find(template, menu => menu.label == "Ink").submenu;
    for(var category of inkSnippets) {

        // Category separator?
        if( category.separator ) {
            inkSubMenu.push({
                type: 'separator'
            });
            continue;
        }
        
        // Main categories
        var items = category.snippets.map(snippet => {
            if( snippet.separator ) {
                return {
                    type: 'separator'
                };
            } else {
                return {
                    label: snippet.name,
                    click: (item, focussedWindow) => callbacks.insertSnippet(focussedWindow, snippet.ink)
                }
            }
            
        });
        
        inkSubMenu.push({
            label: category.categoryName,
            submenu: items
        });
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

exports.setupMenus = setupMenus;
