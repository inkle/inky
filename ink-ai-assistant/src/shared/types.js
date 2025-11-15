/**
 * Shared types and constants for Ink AI Assistant
 */

// IPC channels for main <-> renderer communication
const IPC_CHANNELS = {
  // File operations
  OPEN_FILE: 'open-file',
  FILE_OPENED: 'file-opened',
  FILE_CHANGED: 'file-changed',
  SAVE_FILE: 'save-file',

  // Compilation
  COMPILE: 'compile',
  COMPILE_RESULT: 'compile-result',
  COMPILE_ERROR: 'compile-error',

  // AI operations
  SEND_MESSAGE: 'send-message',
  AI_RESPONSE: 'ai-response',
  AI_ERROR: 'ai-error',
  AI_STREAMING: 'ai-streaming',

  // Code generation
  GENERATE_CODE: 'generate-code',
  FIX_ERROR: 'fix-error',
  EXPLAIN_CODE: 'explain-code',

  // Configuration
  GET_CONFIG: 'get-config',
  SET_CONFIG: 'set-config',
  CONFIG_UPDATED: 'config-updated',

  // Documentation search
  SEARCH_DOCS: 'search-docs',
  DOCS_RESULT: 'docs-result',
};

// Error types from inklecate
const ERROR_TYPES = {
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  TODO: 'TODO',
  AUTHOR: 'AUTHOR',
};

// Message roles for chat
const MESSAGE_ROLES = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
};

// AI operation types
const AI_OPERATIONS = {
  CHAT: 'chat',
  GENERATE: 'generate',
  FIX: 'fix',
  EXPLAIN: 'explain',
  REFACTOR: 'refactor',
};

/**
 * @typedef {Object} InkError
 * @property {string} type - ERROR, WARNING, TODO, or AUTHOR
 * @property {string} message - Error message
 * @property {string} filename - File where error occurred
 * @property {number} line - Line number (1-indexed)
 * @property {number} column - Column number (1-indexed)
 * @property {string} context - Surrounding code context
 */

/**
 * @typedef {Object} CompilationResult
 * @property {boolean} success - Whether compilation succeeded
 * @property {InkError[]} errors - Array of errors/warnings
 * @property {string} [output] - JSON output if successful
 * @property {number} duration - Compilation time in ms
 */

/**
 * @typedef {Object} ChatMessage
 * @property {string} role - user, assistant, or system
 * @property {string} content - Message content
 * @property {number} timestamp - Unix timestamp
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * @typedef {Object} DocumentChunk
 * @property {string} content - Documentation content
 * @property {Object} metadata - Metadata (section, title, etc.)
 * @property {number} similarity - Similarity score (0-1)
 */

/**
 * @typedef {Object} AIRequest
 * @property {string} operation - Type of AI operation
 * @property {string} prompt - User prompt
 * @property {string} [code] - Current code context
 * @property {InkError[]} [errors] - Errors to fix
 * @property {DocumentChunk[]} [context] - Retrieved documentation
 */

module.exports = {
  IPC_CHANNELS,
  ERROR_TYPES,
  MESSAGE_ROLES,
  AI_OPERATIONS,
};
