const electron = require('electron')
const app = electron.app
const ipc = electron.ipcMain;
const dialog = electron.dialog;
const _ = require("lodash");
const Menu = electron.Menu;
const ProjectWindow = require("./projectWindow.js").ProjectWindow;
const inkSnippets = require("./inkSnippets.js").snippets;
const i18n = require('./i18n/i18n.js');

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

    function computeRecent(newRecentFiles) {
        return newRecentFiles.map((path) => ({
            label: path,
            click: () => ProjectWindow.open(path)
        }));
    }
    
    let zoom_percents = [];
    const defaultZoom = '100%';
    for (const zoom_percent of ['50%', '75%', '100%', '125%', '150%', '175%', '200%', '250%', '300%']) {
        zoom_percents.push({
            label: zoom_percent.substring(0, 4),
            type: 'radio',
            checked: zoom_percent === defaultZoom,
            click: () => {
                callbacks.zoom(zoom_percent.replace('%', ''));
            }
        });
    }

    // Generate menus for ink snippets
    const inkSubMenu = [];
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
                    label: i18n._(snippet.name),
                    click: (item, focussedWindow) => callbacks.insertSnippet(focussedWindow, snippet.ink)
                }
            }
            
        });
        
        inkSubMenu.push({
            label: i18n._(category.categoryName),
            submenu: items
        });
    }

    const template = [
        {
            label: i18n._('File'),
            submenu: [
                {
                    label: i18n._('New Project'),
                    accelerator: 'CmdOrCtrl+N',
                    click: callbacks.new
                },
                {
                    label: i18n._('New Included Ink File'),
                    accelerator: 'CmdOrCtrl+Alt+N',
                    click: callbacks.newInclude
                },
                {
                    type: 'separator'
                },
                {
                    label: i18n._('Open...'),
                    accelerator: 'CmdOrCtrl+O',
                    click: callbacks.open
                },
                {
                    label: i18n._('Open Recent'),
                    submenu: computeRecent(ProjectWindow.getRecentFiles()),
                    id: "recent"
                },
                {
                    type: 'separator'
                },
                {
                    label: i18n._('Save Project'),
                    accelerator: 'CmdOrCtrl+S',
                    enabled: callbacks.isFocusedWindow,
                    click: callbacks.save
                },
                {
                    type: 'separator'
                },
                {
                    label: i18n._('Export to JSON...'),
                    accelerator: 'CmdOrCtrl+Shift+S',
                    enabled: callbacks.isFocusedWindow,
                    click: callbacks.exportJson
                },
                {
                    label: i18n._('Export for web...'),
                    enabled: callbacks.isFocusedWindow,
                    click: callbacks.exportForWeb
                },
                {
                    label: i18n._('Export story.js only...'),
                    accelerator: 'CmdOrCtrl+Alt+S',
                    enabled: callbacks.isFocusedWindow,
                    click: callbacks.exportJSOnly
                },
                {
                    type: 'separator'
                },
                {
                    label: i18n._('Close'),
                    accelerator: 'CmdOrCtrl+W',
                    role: 'close'
                }
            ]
        },
        {
            label: i18n._('Edit'),
            submenu: [
                {
                    label: i18n._('Undo'),
                    accelerator: 'CmdOrCtrl+Z',
                    role: 'undo'
                },
                {
                    label: i18n._('Redo'),
                    accelerator: 'Shift+CmdOrCtrl+Z',
                    role: 'redo'
                },
                {
                    type: 'separator'
                },
                {
                    label: i18n._('Cut'),
                    accelerator: 'CmdOrCtrl+X',
                    role: 'cut'
                },
                {
                    label: i18n._('Copy'),
                    accelerator: 'CmdOrCtrl+C',
                    role: 'copy'
                },
                {
                    label: i18n._('Paste'),
                    accelerator: 'CmdOrCtrl+V',
                    role: 'paste'
                },
                {
                    label: i18n._('Select All'),
                    accelerator: 'CmdOrCtrl+A',
                    role: 'selectall'
                },
                {
                    type: 'separator'
                },
                {
                    label: i18n._('Useful Keyboard Shortcuts'),
                    enabled: callbacks.isFocusedWindow,
                    click: callbacks.keyboardShortcuts
                }
            ]
        },
        {
            label: i18n._("View"),
            submenu: [
                {
                    label: i18n._('Toggle Full Screen'),
                    accelerator: process.platform === 'darwin' ? 'Ctrl+Command+F' : 'F11',
                    click(item, focusedWindow) {
                        if (focusedWindow)
                            focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
                    }
                },
                {
                    label: i18n._('Theme'),
                    submenu: themes
                },
                {
                    label: i18n._("Zoom %"),
                    submenu: zoom_percents
                },
                {
                    label: i18n._("Zoom (Increase) "),
                    accelerator: 'CmdOrCtrl+=',
                    click: callbacks.zoomIn
                },
                {
                    label: i18n._("Zoom (Decrease) "),
                    accelerator: 'CmdOrCtrl+-',
                    click: callbacks.zoomOut
                }
            ]
        },
        {
            label: i18n._('Story'),
            submenu: [
                {
                    label: i18n._('Go to anything...'),
                    accelerator: 'CmdOrCtrl+P',
                    click: callbacks.gotoAnything
                },
                {
                    label: i18n._('Next Issue'),
                    accelerator: 'CmdOrCtrl+.',
                    click: callbacks.nextIssue
                },
                {
                    label: i18n._('Add watch expression...'),
                    click: callbacks.addWatchExpression
                },
                {
                    label: i18n._('Tags visible'),
                    type: "checkbox",
                    checked: true,
                    click: callbacks.toggleTags
                },
                {
                        label: i18n._('Word count and more'),
                        enabled: callbacks.isFocusedWindow,
                        click: callbacks.stats
                }
            ]
        },
        {
            label: i18n._('Ink'),
            submenu: inkSubMenu
        },
        
        {
            label: i18n._('Window'),
            role: 'window',
            submenu: [
                {
                    label: i18n._('Minimize'),
                    accelerator: 'CmdOrCtrl+M',
                    role: 'minimize'
                },
                {
                    label: i18n._('Close'),
                    accelerator: 'CmdOrCtrl+W',
                    role: 'close'
                },
                {
                    label: i18n._('Developer'),
                    submenu: [
                        {
                            label: i18n._('Reload web view'),
                            accelerator: 'CmdOrCtrl+R',
                            click(item, focusedWindow) {
                                if (!focusedWindow) return;
                                var clickedButtonIdx = dialog.showMessageBox(focusedWindow, {
                                    type: 'question',
                                    buttons: [i18n._('Yes'), i18n._('Cancel')],
                                    title: i18n._('Reload?'),
                                    message: i18n._('Are you sure you want to reload the current window? Any unsaved changes will be lost.')
                                });
                                if( clickedButtonIdx == 0 ) {
                                    focusedWindow.reload();
                                }
                            }
                        },
                        {
                            label: i18n._('Toggle Developer Tools'),
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
            label: i18n._('Help'),
            role: 'help',
            submenu: [
                {
                    label: i18n._('Show Documentation'),
                    click: callbacks.showDocs
                },
            ]
        },
    ];

    const name = app.getName();
    const aboutWindowLabel = i18n._('About ') + name;
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
                    label: i18n._('Services'),
                    role: 'services',
                    submenu: []
                },
                {
                    type: 'separator'
                },
                {
                    label: i18n._('Hide ') + name,
                    accelerator: 'Command+H',
                    role: 'hide'
                },
                {
                    label: i18n._('Hide Others'),
                    accelerator: 'Command+Alt+H',
                    role: 'hideothers'
                },
                {
                    label: i18n._('Show All'),
                    role: 'unhide'
                },
                {
                    type: 'separator'
                },
                {
                    label: i18n._('Quit'),
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
                label: i18n._('Bring All to Front'),
                role: 'front'
            }
        );
    }
    else
    {
        // Windows specific menu items
        template.find(x => x.role === 'help').submenu.push(
            {
                label: aboutWindowLabel,
                click: callbacks.showAbout
            }
        );
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    ProjectWindow.setRecentFilesChanged(function(newRecentFiles) {
        _.find(
            _.find(template, menu => menu.label == i18n._("File")).submenu,
            submenu => submenu.id == "recent"
        ).submenu = computeRecent(newRecentFiles);
        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);
    });
}

exports.setupMenus = setupMenus;
