const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const Menu = electron.Menu;
const MenuItem = electron.MenuItem;
const _ = require('lodash');

function getMenuTemplate(options) {
  var template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: options.newMethod
        },
        {
          label: 'Open',
          accelerator: 'CmdOrCtrl+O',
          click: options.openMethod
        },
        {
          type: 'separator'
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          enabled: options.isFocusedWindow,
          click: options.saveMethod
        },
        {
          label: 'Save As',
          accelerator: 'CmdOrCtrl+Shift+S',
          enabled: options.isFocusedWindow,
          click: options.saveAsMethod
        },
        {
          label: 'Rename',
          enabled: options.isFocusedWindow, //FIX
          click: options.renameMethod
        },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          enabled: options.isFocusedWindow,
          click: options.closeMethod
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
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: function(item, focusedWindow) {
            if (focusedWindow) {
              focusedWindow.reload();
            }
          }
        },
        {
          label: 'Toggle Full Screen',
          accelerator: (function() {
            if (process.platform == 'darwin')
              return 'Ctrl+Command+F';
            else
              return 'F11';
          })(),
          click: function(item, focusedWindow) {
            if (focusedWindow)
              focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: (function() {
            if (process.platform == 'darwin')
              return 'Alt+Command+I';
            else
              return 'Ctrl+Shift+I';
          })(),
          click: function(item, focusedWindow) {
            if (focusedWindow) {
              focusedWindow.toggleDevTools();
            }
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
        }
      ]
    },
    {
      label: 'Help',
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: function() { require('electron').shell.openExternal('http://electron.atom.io') }
        },
      ]
    },
  ];

  if (process.platform == 'darwin') {
    var name = require('electron').app.getName();
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
          accelerator: 'Command+Shift+H',
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
          click: function() { app.quit(); }
        },
      ]
    });

    // Window menu.
    template[3].submenu.push(
      {
        type: 'separator'
      },
      {
        label: 'Bring All to Front',
        role: 'front'
      }
    );

  }

  return template;
}

//options saved from last time - so that you can just change a few
var globalOptions = {};

function setMenu(options) {
  globalOptions = _.extend(globalOptions, options); //overwrite with later args
  var template = getMenuTemplate(globalOptions);
  var menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function updateMenu() {
  setImmediate(function() { // electron bug - focused window is still defined on tick of blur event
    setMenu({               // see https://github.com/atom/electron/issues/984
      isFocusedWindow: !!BrowserWindow.getFocusedWindow()
    });
  });
}

module.exports = {
  setMenu: setMenu, //do the initial setup
  updateMenu: updateMenu //updates focused window state
};
