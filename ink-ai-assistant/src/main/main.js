/**
 * Main Process - Electron Entry Point
 * Coordinates all backend services and IPC communication
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const config = require('../shared/config');
const { IPC_CHANNELS } = require('../shared/types');
const InkCompiler = require('./compiler');
const ErrorParser = require('./errorParser');
const LLMClient = require('./llmClient');
const VectorStore = require('./vectorStore');
const FileWatcher = require('./fileWatcher');

class InkAIAssistant {
  constructor() {
    this.mainWindow = null;
    this.compiler = new InkCompiler();
    this.errorParser = new ErrorParser();
    this.llm = new LLMClient();
    this.vectorStore = new VectorStore();
    this.fileWatcher = new FileWatcher();
    this.conversationHistory = [];
    this.currentFile = null;
  }

  /**
   * Initialize the application
   */
  async init() {
    await app.whenReady();
    await this.createWindow();
    this.setupIPC();
    await this.checkDependencies();

    // Set up file watcher callbacks
    this.fileWatcher.watch([], {
      onFileChange: (event, filepath) => {
        this.sendToRenderer(IPC_CHANNELS.FILE_CHANGED, { event, filepath });
      },
      onCompilationComplete: (filepath, result) => {
        this.handleCompilationResult(filepath, result);
      },
      onError: (error) => {
        this.sendToRenderer(IPC_CHANNELS.COMPILE_ERROR, { error: error.message });
      },
    });
  }

  /**
   * Create main window
   */
  async createWindow() {
    this.mainWindow = new BrowserWindow({
      width: config.ui.width,
      height: config.ui.height,
      minWidth: config.ui.minWidth,
      minHeight: config.ui.minHeight,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../renderer/preload.js'),
      },
      title: 'Ink AI Assistant',
      backgroundColor: '#1e1e1e',
    });

    await this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    // Open DevTools in development
    if (process.argv.includes('--dev')) {
      this.mainWindow.webContents.openDevTools();
    }
  }

  /**
   * Set up IPC handlers
   */
  setupIPC() {
    // File operations
    ipcMain.handle(IPC_CHANNELS.OPEN_FILE, async () => {
      return await this.openFile();
    });

    ipcMain.handle(IPC_CHANNELS.SAVE_FILE, async (event, { filepath, content }) => {
      return await this.saveFile(filepath, content);
    });

    // Compilation
    ipcMain.handle(IPC_CHANNELS.COMPILE, async (event, { filepath }) => {
      return await this.compileFile(filepath);
    });

    // AI operations
    ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE, async (event, { message, context }) => {
      return await this.handleChatMessage(message, context);
    });

    ipcMain.handle(IPC_CHANNELS.GENERATE_CODE, async (event, { prompt, context }) => {
      return await this.generateCode(prompt, context);
    });

    ipcMain.handle(IPC_CHANNELS.FIX_ERROR, async (event, { code, errors }) => {
      return await this.fixErrors(code, errors);
    });

    ipcMain.handle(IPC_CHANNELS.EXPLAIN_CODE, async (event, { query, code }) => {
      return await this.explainCode(query, code);
    });

    // Documentation search
    ipcMain.handle(IPC_CHANNELS.SEARCH_DOCS, async (event, { query }) => {
      return await this.searchDocs(query);
    });

    // Configuration
    ipcMain.handle(IPC_CHANNELS.GET_CONFIG, () => {
      return {
        llm: this.llm.getConfig(),
        vectorStoreAvailable: this.vectorStore.isAvailable(),
        inklecateAvailable: this.inklecateAvailable,
      };
    });
  }

  /**
   * Check if dependencies are available
   */
  async checkDependencies() {
    // Check inklecate
    this.inklecateAvailable = await this.compiler.isAvailable();
    if (!this.inklecateAvailable) {
      dialog.showErrorBox(
        'Inklecate Not Found',
        'Could not find inklecate compiler. Please install Inky or set INKLECATE_PATH.'
      );
    }

    // Check LLM
    const llmAvailable = await this.llm.isAvailable();
    if (!llmAvailable) {
      dialog.showMessageBox(this.mainWindow, {
        type: 'warning',
        title: 'Local LLM Not Available',
        message: 'Could not connect to local LLM. Make sure Ollama or another OpenAI-compatible server is running.',
        buttons: ['OK'],
      });
    }

    // Check vector store
    if (!this.vectorStore.isAvailable()) {
      console.log('Vector store not configured. RAG features will be limited.');
    }
  }

  /**
   * Open ink file dialog
   */
  async openFile() {
    const result = await dialog.showOpenDialog(this.mainWindow, {
      properties: ['openFile', 'openDirectory'],
      filters: [
        { name: 'Ink Files', extensions: ['ink'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filepath = result.filePaths[0];

    // Check if it's a directory or file
    const stats = fs.statSync(filepath);
    if (stats.isDirectory()) {
      // Watch directory
      this.fileWatcher.addPath(filepath);
      return { type: 'directory', path: filepath };
    } else {
      // Watch file
      this.currentFile = filepath;
      this.fileWatcher.addPath(filepath);

      const content = fs.readFileSync(filepath, 'utf8');
      return { type: 'file', path: filepath, content };
    }
  }

  /**
   * Save file
   */
  async saveFile(filepath, content) {
    try {
      fs.writeFileSync(filepath, content, 'utf8');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Compile ink file
   */
  async compileFile(filepath) {
    try {
      const result = await this.compiler.validate(filepath);

      // Enhance errors
      if (result.errors.length > 0) {
        result.errors = this.errorParser.enhanceErrors(result.errors);
      }

      return result;
    } catch (error) {
      return { success: false, error: error.message, errors: [] };
    }
  }

  /**
   * Handle compilation result from file watcher
   */
  handleCompilationResult(filepath, result) {
    this.sendToRenderer(IPC_CHANNELS.COMPILE_RESULT, {
      filepath,
      result,
    });

    // Auto-notify about errors
    if (!result.success && result.errors.length > 0) {
      const summary = this.errorParser.summarizeForAI(result.errors);
      this.sendToRenderer(IPC_CHANNELS.AI_RESPONSE, {
        message: `🔍 Detected ${result.errors.length} error(s) in ${path.basename(filepath)}:\n\n${summary}\n\nWould you like me to suggest fixes?`,
        auto: true,
      });
    }
  }

  /**
   * Handle chat message
   */
  async handleChatMessage(message, context = {}) {
    try {
      // Add user message to history
      this.conversationHistory.push({
        role: 'user',
        content: message,
      });

      // Search documentation for relevant context
      let documentation = '';
      if (this.vectorStore.isAvailable()) {
        const docs = await this.vectorStore.search(message);
        documentation = this.vectorStore.formatForContext(docs);
      }

      // Get AI response
      const response = await this.llm.chatAboutInk(
        this.conversationHistory,
        documentation
      );

      // Add assistant response to history
      this.conversationHistory.push({
        role: 'assistant',
        content: response,
      });

      return { success: true, response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate ink code
   */
  async generateCode(prompt, context = '') {
    try {
      const code = await this.llm.generateInkCode(prompt, context);
      return { success: true, code };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Fix errors with AI
   */
  async fixErrors(code, errors) {
    try {
      // Get relevant documentation
      let documentation = '';
      if (this.vectorStore.isAvailable()) {
        const errorSummary = errors.map(e => e.message).join(' ');
        const docs = await this.vectorStore.search(errorSummary);
        documentation = this.vectorStore.formatForContext(docs);
      }

      const result = await this.llm.fixErrors(code, errors, documentation);
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Explain code or concept
   */
  async explainCode(query, code = '') {
    try {
      // Get relevant documentation
      let documentation = '';
      if (this.vectorStore.isAvailable()) {
        const docs = await this.vectorStore.search(query);
        documentation = this.vectorStore.formatForContext(docs);
      }

      const explanation = await this.llm.explain(query, code, documentation);
      return { success: true, explanation };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Search documentation
   */
  async searchDocs(query) {
    try {
      if (!this.vectorStore.isAvailable()) {
        return { success: false, error: 'Vector store not configured' };
      }

      const results = await this.vectorStore.search(query);
      return { success: true, results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Send message to renderer
   */
  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

// Create and initialize app
const assistant = new InkAIAssistant();

app.on('ready', () => assistant.init());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    assistant.createWindow();
  }
});

// Cleanup on quit
app.on('before-quit', async () => {
  await assistant.fileWatcher.stop();
});
