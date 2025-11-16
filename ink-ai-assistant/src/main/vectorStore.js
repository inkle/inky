/**
 * Supabase Vector Store
 * Manages documentation embeddings for RAG
 */

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const config = require('../shared/config');

class VectorStore {
  constructor() {
    // Initialize Supabase client
    if (config.supabase.url && config.supabase.anonKey) {
      this.supabase = createClient(
        config.supabase.url,
        config.supabase.anonKey
      );
    } else {
      this.supabase = null;
      console.warn('Supabase not configured. RAG features disabled.');
    }

    // Initialize embedding client (using local LLM for embeddings)
    this.embeddingClient = new OpenAI({
      baseURL: config.llm.baseURL,
      apiKey: config.llm.apiKey,
    });

    this.tableName = config.supabase.tableName;
    this.matchThreshold = config.supabase.matchThreshold;
    this.matchCount = config.supabase.matchCount;
  }

  /**
   * Check if vector store is available
   * @returns {boolean}
   */
  isAvailable() {
    return this.supabase !== null;
  }

  /**
   * Generate embedding for text
   * @param {string} text - Text to embed
   * @returns {Promise<Array<number>>} Embedding vector
   */
  async generateEmbedding(text) {
    try {
      // Try local embedding model first (if available)
      const response = await this.embeddingClient.embeddings.create({
        model: 'nomic-embed-text', // Ollama embedding model
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      // Fallback: Use simple TF-IDF or bag-of-words (less effective)
      console.warn('Embedding generation failed, using fallback:', error.message);
      return this.generateSimpleEmbedding(text);
    }
  }

  /**
   * Simple embedding fallback (bag-of-words hash)
   * Not as good as real embeddings, but better than nothing
   * @param {string} text - Text to embed
   * @returns {Array<number>} Simple embedding
   */
  generateSimpleEmbedding(text) {
    // Create a 384-dimensional vector (common embedding size)
    const dims = 384;
    const embedding = new Array(dims).fill(0);

    // Hash words into embedding space
    const words = text.toLowerCase().match(/\w+/g) || [];
    for (const word of words) {
      const hash = this.simpleHash(word) % dims;
      embedding[hash] += 1;
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? embedding.map(val => val / magnitude) : embedding;
  }

  /**
   * Simple string hash
   * @param {string} str - String to hash
   * @returns {number} Hash value
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Search for similar documents
   * @param {string} query - Search query
   * @param {number} limit - Number of results
   * @returns {Promise<Array<DocumentChunk>>} Similar documents
   */
  async search(query, limit = null) {
    if (!this.isAvailable()) {
      return [];
    }

    try {
      // Generate embedding for query
      const queryEmbedding = await this.generateEmbedding(query);

      // Search using Supabase RPC function
      const { data, error } = await this.supabase.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: this.matchThreshold,
        match_count: limit || this.matchCount,
      });

      if (error) {
        console.error('Vector search error:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  }

  /**
   * Insert document chunk
   * @param {string} content - Document content
   * @param {Object} metadata - Document metadata
   * @returns {Promise<boolean>} Success
   */
  async insertDocument(content, metadata = {}) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const embedding = await this.generateEmbedding(content);

      const { error } = await this.supabase
        .from(this.tableName)
        .insert({
          content,
          metadata,
          embedding,
        });

      if (error) {
        console.error('Insert error:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Insert failed:', error);
      return false;
    }
  }

  /**
   * Batch insert documents
   * @param {Array<Object>} documents - Array of {content, metadata}
   * @returns {Promise<number>} Number of documents inserted
   */
  async batchInsert(documents) {
    if (!this.isAvailable()) {
      return 0;
    }

    let inserted = 0;

    for (const doc of documents) {
      const success = await this.insertDocument(doc.content, doc.metadata);
      if (success) inserted++;
    }

    return inserted;
  }

  /**
   * Clear all documents
   * @returns {Promise<boolean>} Success
   */
  async clearAll() {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const { error } = await this.supabase
        .from(this.tableName)
        .delete()
        .neq('id', 0); // Delete all

      return !error;
    } catch (error) {
      console.error('Clear failed:', error);
      return false;
    }
  }

  /**
   * Get document count
   * @returns {Promise<number>} Number of documents
   */
  async getCount() {
    if (!this.isAvailable()) {
      return 0;
    }

    try {
      const { count, error } = await this.supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true });

      return error ? 0 : count;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Format search results for LLM context
   * @param {Array<DocumentChunk>} results - Search results
   * @returns {string} Formatted documentation
   */
  formatForContext(results) {
    if (results.length === 0) {
      return '';
    }

    let context = 'Relevant ink documentation:\n\n';

    for (const doc of results) {
      const section = doc.metadata?.section || 'Documentation';
      context += `## ${section}\n${doc.content}\n\n`;
    }

    return context.trim();
  }
}

module.exports = VectorStore;
