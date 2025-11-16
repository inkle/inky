/**
 * File Watcher
 * Monitors .ink files for changes and triggers compilation
 */

const chokidar = require('chokidar');
const path = require('path');
const config = require('../shared/config');
const InkCompiler = require('./compiler');
const ErrorParser = require('./errorParser');

class FileWatcher {
  constructor() {
    this.watcher = null;
    this.watchedPaths = new Set();
    this.compiler = new InkCompiler();
    this.errorParser = new ErrorParser();
    this.callbacks = {
      onFileChange: null,
      onError: null,
      onCompilationComplete: null,
    };
  }

  /**
   * Start watching a directory or file
   * @param {string|Array<string>} paths - Paths to watch
   * @param {Object} callbacks - Event callbacks
   */
  watch(paths, callbacks = {}) {
    this.callbacks = { ...this.callbacks, ...callbacks };

    const pathsArray = Array.isArray(paths) ? paths : [paths];

    // Add .ink pattern to watch
    const inkPaths = pathsArray.map(p => {
      // If directory, watch all .ink files
      if (!p.endsWith('.ink')) {
        return path.join(p, '**/*.ink');
      }
      return p;
    });

    this.watcher = chokidar.watch(inkPaths, {
      ...config.fileWatcher,
      ignoreInitial: false, // Compile on start
    });

    // Set up event handlers
    this.watcher
      .on('add', (filepath) => this.handleFileEvent('add', filepath))
      .on('change', (filepath) => this.handleFileEvent('change', filepath))
      .on('unlink', (filepath) => this.handleFileEvent('unlink', filepath))
      .on('error', (error) => this.handleError(error));

    inkPaths.forEach(p => this.watchedPaths.add(p));

    console.log('Watching ink files:', inkPaths);
  }

  /**
   * Handle file system events
   * @param {string} event - Event type
   * @param {string} filepath - File path
   */
  async handleFileEvent(event, filepath) {
    console.log(`File ${event}:`, filepath);

    // Notify about file change
    if (this.callbacks.onFileChange) {
      this.callbacks.onFileChange(event, filepath);
    }

    // Compile on add or change
    if (event === 'add' || event === 'change') {
      await this.compileFile(filepath);
    }
  }

  /**
   * Compile an ink file and report results
   * @param {string} filepath - Path to ink file
   */
  async compileFile(filepath) {
    try {
      console.log('Compiling:', filepath);

      const result = await this.compiler.validate(filepath);

      // Enhance errors with context
      if (result.errors.length > 0) {
        result.errors = this.errorParser.enhanceErrors(result.errors);
      }

      // Notify about compilation result
      if (this.callbacks.onCompilationComplete) {
        this.callbacks.onCompilationComplete(filepath, result);
      }

      if (result.success) {
        console.log(`✓ ${filepath} compiled successfully`);
      } else {
        console.log(`✗ ${filepath} has ${result.errors.length} error(s)`);
      }

      return result;
    } catch (error) {
      console.error('Compilation error:', error);
      this.handleError(error);
      return null;
    }
  }

  /**
   * Handle errors
   * @param {Error} error - Error object
   */
  handleError(error) {
    console.error('File watcher error:', error);
    if (this.callbacks.onError) {
      this.callbacks.onError(error);
    }
  }

  /**
   * Stop watching
   */
  async stop() {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      this.watchedPaths.clear();
      console.log('File watcher stopped');
    }
  }

  /**
   * Get watched paths
   * @returns {Array<string>} Watched paths
   */
  getWatchedPaths() {
    return Array.from(this.watchedPaths);
  }

  /**
   * Add path to watch list
   * @param {string} filepath - Path to add
   */
  addPath(filepath) {
    if (this.watcher) {
      this.watcher.add(filepath);
      this.watchedPaths.add(filepath);
    }
  }

  /**
   * Remove path from watch list
   * @param {string} filepath - Path to remove
   */
  removePath(filepath) {
    if (this.watcher) {
      this.watcher.unwatch(filepath);
      this.watchedPaths.delete(filepath);
    }
  }

  /**
   * Check if watching any files
   * @returns {boolean}
   */
  isWatching() {
    return this.watcher !== null && this.watchedPaths.size > 0;
  }
}

module.exports = FileWatcher;
