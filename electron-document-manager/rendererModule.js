'use strict';

const electron = require('electron');
const ipcRenderer = electron.ipcRenderer;
const BrowserWindow = electron.remote.BrowserWindow;

var filepath = null,
    title = "Untitled",
    setContent = null,
    getContent = null;

ipcRenderer.on('set-content', function(event, content, callbackChannel) {
  setContent(content.toString());
	if(callbackChannel) ipcRenderer.send(callbackChannel);
});

ipcRenderer.on('request-content', function(event, callbackChannel) {
	ipcRenderer.send(callbackChannel, getContent());
});

ipcRenderer.on('set-filepath', function(event, filepathArg, callbackChannel) {
	filepath = filepathArg;
	if(callbackChannel) ipcRenderer.send(callbackChannel);
});

ipcRenderer.on('request-filepath', function(event, callbackChannel) {
	ipcRenderer.send(callbackChannel, filepath);
});

module.exports = {
  setEdited: function(edited) {
    BrowserWindow.getFocusedWindow().setDocumentEdited(edited);
  },
  setContentSetter: function(fn) {
    setContent = fn;
  },
  setContentGetter: function(fn) {
    getContent = fn;
  }
}
