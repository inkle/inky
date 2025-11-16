/**
 * Configuration for Ink AI Assistant
 * Modify these values to match your setup
 */

module.exports = {
  // Local LLM configuration (OpenAI-compatible API)
  llm: {
    // Default to Ollama endpoint
    baseURL: process.env.LLM_BASE_URL || 'http://localhost:11434/v1',
    apiKey: process.env.LLM_API_KEY || 'ollama', // Ollama doesn't need real key
    model: process.env.LLM_MODEL || 'llama3.1', // or 'codellama', 'mistral', etc.
    temperature: 0.2, // Lower for more consistent code generation
    maxTokens: 4000,
  },

  // Supabase configuration for vector storage
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    tableName: 'ink_documentation',
    matchThreshold: 0.78, // Similarity threshold for vector search
    matchCount: 5, // Number of relevant docs to retrieve
  },

  // Inklecate compiler configuration
  inklecate: {
    // Auto-detect platform
    binary: getInklecatePath(),
    timeout: 10000, // 10 seconds
  },

  // File watching configuration
  fileWatcher: {
    ignored: /(^|[\/\\])\../, // Ignore dotfiles
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  },

  // UI configuration
  ui: {
    theme: 'dark',
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 400,
  },
};

/**
 * Get platform-specific inklecate binary path
 * Tries to use Inky's bundled version first
 */
function getInklecatePath() {
  const path = require('path');
  const os = require('os');
  const fs = require('fs');

  const platform = os.platform();
  let binaryName;

  if (platform === 'darwin') {
    binaryName = 'inklecate_mac';
  } else if (platform === 'win32') {
    binaryName = 'inklecate_win.exe';
  } else if (platform === 'linux') {
    binaryName = 'inklecate_linux';
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  // Try to find Inky's bundled inklecate
  const possiblePaths = [
    // Inky installed alongside (sibling directory)
    path.join(__dirname, '../../../inky_digi/app/main-process/ink', binaryName),
    // User's home directory Inky installation (common locations)
    path.join(os.homedir(), 'inky_digi/app/main-process/ink', binaryName),
    path.join(os.homedir(), 'Inky/app/main-process/ink', binaryName),
    // Custom path from environment variable
    process.env.INKLECATE_PATH,
    // User might have inklecate in PATH
    binaryName,
  ].filter(Boolean);

  for (const binPath of possiblePaths) {
    try {
      if (fs.existsSync(binPath)) {
        return binPath;
      }
    } catch (e) {
      // Continue checking
    }
  }

  // Fallback to expecting it in PATH
  return binaryName;
}
