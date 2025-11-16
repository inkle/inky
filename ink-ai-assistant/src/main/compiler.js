/**
 * Inklecate Compiler Integration
 * Wraps inklecate binary to compile .ink files and capture errors
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../shared/config');

class InkCompiler {
  constructor() {
    this.inklecatePath = config.inklecate.binary;
    this.timeout = config.inklecate.timeout;
  }

  /**
   * Compile an ink file
   * @param {string} inkFilePath - Path to .ink file
   * @param {Object} options - Compilation options
   * @returns {Promise<CompilationResult>}
   */
  async compile(inkFilePath, options = {}) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      // Validate file exists
      if (!fs.existsSync(inkFilePath)) {
        return reject(new Error(`File not found: ${inkFilePath}`));
      }

      // Prepare output path (JSON file)
      const outputPath = options.outputPath || inkFilePath.replace(/\.ink$/, '.json');

      // Build inklecate arguments
      const args = [
        '-o', outputPath,  // Output JSON file
        inkFilePath,       // Input ink file
      ];

      if (options.countAllVisits) {
        args.push('-c');
      }

      // Spawn inklecate process
      const process = spawn(this.inklecatePath, args);

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Timeout handler
      const timeoutId = setTimeout(() => {
        process.kill();
        reject(new Error(`Compilation timeout after ${this.timeout}ms`));
      }, this.timeout);

      process.on('close', (code) => {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        // Parse output
        const result = {
          success: code === 0,
          errors: this.parseOutput(stdout + stderr, inkFilePath),
          duration,
          exitCode: code,
        };

        // If successful, read the JSON output
        if (result.success && fs.existsSync(outputPath)) {
          try {
            result.output = fs.readFileSync(outputPath, 'utf8');
          } catch (e) {
            // JSON read failed, but compilation succeeded
          }
        }

        resolve(result);
      });

      process.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to spawn inklecate: ${err.message}`));
      });
    });
  }

  /**
   * Quick validation without generating JSON
   * @param {string} inkFilePath - Path to .ink file
   * @returns {Promise<CompilationResult>}
   */
  async validate(inkFilePath) {
    // Use /dev/null or NUL as output to avoid writing files
    const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
    return this.compile(inkFilePath, { outputPath: nullDevice });
  }

  /**
   * Parse inklecate output into structured errors
   * @param {string} output - Raw compiler output
   * @param {string} baseFile - Base file path for relative paths
   * @returns {Array<InkError>}
   */
  parseOutput(output, baseFile) {
    const errors = [];
    const lines = output.split('\n');

    // Pattern: ERROR: filename.ink line X: message
    // Pattern: WARNING: filename.ink line X: message
    // Pattern: TODO: filename.ink line X: message
    const errorPattern = /^(ERROR|WARNING|TODO|AUTHOR):\s+([^:]+):?\s+line\s+(\d+):\s*(.+)$/i;

    for (const line of lines) {
      const match = line.match(errorPattern);
      if (match) {
        const [, type, filename, lineNum, message] = match;

        errors.push({
          type: type.toUpperCase(),
          message: message.trim(),
          filename: filename.trim(),
          line: parseInt(lineNum, 10),
          column: 0, // inklecate doesn't provide column info
          raw: line,
        });
      }
    }

    return errors;
  }

  /**
   * Check if inklecate is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      const result = await new Promise((resolve) => {
        const process = spawn(this.inklecatePath, ['--version']);
        let found = false;

        process.on('close', (code) => {
          resolve(code === 0 || found);
        });

        process.stdout.on('data', () => {
          found = true;
        });

        process.on('error', () => {
          resolve(false);
        });

        setTimeout(() => {
          process.kill();
          resolve(false);
        }, 2000);
      });

      return result;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get inklecate version
   * @returns {Promise<string>}
   */
  async getVersion() {
    return new Promise((resolve) => {
      const process = spawn(this.inklecatePath, ['--version']);
      let version = 'unknown';

      process.stdout.on('data', (data) => {
        version = data.toString().trim();
      });

      process.on('close', () => {
        resolve(version);
      });

      process.on('error', () => {
        resolve('unknown');
      });

      setTimeout(() => {
        process.kill();
        resolve('unknown');
      }, 2000);
    });
  }
}

module.exports = InkCompiler;
