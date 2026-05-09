# Quick Start Guide

Get your Ink AI Assistant up and running in minutes!

## Prerequisites

1. **Inky Installed** - You need the Inky editor with inklecate
   - Download from: https://github.com/inkle/inky
   - Or you already have it at `/home/user/inky_digi`

2. **Node.js** - Version 16 or higher
   ```bash
   node --version  # Should be v16.0.0 or higher
   ```

3. **Local LLM** - Choose one:
   - **Ollama** (Recommended - easiest)
   - LM Studio
   - LocalAI
   - Any OpenAI-compatible API

## Step 1: Install Ollama & Pull a Model

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a code-capable model
ollama pull llama3.1

# Optional: Pull embedding model for better RAG
ollama pull nomic-embed-text

# Start Ollama (if not auto-started)
ollama serve
```

## Step 2: Install Dependencies

```bash
cd /home/user/ink-ai-assistant
npm install
```

## Step 3: Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit .env file
nano .env  # or use your preferred editor
```

**Minimum configuration** (works without Supabase):
```env
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama3.1
LLM_API_KEY=ollama
```

**Full configuration** (with RAG):
```env
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama3.1
LLM_API_KEY=ollama

# Get these from https://supabase.com (free tier available)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

## Step 4: Set Up Supabase (Optional but Recommended)

### 4a. Create Supabase Project
1. Go to https://supabase.com
2. Create free account
3. Create new project
4. Wait for setup (~2 minutes)

### 4b. Run SQL Setup
1. Go to SQL Editor in Supabase dashboard
2. Copy contents of `supabase-setup.sql`
3. Paste and run

### 4c. Get Credentials
1. Go to Settings → API
2. Copy:
   - `URL` → SUPABASE_URL
   - `anon public` key → SUPABASE_ANON_KEY
3. Add to `.env` file

### 4d. Ingest Documentation
```bash
npm run ingest-docs
```

You should see:
```
🚀 Starting documentation ingestion...
📄 Found documentation: ...
✅ Successfully ingested X documentation chunks!
```

## Step 5: Run the App!

```bash
npm start
```

The Ink AI Assistant window should open!

## Verify Setup

### Check Ollama
```bash
# In terminal:
curl http://localhost:11434/api/tags

# Should list your installed models
```

### Check Inklecate
```bash
# The app will auto-detect inklecate from Inky installation
# If it fails, set custom path:
export INKLECATE_PATH=/path/to/inklecate
```

### Test the App
1. Click "Open Ink File"
2. Select an .ink file (or create a test file)
3. Try asking: "How do I create choices in ink?"
4. The AI should respond!

## Common Issues

### "Could not find inklecate"
**Solution:**
```bash
# Set path to your inklecate binary
export INKLECATE_PATH=/home/user/inky_digi/app/main-process/ink/inklecate_linux
```

### "Could not connect to local LLM"
**Solution:**
```bash
# Make sure Ollama is running
ollama serve

# Test it:
curl http://localhost:11434/api/tags
```

### "Vector store not configured"
This is OK! The app works without Supabase, just with limited RAG features.

To enable full RAG:
1. Set up Supabase (see Step 4)
2. Add credentials to `.env`
3. Run `npm run ingest-docs`

## Usage Tips

### Quick Actions
- **🔧 Fix Errors** - Auto-fix compilation errors
- **💡 Explain** - Get explanations about ink syntax
- **✨ Generate Code** - Create ink code from descriptions

### Example Questions
```
"How do I create sticky choices?"
"Generate a branching dialogue with 3 choices"
"What's wrong with this code?" (paste ink code)
"Explain diverts and knots"
```

### Workflow
1. Open your .ink file in Inky (your normal editor)
2. Open Ink AI Assistant in a separate window
3. Edit in Inky, get help from the assistant
4. When you save, the assistant auto-detects errors
5. Ask for fixes, explanations, or generate new code

## Development Mode

```bash
# Run with DevTools open
npm run dev
```

## Building for Distribution

```bash
# Build for your platform
npm run build

# Or platform-specific:
npm run build:mac
npm run build:win
npm run build:linux
```

## Next Steps

- Read the full [README.md](README.md) for more details
- Explore the [ink documentation](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md)
- Join the ink community on Discord

## Need Help?

- Check the [README.md](README.md)
- Open an issue on GitHub
- Make sure Ollama is running and accessible

Happy writing! ✨
