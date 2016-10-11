const electron = require('electron')
const app = electron.app
const ipc = electron.ipcMain;
const dialog = electron.dialog;
const _ = require("lodash");
const Menu = electron.Menu;

function setupMenus(callbacks) {
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
          enabled: callbacks.isFocusedWindow,
          click: callbacks.exportJSOnly
        },
        {
          type: 'separator'
        },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          enabled: callbacks.isFocusedWindow,
          click: callbacks.close
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
          label: "TODO: zoom controls"
        }
      ]
    },
    {
      label: 'Story',
      submenu: [
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
        }
      ]
    },
    {
      label: '[Inky Debug]',
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
      ]
    },
    {
      label: 'Help',
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click() {
            inklecate("hello world");
          }
        },
        {
          label: 'Show Documentation',
          click: callbacks.showDocs
        },
      ]
    },
  ];

  // Mac specific menus
  if (process.platform === 'darwin') {
    const name = app.getName();
    template.unshift({
      label: name,
      submenu: [
        {
          label: 'About ' + name,
          role: 'about'
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

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

exports.setupMenus = setupMenus;