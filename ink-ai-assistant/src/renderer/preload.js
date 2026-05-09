/**
 * Preload Script
 * Safely exposes IPC communication to renderer process
 */

const { contextBridge, ipcRenderer } = require('electron');
const { IPC_CHANNELS } = require('../shared/types');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  openFile: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_FILE),
  saveFile: (filepath, content) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_FILE, { filepath, content }),

  // Compilation
  compile: (filepath) => ipcRenderer.invoke(IPC_CHANNELS.COMPILE, { filepath }),

  // AI operations
  sendMessage: (message, context) =>
    ipcRenderer.invoke(IPC_CHANNELS.SEND_MESSAGE, { message, context }),
  generateCode: (prompt, context) =>
    ipcRenderer.invoke(IPC_CHANNELS.GENERATE_CODE, { prompt, context }),
  fixError: (code, errors) =>
    ipcRenderer.invoke(IPC_CHANNELS.FIX_ERROR, { code, errors }),
  explainCode: (query, code) =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPLAIN_CODE, { query, code }),

  // Documentation
  searchDocs: (query) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_DOCS, { query }),

  // Configuration
  getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG),

  // Listeners
  onFileChanged: (callback) =>
    ipcRenderer.on(IPC_CHANNELS.FILE_CHANGED, (event, data) => callback(data)),
  onCompileResult: (callback) =>
    ipcRenderer.on(IPC_CHANNELS.COMPILE_RESULT, (event, data) => callback(data)),
  onAIResponse: (callback) =>
    ipcRenderer.on(IPC_CHANNELS.AI_RESPONSE, (event, data) => callback(data)),
});
