/**
 * Local LLM Client
 * Works with OpenAI-compatible APIs (Ollama, LM Studio, LocalAI, etc.)
 */

const OpenAI = require('openai');
const config = require('../shared/config');

class LLMClient {
  constructor() {
    this.client = new OpenAI({
      baseURL: config.llm.baseURL,
      apiKey: config.llm.apiKey,
    });
    this.model = config.llm.model;
    this.temperature = config.llm.temperature;
    this.maxTokens = config.llm.maxTokens;
  }

  /**
   * Send a chat completion request
   * @param {Array<ChatMessage>} messages - Conversation history
   * @param {Object} options - Override options
   * @returns {Promise<string>} AI response
   */
  async chat(messages, options = {}) {
    try {
      const response = await this.client.chat.completions.create({
        model: options.model || this.model,
        messages: messages,
        temperature: options.temperature ?? this.temperature,
        max_tokens: options.maxTokens || this.maxTokens,
        stream: false,
      });

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      throw new Error(`LLM request failed: ${error.message}`);
    }
  }

  /**
   * Stream chat completion
   * @param {Array<ChatMessage>} messages - Conversation history
   * @param {Function} onChunk - Callback for each chunk
   * @param {Object} options - Override options
   * @returns {Promise<string>} Complete response
   */
  async chatStream(messages, onChunk, options = {}) {
    try {
      const stream = await this.client.chat.completions.create({
        model: options.model || this.model,
        messages: messages,
        temperature: options.temperature ?? this.temperature,
        max_tokens: options.maxTokens || this.maxTokens,
        stream: true,
      });

      let fullResponse = '';

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          onChunk(content);
        }
      }

      return fullResponse;
    } catch (error) {
      throw new Error(`LLM stream failed: ${error.message}`);
    }
  }

  /**
   * Generate ink code based on prompt
   * @param {string} prompt - User request
   * @param {string} context - Existing code context
   * @returns {Promise<string>} Generated ink code
   */
  async generateInkCode(prompt, context = '') {
    const systemPrompt = `You are an expert in the ink scripting language for interactive fiction.
Generate clean, syntactically correct ink code based on user requests.

Key ink syntax rules:
- Knots start with ==
- Stitches start with =
- Choices use * (once-only) or + (sticky)
- Diverts use ->
- Variables declared with VAR
- Logic uses curly braces {}
- Comments use //

Always generate valid, well-formatted ink code.`;

    const messages = [
      { role: 'system', content: systemPrompt },
    ];

    if (context) {
      messages.push({
        role: 'user',
        content: `Here's the existing code for context:\n\`\`\`ink\n${context}\n\`\`\``,
      });
    }

    messages.push({
      role: 'user',
      content: `Generate ink code for: ${prompt}\n\nProvide only the ink code, no explanations.`,
    });

    return await this.chat(messages, { temperature: 0.3 });
  }

  /**
   * Fix ink errors using AI
   * @param {string} code - Current ink code
   * @param {Array<InkError>} errors - Compilation errors
   * @param {string} documentation - Relevant docs from RAG
   * @returns {Promise<Object>} { fixedCode, explanation }
   */
  async fixErrors(code, errors, documentation = '') {
    const systemPrompt = `You are an expert in the ink scripting language.
Fix compilation errors in ink code based on the error messages and documentation provided.
Provide both the fixed code and a brief explanation of the changes.`;

    const errorSummary = errors.map((e, i) =>
      `${i + 1}. Line ${e.line}: ${e.message}`
    ).join('\n');

    let userPrompt = `Fix the following ink code errors:\n\n${errorSummary}\n\nCurrent code:\n\`\`\`ink\n${code}\n\`\`\``;

    if (documentation) {
      userPrompt += `\n\nRelevant documentation:\n${documentation}`;
    }

    userPrompt += `\n\nProvide:
1. The fixed code (in a code block)
2. A brief explanation of what was wrong and how you fixed it`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await this.chat(messages);

    // Parse response to extract code and explanation
    const codeMatch = response.match(/```(?:ink)?\n([\s\S]*?)\n```/);
    const fixedCode = codeMatch ? codeMatch[1] : response;

    return {
      fixedCode,
      explanation: response,
    };
  }

  /**
   * Explain ink code or concepts
   * @param {string} query - What to explain
   * @param {string} code - Code context (optional)
   * @param {string} documentation - Relevant docs from RAG
   * @returns {Promise<string>} Explanation
   */
  async explain(query, code = '', documentation = '') {
    const systemPrompt = `You are an expert in the ink scripting language.
Provide clear, helpful explanations about ink syntax, features, and best practices.
Use examples when helpful.`;

    let userPrompt = query;

    if (code) {
      userPrompt += `\n\nCode:\n\`\`\`ink\n${code}\n\`\`\``;
    }

    if (documentation) {
      userPrompt += `\n\nRelevant documentation:\n${documentation}`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    return await this.chat(messages);
  }

  /**
   * General chat about ink
   * @param {Array<ChatMessage>} conversationHistory - Full conversation
   * @param {string} documentation - Relevant docs from RAG
   * @returns {Promise<string>} Response
   */
  async chatAboutInk(conversationHistory, documentation = '') {
    const systemPrompt = `You are an expert assistant for the ink scripting language.
Help users write better ink stories by answering questions, generating code, and fixing errors.
Be concise but thorough. Use examples when helpful.

${documentation ? `\nRelevant documentation:\n${documentation}` : ''}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
    ];

    return await this.chat(messages);
  }

  /**
   * Check if LLM is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      await this.chat([
        { role: 'user', content: 'Hi' }
      ], { maxTokens: 10 });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get model info
   * @returns {Object} Model configuration
   */
  getConfig() {
    return {
      baseURL: config.llm.baseURL,
      model: this.model,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
    };
  }
}

module.exports = LLMClient;
