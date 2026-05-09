/**
 * Chat Interface - Renderer Process
 * Handles UI interactions and communication with main process
 */

// DOM Elements
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const openFileBtn = document.getElementById('openFileBtn');
const currentFileEl = document.getElementById('current-file');
const compilationStatusEl = document.getElementById('compilation-status');
const errorsListEl = document.getElementById('errors-list');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');

// State
let currentFile = null;
let currentErrors = [];
let isProcessing = false;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await checkConfig();
});

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Send message
  sendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = chatInput.scrollHeight + 'px';
  });

  // Open file
  openFileBtn.addEventListener('click', openFile);

  // Quick actions
  document.querySelectorAll('.quick-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      handleQuickAction(action);
    });
  });

  // Listen for events from main process
  window.electronAPI.onFileChanged((data) => {
    updateStatus(`File ${data.event}: ${data.filepath}`);
  });

  window.electronAPI.onCompileResult((data) => {
    handleCompilationResult(data);
  });

  window.electronAPI.onAIResponse((data) => {
    if (data.auto) {
      addMessage(data.message, 'assistant');
    }
  });
}

/**
 * Check configuration and display status
 */
async function checkConfig() {
  const config = await window.electronAPI.getConfig();

  if (!config.inklecateAvailable) {
    addMessage('⚠️ Warning: inklecate compiler not found. Please install Inky or set INKLECATE_PATH.', 'error');
  }

  if (!config.vectorStoreAvailable) {
    addMessage('ℹ️ Note: Vector storage not configured. Documentation search will be limited. Set SUPABASE_URL and SUPABASE_ANON_KEY for full RAG features.', 'assistant');
  }
}

/**
 * Open file dialog
 */
async function openFile() {
  const result = await window.electronAPI.openFile();

  if (!result) return;

  if (result.type === 'file') {
    currentFile = result.path;
    updateCurrentFile(result.path);
    addMessage(`📄 Opened file: ${result.path.split('/').pop()}`, 'assistant');
  } else if (result.type === 'directory') {
    addMessage(`📁 Watching directory: ${result.path}`, 'assistant');
  }
}

/**
 * Send chat message
 */
async function sendMessage() {
  const message = chatInput.value.trim();
  if (!message || isProcessing) return;

  // Add user message
  addMessage(message, 'user');
  chatInput.value = '';
  chatInput.style.height = 'auto';

  // Show loading
  isProcessing = true;
  const loadingId = showLoading();
  setStatus('processing');

  try {
    const response = await window.electronAPI.sendMessage(message, {
      currentFile,
      errors: currentErrors,
    });

    if (response.success) {
      addMessage(response.response, 'assistant');
    } else {
      addMessage(`Error: ${response.error}`, 'error');
    }
  } catch (error) {
    addMessage(`Error: ${error.message}`, 'error');
  } finally {
    removeLoading(loadingId);
    isProcessing = false;
    setStatus('ready');
  }
}

/**
 * Handle quick actions
 */
async function handleQuickAction(action) {
  if (isProcessing) return;

  switch (action) {
    case 'fix':
      if (currentErrors.length === 0) {
        addMessage('No errors to fix!', 'assistant');
        return;
      }
      await fixErrors();
      break;

    case 'explain':
      chatInput.value = 'Explain this: ';
      chatInput.focus();
      break;

    case 'generate':
      chatInput.value = 'Generate ink code for: ';
      chatInput.focus();
      break;
  }
}

/**
 * Fix errors with AI
 */
async function fixErrors() {
  if (!currentFile) {
    addMessage('No file opened!', 'error');
    return;
  }

  isProcessing = true;
  const loadingId = showLoading();
  setStatus('fixing');

  try {
    // Read current file content (simplified - in real app would read from editor)
    const fs = require('fs');
    const code = fs.readFileSync(currentFile, 'utf8');

    const response = await window.electronAPI.fixError(code, currentErrors);

    if (response.success) {
      addMessage('🔧 **Suggested Fixes:**\n\n' + response.explanation, 'assistant');
    } else {
      addMessage(`Error: ${response.error}`, 'error');
    }
  } catch (error) {
    addMessage(`Error: ${error.message}`, 'error');
  } finally {
    removeLoading(loadingId);
    isProcessing = false;
    setStatus('ready');
  }
}

/**
 * Handle compilation result
 */
function handleCompilationResult(data) {
  const { filepath, result } = data;

  // Update compilation status
  if (result.success) {
    compilationStatusEl.innerHTML = `
      <div style="color: var(--accent-green);">
        ✓ Compiled successfully
        <div style="font-size: 0.75rem; margin-top: 0.25rem; color: var(--text-secondary);">
          ${result.duration}ms
        </div>
      </div>
    `;
    currentErrors = [];
    errorsListEl.innerHTML = '<p class="no-errors">No errors ✓</p>';
  } else {
    compilationStatusEl.innerHTML = `
      <div style="color: var(--accent-red);">
        ✗ ${result.errors.length} error(s)
        <div style="font-size: 0.75rem; margin-top: 0.25rem; color: var(--text-secondary);">
          ${result.duration}ms
        </div>
      </div>
    `;
    currentErrors = result.errors;
    displayErrors(result.errors);
  }
}

/**
 * Display errors in sidebar
 */
function displayErrors(errors) {
  if (errors.length === 0) {
    errorsListEl.innerHTML = '<p class="no-errors">No errors ✓</p>';
    return;
  }

  errorsListEl.innerHTML = errors.map(error => `
    <div class="error-item ${error.type.toLowerCase()}">
      <div class="error-header">
        ${getErrorIcon(error.type)}
        ${error.type}
      </div>
      <div class="error-line">Line ${error.line}</div>
      <div class="error-message">${escapeHtml(error.message)}</div>
    </div>
  `).join('');
}

/**
 * Get error icon
 */
function getErrorIcon(type) {
  const icons = {
    ERROR: '🔴',
    WARNING: '⚠️',
    TODO: '📝',
    AUTHOR: '✍️',
  };
  return icons[type] || '•';
}

/**
 * Update current file display
 */
function updateCurrentFile(filepath) {
  const filename = filepath.split('/').pop();
  currentFileEl.innerHTML = `
    <div style="font-weight: 600;">${escapeHtml(filename)}</div>
    <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">
      ${escapeHtml(filepath)}
    </div>
  `;
}

/**
 * Add message to chat
 */
function addMessage(content, type = 'assistant') {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  // Simple markdown-like formatting
  const formatted = formatMessage(content);
  contentDiv.innerHTML = formatted;

  messageDiv.appendChild(contentDiv);
  chatMessages.appendChild(messageDiv);

  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Format message with basic markdown
 */
function formatMessage(text) {
  // Code blocks
  text = text.replace(/```(\w+)?\n([\s\S]*?)\n```/g, (match, lang, code) => {
    return `<pre><code>${escapeHtml(code)}</code></pre>`;
  });

  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Links (simple)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Paragraphs
  text = text.split('\n\n').map(p => {
    if (p.startsWith('<pre>') || p.startsWith('<ul>') || p.startsWith('<ol>')) {
      return p;
    }
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  return text;
}

/**
 * Show loading indicator
 */
function showLoading() {
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'message assistant';
  loadingDiv.id = `loading-${Date.now()}`;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.innerHTML = `
    <div class="loading">
      <div class="loading-dot"></div>
      <div class="loading-dot"></div>
      <div class="loading-dot"></div>
    </div>
  `;

  loadingDiv.appendChild(contentDiv);
  chatMessages.appendChild(loadingDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  return loadingDiv.id;
}

/**
 * Remove loading indicator
 */
function removeLoading(id) {
  const loadingEl = document.getElementById(id);
  if (loadingEl) {
    loadingEl.remove();
  }
}

/**
 * Update status indicator
 */
function updateStatus(message) {
  statusText.textContent = message;
}

/**
 * Set status indicator
 */
function setStatus(status) {
  const statusMap = {
    ready: { color: 'var(--accent-green)', text: 'Ready' },
    processing: { color: 'var(--accent-blue)', text: 'Processing...' },
    fixing: { color: 'var(--accent-yellow)', text: 'Fixing errors...' },
    error: { color: 'var(--accent-red)', text: 'Error' },
  };

  const config = statusMap[status] || statusMap.ready;
  statusIndicator.style.background = config.color;
  statusText.textContent = config.text;
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}
