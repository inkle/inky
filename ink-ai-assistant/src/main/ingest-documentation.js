/**
 * Documentation Ingestion Script
 * Reads ink documentation and stores it in Supabase vector database
 *
 * Usage: node src/main/ingest-documentation.js
 */

const fs = require('fs');
const path = require('path');
const VectorStore = require('./vectorStore');

class DocumentationIngester {
  constructor() {
    this.vectorStore = new VectorStore();
    this.chunkSize = 1000; // characters per chunk
    this.chunkOverlap = 200; // overlap between chunks
  }

  /**
   * Main ingestion process
   */
  async ingest() {
    console.log('🚀 Starting documentation ingestion...\n');

    if (!this.vectorStore.isAvailable()) {
      console.error('❌ Vector store not configured!');
      console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY in .env file');
      process.exit(1);
    }

    try {
      // Find documentation file
      const docPath = this.findDocumentation();
      if (!docPath) {
        console.error('❌ Documentation not found!');
        console.error('Expected: WritingWithInk.md from Inky installation');
        process.exit(1);
      }

      console.log(`📄 Found documentation: ${docPath}\n`);

      // Read documentation
      const content = fs.readFileSync(docPath, 'utf8');
      console.log(`📊 Documentation size: ${(content.length / 1024).toFixed(2)} KB\n`);

      // Split into sections
      const sections = this.splitIntoSections(content);
      console.log(`📑 Split into ${sections.length} sections\n`);

      // Clear existing documentation
      console.log('🗑️  Clearing existing documentation...');
      await this.vectorStore.clearAll();

      // Insert sections
      console.log('💾 Inserting documentation...');
      let inserted = 0;

      for (const section of sections) {
        const chunks = this.chunkText(section.content);

        for (const chunk of chunks) {
          const success = await this.vectorStore.insertDocument(chunk, {
            section: section.title,
            source: 'WritingWithInk.md',
            type: 'documentation',
          });

          if (success) {
            inserted++;
            process.stdout.write(`\r   Inserted: ${inserted} chunks`);
          }
        }
      }

      console.log(`\n\n✅ Successfully ingested ${inserted} documentation chunks!`);

      // Verify
      const count = await this.vectorStore.getCount();
      console.log(`📊 Total documents in database: ${count}\n`);

      // Test search
      console.log('🔍 Testing search...');
      const results = await this.vectorStore.search('how do I use choices?', 3);
      console.log(`   Found ${results.length} relevant results\n`);

      console.log('🎉 Ingestion complete!');

    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  }

  /**
   * Find documentation file
   */
  findDocumentation() {
    const possiblePaths = [
      // Sibling inky_digi installation
      path.join(__dirname, '../../../../inky_digi/resources/Documentation/WritingWithInk.md'),
      // User home directory
      path.join(require('os').homedir(), 'inky_digi/resources/Documentation/WritingWithInk.md'),
      path.join(require('os').homedir(), 'Inky/resources/Documentation/WritingWithInk.md'),
      // Custom path from environment
      process.env.INK_DOCS_PATH,
    ].filter(Boolean);

    for (const docPath of possiblePaths) {
      if (fs.existsSync(docPath)) {
        return docPath;
      }
    }

    return null;
  }

  /**
   * Split documentation into major sections
   */
  splitIntoSections(content) {
    const sections = [];
    const lines = content.split('\n');

    let currentSection = { title: 'Introduction', content: '' };

    for (const line of lines) {
      // Detect markdown headers (# Title)
      const headerMatch = line.match(/^#\s+(.+)$/);

      if (headerMatch) {
        // Save previous section
        if (currentSection.content.trim()) {
          sections.push(currentSection);
        }

        // Start new section
        currentSection = {
          title: headerMatch[1].trim(),
          content: '',
        };
      } else {
        currentSection.content += line + '\n';
      }
    }

    // Add last section
    if (currentSection.content.trim()) {
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * Chunk text into smaller pieces with overlap
   */
  chunkText(text) {
    const chunks = [];
    const words = text.split(/\s+/);

    let currentChunk = '';
    let currentSize = 0;

    for (const word of words) {
      if (currentSize + word.length > this.chunkSize && currentChunk) {
        chunks.push(currentChunk.trim());

        // Create overlap
        const overlapWords = currentChunk.split(/\s+/).slice(-20);
        currentChunk = overlapWords.join(' ') + ' ';
        currentSize = currentChunk.length;
      }

      currentChunk += word + ' ';
      currentSize += word.length + 1;
    }

    // Add last chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}

// Run ingestion if called directly
if (require.main === module) {
  const ingester = new DocumentationIngester();
  ingester.ingest().catch(console.error);
}

module.exports = DocumentationIngester;
