const electron = require('electron')
const app = electron.app
const appmenus = require('./appmenus.js');
const inklecate = require('./inklecate.js');
var DocumentManager = require('./electron-document-manager/main.js').main;

const windowOptions = {
  width: 1300, 
  height: 730, 
  minWidth: 350,
  minHeight: 250,
  titleBarStyle: 'hidden'
};

DocumentManager({ 
  entryPoint: 'file://' + __dirname + '/index.html',
  windowOptions: windowOptions
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', function() {
    appmenus.build();
});
