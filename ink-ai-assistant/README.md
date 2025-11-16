# Ink AI Assistant

AI-powered companion app for Ink script development with local LLM support.

## What is this?

This is a **separate Electron app** that works alongside [Inky](https://github.com/inkle/inky) (the official Ink editor) to provide:

- ✨ **AI-assisted code generation** - Generate ink scripts using natural language
- 🔍 **Error detection & fixing** - Automatic error detection with AI-powered fixes
- 💬 **Interactive chat interface** - Ask questions about ink syntax and get help
- 📚 **Documentation search** - RAG-powered search through ink documentation
- 🔄 **Live file watching** - Monitors your .ink files for errors as you work

## Architecture

```
┌─────────────────────┐         ┌──────────────────────┐
│   INKY               │         │  INK AI ASSISTANT    │
│   (editor)           │         │  (this app)          │
│                      │         │                      │
│   - Edit .ink files  │         │  - Watch same files  │
│   - Syntax highlight │◄────────┤  - Chat interface    │
│   - Live preview     │  same   │  - AI suggestions    │
│                      │  files  │  - Error fixes       │
└──────┬───────────────┘         └──────┬───────────────┘
       │                                │
       │                                │
       └────────┬───────────────────────┘
                │
                ▼
         your-story.ink
```

## Prerequisites

### 1. Inky Installation
You need Inky installed to use its `inklecate` compiler. The app will auto-detect it from:
- `/home/user/inky_digi/` (if installed as sibling directory)
- `~/inky_digi/` or `~/Inky/` (common locations)
- Custom path via `INKLECATE_PATH` environment variable

### 2. Local LLM (OpenAI-compatible API)
Install one of these local LLM servers:

**Ollama (Recommended):**
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull llama3.1
# or
ollama pull codellama
```

**Alternatives:**
- [LM Studio](https://lmstudio.ai/)
- [LocalAI](https://localai.io/)
- [Text Generation WebUI](https://github.com/oobabooga/text-generation-webui)

### 3. Supabase (for vector storage)
Create a free Supabase project at [supabase.com](https://supabase.com) for documentation search.

## Installation

```bash
# Navigate to this directory
cd /home/user/ink-ai-assistant

# Install dependencies
npm install

# Set up environment variables (create .env file)
cp .env.example .env
# Edit .env with your settings
```

## Configuration

Create a `.env` file:

```env
# Local LLM settings (Ollama)
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama3.1
LLM_API_KEY=ollama

# Supabase settings
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here

# Optional: Custom inklecate path
INKLECATE_PATH=/path/to/inklecate
```

## Usage

### Running the App

```bash
# Development mode
npm start

# Or
npm run dev
```

### Ingesting Documentation

Before first use, ingest the ink documentation into your vector database:

```bash
npm run ingest-docs
```

This will:
1. Read the Ink documentation from Inky's bundled files
2. Split it into chunks
3. Generate embeddings
4. Store in Supabase vector storage

### Workflow

1. **Open Inky** - Edit your .ink files as usual
2. **Open Ink AI Assistant** - This companion app in a separate window
3. **Work normally** - The assistant watches your files
4. **Get help** - Ask questions, fix errors, generate code via chat

## Features

### 1. Error Detection & Fixing
```
You save story.ink with an error
  ↓
AI Assistant detects compilation error
  ↓
Suggests fix based on documentation
  ↓
You apply fix with one click
```

### 2. AI Code Generation
```
Chat: "Create a choice with three options about going to the park"
  ↓
AI generates proper ink syntax
  ↓
You copy/paste into Inky
```

### 3. Documentation Search
```
Chat: "How do I use sticky choices?"
  ↓
RAG retrieves relevant docs
  ↓
AI explains with examples
```

## Project Structure

```
ink-ai-assistant/
├── src/
│   ├── main/               # Electron main process
│   │   ├── main.js         # App entry point
│   │   ├── compiler.js     # Inklecate integration
│   │   ├── errorParser.js  # Parse compiler errors
│   │   ├── llmClient.js    # Local LLM client
│   │   ├── vectorStore.js  # Supabase integration
│   │   └── fileWatcher.js  # Watch .ink files
│   ├── renderer/           # UI (frontend)
│   │   ├── index.html      # Main window
│   │   ├── chat.js         # Chat interface
│   │   └── styles.css      # Styling
│   └── shared/             # Shared code
│       ├── config.js       # Configuration
│       └── types.js        # Type definitions
├── resources/              # App assets
├── package.json
└── README.md
```

## Technology Stack

- **Electron 30.0.4** - Desktop app framework (matches Inky)
- **OpenAI SDK** - Works with local LLMs via OpenAI-compatible API
- **Supabase** - Vector storage for RAG
- **Chokidar** - File watching
- **Marked** - Markdown parsing

## Development

### Building

```bash
# Build for current platform
npm run build

# Platform-specific builds
npm run build:mac
npm run build:win
npm run build:linux
```

### Adding Features

The app is modular - each feature lives in its own module:
- Add LLM providers → `src/main/llmClient.js`
- Modify error parsing → `src/main/errorParser.js`
- Customize UI → `src/renderer/`

## Troubleshooting

### Can't find inklecate
```bash
# Set custom path
export INKLECATE_PATH=/path/to/inklecate_binary
```

### Local LLM not responding
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Start Ollama
ollama serve
```

### Supabase connection issues
- Check your `.env` file has correct credentials
- Ensure Supabase project has pgvector extension enabled
- Run `npm run ingest-docs` to populate the database

## License

MIT

## Credits

- Built for [Ink](https://www.inklestudios.com/ink/) by inkle
- Companion to [Inky](https://github.com/inkle/inky) editor
- Uses local LLMs for privacy and offline operation
