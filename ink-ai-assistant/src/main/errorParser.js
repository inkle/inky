/**
 * Error Parser
 * Enhances compiler errors with source code context
 */

const fs = require('fs');
const path = require('path');

class ErrorParser {
  /**
   * Enhance errors with source code context
   * @param {Array<InkError>} errors - Raw errors from compiler
   * @param {number} contextLines - Lines of context before/after error
   * @returns {Array<InkError>} Enhanced errors with context
   */
  enhanceErrors(errors, contextLines = 3) {
    return errors.map(error => this.enhanceError(error, contextLines));
  }

  /**
   * Enhance single error with context
   * @param {InkError} error - Raw error
   * @param {number} contextLines - Lines of context
   * @returns {InkError} Enhanced error
   */
  enhanceError(error, contextLines = 3) {
    try {
      // Read source file
      const source = fs.readFileSync(error.filename, 'utf8');
      const lines = source.split('\n');

      // Calculate context range
      const errorLine = error.line - 1; // Convert to 0-indexed
      const startLine = Math.max(0, errorLine - contextLines);
      const endLine = Math.min(lines.length - 1, errorLine + contextLines);

      // Extract context
      const contextLines_arr = [];
      for (let i = startLine; i <= endLine; i++) {
        contextLines_arr.push({
          lineNum: i + 1,
          content: lines[i],
          isError: i === errorLine,
        });
      }

      // Add context to error
      return {
        ...error,
        context: {
          lines: contextLines_arr,
          errorLine: lines[errorLine],
          startLine: startLine + 1,
          endLine: endLine + 1,
        },
      };
    } catch (e) {
      // If we can't read the file, return error as-is
      return error;
    }
  }

  /**
   * Group errors by file
   * @param {Array<InkError>} errors - Errors to group
   * @returns {Object} Errors grouped by filename
   */
  groupByFile(errors) {
    const grouped = {};

    for (const error of errors) {
      const filename = error.filename;
      if (!grouped[filename]) {
        grouped[filename] = [];
      }
      grouped[filename].push(error);
    }

    return grouped;
  }

  /**
   * Group errors by type
   * @param {Array<InkError>} errors - Errors to group
   * @returns {Object} Errors grouped by type (ERROR, WARNING, etc.)
   */
  groupByType(errors) {
    const grouped = {
      ERROR: [],
      WARNING: [],
      TODO: [],
      AUTHOR: [],
    };

    for (const error of errors) {
      const type = error.type.toUpperCase();
      if (grouped[type]) {
        grouped[type].push(error);
      }
    }

    return grouped;
  }

  /**
   * Format error for display
   * @param {InkError} error - Error to format
   * @returns {string} Formatted error message
   */
  formatError(error) {
    const icon = this.getErrorIcon(error.type);
    let output = `${icon} ${error.type}: ${error.message}\n`;
    output += `   at ${error.filename}:${error.line}\n`;

    if (error.context) {
      output += '\n';
      for (const line of error.context.lines) {
        const marker = line.isError ? '→' : ' ';
        output += `   ${marker} ${String(line.lineNum).padStart(4)}: ${line.content}\n`;
      }
    }

    return output;
  }

  /**
   * Get icon for error type
   * @param {string} type - Error type
   * @returns {string} Icon
   */
  getErrorIcon(type) {
    const icons = {
      ERROR: '🔴',
      WARNING: '⚠️',
      TODO: '📝',
      AUTHOR: '✍️',
    };
    return icons[type.toUpperCase()] || '•';
  }

  /**
   * Generate AI-friendly error summary
   * @param {Array<InkError>} errors - Errors to summarize
   * @returns {string} Summary for LLM context
   */
  summarizeForAI(errors) {
    if (errors.length === 0) {
      return 'No errors found. The ink file compiled successfully.';
    }

    let summary = `Found ${errors.length} issue(s) in the ink file:\n\n`;

    const byType = this.groupByType(errors);

    if (byType.ERROR.length > 0) {
      summary += `ERRORS (${byType.ERROR.length}):\n`;
      for (const error of byType.ERROR) {
        summary += `- Line ${error.line}: ${error.message}\n`;
        if (error.context) {
          summary += `  Code: ${error.context.errorLine}\n`;
        }
      }
      summary += '\n';
    }

    if (byType.WARNING.length > 0) {
      summary += `WARNINGS (${byType.WARNING.length}):\n`;
      for (const error of byType.WARNING) {
        summary += `- Line ${error.line}: ${error.message}\n`;
      }
      summary += '\n';
    }

    return summary.trim();
  }

  /**
   * Suggest common fixes based on error message
   * @param {InkError} error - Error to analyze
   * @returns {Array<string>} Suggested fixes
   */
  suggestQuickFixes(error) {
    const suggestions = [];
    const msg = error.message.toLowerCase();

    // Common patterns
    if (msg.includes('unexpected token') || msg.includes('expected')) {
      suggestions.push('Check for missing or extra punctuation');
      suggestions.push('Verify syntax matches ink documentation');
    }

    if (msg.includes('divert') || msg.includes('->')) {
      suggestions.push('Ensure knot/stitch names are defined');
      suggestions.push('Check divert target spelling');
    }

    if (msg.includes('choice') || msg.includes('*') || msg.includes('+')) {
      suggestions.push('Choices must start with * or +');
      suggestions.push('Ensure proper indentation for nested choices');
    }

    if (msg.includes('variable')) {
      suggestions.push('Declare variables with VAR before use');
      suggestions.push('Check variable name spelling');
    }

    if (msg.includes('knot') || msg.includes('stitch')) {
      suggestions.push('Knot names must start with ==');
      suggestions.push('Stitch names must start with =');
    }

    return suggestions;
  }
}

module.exports = ErrorParser;
